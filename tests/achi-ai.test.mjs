import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAYERS,
  createInitialState,
  isMoveLegal,
  applyMove
} from '../assets/js/achi-engine.js';
import { pickAIMove } from '../assets/js/achi-ai.js';

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

test('AI chooses legal moves for both sides across all difficulties', () => {
  const placementState = createInitialState();
  const movementState = makeState({
    board: [
      PLAYERS.WHITE, PLAYERS.BLACK, PLAYERS.WHITE,
      PLAYERS.BLACK, null, PLAYERS.WHITE,
      PLAYERS.BLACK, PLAYERS.WHITE, PLAYERS.BLACK
    ],
    turn: PLAYERS.WHITE
  });

  for (const difficulty of ['Easy', 'Medium', 'Hard']) {
    const whitePlacementMove = pickAIMove(placementState, PLAYERS.WHITE, difficulty);
    const blackPlacementMove = pickAIMove({ ...placementState, turn: PLAYERS.BLACK }, PLAYERS.BLACK, difficulty);
    const whiteMovementMove = pickAIMove(movementState, PLAYERS.WHITE, difficulty);
    const blackMovementMove = pickAIMove({ ...movementState, turn: PLAYERS.BLACK }, PLAYERS.BLACK, difficulty);

    assert.ok(whitePlacementMove, `white placement move missing (${difficulty})`);
    assert.ok(blackPlacementMove, `black placement move missing (${difficulty})`);
    assert.ok(whiteMovementMove, `white movement move missing (${difficulty})`);
    assert.ok(blackMovementMove, `black movement move missing (${difficulty})`);
    assert.ok(isMoveLegal(placementState, whitePlacementMove), `white placement move should be legal (${difficulty})`);
    assert.ok(isMoveLegal({ ...placementState, turn: PLAYERS.BLACK }, blackPlacementMove), `black placement move should be legal (${difficulty})`);
    assert.ok(isMoveLegal(movementState, whiteMovementMove), `white movement move should be legal (${difficulty})`);
    assert.ok(isMoveLegal({ ...movementState, turn: PLAYERS.BLACK }, blackMovementMove), `black movement move should be legal (${difficulty})`);
  }
});

test('hard AI takes an immediate placement win', () => {
  const state = makeState({
    board: [
      PLAYERS.WHITE, PLAYERS.WHITE, null,
      PLAYERS.BLACK, PLAYERS.BLACK, null,
      null, null, null
    ],
    turn: PLAYERS.WHITE
  });

  const move = pickAIMove(state, PLAYERS.WHITE, 'Hard');
  assert.deepEqual(move, { kind: 'place', to: 2, player: PLAYERS.WHITE });
});

test('hard AI blocks an immediate opponent placement win', () => {
  const state = makeState({
    board: [
      PLAYERS.BLACK, PLAYERS.BLACK, null,
      PLAYERS.WHITE, null, null,
      null, PLAYERS.WHITE, null
    ],
    turn: PLAYERS.WHITE
  });

  const move = pickAIMove(state, PLAYERS.WHITE, 'Hard');
  assert.equal(move.to, 2);
  assert.ok(isMoveLegal(state, move));
});

test('hard AI converts an immediate movement win', () => {
  const state = makeState({
    board: [
      PLAYERS.WHITE, PLAYERS.BLACK, PLAYERS.BLACK,
      PLAYERS.BLACK, PLAYERS.WHITE, PLAYERS.WHITE,
      PLAYERS.BLACK, PLAYERS.WHITE, null
    ],
    turn: PLAYERS.WHITE
  });

  const move = pickAIMove(state, PLAYERS.WHITE, 'Hard');
  assert.deepEqual(move, { kind: 'move', from: 5, to: 8, player: PLAYERS.WHITE });
});

test('AI move can always be applied without throwing', () => {
  let state = createInitialState();

  for (let index = 0; index < 10; index += 1) {
    const side = state.turn;
    const move = pickAIMove(state, side, 'Medium');

    if (!move) {
      assert.ok(state.winner);
      break;
    }

    assert.doesNotThrow(() => {
      state = applyMove(state, move);
    });

    if (state.winner) break;
  }
});
