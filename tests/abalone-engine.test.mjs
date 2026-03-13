import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BLACK,
  WHITE,
  allCells,
  isValidCell,
  standardStartCells,
  initialState,
  isValidSelection,
  getLegalMovesForSelection,
  applyMove,
  keyOf
} from '../assets/js/abalone-engine.js';

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

test('radius-4 board has 61 valid cells and setup has 14 marbles each', () => {
  const cells = allCells();
  assert.equal(cells.length, 61);
  assert.ok(cells.every(isValidCell));

  const s = initialState();
  let b = 0;
  let w = 0;
  for (const v of s.board.values()) {
    if (v === BLACK) b += 1;
    if (v === WHITE) w += 1;
  }
  assert.equal(b, 14);
  assert.equal(w, 14);
  assert.equal(s.turn, BLACK);
});

test('initial setup uses exact requested coordinates for black and reflected white', () => {
  const { black, white } = standardStartCells();
  const bExpected = new Set([
    '0,-4', '1,-4', '2,-4', '3,-4', '4,-4',
    '-1,-3', '0,-3', '1,-3', '2,-3', '3,-3', '4,-3',
    '0,-2', '1,-2', '2,-2'
  ]);

  const wExpected = new Set([
    '-4,4', '-3,4', '-2,4', '-1,4', '0,4',
    '-4,3', '-3,3', '-2,3', '-1,3', '0,3', '1,3',
    '-2,2', '-1,2', '0,2'
  ]);

  assert.deepEqual(new Set(black.map(keyOf)), bExpected);
  assert.deepEqual(new Set(white.map(keyOf)), wExpected);
});

test('selection validity enforces player, alignment and max length', () => {
  const s = initialState();
  assert.equal(isValidSelection(s, [{ q: 0, r: -4 }]), true);
  assert.equal(isValidSelection(s, [{ q: 0, r: -4 }, { q: 1, r: -3 }]), false);
  assert.equal(isValidSelection(s, [{ q: 0, r: -4 }, { q: 1, r: -4 }, { q: 2, r: -4 }, { q: 3, r: -4 }]), false);
  assert.equal(isValidSelection(s, [{ q: 0, r: 4 }]), false);
});

test('inline movement advances line by one', () => {
  const s = customState([
    { q: 0, r: 0, v: BLACK },
    { q: 1, r: 0, v: BLACK }
  ]);
  const move = getLegalMovesForSelection(s, [{ q: 0, r: 0 }, { q: 1, r: 0 }]).find((m) => m.direction.q === 1 && m.direction.r === 0);
  const next = applyMove(s, { selection: [{ q: 0, r: 0 }, { q: 1, r: 0 }], direction: move.direction });
  assert.equal(next.board.get('1,0'), BLACK);
  assert.equal(next.board.get('2,0'), BLACK);
  assert.equal(next.board.get('0,0'), null);
});

test('broadside movement shifts all selected marbles laterally', () => {
  const s = customState([
    { q: -1, r: 1, v: WHITE },
    { q: 0, r: 1, v: WHITE },
    { q: 1, r: 1, v: WHITE }
  ], WHITE);
  const sel = [{ q: -1, r: 1 }, { q: 0, r: 1 }, { q: 1, r: 1 }];
  const move = getLegalMovesForSelection(s, sel).find((m) => m.kind === 'broadside' && m.direction.q === 0 && m.direction.r === -1);
  const next = applyMove(s, { selection: sel, direction: move.direction });
  assert.equal(next.board.get('-1,0'), WHITE);
  assert.equal(next.board.get('0,0'), WHITE);
  assert.equal(next.board.get('1,0'), WHITE);
});

test('blocked inline move is illegal when own marble blocks destination', () => {
  const s = customState([
    { q: 0, r: 0, v: BLACK },
    { q: 1, r: 0, v: BLACK },
    { q: 2, r: 0, v: BLACK }
  ]);
  const sel = [{ q: 0, r: 0 }, { q: 1, r: 0 }];
  const illegal = getLegalMovesForSelection(s, sel).find((m) => m.direction.q === 1 && m.direction.r === 0);
  assert.equal(illegal, undefined);
});

