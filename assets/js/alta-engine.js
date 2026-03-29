import {
  PLAYERS,
  ORIENTATIONS,
  MOVE_TYPES,
  BOARD_VARIANTS,
  DEFAULT_VARIANT,
  getBoardVariant,
  otherPlayer,
  nextOrientation,
  orientationGlyph
} from './alta-constants.js';

function clonePiece(piece) {
  return piece ? { ...piece } : null;
}

function goalNodeId(side, which) {
  return `goal:${side}:${which}`;
}

function edgeKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function addEdge(adjacency, a, b, info) {
  if (!adjacency.has(a)) adjacency.set(a, []);
  if (!adjacency.has(b)) adjacency.set(b, []);
  adjacency.get(a).push({ to: b, ...info });
  adjacency.get(b).push({ to: a, ...info });
}

function createEmptyGraph(variant) {
  const adjacency = new Map();
  addGoalEdges(adjacency, variant);
  return adjacency;
}

function addGoalEdges(adjacency, variant) {
  variant.goalVertices.top.forEach((vertex) => addEdge(adjacency, goalNodeId(PLAYERS.BLUE, 'start'), vertex, { cost: 0, cell: null }));
  variant.goalVertices.bottom.forEach((vertex) => addEdge(adjacency, goalNodeId(PLAYERS.BLUE, 'end'), vertex, { cost: 0, cell: null }));
  variant.goalVertices.left.forEach((vertex) => addEdge(adjacency, goalNodeId(PLAYERS.RED, 'start'), vertex, { cost: 0, cell: null }));
  variant.goalVertices.right.forEach((vertex) => addEdge(adjacency, goalNodeId(PLAYERS.RED, 'end'), vertex, { cost: 0, cell: null }));
}

function endpointsFor(cellData, orientation) {
  if (orientation === ORIENTATIONS.FW) {
    return [cellData.vertices.sw, cellData.vertices.ne];
  }
  return [cellData.vertices.nw, cellData.vertices.se];
}

function buildCurrentAdjacency(state) {
  const variant = getVariant(state);
  const adjacency = createEmptyGraph(variant);

  state.board.forEach((piece, cell) => {
    const cellData = variant.cellMap[cell];
    if (!cellData) return;
    const [a, b] = endpointsFor(cellData, piece.orientation);
    addEdge(adjacency, a, b, {
      cost: 0,
      cell,
      orientation: piece.orientation,
      owner: piece.owner
    });
  });

  return adjacency;
}

function makeWeightedEdgeOptions(state, side) {
  const variant = getVariant(state);
  const options = [];
  const forbidden = new Set(variant.forbiddenCellsByPlayer[side]);

  variant.cells.forEach((cellData) => {
    const piece = state.board.get(cellData.key) ?? null;
    if (!piece) {
      if (forbidden.has(cellData.key)) return;
      options.push({
        cell: cellData.key,
        orientation: ORIENTATIONS.FW,
        cost: 1
      });
      options.push({
        cell: cellData.key,
        orientation: ORIENTATIONS.BW,
        cost: 1
      });
      return;
    }

    if (piece.owner === side) {
      options.push({
        cell: cellData.key,
        orientation: piece.orientation,
        cost: 0
      });
      options.push({
        cell: cellData.key,
        orientation: nextOrientation(piece.orientation),
        cost: 1
      });
      return;
    }

    options.push({
      cell: cellData.key,
      orientation: piece.orientation,
      cost: 0
    });
  });

  return options;
}

function buildWeightedAdjacency(state, side) {
  const variant = getVariant(state);
  const adjacency = createEmptyGraph(variant);

  makeWeightedEdgeOptions(state, side).forEach((option) => {
    const cellData = variant.cellMap[option.cell];
    const [a, b] = endpointsFor(cellData, option.orientation);
    addEdge(adjacency, a, b, option);
  });

  return adjacency;
}

