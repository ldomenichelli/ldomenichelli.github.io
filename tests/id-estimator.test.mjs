import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateMleByK,
  aggregateMleOverKRange,
  datasetMle,
  localMleCurveFromSortedDistances,
  localMleFromSortedDistances,
  pairwiseSortedDistances,
} from '../assets/js/id-estimator.js';

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

test('localMleCurveFromSortedDistances returns progressive k rows', () => {
  const sorted = [0.1, 0.15, 0.2, 0.26, 0.32];
  const curve = localMleCurveFromSortedDistances(sorted, 2, 5);
  assert.equal(curve.length, 4);
  assert.deepEqual(curve.map((d) => d.k), [2, 3, 4, 5]);
  assert.ok(curve.every((d) => Number.isFinite(d.value)));
  assert.equal(curve.at(-1).value, localMleFromSortedDistances(sorted, 5));
});

test('aggregateMleByK and aggregateMleOverKRange produce consistent ranges', () => {
  const pts = planePoints(220);
  const cache = pairwiseSortedDistances(pts);
  const rows = aggregateMleByK(cache, 5, 12);
  assert.equal(rows.length, 8);
  assert.ok(rows.every((r) => r.k >= 5 && r.k <= 12));
  assert.ok(rows.every((r) => Number.isFinite(r.mean) && Number.isFinite(r.median)));

  const meanAgg = aggregateMleOverKRange(cache, 6, 10, 'mean');
  const medianAgg = aggregateMleOverKRange(cache, 6, 10, 'median');
  assert.equal(meanAgg.rows.length, 5);
  assert.equal(medianAgg.rows.length, 5);
  assert.ok(Number.isFinite(meanAgg.value));
  assert.ok(Number.isFinite(medianAgg.value));
});
