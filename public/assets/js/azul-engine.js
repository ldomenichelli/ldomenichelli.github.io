export const TILE_COLORS = Object.freeze([
  'COBALT',
  'AMBER',
  'TERRACOTTA',
  'ONYX',
  'PEARL'
]);

export const COLOR_META = Object.freeze({
  COBALT: { label: 'Cobalt' },
  AMBER: { label: 'Amber' },
  TERRACOTTA: { label: 'Terracotta' },
  ONYX: { label: 'Onyx' },
  PEARL: { label: 'Pearl' }
});

export const COLOR_ORDER = Object.freeze({
  COBALT: 0,
  AMBER: 1,
  TERRACOTTA: 2,
  ONYX: 3,
  PEARL: 4
});

export const PHASES = Object.freeze({
  OFFER: 'FACTORY_OFFER',
  GAME_OVER: 'GAME_OVER'
});

export const START_MARKER = 'START_MARKER';

export const FLOOR_PENALTIES = Object.freeze([-1, -1, -2, -2, -2, -3, -3]);

export const PLAYER_COUNT_CONFIG = Object.freeze({
  2: Object.freeze({ factories: 5 }),
  3: Object.freeze({ factories: 7 }),
  4: Object.freeze({ factories: 9 })
});

export const WALL_PATTERN = Object.freeze([
  Object.freeze(['COBALT', 'AMBER', 'TERRACOTTA', 'ONYX', 'PEARL']),
  Object.freeze(['PEARL', 'COBALT', 'AMBER', 'TERRACOTTA', 'ONYX']),
  Object.freeze(['ONYX', 'PEARL', 'COBALT', 'AMBER', 'TERRACOTTA']),
  Object.freeze(['TERRACOTTA', 'ONYX', 'PEARL', 'COBALT', 'AMBER']),
  Object.freeze(['AMBER', 'TERRACOTTA', 'ONYX', 'PEARL', 'COBALT'])
]);

const RNG_A = 1664525;
const RNG_C = 1013904223;
const FLOOR_LIMIT = FLOOR_PENALTIES.length;

function nextSeed(seed) {
  return (Math.imul(seed >>> 0, RNG_A) + RNG_C) >>> 0;
}

function normalizeSeed(seed) {
  const numeric = Number(seed);
  if (!Number.isFinite(numeric)) {
    return (Date.now() >>> 0) || 1;
  }
  return (numeric >>> 0) || 1;
}

function shuffleWithSeed(items, seed) {
  const shuffled = [...items];
  let next = normalizeSeed(seed);

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    next = nextSeed(next);
    const swapIndex = next % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return { items: shuffled, seed: next };
}

function emptyPatternLine(row) {
  return {
    row,
    capacity: row + 1,
    color: null,
    filled: 0
  };
}

function createPlayer(index) {
  return {
    index,
    score: 0,
    patternLines: Array.from({ length: 5 }, (_, row) => emptyPatternLine(row)),
    wall: Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => null)),
    floor: [],
    bonuses: null
  };
}

function clonePatternLine(line) {
  return { ...line };
}

function clonePlayer(player) {
  return {
    ...player,
    patternLines: player.patternLines.map(clonePatternLine),
    wall: player.wall.map((row) => [...row]),
    floor: [...player.floor],
    bonuses: player.bonuses ? { ...player.bonuses } : null
  };
}

function clonePlacementSummary(placement) {
  return {
    ...placement,
    adjacency: { ...placement.adjacency }
  };
}

function cloneRoundSummary(summary) {
  if (!summary) return null;

  return {
    ...summary,
    playerSummaries: summary.playerSummaries.map((playerSummary) => ({
      ...playerSummary,
      placements: playerSummary.placements.map(clonePlacementSummary),
      floorTokens: [...playerSummary.floorTokens]
    })),
    bonuses: summary.bonuses
      ? summary.bonuses.map((bonus) => ({ ...bonus }))
      : []
  };
}

function cloneHistoryEntry(entry) {
  if (entry.type === 'draft') {
    return {
      ...entry,
      draft: {
        ...entry.draft,
        source: { ...entry.draft.source }
      },
      destination: { ...entry.destination }
    };
  }

  if (entry.type === 'round') {
    return {
      ...entry,
      summary: cloneRoundSummary(entry.summary)
    };
  }

  return {
    ...entry,
    bonuses: entry.bonuses ? entry.bonuses.map((bonus) => ({ ...bonus })) : [],
    winners: entry.winners ? [...entry.winners] : []
  };
}

