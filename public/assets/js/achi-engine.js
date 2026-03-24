export const PLAYERS = Object.freeze({
  WHITE: 'WHITE',
  BLACK: 'BLACK'
});

export const PHASES = Object.freeze({
  PLACEMENT: 'PLACEMENT',
  MOVEMENT: 'MOVEMENT'
});

export const GAME_CONFIG = Object.freeze({
  size: 3,
  piecesPerPlayer: 4
});

export const WINNING_LINES = Object.freeze([
  Object.freeze([0, 1, 2]),
  Object.freeze([3, 4, 5]),
  Object.freeze([6, 7, 8]),
  Object.freeze([0, 3, 6]),
  Object.freeze([1, 4, 7]),
  Object.freeze([2, 5, 8]),
  Object.freeze([0, 4, 8]),
  Object.freeze([2, 4, 6])
]);

export const ADJACENCY = new Map([
  [0, Object.freeze([1, 3, 4])],
  [1, Object.freeze([0, 2, 4])],
  [2, Object.freeze([1, 4, 5])],
  [3, Object.freeze([0, 4, 6])],
  [4, Object.freeze([0, 1, 2, 3, 5, 6, 7, 8])],
  [5, Object.freeze([2, 4, 8])],
  [6, Object.freeze([3, 4, 7])],
  [7, Object.freeze([4, 6, 8])],
  [8, Object.freeze([4, 5, 7])]
]);

export function opposite(player) {
  return player === PLAYERS.WHITE ? PLAYERS.BLACK : PLAYERS.WHITE;
}

export function indexToCoord(index) {
  return {
    x: index % GAME_CONFIG.size,
    y: Math.floor(index / GAME_CONFIG.size)
  };
}

export function coordToIndex(x, y) {
  return y * GAME_CONFIG.size + x;
}

export function coordLabel(index) {
  const { x, y } = indexToCoord(index);
  return `${String.fromCharCode(65 + x)}${y + 1}`;
}

export function createInitialState(overrides = {}) {
  return {
    board: Array(GAME_CONFIG.size * GAME_CONFIG.size).fill(null),
    turn: PLAYERS.WHITE,
    winner: null,
    winningLine: null,
    history: [],
    ...overrides
  };
}

export function cloneState(state) {
  return {
    ...state,
    board: [...state.board],
    winningLine: state.winningLine ? [...state.winningLine] : null,
    history: state.history ? [...state.history] : []
  };
}

export function pieceCount(state, player) {
  return state.board.filter((value) => value === player).length;
}

export function totalPiecesPlaced(state) {
  return pieceCount(state, PLAYERS.WHITE) + pieceCount(state, PLAYERS.BLACK);
}

export function getPhase(state) {
  return totalPiecesPlaced(state) < GAME_CONFIG.piecesPerPlayer * 2
    ? PHASES.PLACEMENT
    : PHASES.MOVEMENT;
}

export function getPieces(state, player) {
  return state.board
    .map((value, index) => (value === player ? index : null))
    .filter((index) => index != null);
}

export function detectWinner(state) {
  for (const line of WINNING_LINES) {
    const [a, b, c] = line;
    const value = state.board[a];
    if (!value) continue;
    if (state.board[b] === value && state.board[c] === value) {
      return {
        winner: value,
        winningLine: [...line]
      };
    }
  }

  return {
    winner: null,
    winningLine: null
  };
}

export function getLegalMoves(state, player = state.turn) {
  if (state.winner) return [];

  if (getPhase(state) === PHASES.PLACEMENT) {
    return state.board
      .map((value, index) => (value == null ? { kind: 'place', to: index, player } : null))
      .filter(Boolean);
  }

  const moves = [];
  for (const from of getPieces(state, player)) {
    for (const to of ADJACENCY.get(from)) {
      if (state.board[to] != null) continue;
      moves.push({ kind: 'move', from, to, player });
    }
  }

  return moves;
}

export function isMoveLegal(state, move, player = state.turn) {
  return getLegalMoves(state, player).some((candidate) =>
    candidate.kind === move.kind &&
    candidate.to === move.to &&
    (candidate.from ?? null) === (move.from ?? null)
  );
}

function historyEntry(state, move) {
  return {
    actor: state.turn,
    phase: getPhase(state),
    move
  };
}

export function applyMove(state, move) {
  const legal = getLegalMoves(state, state.turn).find((candidate) =>
    candidate.kind === move.kind &&
    candidate.to === move.to &&
    (candidate.from ?? null) === (move.from ?? null)
  );

  if (!legal) {
    throw new Error('Illegal move');
  }

  const next = cloneState(state);
  next.history.push(historyEntry(state, legal));

  if (legal.kind === 'place') {
    next.board[legal.to] = state.turn;
  } else {
    next.board[legal.from] = null;
    next.board[legal.to] = state.turn;
  }

  const result = detectWinner(next);
  next.winner = result.winner;
  next.winningLine = result.winningLine;

  if (!next.winner) {
    next.turn = opposite(state.turn);
  }

  return next;
}

export function serializeState(state) {
  return JSON.stringify({
    board: state.board,
    turn: state.turn,
    phase: getPhase(state),
    winner: state.winner
  });
}
