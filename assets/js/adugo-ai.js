import {
  SIDES,
  GAME_CONFIG,
  applyMove,
  getLegalMoves,
  serializeState,
  occupantAt,
  ADJACENCY
} from './adugo-engine.js';

const DIFFICULTY = {
  Easy: { depth: 2, randomness: 0.45 },
  Medium: { depth: 4, randomness: 0.15 },
  Hard: { depth: 5, randomness: 0 }
};

function opposite(side) {
  return side === SIDES.JAGUAR ? SIDES.DOGS : SIDES.JAGUAR;
}

function jaguarMobility(state) {
  return getLegalMoves({ ...state, turn: SIDES.JAGUAR, chainCaptureFrom: null }, SIDES.JAGUAR).length;
}

function dogNetPressure(state) {
  const jaguarPos = state.jaguar;
  let occupiedNeighbors = 0;
  for (const n of ADJACENCY.get(jaguarPos)) {
    if (occupantAt(state, n) === SIDES.DOGS) occupiedNeighbors += 1;
  }
  return occupiedNeighbors;
}

function immediateJaguarCaptures(state) {
  return getLegalMoves({ ...state, turn: SIDES.JAGUAR, chainCaptureFrom: state.jaguar }, SIDES.JAGUAR)
    .filter((m) => m.type === 'capture').length;
}

function centrality(index) {
  const x = index % GAME_CONFIG.size;
  const y = Math.floor(index / GAME_CONFIG.size);
  return -Math.abs(2 - x) - Math.abs(2 - y);
}

function evaluate(state, side) {
  if (state.winner === SIDES.JAGUAR) return side === SIDES.JAGUAR ? 100000 : -100000;
  if (state.winner === SIDES.DOGS) return side === SIDES.DOGS ? 100000 : -100000;

  const mobility = jaguarMobility(state);
  const pressure = dogNetPressure(state);
  const capturesSoon = immediateJaguarCaptures(state);

  const jaguarScore =
    state.capturedDogs * 230 +
    mobility * 25 +
    capturesSoon * 80 +
    centrality(state.jaguar) * 10 -
    pressure * 35;

  const dogsScore =
    pressure * 45 +
    Math.max(0, 8 - mobility) * 32 -
    state.capturedDogs * 210 -
    capturesSoon * 95;

  const evalFromJaguarPerspective = jaguarScore - dogsScore;
  return side === SIDES.JAGUAR ? evalFromJaguarPerspective : -evalFromJaguarPerspective;
}

function orderMoves(state, moves) {
  return [...moves].sort((a, b) => {
    const av = (a.type === 'capture' ? 6 : 0) + centrality(a.to);
    const bv = (b.type === 'capture' ? 6 : 0) + centrality(b.to);
    return bv - av;
  });
}

function minimax(state, depth, alpha, beta, maximizing, rootSide, table) {
  const key = `${serializeState(state)}|${depth}|${maximizing}`;
  if (table.has(key)) return table.get(key);

  if (depth === 0 || state.winner) {
    const score = evaluate(state, rootSide);
    const result = { score, move: null };
    table.set(key, result);
    return result;
  }

  const moves = orderMoves(state, getLegalMoves(state, state.turn));
  if (moves.length === 0) {
    const score = evaluate(state, rootSide);
    const result = { score, move: null };
    table.set(key, result);
    return result;
  }

  let bestMove = moves[0];

  if (maximizing) {
    let bestScore = -Infinity;
    for (const move of moves) {
      const child = applyMove(state, move);
      const { score } = minimax(child, depth - 1, alpha, beta, child.turn === rootSide, rootSide, table);
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
  for (const move of moves) {
    const child = applyMove(state, move);
    const { score } = minimax(child, depth - 1, alpha, beta, child.turn === rootSide, rootSide, table);
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

export function pickAIMove(state, side, difficulty = 'Medium') {
  const settings = DIFFICULTY[difficulty] ?? DIFFICULTY.Medium;
  const legal = getLegalMoves(state, side);
  if (legal.length === 0) return null;

  const table = new Map();
  const maximizing = state.turn === side;
  const { move } = minimax(state, settings.depth, -Infinity, Infinity, maximizing, side, table);

  if (!move) return legal[0];

  if (settings.randomness > 0 && legal.length > 1) {
    const scored = legal.map((candidate) => {
      const child = applyMove(state, candidate);
      return { candidate, score: evaluate(child, side) };
    }).sort((a, b) => b.score - a.score);

    const topBucketSize = Math.max(1, Math.ceil(scored.length * settings.randomness));
    const bucket = scored.slice(0, topBucketSize);
    const randomPick = bucket[Math.floor(Math.random() * bucket.length)].candidate;
    return randomPick;
  }

  return move;
}

export function thinkAndPickAIMove(state, side, difficulty = 'Medium', delayMs = 320) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(pickAIMove(state, side, difficulty));
    }, delayMs);
  });
}

export { opposite };
