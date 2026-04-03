import { buildSvg, clearChildren, createSvgElement, enhanceMathNotebookPage } from "./math-notebook.js";
import { localMleFromSortedDistances } from "./id-estimator.js";

const EPSILON = 1e-9;

const METRIC_POINTS = [
  { label: "a", vector: [2.7, 0.55], accent: "is-yellow" },
  { label: "b", vector: [0.86, 1.08], accent: "is-green" },
  { label: "c", vector: [-0.72, 1.38], accent: "is-pink" },
  { label: "d", vector: [-1.28, -0.08], accent: "is-yellow" },
  { label: "e", vector: [0.28, -1.02], accent: "is-green" }
];

const METRIC_QUERY = { label: "q", vector: [1.0, 0.18], accent: "is-query" };

const SENTENCE_LABELS = [
  "cat sleeps on mat",
  "kitten rests on rug",
  "movie was great",
  "film was fantastic"
];

const SENTENCE_MODES = {
  cls: {
    label: "CLS pooling",
    description: "The points stay in one generic region; sentence meaning is not sharply organized.",
    vectors: [
      [0.52, 0.46, 0.14],
      [0.50, 0.42, 0.18],
      [0.47, 0.36, -0.03],
      [0.49, 0.34, -0.02]
    ]
  },
  mean: {
    label: "mean pooling",
    description: "Mean pooling separates the two semantic pairs more cleanly.",
    vectors: [
      [0.92, 0.68, 0.08],
      [0.88, 0.64, 0.1],
      [-0.7, 0.82, -0.12],
      [-0.66, 0.77, -0.1]
    ]
  },
  max: {
    label: "max pooling",
    description: "Max pooling emphasizes a few strong token directions and can be less stable geometrically.",
    vectors: [
      [0.82, 0.2, 0.58],
      [0.77, 0.27, 0.53],
      [-0.12, 0.88, 0.51],
      [-0.16, 0.84, 0.49]
    ]
  },
  contrastive: {
    label: "contrastive sentence model",
    description: "Contrastive training pulls positives together and spreads the global space more evenly.",
    vectors: [
      [0.96, 0.28, 0.04],
      [0.94, 0.31, 0.05],
      [-0.24, 0.97, -0.03],
      [-0.29, 0.95, -0.02]
    ]
  }
};

const SPECTRAL_PRESETS = {
  flat: {
    label: "flat spectrum",
    eigenvalues: [1, 1, 1, 1, 1, 1, 1, 1]
  },
  rank2: {
    label: "rank-2 structure",
    eigenvalues: [4.5, 3.8, 0.25, 0.18, 0.12, 0.08, 0.05, 0.02]
  },
  power: {
    label: "power-law tail",
    eigenvalues: [3.6, 1.9, 1.1, 0.72, 0.5, 0.36, 0.24, 0.16]
  },
  spiky: {
    label: "spiky anisotropy",
    eigenvalues: [6.2, 1.1, 0.74, 0.48, 0.3, 0.21, 0.13, 0.08]
  }
};

const ID_PRESETS = {
  line: {
    label: "line in 3D",
    ambientDimension: 3,
    targetDimension: "about 1 locally"
  },
  plane: {
    label: "plane in 10D",
    ambientDimension: 10,
    targetDimension: "about 2"
  },
  curve: {
    label: "curved 1D manifold in 8D",
    ambientDimension: 8,
    targetDimension: "about 1 locally, larger linear rank globally"
  },
  cloud: {
    label: "noisy cloud in 10D",
    ambientDimension: 10,
    targetDimension: "close to ambient"
  }
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function mean(values) {
  return values.length ? sum(values) / values.length : NaN;
}

function square(value) {
  return value * value;
}

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return "—";
  return Number(value).toFixed(digits);
}

export function dotProduct(left, right) {
  let total = 0;
  for (let index = 0; index < left.length; index += 1) {
    total += left[index] * right[index];
  }
  return total;
}

export function vectorNorm(vector) {
  return Math.sqrt(dotProduct(vector, vector));
}

export function l2Normalize(vector) {
  const norm = vectorNorm(vector);
  if (!(norm > EPSILON)) {
    return vector.map(() => 0);
  }
  return vector.map((value) => value / norm);
}

export function cosineSimilarity(left, right) {
  const leftNorm = vectorNorm(left);
  const rightNorm = vectorNorm(right);
  if (!(leftNorm > EPSILON) || !(rightNorm > EPSILON)) {
    return NaN;
  }
  return dotProduct(left, right) / (leftNorm * rightNorm);
}

export function euclideanDistance(left, right) {
  let total = 0;
  for (let index = 0; index < left.length; index += 1) {
    total += square(left[index] - right[index]);
  }
  return Math.sqrt(total);
}

export function manhattanDistance(left, right) {
  let total = 0;
  for (let index = 0; index < left.length; index += 1) {
    total += Math.abs(left[index] - right[index]);
  }
  return total;
}

function metricValue(metric, left, right) {
  if (metric === "cosine") return cosineSimilarity(left, right);
  if (metric === "dot") return dotProduct(left, right);
  if (metric === "euclidean") return euclideanDistance(left, right);
  if (metric === "manhattan") return manhattanDistance(left, right);
  return NaN;
}

