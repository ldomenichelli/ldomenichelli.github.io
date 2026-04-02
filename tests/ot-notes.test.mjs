import test from "node:test";
import assert from "node:assert/strict";

import {
  barycenterAtoms,
  computePlanCost,
  costMatrixFromPositions,
  cumulativeDistribution,
  displacementInterpolateAtoms,
  greedy1DTransport,
  normalizeWeights,
  sinkhorn,
  solveTransport3x3
} from "../assets/js/ot-notes.js";

test("normalizeWeights returns a probability vector", () => {
  const weights = normalizeWeights([3, 5, 2]);
  const total = weights.reduce((sum, value) => sum + value, 0);

  assert.ok(Math.abs(total - 1) < 1e-12);
  assert.deepEqual(weights.map((value) => Number(value.toFixed(2))), [0.3, 0.5, 0.2]);
});

test("solveTransport3x3 recovers the zero-cost identity plan", () => {
  const source = [1, 0, 0];
  const target = [1, 0, 0];
  const costs = costMatrixFromPositions([0, 1, 2], [0, 1, 2], 1);
  const solution = solveTransport3x3(source, target, costs);

  assert.equal(solution.cost, 0);
  assert.equal(solution.plan[0][0], 1);
});

test("greedy1DTransport preserves total mass in order", () => {
  const source = normalizeWeights([4, 2, 4]);
  const target = normalizeWeights([1, 5, 4]);
  const plan = greedy1DTransport(source, target);
  const moved = plan.reduce((sum, flow) => sum + flow.mass, 0);

  assert.ok(Math.abs(moved - 1) < 1e-12);
  assert.ok(plan.every((flow, index) => index === 0 || plan[index - 1].source <= flow.source));
  assert.ok(plan.every((flow, index) => index === 0 || plan[index - 1].target <= flow.target));
});

test("sinkhorn approximately matches marginals", () => {
  const source = normalizeWeights([5, 3, 2]);
  const target = normalizeWeights([2, 6, 2]);
  const costs = costMatrixFromPositions([0, 0.5, 1], [0, 0.5, 1], 2);
  const regularized = sinkhorn(source, target, costs, 0.18, 200);
  const rowSums = regularized.plan.map((row) => row.reduce((sum, value) => sum + value, 0));
  const colSums = target.map((_, colIndex) => regularized.plan.reduce((sum, row) => sum + row[colIndex], 0));

  rowSums.forEach((value, index) => assert.ok(Math.abs(value - source[index]) < 1e-6));
  colSums.forEach((value, index) => assert.ok(Math.abs(value - target[index]) < 1e-6));
  assert.equal(Number(computePlanCost(regularized.plan, costs).toFixed(6)), Number(regularized.cost.toFixed(6)));
});

test("CDF and barycenter helpers preserve the expected order structure", () => {
  const cdf = cumulativeDistribution(normalizeWeights([1, 2, 3]));
  const midpoint = displacementInterpolateAtoms([-1, 0, 1], [1, 2, 3], 0.5);
  const barycenter = barycenterAtoms([[-1, 0, 1], [1, 2, 3]], [0.5, 0.5]);

  assert.deepEqual(cdf.map((value) => Number(value.toFixed(6))), [0.166667, 0.5, 1]);
  assert.deepEqual(midpoint, [0, 1, 2]);
  assert.deepEqual(barycenter, [0, 1, 2]);
});
