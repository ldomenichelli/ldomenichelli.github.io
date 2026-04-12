import test from 'node:test';
import assert from 'node:assert/strict';
import {
  START_MARKER,
  PHASES,
  WALL_PATTERN,
  createInitialState,
  getDraftOptions,
  getPlacementOptions,
  getLegalMoves,
  applyMove,
  getWallColumnForColor,
  computeEndgameBonus
} from '../assets/js/azul-engine.js';

function makeState(overrides = {}) {
  const state = createInitialState({
    playerCount: 2,
    bag: [],
    seed: 1
  });

  state.bag = [];
  state.discard = [];
  state.factories = Array.from({ length: 5 }, () => []);
  state.center = {
    tiles: [],
    hasStartMarker: true
  };
  state.turn = 0;
  state.currentStartPlayer = 0;
  state.nextStartPlayer = 0;
  state.round = 1;
  state.phase = PHASES.OFFER;
  state.history = [];
  state.lastRoundSummary = null;
  state.winnerIndices = [];
  state.tieBreak = 'score';

  return {
    ...state,
    ...overrides
  };
}

function setWallTile(player, row, color) {
  const column = getWallColumnForColor(row, color);
  player.wall[row][column] = color;
}

test('2-player setup uses 5 factories and deals 20 tiles', () => {
  const state = createInitialState({ playerCount: 2, seed: 3 });

  assert.equal(state.factories.length, 5);
  assert.ok(state.factories.every((factory) => factory.length === 4));
  assert.equal(state.bag.length, 80);
  assert.equal(state.players.length, 2);
  assert.equal(state.center.hasStartMarker, true);
});

test('taking a color from a factory moves leftovers to the center', () => {
  const state = makeState({
    factories: [
      ['COBALT', 'COBALT', 'AMBER', 'ONYX'],
      [],
      [],
      [],
      []
    ],
    center: {
      tiles: [],
      hasStartMarker: true
    }
  });

  const move = getLegalMoves(state, 0).find((candidate) =>
    candidate.draft.source.kind === 'FACTORY' &&
    candidate.draft.source.index === 0 &&
    candidate.draft.color === 'COBALT' &&
    candidate.destination.kind === 'PATTERN_LINE' &&
    candidate.destination.row === 4
  );

  const next = applyMove(state, move);

  assert.deepEqual(next.factories[0], []);
  assert.deepEqual(next.center.tiles.sort(), ['AMBER', 'ONYX']);
  assert.equal(next.players[0].patternLines[4].color, 'COBALT');
  assert.equal(next.players[0].patternLines[4].filled, 2);
  assert.equal(next.turn, 1);
});

test('first player to draft from the center takes the start marker into the floor line', () => {
  const state = makeState({
    factories: [['COBALT'], [], [], [], []],
    center: {
      tiles: ['AMBER', 'AMBER'],
      hasStartMarker: true
    }
  });

  const move = getLegalMoves(state, 0).find((candidate) =>
    candidate.draft.source.kind === 'CENTER' &&
    candidate.draft.color === 'AMBER' &&
    candidate.destination.kind === 'PATTERN_LINE' &&
    candidate.destination.row === 1
  );

  const next = applyMove(state, move);

  assert.equal(next.center.hasStartMarker, false);
  assert.equal(next.nextStartPlayer, 0);
  assert.equal(next.firstPlayerClaimedBy, 0);
  assert.deepEqual(next.players[0].floor, [START_MARKER]);
});

test('pattern line placement blocks mixed colors and wall duplicates', () => {
  const state = makeState({
    players: makeState().players.map((player, index) => {
      if (index !== 0) return player;
      player.patternLines[2].color = 'COBALT';
      player.patternLines[2].filled = 1;
      setWallTile(player, 0, 'AMBER');
      return player;
    }),
    factories: [
      ['AMBER', 'AMBER'],
      [],
      [],
      [],
      []
    ],
    center: {
      tiles: [],
      hasStartMarker: true
    }
  });

  const amberDraft = getDraftOptions(state, 0).find((draft) =>
    draft.source.kind === 'FACTORY' &&
    draft.source.index === 0 &&
    draft.color === 'AMBER'
  );
  const placements = getPlacementOptions(state, 0, amberDraft);
  const topRow = placements.find((option) => option.destination.kind === 'PATTERN_LINE' && option.destination.row === 0);
  const thirdRow = placements.find((option) => option.destination.kind === 'PATTERN_LINE' && option.destination.row === 2);
  const floor = placements.find((option) => option.destination.kind === 'FLOOR');

  assert.equal(topRow.isLegal, false);
  assert.match(topRow.reason, /already fixed/i);
  assert.equal(thirdRow.isLegal, false);
  assert.match(thirdRow.reason, /already holds/i);
  assert.equal(floor.isLegal, true);
});

