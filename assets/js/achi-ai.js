import {
  PLAYERS,
  PHASES,
  WINNING_LINES,
  GAME_CONFIG,
  cloneState,
  getPhase,
  getLegalMoves,
  applyMove,
  serializeState,
  opposite
} from './achi-engine.js';

const DIFFICULTY = {
  Easy: { placementDepth: 2, movementDepth: 4, randomness: 0.42, maxNodes: 700 },
  Medium: { placementDepth: 4, movementDepth: 7, randomness: 0.14, maxNodes: 7000 },
  Hard: { placementDepth: 8, movementDepth: 12, randomness: 0, maxNodes: 90000 }
};

function centerControl(state, side) {
  const center = state.board[4];
  if (center === side) return 12;
  if (center === opposite(side)) return -12;
  return 0;
}

function linePotential(state, side) {
  const opponent = opposite(side);
  let score = 0;

  for (const line of WINNING_LINES) {
    let mine = 0;
    let theirs = 0;
    let empty = 0;

    for (const index of line) {
      if (state.board[index] === side) mine += 1;
      else if (state.board[index] === opponent) theirs += 1;
      else empty += 1;
    }

    if (mine > 0 && theirs > 0) continue;
    if (mine === 2 && empty === 1) score += 34;
    else if (mine === 1 && empty === 2) score += 8;
    else if (theirs === 2 && empty === 1) score -= 40;
    else if (theirs === 1 && empty === 2) score -= 9;
  }

  return score;
}

function mobilityScore(state, side) {
  if (getPhase(state) !== PHASES.MOVEMENT) return 0;
  return getLegalMoves({ ...state, turn: side }, side).length - getLegalMoves({ ...state, turn: opposite(side) }, opposite(side)).length;
}

function adjacencyScore(state, side) {
  const opponent = opposite(side);
  const pairs = [
    [0, 1], [1, 2], [3, 4], [4, 5], [6, 7], [7, 8],
    [0, 3], [3, 6], [1, 4], [4, 7], [2, 5], [5, 8],
    [0, 4], [4, 8], [2, 4], [4, 6]
  ];

  let mine = 0;
  let theirs = 0;
  for (const [a, b] of pairs) {
    if (state.board[a] === side && state.board[b] === side) mine += 1;
    if (state.board[a] === opponent && state.board[b] === opponent) theirs += 1;
  }

  return mine - theirs;
}

function placementBalance(state, side) {
  const mine = state.board.filter((value) => value === side).length;
  const theirs = state.board.filter((value) => value === opposite(side)).length;
  return (GAME_CONFIG.piecesPerPlayer - Math.max(0, GAME_CONFIG.piecesPerPlayer - mine)) - (GAME_CONFIG.piecesPerPlayer - Math.max(0, GAME_CONFIG.piecesPerPlayer - theirs));
}

function evaluate(state, side) {
  if (state.winner === side) return 100000;
  if (state.winner === opposite(side)) return -100000;

  return (
    linePotential(state, side) +
    centerControl(state, side) +
    adjacencyScore(state, side) * 4 +
    mobilityScore(state, side) * 3 +
    placementBalance(state, side) * 2
  );
}

function immediateWinningMove(state, side) {
  const legal = getLegalMoves({ ...state, turn: side }, side);
  for (const move of legal) {
    if (applyMove({ ...state, turn: side }, move).winner === side) {
      return move;
    }
  }
  return null;
}

function immediateOpponentThreats(state, side) {
  if (state.winner) return 0;
  const opponent = opposite(side);
  if (state.turn !== opponent) return 0;

  let threats = 0;
  for (const move of getLegalMoves({ ...state, turn: opponent }, opponent)) {
    if (applyMove({ ...state, turn: opponent }, move).winner === opponent) {
      threats += 1;
    }
  }

  return threats;
}