function createBagTiles() {
  const bag = [];
  TILE_COLORS.forEach((color) => {
    for (let count = 0; count < 20; count += 1) {
      bag.push(color);
    }
  });
  return bag;
}

function normalizeBag(inputBag, seed) {
  if (Array.isArray(inputBag)) {
    return { bag: [...inputBag], seed: normalizeSeed(seed) };
  }

  const shuffled = shuffleWithSeed(createBagTiles(), seed);
  return { bag: shuffled.items, seed: shuffled.seed };
}

export function getFactoryCount(playerCount = 2) {
  const config = PLAYER_COUNT_CONFIG[playerCount];
  if (!config) {
    throw new Error(`Unsupported player count: ${playerCount}`);
  }
  return config.factories;
}

function fillFactories(state) {
  state.factories = Array.from({ length: getFactoryCount(state.playerCount) }, () => drawTiles(state, 4));
}

function drawTiles(state, count) {
  const drawn = [];

  while (drawn.length < count) {
    if (!state.bag.length) {
      if (!state.discard.length) break;
      const reshuffled = shuffleWithSeed(state.discard, state.seed);
      state.bag = reshuffled.items;
      state.discard = [];
      state.seed = reshuffled.seed;
    }

    if (!state.bag.length) break;
    drawn.push(state.bag.pop());
  }

  return drawn;
}

export function createInitialState({
  playerCount = 2,
  seed = Date.now(),
  bag = null
} = {}) {
  const normalized = normalizeBag(bag, seed);
  const state = {
    playerCount,
    seed: normalized.seed,
    bag: normalized.bag,
    discard: [],
    factories: [],
    center: {
      tiles: [],
      hasStartMarker: true
    },
    players: Array.from({ length: playerCount }, (_, index) => createPlayer(index)),
    turn: 0,
    currentStartPlayer: 0,
    nextStartPlayer: 0,
    firstPlayerClaimedBy: null,
    round: 1,
    phase: PHASES.OFFER,
    history: [],
    lastRoundSummary: null,
    winnerIndices: [],
    tieBreak: 'score'
  };

  fillFactories(state);
  return state;
}

export function cloneState(state, { includeHistory = true } = {}) {
  return {
    ...state,
    bag: [...state.bag],
    discard: [...state.discard],
    factories: state.factories.map((factory) => [...factory]),
    center: {
      tiles: [...state.center.tiles],
      hasStartMarker: state.center.hasStartMarker
    },
    players: state.players.map(clonePlayer),
    history: includeHistory ? state.history.map(cloneHistoryEntry) : [],
    lastRoundSummary: cloneRoundSummary(state.lastRoundSummary),
    winnerIndices: [...state.winnerIndices]
  };
}

export function otherPlayer(playerIndex) {
  return playerIndex === 0 ? 1 : 0;
}

export function playerLabel(playerIndex) {
  return `Player ${playerIndex + 1}`;
}

export function getWallColumnForColor(row, color) {
  return WALL_PATTERN[row].indexOf(color);
}

export function getFloorPenalty(tokens) {
  const relevant = tokens.slice(0, FLOOR_LIMIT);
  return relevant.reduce((total, _token, index) => total + FLOOR_PENALTIES[index], 0);
}

function sortColors(a, b) {
  return COLOR_ORDER[a] - COLOR_ORDER[b];
}

function summarizeColorCounts(tiles) {
  const counts = new Map();

  tiles.forEach((tile) => {
    counts.set(tile, (counts.get(tile) ?? 0) + 1);
  });

  return [...counts.entries()]
    .sort(([left], [right]) => sortColors(left, right))
    .map(([color, count]) => ({ color, count }));
}

function patternLineReason(player, row, color) {
  const line = player.patternLines[row];

  if (line.filled >= line.capacity) {
    return 'This pattern line is already full.';
  }

  if (line.color && line.color !== color) {
    return `Row ${row + 1} already holds ${COLOR_META[line.color].label.toLowerCase()} tiles.`;
  }

  if (player.wall[row].includes(color)) {
    return `${COLOR_META[color].label} is already fixed in wall row ${row + 1}.`;
  }

  return null;
}

export function getDraftOptions(state, playerIndex = state.turn) {
  if (state.phase !== PHASES.OFFER || state.winnerIndices.length || playerIndex !== state.turn) {
    return [];
  }

  const options = [];

  state.factories.forEach((factory, index) => {
    summarizeColorCounts(factory).forEach(({ color, count }) => {
      options.push({
        source: { kind: 'FACTORY', index },
        color,
        count,
        takesStartMarker: false
      });
    });
  });

  summarizeColorCounts(state.center.tiles).forEach(({ color, count }) => {
    options.push({
      source: { kind: 'CENTER' },
      color,
      count,
      takesStartMarker: state.center.hasStartMarker
    });
  });

  return options;
}