function metricIsDistance(metric) {
  return metric === "euclidean" || metric === "manhattan";
}

function comparableScore(metric, left, right) {
  const value = metricValue(metric, left, right);
  return metricIsDistance(metric) ? -value : value;
}

function prepareVector(vector, normalize) {
  return normalize ? l2Normalize(vector) : vector.slice();
}

export function nearestNeighborOrder(points, query, metric, normalize = false) {
  return points
    .map((point, index) => {
      const preparedPoint = prepareVector(point.vector ?? point, normalize);
      const preparedQuery = prepareVector(query.vector ?? query, normalize);
      return {
        index,
        label: point.label ?? String(index),
        vector: preparedPoint,
        rawVector: point.vector ?? point,
        value: metricValue(metric, preparedQuery, preparedPoint),
        score: comparableScore(metric, preparedQuery, preparedPoint),
        accent: point.accent ?? "is-blue"
      };
    })
    .sort((left, right) => right.score - left.score);
}

function scale(value, domainMin, domainMax, rangeMin, rangeMax) {
  if (Math.abs(domainMax - domainMin) <= EPSILON) {
    return (rangeMin + rangeMax) / 2;
  }
  return rangeMin + ((value - domainMin) / (domainMax - domainMin)) * (rangeMax - rangeMin);
}

function extent(values) {
  let min = Infinity;
  let max = -Infinity;
  values.forEach((value) => {
    if (value < min) min = value;
    if (value > max) max = value;
  });
  return [min, max];
}

function drawText(svg, x, y, text, className = "emb-svg-small", attrs = {}) {
  const node = createSvgElement("text", { x, y, class: className, ...attrs });
  node.textContent = text;
  svg.appendChild(node);
  return node;
}

function drawLine(svg, x1, y1, x2, y2, className = "emb-axis", attrs = {}) {
  svg.appendChild(createSvgElement("line", { x1, y1, x2, y2, class: className, ...attrs }));
}

function drawCircle(svg, cx, cy, r, className, attrs = {}) {
  svg.appendChild(createSvgElement("circle", { cx, cy, r, class: className, ...attrs }));
}

function drawRect(svg, x, y, width, height, className, attrs = {}) {
  svg.appendChild(createSvgElement("rect", { x, y, width, height, class: className, ...attrs }));
}

