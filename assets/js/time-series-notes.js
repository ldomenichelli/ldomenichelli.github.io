import { buildSvg, clearChildren, createSvgElement, enhanceMathNotebookPage } from "./math-notebook.js";

const EPSILON = 1e-9;
const SEASON_LENGTH = 12;
const SEASON_TEMPLATE = [0.24, 0.52, 0.84, 0.98, 0.63, 0.18, -0.16, -0.34, -0.55, -0.7, -0.38, 0.04];
const NOISE_TEMPLATE = [0.12, -0.08, 0.1, -0.04, 0.06, -0.05, 0.08, -0.02, -0.07, 0.05, -0.03, 0.07];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function mean(values) {
  return values.length ? sum(values) / values.length : 0;
}

function variance(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return sum(values.map((value) => (value - average) ** 2)) / values.length;
}

function standardDeviation(values) {
  return Math.sqrt(Math.max(variance(values), 0));
}

function centered(values) {
  const average = mean(values);
  return values.map((value) => value - average);
}

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return "—";
  return Number(value).toFixed(digits);
}

function lerp(left, right, t) {
  return left + (right - left) * t;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function gaussianGenerator(seed) {
  const random = seededRandom(seed);
  let spare = null;

  return () => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }

    let u = 0;
    let v = 0;

    while (u <= EPSILON) u = random();
    while (v <= EPSILON) v = random();

    const radius = Math.sqrt(-2 * Math.log(u));
    const angle = 2 * Math.PI * v;
    spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  };
}

function drawText(svg, x, y, text, className = "ts-svg-small", attrs = {}) {
  const node = createSvgElement("text", { x, y, class: className, ...attrs });
  node.textContent = text;
  svg.appendChild(node);
  return node;
}

function drawLine(svg, x1, y1, x2, y2, className = "ts-axis", attrs = {}) {
  svg.appendChild(createSvgElement("line", { x1, y1, x2, y2, class: className, ...attrs }));
}

function drawRect(svg, x, y, width, height, className = "ts-box", attrs = {}) {
  svg.appendChild(createSvgElement("rect", { x, y, width, height, class: className, ...attrs }));
}

function drawCircle(svg, cx, cy, r, className = "ts-point is-blue", attrs = {}) {
  svg.appendChild(createSvgElement("circle", { cx, cy, r, class: className, ...attrs }));
}