export function getPlacementOptions(state, playerIndex, draftOption) {
  const player = state.players[playerIndex];
  const options = [];

  for (let row = 0; row < 5; row += 1) {
    const line = player.patternLines[row];
    const reason = patternLineReason(player, row, draftOption.color);
    const spaceLeft = Math.max(0, line.capacity - line.filled);
    const placedCount = reason ? 0 : Math.min(spaceLeft, draftOption.count);

    options.push({
      destination: { kind: 'PATTERN_LINE', row },
      isLegal: !reason,
      reason,
      placedCount,
      floorCount: reason ? draftOption.count : draftOption.count - placedCount,
      completesLine: !reason && line.filled + placedCount === line.capacity,
      wallColumn: getWallColumnForColor(row, draftOption.color)
    });
  }

  options.push({
    destination: { kind: 'FLOOR' },
    isLegal: true,
    reason: null,
    placedCount: 0,
    floorCount: draftOption.count,
    completesLine: false,
    wallColumn: null
  });

  return options;
}

function moveKey(move) {
  return [
    move.draft.source.kind,
    move.draft.source.index ?? 'CENTER',
    move.draft.color,
    move.destination.kind,
    move.destination.row ?? 'FLOOR'
  ].join(':');
}

export function getLegalMoves(state, playerIndex = state.turn) {
  return getDraftOptions(state, playerIndex).flatMap((draftOption) =>
    getPlacementOptions(state, playerIndex, draftOption)
      .filter((placement) => placement.isLegal)
      .map((placement) => ({
        draft: {
          source: { ...draftOption.source },
          color: draftOption.color,
          count: draftOption.count,
          takesStartMarker: draftOption.takesStartMarker
        },
        destination: { ...placement.destination },
        placedCount: placement.placedCount,
        floorCount: placement.floorCount,
        completesLine: placement.completesLine,
        wallColumn: placement.wallColumn
      }))
  );
}

export function isMoveLegal(state, move, playerIndex = state.turn) {
  return getLegalMoves(state, playerIndex).some((candidate) => moveKey(candidate) === moveKey(move));
}

function normalizeMove(state, move, playerIndex = state.turn) {
  return getLegalMoves(state, playerIndex).find((candidate) => moveKey(candidate) === moveKey(move)) ?? null;
}

function appendFloorTokens(player, tokens) {
  const room = Math.max(0, FLOOR_LIMIT - player.floor.length);
  const accepted = tokens.slice(0, room);
  const overflow = tokens.slice(room);
  player.floor.push(...accepted);
  return overflow;
}

function takeFactoryTiles(factory, color) {
  const picked = factory.filter((tile) => tile === color);
  const leftover = factory.filter((tile) => tile !== color);
  return { picked, leftover };
}

function isOfferComplete(state) {
  return state.center.tiles.length === 0 && state.factories.every((factory) => factory.length === 0);
}

export function scoreWallPlacement(wall, row, column) {
  let horizontal = 1;
  let vertical = 1;

  for (let left = column - 1; left >= 0 && wall[row][left]; left -= 1) {
    horizontal += 1;
  }
  for (let right = column + 1; right < 5 && wall[row][right]; right += 1) {
    horizontal += 1;
  }
  for (let up = row - 1; up >= 0 && wall[up][column]; up -= 1) {
    vertical += 1;
  }
  for (let down = row + 1; down < 5 && wall[down][column]; down += 1) {
    vertical += 1;
  }

  if (horizontal === 1 && vertical === 1) {
    return {
      points: 1,
      adjacency: {
        horizontal: 1,
        vertical: 1
      }
    };
  }

  return {
    points: (horizontal > 1 ? horizontal : 0) + (vertical > 1 ? vertical : 0),
    adjacency: {
      horizontal,
      vertical
    }
  };
}

function countCompleteRows(player) {
  return player.wall.filter((row) => row.every(Boolean)).length;
}

function countCompleteColumns(player) {
  let complete = 0;

  for (let column = 0; column < 5; column += 1) {
    let isComplete = true;
    for (let row = 0; row < 5; row += 1) {
      if (!player.wall[row][column]) {
        isComplete = false;
        break;
      }
    }
    if (isComplete) complete += 1;
  }

  return complete;
}

function countCompleteColorSets(player) {
  return TILE_COLORS.filter((color) => {
    for (let row = 0; row < 5; row += 1) {
      const column = getWallColumnForColor(row, color);
      if (!player.wall[row][column]) {
        return false;
      }
    }
    return true;
  }).length;
}

