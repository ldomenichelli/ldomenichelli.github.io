import test from 'node:test';
import assert from 'node:assert/strict';
import { SIDES, getLegalMoves, isMoveLegal, applyMove } from '../assets/js/adugo-engine.js';
import { pickAIMove } from '../assets/js/adugo-ai.js';

function state(overrides = {}) {
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

test('AI always picks legal jaguar move', () => {
  const s = state();
  const move = pickAIMove(s, SIDES.JAGUAR, 'Hard');
  assert.ok(move);
  assert.ok(isMoveLegal(s, move));
});

test('AI always picks legal dogs move', () => {
  const s = state({ turn: SIDES.DOGS });
  const move = pickAIMove(s, SIDES.DOGS, 'Medium');
  assert.ok(move);
  assert.ok(isMoveLegal(s, move));
});

test('AI returns legal move for all difficulty levels and both sides', () => {
  for (const difficulty of ['Easy', 'Medium', 'Hard']) {
    const jaguarState = state({ turn: SIDES.JAGUAR });
    const dogsState = state({ turn: SIDES.DOGS });

    const jaguarMove = pickAIMove(jaguarState, SIDES.JAGUAR, difficulty);
    const dogsMove = pickAIMove(dogsState, SIDES.DOGS, difficulty);

    assert.ok(jaguarMove, `jaguar move missing (${difficulty})`);
    assert.ok(dogsMove, `dogs move missing (${difficulty})`);
    assert.ok(isMoveLegal(jaguarState, jaguarMove), `illegal jaguar move (${difficulty})`);
    assert.ok(isMoveLegal(dogsState, dogsMove), `illegal dogs move (${difficulty})`);
  }
});

test('AI handles terminal or no-move positions', () => {
  const terminal = state({ winner: SIDES.DOGS });
  assert.equal(pickAIMove(terminal, SIDES.JAGUAR, 'Easy'), null);

  const noMoves = state({
    jaguar: 12,
    dogs: [6, 7, 8, 11, 13, 16, 17, 18, 0, 2, 4, 10, 14, 20, 22, 24],
    turn: SIDES.JAGUAR
  });
  assert.equal(getLegalMoves(noMoves).length, 0);
  assert.equal(pickAIMove(noMoves, SIDES.JAGUAR, 'Medium'), null);
});

test('AI move can always be applied without throwing illegal move errors', () => {
  let s = state();
  for (let i = 0; i < 8; i += 1) {
    const side = s.turn;
    const move = pickAIMove(s, side, 'Medium');
    assert.ok(move);
    assert.doesNotThrow(() => {
      s = applyMove(s, move);
    });
    if (s.winner) break;
  }
});
