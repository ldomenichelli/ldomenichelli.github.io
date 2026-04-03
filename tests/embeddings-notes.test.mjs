import test from "node:test";
import assert from "node:assert/strict";

import {
  alignmentScore,
  cosineSimilarity,
  covarianceEigenvalues,
  effectiveRank,
  euclideanDistance,
  jacobiEigenvaluesSymmetric,
  kOccurrenceCounts,
  l2Normalize,
  nearestNeighborOrder,
  participationRatio,
  uniformityScore,
  vectorNorm
} from "../assets/js/embeddings-notes.js";

test("L2 normalization maps nonzero vectors to unit norm", () => {
  const normalized = l2Normalize([3, 4, 0]);

  assert.ok(Math.abs(vectorNorm(normalized) - 1) < 1e-12);
  assert.deepEqual(normalized.map((value) => Number(value.toFixed(3))), [0.6, 0.8, 0]);
});

test("cosine, dot, and Euclidean induce the same ranking on unit vectors", () => {
  const query = { vector: l2Normalize([1, 0.1]) };
  const points = [
    { label: "a", vector: l2Normalize([0.95, 0.18]) },
    { label: "b", vector: l2Normalize([0.55, 0.83]) },
    { label: "c", vector: l2Normalize([-0.1, 1]) }
  ];

  const cosine = nearestNeighborOrder(points, query, "cosine").map((item) => item.label);
  const dot = nearestNeighborOrder(points, query, "dot").map((item) => item.label);
  const euclidean = nearestNeighborOrder(points, query, "euclidean").map((item) => item.label);

  assert.deepEqual(cosine, dot);
  assert.deepEqual(cosine, euclidean);
});

test("Jacobi eigenvalue solver recovers diagonal spectra", () => {
  const eigenvalues = jacobiEigenvaluesSymmetric([
    [4, 0, 0],
    [0, 2, 0],
    [0, 0, 1]
  ]);

  assert.deepEqual(eigenvalues, [4, 2, 1]);
});

test("covariance eigenvalues reflect rank-one variation", () => {
  const eigenvalues = covarianceEigenvalues([
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 0]
  ]);

  assert.equal(eigenvalues.length, 1);
  assert.ok(eigenvalues[0] > 0);
});

test("participation ratio and effective rank drop for spiky spectra", () => {
  const flat = [1, 1, 1, 1];
  const spiky = [4, 0.1, 0.1, 0.1];

  assert.ok(participationRatio(flat) > participationRatio(spiky));
  assert.ok(effectiveRank(flat) > effectiveRank(spiky));
});

test("alignment and uniformity distinguish collapse from spread", () => {
  const paired = [
    [[1, 0], [1, 0.02]],
    [[0, 1], [0.02, 1]]
  ];
  const collapsed = [
    [1, 0],
    [1, 0.01],
    [0.99, -0.01],
    [1, 0.02]
  ];
  const spread = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1]
  ];

  assert.ok(alignmentScore(paired) < 0.01);
  assert.ok(uniformityScore(spread) < uniformityScore(collapsed));
});

test("hubness counts identify a central point in a star configuration", () => {
  const vectors = [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];
  const counts = kOccurrenceCounts(vectors, 1);

  assert.equal(counts[0], 4);
  assert.ok(counts.slice(1).every((count) => count === 0));
});

test("Euclidean distance agrees with the norm of a difference vector", () => {
  const left = [1, 2, -1];
  const right = [-2, 2, 3];

  assert.equal(euclideanDistance(left, right), vectorNorm([3, 0, -4]));
  assert.equal(Number(cosineSimilarity([1, 0], [0, 1]).toFixed(6)), 0);
});
