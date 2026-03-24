import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYERS, createInitialState } from '../assets/js/achi-engine.js';
import { MODE, computeUndoResult } from '../assets/js/achi-session.js';

function makeGame(overrides = {}) {
  return createInitialState({
    board: Array(9).fill(null),
    turn: PLAYERS.WHITE,
    winner: null,
    winningLine: null,
    history: [],
    ...overrides
  });
}

test('HVC undo rewinds to the latest human turn when possible', () => {
  const s0 = makeGame({ turn: PLAYERS.WHITE });
  const s1 = makeGame({ turn: PLAYERS.BLACK });
  const s2 = makeGame({ turn: PLAYERS.WHITE });

  const result = computeUndoResult({
    mode: MODE.HVC,
    humanSide: PLAYERS.WHITE,
    snapshots: [s0, s1, s2],
    currentGame: makeGame({ turn: PLAYERS.BLACK })
  });

  assert.equal(result.game.turn, PLAYERS.WHITE);
  assert.equal(result.snapshots.length, 2);
});

test('HVC undo restores the pre-AI opening state when the human plays black', () => {
  const initial = makeGame({ turn: PLAYERS.WHITE });
  const afterOpening = makeGame({ turn: PLAYERS.BLACK });

  const result = computeUndoResult({
    mode: MODE.HVC,
    humanSide: PLAYERS.BLACK,
    snapshots: [initial],
    currentGame: afterOpening
  });

  assert.equal(result.game.turn, PLAYERS.WHITE);
  assert.equal(result.snapshots.length, 0);
});

test('HVH undo pops exactly one snapshot', () => {
  const s0 = makeGame({ turn: PLAYERS.WHITE });
  const s1 = makeGame({ turn: PLAYERS.BLACK });

  const result = computeUndoResult({
    mode: MODE.HVH,
    humanSide: PLAYERS.WHITE,
    snapshots: [s0, s1],
    currentGame: makeGame({ turn: PLAYERS.WHITE })
  });

  assert.equal(result.game.turn, PLAYERS.BLACK);
  assert.equal(result.snapshots.length, 1);
});