function shortestPath(adjacency, start, end, weighted = false) {
  if (weighted) {
    const distances = new Map([[start, 0]]);
    const previous = new Map();
    const queue = [{ node: start, cost: 0 }];

    while (queue.length) {
      queue.sort((a, b) => a.cost - b.cost);
      const current = queue.shift();
      if (!current || current.cost > (distances.get(current.node) ?? Infinity)) continue;
      if (current.node === end) break;

      for (const edge of adjacency.get(current.node) ?? []) {
        const nextCost = current.cost + (edge.cost ?? 0);
        if (nextCost >= (distances.get(edge.to) ?? Infinity)) continue;
        distances.set(edge.to, nextCost);
        previous.set(edge.to, { node: current.node, edge });
        queue.push({ node: edge.to, cost: nextCost });
      }
    }

    if (!distances.has(end)) {
      return { found: false, cost: Infinity, cells: [], edges: [] };
    }

    return reconstructPath(previous, start, end, distances.get(end));
  }

  const queue = [start];
  const seen = new Set([start]);
  const previous = new Map();

  while (queue.length) {
    const current = queue.shift();
    if (current === end) break;
    for (const edge of adjacency.get(current) ?? []) {
      if (seen.has(edge.to)) continue;
      seen.add(edge.to);
      previous.set(edge.to, { node: current, edge });
      queue.push(edge.to);
    }
  }

  if (!seen.has(end)) {
    return { found: false, cost: Infinity, cells: [], edges: [] };
  }

  return reconstructPath(previous, start, end, 0);
}

function reconstructPath(previous, start, end, cost) {
  const edges = [];
  const cells = [];
  const cellSeen = new Set();

  let current = end;
  while (current !== start) {
    const step = previous.get(current);
    if (!step) break;
    edges.push(step.edge);
    if (step.edge.cell && !cellSeen.has(step.edge.cell)) {
      cellSeen.add(step.edge.cell);
      cells.push(step.edge.cell);
    }
    current = step.node;
  }

  edges.reverse();
  cells.reverse();

  return {
    found: true,
    cost,
    cells,
    edges
  };
}

function getVariant(state) {
  return getBoardVariant(state.variantName);
}

function moveKey(move) {
  return `${move.type}:${move.cell}:${move.orientation}`;
}

function normalizeMove(state, move, player = state.turn) {
  return getLegalMoves(state, player).find((candidate) => moveKey(candidate) === moveKey(move)) ?? null;
}

function buildHistoryEntry(state, move, player) {
  return {
    moveNumber: state.moveNumber,
    player,
    move: { ...move },
    notation: formatMove(move)
  };
}

export function createInitialState({ variantName = DEFAULT_VARIANT } = {}) {
  return {
    variantName,
    turn: PLAYERS.BLUE,
    winner: null,
    winningPath: [],
    board: new Map(),
    history: [],
    moveNumber: 1,
    lastMove: null
  };
}

export function cloneState(state) {
  return {
    ...state,
    board: new Map([...state.board.entries()].map(([cell, piece]) => [cell, clonePiece(piece)])),
    history: state.history.map((entry) => ({
      ...entry,
      move: { ...entry.move }
    })),
    winningPath: [...(state.winningPath ?? [])],
    lastMove: state.lastMove ? { ...state.lastMove } : null
  };
}

export function getPiece(state, cell) {
  return clonePiece(state.board.get(cell) ?? null);
}

export function getLegalPlacements(state, player = state.turn) {
  if (state.winner) return [];
  const variant = getVariant(state);
  const forbidden = new Set(variant.forbiddenCellsByPlayer[player]);
  const moves = [];

  variant.cellKeys.forEach((cell) => {
    if (state.board.has(cell) || forbidden.has(cell)) return;
    moves.push({ type: MOVE_TYPES.PLACE, cell, orientation: ORIENTATIONS.FW, player });
    moves.push({ type: MOVE_TYPES.PLACE, cell, orientation: ORIENTATIONS.BW, player });
  });

  return moves;
}

