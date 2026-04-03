import test from "node:test";
import assert from "node:assert/strict";

import {
  computeAcf,
  computePacf,
  computePeriodogram,
  differenceSeries,
  forecastToyModel,
  localLevelKalman,
  movingAverage,
  rollingOriginSplits,
  simpleExponentialSmoothing,
  simulateArma
} from "../assets/js/time-series-notes.js";

test("differencing subtracts lagged values", () => {
  assert.deepEqual(differenceSeries([3, 6, 10, 15]), [3, 4, 5]);
  assert.deepEqual(differenceSeries([1, 2, 4, 8, 16], 2), [3, 6, 12]);
});

test("sample acf starts at one and stays bounded", () => {
  const acf = computeAcf([1, 2, 3, 4, 5], 3);

  assert.equal(acf[0], 1);
  acf.forEach((value) => {
    assert.ok(value <= 1 + 1e-12);
    assert.ok(value >= -1 - 1e-12);
  });
});

test("sample pacf begins at one and has the requested length", () => {
  const pacf = computePacf([1, 0, 1, 0, 1, 0, 1], 4);

  assert.equal(pacf[0], 1);
  assert.equal(pacf.length, 5);
});

test("simulated AR process has the requested sample size", () => {
  const series = simulateArma({ phi: [0.7], theta: [], n: 64, burnin: 40, seed: 99 });

  assert.equal(series.length, 64);
});

test("moving average and exponential smoothing preserve length", () => {
  const values = [4, 5, 7, 6, 9, 8];

  assert.equal(movingAverage(values, 3).length, values.length);
  assert.equal(simpleExponentialSmoothing(values, 0.4).length, values.length);
});

test("local-level Kalman filter returns one filtered value per observation", () => {
  const observations = [10, 11, 9, 10.5, 11.2];
  const filtered = localLevelKalman(observations, 0.2, 0.6);

  assert.equal(filtered.filtered.length, observations.length);
  assert.equal(filtered.variances.length, observations.length);
  filtered.variances.forEach((value) => assert.ok(value >= 0));
});

test("rolling-origin splits preserve chronology", () => {
  const splits = rollingOriginSplits(30, 10, 4, 3);

  assert.deepEqual(splits[0], {
    trainStart: 0,
    trainEnd: 10,
    validationStart: 10,
    validationEnd: 14,
    testStart: 14,
    testEnd: 18
  });
  assert.ok(splits.every((split) => split.trainEnd <= split.validationStart));
});

test("periodogram returns paired frequencies and powers", () => {
  const { frequencies, powers } = computePeriodogram([0, 1, 0, -1, 0, 1, 0, -1]);

  assert.equal(frequencies.length, powers.length);
  assert.ok(frequencies.length > 0);
});

test("forecast helper returns mean path with lower and upper bands", () => {
  const train = Array.from({ length: 36 }, (_, index) => 10 + 0.2 * index + Math.sin((2 * Math.PI * index) / 12));
  const result = forecastToyModel(train, "seasonal", 6, 12);

  assert.equal(result.forecast.length, 6);
  assert.equal(result.lower.length, 6);
  assert.equal(result.upper.length, 6);
  result.forecast.forEach((value, index) => {
    assert.ok(result.lower[index] <= value);
    assert.ok(value <= result.upper[index]);
  });
});
