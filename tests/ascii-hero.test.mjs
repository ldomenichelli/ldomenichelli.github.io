import test from 'node:test';
import assert from 'node:assert/strict';

import { brightnessToCharacter } from '../assets/js/ascii-hero.js';

test('brightnessToCharacter maps darker tones to denser glyphs by default', () => {
  assert.equal(brightnessToCharacter(0, ' .#@', false), '@');
  assert.equal(brightnessToCharacter(1, ' .#@', false), ' ');
});

test('brightnessToCharacter honors inversion', () => {
  assert.equal(brightnessToCharacter(0, ' .#@', true), ' ');
  assert.equal(brightnessToCharacter(1, ' .#@', true), '@');
});

test('brightnessToCharacter clamps out-of-range values safely', () => {
  assert.equal(brightnessToCharacter(-10, ' .#@', false), '@');
  assert.equal(brightnessToCharacter(10, ' .#@', false), ' ');
});