function pathFromPoints(points) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point[0].toFixed(2)} ${point[1].toFixed(2)}`)
    .join(" ");
}

function drawPath(svg, points, className, attrs = {}) {
  if (points.length < 2) return;
  svg.appendChild(createSvgElement("path", { d: pathFromPoints(points), class: className, ...attrs }));
}

function extent(values) {
  let minimum = Infinity;
  let maximum = -Infinity;
  values.forEach((value) => {
    if (!Number.isFinite(value)) return;
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  });
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {
    return [0, 1];
  }
  if (Math.abs(maximum - minimum) < EPSILON) {
    return [minimum - 1, maximum + 1];
  }
  return [minimum, maximum];
}

function paddedExtent(seriesList, paddingFactor = 0.12) {
  const [minimum, maximum] = extent(seriesList.flat());
  const padding = Math.max((maximum - minimum) * paddingFactor, 0.12);
  return [minimum - padding, maximum + padding];
}

function valuesToPoints(values, x, y, width, height, minValue, maxValue) {
  const scaleY = height / Math.max(maxValue - minValue, EPSILON);
  return values.map((value, index) => {
    const px = x + (values.length === 1 ? width / 2 : (index * width) / (values.length - 1));
    const py = y + height - (value - minValue) * scaleY;
    return [px, py];
  });
}

function drawChartFrame(svg, x, y, width, height, title, minValue, maxValue, options = {}) {
  const { zeroLine = false, labelMin = null, labelMax = null } = options;
  drawText(svg, x, y - 10, title, "ts-svg-label");
  drawRect(svg, x, y, width, height, "ts-box", { rx: 14 });

  for (let index = 1; index < 4; index += 1) {
    const py = y + (index * height) / 4;
    drawLine(svg, x, py, x + width, py, "ts-grid-line");
  }

  drawLine(svg, x, y + height, x + width, y + height, "ts-axis");
  drawLine(svg, x, y, x, y + height, "ts-axis");

  if (zeroLine && minValue < 0 && maxValue > 0) {
    const zeroY = y + height - ((0 - minValue) / (maxValue - minValue)) * height;
    drawLine(svg, x, zeroY, x + width, zeroY, "ts-grid-line", { "stroke-dasharray": "4 6" });
  }

  drawText(svg, x + width + 8, y + 10, labelMax ?? formatNumber(maxValue, 1), "ts-svg-small");
  drawText(svg, x + width + 8, y + height, labelMin ?? formatNumber(minValue, 1), "ts-svg-small");
}

function drawLineSeries(svg, values, x, y, width, height, minValue, maxValue, className) {
  drawPath(svg, valuesToPoints(values, x, y, width, height, minValue, maxValue), className);
}

function drawBand(svg, lower, upper, x, y, width, height, minValue, maxValue, className = "ts-range-fill") {
  if (!lower.length || lower.length !== upper.length) return;
  const lowerPoints = valuesToPoints(lower, x, y, width, height, minValue, maxValue);
  const upperPoints = valuesToPoints(upper, x, y, width, height, minValue, maxValue).reverse();
  const polygon = [...lowerPoints, ...upperPoints];
  if (polygon.length < 4) return;
  svg.appendChild(createSvgElement("path", { d: `${pathFromPoints(polygon)} Z`, class: className }));
}

function drawScatterSeries(svg, values, x, y, width, height, minValue, maxValue, className) {
  valuesToPoints(values, x, y, width, height, minValue, maxValue).forEach((point) => {
    drawCircle(svg, point[0], point[1], 3.4, className);
  });
}

function drawBarChart(svg, values, x, y, width, height, title, className, options = {}) {
  const { zeroCentered = true, labels = [] } = options;
  const [minimum, maximum] = zeroCentered ? paddedExtent([values, [0]], 0.08) : paddedExtent([values], 0.08);
  drawChartFrame(svg, x, y, width, height, title, minimum, maximum, { zeroLine: zeroCentered });

  const zeroY = y + height - ((0 - minimum) / Math.max(maximum - minimum, EPSILON)) * height;
  const barWidth = width / Math.max(values.length, 1) - 6;

  values.forEach((value, index) => {
    const barX = x + index * (width / Math.max(values.length, 1)) + 3;
    const scaledHeight = (Math.abs(value) / Math.max(maximum - minimum, EPSILON)) * height;
    const barY = value >= 0 ? zeroY - scaledHeight : zeroY;
    drawRect(svg, barX, barY, Math.max(barWidth, 4), Math.max(scaledHeight, 1), className, { rx: 6 });

    if (labels[index]) {
      drawText(svg, barX + 2, y + height + 14, labels[index], "ts-svg-number");
    }
  });
}

function makeSeasonalNoise(index) {
  const season = SEASON_TEMPLATE[index % SEASON_TEMPLATE.length];
  const noise = NOISE_TEMPLATE[index % NOISE_TEMPLATE.length];
  return { season, noise };
}

function buildDecompositionSeries(length = 60, mode = "additive") {
  const trend = [];
  const seasonal = [];
  const remainder = [];
  const observed = [];

  for (let index = 0; index < length; index += 1) {
    const level = 12 + 0.16 * index + 0.22 * Math.sin(index / 8);
    const { season, noise } = makeSeasonalNoise(index);
    const rem = 0.32 * noise;
    trend.push(level);
    seasonal.push(0.95 * season);
    remainder.push(rem);

    if (mode === "multiplicative") {
      observed.push(level * (1 + 0.08 * season) * (1 + 0.03 * noise));
    } else {
      observed.push(level + 1.12 * season + rem);
    }
  }

  return { trend, seasonal, remainder, observed };
}

export function differenceSeries(values, lag = 1) {
  if (lag <= 0 || values.length <= lag) return [];
  const output = [];
  for (let index = lag; index < values.length; index += 1) {
    output.push(values[index] - values[index - lag]);
  }
  return output;
}

export function computeAcf(values, lagMax = 20) {
  const centeredValues = centered(values);
  const denominator = sum(centeredValues.map((value) => value * value));
  if (denominator < EPSILON) {
    return Array.from({ length: lagMax + 1 }, (_, index) => (index === 0 ? 1 : 0));
  }

  const result = [];
  for (let lag = 0; lag <= lagMax; lag += 1) {
    let numerator = 0;
    for (let index = lag; index < centeredValues.length; index += 1) {
      numerator += centeredValues[index] * centeredValues[index - lag];
    }
    result.push(numerator / denominator);
  }
  return result;
}

export function computePacf(values, lagMax = 20) {
  const acf = computeAcf(values, lagMax);
  const pacf = [1];
  const phi = Array.from({ length: lagMax + 1 }, () => Array(lagMax + 1).fill(0));
  const predictionVariance = Array(lagMax + 1).fill(0);
  predictionVariance[0] = 1;

  for (let k = 1; k <= lagMax; k += 1) {
    let accumulator = 0;
    for (let j = 1; j < k; j += 1) {
      accumulator += phi[k - 1][j] * acf[k - j];
    }

    const reflection = (acf[k] - accumulator) / Math.max(predictionVariance[k - 1], EPSILON);
    phi[k][k] = reflection;

    for (let j = 1; j < k; j += 1) {
      phi[k][j] = phi[k - 1][j] - reflection * phi[k - 1][k - j];
    }

    predictionVariance[k] = predictionVariance[k - 1] * (1 - reflection * reflection);
    pacf.push(clamp(reflection, -1, 1));
  }

  return pacf;
}

export function simulateArma({ phi = [], theta = [], n = 120, burnin = 80, seed = 1234 }) {
  const noise = gaussianGenerator(seed);
  const innovations = Array.from({ length: n + burnin + theta.length + 4 }, () => noise());
  const values = Array(n + burnin + phi.length + 4).fill(0);

  for (let index = 0; index < values.length; index += 1) {
    let nextValue = innovations[index];

    phi.forEach((coefficient, order) => {
      if (index - order - 1 >= 0) {
        nextValue += coefficient * values[index - order - 1];
      }
    });

    theta.forEach((coefficient, order) => {
      if (index - order - 1 >= 0) {
        nextValue += coefficient * innovations[index - order - 1];
      }
    });

    values[index] = nextValue;
  }

  return values.slice(burnin, burnin + n);
}

export function movingAverage(values, windowSize = 5) {
  if (!values.length) return [];
  const width = Math.max(1, Math.floor(windowSize));
  const output = [];

  for (let index = 0; index < values.length; index += 1) {
    const start = Math.max(0, index - width + 1);
    const segment = values.slice(start, index + 1);
    output.push(mean(segment));
  }

  return output;
}

export function simpleExponentialSmoothing(values, alpha = 0.35) {
  if (!values.length) return [];
  const output = [values[0]];
  let level = values[0];

  for (let index = 1; index < values.length; index += 1) {
    level = alpha * values[index] + (1 - alpha) * level;
    output.push(level);
  }

  return output;
}

function holtLinear(values, alpha = 0.35, beta = 0.15) {
  if (!values.length) return [];
  let level = values[0];
  let trend = values.length > 1 ? values[1] - values[0] : 0;
  const output = [level];

  for (let index = 1; index < values.length; index += 1) {
    const previousLevel = level;
    level = alpha * values[index] + (1 - alpha) * (level + trend);
    trend = beta * (level - previousLevel) + (1 - beta) * trend;
    output.push(level + trend);
  }

  return output;
}

function holtWintersAdditive(values, seasonLength = 12, alpha = 0.35, beta = 0.15, gamma = 0.2) {
  if (values.length <= seasonLength + 1) {
    return simpleExponentialSmoothing(values, alpha);
  }

  const seasonals = Array(seasonLength).fill(0);
  const firstSeason = values.slice(0, seasonLength);
  const secondSeason = values.slice(seasonLength, seasonLength * 2);
  const firstAverage = mean(firstSeason);
  const secondAverage = secondSeason.length ? mean(secondSeason) : firstAverage;
  let level = firstAverage;
  let trend = (secondAverage - firstAverage) / seasonLength;

  for (let index = 0; index < seasonLength; index += 1) {
    seasonals[index] = firstSeason[index] - firstAverage;
  }

  const output = [];
  for (let index = 0; index < values.length; index += 1) {
    const seasonIndex = index % seasonLength;
    const previousLevel = level;
    const seasonal = seasonals[seasonIndex];
    const fitted = index === 0 ? values[0] : level + trend + seasonal;
    output.push(fitted);
    level = alpha * (values[index] - seasonal) + (1 - alpha) * (level + trend);
    trend = beta * (level - previousLevel) + (1 - beta) * trend;
    seasonals[seasonIndex] = gamma * (values[index] - level) + (1 - gamma) * seasonal;
  }

  return output;
}

export function localLevelKalman(observations, processVariance = 0.18, observationVariance = 0.7) {
  if (!observations.length) {
    return { filtered: [], variances: [] };
  }

  const filtered = [];
  const variances = [];
  let meanState = observations[0];
  let varianceState = observationVariance;

  observations.forEach((observation) => {
    const priorMean = meanState;
    const priorVariance = varianceState + processVariance;
    const gain = priorVariance / Math.max(priorVariance + observationVariance, EPSILON);
    meanState = priorMean + gain * (observation - priorMean);
    varianceState = (1 - gain) * priorVariance;
    filtered.push(meanState);
    variances.push(varianceState);
  });

  return { filtered, variances };
}

export function rollingOriginSplits(length, initialWindow = 12, horizon = 4, folds = 5) {
  const result = [];

  for (let fold = 0; fold < folds; fold += 1) {
    const trainEnd = initialWindow + fold * horizon;
    const validationEnd = Math.min(trainEnd + horizon, length);
    result.push({
      trainStart: 0,
      trainEnd,
      validationStart: trainEnd,
      validationEnd,
      testStart: validationEnd,
      testEnd: Math.min(validationEnd + horizon, length)
    });
  }

  return result;
}

export function computePeriodogram(values) {
  const centeredValues = centered(values);
  const n = centeredValues.length;
  const frequencies = [];
  const powers = [];

  for (let k = 1; k <= Math.floor(n / 2); k += 1) {
    let real = 0;
    let imaginary = 0;
    for (let t = 0; t < n; t += 1) {
      const angle = (-2 * Math.PI * k * t) / n;
      real += centeredValues[t] * Math.cos(angle);
      imaginary += centeredValues[t] * Math.sin(angle);
    }
    frequencies.push(k / n);
    powers.push((real * real + imaginary * imaginary) / n);
  }

  return { frequencies, powers };
}

function estimateAr1(series) {
  const acf = computeAcf(series, 1);
  return clamp(acf[1] ?? 0, -0.92, 0.92);
}

function buildForecastSeries() {
  const { observed } = buildDecompositionSeries(84, "additive");
  return observed.map((value, index) => value + 0.08 * Math.sin(index / 2.4));
}

function oneStepResidualScale(series, fitted) {
  const residuals = series.map((value, index) => value - fitted[index]).slice(1);
  return Math.max(standardDeviation(residuals), 0.35);
}

export function forecastToyModel(train, model, horizon = 8, seasonLength = 12) {
  const last = train.at(-1);
  const first = train[0];
  let forecast = [];
  let intervalScale = 0.8;

  if (model === "rw") {
    forecast = Array.from({ length: horizon }, () => last);
    intervalScale = Math.max(standardDeviation(differenceSeries(train)), 0.35);
  } else if (model === "drift") {
    const slope = (last - first) / Math.max(train.length - 1, 1);
    forecast = Array.from({ length: horizon }, (_, index) => last + slope * (index + 1));
    intervalScale = Math.max(standardDeviation(differenceSeries(train)), 0.35);
  } else if (model === "seasonal") {
    forecast = Array.from({ length: horizon }, (_, index) => train[train.length - seasonLength + (index % seasonLength)]);
    intervalScale = Math.max(standardDeviation(differenceSeries(train, seasonLength)), 0.35);
  } else {
    const phi = estimateAr1(train);
    const mu = mean(train);
    let current = last;
    forecast = Array.from({ length: horizon }, () => {
      current = mu + phi * (current - mu);
      return current;
    });
    const fitted = [train[0]];
    for (let index = 1; index < train.length; index += 1) {
      fitted.push(mu + phi * (train[index - 1] - mu));
    }
    intervalScale = oneStepResidualScale(train, fitted);
  }

  const lower = forecast.map((value, index) => value - 1.28 * intervalScale * Math.sqrt(index + 1));
  const upper = forecast.map((value, index) => value + 1.28 * intervalScale * Math.sqrt(index + 1));
  return { forecast, lower, upper };
}

function buildKalmanScenario(length = 48) {
  const stateNoise = [0.15, -0.08, 0.14, -0.05, 0.11, -0.09, 0.06, -0.04];
  const obsNoise = [0.48, -0.6, 0.22, -0.26, 0.18, -0.42, 0.36, -0.16];
  const hidden = [];
  const observed = [];
  let level = 10;

  for (let index = 0; index < length; index += 1) {
    level += 0.12 + stateNoise[index % stateNoise.length];
    hidden.push(level + 0.3 * Math.sin(index / 5));
    observed.push(hidden[index] + obsNoise[index % obsNoise.length]);
  }

  return { hidden, observed };
}

function buildSpectralCase(caseName, length = 64) {
  const values = [];

  for (let index = 0; index < length; index += 1) {
    const annual = Math.sin((2 * Math.PI * index) / 12);
    const semi = 0.6 * Math.sin((2 * Math.PI * index) / 6);
    const trend = 0.05 * index;
    const noise = 0.18 * NOISE_TEMPLATE[index % NOISE_TEMPLATE.length];

    if (caseName === "mixed") {
      values.push(annual + semi + noise);
    } else if (caseName === "trend") {
      values.push(trend + annual + noise);
    } else if (caseName === "noise") {
      values.push(0.5 * NOISE_TEMPLATE[index % NOISE_TEMPLATE.length] + 0.2 * NOISE_TEMPLATE[(index + 3) % NOISE_TEMPLATE.length]);
    } else {
      values.push(annual + noise);
    }
  }

  return values;
}

function initDecompositionWidget(widget) {
  if (!widget) return;
  const canvas = widget.querySelector("[data-canvas]");
  const summary = widget.querySelector("[data-summary]");
  const buttons = Array.from(widget.querySelectorAll("[data-decomp-mode]"));
  const state = { mode: "additive" };

  function render() {
    clearChildren(canvas);
    const series = buildDecompositionSeries(48, state.mode);
    const svg = buildSvg(760, 560, "tda-widget-svg");
    const panels = [
      { title: "observed", values: series.observed, className: "ts-observed-line" },
      { title: "trend", values: series.trend, className: "ts-trend-line" },
      { title: "seasonal", values: series.seasonal, className: "ts-seasonal-line" },
      { title: "remainder", values: series.remainder, className: "ts-remainder-line" }
    ];

    panels.forEach((panel, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = 32 + column * 360;
      const y = 42 + row * 240;
      const [minValue, maxValue] = paddedExtent([panel.values], 0.15);
      drawChartFrame(svg, x, y, 300, 150, panel.title, minValue, maxValue);
      drawLineSeries(svg, panel.values, x + 10, y + 12, 280, 126, minValue, maxValue, panel.className);
    });

    canvas.appendChild(svg);

    if (summary) {
      summary.innerHTML =
        `<strong>${state.mode === "additive" ? "Additive" : "Multiplicative"} decomposition intuition</strong>: the same observed series can be read either as level plus components or as level times relative seasonal and noise effects.<br>` +
        "The multiplicative view becomes especially natural when fluctuations grow as the level grows.";
    }
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.decompMode;
      buttons.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  render();
}

function initDifferencingWidget(widget) {
  if (!widget) return;
  const canvas = widget.querySelector("[data-canvas]");
  const summary = widget.querySelector("[data-summary]");
  const buttons = Array.from(widget.querySelectorAll("[data-diff-mode]"));
  const state = { mode: "raw" };
  const raw = buildDecompositionSeries(72, "additive").observed.map((value, index) => value + 0.05 * index);

  function transformedSeries() {
    if (state.mode === "regular") return differenceSeries(raw, 1);
    if (state.mode === "seasonal") return differenceSeries(raw, SEASON_LENGTH);
    if (state.mode === "both") return differenceSeries(differenceSeries(raw, SEASON_LENGTH), 1);
    return raw;
  }

  function render() {
    clearChildren(canvas);
    const transformed = transformedSeries();
    const acf = computeAcf(transformed, 12).slice(1);
    const svg = buildSvg(760, 520, "tda-widget-svg");

    let [minRaw, maxRaw] = paddedExtent([raw], 0.12);
    drawChartFrame(svg, 32, 44, 690, 130, "original series", minRaw, maxRaw);
    drawLineSeries(svg, raw, 42, 56, 670, 102, minRaw, maxRaw, "ts-observed-line");

    const [minTransformed, maxTransformed] = paddedExtent([transformed], 0.12);
    drawChartFrame(svg, 32, 216, 690, 120, "transformed series", minTransformed, maxTransformed, { zeroLine: true });
    drawLineSeries(svg, transformed, 42, 228, 670, 92, minTransformed, maxTransformed, "ts-state-line");

    drawBarChart(
      svg,
      acf,
      32,
      382,
      690,
      102,
      "sample ACF after the chosen transformation",
      "ts-bar is-yellow",
      { zeroCentered: true, labels: acf.map((_, index) => String(index + 1)) }
    );

    canvas.appendChild(svg);

    const labels = {
      raw: "raw series",
      regular: "first difference",
      seasonal: "seasonal difference",
      both: "seasonal + first difference"
    };

    if (summary) {
      summary.innerHTML =
        `<strong>${labels[state.mode]}</strong>: differencing changes the dependence structure as well as the mean behavior.<br>` +
        "Regular differencing attacks low-frequency drift, seasonal differencing attacks periodic repetition, and both together should only be used when the data justify them.";
    }
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.diffMode;
      buttons.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  render();
}

function initAcfWidget(widget) {
  if (!widget) return;
  const canvas = widget.querySelector("[data-canvas]");
  const summary = widget.querySelector("[data-summary]");
  const buttons = Array.from(widget.querySelectorAll("[data-acf-model]"));
  const slider = widget.querySelector("[data-acf-strength]");
  const label = widget.querySelector("[data-acf-strength-label]");
  const state = { model: "ar1", strength: 0.6 };

  function modelParameters() {
    if (state.model === "ma1") return { phi: [], theta: [state.strength] };
    if (state.model === "ar2") return { phi: [state.strength, -0.28], theta: [] };
    if (state.model === "arma11") return { phi: [0.5 * state.strength + 0.18], theta: [0.55 * state.strength] };
    return { phi: [state.strength], theta: [] };
  }

  function render() {
    clearChildren(canvas);
    const parameters = modelParameters();
    const series = simulateArma({ ...parameters, n: 110, burnin: 90, seed: 2026 });
    const acf = computeAcf(series, 12).slice(1);
    const pacf = computePacf(series, 12).slice(1);
    const svg = buildSvg(760, 520, "tda-widget-svg");
    const [minSeries, maxSeries] = paddedExtent([series], 0.15);

    drawChartFrame(svg, 32, 42, 690, 150, "simulated series", minSeries, maxSeries, { zeroLine: true });
    drawLineSeries(svg, series, 42, 54, 670, 122, minSeries, maxSeries, "ts-observed-line");

    drawBarChart(
      svg,
      acf,
      32,
      244,
      320,
      220,
      "ACF",
      "ts-bar is-blue",
      { zeroCentered: true, labels: acf.map((_, index) => String(index + 1)) }
    );
    drawBarChart(
      svg,
      pacf,
      402,
      244,
      320,
      220,
      "PACF",
      "ts-bar is-green",
      { zeroCentered: true, labels: pacf.map((_, index) => String(index + 1)) }
    );

    canvas.appendChild(svg);

    if (label) {
      label.textContent = formatNumber(state.strength, 2);
    }

    const explanations = {
      ar1: "AR behavior tends to leave a more persistent ACF and a PACF with a sharper early cutoff in the idealized low-order case.",
      ma1: "MA behavior tends to cut off in the ACF more quickly while the PACF decays more gradually.",
      ar2: "AR(2) patterns can oscillate, so the ACF itself may alternate or decay in waves rather than monotonically.",
      arma11: "Mixed ARMA structure blurs the clean textbook patterns and is one reason identification should not rely on one picture alone."
    };

    if (summary) {
      summary.innerHTML = `<strong>${state.model.toUpperCase()}</strong>: ${explanations[state.model]}`;
    }
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      state.model = button.dataset.acfModel;
      buttons.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  slider?.addEventListener("input", (event) => {
    state.strength = Number(event.target.value);
    render();
  });

  render();
}

function initForecastWidget(widget) {
  if (!widget) return;
  const canvas = widget.querySelector("[data-canvas]");
  const summary = widget.querySelector("[data-summary]");
  const buttons = Array.from(widget.querySelectorAll("[data-forecast-model]"));
  const slider = widget.querySelector("[data-forecast-horizon]");
  const label = widget.querySelector("[data-forecast-horizon-label]");
  const state = { model: "ar1", horizon: 8 };
  const fullSeries = buildForecastSeries();
  const train = fullSeries.slice(0, 72);
  const truth = fullSeries.slice(72);

  function render() {
    clearChildren(canvas);
    const { forecast, lower, upper } = forecastToyModel(train, state.model, state.horizon, SEASON_LENGTH);
    const displayedTruth = truth.slice(0, state.horizon);
    const plotSeries = [...train, ...forecast, ...displayedTruth];
    const [minValue, maxValue] = paddedExtent([plotSeries, lower, upper], 0.12);
    const svg = buildSvg(760, 360, "tda-widget-svg");

    drawChartFrame(svg, 32, 44, 690, 220, "training sample, forecast, and realized future", minValue, maxValue);
    drawLineSeries(svg, train, 42, 56, 560, 190, minValue, maxValue, "ts-observed-line");

    const forecastX = 42 + (560 / Math.max(train.length - 1, 1)) * (train.length - 1);
    const horizonWidth = 150;
    drawBand(svg, lower, upper, forecastX, 56, horizonWidth, 190, minValue, maxValue);
    drawLineSeries(svg, [train.at(-1), ...forecast], forecastX, 56, horizonWidth, 190, minValue, maxValue, "ts-forecast-line");
    drawLineSeries(svg, [train.at(-1), ...displayedTruth], forecastX, 56, horizonWidth, 190, minValue, maxValue, "ts-state-line");

    drawText(svg, 610, 82, "forecast", "ts-svg-small");
    drawText(svg, 610, 104, "realized future", "ts-svg-small");
    drawLine(svg, 560, 78, 600, 78, "ts-forecast-line");
    drawLine(svg, 560, 100, 600, 100, "ts-state-line");
    drawRect(svg, 560, 118, 40, 16, "ts-range-fill", { rx: 8 });
    drawText(svg, 610, 130, "80% interval", "ts-svg-small");

    canvas.appendChild(svg);

    if (label) {
      label.textContent = String(state.horizon);
    }

    const descriptions = {
      ar1: "ARIMA(1,0,0) pulls forecasts back toward a long-run mean when persistence is strong but stationary.",
      rw: "ARIMA(0,1,0) is the random-walk benchmark: the best forecast is the last value.",
      drift: "ARIMA(0,1,0)+drift extrapolates the average incremental change rather than only the last level.",
      seasonal: "Seasonal naive repeats the last full seasonal cycle and is often a brutally strong baseline."
    };

    if (summary) {
      summary.innerHTML = `<strong>${descriptions[state.model]}</strong>`;
    }
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      state.model = button.dataset.forecastModel;
      buttons.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  slider?.addEventListener("input", (event) => {
    state.horizon = Number(event.target.value);
    render();
  });

  render();
}

function initSmoothingWidget(widget) {
  if (!widget) return;
  const canvas = widget.querySelector("[data-canvas]");
  const summary = widget.querySelector("[data-summary]");
  const buttons = Array.from(widget.querySelectorAll("[data-smooth-model]"));
  const slider = widget.querySelector("[data-smooth-alpha]");
  const label = widget.querySelector("[data-smooth-alpha-label]");
  const state = { model: "moving", alpha: 0.35 };
  const series = buildDecompositionSeries(60, "additive").observed;

  function fittedSeries() {
    if (state.model === "ses") return simpleExponentialSmoothing(series, state.alpha);
    if (state.model === "holt") return holtLinear(series, state.alpha, clamp(state.alpha * 0.45, 0.08, 0.35));
    if (state.model === "hw") return holtWintersAdditive(series, SEASON_LENGTH, state.alpha, 0.16, 0.22);
    const width = Math.max(3, Math.round(3 + state.alpha * 10));
    return movingAverage(series, width);
  }

  function render() {
    clearChildren(canvas);
    const fitted = fittedSeries();
    const [minValue, maxValue] = paddedExtent([series, fitted], 0.12);
    const svg = buildSvg(760, 360, "tda-widget-svg");

    drawChartFrame(svg, 32, 44, 690, 220, "observed series and smoothed estimate", minValue, maxValue);
    drawLineSeries(svg, series, 42, 56, 670, 190, minValue, maxValue, "ts-observed-line");
    drawLineSeries(svg, fitted, 42, 56, 670, 190, minValue, maxValue, "ts-trend-line");

    drawLine(svg, 74, 302, 118, 302, "ts-observed-line");
    drawText(svg, 126, 306, "observed", "ts-svg-small");
    drawLine(svg, 214, 302, 258, 302, "ts-trend-line");
    drawText(svg, 266, 306, "smoothed / fitted", "ts-svg-small");

    canvas.appendChild(svg);

    if (label) {
      label.textContent = formatNumber(state.alpha, 2);
    }

    const descriptions = {
      moving: "Moving averages smooth by local window averaging, which is simple but lagging and not model-based.",
      ses: "Simple exponential smoothing is well-suited to level-only series and emphasizes recent observations.",
      holt: "Holt adds an evolving trend component, allowing the fitted line to adapt more quickly to level drift.",
      hw: "Holt-Winters explicitly updates level, trend, and seasonality, so repeated seasonal structure can be tracked."
    };

    if (summary) {
      summary.innerHTML = `<strong>${descriptions[state.model]}</strong>`;
    }
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      state.model = button.dataset.smoothModel;
      buttons.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  slider?.addEventListener("input", (event) => {
    state.alpha = Number(event.target.value);
    render();
  });

  render();
}

function initKalmanWidget(widget) {
  if (!widget) return;
  const canvas = widget.querySelector("[data-canvas]");
  const summary = widget.querySelector("[data-summary]");
  const sliderR = widget.querySelector("[data-kalman-r]");
  const sliderQ = widget.querySelector("[data-kalman-q]");
  const labelR = widget.querySelector("[data-kalman-r-label]");
  const labelQ = widget.querySelector("[data-kalman-q-label]");
  const state = { r: 0.7, q: 0.18 };
  const scenario = buildKalmanScenario(48);

  function render() {
    clearChildren(canvas);
    const { filtered } = localLevelKalman(scenario.observed, state.q, state.r);
    const [minValue, maxValue] = paddedExtent([scenario.hidden, scenario.observed, filtered], 0.12);
    const svg = buildSvg(760, 360, "tda-widget-svg");

    drawChartFrame(svg, 32, 44, 690, 220, "hidden state, noisy observations, filtered estimate", minValue, maxValue);
    drawLineSeries(svg, scenario.hidden, 42, 56, 670, 190, minValue, maxValue, "ts-state-line");
    drawScatterSeries(svg, scenario.observed, 42, 56, 670, 190, minValue, maxValue, "ts-point is-yellow");
    drawLineSeries(svg, filtered, 42, 56, 670, 190, minValue, maxValue, "ts-forecast-line");

    drawLine(svg, 54, 302, 98, 302, "ts-state-line");
    drawText(svg, 106, 306, "latent state", "ts-svg-small");
    drawLine(svg, 212, 302, 256, 302, "ts-forecast-line");
    drawText(svg, 264, 306, "filtered estimate", "ts-svg-small");
    drawCircle(svg, 398, 302, 4.2, "ts-point is-yellow");
    drawText(svg, 410, 306, "observation", "ts-svg-small");

    canvas.appendChild(svg);

    if (labelR) labelR.textContent = formatNumber(state.r, 2);
    if (labelQ) labelQ.textContent = formatNumber(state.q, 2);

    if (summary) {
      summary.innerHTML =
        `<strong>Kalman balance</strong>: with observation noise ${formatNumber(state.r, 2)} and state variance ${formatNumber(state.q, 2)}, the filter decides how much to trust the new point versus the model-based prior.<br>` +
        "Larger observation noise makes the filtered path smoother; larger state variance makes it more responsive.";
    }
  }

  sliderR?.addEventListener("input", (event) => {
    state.r = Number(event.target.value);
    render();
  });

  sliderQ?.addEventListener("input", (event) => {
    state.q = Number(event.target.value);
    render();
  });

  render();
}

function initRollingOriginWidget(widget) {
  if (!widget) return;
  const canvas = widget.querySelector("[data-canvas]");
  const summary = widget.querySelector("[data-summary]");
  const buttons = Array.from(widget.querySelectorAll("[data-eval-mode]"));
  const slider = widget.querySelector("[data-eval-fold]");
  const label = widget.querySelector("[data-eval-fold-label]");
  const state = { mode: "rolling", fold: 3 };
  const splits = rollingOriginSplits(30, 10, 4, 5);
  const shuffledTrain = [1, 2, 5, 7, 8, 10, 14, 18, 21, 26];
  const shuffledTest = [3, 9, 15, 28];

  function render() {
    clearChildren(canvas);
    const svg = buildSvg(760, 280, "tda-widget-svg");
    drawText(svg, 32, 30, "temporal validation layout", "ts-svg-label");
    drawLine(svg, 44, 150, 704, 150, "ts-axis");

    for (let index = 0; index < 30; index += 1) {
      const x = 44 + index * 22;
      drawLine(svg, x, 142, x, 158, "ts-grid-line");
      drawText(svg, x - 4, 172, String(index + 1), "ts-svg-number");
    }

    if (state.mode === "rolling") {
      const split = splits[state.fold - 1];
      drawRect(svg, 44 + split.trainStart * 22, 100, (split.trainEnd - split.trainStart) * 22, 28, "ts-window train", { rx: 12 });
      drawRect(
        svg,
        44 + split.validationStart * 22,
        100,
        (split.validationEnd - split.validationStart) * 22,
        28,
        "ts-window validation",
        { rx: 12 }
      );
      drawRect(svg, 44 + split.testStart * 22, 100, (split.testEnd - split.testStart) * 22, 28, "ts-window test", { rx: 12 });

      drawText(svg, 46, 84, "train", "ts-svg-small");
      drawText(svg, 46 + split.validationStart * 22, 84, "validation", "ts-svg-small");
      drawText(svg, 46 + split.testStart * 22, 84, "future holdout", "ts-svg-small");
    } else {
      shuffledTrain.forEach((index) => {
        drawRect(svg, 44 + (index - 1) * 22, 98, 18, 32, "ts-window shuffle", { rx: 9 });
      });
      shuffledTest.forEach((index) => {
        drawRect(svg, 44 + (index - 1) * 22, 98, 18, 32, "ts-window validation", { rx: 9 });
      });
      drawText(svg, 46, 84, "mixed train/test positions", "ts-svg-small");
    }

    drawRect(svg, 78, 214, 26, 14, "ts-window train", { rx: 7 });
    drawText(svg, 112, 226, "train", "ts-svg-small");
    drawRect(svg, 198, 214, 26, 14, "ts-window validation", { rx: 7 });
    drawText(svg, 232, 226, "validation", "ts-svg-small");
    drawRect(svg, 336, 214, 26, 14, state.mode === "rolling" ? "ts-window test" : "ts-window shuffle", { rx: 7 });
    drawText(svg, 370, 226, state.mode === "rolling" ? "future holdout" : "leakage risk", "ts-svg-small");

    canvas.appendChild(svg);

    if (label) {
      label.textContent = String(state.fold);
    }

    if (summary) {
      summary.innerHTML =
        state.mode === "rolling"
          ? "<strong>Rolling origin</strong>: each fold trains on the past and evaluates on the future, which preserves the real forecasting constraint."
          : "<strong>Random shuffle</strong>: temporally mixed splits leak future information and no longer evaluate a genuine forecasting problem.";
    }
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.evalMode;
      buttons.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  slider?.addEventListener("input", (event) => {
    state.fold = Number(event.target.value);
    render();
  });

  render();
}

function initSpectralWidget(widget) {
  if (!widget) return;
  const canvas = widget.querySelector("[data-canvas]");
  const summary = widget.querySelector("[data-summary]");
  const buttons = Array.from(widget.querySelectorAll("[data-spectral-case]"));
  const state = { caseName: "annual" };

  function render() {
    clearChildren(canvas);
    const series = buildSpectralCase(state.caseName, 72);
    const { frequencies, powers } = computePeriodogram(series);
    const svg = buildSvg(760, 380, "tda-widget-svg");
    const [minSeries, maxSeries] = paddedExtent([series], 0.12);

    drawChartFrame(svg, 32, 44, 320, 230, "series in time", minSeries, maxSeries, { zeroLine: true });
    drawLineSeries(svg, series, 42, 56, 300, 200, minSeries, maxSeries, "ts-observed-line");

    const powerLabels = frequencies.map((frequency) => frequency.toFixed(2));
    drawBarChart(svg, powers.slice(0, 12), 402, 44, 320, 230, "periodogram", "ts-bar is-green", {
      zeroCentered: false,
      labels: powerLabels.slice(0, 12)
    });

    canvas.appendChild(svg);

    const explanations = {
      annual: "One dominant period creates one strong peak in the spectrum.",
      mixed: "Multiple periodic components create multiple peaks, even when the time-domain plot looks visually tangled.",
      trend: "A trend injects low-frequency power, so the spectrum highlights slow variation as well as seasonality.",
      noise: "Pure noise spreads energy broadly rather than concentrating it at clear frequencies."
    };

    if (summary) {
      summary.innerHTML = `<strong>${explanations[state.caseName]}</strong>`;
    }
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      state.caseName = button.dataset.spectralCase;
      buttons.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  render();
}

export function enhanceTimeSeriesNotesPage(root = document) {
  const page = enhanceMathNotebookPage(root, {
    bodyClass: "ts-notes-page"
  });

  if (!page) {
    return null;
  }

  initDecompositionWidget(page.querySelector('[data-widget="decomposition-explorer"]'));
  initAcfWidget(page.querySelector('[data-widget="acf-simulator"]'));
  initDifferencingWidget(page.querySelector('[data-widget="differencing-demo"]'));
  initForecastWidget(page.querySelector('[data-widget="forecast-demo"]'));
  initSmoothingWidget(page.querySelector('[data-widget="smoothing-demo"]'));
  initKalmanWidget(page.querySelector('[data-widget="kalman-demo"]'));
  initRollingOriginWidget(page.querySelector('[data-widget="rolling-origin-demo"]'));
  initSpectralWidget(page.querySelector('[data-widget="spectral-demo"]'));

  return page;
}
