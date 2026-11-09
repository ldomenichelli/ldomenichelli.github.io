import test from 'node:test';
import assert from 'node:assert/strict';
import { datasetMle } from '../assets/js/id-estimator.js';

function random(seed = 42) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

test('Levina–Bickel dataset MLE is close to 1 for seeded synthetic line data', () => {
  const rand = random(41);
  const points = Array.from({ length: 550 }, () => ({ x: 0.1 + 0.8 * rand(), y: 0.5 }));
  const id = datasetMle(points, 12);
  assert.ok(id > 0.8 && id < 1.3, `expected near 1, got ${id}`);
});

test('Levina–Bickel dataset MLE is close to 2 for seeded synthetic plane data', () => {
  const rand = random(42);
  const points = Array.from({ length: 700 }, () => ({ x: 0.1 + 0.8 * rand(), y: 0.1 + 0.8 * rand() }));
  const id = datasetMle(points, 16);
  assert.ok(id > 1.65 && id < 2.4, `expected near 2, got ${id}`);
});
