export const PLAYERS = Object.freeze({
  RED: 'RED',
  BLUE: 'BLUE'
});

export const ORIENTATIONS = Object.freeze({
  FW: 'FW',
  BW: 'BW'
});

export const MOVE_TYPES = Object.freeze({
  PLACE: 'place',
  TOGGLE: 'toggle'
});

const FILES = 'abcdefghijklmnopqrstuvwxyz'.split('');

function freezeCells(cells) {
  cells.forEach((cell) => Object.freeze(cell.vertices));
  cells.forEach(Object.freeze);
  return Object.freeze(cells);
}

function range(start, endInclusive) {
  return Array.from({ length: endInclusive - start + 1 }, (_, index) => start + index);
}

function vertexId(x, y) {
  return `${x},${y}`;
}

function createCell(gridSize, center, row, col) {
  const file = FILES[col];
  const rank = gridSize - row;
  const key = `${file}${rank}`;
  return {
    key,
    file,
    rank,
    row,
    col,
    gridRow: row + 1,
    gridCol: col + 1,
    centerDistance: Math.abs(col - center) + Math.abs(row - center),
    vertices: {
      nw: vertexId(col, row),
      ne: vertexId(col + 1, row),
      se: vertexId(col + 1, row + 1),
      sw: vertexId(col, row + 1)
    }
  };
}

function createVariant({ name, title, gridSize, playRadius }) {
  const center = (gridSize - 1) / 2;
  const goalStart = center - 1;
  const goalEnd = center + 1;
  const cells = [];

  for (let row = 0; row < gridSize; row += 1) {
    for (let col = 0; col < gridSize; col += 1) {
      if (Math.abs(col - center) + Math.abs(row - center) > playRadius) continue;
      cells.push(createCell(gridSize, center, row, col));
    }
  }

  const cellMap = Object.fromEntries(cells.map((cell) => [cell.key, cell]));
  const rows = Array.from({ length: gridSize }, () => []);

  cells.forEach((cell) => rows[cell.row].push(cell.key));
  rows.forEach(Object.freeze);

  const topCells = cells.filter((cell) => cell.row === 0 && cell.col >= goalStart && cell.col <= goalEnd).map((cell) => cell.key);
  const bottomCells = cells.filter((cell) => cell.row === gridSize - 1 && cell.col >= goalStart && cell.col <= goalEnd).map((cell) => cell.key);
  const leftCells = cells.filter((cell) => cell.col === 0 && cell.row >= goalStart && cell.row <= goalEnd).map((cell) => cell.key);
  const rightCells = cells.filter((cell) => cell.col === gridSize - 1 && cell.row >= goalStart && cell.row <= goalEnd).map((cell) => cell.key);

  const goalVertices = Object.freeze({
    top: Object.freeze(range(goalStart, goalEnd + 1).map((col) => vertexId(col, 0))),
    bottom: Object.freeze(range(goalStart, goalEnd + 1).map((col) => vertexId(col, gridSize))),
    left: Object.freeze(range(goalStart, goalEnd + 1).map((row) => vertexId(0, row))),
    right: Object.freeze(range(goalStart, goalEnd + 1).map((row) => vertexId(gridSize, row)))
  });

  const goalCells = Object.freeze({
    top: Object.freeze(topCells),
    bottom: Object.freeze(bottomCells),
    left: Object.freeze(leftCells),
    right: Object.freeze(rightCells)
  });

  const goalCellsByPlayer = Object.freeze({
    [PLAYERS.BLUE]: Object.freeze([...topCells, ...bottomCells]),
    [PLAYERS.RED]: Object.freeze([...leftCells, ...rightCells])
  });

  const forbiddenCellsByPlayer = Object.freeze({
    [PLAYERS.BLUE]: Object.freeze([...leftCells, ...rightCells]),
    [PLAYERS.RED]: Object.freeze([...topCells, ...bottomCells])
  });

  const vertexToCells = new Map();

  cells.forEach((cell) => {
    Object.values(cell.vertices).forEach((vertex) => {
      if (!vertexToCells.has(vertex)) vertexToCells.set(vertex, new Set());
      vertexToCells.get(vertex).add(cell.key);
    });
  });

  const neighborsByCell = {};

  cells.forEach((cell) => {
    const neighborSet = new Set();
    Object.values(cell.vertices).forEach((vertex) => {
      vertexToCells.get(vertex)?.forEach((candidate) => {
        if (candidate !== cell.key) neighborSet.add(candidate);
      });
    });
    neighborsByCell[cell.key] = Object.freeze([...neighborSet]);
  });

  return Object.freeze({
    name,
    title,
    gridSize,
    playRadius,
    playableCellCount: cells.length,
    squareCount: cells.length + 4,
    center,
    goalStart,
    goalEnd,
    cells: freezeCells(cells),
    cellKeys: Object.freeze(cells.map((cell) => cell.key)),
    rows: Object.freeze(rows),
    cellMap: Object.freeze(cellMap),
    goalVertices,
    goalCells,
    goalCellsByPlayer,
    forbiddenCellsByPlayer,
    neighborsByCell: Object.freeze(neighborsByCell)
  });
}

export const BOARD_VARIANTS = Object.freeze({
  alta: createVariant({
    name: 'alta',
    title: 'Alta',
    gridSize: 9,
    playRadius: 5
  }),
  alta2: createVariant({
    name: 'alta2',
    title: 'Alta II',
    gridSize: 11,
    playRadius: 6
  })
});

export const DEFAULT_VARIANT = 'alta';

export function getBoardVariant(name = DEFAULT_VARIANT) {
  return BOARD_VARIANTS[name] ?? BOARD_VARIANTS[DEFAULT_VARIANT];
}

export function cellToCoord(cell, variantName = DEFAULT_VARIANT) {
  const variant = getBoardVariant(variantName);
  return variant.cellMap[cell] ?? null;
}

export function coordToCell(row, col, variantName = DEFAULT_VARIANT) {
  const variant = getBoardVariant(variantName);
  return variant.cells.find((cell) => cell.row === row && cell.col === col)?.key ?? null;
}

export function otherPlayer(player) {
  return player === PLAYERS.RED ? PLAYERS.BLUE : PLAYERS.RED;
}

export function nextOrientation(orientation) {
  return orientation === ORIENTATIONS.FW ? ORIENTATIONS.BW : ORIENTATIONS.FW;
}

export function orientationGlyph(orientation) {
  return orientation === ORIENTATIONS.FW ? '/' : '\\';
}
