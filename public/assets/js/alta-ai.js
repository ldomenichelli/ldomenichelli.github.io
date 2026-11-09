import {
  PLAYERS,
  MOVE_TYPES,
  getBoardVariant,
  getLegalMoves,
  applyMove,
  countSwitches,
  getMinimumCostPath,
  otherPlayer,
  serializeState
} from './alta-engine.js';

const WIN_SCORE = 100000;

const DIFFICULTY = Object.freeze({
  easy: Object.freeze({
    depth: 1,
    beam: 10,
    randomTop: 4
  }),
  medium: Object.freeze({
    depth: 2,
    beam: 16,
    randomTop: 2
  }),
  hard: Object.freeze({
    depth: 3,
    beam: 22,
    randomTop: 1,
    lateDepth: 4,
    lateMoveThreshold: 18
  })
});

function normalizeDifficulty(difficulty) {
  const key = String(difficulty || 'medium').trim().toLowerCase();
  return DIFFICULTY[key] ?? DIFFICULTY.medium;
}

function moveKey(move) {
  return `${move.type}:${move.cell}:${move.orientation}`;
}

function pathPotential(cost) {
  if (!Number.isFinite(cost)) return -180;
  if (cost === 0) return 900;
  if (cost === 1) return 520;
  if (cost === 2) return 260;
  if (cost === 3) return 130;
  if (cost === 4) return 70;
  return Math.max(6, 44 - cost * 4);
}

function pathStats(path, state, side) {
  if (!path.found) {
    return { empty: 0, friendly: 0, enemy: 0 };
  }

  let empty = 0;
  let friendly = 0;
  let enemy = 0;

  path.cells.forEach((cell) => {
    const piece = state.board.get(cell) ?? null;
    if (!piece) {
      empty += 1;
    } else if (piece.owner === side) {
      friendly += 1;
    } else {
      enemy += 1;
    }
  });

  return { empty, friendly, enemy };
}

function evaluateState(state, side) {
  const opponent = otherPlayer(side);

  if (state.winner === side) return WIN_SCORE - state.history.length;
  if (state.winner === opponent) return -WIN_SCORE + state.history.length;

  const myPath = getMinimumCostPath(state, side);
  const opponentPath = getMinimumCostPath(state, opponent);
  const myStats = pathStats(myPath, state, side);
  const opponentStats = pathStats(opponentPath, state, opponent);
  const myMoves = getLegalMoves(state, side).length;
  const opponentMoves = getLegalMoves(state, opponent).length;
  const mySwitches = countSwitches(state, side);
  const opponentSwitches = countSwitches(state, opponent);

  let score = 0;
  score += pathPotential(myPath.cost) - pathPotential(opponentPath.cost);
  score += (opponentStats.empty - myStats.empty) * 18;
  score += (myStats.friendly - opponentStats.friendly) * 11;
  score -= (myStats.enemy - opponentStats.enemy) * 5;
  score += (myMoves - opponentMoves) * 0.5;
  score += (mySwitches - opponentSwitches) * 0.35;

  if (myPath.cost === 1) score += 200;
  if (opponentPath.cost === 1) score -= 220;
  if (myPath.cost === 2) score += 60;
  if (opponentPath.cost === 2) score -= 70;

  return score;
}

function immediateWinningMoves(state) {
  const side = state.turn;
  return getLegalMoves(state, side).filter((move) => applyMove(state, move).winner === side);
}

function goalCellSet(variant, side) {
  return new Set(variant.goalCellsByPlayer[side]);
}

function occupiedNeighborCount(state, variant, cell) {
  return variant.neighborsByCell[cell].reduce((count, neighbor) => count + (state.board.has(neighbor) ? 1 : 0), 0);
}

function cheapMoveScore(state, move, side, context) {
  const variant = context.variant;
  const cellData = variant.cellMap[move.cell];
  const opponent = otherPlayer(side);
  const nearOccupied = occupiedNeighborCount(state, variant, move.cell);
  let score = (variant.playRadius * 2 - cellData.centerDistance) * 4;
  score += nearOccupied * 14;

  if (context.myPathCells.has(move.cell)) score += 34;
  if (context.opponentPathCells.has(move.cell)) score += 42;
  if (context.myGoalCells.has(move.cell)) score += 18;
  if (move.type === MOVE_TYPES.TOGGLE) score += 12;

  if (state.board.has(move.cell) && state.board.get(move.cell)?.owner === opponent) {
    score -= 30;
  }

  return score;
}

