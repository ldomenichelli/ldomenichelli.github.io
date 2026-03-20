import {
  SIDES,
  GAME_CONFIG,
  applyMove,
  getLegalMoves,
  getLegalJaguarCaptures,
  serializeState,
  occupantAt,
  ADJACENCY
} from './adugo-engine.js';

const DIFFICULTY = {
  Easy: { depth: 2, randomness: 0.4, maxNodes: 2200 },
  Medium: { depth: 4, randomness: 0.12, maxNodes: 22000 },
  Hard: { depth: 6, randomness: 0, maxNodes: 90000 }
};

function opposite(side) {
  return side === SIDES.JAGUAR ? SIDES.DOGS : SIDES.JAGUAR;
}

function centrality(index) {
  const x = index % GAME_CONFIG.size;
  const y = Math.floor(index / GAME_CONFIG.size);
  return -Math.abs(2 - x) - Math.abs(2 - y);
}

function jaguarMobility(state) {
  return getLegalMoves({ ...state, turn: SIDES.JAGUAR, chainCaptureFrom: null }, SIDES.JAGUAR).length;
}

function immediateJaguarCaptures(state, from = state.jaguar) {
  return getLegalJaguarCaptures({ ...state, chainCaptureFrom: from }, from).length;
}

function dogNetPressure(state) {
  let occupiedNeighbors = 0;
  for (const n of ADJACENCY.get(state.jaguar)) {
    if (occupantAt(state, n) === SIDES.DOGS) occupiedNeighbors += 1;
  }
  return occupiedNeighbors;
}

function dogCohesion(state) {
  const dogs = state.dogs;
  if (dogs.length <= 1) return 0;
  let connectedPairs = 0;

  for (let i = 0; i < dogs.length; i += 1) {
    for (let j = i + 1; j < dogs.length; j += 1) {
      if (ADJACENCY.get(dogs[i]).includes(dogs[j])) connectedPairs += 1;
    }
  }

  return connectedPairs;
}

function exposedDogs(state) {
  let exposed = 0;

  for (const dog of state.dogs) {
    for (const n of ADJACENCY.get(dog)) {
      if (n !== state.jaguar) continue;

      const jx = state.jaguar % GAME_CONFIG.size;
      const jy = Math.floor(state.jaguar / GAME_CONFIG.size);
      const dx = (dog % GAME_CONFIG.size) - jx;
      const dy = Math.floor(dog / GAME_CONFIG.size) - jy;
      const lx = (dog % GAME_CONFIG.size) + dx;
      const ly = Math.floor(dog / GAME_CONFIG.size) + dy;
      const landing = ly * GAME_CONFIG.size + lx;

      if (
        lx >= 0 && lx < GAME_CONFIG.size &&
        ly >= 0 && ly < GAME_CONFIG.size &&
        ADJACENCY.get(dog).includes(landing) &&
        occupantAt(state, landing) == null
      ) {
        exposed += 1;
      }
    }
  }

  return exposed;
}

function chainPotential(state) {
  const base = {
    ...state,
    turn: SIDES.JAGUAR,
    chainCaptureFrom: null
  };

  const captures = getLegalJaguarCaptures(base, base.jaguar);
  if (captures.length === 0) return 0;

  let bestFollowUps = 0;
  for (const capture of captures) {
    const child = applyMove(base, capture);
    const followUps = child.chainCaptureFrom != null
      ? getLegalJaguarCaptures(child, child.chainCaptureFrom).length
      : 0;
    bestFollowUps = Math.max(bestFollowUps, followUps);
  }

  return captures.length + bestFollowUps;
}

function evaluate(state, side) {
  if (state.winner === SIDES.JAGUAR) return side === SIDES.JAGUAR ? 100000 : -100000;
  if (state.winner === SIDES.DOGS) return side === SIDES.DOGS ? 100000 : -100000;

  const mobility = jaguarMobility(state);
  const pressure = dogNetPressure(state);
  const capturesSoon = immediateJaguarCaptures(state, state.jaguar);
  const chainScore = chainPotential(state);
  const cohesion = dogCohesion(state);
  const exposed = exposedDogs(state);

  const jaguarScore =
    state.capturedDogs * 250 +
    mobility * 26 +
    capturesSoon * 85 +
    chainScore * 46 +
    centrality(state.jaguar) * 12 -
    pressure * 38;

  const dogsScore =
    pressure * 50 +
    cohesion * 7 +
    Math.max(0, 9 - mobility) * 34 -
    state.capturedDogs * 220 -
    capturesSoon * 90 -
    chainScore * 40 -
    exposed * 18;

  const fromJaguarPOV = jaguarScore - dogsScore;
  return side === SIDES.JAGUAR ? fromJaguarPOV : -fromJaguarPOV;
}

function orderMoves(moves) {
  return [...moves].sort((a, b) => {
    const av = (a.type === 'capture' ? 8 : 0) + centrality(a.to);
    const bv = (b.type === 'capture' ? 8 : 0) + centrality(b.to);
    return bv - av;
  });
}

function tableKey(state, maximizing) {
  return `${serializeState(state)}|${maximizing ? 'max' : 'min'}`;
}

function minimax(state, depth, alpha, beta, maximizing, rootSide, table, context) {
  context.nodes += 1;
  if (context.nodes >= context.maxNodes) {
    return { score: evaluate(state, rootSide), move: null };
  }

  const key = tableKey(state, maximizing);
  const cached = table.get(key);
  if (cached && cached.depth >= depth) {
    return { score: cached.score, move: cached.move };
  }

  if (depth === 0 || state.winner) {
    const score = evaluate(state, rootSide);
    const result = { score, move: null };
    table.set(key, { ...result, depth });
    return result;
  }

  const moves = orderMoves(getLegalMoves(state, state.turn));
  if (moves.length === 0) {
    const score = evaluate(state, rootSide);
    const result = { score, move: null };
    table.set(key, { ...result, depth });
    return result;
  }

  let bestMove = moves[0];

  if (maximizing) {
    let bestScore = -Infinity;
    for (const move of moves) {
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
    table.set(key, { ...result, depth });
    return result;
  }

  let bestScore = Infinity;
  for (const move of moves) {
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
  table.set(key, { ...result, depth });
  return result;
}

export function pickAIMove(state, side, difficulty = 'Medium') {
  const settings = DIFFICULTY[difficulty] ?? DIFFICULTY.Medium;
  const legal = getLegalMoves(state, side);
  if (legal.length === 0) return null;

  const table = new Map();
  const maximizing = state.turn === side;

  let bestMove = null;
  for (let depth = 1; depth <= settings.depth; depth += 1) {
    const context = { nodes: 0, maxNodes: settings.maxNodes };
    const result = minimax(state, depth, -Infinity, Infinity, maximizing, side, table, context);
    if (result.move) bestMove = result.move;
    if (context.nodes >= settings.maxNodes) break;
  }

  if (!bestMove) return legal[0];

  if (settings.randomness > 0 && legal.length > 1) {
    const scored = legal.map((candidate) => {
      const child = applyMove(state, candidate);
      return { candidate, score: evaluate(child, side) };
    }).sort((a, b) => b.score - a.score);

    const bucketSize = Math.max(1, Math.ceil(scored.length * settings.randomness));
    const bucket = scored.slice(0, bucketSize);
    return bucket[Math.floor(Math.random() * bucket.length)].candidate;
  }

  return bestMove;
}

export function thinkAndPickAIMove(state, side, difficulty = 'Medium', delayMs = 280) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(pickAIMove(state, side, difficulty));
    }, delayMs);
  });
}

export { opposite };
