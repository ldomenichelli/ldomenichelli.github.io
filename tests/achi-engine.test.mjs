import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAYERS,
  PHASES,
  ADJACENCY,
  createInitialState,
  getPhase,
  getLegalMoves,
  isMoveLegal,
  applyMove
} from '../assets/js/achi-engine.js';

function makeState(overrides = {}) {
  return createInitialState({
    board: Array(9).fill(null),
    turn: PLAYERS.WHITE,
    winner: null,
    winningLine: null,
    history: [],
    ...overrides
  });
}

test('graph adjacency is symmetric and non-empty', () => {
  for (const [node, neighbors] of ADJACENCY.entries()) {
    assert.ok(neighbors.length > 0, `node ${node} should have neighbors`);
    for (const neighbor of neighbors) {
      assert.ok(ADJACENCY.get(neighbor).includes(node), `adjacency should be symmetric: ${node}<->${neighbor}`);
    }
  }
});

test('placement alternates correctly and movement starts only after eight pieces are placed', () => {
  const placements = [0, 1, 2, 3, 5, 6, 7, 8];
  let state = createInitialState();

  for (let index = 0; index < placements.length; index += 1) {
    assert.equal(getPhase(state), index < 8 ? PHASES.PLACEMENT : PHASES.MOVEMENT);
    state = applyMove(state, { kind: 'place', to: placements[index] });
    if (state.winner) break;
  }

  assert.equal(state.winner, null);
  assert.equal(getPhase(state), PHASES.MOVEMENT);
  assert.equal(state.turn, PLAYERS.WHITE);
  assert.equal(state.history.length, 8);
});

test('movement only allows adjacent slides and rejects jumps', () => {
  const state = makeState({
    board: [
      PLAYERS.WHITE, PLAYERS.BLACK, PLAYERS.WHITE,
      PLAYERS.BLACK, null, PLAYERS.WHITE,
      PLAYERS.BLACK, PLAYERS.WHITE, PLAYERS.BLACK
    ],
    turn: PLAYERS.WHITE
  });

  assert.equal(getPhase(state), PHASES.MOVEMENT);
  assert.ok(isMoveLegal(state, { kind: 'move', from: 5, to: 4 }));
  assert.equal(isMoveLegal(state, { kind: 'move', from: 0, to: 8 }), false);
  assert.throws(() => applyMove(state, { kind: 'move', from: 0, to: 8 }), /Illegal move/);
});

test('forming three in a row during placement ends the game immediately', () => {
  const state = makeState({
    board: [
      PLAYERS.WHITE, PLAYERS.WHITE, null,
      PLAYERS.BLACK, PLAYERS.BLACK, null,
      null, null, null
    ],
    turn: PLAYERS.WHITE
  });

  const next = applyMove(state, { kind: 'place', to: 2 });
  assert.equal(next.winner, PLAYERS.WHITE);
  assert.deepEqual(next.winningLine, [0, 1, 2]);
});

test('forming three in a row during movement ends the game immediately', () => {
  const state = makeState({
    board: [
      PLAYERS.WHITE, PLAYERS.BLACK, PLAYERS.BLACK,
      PLAYERS.BLACK, PLAYERS.WHITE, PLAYERS.WHITE,
      PLAYERS.BLACK, PLAYERS.WHITE, null
    ],
    turn: PLAYERS.WHITE
  });

  const next = applyMove(state, { kind: 'move', from: 5, to: 8 });
  assert.equal(next.winner, PLAYERS.WHITE);
  assert.deepEqual(next.winningLine, [0, 4, 8]);
});