function pathFromPoints(points) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point[0].toFixed(2)} ${point[1].toFixed(2)}`)
    .join(" ");
}

function drawPath(svg, points, className, attrs = {}) {
  svg.appendChild(createSvgElement("path", { d: pathFromPoints(points), class: className, ...attrs }));
}

function addScatterAxes(svg, bounds) {
  const { left, top, width, height } = bounds;
  drawLine(svg, left, top + height, left + width, top + height, "emb-axis");
  drawLine(svg, left, top, left, top + height, "emb-axis");
}

function positionScatterPoints(vectors, bounds) {
  const xs = vectors.map((vector) => vector[0]);
  const ys = vectors.map((vector) => vector[1]);
  const [xMinRaw, xMaxRaw] = extent(xs);
  const [yMinRaw, yMaxRaw] = extent(ys);
  const xPad = Math.max(0.22, (xMaxRaw - xMinRaw) * 0.18);
  const yPad = Math.max(0.22, (yMaxRaw - yMinRaw) * 0.18);
  const xMin = xMinRaw - xPad;
  const xMax = xMaxRaw + xPad;
  const yMin = yMinRaw - yPad;
  const yMax = yMaxRaw + yPad;

  return vectors.map((vector) => ({
    x: scale(vector[0], xMin, xMax, bounds.left + 18, bounds.left + bounds.width - 18),
    y: scale(vector[1], yMin, yMax, bounds.top + bounds.height - 18, bounds.top + 18)
  }));
}

function positionUnitCirclePoints(vectors, cx, cy, radius) {
  return vectors.map((vector) => ({
    x: cx + vector[0] * radius,
    y: cy - vector[1] * radius
  }));
}

function createUnitCirclePath(cx, cy, radius) {
  return `M ${cx - radius} ${cy}
    a ${radius} ${radius} 0 1 0 ${radius * 2} 0
    a ${radius} ${radius} 0 1 0 ${-radius * 2} 0`;
}

function addUnitCircle(svg, cx, cy, radius) {
  svg.appendChild(createSvgElement("path", { d: createUnitCirclePath(cx, cy, radius), class: "emb-unit-circle" }));
}

export function participationRatio(values) {
  const filtered = values.filter((value) => value > EPSILON);
  if (!filtered.length) return NaN;
  const numerator = square(sum(filtered));
  const denominator = sum(filtered.map((value) => value * value));
  return denominator > EPSILON ? numerator / denominator : NaN;
}

export function effectiveRank(values) {
  const filtered = values.filter((value) => value > EPSILON);
  const total = sum(filtered);
  if (!(total > EPSILON)) return NaN;
  const entropy = -filtered.reduce((accumulator, value) => {
    const probability = value / total;
    return accumulator + probability * Math.log(probability);
  }, 0);
  return Math.exp(entropy);
}

export function explainedVariance(values, k) {
  const filtered = values.filter((value) => value > EPSILON);
  const total = sum(filtered);
  if (!(total > EPSILON)) return NaN;
  return sum(filtered.slice(0, k)) / total;
}

export function jacobiEigenvaluesSymmetric(matrix, maxIterations = 120, tolerance = 1e-10) {
  if (!matrix.length) return [];
  const n = matrix.length;
  const a = matrix.map((row) => row.slice());

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let p = 0;
    let q = 1;
    let maxOffDiagonal = 0;

    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const value = Math.abs(a[i][j]);
        if (value > maxOffDiagonal) {
          maxOffDiagonal = value;
          p = i;
          q = j;
        }
      }
    }

    if (maxOffDiagonal < tolerance) {
      break;
    }

    const app = a[p][p];
    const aqq = a[q][q];
    const apq = a[p][q];
    const phi = 0.5 * Math.atan2(2 * apq, aqq - app);
    const cosine = Math.cos(phi);
    const sine = Math.sin(phi);

    for (let i = 0; i < n; i += 1) {
      if (i === p || i === q) continue;
      const aip = a[i][p];
      const aiq = a[i][q];
      a[i][p] = cosine * aip - sine * aiq;
      a[p][i] = a[i][p];
      a[i][q] = sine * aip + cosine * aiq;
      a[q][i] = a[i][q];
    }

    a[p][p] = cosine * cosine * app - 2 * sine * cosine * apq + sine * sine * aqq;
    a[q][q] = sine * sine * app + 2 * sine * cosine * apq + cosine * cosine * aqq;
    a[p][q] = 0;
    a[q][p] = 0;
  }

  return a
    .map((row, index) => row[index])
    .sort((left, right) => right - left);
}

function centerVectors(vectors) {
  const dimension = vectors[0].length;
  const meanVector = Array(dimension).fill(0);
  vectors.forEach((vector) => {
    for (let index = 0; index < dimension; index += 1) {
      meanVector[index] += vector[index];
    }
  });
  for (let index = 0; index < dimension; index += 1) {
    meanVector[index] /= vectors.length;
  }
  return vectors.map((vector) => vector.map((value, index) => value - meanVector[index]));
}

export function covarianceEigenvalues(vectors) {
  if (!vectors.length) return [];
  const centered = centerVectors(vectors);
  const dimension = centered[0].length;
  const covariance = Array.from({ length: dimension }, () => Array(dimension).fill(0));

  centered.forEach((vector) => {
    for (let i = 0; i < dimension; i += 1) {
      for (let j = i; j < dimension; j += 1) {
        covariance[i][j] += vector[i] * vector[j];
      }
    }
  });

  const scaleFactor = 1 / Math.max(1, centered.length);
  for (let i = 0; i < dimension; i += 1) {
    for (let j = i; j < dimension; j += 1) {
      covariance[i][j] *= scaleFactor;
      covariance[j][i] = covariance[i][j];
    }
  }

  return jacobiEigenvaluesSymmetric(covariance).filter((value) => value > EPSILON);
}

function pairwiseSortedDistances(vectors) {
  return vectors.map((vector, index) => {
    const distances = [];
    for (let otherIndex = 0; otherIndex < vectors.length; otherIndex += 1) {
      if (index === otherIndex) continue;
      distances.push(euclideanDistance(vector, vectors[otherIndex]));
    }
    distances.sort((left, right) => left - right);
    return distances;
  });
}

export function averageLocalMle(vectors, k) {
  const estimates = pairwiseSortedDistances(vectors)
    .map((distances) => localMleFromSortedDistances(distances, k))
    .filter(Number.isFinite);
  return estimates.length ? mean(estimates) : NaN;
}

function mulberry32(seed) {
  let current = seed >>> 0;
  return function next() {
    current += 0x6d2b79f5;
    let t = current;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng) {
  const u = Math.max(rng(), EPSILON);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function randomVector(dimension, rng) {
  return Array.from({ length: dimension }, () => gaussian(rng));
}

function generateIdCloud(presetKey, count = 120) {
  const rng = mulberry32(248 + presetKey.length * 13);
  const vectors = [];

  if (presetKey === "line") {
    for (let index = 0; index < count; index += 1) {
      const t = -1.35 + (2.7 * index) / (count - 1);
      vectors.push([t, 0.04 * gaussian(rng), 0.04 * gaussian(rng)]);
    }
  }

  if (presetKey === "plane") {
    for (let index = 0; index < count; index += 1) {
      const u = -1 + 2 * rng();
      const v = -1 + 2 * rng();
      const extra = Array.from({ length: 8 }, () => 0.03 * gaussian(rng));
      vectors.push([u, v, ...extra]);
    }
  }

  if (presetKey === "curve") {
    for (let index = 0; index < count; index += 1) {
      const t = (2 * Math.PI * index) / count;
      vectors.push([
        Math.cos(t),
        Math.sin(t),
        0.32 * Math.cos(2 * t),
        0.2 * Math.sin(3 * t),
        0.05 * gaussian(rng),
        0.05 * gaussian(rng),
        0.05 * gaussian(rng),
        0.05 * gaussian(rng)
      ]);
    }
  }

  if (presetKey === "cloud") {
    for (let index = 0; index < count; index += 1) {
      const vector = randomVector(10, rng);
      vectors.push(vector.map((value) => value * 0.65));
    }
  }

  return vectors;
}

function projectToFirstTwo(vectors) {
  return vectors.map((vector) => [vector[0] ?? 0, vector[1] ?? 0]);
}

export function kOccurrenceCounts(vectors, k, metric = "euclidean", normalize = false) {
  const prepared = vectors.map((vector) => prepareVector(vector, normalize));
  const counts = Array(vectors.length).fill(0);

  for (let queryIndex = 0; queryIndex < prepared.length; queryIndex += 1) {
    const scores = [];
    for (let pointIndex = 0; pointIndex < prepared.length; pointIndex += 1) {
      if (queryIndex === pointIndex) continue;
      scores.push({
        index: pointIndex,
        score: comparableScore(metric, prepared[queryIndex], prepared[pointIndex])
      });
    }
    scores.sort((left, right) => right.score - left.score);
    scores.slice(0, k).forEach((item) => {
      counts[item.index] += 1;
    });
  }

  return counts;
}

export function alignmentScore(pairs) {
  if (!pairs.length) return NaN;
  return mean(pairs.map(([left, right]) => square(euclideanDistance(left, right))));
}

export function uniformityScore(points, temperature = 2) {
  const normalized = points.map((point) => l2Normalize(point));
  let accumulator = 0;
  let pairs = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    for (let j = i + 1; j < normalized.length; j += 1) {
      accumulator += Math.exp(-temperature * square(euclideanDistance(normalized[i], normalized[j])));
      pairs += 1;
    }
  }
  return pairs ? Math.log(accumulator / pairs) : NaN;
}

function initMetricExplorer(widget) {
  if (!widget) return;
  const canvas = widget.querySelector("[data-canvas]");
  const summary = widget.querySelector("[data-summary]");
  const metricButtons = Array.from(widget.querySelectorAll("[data-metric]"));
  const normalizeButtons = Array.from(widget.querySelectorAll("[data-normalize]"));
  const state = { metric: "cosine", normalize: false };

  function render() {
    if (!canvas) return;
    clearChildren(canvas);

    const query = prepareVector(METRIC_QUERY.vector, state.normalize);
    const points = METRIC_POINTS.map((point) => ({
      ...point,
      display: prepareVector(point.vector, state.normalize)
    }));
    const rankings = nearestNeighborOrder(points, { vector: query }, state.metric, false);
    const topLabels = rankings.slice(0, 3).map((item) => item.label);
    const svg = buildSvg(640, 280, "tda-widget-svg");
    const bounds = { left: 46, top: 26, width: 548, height: 214 };
    const displayVectors = [query, ...points.map((point) => point.display)];
    const positions = state.normalize
      ? positionUnitCirclePoints(
          displayVectors.map((vector) => [vector[0], vector[1]]),
          bounds.left + bounds.width / 2,
          bounds.top + bounds.height / 2,
          Math.min(bounds.width, bounds.height) * 0.34
        )
      : positionScatterPoints(displayVectors.map((vector) => [vector[0], vector[1]]), bounds);

    addScatterAxes(svg, bounds);

    if (state.normalize) {
      const radius = Math.min(bounds.width, bounds.height) * 0.34;
      addUnitCircle(svg, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2, radius);
    }

    drawText(svg, 52, 18, `${state.metric} ${state.normalize ? "on normalized vectors" : "on raw vectors"}`, "emb-svg-label");

    const queryPos = positions[0];
    drawCircle(svg, queryPos.x, queryPos.y, 7.5, "emb-point is-query");
    drawText(svg, queryPos.x + 10, queryPos.y - 10, "q", "emb-svg-label");

    points.forEach((point, index) => {
      const pos = positions[index + 1];
      const highlight = topLabels.includes(point.label);
      drawLine(svg, queryPos.x, queryPos.y, pos.x, pos.y, highlight ? "emb-connector" : "emb-grid-line");
      drawCircle(svg, pos.x, pos.y, highlight ? 7 : 5.8, `emb-point ${highlight ? point.accent : "is-blue"}`);
      drawText(svg, pos.x + 8, pos.y - 8, point.label, "emb-svg-small");
    });

    canvas.appendChild(svg);

    if (summary) {
      const detail = rankings
        .slice(0, 3)
        .map((item) => `${item.label}: ${formatNumber(item.value, metricIsDistance(state.metric) ? 2 : 3)}`)
        .join(" • ");
      const explanation = state.normalize
        ? "After normalization, the ranking depends on direction rather than raw scale."
        : "Without normalization, vector norms can change the ranking as much as the angles do.";
      summary.innerHTML = `<strong>Top neighbors</strong>: ${detail}.<br>${explanation}`;
    }
  }

  metricButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.metric = button.dataset.metric;
      metricButtons.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  normalizeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.normalize = button.dataset.normalize === "on";
      normalizeButtons.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  render();
}

function initNormalizationWidget(widget) {
  if (!widget) return;
  const canvas = widget.querySelector("[data-canvas]");
  const summary = widget.querySelector("[data-summary]");
  const slider = widget.querySelector("[data-scale]");
  const label = widget.querySelector("[data-scale-label]");
  const state = { scale: 1.5 };

  function render() {
    if (!canvas) return;
    clearChildren(canvas);

    const query = [1.0, 0.18];
    const candidateA = [state.scale, 0.18 * state.scale];
    const candidateB = [0.72, 0.88];
    const rawVectors = [
      { label: "q", vector: query, accent: "is-query" },
      { label: "A", vector: candidateA, accent: "is-yellow" },
      { label: "B", vector: candidateB, accent: "is-green" }
    ];
    const normalizedVectors = rawVectors.map((item) => ({ ...item, vector: l2Normalize(item.vector) }));

    const svg = buildSvg(720, 280, "tda-widget-svg");
    const left = { left: 42, top: 26, width: 276, height: 212 };
    const right = { left: 398, top: 26, width: 276, height: 212 };
    const rightCenterX = right.left + right.width / 2;
    const rightCenterY = right.top + right.height / 2;
    const rightRadius = 78;

    drawText(svg, 48, 18, "raw vectors", "emb-svg-label");
    drawText(svg, 404, 18, "after L2 normalization", "emb-svg-label");
    addScatterAxes(svg, left);
    addScatterAxes(svg, right);
    addUnitCircle(svg, rightCenterX, rightCenterY, rightRadius);

    const leftPositions = positionScatterPoints(rawVectors.map((item) => item.vector), left);
    const rightPositions = positionUnitCirclePoints(
      normalizedVectors.map((item) => item.vector),
      rightCenterX,
      rightCenterY,
      rightRadius
    );

    rawVectors.forEach((item, index) => {
      const fromX = left.left + 20;
      const fromY = left.top + left.height - 18;
      const to = leftPositions[index];
      drawLine(svg, fromX, fromY, to.x, to.y, "emb-connector");
      drawCircle(svg, to.x, to.y, item.label === "q" ? 7 : 6, `emb-point ${item.accent}`);
      drawText(svg, to.x + 8, to.y - 8, item.label, "emb-svg-small");
    });

    normalizedVectors.forEach((item, index) => {
      const fromX = rightCenterX;
      const fromY = rightCenterY;
      const to = rightPositions[index];
      drawLine(svg, fromX, fromY, to.x, to.y, "emb-connector");
      drawCircle(svg, to.x, to.y, item.label === "q" ? 7 : 6, `emb-point ${item.accent}`);
      drawText(svg, to.x + 8, to.y - 8, item.label, "emb-svg-small");
    });

    canvas.appendChild(svg);

    if (label) {
      label.textContent = formatNumber(state.scale, 2);
    }

    if (summary) {
      const rawDotA = dotProduct(query, candidateA);
      const rawDotB = dotProduct(query, candidateB);
      const rawCosA = cosineSimilarity(query, candidateA);
      const rawCosB = cosineSimilarity(query, candidateB);
      summary.innerHTML =
        `<strong>Raw dot product</strong>: A = ${formatNumber(rawDotA, 2)}, B = ${formatNumber(rawDotB, 2)}.<br>` +
        `<strong>Cosine similarity</strong>: A = ${formatNumber(rawCosA, 3)}, B = ${formatNumber(rawCosB, 3)}.<br>` +
        "Scaling A changes the raw dot product a lot, but its cosine stays nearly fixed because the direction barely changes.";
    }
  }

  slider?.addEventListener("input", (event) => {
    state.scale = Number(event.target.value) / 100;
    render();
  });

  render();
}

function drawSpectrum(svg, eigenvalues, x, y, width, height, topK) {
  const maxValue = Math.max(...eigenvalues, 1);
  const total = sum(eigenvalues);
  const cumulativePoints = [];
  const barWidth = width / eigenvalues.length;

  drawLine(svg, x, y + height, x + width, y + height, "emb-axis");
  drawLine(svg, x, y, x, y + height, "emb-axis");

  eigenvalues.forEach((value, index) => {
    const scaledHeight = (value / maxValue) * (height - 10);
    const left = x + index * barWidth + 6;
    drawRect(
      svg,
      left,
      y + height - scaledHeight,
      Math.max(10, barWidth - 12),
      scaledHeight,
      `emb-bar ${index < topK ? "is-yellow" : "is-blue"}`
    );
    drawText(svg, left + 3, y + height + 14, String(index + 1), "emb-svg-small");

    const cumulative = sum(eigenvalues.slice(0, index + 1)) / total;
    cumulativePoints.push([
      left + Math.max(10, barWidth - 12) / 2,
      y + height - cumulative * (height - 10)
    ]);
  });

  drawPath(svg, cumulativePoints, "emb-cumulative-line");
}

function initIdWidget(widget) {
  if (!widget) return;
  const canvas = widget.querySelector("[data-canvas]");
  const summary = widget.querySelector("[data-summary]");
  const presetButtons = Array.from(widget.querySelectorAll("[data-id-preset]"));
  const slider = widget.querySelector("[data-id-k]");
  const label = widget.querySelector("[data-id-k-label]");
  const state = { preset: "line", k: 8 };

  function render() {
    if (!canvas) return;
    clearChildren(canvas);

    const vectors = generateIdCloud(state.preset);
    const projection = projectToFirstTwo(vectors);
    const spectrum = covarianceEigenvalues(vectors);
    const mle = averageLocalMle(vectors, state.k);
    const pr = participationRatio(spectrum);
    const er = effectiveRank(spectrum);
    const svg = buildSvg(760, 320, "tda-widget-svg");
    const left = { left: 42, top: 30, width: 320, height: 240 };
    const right = { left: 420, top: 30, width: 286, height: 196 };
    const positions = positionScatterPoints(projection, left);

    drawText(svg, 48, 18, ID_PRESETS[state.preset].label, "emb-svg-label");
    drawText(svg, 424, 18, "global spectrum of the cloud", "emb-svg-label");
    addScatterAxes(svg, left);
    positions.forEach((point) => {
      drawCircle(svg, point.x, point.y, 4.2, "emb-point is-blue");
    });

    drawSpectrum(svg, spectrum.slice(0, 8), right.left, right.top, right.width, right.height, Math.min(2, spectrum.length));

    drawText(svg, 422, 248, `ambient dimension: ${ID_PRESETS[state.preset].ambientDimension}`, "emb-svg-small");
    drawText(svg, 422, 264, `avg local MLE: ${formatNumber(mle, 2)}`, "emb-svg-small");
    drawText(svg, 422, 280, `participation ratio: ${formatNumber(pr, 2)}`, "emb-svg-small");
    drawText(svg, 422, 296, `effective rank: ${formatNumber(er, 2)}`, "emb-svg-small");

    canvas.appendChild(svg);

    if (label) {
      label.textContent = String(state.k);
    }

    if (summary) {
      const note =
        state.preset === "curve"
          ? "The curved manifold is locally 1D, but its global linear spectrum uses more than one direction."
          : state.preset === "cloud"
            ? "The noisy cloud has no obvious low-dimensional manifold, so both local and global estimates rise."
            : "Local MLE and spectral rank are different summaries: one probes local distance growth, the other global variance.";
      summary.innerHTML =
        `<strong>Ambient dimension</strong>: ${ID_PRESETS[state.preset].ambientDimension}. ` +
        `<strong>Expected structure</strong>: ${ID_PRESETS[state.preset].targetDimension}.<br>` +
        `<strong>Average local MLE</strong>: ${formatNumber(mle, 2)} • <strong>participation ratio</strong>: ${formatNumber(pr, 2)} • <strong>effective rank</strong>: ${formatNumber(er, 2)}.<br>${note}`;
    }
  }

  presetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.preset = button.dataset.idPreset;
      presetButtons.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  slider?.addEventListener("input", (event) => {
    state.k = Number(event.target.value);
    render();
  });

  render();
}

function initSpectralWidget(widget) {
  if (!widget) return;
  const canvas = widget.querySelector("[data-canvas]");
  const summary = widget.querySelector("[data-summary]");
  const presetButtons = Array.from(widget.querySelectorAll("[data-spectrum]"));
  const slider = widget.querySelector("[data-topk]");
  const label = widget.querySelector("[data-topk-label]");
  const state = { preset: "flat", topK: 3 };

  function render() {
    if (!canvas) return;
    clearChildren(canvas);

    const eigenvalues = SPECTRAL_PRESETS[state.preset].eigenvalues;
    const svg = buildSvg(720, 260, "tda-widget-svg");
    drawText(svg, 44, 18, SPECTRAL_PRESETS[state.preset].label, "emb-svg-label");
    drawSpectrum(svg, eigenvalues, 42, 28, 610, 170, state.topK);
    canvas.appendChild(svg);

    if (label) {
      label.textContent = String(state.topK);
    }

    if (summary) {
      const ev = explainedVariance(eigenvalues, state.topK);
      summary.innerHTML =
        `<strong>Top-${state.topK} explained variance</strong>: ${formatNumber(ev * 100, 1)}%. ` +
        `<strong>Participation ratio</strong>: ${formatNumber(participationRatio(eigenvalues), 2)}. ` +
        `<strong>Effective rank</strong>: ${formatNumber(effectiveRank(eigenvalues), 2)}.<br>` +
        "Flatter spectra spread variance across many directions; spikier spectra indicate stronger global anisotropy and easier low-rank compression.";
    }
  }

  presetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.preset = button.dataset.spectrum;
      presetButtons.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  slider?.addEventListener("input", (event) => {
    state.topK = Number(event.target.value);
    render();
  });

  render();
}

function drawHeatmap(svg, matrix, x, y, size, metricIsDistanceFlag) {
  const values = matrix.flat();
  const [minValue, maxValue] = extent(values);
  const cell = size / matrix.length;

  matrix.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      const normalized =
        Math.abs(maxValue - minValue) <= EPSILON ? 0.5 : (value - minValue) / (maxValue - minValue);
      const intensity = metricIsDistanceFlag ? 1 - normalized : normalized;
      const alpha = 0.12 + 0.58 * intensity;
      const className = rowIndex === colIndex ? "emb-heat-cell is-yellow" : "emb-heat-cell is-blue";
      drawRect(svg, x + colIndex * cell, y + rowIndex * cell, cell - 4, cell - 4, className, {
        style: `fill-opacity:${alpha.toFixed(3)}`
      });
      drawText(svg, x + colIndex * cell + 8, y + rowIndex * cell + cell / 2 + 4, formatNumber(value, 2), "emb-heat-label");
    });
  });
}

function initSentenceWidget(widget) {
  if (!widget) return;
  const canvas = widget.querySelector("[data-canvas]");
  const summary = widget.querySelector("[data-summary]");
  const modeButtons = Array.from(widget.querySelectorAll("[data-sentence-mode]"));
  const metricButtons = Array.from(widget.querySelectorAll("[data-sentence-metric]"));
  const state = { mode: "cls", metric: "cosine" };

  function render() {
    if (!canvas) return;
    clearChildren(canvas);

    const vectors = SENTENCE_MODES[state.mode].vectors;
    const normalized = state.metric === "cosine";
    const projected = vectors.map((vector) => prepareVector(vector, normalized));
    const svg = buildSvg(760, 300, "tda-widget-svg");
    const left = { left: 42, top: 30, width: 300, height: 220 };
    const positions = positionScatterPoints(projected.map((vector) => [vector[0], vector[1]]), left);
    const matrix = vectors.map((leftVector) => {
      return vectors.map((rightVector) => metricValue(state.metric, leftVector, rightVector));
    });

    drawText(svg, 48, 18, SENTENCE_MODES[state.mode].label, "emb-svg-label");
    drawText(svg, 394, 18, `${state.metric} similarity matrix`, "emb-svg-label");
    addScatterAxes(svg, left);

    positions.forEach((point, index) => {
      const accent = index < 2 ? "is-blue" : "is-green";
      drawCircle(svg, point.x, point.y, 6.4, `emb-point ${accent}`);
      drawText(svg, point.x + 8, point.y - 8, String(index + 1), "emb-svg-small");
    });

    drawHeatmap(svg, matrix, 394, 36, 232, metricIsDistance(state.metric));

    SENTENCE_LABELS.forEach((labelText, index) => {
      drawText(svg, 48, 268 + index * 14, `${index + 1}. ${labelText}`, "emb-svg-small");
    });

    canvas.appendChild(svg);

    if (summary) {
      const scores = [];
      for (let i = 0; i < SENTENCE_LABELS.length; i += 1) {
        for (let j = i + 1; j < SENTENCE_LABELS.length; j += 1) {
          scores.push({ pair: [i + 1, j + 1], value: matrix[i][j] });
        }
      }
      scores.sort((left, right) => (metricIsDistance(state.metric) ? left.value - right.value : right.value - left.value));
      const best = scores[0];
      summary.innerHTML =
        `<strong>Closest pair under ${state.metric}</strong>: sentences ${best.pair[0]} and ${best.pair[1]} (${formatNumber(best.value, 3)}).<br>` +
        `${SENTENCE_MODES[state.mode].description}`;
    }
  }

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.sentenceMode;
      modeButtons.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  metricButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.metric = button.dataset.sentenceMetric;
      metricButtons.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  render();
}

const CONTRASTIVE_INITIAL = [
  [0.82, 0.28],
  [0.78, 0.36],
  [0.74, 0.48],
  [0.68, 0.14],
  [0.64, 0.28],
  [0.6, 0.42]
];

const CONTRASTIVE_TARGET = [
  [1.0, 0.02],
  [0.96, 0.16],
  [-0.54, 0.84],
  [-0.66, 0.74],
  [-0.18, -0.98],
  [-0.04, -0.99]
];

function interpolateVectors(left, right, t) {
  return left.map((value, index) => value * (1 - t) + right[index] * t);
}

function initContrastiveWidget(widget) {
  if (!widget) return;
  const canvas = widget.querySelector("[data-canvas]");
  const summary = widget.querySelector("[data-summary]");
  const slider = widget.querySelector("[data-progress]");
  const label = widget.querySelector("[data-progress-label]");
  const state = { progress: 0 };

  function render() {
    if (!canvas) return;
    clearChildren(canvas);

    const t = state.progress / 100;
    const points = CONTRASTIVE_INITIAL.map((point, index) => {
      return l2Normalize(interpolateVectors(point, CONTRASTIVE_TARGET[index], t));
    });
    const pairs = [
      [points[0], points[1]],
      [points[2], points[3]],
      [points[4], points[5]]
    ];
    const svg = buildSvg(720, 280, "tda-widget-svg");
    const bounds = { left: 90, top: 28, width: 520, height: 210 };
    const cx = bounds.left + bounds.width / 2;
    const cy = bounds.top + bounds.height / 2;
    const radius = 88;

    drawText(svg, 96, 18, "normalized feature space", "emb-svg-label");
    addUnitCircle(svg, cx, cy, radius);
    drawLine(svg, bounds.left, cy, bounds.left + bounds.width, cy, "emb-grid-line");
    drawLine(svg, cx, bounds.top, cx, bounds.top + bounds.height, "emb-grid-line");

    const positions = points.map((point) => ({
      x: cx + point[0] * radius,
      y: cy - point[1] * radius
    }));
    const accents = ["is-blue", "is-blue", "is-green", "is-green", "is-yellow", "is-yellow"];

    [[0, 1], [2, 3], [4, 5]].forEach(([i, j]) => {
      drawLine(svg, positions[i].x, positions[i].y, positions[j].x, positions[j].y, "emb-pair-line");
    });

    positions.forEach((point, index) => {
      drawCircle(svg, point.x, point.y, 6.4, `emb-point ${accents[index]}`);
      drawText(svg, point.x + 8, point.y - 8, String(index + 1), "emb-svg-small");
    });

    canvas.appendChild(svg);

    if (label) {
      label.textContent = formatNumber(t, 2);
    }

    if (summary) {
      const alignment = alignmentScore(pairs);
      const uniformity = uniformityScore(points);
      summary.innerHTML =
        `<strong>Alignment</strong>: ${formatNumber(alignment, 3)} • <strong>uniformity</strong>: ${formatNumber(uniformity, 3)}.<br>` +
        "As progress increases, positive pairs get closer while the full cloud spreads more evenly over the sphere. Lower uniformity score here means better global spread.";
    }
  }

  slider?.addEventListener("input", (event) => {
    state.progress = Number(event.target.value);
    render();
  });

  render();
}

function initHubnessWidget(widget) {
  if (!widget) return;
  const canvas = widget.querySelector("[data-canvas]");
  const summary = widget.querySelector("[data-summary]");
  const dimButtons = Array.from(widget.querySelectorAll("[data-hub-dim]"));
  const slider = widget.querySelector("[data-hub-k]");
  const label = widget.querySelector("[data-hub-k-label]");
  const state = { dim: 4, k: 5 };

  function render() {
    if (!canvas) return;
    clearChildren(canvas);

    const rng = mulberry32(902 + state.dim * 17);
    const vectors = Array.from({ length: 120 }, () => randomVector(state.dim, rng));
    const counts = kOccurrenceCounts(vectors, state.k, "euclidean", false);
    const order = counts
      .map((count, index) => ({ count, index }))
      .sort((left, right) => right.count - left.count);
    const projection = projectToFirstTwo(vectors);
    const svg = buildSvg(760, 320, "tda-widget-svg");
    const left = { left: 40, top: 30, width: 330, height: 240 };
    const right = { left: 420, top: 30, width: 286, height: 210 };
    const positions = positionScatterPoints(projection, left);
    const maxCount = Math.max(...counts, 1);

    drawText(svg, 46, 18, `${state.dim}D Gaussian cloud (shown in first two coordinates)`, "emb-svg-label");
    drawText(svg, 424, 18, "sorted k-occurrence counts", "emb-svg-label");
    addScatterAxes(svg, left);
    drawLine(svg, right.left, right.top + right.height, right.left + right.width, right.top + right.height, "emb-axis");
    drawLine(svg, right.left, right.top, right.left, right.top + right.height, "emb-axis");

    positions.forEach((point, index) => {
      const radius = 3.2 + (counts[index] / maxCount) * 5.8;
      const className = order[0].index === index ? "emb-point is-hub" : "emb-point is-blue";
      drawCircle(svg, point.x, point.y, radius, className);
    });

    order.slice(0, 36).forEach((item, index) => {
      const barWidth = right.width / 36;
      const barHeight = (item.count / maxCount) * (right.height - 16);
      drawRect(
        svg,
        right.left + index * barWidth + 3,
        right.top + right.height - barHeight,
        Math.max(3, barWidth - 5),
        barHeight,
        index === 0 ? "emb-hub-bar is-peak" : "emb-hub-bar"
      );
    });

    drawText(svg, right.left + 4, right.top + right.height + 16, "queries sorted by popularity", "emb-svg-small");

    canvas.appendChild(svg);

    if (label) {
      label.textContent = String(state.k);
    }

    if (summary) {
      const top = order[0].count;
      const median = order[Math.floor(order.length / 2)].count;
      summary.innerHTML =
        `<strong>Average k-occurrence</strong>: ${formatNumber(mean(counts), 2)}. ` +
        `<strong>Top hub</strong>: ${top}. <strong>Median point</strong>: ${median}.<br>` +
        "As ambient dimension rises, some points can appear in many more neighbor lists than the average. Those hubs distort retrieval even though the low-dimensional display may not look unusual.";
    }
  }

  dimButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.dim = Number(button.dataset.hubDim);
      dimButtons.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  slider?.addEventListener("input", (event) => {
    state.k = Number(event.target.value);
    render();
  });

  render();
}

export function enhanceEmbeddingsNotesPage(root = document) {
  const page = enhanceMathNotebookPage(root, {
    bodyClass: "embeddings-notes-page"
  });

  if (!page) {
    return null;
  }

  initMetricExplorer(page.querySelector('[data-widget="metric-explorer"]'));
  initNormalizationWidget(page.querySelector('[data-widget="normalization-demo"]'));
  initIdWidget(page.querySelector('[data-widget="id-demo"]'));
  initSpectralWidget(page.querySelector('[data-widget="spectral-demo"]'));
  initSentenceWidget(page.querySelector('[data-widget="sentence-demo"]'));
  initContrastiveWidget(page.querySelector('[data-widget="contrastive-demo"]'));
  initHubnessWidget(page.querySelector('[data-widget="hubness-demo"]'));
  return page;
}