function movePriority(state, move, side) {
  const next = applyMove(state, move);
  let priority = evaluate(next, side);
  if (next.winner === side) priority += 10000;
  if (move.kind === 'place' && move.to === 4) priority += 20;
  priority -= immediateOpponentThreats(next, side) * 160;
  return priority;
}

function orderMoves(state, moves, side) {
  return [...moves].sort((a, b) => movePriority(state, b, side) - movePriority(state, a, side));
}

function tableKey(state, depth, maximizing, rootSide) {
  return `${serializeState(state)}|${depth}|${maximizing ? 'max' : 'min'}|${rootSide}`;
}

function minimax(state, depth, alpha, beta, maximizing, rootSide, table, context) {
  context.nodes += 1;
  if (context.nodes >= context.maxNodes) {
    return { score: evaluate(state, rootSide), move: null };
  }

  const key = tableKey(state, depth, maximizing, rootSide);
  const cached = table.get(key);
  if (cached) return cached;

  if (depth === 0 || state.winner) {
    const result = { score: evaluate(state, rootSide), move: null };
    table.set(key, result);
    return result;
  }

  const sideToMove = state.turn;
  const orderedMoves = orderMoves(state, getLegalMoves({ ...state, turn: sideToMove }, sideToMove), rootSide);

  if (!orderedMoves.length) {
    const result = { score: evaluate(state, rootSide), move: null };
    table.set(key, result);
    return result;
  }

  let bestMove = orderedMoves[0];

  if (maximizing) {
    let bestScore = -Infinity;
    for (const move of orderedMoves) {
      const child = applyMove(state, move);
      const { score } = minimax(child, depth - 1, alpha, beta, child.turn === rootSide, rootSide, table, context);
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
      alpha = Math.max(alpha, bestScore);
      if (beta <= alpha) break;
    }
    const result = { score: bestScore, move: bestMove };
    table.set(key, result);
    return result;
  }

  let bestScore = Infinity;
  for (const move of orderedMoves) {
    const child = applyMove(state, move);
    const { score } = minimax(child, depth - 1, alpha, beta, child.turn === rootSide, rootSide, table, context);
    if (score < bestScore) {
      bestScore = score;
      bestMove = move;
    }
    beta = Math.min(beta, bestScore);
    if (beta <= alpha) break;
  }

  const result = { score: bestScore, move: bestMove };
  table.set(key, result);
  return result;
}

function searchDepth(state, settings) {
  return getPhase(state) === PHASES.PLACEMENT
    ? settings.placementDepth
    : settings.movementDepth;
}

export function pickAIMove(state, side, difficulty = 'Medium') {
  const settings = DIFFICULTY[difficulty] ?? DIFFICULTY.Medium;
  const legal = orderMoves(state, getLegalMoves({ ...state, turn: side }, side), side);
  if (!legal.length) return null;

  const winningMove = immediateWinningMove(state, side);
  if (winningMove) return winningMove;

  let bestMove = legal[0];
  const maxDepth = searchDepth(state, settings);
  const table = new Map();

  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const context = { nodes: 0, maxNodes: settings.maxNodes };
    const result = minimax(cloneState({ ...state, turn: side }), depth, -Infinity, Infinity, true, side, table, context);
    if (result.move) bestMove = result.move;
    if (context.nodes >= settings.maxNodes) break;
  }

  if (settings.randomness > 0 && legal.length > 1) {
    const scored = legal.map((move) => {
      const child = applyMove({ ...state, turn: side }, move);
      return { move, score: evaluate(child, side) };
    }).sort((a, b) => b.score - a.score);

    const bucketSize = Math.max(1, Math.ceil(scored.length * settings.randomness));
    const bucket = scored.slice(0, bucketSize);
    return bucket[Math.floor(Math.random() * bucket.length)].move;
  }

  return bestMove;
}

export function thinkAndPickAIMove(state, side, difficulty = 'Medium', delayMs = 260) {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      resolve(pickAIMove(state, side, difficulty));
    }, delayMs);
  });
}
