const DIRECTIONS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 }
];

export const BLACK = 'B';
export const WHITE = 'W';
export const RADIUS = 4;

export function keyOf(cell) {
  return `${cell.q},${cell.r}`;
}

export function parseKey(key) {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
}

export function add(a, b) {
  return { q: a.q + b.q, r: a.r + b.r };
}

export function scale(dir, n) {
  return { q: dir.q * n, r: dir.r * n };
}

export function isValidCell(cell) {
  const s = -cell.q - cell.r;
  return Math.max(Math.abs(cell.q), Math.abs(cell.r), Math.abs(s)) <= RADIUS;
}

export function neighbors(cell) {
  return DIRECTIONS.map((d) => add(cell, d)).filter(isValidCell);
}

export function allCells() {
  const cells = [];
  for (let q = -RADIUS; q <= RADIUS; q += 1) {
    for (let r = -RADIUS; r <= RADIUS; r += 1) {
      const cell = { q, r };
      if (isValidCell(cell)) cells.push(cell);
    }
  }
  return cells;
}

export function standardStartCells() {
  const black = [];
  for (let q = 0; q <= 4; q += 1) black.push({ q, r: -4 });
  for (let q = -1; q <= 4; q += 1) black.push({ q, r: -3 });
  for (let q = 0; q <= 2; q += 1) black.push({ q, r: -2 });
  const white = black.map((cell) => ({ q: -cell.q, r: -cell.r }));
  return { black, white };
}


function createBoardMap() {
  const board = new Map();
  for (const c of allCells()) board.set(keyOf(c), null);
  return board;
}

// Standard setup (black top):
// r=-4 -> q=0..4 (5 marbles)
// r=-3 -> q=-1..4 (6 marbles)
// r=-2 -> centered 3 marbles q=0..2
export function initialState() {
  const board = createBoardMap();
  const { black, white } = standardStartCells();

  for (const cell of black) board.set(keyOf(cell), BLACK);
  for (const cell of white) board.set(keyOf(cell), WHITE);

  return {
    board,
    turn: BLACK,
    captured: { [BLACK]: 0, [WHITE]: 0 },
    winner: null,
    history: []
  };
}

export function cloneState(state) {
  return {
    board: new Map(state.board),
    turn: state.turn,
    captured: { ...state.captured },
    winner: state.winner,
    history: [...state.history]
  };
}

export function marbleAt(state, cell) {
  return state.board.get(keyOf(cell)) ?? null;
}

function normalizeSelection(cells) {
  const unique = [...new Set(cells.map(keyOf))].map(parseKey);
  unique.sort((a, b) => (a.q === b.q ? a.r - b.r : a.q - b.q));
  return unique;
}

function selectionDirection(selection) {
  if (selection.length < 2) return null;
  const [a, b] = selection;
  const diff = { q: b.q - a.q, r: b.r - a.r };
  return DIRECTIONS.find((d) => d.q === diff.q && d.r === diff.r) ||
    DIRECTIONS.find((d) => d.q === -diff.q && d.r === -diff.r) ||
    null;
}

function areContiguousAligned(selection) {
  if (selection.length === 1) return true;
  const dir = selectionDirection(selection);
  if (!dir) return false;

  const sorted = [...selection].sort((a, b) => {
    const pa = a.q * dir.q + a.r * dir.r;
    const pb = b.q * dir.q + b.r * dir.r;
    return pa - pb;
  });

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (curr.q - prev.q !== dir.q || curr.r - prev.r !== dir.r) return false;
  }
  return true;
}

export function isValidSelection(state, cells, player = state.turn) {
  const selection = normalizeSelection(cells);
  if (selection.length < 1 || selection.length > 3) return false;
  if (!areContiguousAligned(selection)) return false;
  return selection.every((c) => marbleAt(state, c) === player);
}

function project(cell, dir) {
  return cell.q * dir.q + cell.r * dir.r;
}

function orderedByDirection(selection, dir) {
  return [...selection].sort((a, b) => project(a, dir) - project(b, dir));
}

function directionEq(a, b) {
  return a.q === b.q && a.r === b.r;
}

function isInline(selection, moveDir) {
  if (selection.length === 1) return true;
  const axis = selectionDirection(selection);
  return axis && (directionEq(axis, moveDir) || directionEq(axis, scale(moveDir, -1)));
}

function legalBroadside(state, selection, dir) {
  for (const c of selection) {
    const target = add(c, dir);
    if (!isValidCell(target)) return null;
    if (marbleAt(state, target) !== null) return null;
  }
  return { type: 'broadside', push: 0, ejected: 0 };
}

