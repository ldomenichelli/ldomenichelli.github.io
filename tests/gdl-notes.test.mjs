import test from "node:test";
import assert from "node:assert/strict";

import {
  applyPermutation,
  binaryTreeLeafCount,
  componentsInRotatedFrame,
  convolveValid,
  euclideanDistance2D,
  featureVariance,
  messagePassStep,
  oversquashRatio,
  polylineArcDistance,
  rotatePoint,
  runMessagePassing,
  shiftGrid,
  sumPool,
  translatePoints
} from "../assets/js/gdl-notes.js";

test("translations shift every point by the same offset", () => {
  const shifted = translatePoints(
    [
      [1, 2],
      [-1, 0]
    ],
    3,
    -2
  );

  assert.deepEqual(shifted, [
    [4, 0],
    [2, -2]
  ]);
});

test("rotation by ninety degrees swaps axes with sign change", () => {
  const rotated = rotatePoint([2, 1], Math.PI / 2);

  assert.ok(Math.abs(rotated[0] + 1) < 1e-12);
  assert.ok(Math.abs(rotated[1] - 2) < 1e-12);
});

test("sum pooling is permutation invariant", () => {
  const vectors = [
    [1, 2],
    [3, 4],
    [5, 6]
  ];
  const permuted = applyPermutation(vectors, [2, 0, 1]);

  assert.deepEqual(sumPool(vectors), sumPool(permuted));
});

test("convolutional response shifts with the translated motif", () => {
  const kernel = [
    [1, 0],
    [0, 1]
  ];
  const grid = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 0]
  ];
  const shiftedGrid = shiftGrid(grid, 1, 1);

  assert.deepEqual(convolveValid(grid, kernel), [
    [2, 0],
    [0, 1]
  ]);
  assert.deepEqual(convolveValid(shiftedGrid, kernel), [
    [0, 0],
    [0, 2]
  ]);
});

test("message passing mixes node values with their neighbors", () => {
  const adjacency = [[1], [0, 2], [1]];
  const features = [1, 0, 1];
  const next = messagePassStep(adjacency, features, 0.5);

  assert.deepEqual(next, [0.5, 0.5, 0.5]);
});

test("repeated smoothing lowers variance on a chain", () => {
  const adjacency = [[1], [0, 2], [1, 3], [2]];
  const initial = [1, 0, 1, 0];
  const afterOne = runMessagePassing(adjacency, initial, 1, 0.6);
  const afterSix = runMessagePassing(adjacency, initial, 6, 0.6);

  assert.ok(featureVariance(afterSix) < featureVariance(afterOne));
});

test("tree leaf count and oversquash ratio grow exponentially with depth", () => {
  assert.equal(binaryTreeLeafCount(4), 16);
  assert.equal(oversquashRatio(4), 16);
});

test("geodesic distance along a bent polyline can exceed Euclidean distance", () => {
  const polyline = [
    [0, 0],
    [2, 0],
    [2, 2]
  ];

  assert.equal(euclideanDistance2D(polyline[0], polyline[2]), Math.sqrt(8));
  assert.equal(polylineArcDistance(polyline, 0, 2), 4);
});

test("rotated-frame components change coordinates but preserve vector norm", () => {
  const vector = [1.2, 0.4];
  const components = componentsInRotatedFrame(vector, Math.PI / 3);
  const originalNorm = Math.hypot(vector[0], vector[1]);
  const transformedNorm = Math.hypot(components[0], components[1]);

  assert.ok(Math.abs(originalNorm - transformedNorm) < 1e-12);
});