test('legal pushes include 2v1, 3v1, and 3v2', () => {
  const twoVsOne = customState([
    { q: 0, r: 0, v: BLACK },
    { q: 1, r: 0, v: BLACK },
    { q: 2, r: 0, v: WHITE }
  ]);
  assert.ok(getLegalMovesForSelection(twoVsOne, [{ q: 0, r: 0 }, { q: 1, r: 0 }]).find((m) => m.direction.q === 1 && m.direction.r === 0));

  const threeVsOne = customState([
    { q: -1, r: 0, v: BLACK },
    { q: 0, r: 0, v: BLACK },
    { q: 1, r: 0, v: BLACK },
    { q: 2, r: 0, v: WHITE }
  ]);
  assert.ok(getLegalMovesForSelection(threeVsOne, [{ q: -1, r: 0 }, { q: 0, r: 0 }, { q: 1, r: 0 }]).find((m) => m.direction.q === 1 && m.direction.r === 0));

  const threeVsTwo = customState([
    { q: -1, r: 0, v: BLACK },
    { q: 0, r: 0, v: BLACK },
    { q: 1, r: 0, v: BLACK },
    { q: 2, r: 0, v: WHITE },
    { q: 3, r: 0, v: WHITE }
  ]);
  assert.ok(getLegalMovesForSelection(threeVsTwo, [{ q: -1, r: 0 }, { q: 0, r: 0 }, { q: 1, r: 0 }]).find((m) => m.direction.q === 1 && m.direction.r === 0));
});

test('equal strength pushes are illegal', () => {
  const s = customState([
    { q: -1, r: 0, v: BLACK },
    { q: 0, r: 0, v: BLACK },
    { q: 1, r: 0, v: WHITE },
    { q: 2, r: 0, v: WHITE }
  ]);
  const move = getLegalMovesForSelection(s, [{ q: -1, r: 0 }, { q: 0, r: 0 }]).find((m) => m.direction.q === 1 && m.direction.r === 0);
  assert.equal(move, undefined);
});

test('3v3 equal-strength inline push is illegal', () => {
  const s = customState([
    { q: -2, r: 0, v: BLACK },
    { q: -1, r: 0, v: BLACK },
    { q: 0, r: 0, v: BLACK },
    { q: 1, r: 0, v: WHITE },
    { q: 2, r: 0, v: WHITE },
    { q: 3, r: 0, v: WHITE }
  ]);

  const push = getLegalMovesForSelection(s, [{ q: -2, r: 0 }, { q: -1, r: 0 }, { q: 0, r: 0 }])
    .find((m) => m.direction.q === 1 && m.direction.r === 0);
  assert.equal(push, undefined);
});

test('blocked push is illegal if behind opponent marbles is occupied by own marble', () => {
  const s = customState([
    { q: -1, r: 0, v: BLACK },
    { q: 0, r: 0, v: BLACK },
    { q: 1, r: 0, v: BLACK },
    { q: 2, r: 0, v: WHITE },
    { q: 3, r: 0, v: WHITE },
    { q: 4, r: 0, v: BLACK }
  ]);

  const push = getLegalMovesForSelection(s, [{ q: -1, r: 0 }, { q: 0, r: 0 }, { q: 1, r: 0 }])
    .find((m) => m.direction.q === 1 && m.direction.r === 0);
  assert.equal(push, undefined);
});

test('ejection increments capture count and removes marble', () => {
  const s = customState([
    { q: 2, r: 0, v: BLACK },
    { q: 3, r: 0, v: BLACK },
    { q: 4, r: 0, v: WHITE }
  ]);
  const next = applyMove(s, { selection: [{ q: 2, r: 0 }, { q: 3, r: 0 }], direction: { q: 1, r: 0 } });
  assert.equal(next.captured[BLACK], 1);
  assert.equal(next.board.get('4,0'), BLACK);
});

test('victory is detected at six captures', () => {
  const s = customState([
    { q: 2, r: 0, v: BLACK },
    { q: 3, r: 0, v: BLACK },
    { q: 4, r: 0, v: WHITE }
  ], BLACK, { B: 5, W: 0 });
  const next = applyMove(s, { selection: [{ q: 2, r: 0 }, { q: 3, r: 0 }], direction: { q: 1, r: 0 } });
  assert.equal(next.captured[BLACK], 6);
  assert.equal(next.winner, BLACK);
});
