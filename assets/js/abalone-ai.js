import {
  BLACK,
  WHITE,
  DIRECTIONS,
  allCells,
  add,
  isValidCell,
  keyOf,
  parseKey,
  marbleAt,
  getLegalMovesForSelection,
  applyMove
} from './abalone-engine.js';

const CELLS = allCells();
const CENTER_WEIGHT = 0.36;
const CONNECTIVITY_WEIGHT = 0.8;
const EDGE_RISK_WEIGHT = 0.65;
const MOBILITY_WEIGHT = 0.2;
const TACTICAL_WEIGHT = 0.72;
const CAPTURE_WEIGHT = 8.5;

const SEARCH_CONFIG = {
  easy: { depth: 1, branch: 8, timeMs: 140 },
  medium: { depth: 2, branch: 12, timeMs: 420 },
  hard: { depth: 3, branch: 14, timeMs: 900 }
};

function opponentOf(player) {
  return player === BLACK ? WHITE : BLACK;
}

function selectionKey(selection) {
  return selection.map(keyOf).sort().join('|');
}

function enumerateSelections(state, player) {
  const seen = new Set();
  const selections = [];

  for (const cell of CELLS) {
    if (marbleAt(state, cell) !== player) continue;

    const single = [cell];
    const singleKey = selectionKey(single);
    if (!seen.has(singleKey)) {
      seen.add(singleKey);
      selections.push(single);
    }

    for (const dir of DIRECTIONS) {
      const two = [cell, add(cell, dir)];
      if (two.every((c) => isValidCell(c) && marbleAt(state, c) === player)) {
        const k = selectionKey(two);
        if (!seen.has(k)) {
          seen.add(k);
          selections.push(two);
        }
      }

      const three = [cell, add(cell, dir), add(cell, { q: dir.q * 2, r: dir.r * 2 })];
      if (three.every((c) => isValidCell(c) && marbleAt(state, c) === player)) {
        const k = selectionKey(three);
        if (!seen.has(k)) {
          seen.add(k);
          selections.push(three);
        }
      }
    }
  }

  return selections;
}

