import test from 'node:test';
import assert from 'node:assert/strict';
import { datasetMle } from '../assets/js/id-estimator.js';

function linePoints(n = 500, noise = 0.002) {
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1);
    pts.push({ x: 0.1 + 0.8 * t + (Math.random() - 0.5) * noise, y: 0.5 + (Math.random() - 0.5) * noise });
  }
  return pts;
}

function planePoints(n = 500) {
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    pts.push({ x: 0.1 + 0.8 * Math.random(), y: 0.1 + 0.8 * Math.random() });
  }
  return pts;
}

test('Levina–Bickel dataset MLE is close to 1 for synthetic line data', () => {
  const id = datasetMle(linePoints(550, 0.003), 12);
  assert.ok(Number.isFinite(id));
  assert.ok(id > 0.75 && id < 1.35, `expected near 1, got ${id}`);
});

test('Levina–Bickel dataset MLE is close to 2 for synthetic plane data', () => {
  const id = datasetMle(planePoints(700), 16);
  assert.ok(Number.isFinite(id));
  assert.ok(id > 1.55 && id < 2.55, `expected near 2, got ${id}`);
});
