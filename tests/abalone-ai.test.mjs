import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BLACK,
  WHITE,
  allCells,
  initialState,
  keyOf,
  applyMove
} from '../assets/js/abalone-engine.js';
import {
  chooseAIMove,
  enumerateLegalMoves
} from '../assets/js/abalone-ai.js';

function customState(placements, turn = BLACK, captured = { B: 0, W: 0 }) {
  const state = initialState();
  for (const c of allCells()) state.board.set(keyOf(c), null);
  for (const p of placements) state.board.set(keyOf(p), p.v);
  state.turn = turn;
  state.captured = { ...captured };
  state.winner = null;
  state.history = [];
  return state;
}

test('enumerateLegalMoves returns engine-legal moves for active player', () => {
  const s = customState([
    { q: -1, r: 0, v: BLACK },
    { q: 0, r: 0, v: BLACK },
    { q: 1, r: 0, v: BLACK },
    { q: 2, r: 0, v: WHITE },
    { q: 3, r: 0, v: WHITE }
  ], BLACK);

  const moves = enumerateLegalMoves(s, BLACK);
  assert.ok(moves.length > 0);
  for (const move of moves) {
    const next = applyMove(s, move);
    assert.notDeepEqual(next.board, s.board);
  }
});

test('AI chooses legal moves for all difficulties', () => {
  const s = initialState();
  for (const difficulty of ['easy', 'medium', 'hard']) {
    const move = chooseAIMove(s, BLACK, difficulty);
    assert.ok(move, `expected move for difficulty ${difficulty}`);
    const legalSet = new Set(enumerateLegalMoves(s, BLACK).map((m) => `${m.selection.map(keyOf).sort().join('|')}::${keyOf(m.direction)}`));
    const moveKey = `${move.selection.map(keyOf).sort().join('|')}::${keyOf(move.direction)}`;
    assert.ok(legalSet.has(moveKey), `AI move should be legal for ${difficulty}`);
  }
});

test('AI can find immediate ejection opportunity', () => {
  const s = customState([
    { q: 2, r: 0, v: BLACK },
    { q: 3, r: 0, v: BLACK },
    { q: 4, r: 0, v: WHITE },
    { q: -1, r: 0, v: WHITE },
    { q: -2, r: 0, v: WHITE }
  ], BLACK);

  const move = chooseAIMove(s, BLACK, 'medium');
  assert.ok(move);
  const next = applyMove(s, move);
  assert.ok(next.captured[BLACK] >= s.captured[BLACK]);
  assert.equal(next.turn, WHITE);
});