export function enumerateLegalMoves(state, player = state.turn) {
  const selections = enumerateSelections(state, player);
  const moves = [];
  const seen = new Set();

  for (const selection of selections) {
    const legal = getLegalMovesForSelection(state, selection, player);
    for (const move of legal) {
      const key = `${selectionKey(move.selection)}::${keyOf(move.direction)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      moves.push(move);
    }
  }

  return moves;
}

function centerValue(cell) {
  return 4 - Math.max(Math.abs(cell.q), Math.abs(cell.r), Math.abs(-cell.q - cell.r));
}

function evaluateCenterControl(state, player) {
  let mine = 0;
  let theirs = 0;
  const opp = opponentOf(player);
  for (const [key, value] of state.board.entries()) {
    if (!value) continue;
    const cVal = centerValue(parseKey(key));
    if (value === player) mine += cVal;
    if (value === opp) theirs += cVal;
  }
  return mine - theirs;
}

function evaluateConnectivity(state, player) {
  const opp = opponentOf(player);
  let mine = 0;
  let theirs = 0;

  for (const cell of CELLS) {
    const owner = marbleAt(state, cell);
    if (!owner) continue;
    let friendly = 0;
    for (const d of DIRECTIONS) {
      const n = add(cell, d);
      if (isValidCell(n) && marbleAt(state, n) === owner) friendly += 1;
    }
    if (owner === player) mine += friendly;
    if (owner === opp) theirs += friendly;
  }

  return mine - theirs;
}

function evaluateEdgeRisk(state, player) {
  const opp = opponentOf(player);
  let mine = 0;
  let theirs = 0;

  for (const [key, owner] of state.board.entries()) {
    if (!owner) continue;
    const cell = parseKey(key);
    const dist = Math.max(Math.abs(cell.q), Math.abs(cell.r), Math.abs(-cell.q - cell.r));
    const isEdge = dist === 4;
    const isNearEdge = dist === 3;
    const risk = isEdge ? 3 : isNearEdge ? 1.2 : 0;
    if (!risk) continue;
    if (owner === player) mine += risk;
    if (owner === opp) theirs += risk;
  }

  return theirs - mine;
}

function tacticalPotential(state, player) {
  const mine = enumerateLegalMoves(state, player);
  const opp = enumerateLegalMoves(state, opponentOf(player));
  const minePressure = mine.reduce((acc, m) => acc + m.pushCount + (m.ejected ? 3 : 0), 0);
  const oppPressure = opp.reduce((acc, m) => acc + m.pushCount + (m.ejected ? 3 : 0), 0);
  return minePressure - oppPressure;
}

function evaluateState(state, player) {
  const opp = opponentOf(player);
  if (state.winner === player) return Number.POSITIVE_INFINITY;
  if (state.winner === opp) return Number.NEGATIVE_INFINITY;

  const captureDiff = state.captured[player] - state.captured[opp];
  const mobilityDiff = enumerateLegalMoves(state, player).length - enumerateLegalMoves(state, opp).length;

  return (
    captureDiff * CAPTURE_WEIGHT +
    evaluateCenterControl(state, player) * CENTER_WEIGHT +
    evaluateConnectivity(state, player) * CONNECTIVITY_WEIGHT +
    evaluateEdgeRisk(state, player) * EDGE_RISK_WEIGHT +
    mobilityDiff * MOBILITY_WEIGHT +
    tacticalPotential(state, player) * TACTICAL_WEIGHT
  );
}

function hashState(state) {
  const boardBits = [];
  for (const cell of CELLS) {
    const value = marbleAt(state, cell) || '-';
    boardBits.push(value);
  }
  return `${state.turn}|${state.captured.B},${state.captured.W}|${boardBits.join('')}`;
}

function sortMoves(moves) {
  return [...moves].sort((a, b) => {
    const av = a.ejected * 100 + a.pushCount * 10 + (a.kind === 'inline' ? 1 : 0);
    const bv = b.ejected * 100 + b.pushCount * 10 + (b.kind === 'inline' ? 1 : 0);
    return bv - av;
  });
}

function minimax(state, depth, alpha, beta, maximizing, aiPlayer, cache, deadline, maxBranch) {
  const key = `${hashState(state)}|${depth}|${maximizing ? 1 : 0}|${aiPlayer}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  if (Date.now() > deadline || depth === 0 || state.winner) {
    const score = evaluateState(state, aiPlayer);
    cache.set(key, score);
    return score;
  }

  const player = maximizing ? aiPlayer : opponentOf(aiPlayer);
  const moves = sortMoves(enumerateLegalMoves(state, player)).slice(0, maxBranch);
  if (!moves.length) {
    const score = evaluateState(state, aiPlayer);
    cache.set(key, score);
    return score;
  }

  let best = maximizing ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  for (const move of moves) {
    const next = applyMove(state, move);
    const value = minimax(next, depth - 1, alpha, beta, !maximizing, aiPlayer, cache, deadline, maxBranch);

    if (maximizing) {
      best = Math.max(best, value);
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    } else {
      best = Math.min(best, value);
      beta = Math.min(beta, value);
      if (alpha >= beta) break;
    }
  }

  cache.set(key, best);
  return best;
}

export function chooseAIMove(state, aiPlayer, difficulty = 'medium') {
  const moves = enumerateLegalMoves(state, aiPlayer);
  if (!moves.length) return null;

  const config = SEARCH_CONFIG[difficulty] ?? SEARCH_CONFIG.medium;
  const orderedMoves = sortMoves(moves).slice(0, config.branch + 2);

  let bestMove = orderedMoves[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  const cache = new Map();

  const deadline = Date.now() + config.timeMs;

  for (const move of orderedMoves) {
    if (Date.now() > deadline) break;
    const next = applyMove(state, move);
    const score = minimax(next, Math.max(0, config.depth - 1), Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, false, aiPlayer, cache, deadline, config.branch);
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}