function legalInline(state, selection, dir, player) {
  const ordered = orderedByDirection(selection, dir);
  const front = ordered[ordered.length - 1];
  const opponent = player === BLACK ? WHITE : BLACK;

  let cursor = add(front, dir);
  const opponents = [];

  while (isValidCell(cursor) && marbleAt(state, cursor) === opponent) {
    opponents.push(cursor);
    cursor = add(cursor, dir);
  }

  if (opponents.length === 0) {
    if (!isValidCell(cursor) || marbleAt(state, cursor) !== null) return null;
    return { type: 'inline', push: 0, ejected: 0 };
  }

  if (opponents.length >= ordered.length) return null;
  if (opponents.length > 2 || ordered.length < 2) return null;

  if (isValidCell(cursor) && marbleAt(state, cursor) !== null) return null;

  return {
    type: 'inline',
    push: opponents.length,
    ejected: isValidCell(cursor) ? 0 : 1
  };
}

export function getLegalMovesForSelection(state, cells, player = state.turn) {
  const selection = normalizeSelection(cells);
  if (!isValidSelection(state, selection, player)) return [];

  const moves = [];
  for (const dir of DIRECTIONS) {
    const analysis = isInline(selection, dir)
      ? legalInline(state, selection, dir, player)
      : legalBroadside(state, selection, dir);
    if (!analysis) continue;
    moves.push({
      selection,
      direction: dir,
      kind: analysis.type,
      pushCount: analysis.push,
      ejected: analysis.ejected
    });
  }
  return moves;
}

function applyMoveToBoard(state, move) {
  const board = new Map(state.board);
  const { selection, direction, kind } = move;
  const player = state.turn;
  const opponent = player === BLACK ? WHITE : BLACK;

  const orderedSelf = orderedByDirection(selection, direction);

  if (kind === 'broadside') {
    for (const c of orderedSelf) board.set(keyOf(c), null);
    for (const c of orderedSelf) board.set(keyOf(add(c, direction)), player);
    return { board, ejected: 0 };
  }

  const front = orderedSelf[orderedSelf.length - 1];
  const opponents = [];
  let cursor = add(front, direction);
  while (isValidCell(cursor) && board.get(keyOf(cursor)) === opponent) {
    opponents.push(cursor);
    cursor = add(cursor, direction);
  }

  let ejected = 0;
  for (let i = opponents.length - 1; i >= 0; i -= 1) {
    const from = opponents[i];
    const to = add(from, direction);
    board.set(keyOf(from), null);
    if (isValidCell(to)) {
      board.set(keyOf(to), opponent);
    } else {
      ejected += 1;
    }
  }

  for (let i = orderedSelf.length - 1; i >= 0; i -= 1) {
    const from = orderedSelf[i];
    const to = add(from, direction);
    board.set(keyOf(from), null);
    board.set(keyOf(to), player);
  }

  return { board, ejected };
}

export function moveDestinationCell(move) {
  const ordered = orderedByDirection(move.selection, move.direction);
  if (move.kind === 'broadside') return add(ordered[0], move.direction);
  return add(ordered[ordered.length - 1], move.direction);
}

function moveNotation(move) {
  const start = move.selection.map((c) => `(${c.q},${c.r})`).join(' ');
  return `${start} -> (${move.direction.q},${move.direction.r}) ${move.kind}`;
}

export function applyMove(state, move) {
  if (state.winner) return state;

  const legal = getLegalMovesForSelection(state, move.selection, state.turn)
    .find((m) => directionEq(m.direction, move.direction));

  if (!legal) return state;

  const snapshot = {
    board: new Map(state.board),
    turn: state.turn,
    captured: { ...state.captured },
    winner: state.winner,
    historyEntry: legal
  };

  const { board, ejected } = applyMoveToBoard(state, legal);
  const nextTurn = state.turn === BLACK ? WHITE : BLACK;
  const captured = { ...state.captured };
  if (ejected > 0) captured[state.turn] += ejected;

  const winner = captured[state.turn] >= 6 ? state.turn : null;

  return {
    board,
    turn: winner ? state.turn : nextTurn,
    captured,
    winner,
    history: [...state.history, { text: moveNotation(legal), player: state.turn, ejected, snapshot }]
  };
}

export function undoMove(state) {
  if (!state.history.length) return state;
  const last = state.history[state.history.length - 1];
  const { snapshot } = last;
  return {
    board: new Map(snapshot.board),
    turn: snapshot.turn,
    captured: { ...snapshot.captured },
    winner: snapshot.winner,
    history: state.history.slice(0, -1)
  };
}

export function winnerAtSix(state) {
  if (state.captured[BLACK] >= 6) return BLACK;
  if (state.captured[WHITE] >= 6) return WHITE;
  return null;
}

export { DIRECTIONS };