export function getLegalToggles(state, player = state.turn) {
  if (state.winner) return [];
  const moves = [];

  state.board.forEach((piece, cell) => {
    if (piece.owner !== player) return;
    moves.push({
      type: MOVE_TYPES.TOGGLE,
      cell,
      orientation: nextOrientation(piece.orientation),
      player
    });
  });

  return moves;
}

export function getLegalMoves(state, player = state.turn) {
  if (state.winner) return [];
  return [...getLegalPlacements(state, player), ...getLegalToggles(state, player)];
}

export function isMoveLegal(state, move, player = state.turn) {
  return Boolean(normalizeMove(state, move, player));
}

export function formatMove(move) {
  if (move.type === MOVE_TYPES.PLACE) {
    return `${move.cell} ${orientationGlyph(move.orientation)}`;
  }
  return `toggle ${move.cell} ${orientationGlyph(move.orientation)}`;
}

export function countSwitches(state, player) {
  let total = 0;
  state.board.forEach((piece) => {
    if (!player || piece.owner === player) total += 1;
  });
  return total;
}

export function findWinningPath(state, side) {
  const adjacency = buildCurrentAdjacency(state);
  const start = goalNodeId(side, 'start');
  const end = goalNodeId(side, 'end');
  const result = shortestPath(adjacency, start, end, false);
  return result.found ? result : null;
}

export function detectWinner(state, mover = null) {
  const redPath = findWinningPath(state, PLAYERS.RED);
  const bluePath = findWinningPath(state, PLAYERS.BLUE);

  if (mover && redPath && bluePath) {
    return mover === PLAYERS.RED
      ? { winner: PLAYERS.RED, winningPath: redPath.cells, redPath, bluePath }
      : { winner: PLAYERS.BLUE, winningPath: bluePath.cells, redPath, bluePath };
  }

  if (redPath) {
    return { winner: PLAYERS.RED, winningPath: redPath.cells, redPath, bluePath };
  }

  if (bluePath) {
    return { winner: PLAYERS.BLUE, winningPath: bluePath.cells, redPath, bluePath };
  }

  return { winner: null, winningPath: [], redPath, bluePath };
}

export function applyMove(state, move) {
  const legalMove = normalizeMove(state, move, state.turn);
  if (!legalMove) {
    throw new Error('Illegal move');
  }

  const next = cloneState(state);
  const player = state.turn;

  if (legalMove.type === MOVE_TYPES.PLACE) {
    next.board.set(legalMove.cell, {
      owner: player,
      orientation: legalMove.orientation
    });
  } else {
    const existing = next.board.get(legalMove.cell);
    if (!existing || existing.owner !== player) {
      throw new Error('Illegal toggle');
    }
    next.board.set(legalMove.cell, {
      owner: player,
      orientation: legalMove.orientation
    });
  }

  next.history.push(buildHistoryEntry(state, legalMove, player));
  next.turn = otherPlayer(player);
  next.moveNumber = state.moveNumber + 1;
  next.lastMove = { ...legalMove, player };

  const result = detectWinner(next, player);
  next.winner = result.winner;
  next.winningPath = result.winningPath;

  return next;
}

export function getMinimumCostPath(state, side) {
  const adjacency = buildWeightedAdjacency(state, side);
  return shortestPath(adjacency, goalNodeId(side, 'start'), goalNodeId(side, 'end'), true);
}

export function serializeState(state) {
  const pieces = [...state.board.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([cell, piece]) => `${cell}:${piece.owner}:${piece.orientation}`)
    .join('|');
  return `${state.variantName}:${state.turn}:${pieces}`;
}

export {
  PLAYERS,
  ORIENTATIONS,
  MOVE_TYPES,
  BOARD_VARIANTS,
  DEFAULT_VARIANT,
  getBoardVariant,
  otherPlayer,
  nextOrientation,
  orientationGlyph
};
