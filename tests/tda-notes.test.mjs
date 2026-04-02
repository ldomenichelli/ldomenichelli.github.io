import test from "node:test";
import assert from "node:assert/strict";

import {
  applyCircularAverage,
  circularShift,
  computeCechComplex,
  computeVietorisRipsComplex,
  supNormDistance
} from "../assets/js/tda-notes.js";

test("Vietoris-Rips fills a triangle once all pairwise distances fit under 2r", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0.5, y: Math.sqrt(3) / 2 }
  ];

  const vr = computeVietorisRipsComplex(points, 0.55);
  assert.equal(vr.edges.length, 3);
  assert.deepEqual(vr.faces, [[0, 1, 2]]);
});

test("Cech can be strictly smaller than Vietoris-Rips on the same point cloud", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0.5, y: Math.sqrt(3) / 2 }
  ];

  const cech = computeCechComplex(points, 0.55);
  const vr = computeVietorisRipsComplex(points, 0.55);

  assert.equal(cech.faces.length, 0);
  assert.equal(vr.faces.length, 1);
  assert.ok(vr.edges.length >= cech.edges.length);
});

test("the circular averaging operator is shift-equivariant", () => {
  const signal = [2, 3.5, 1, 4, 2.5, 1.5];
  const shift = 2;

  const left = applyCircularAverage(circularShift(signal, shift), 1);
  const right = circularShift(applyCircularAverage(signal, 1), shift);

  assert.equal(supNormDistance(left, right), 0);
});