export function computeEndgameBonus(player) {
  const rows = countCompleteRows(player);
  const columns = countCompleteColumns(player);
  const colors = countCompleteColorSets(player);

  return {
    rows,
    columns,
    colors,
    points: rows * 2 + columns * 7 + colors * 10
  };
}

function resolvePlayerWallTiling(player) {
  const placements = [];
  const discarded = [];

  for (let row = 0; row < 5; row += 1) {
    const line = player.patternLines[row];
    if (line.filled !== line.capacity || !line.color) continue;

    const column = getWallColumnForColor(row, line.color);
    player.wall[row][column] = line.color;

    const scored = scoreWallPlacement(player.wall, row, column);
    player.score += scored.points;

    placements.push({
      row,
      column,
      color: line.color,
      scoreGain: scored.points,
      adjacency: scored.adjacency
    });

    for (let count = 0; count < line.capacity - 1; count += 1) {
      discarded.push(line.color);
    }

    player.patternLines[row] = emptyPatternLine(row);
  }

  const floorTokens = [...player.floor];
  const floorPenalty = getFloorPenalty(floorTokens);
  player.score = Math.max(0, player.score + floorPenalty);
  discarded.push(...floorTokens.filter((token) => token !== START_MARKER));
  player.floor = [];

  return {
    player,
    discarded,
    summary: {
      player: player.index,
      placements,
      floorPenalty,
      floorTokens,
      scoreAfter: player.score,
      rowsComplete: countCompleteRows(player),
      columnsComplete: countCompleteColumns(player),
      colorsComplete: countCompleteColorSets(player)
    }
  };
}

function triggerEndgame(state, roundSummary, recordHistory) {
  const bonuses = state.players.map((player) => {
    const bonus = computeEndgameBonus(player);
    player.score += bonus.points;
    player.bonuses = bonus;
    return {
      player: player.index,
      ...bonus
    };
  });

  const topScore = Math.max(...state.players.map((player) => player.score));
  let winners = state.players.filter((player) => player.score === topScore).map((player) => player.index);
  let tieBreak = 'score';

  if (winners.length > 1) {
    const mostRows = Math.max(...winners.map((index) => countCompleteRows(state.players[index])));
    winners = winners.filter((index) => countCompleteRows(state.players[index]) === mostRows);
    tieBreak = winners.length === 1 ? 'rows' : 'shared';
  }

  state.phase = PHASES.GAME_OVER;
  state.winnerIndices = winners;
  state.tieBreak = tieBreak;
  roundSummary.bonuses = bonuses;

  if (recordHistory) {
    state.history.push({
      type: 'gameover',
      round: state.round,
      winners: [...winners],
      tieBreak,
      bonuses: bonuses.map((bonus) => ({ ...bonus }))
    });
  }
}

function resolveRound(state, { recordHistory }) {
  const roundSummary = {
    round: state.round,
    nextStartPlayer: state.nextStartPlayer,
    playerSummaries: [],
    bonuses: []
  };

  state.players.forEach((player) => {
    const resolved = resolvePlayerWallTiling(player);
    state.discard.push(...resolved.discarded);
    roundSummary.playerSummaries.push(resolved.summary);
  });

  state.lastRoundSummary = roundSummary;

  if (recordHistory) {
    state.history.push({
      type: 'round',
      round: state.round,
      summary: cloneRoundSummary(roundSummary)
    });
  }

  const endTriggered = state.players.some((player) => countCompleteRows(player) > 0);
  if (endTriggered) {
    triggerEndgame(state, roundSummary, recordHistory);
    return;
  }

  state.round += 1;
  state.currentStartPlayer = state.nextStartPlayer;
  state.turn = state.currentStartPlayer;
  state.nextStartPlayer = state.currentStartPlayer;
  state.firstPlayerClaimedBy = null;
  state.center = {
    tiles: [],
    hasStartMarker: true
  };
  fillFactories(state);
}

function recordDraftHistory(state, playerIndex, move) {
  state.history.push({
    type: 'draft',
    round: state.round,
    player: playerIndex,
    draft: {
      source: { ...move.draft.source },
      color: move.draft.color,
      count: move.draft.count,
      takesStartMarker: move.draft.takesStartMarker
    },
    destination: { ...move.destination },
    placedCount: move.placedCount,
    floorCount: move.floorCount
  });
}

