export const SIDES = Object.freeze({
  JAGUAR: 'JAGUAR',
  DOGS: 'DOGS'
});

export const GAME_CONFIG = Object.freeze({
  size: 5,
  // Centralized win condition. Existing page text states "capture all dogs".
  jaguarCaptureTarget: 14,
  initialJaguar: 12,
  initialDogs: Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 15, 16])
});

const DIRECTIONS = Object.freeze([
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, -1],
  [1, -1],
  [-1, 1]
]);

export function indexToCoord(index) {
  const x = index % GAME_CONFIG.size;
  const y = Math.floor(index / GAME_CONFIG.size);
  return { x, y };
}

export function coordToIndex(x, y) {
  return y * GAME_CONFIG.size + x;
}

function inBounds(x, y) {
  return x >= 0 && x < GAME_CONFIG.size && y >= 0 && y < GAME_CONFIG.size;
}

function hasDiagonal(x, y) {
  return (x + y) % 2 === 0;
}

export function createAdjacency() {
  const adjacency = new Map();
  for (let i = 0; i < GAME_CONFIG.size * GAME_CONFIG.size; i += 1) {
    const { x, y } = indexToCoord(i);
    const neighbors = [];
    for (const [dx, dy] of DIRECTIONS) {
      const diagonal = Math.abs(dx) + Math.abs(dy) === 2;
      if (diagonal && !hasDiagonal(x, y)) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      if (diagonal && !hasDiagonal(nx, ny)) continue;
      neighbors.push(coordToIndex(nx, ny));
    }
    adjacency.set(i, neighbors);
  }
  return adjacency;
}

export const ADJACENCY = createAdjacency();

export function createInitialState(overrides = {}) {
  const dogs = GAME_CONFIG.initialDogs.filter((pos) => pos !== GAME_CONFIG.initialJaguar);
  return {
    jaguar: GAME_CONFIG.initialJaguar,
    dogs,
    capturedDogs: 0,
    turn: SIDES.JAGUAR,
    winner: null,
    moveNumber: 1,
    chainCaptureFrom: null,
    history: [],
    ...overrides
  };
}

export function cloneState(state) {
  return {
    ...state,
    dogs: [...state.dogs],
    history: state.history ? [...state.history] : []
  };
}

export function occupantAt(state, index) {
  if (state.jaguar === index) return SIDES.JAGUAR;
  if (state.dogs.includes(index)) return SIDES.DOGS;
  return null;
}

export function getStepDirection(from, to) {
  const a = indexToCoord(from);
  const b = indexToCoord(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1) return null;
  if (dx === 0 && dy === 0) return null;
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const neighbor = coordToIndex(a.x + sx, a.y + sy);
  return ADJACENCY.get(from).includes(neighbor) && neighbor === to ? { dx: sx, dy: sy } : null;
}

function jumpLanding(from, over) {
  const f = indexToCoord(from);
  const o = indexToCoord(over);
  const dx = o.x - f.x;
  const dy = o.y - f.y;
  const lx = o.x + dx;
  const ly = o.y + dy;
  if (!inBounds(lx, ly)) return null;
  const landing = coordToIndex(lx, ly);
  if (!ADJACENCY.get(from).includes(over)) return null;
  if (!ADJACENCY.get(over).includes(landing)) return null;
  return landing;
}

export function getLegalSimpleMoves(state, side = state.turn) {
  if (state.winner) return [];

  if (side === SIDES.JAGUAR) {
    const candidates = [];
    for (const n of ADJACENCY.get(state.jaguar)) {
      if (!occupantAt(state, n)) {
        candidates.push({ from: state.jaguar, to: n, type: 'move', side });
      }
    }
    return candidates;
  }

  const moves = [];
  for (const from of state.dogs) {
    for (const to of ADJACENCY.get(from)) {
      if (!occupantAt(state, to)) {
        moves.push({ from, to, type: 'move', side });
      }
    }
  }
  return moves;
}

