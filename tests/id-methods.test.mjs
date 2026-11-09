import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sortedNeighborCache, pairwiseSortedDistances, localMleFromSortedDistances,
  estimateAll, estimateMle, estimateEss, estimateTwoNN, estimateCorrelation, estimatePca
} from '../assets/js/id-estimator.js';

const approx = (actual, expected, tolerance = 1e-8) => assert.ok(
  Math.abs(actual - expected) <= tolerance,
  `expected ${actual} to equal ${expected} within ${tolerance}`
);

function random(seed = 42) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function cloud(dim, count = 360, seed = 42) {
  const r = random(seed);
  return Array.from({ length: count }, () => Array.from({ length: dim }, r));
}

function rotateAndTranslate(points, scale = 1) {
  const c = Math.cos(0.71);
  const s = Math.sin(0.71);
  return points.map(([x, y, ...rest]) => [
    scale * (c * x - s * y) + 4,
    scale * (s * x + c * y) - 7,
    ...rest.map((v) => v * scale + 3)
  ]);
}

test('neighbor cache uses every coordinate, omits self and preserves duplicate indices', () => {
  const points = [[0, 0, 0], [0, 0, 3], [0, 4, 0], [0, 0, 0]];
  const cache = sortedNeighborCache(points);
  assert.deepEqual(cache[0], [
    { index: 3, distance: 0 }, { index: 1, distance: 3 }, { index: 2, distance: 4 }
  ]);
  assert.equal(cache[1].find((n) => n.index === 2).distance, 5);
  assert.ok(cache.every((row, i) => row.every((n) => n.index !== i)));
  assert.equal(cache.pairDistances.length, 6);
  assert.deepEqual(pairwiseSortedDistances([{ x: 0, y: 0 }, { x: 3, y: 4 }]), [[5], [5]]);
});

test('local MLE matches its analytic formula, clamps k and rejects degenerate logs', () => {
  approx(localMleFromSortedDistances([Math.exp(-2), Math.exp(-1), 1], 3), 2 / 3);
  approx(localMleFromSortedDistances([Math.exp(-2), Math.exp(-1), 1], 30), 2 / 3);
  for (const distances of [[0, 1, 2], [1, 1, 1], [2, 1, 3], [1, Infinity]]) {
    assert.ok(Number.isNaN(localMleFromSortedDistances(distances, 3)));
  }
  assert.ok(Number.isNaN(localMleFromSortedDistances([1, 2, 3], NaN)));
});

test('TwoNN uses i/N ranks before 10% trimming and fits through the origin', () => {
  const count = 50;
  const dimension = 3;
  const points = cloud(2, count);
  // Supply exactly the theoretical quantiles: y_i=d*x_i. This fixture isolates
  // the empirical-CDF and regression convention from sampling fluctuations.
  const cache = points.map((_, i) => [
    { index: (i + 1) % count, distance: 1 },
    { index: (i + 2) % count, distance: i === count - 1 ? 100 : (1 - (i + 1) / count) ** (-1 / dimension) }
  ]);
  const result = estimateTwoNN(points, { cache });
  assert.equal(result.valid, true);
  assert.equal(result.retainedCount, 45);
  assert.equal(result.fitPoints.length, 49);
  approx(result.fitPoints[44].cdf, 0.9);
  approx(result.value, dimension);
  approx(result.r2, 1);
  assert.equal(result.intercept, 0);
});

test('TwoNN recognizes a sampled line and plane without a neighborhood parameter', () => {
  const line = estimateTwoNN(cloud(1, 600, 73));
  const plane = estimateTwoNN(cloud(2, 650, 21));
  assert.ok(line.value > 0.8 && line.value < 1.25, `line: ${line.value}`);
  assert.ok(plane.value > 1.65 && plane.value < 2.35, `plane: ${plane.value}`);
});

test('correlation integral normalizes unordered pairs and exposes the selected fit interval', () => {
  const points = Array.from({ length: 10 }, (_, i) => [i]);
  const result = estimateCorrelation(points, { range: [1, 2] });
  assert.equal(result.totalPairs, 45);
  const atOne = result.curve.find((p) => p.inFit && Math.abs(p.r - 1) < 1e-12);
  assert.equal(atOne.count, 9);
  approx(atOne.c, 9 / 45);
  assert.deepEqual(result.range, [1, 2]);
  assert.equal(result.fitCount, 24);
  assert.ok(result.curve.some((p) => !p.inFit));
});

test('correlation slopes recover line and plane dimensions at small scales', () => {
  const line = estimateCorrelation(cloud(1, 500, 17));
  const plane = estimateCorrelation(cloud(2, 600, 17));
  assert.ok(line.value > 0.8 && line.value < 1.2, `line: ${line.value}`);
  assert.ok(plane.value > 1.65 && plane.value < 2.2, `plane: ${plane.value}`);
  assert.ok(line.r2 > 0.98 && plane.r2 > 0.98);
  assert.equal(estimateCorrelation(cloud(2, 20), { range: [1, 1] }).valid, false);
  assert.equal(estimateCorrelation(cloud(2, 20), { lowerQuantile: 0.2, upperQuantile: 0.1 }).valid, false);
});

