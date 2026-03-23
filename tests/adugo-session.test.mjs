import test from 'node:test';
import assert from 'node:assert/strict';
import { SIDES } from '../assets/js/adugo-engine.js';
import { MODE, computeUndoResult } from '../assets/js/adugo-session.js';

function makeGame(overrides = {}) {
  return {
    jaguar: 12,
    dogs: [0, 1, 2],
    capturedDogs: 0,
    turn: SIDES.JAGUAR,
    winner: null,
    moveNumber: 1,
    chainCaptureFrom: null,
    history: [],
    ...overrides
  };
}

test('HVC undo rewinds to human turn when possible', () => {
  const s0 = makeGame({ turn: SIDES.JAGUAR });
  const s1 = makeGame({ turn: SIDES.DOGS });
  const s2 = makeGame({ turn: SIDES.JAGUAR });

  const result = computeUndoResult({
    mode: MODE.HVC,
    humanSide: SIDES.JAGUAR,
    snapshots: [s0, s1, s2],
    currentGame: makeGame({ turn: SIDES.DOGS })
  });

  assert.equal(result.game.turn, SIDES.JAGUAR);
  assert.equal(result.snapshots.length, 2);
});

test('HVC undo degrades gracefully with limited snapshots', () => {
  const only = makeGame({ turn: SIDES.DOGS });

  const result = computeUndoResult({
    mode: MODE.HVC,
    humanSide: SIDES.JAGUAR,
    snapshots: [only],
    currentGame: makeGame({ turn: SIDES.JAGUAR })
  });

  assert.equal(result.game.turn, SIDES.DOGS);
  assert.equal(result.snapshots.length, 0);
});

test('HVC undo restores pre-AI opening state when human plays dogs', () => {
  const initial = makeGame({ turn: SIDES.JAGUAR, moveNumber: 1 });
  const afterOpening = makeGame({ turn: SIDES.DOGS, moveNumber: 2 });

  const result = computeUndoResult({
    mode: MODE.HVC,
    humanSide: SIDES.DOGS,
    snapshots: [initial],
    currentGame: afterOpening
  });

  assert.equal(result.game.turn, SIDES.JAGUAR);
  assert.equal(result.game.moveNumber, 1);
  assert.equal(result.snapshots.length, 0);
});

test('HVH undo pops exactly one snapshot', () => {
  const s0 = makeGame({ moveNumber: 1 });
  const s1 = makeGame({ moveNumber: 2 });

  const result = computeUndoResult({
    mode: MODE.HVH,
    humanSide: SIDES.JAGUAR,
    snapshots: [s0, s1],
    currentGame: makeGame({ moveNumber: 3 })
  });

  assert.equal(result.game.moveNumber, 2);
  assert.equal(result.snapshots.length, 1);
});
