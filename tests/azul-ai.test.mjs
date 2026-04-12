import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, getLegalMoves, isMoveLegal } from '../assets/js/azul-engine.js';
import { chooseAIMove } from '../assets/js/azul-ai.js';

test('Azul AI always returns a legal move on the opening position', () => {
  const state = createInitialState({ playerCount: 2, seed: 11 });
  const move = chooseAIMove(state, state.turn, 'Hard');

  assert.ok(move);
  assert.equal(isMoveLegal(state, move, state.turn), true);
});

test('Azul AI respects constrained center drafts', () => {
  const state = createInitialState({ playerCount: 2, bag: [], seed: 2 });

  state.factories = [[], [], [], [], []];
  state.center = {
    tiles: ['ONYX', 'ONYX'],
    hasStartMarker: true
  };
  state.players[0].patternLines[0].color = 'COBALT';
  state.players[0].patternLines[0].filled = 1;
  state.players[0].patternLines[1].color = 'TERRACOTTA';
  state.players[0].patternLines[1].filled = 1;
  state.players[0].patternLines[2].color = 'AMBER';
  state.players[0].patternLines[2].filled = 2;
  state.players[0].patternLines[3].color = 'PEARL';
  state.players[0].patternLines[3].filled = 3;

  const legalMoves = getLegalMoves(state, state.turn);
  const move = chooseAIMove(state, state.turn, 'Medium');

  assert.equal(legalMoves.length, 2);
  assert.ok(move);
  assert.equal(isMoveLegal(state, move, state.turn), true);
});
