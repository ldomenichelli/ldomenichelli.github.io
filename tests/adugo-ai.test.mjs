import test from 'node:test';
import assert from 'node:assert/strict';
import { SIDES, getLegalMoves, isMoveLegal } from '../assets/js/adugo-engine.js';
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