export function applyMove(state, move, { recordHistory = true } = {}) {
  if (state.phase !== PHASES.OFFER) {
    throw new Error('Azul moves can only be applied during the factory-offer phase.');
  }

  const legal = normalizeMove(state, move, state.turn);
  if (!legal) {
    throw new Error('Illegal Azul move.');
  }

  const next = cloneState(state, { includeHistory: recordHistory });
  const player = next.players[next.turn];

  if (legal.draft.source.kind === 'FACTORY') {
    const sourceFactory = next.factories[legal.draft.source.index];
    const taken = takeFactoryTiles(sourceFactory, legal.draft.color);
    next.factories[legal.draft.source.index] = [];
    next.center.tiles.push(...taken.leftover);
  } else {
    next.center.tiles = next.center.tiles.filter((tile) => tile !== legal.draft.color);
    if (next.center.hasStartMarker) {
      next.center.hasStartMarker = false;
      next.nextStartPlayer = next.turn;
      next.firstPlayerClaimedBy = next.turn;
      appendFloorTokens(player, [START_MARKER]);
    }
  }

  if (legal.destination.kind === 'PATTERN_LINE') {
    const line = player.patternLines[legal.destination.row];
    line.color = legal.draft.color;
    line.filled += legal.placedCount;
  }

  if (legal.floorCount > 0) {
    const floorOverflow = appendFloorTokens(player, Array.from({ length: legal.floorCount }, () => legal.draft.color));
    next.discard.push(...floorOverflow);
  }

  if (recordHistory) {
    recordDraftHistory(next, next.turn, legal);
  }

  next.turn = (next.turn + 1) % next.playerCount;
  next.lastRoundSummary = null;

  if (isOfferComplete(next)) {
    resolveRound(next, { recordHistory });
  }

  return next;
}

export function formatDraftHistory(entry, {
  humanPlayerIndex = null,
  computerPlayerIndex = null
} = {}) {
  const actor = entry.player === computerPlayerIndex
    ? 'Computer'
    : entry.player === humanPlayerIndex
      ? 'You'
      : playerLabel(entry.player);
  const source = entry.draft.source.kind === 'FACTORY'
    ? `Factory ${entry.draft.source.index + 1}`
    : 'Center';
  const destination = entry.destination.kind === 'PATTERN_LINE'
    ? `line ${entry.destination.row + 1}`
    : 'floor';
  const floorSuffix = entry.floorCount > 0 ? ` (+${entry.floorCount} floor)` : '';
  const markerSuffix = entry.draft.takesStartMarker ? ' + first-player marker' : '';

  return `${actor} took ${entry.draft.count} ${COLOR_META[entry.draft.color].label.toLowerCase()} from ${source} -> ${destination}${floorSuffix}${markerSuffix}`;
}

export function formatRoundSummary(roundSummary, {
  humanPlayerIndex = null,
  computerPlayerIndex = null
} = {}) {
  return roundSummary.playerSummaries.map((playerSummary) => {
    const actor = playerSummary.player === computerPlayerIndex
      ? 'Computer'
      : playerSummary.player === humanPlayerIndex
        ? 'You'
        : playerLabel(playerSummary.player);
    const placementScore = playerSummary.placements.reduce((total, placement) => total + placement.scoreGain, 0);
    const placementBits = playerSummary.placements.length
      ? `${playerSummary.placements.length} wall placement${playerSummary.placements.length === 1 ? '' : 's'} for +${placementScore}`
      : 'no completed lines';
    const penaltyBits = playerSummary.floorPenalty < 0 ? `, floor ${playerSummary.floorPenalty}` : '';
    return `${actor}: ${placementBits}${penaltyBits}`;
  }).join(' | ');
}

export function getSupplyCounts(state) {
  const counts = Object.fromEntries(TILE_COLORS.map((color) => [color, 0]));

  const add = (tile) => {
    if (tile === START_MARKER || !counts[tile] && counts[tile] !== 0) return;
    counts[tile] += 1;
  };

  state.bag.forEach(add);
  state.discard.forEach(add);
  state.center.tiles.forEach(add);
  state.factories.forEach((factory) => factory.forEach(add));
  state.players.forEach((player) => {
    player.patternLines.forEach((line) => {
      for (let count = 0; count < line.filled; count += 1) {
        add(line.color);
      }
    });
    player.floor.forEach(add);
  });

  return counts;
}

export function serializeState(state) {
  return JSON.stringify({
    playerCount: state.playerCount,
    bag: state.bag,
    discard: state.discard,
    factories: state.factories,
    center: state.center,
    players: state.players,
    turn: state.turn,
    currentStartPlayer: state.currentStartPlayer,
    nextStartPlayer: state.nextStartPlayer,
    round: state.round,
    phase: state.phase,
    winnerIndices: state.winnerIndices
  });
}