function buildOrderingContext(state, side) {
  const variant = getBoardVariant(state.variantName);
  return {
    variant,
    myPathCells: new Set(getMinimumCostPath(state, side).cells),
    opponentPathCells: new Set(getMinimumCostPath(state, otherPlayer(side)).cells),
    myGoalCells: goalCellSet(variant, side)
  };
}

function orderMoves(state, side, beam, precise = false) {
  const legalMoves = getLegalMoves(state, side);
  const context = buildOrderingContext(state, side);

  const ranked = legalMoves
    .map((move) => ({
      move,
      score: cheapMoveScore(state, move, side, context)
    }))
    .sort((left, right) => right.score - left.score);

  const shortlist = ranked.slice(0, Math.min(legalMoves.length, beam * 2 + 4));

  if (!precise) {
    return shortlist.slice(0, beam).map((entry) => entry.move);
  }

  return shortlist
    .map((entry) => ({
      move: entry.move,
      score: entry.score + evaluateState(applyMove(state, entry.move), side)
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, beam)
    .map((entry) => entry.move);
}

function minimax(state, depth, alpha, beta, perspective, settings, cache) {
  const cacheKey = `${serializeState(state)}:${depth}:${perspective}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const opponent = otherPlayer(perspective);

  if (state.winner === perspective) return WIN_SCORE - state.history.length;
  if (state.winner === opponent) return -WIN_SCORE + state.history.length;
  if (depth <= 0) return evaluateState(state, perspective);

  const currentSide = state.turn;
  const maximizing = currentSide === perspective;
  const moves = orderMoves(state, currentSide, settings.beam, false);

  if (!moves.length) {
    const fallback = evaluateState(state, perspective);
    cache.set(cacheKey, fallback);
    return fallback;
  }

  let bestScore = maximizing ? -Infinity : Infinity;

  for (const move of moves) {
    const next = applyMove(state, move);
    const score = minimax(next, depth - 1, alpha, beta, perspective, settings, cache);

    if (maximizing) {
      bestScore = Math.max(bestScore, score);
      alpha = Math.max(alpha, bestScore);
    } else {
      bestScore = Math.min(bestScore, score);
      beta = Math.min(beta, bestScore);
    }

    if (beta <= alpha) break;
  }

  cache.set(cacheKey, bestScore);
  return bestScore;
}

function chooseFromTop(scoredMoves, count) {
  if (!scoredMoves.length) return null;
  const top = scoredMoves.slice(0, Math.min(count, scoredMoves.length));
  return top[Math.floor(Math.random() * top.length)]?.move ?? null;
}

function pickBlockingMoves(state) {
  const legalMoves = getLegalMoves(state, state.turn);
  const blocking = [];

  for (const move of legalMoves) {
    const next = applyMove(state, move);
    if (next.winner === state.turn) return [move];
    if (immediateWinningMoves(next).length === 0) {
      blocking.push(move);
    }
  }

  return blocking;
}

export function pickAIMove(state, side = state.turn, difficulty = 'Medium') {
  if (state.winner || side !== state.turn) return null;

  const settings = normalizeDifficulty(difficulty);
  const legalMoves = getLegalMoves(state, side);
  if (!legalMoves.length) return null;

  const winningNow = immediateWinningMoves(state);
  if (winningNow.length) {
    const winningKeys = new Set(winningNow.map(moveKey));
    return orderMoves(state, side, winningNow.length, true)
      .find((move) => winningKeys.has(moveKey(move)))
      ?? winningNow[0];
  }

  const blockers = pickBlockingMoves(state);
  const rootMoves = blockers.length ? blockers : orderMoves(state, side, settings.beam, true);
  const searchDepth = settings.lateDepth && rootMoves.length <= settings.lateMoveThreshold
    ? settings.lateDepth
    : settings.depth;
  const cache = new Map();

  const scored = rootMoves
    .map((move) => ({
      move,
      score: minimax(applyMove(state, move), searchDepth - 1, -Infinity, Infinity, side, settings, cache)
    }))
    .sort((left, right) => right.score - left.score);

  return chooseFromTop(scored, settings.randomTop);
}

export function chooseAIMove(state, side = state.turn, difficulty = 'Medium') {
  return pickAIMove(state, side, difficulty);
}

export { PLAYERS };
