import test from "node:test";
import assert from "node:assert/strict";

import {
  averageSilhouette,
  bootstrapMeans,
  lassoCoordinateDescent,
  lowess,
  makeKFolds,
  principalComponents2d,
  ridgeFromGram,
  runKMeans,
  topIndices
} from "../assets/js/slld-notes.js";

test("k-means separates a simple two-cluster configuration", () => {
  const points = [
    [-2, -1.8],
    [-1.7, -2.1],
    [2.1, 2.0],
    [2.4, 1.7]
  ];
  const result = runKMeans(points, 2);
  const counts = result.assignments.reduce((map, cluster) => {
    map.set(cluster, (map.get(cluster) ?? 0) + 1);
    return map;
  }, new Map());

  assert.deepEqual([...counts.values()].sort((left, right) => left - right), [2, 2]);
  assert.ok(averageSilhouette(points, result.assignments) > 0.8);
});

test("PCA orders eigenvalues and captures dominant correlation", () => {
  const points = [
    [2, 1],
    [1, 0.4],
    [0, 0],
    [-1, -0.5],
    [-2, -1.1]
  ];
  const model = principalComponents2d(points);
  const total = model.eigenvalues[0] + model.eigenvalues[1];

  assert.ok(model.eigenvalues[0] >= model.eigenvalues[1]);
  assert.ok(model.eigenvalues[0] / total > 0.95);
});

test("larger LOWESS span produces a smoother fitted curve", () => {
  const xs = [0, 1, 2, 3, 4, 5];
  const ys = [0, 1.5, 0.5, 2.0, 1.0, 2.2];
  const small = lowess(xs, ys, 0.35);
  const large = lowess(xs, ys, 0.8);
  const roughness = (values) => values.slice(1).reduce((sum, value, index) => sum + Math.abs(value - values[index]), 0);

  assert.equal(small.length, xs.length);
  assert.equal(large.length, xs.length);
  assert.ok(roughness(large) < roughness(small));
});

test("k-fold splitter returns balanced folds", () => {
  const folds = makeKFolds(12, 5);
  const sizes = folds.map((fold) => fold.length);

  assert.deepEqual(sizes, [3, 3, 2, 2, 2]);
});

test("bootstrap means stay centered near the empirical mean", () => {
  const values = [2, 3, 5, 7];
  const means = bootstrapMeans(values, 120, 4);
  const average = means.reduce((sum, value) => sum + value, 0) / means.length;

  assert.ok(Math.abs(average - 4.25) < 0.2);
});

test("ridge shrinks coefficients and lasso can set them to zero", () => {
  const gram = [
    [1, 0],
    [0, 1]
  ];
  const rhs = [2.5, 0.45];
  const ridge = ridgeFromGram(gram, rhs, 1);
  const lasso = lassoCoordinateDescent(gram, rhs, 1.2, 40);

  assert.ok(Math.hypot(...ridge) < Math.hypot(...rhs));
  assert.ok(Math.abs(lasso[0] - 1.9) < 1e-6);
  assert.equal(lasso[1], 0);
});

test("topIndices ranks by absolute score", () => {
  const indices = topIndices([0.2, -0.9, 0.45, -0.1], 2);

  assert.deepEqual(indices, [1, 2]);
});