test('overflow tiles go to the floor and floor penalties do not drop below zero', () => {
  const state = makeState({
    players: makeState().players.map((player, index) => {
      if (index !== 0) return player;
      player.score = 1;
      return player;
    }),
    factories: [
      ['COBALT', 'COBALT', 'COBALT'],
      [],
      [],
      [],
      []
    ],
    center: {
      tiles: [],
      hasStartMarker: false
    }
  });

  const move = getLegalMoves(state, 0).find((candidate) =>
    candidate.draft.source.kind === 'FACTORY' &&
    candidate.draft.color === 'COBALT' &&
    candidate.destination.kind === 'PATTERN_LINE' &&
    candidate.destination.row === 0
  );

  const next = applyMove(state, move);

  assert.equal(next.players[0].score, 0);
  assert.equal(next.players[0].wall[0][getWallColumnForColor(0, 'COBALT')], 'COBALT');
  assert.deepEqual(next.players[0].floor, []);
  assert.equal(next.lastRoundSummary.playerSummaries[0].floorPenalty, -2);
});

test('wall-tiling scores horizontal and vertical adjacency', () => {
  const seededPlayers = makeState().players;
  const player = seededPlayers[0];

  setWallTile(player, 2, 'PEARL');
  setWallTile(player, 2, 'AMBER');
  setWallTile(player, 1, 'AMBER');
  player.patternLines[2].color = 'COBALT';
  player.patternLines[2].filled = 3;

  const state = makeState({
    players: seededPlayers,
    factories: [['TERRACOTTA'], [], [], [], []],
    center: {
      tiles: [],
      hasStartMarker: false
    }
  });

  const move = getLegalMoves(state, 0).find((candidate) =>
    candidate.draft.color === 'TERRACOTTA' &&
    candidate.destination.kind === 'PATTERN_LINE' &&
    candidate.destination.row === 4
  );

  const next = applyMove(state, move);
  const placement = next.lastRoundSummary.playerSummaries[0].placements.find((item) => item.row === 2);

  assert.equal(placement.scoreGain, 5);
  assert.deepEqual(placement.adjacency, { horizontal: 3, vertical: 2 });
  assert.equal(next.players[0].score, 5);
});

test('end-of-round preparation refills factories from the bag and discard', () => {
  const state = makeState({
    bag: ['COBALT', 'AMBER', 'PEARL', 'ONYX'],
    discard: ['TERRACOTTA', 'TERRACOTTA', 'AMBER', 'PEARL', 'ONYX', 'COBALT'],
    factories: [['COBALT'], [], [], [], []],
    center: {
      tiles: [],
      hasStartMarker: false
    }
  });

  const move = getLegalMoves(state, 0).find((candidate) =>
    candidate.draft.color === 'COBALT' &&
    candidate.destination.kind === 'PATTERN_LINE' &&
    candidate.destination.row === 4
  );

  const next = applyMove(state, move);
  const dealtTiles = next.factories.reduce((total, factory) => total + factory.length, 0);

  assert.equal(next.round, 2);
  assert.equal(next.turn, 0);
  assert.equal(next.center.hasStartMarker, true);
  assert.equal(dealtTiles, 10);
  assert.equal(next.bag.length + next.discard.length + dealtTiles, 10);
});

test('completing a wall row triggers the end of the game', () => {
  const seededPlayers = makeState().players;
  const player = seededPlayers[0];

  for (const color of WALL_PATTERN[0].slice(0, 4)) {
    setWallTile(player, 0, color);
  }
  player.patternLines[0].color = 'PEARL';
  player.patternLines[0].filled = 1;

  const state = makeState({
    players: seededPlayers,
    factories: [['COBALT'], [], [], [], []],
    center: {
      tiles: [],
      hasStartMarker: false
    }
  });

  const move = getLegalMoves(state, 0).find((candidate) =>
    candidate.draft.color === 'COBALT' &&
    candidate.destination.kind === 'PATTERN_LINE' &&
    candidate.destination.row === 4
  );

  const next = applyMove(state, move);

  assert.equal(next.phase, PHASES.GAME_OVER);
  assert.deepEqual(next.winnerIndices, [0]);
});

test('endgame bonus helper scores rows, columns, and color sets', () => {
  const player = makeState().players[0];

  for (const color of WALL_PATTERN[0]) {
    setWallTile(player, 0, color);
  }
  for (let row = 0; row < 5; row += 1) {
    setWallTile(player, row, WALL_PATTERN[row][0]);
    setWallTile(player, row, 'COBALT');
  }

  const bonus = computeEndgameBonus(player);

  assert.equal(bonus.rows, 1);
  assert.equal(bonus.columns, 1);
  assert.equal(bonus.colors, 1);
  assert.equal(bonus.points, 19);
});

test('tie-break favors the tied player with more complete rows', () => {
  const players = makeState().players;
  const player0 = players[0];
  const player1 = players[1];

  for (const color of WALL_PATTERN[0].slice(0, 4)) {
    setWallTile(player0, 0, color);
  }
  player0.patternLines[0].color = 'PEARL';
  player0.patternLines[0].filled = 1;
  player0.score = 5;
  player1.score = 12;

  const state = makeState({
    players,
    factories: [['COBALT'], [], [], [], []],
    center: {
      tiles: [],
      hasStartMarker: false
    }
  });

  const move = getLegalMoves(state, 0).find((candidate) =>
    candidate.draft.color === 'COBALT' &&
    candidate.destination.kind === 'PATTERN_LINE' &&
    candidate.destination.row === 4
  );

  const next = applyMove(state, move);

  assert.deepEqual(next.winnerIndices, [0]);
  assert.equal(next.tieBreak, 'rows');
  assert.equal(next.players[0].score, next.players[1].score);
});
