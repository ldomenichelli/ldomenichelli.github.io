import test from 'node:test';
import assert from 'node:assert/strict';
import { expectedSimplexSkewness, essPairTerms, essStatistic, estimateEssDimension } from '../assets/js/id-estimator.js';

const approx = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand) {
  const u = Math.max(1e-12, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

function sampleUnitBall(rand, dim) {
  const g = Array.from({ length: dim }, () => gaussian(rand));
  const gn = Math.hypot(...g) || 1;
  const unit = g.map((v) => v / gn);
  const r = Math.pow(rand(), 1 / dim);
  return unit.map((v) => v * r);
}

function syntheticCloud(dim, n, seed = 7, noise = 0.01) {
  const rand = mulberry32(seed);
  return Array.from({ length: n }, () => sampleUnitBall(rand, dim).map((v) => v + gaussian(rand) * noise));
}

test('ESS curve constants: s2≈2/pi and s3≈pi/4', () => {
  assert.ok(approx(expectedSimplexSkewness(2), 2 / Math.PI, 1e-8));
  assert.ok(approx(expectedSimplexSkewness(3), Math.PI / 4, 1e-8));
});

test('expectedSimplexSkewness is monotone increasing over n=2..16', () => {
  let prev = expectedSimplexSkewness(2);
  for (let n = 3; n <= 16; n += 1) {
    const cur = expectedSimplexSkewness(n);
    assert.ok(cur > prev, `s_${n} (${cur}) should exceed s_${n - 1} (${prev})`);
    prev = cur;
  }
});

test('essPairTerms matches right-angle pair intuition', () => {
  const t = essPairTerms([1, 0], [0, 2]);
  assert.ok(Math.abs(t.dot) < 1e-12);
  assert.ok(Math.abs(t.area - 2) < 1e-12);
  assert.ok(Math.abs(t.denominator - 2) < 1e-12);
  assert.ok(Math.abs(t.contribution - 1) < 1e-12);
});

test('ESS estimator behaves sensibly on synthetic clouds of different dimensions', () => {
  const lowStats = essStatistic(syntheticCloud(2, 80, 13, 0.01));
  const highStats = essStatistic(syntheticCloud(6, 80, 13, 0.01));
  assert.ok(lowStats.sHat < highStats.sHat, `expected higher sHat for higher dimension (${lowStats.sHat} vs ${highStats.sHat})`);

  const low = estimateEssDimension(lowStats.sHat, 16);
  const high = estimateEssDimension(highStats.sHat, 16);
  assert.ok(Number.isFinite(low.nHat) && Number.isFinite(high.nHat));
  assert.ok(low.nHat > 1.5 && low.nHat < 3.5, `2D cloud should estimate near low dimensions, got ${low.nHat}`);
  assert.ok(high.nHat > low.nHat + 1.2, `6D cloud should estimate clearly higher than 2D (${high.nHat} vs ${low.nHat})`);
});

test('estimateEssDimension handles below-range and above-range clamping', () => {
  const low = estimateEssDimension(0.01, 8);
  assert.equal(low.status, 'below-range');
  assert.equal(low.nHat, 1);

  const high = estimateEssDimension(2, 8);
  assert.equal(high.status, 'above-range');
  assert.equal(high.nHat, 8);
});
