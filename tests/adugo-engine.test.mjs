import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SIDES,
  GAME_CONFIG,
  ADJACENCY,
  createInitialState,
  getLegalMoves,
  getLegalJaguarCaptures,
  applyMove,
  isMoveLegal,
  detectWinner
} from '../assets/js/adugo-engine.js';

function makeState(overrides = {}) {
  return {
    jaguar: 12,
    dogs: [6, 7, 11, 13, 17],
    capturedDogs: 0,
    turn: SIDES.JAGUAR,
    winner: null,
    moveNumber: 1,
    chainCaptureFrom: null,
    history: [],
    ...overrides
  };
}

test('graph adjacency is symmetric and non-empty', () => {
  for (const [node, neighbors] of ADJACENCY.entries()) {
    assert.ok(neighbors.length > 0, `node ${node} should have neighbors`);
    for (const n of neighbors) {
      assert.ok(ADJACENCY.get(n).includes(node), `adjacency should be symmetric: ${node}<->${n}`);
    }
  }
});


test('configured variant starts with 14 dogs and jaguar target matches full capture', () => {
  const initial = createInitialState();
  assert.equal(initial.dogs.length, 14);
  assert.equal(GAME_CONFIG.jaguarCaptureTarget, 14);
});

test('dogs have only step moves and cannot capture', () => {
  const state = makeState({
    turn: SIDES.DOGS,
    jaguar: 12,
    dogs: [6, 7, 8]
  });
  const moves = getLegalMoves(state, SIDES.DOGS);
  assert.ok(moves.length > 0);
  assert.ok(moves.every((m) => m.type === 'move'));
});

test('jaguar capture requires valid empty landing node', () => {
  const captureState = makeState({
    jaguar: 12,
    dogs: [7]
  });
  const captures = getLegalJaguarCaptures(captureState);
  assert.ok(captures.some((m) => m.from === 12 && m.over === 7 && m.to === 2));

  const blockedLandingState = makeState({
    jaguar: 12,
    dogs: [7, 2]
  });
  const blocked = getLegalJaguarCaptures(blockedLandingState);
  assert.ok(!blocked.some((m) => m.over === 7 && m.to === 2));
});

test('multi-jump capture chain is generated and applied', () => {
  let state = makeState({
    jaguar: 12,
    dogs: [7, 3],
    turn: SIDES.JAGUAR
  });

  const first = getLegalJaguarCaptures(state).find((m) => m.from === 12 && m.to === 2);
  assert.ok(first);

  state = applyMove(state, first);
  assert.equal(state.turn, SIDES.JAGUAR);
  assert.equal(state.chainCaptureFrom, 2);
  assert.equal(state.capturedDogs, 1);

  const secondOptions = getLegalMoves(state);
  const second = secondOptions.find((m) => m.type === 'capture');
  assert.ok(second);

  state = applyMove(state, second);
  assert.equal(state.capturedDogs, 2);
  assert.equal(state.chainCaptureFrom, null);
  assert.equal(state.turn, SIDES.DOGS);
});

test('trap detection awards dogs win when jaguar has no legal move', () => {
  const trapped = makeState({
    jaguar: 12,
    dogs: [6, 7, 8, 11, 13, 16, 17, 18, 0, 2, 4, 10, 14, 20, 22, 24],
    turn: SIDES.JAGUAR
  });
  assert.equal(getLegalMoves(trapped, SIDES.JAGUAR).length, 0);
  assert.equal(detectWinner(trapped), SIDES.DOGS);
});

test('win detection uses configured jaguar capture threshold', () => {
  const almost = makeState({ capturedDogs: GAME_CONFIG.jaguarCaptureTarget - 1 });
  assert.equal(detectWinner(almost), null);

  const win = makeState({ capturedDogs: GAME_CONFIG.jaguarCaptureTarget });
  assert.equal(detectWinner(win), SIDES.JAGUAR);
});

test('applyMove rejects illegal move', () => {
  const state = createInitialState();
  const illegal = { from: state.jaguar, to: state.jaguar, type: 'move' };
  assert.equal(isMoveLegal(state, illegal), false);
  assert.throws(() => applyMove(state, illegal));
});