test('PCA participation ratio and 95% rank match exact anisotropic covariance', () => {
  const result = estimatePca([[3, 0], [-3, 0], [0, 1], [0, -1]]);
  approx(result.value, 100 / 82);
  approx(result.eigenvalues[0] / result.eigenvalues[1], 9);
  approx(result.explainedVariance[0], 0.9);
  assert.equal(result.rank95, 2);
  approx(result.cumulativeVariance.at(-1), 1);
});

test('PCA returns all axes for an isotropic cloud and one for an embedded line', () => {
  const axes = [];
  for (let i = 0; i < 6; i += 1) for (const sign of [-1, 1]) axes.push(Array.from({ length: 6 }, (_, j) => i === j ? sign : 0));
  const isotropic = estimatePca(axes);
  approx(isotropic.value, 6);
  assert.equal(isotropic.rank95, 6);
  const line = estimatePca(Array.from({ length: 40 }, (_, i) => [i, 2 * i + 3, 4 * i - 7, 0]));
  approx(line.value, 1);
  assert.equal(line.rank95, 1);
});

test('PCA reports global linear dimension 2 for a one-dimensional circle', () => {
  const circle = Array.from({ length: 120 }, (_, i) => [Math.cos(i * Math.PI / 60), Math.sin(i * Math.PI / 60), 0]);
  approx(estimatePca(circle).value, 2);
  assert.equal(estimatePca(circle).rank95, 2);
});

test('all estimators retain dimensions hidden by the display projection', () => {
  const points = cloud(2, 260, 19).map(([x, y]) => [0, 0, x, y]);
  const result = estimateAll(points, 16);
  for (const method of ['mle', 'ess', 'twonn', 'correlation', 'pca']) {
    assert.equal(result[method].valid, true, method);
    assert.ok(result[method].value > 1.5 && result[method].value < 2.6, `${method}: ${result[method].value}`);
  }
});

test('estimates are invariant under rotation, translation and common rescaling', () => {
  const points = cloud(3, 180, 113);
  const before = estimateAll(points, 14);
  const after = estimateAll(rotateAndTranslate(points, 7.3), 14);
  for (const method of ['mle', 'ess', 'twonn', 'correlation', 'pca']) {
    approx(after[method].value, before[method].value, 1e-7);
  }
  assert.deepEqual(after.pca.explainedVariance.map((v) => v.toFixed(8)), before.pca.explainedVariance.map((v) => v.toFixed(8)));
});

test('cached neighbors produce the same results after a k change', () => {
  const points = cloud(3, 80);
  const initial = estimateAll(points, 8);
  const cached = estimateAll(points, 14, { cache: initial.cache });
  const fresh = estimateAll(points, 14);
  assert.equal(cached.cache, initial.cache);
  for (const method of ['mle', 'ess', 'twonn', 'correlation', 'pca']) approx(cached[method].value, fresh[method].value);
  assert.notEqual(cached.mle.value, initial.mle.value);
  assert.equal(cached.twonn.value, initial.twonn.value);
  assert.equal(cached.correlation.value, initial.correlation.value);
  assert.equal(cached.pca.value, initial.pca.value);
});

test('duplicates are explicit: local MLE exclusions, TwoNN exclusions, correlation counts', () => {
  const points = cloud(2, 35, 9);
  points.push(points[0].slice());
  const mle = estimateMle(points, 8);
  const two = estimateTwoNN(points);
  const correlation = estimateCorrelation(points);
  assert.equal(mle.status, 'partial');
  assert.equal(mle.excludedCount, 2);
  assert.equal(two.status, 'partial');
  assert.equal(two.excludedCount, 2);
  assert.equal(correlation.status, 'duplicates');
  assert.equal(correlation.duplicatePairs, 1);
});

test('constant clouds and malformed inputs never produce plausible finite estimates', () => {
  for (const points of [[], [[1, 2], [3]], [[1, NaN], [2, 3]], Array.from({ length: 20 }, () => [4, 4])]) {
    const result = estimateAll(points, 8);
    for (const method of ['mle', 'ess', 'twonn', 'correlation', 'pca']) {
      assert.equal(result[method].valid, false, `${method}: ${JSON.stringify(points)}`);
      assert.ok(Number.isNaN(result[method].value), method);
    }
  }
  assert.equal(estimatePca([[1], [1]]).status, 'zero-variance');
  assert.equal(estimateEss([[0], [1]], 8).status, 'insufficient-neighbors');
});