export function getLegalJaguarCaptures(state, from = state.jaguar) {
  const captures = [];
  for (const neighbor of ADJACENCY.get(from)) {
    if (occupantAt(state, neighbor) !== SIDES.DOGS) continue;
    const landing = jumpLanding(from, neighbor);
    if (landing == null) continue;
    if (occupantAt(state, landing)) continue;
    captures.push({
      from,
      to: landing,
      over: neighbor,
      type: 'capture',
      side: SIDES.JAGUAR
    });
  }
  return captures;
}

export function getLegalMoves(state, side = state.turn) {
  if (state.winner) return [];

  if (side === SIDES.JAGUAR) {
    if (state.chainCaptureFrom != null) {
      return getLegalJaguarCaptures(state, state.chainCaptureFrom);
    }
    return [...getLegalJaguarCaptures(state), ...getLegalSimpleMoves(state, SIDES.JAGUAR)];
  }

  return getLegalSimpleMoves(state, SIDES.DOGS);
}

function removeDog(dogs, idx) {
  const next = dogs.filter((d) => d !== idx);
  if (next.length === dogs.length) {
    throw new Error(`Dog at ${idx} not found`);
  }
  return next;
}

export function detectWinner(state) {
  if (state.capturedDogs >= GAME_CONFIG.jaguarCaptureTarget) {
    return SIDES.JAGUAR;
  }
  const jaguarMoves = state.chainCaptureFrom != null
    ? getLegalJaguarCaptures(state, state.chainCaptureFrom)
    : getLegalMoves({ ...state, turn: SIDES.JAGUAR, chainCaptureFrom: null }, SIDES.JAGUAR);
  if (jaguarMoves.length === 0) {
    return SIDES.DOGS;
  }
  return null;
}

function makeHistoryEntry(move, actorSide, previousState) {
  return {
    move,
    actorSide,
    moveNumber: previousState.moveNumber,
    capturedDogs: previousState.capturedDogs,
    turnBefore: previousState.turn
  };
}

export function applyMove(state, move) {
  const legalMoves = getLegalMoves(state, state.turn);
  const key = `${move.from}-${move.to}-${move.type}`;
  const legal = legalMoves.find((m) => `${m.from}-${m.to}-${m.type}` === key && (m.over ?? -1) === (move.over ?? -1));
  if (!legal) {
    throw new Error('Illegal move');
  }

  const next = cloneState(state);
  next.history.push(makeHistoryEntry(legal, state.turn, state));

  if (state.turn === SIDES.JAGUAR) {
    next.jaguar = legal.to;
    if (legal.type === 'capture') {
      next.dogs = removeDog(next.dogs, legal.over);
      next.capturedDogs += 1;
      const followUps = getLegalJaguarCaptures({ ...next, chainCaptureFrom: legal.to }, legal.to);
      if (followUps.length > 0) {
        next.turn = SIDES.JAGUAR;
        next.chainCaptureFrom = legal.to;
      } else {
        next.turn = SIDES.DOGS;
        next.chainCaptureFrom = null;
        next.moveNumber += 1;
      }
    } else {
      next.turn = SIDES.DOGS;
      next.chainCaptureFrom = null;
      next.moveNumber += 1;
    }
  } else {
    next.dogs = next.dogs.map((d) => (d === legal.from ? legal.to : d));
    next.turn = SIDES.JAGUAR;
    next.chainCaptureFrom = null;
    next.moveNumber += 1;
  }

  next.winner = detectWinner(next);
  return next;
}

export function serializeState(state) {
  return JSON.stringify({
    jaguar: state.jaguar,
    dogs: [...state.dogs].sort((a, b) => a - b),
    capturedDogs: state.capturedDogs,
    turn: state.turn,
    winner: state.winner,
    moveNumber: state.moveNumber,
    chainCaptureFrom: state.chainCaptureFrom
  });
}

export function isMoveLegal(state, move) {
  return getLegalMoves(state).some((m) => m.from === move.from && m.to === move.to && m.type === move.type && (m.over ?? null) === (move.over ?? null));
}
