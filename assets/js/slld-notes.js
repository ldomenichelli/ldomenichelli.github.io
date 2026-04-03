import { buildSvg, clearChildren, createSvgElement, enhanceMathNotebookPage } from "./math-notebook.js";

const CLUSTER_POINTS = [
  [-2.7, -1.5],
  [-2.1, -0.9],
  [-1.8, -1.9],
  [-1.4, -0.8],
  [0.2, 2.2],
  [0.7, 1.7],
  [1.1, 2.6],
  [1.4, 1.4],
  [2.1, -1.8],
  [2.5, -1.2],
  [3.0, -2.3],
  [3.4, -1.4]
];

const PCA_POINTS = [
  [2.4, 0.6],
  [2.0, 0.8],
  [1.8, 1.1],
  [1.2, 1.3],
  [0.7, 1.4],
  [0.1, 1.5],
  [-0.3, 1.7],
  [-0.8, 1.8],
  [-1.1, 2.2],
  [-1.7, 2.4],
  [-2.2, 2.6],
  [-2.7, 2.8]
];

const LOWESS_X = Array.from({ length: 25 }, (_, index) => index / 3);
const LOWESS_Y = [
  0.75, 0.88, 1.16, 1.46, 1.73, 1.92, 2.0, 1.93, 1.7, 1.34, 0.88, 0.46, 0.18,
  0.02, -0.04, 0.03, 0.24, 0.62, 1.07, 1.46, 1.72, 1.86, 1.82, 1.66, 1.43
];

const KDE_SAMPLES = [
  -2.4, -1.9, -1.7, -1.3, -0.9, -0.6, -0.3, -0.2, 0.1, 0.2,
  0.5, 0.9, 1.2, 1.6, 1.8, 2.1, 2.5, 2.8, 3.1, 3.3
];

const RESAMPLE_VALUES = [4.8, 5.1, 5.3, 5.5, 5.7, 5.8, 6.1, 6.4];
const PERM_VALUES = [6.3, 6.0, 5.8, 5.6, 4.9, 5.0, 4.8, 5.1];
const PERM_LABELS = [1, 1, 1, 1, 0, 0, 0, 0];

const REGRESSION_X = [
  [0.4, 0.5],
  [0.9, 1.0],
  [1.3, 1.5],
  [1.7, 1.8],
  [2.0, 2.1],
  [2.5, 2.7],
  [2.9, 3.0],
  [3.2, 3.5]
];
const REGRESSION_Y = [0.8, 1.6, 1.9, 2.3, 2.7, 3.4, 3.7, 4.4];

const SCREENING_SEED = 71;
const ACCENTS = ["is-blue", "is-green", "is-yellow", "is-pink", "is-orange"];

function square(value) {
  return value * value;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function variance(values) {
  const avg = mean(values);
  return values.reduce((sum, value) => sum + square(value - avg), 0) / Math.max(values.length - 1, 1);
}

function dot(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function addVectors(left, right) {
  return left.map((value, index) => value + right[index]);
}

function scaleVector(vector, scalar) {
  return vector.map((value) => value * scalar);
}

function vectorNorm(vector) {
  return Math.sqrt(dot(vector, vector));
}

function normalize(vector) {
  const norm = vectorNorm(vector);
  return norm === 0 ? vector.map(() => 0) : scaleVector(vector, 1 / norm);
}

function transpose(matrix) {
  return matrix[0].map((_, columnIndex) => matrix.map((row) => row[columnIndex]));
}

function column(matrix, index) {
  return matrix.map((row) => row[index]);
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6D2B79F5;
    let value = Math.imul(t ^ (t >>> 15), t | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function randomNormal(rng) {
  const u = Math.max(rng(), 1e-12);
  const v = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function drawText(svg, x, y, text, className = "slld-svg-label", anchor = "start") {
  const node = createSvgElement("text", {
    x,
    y,
    class: className,
    "text-anchor": anchor
  });
  node.textContent = text;
  svg.appendChild(node);
}

function drawLine(svg, x1, y1, x2, y2, className = "slld-axis") {
  svg.appendChild(createSvgElement("line", { x1, y1, x2, y2, class: className }));
}

function drawCircle(svg, x, y, r, className = "slld-point") {
  svg.appendChild(createSvgElement("circle", { cx: x, cy: y, r, class: className }));
}

function drawRect(svg, x, y, width, height, className = "slld-bar") {
  svg.appendChild(createSvgElement("rect", { x, y, width, height, class: className }));
}

function drawPath(svg, d, className = "slld-line") {
  svg.appendChild(createSvgElement("path", { d, class: className }));
}

function drawPolygon(svg, points, className = "slld-area") {
  const pointsString = points.map((point) => `${point[0]},${point[1]}`).join(" ");
  svg.appendChild(createSvgElement("polygon", { points: pointsString, class: className }));
}

function formatNumber(value, digits = 2) {
  return Number(value).toFixed(digits);
}

function colorClass(index) {
  return ACCENTS[index % ACCENTS.length];
}

function scatterLayout(points, box, padding = 24) {
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(maxX - minX, 1e-6);
  const height = Math.max(maxY - minY, 1e-6);

  return points.map((point) => {
    const x = box.left + padding + ((point[0] - minX) / width) * (box.width - 2 * padding);
    const y = box.top + box.height - padding - ((point[1] - minY) / height) * (box.height - 2 * padding);
    return [x, y];
  });
}

function drawScatterAxes(svg, box) {
  drawLine(svg, box.left, box.top + box.height, box.left + box.width, box.top + box.height, "slld-axis");
  drawLine(svg, box.left, box.top, box.left, box.top + box.height, "slld-axis");
}

export function euclideanDistance(left, right) {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}

export function runKMeans(points, k, maxIterations = 30) {
  const initialCenters = Array.from({ length: k }, (_, index) => {
    const source = points[Math.floor((index * points.length) / k)];
    return [...source];
  });

  let centers = initialCenters;
  let assignments = new Array(points.length).fill(0);

  for (let step = 0; step < maxIterations; step += 1) {
    const nextAssignments = points.map((point) => {
      let bestCluster = 0;
      let bestDistance = Infinity;
      centers.forEach((center, clusterIndex) => {
        const distance = euclideanDistance(point, center);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestCluster = clusterIndex;
        }
      });
      return bestCluster;
    });

    if (nextAssignments.every((assignment, index) => assignment === assignments[index]) && step > 0) {
      break;
    }

    assignments = nextAssignments;
    centers = centers.map((center, clusterIndex) => {
      const clusterPoints = points.filter((_, index) => assignments[index] === clusterIndex);
      if (!clusterPoints.length) {
        return center;
      }
      return [
        mean(clusterPoints.map((point) => point[0])),
        mean(clusterPoints.map((point) => point[1]))
      ];
    });
  }

  const inertia = points.reduce((sum, point, index) => {
    return sum + square(euclideanDistance(point, centers[assignments[index]]));
  }, 0);

  return { assignments, centers, inertia };
}

function linkageDistance(points, leftCluster, rightCluster, linkage = "complete") {
  const distances = [];

  leftCluster.forEach((leftIndex) => {
    rightCluster.forEach((rightIndex) => {
      distances.push(euclideanDistance(points[leftIndex], points[rightIndex]));
    });
  });

  if (linkage === "single") {
    return Math.min(...distances);
  }
  if (linkage === "average") {
    return mean(distances);
  }
  return Math.max(...distances);
}

export function agglomerativeAssignments(points, k, linkage = "complete") {
  let clusters = points.map((_, index) => [index]);

  while (clusters.length > k) {
    let bestPair = [0, 1];
    let bestDistance = Infinity;

    for (let left = 0; left < clusters.length; left += 1) {
      for (let right = left + 1; right < clusters.length; right += 1) {
        const distance = linkageDistance(points, clusters[left], clusters[right], linkage);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestPair = [left, right];
        }
      }
    }

    const [leftIndex, rightIndex] = bestPair;
    const merged = [...clusters[leftIndex], ...clusters[rightIndex]];
    clusters = clusters.filter((_, index) => index !== leftIndex && index !== rightIndex);
    clusters.push(merged);
  }

  const assignments = new Array(points.length).fill(0);
  clusters.forEach((cluster, clusterIndex) => {
    cluster.forEach((pointIndex) => {
      assignments[pointIndex] = clusterIndex;
    });
  });
  return assignments;
}

export function silhouetteValues(points, assignments) {
  return points.map((point, index) => {
    const cluster = assignments[index];
    const sameClusterIndices = assignments
      .map((value, innerIndex) => ({ value, innerIndex }))
      .filter((item) => item.value === cluster && item.innerIndex !== index)
      .map((item) => item.innerIndex);

    const a =
      sameClusterIndices.length === 0
        ? 0
        : mean(sameClusterIndices.map((innerIndex) => euclideanDistance(point, points[innerIndex])));

    const otherClusters = [...new Set(assignments)].filter((value) => value !== cluster);
    const b = otherClusters.length
      ? Math.min(
          ...otherClusters.map((otherCluster) => {
            const memberIndices = assignments
              .map((value, otherIndex) => ({ value, otherIndex }))
              .filter((item) => item.value === otherCluster)
              .map((item) => item.otherIndex);
            return mean(memberIndices.map((memberIndex) => euclideanDistance(point, points[memberIndex])));
          })
        )
      : 0;

    if (sameClusterIndices.length === 0 && b === 0) {
      return 0;
    }

    return (b - a) / Math.max(a, b, 1e-9);
  });
}

export function averageSilhouette(points, assignments) {
  return mean(silhouetteValues(points, assignments));
}

function centerAndScale(points, standardize = false) {
  const meanX = mean(points.map((point) => point[0]));
  const meanY = mean(points.map((point) => point[1]));
  const centered = points.map((point) => [point[0] - meanX, point[1] - meanY]);

  if (!standardize) {
    return {
      transformed: centered,
      mean: [meanX, meanY],
      scales: [1, 1]
    };
  }

  const scaleX = Math.sqrt(Math.max(variance(centered.map((point) => point[0])), 1e-9));
  const scaleY = Math.sqrt(Math.max(variance(centered.map((point) => point[1])), 1e-9));

  return {
    transformed: centered.map((point) => [point[0] / scaleX, point[1] / scaleY]),
    mean: [meanX, meanY],
    scales: [scaleX, scaleY]
  };
}

function applyCenterAndScale(points, meanPoint, scales) {
  return points.map((point) => [
    (point[0] - meanPoint[0]) / scales[0],
    (point[1] - meanPoint[1]) / scales[1]
  ]);
}

export function principalComponents2d(points, standardize = false) {
  const { transformed, mean: meanPoint, scales } = centerAndScale(points, standardize);
  const xs = transformed.map((point) => point[0]);
  const ys = transformed.map((point) => point[1]);
  const a = variance(xs);
  const b = xs.reduce((sum, value, index) => sum + value * ys[index], 0) / Math.max(xs.length - 1, 1);
  const d = variance(ys);
  const trace = a + d;
  const delta = Math.sqrt(square(a - d) + 4 * square(b));
  const eigenvalues = [(trace + delta) / 2, (trace - delta) / 2];

  let first = Math.abs(b) > 1e-9 ? [b, eigenvalues[0] - a] : a >= d ? [1, 0] : [0, 1];
  first = normalize(first);
  const second = [-first[1], first[0]];
  const eigenvectors = [first, second];
  const scores = transformed.map((point) => [dot(point, first), dot(point, second)]);

  return { mean: meanPoint, scales, transformed, eigenvalues, eigenvectors, scores };
}

export function reconstructFromPca(model, retain = 1) {
  const { scores, eigenvectors, mean: meanPoint, scales } = model;

  return scores.map((score) => {
    const retained = retain === 1 ? [score[0], 0] : score;
    const transformed = addVectors(
      scaleVector(eigenvectors[0], retained[0]),
      scaleVector(eigenvectors[1], retained[1])
    );

    return [
      transformed[0] * scales[0] + meanPoint[0],
      transformed[1] * scales[1] + meanPoint[1]
    ];
  });
}

function tricubeWeight(value) {
  const abs = Math.abs(value);
  if (abs >= 1) {
    return 0;
  }
  return square(1 - abs * abs * abs) * (1 - abs * abs * abs);
}

export function lowess(xs, ys, span = 0.3) {
  const n = xs.length;
  const neighborhood = Math.max(3, Math.floor(span * n));

  return xs.map((x0) => {
    const sortedDistances = xs
      .map((x) => Math.abs(x - x0))
      .sort((left, right) => left - right);
    const bandwidth = Math.max(sortedDistances[Math.min(neighborhood, n - 1)], 1e-6);

    let sumW = 0;
    let sumWX = 0;
    let sumWY = 0;
    let sumWXX = 0;
    let sumWXY = 0;

    xs.forEach((x, index) => {
      const weight = tricubeWeight((x - x0) / bandwidth);
      if (weight === 0) {
        return;
      }
      const y = ys[index];
      sumW += weight;
      sumWX += weight * x;
      sumWY += weight * y;
      sumWXX += weight * x * x;
      sumWXY += weight * x * y;
    });

    const denom = sumW * sumWXX - sumWX * sumWX;
    if (Math.abs(denom) < 1e-9) {
      return sumWY / Math.max(sumW, 1e-9);
    }

    const slope = (sumW * sumWXY - sumWX * sumWY) / denom;
    const intercept = (sumWY - slope * sumWX) / Math.max(sumW, 1e-9);
    return intercept + slope * x0;
  });
}

function gaussianKernel(value) {
  return Math.exp(-0.5 * value * value) / Math.sqrt(2 * Math.PI);
}

export function gaussianKde(samples, grid, bandwidth) {
  return grid.map((x) => {
    const sum = samples.reduce((accumulator, sample) => accumulator + gaussianKernel((x - sample) / bandwidth), 0);
    return sum / (samples.length * bandwidth);
  });
}

export function makeKFolds(n, k) {
  const folds = Array.from({ length: k }, () => []);
  for (let index = 0; index < n; index += 1) {
    folds[index % k].push(index);
  }
  return folds;
}

export function bootstrapIndices(n, seed = 1) {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, () => Math.floor(rng() * n));
}

export function bootstrapMeans(values, replicates = 200, seed = 9) {
  return Array.from({ length: replicates }, (_, replicate) => {
    const sample = bootstrapIndices(values.length, seed + replicate * 17);
    return mean(sample.map((index) => values[index]));
  });
}

export function differenceInMeans(values, labels) {
  const left = values.filter((_, index) => labels[index] === 1);
  const right = values.filter((_, index) => labels[index] === 0);
  return mean(left) - mean(right);
}

export function permutationNull(values, labels, replicates = 300, seed = 11) {
  const rng = mulberry32(seed);
  return Array.from({ length: replicates }, () => {
    const shuffled = [...labels];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(rng() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return differenceInMeans(values, shuffled);
  });
}

function solveLinearSystem(matrix, vector) {
  const size = matrix.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);

  for (let pivot = 0; pivot < size; pivot += 1) {
    let best = pivot;
    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[best][pivot])) {
        best = row;
      }
    }
    [augmented[pivot], augmented[best]] = [augmented[best], augmented[pivot]];

    const pivotValue = augmented[pivot][pivot];
    if (Math.abs(pivotValue) < 1e-9) {
      return new Array(size).fill(0);
    }

    for (let col = pivot; col <= size; col += 1) {
      augmented[pivot][col] /= pivotValue;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === pivot) {
        continue;
      }
      const factor = augmented[row][pivot];
      for (let col = pivot; col <= size; col += 1) {
        augmented[row][col] -= factor * augmented[pivot][col];
      }
    }
  }

  return augmented.map((row) => row[size]);
}

export function softThreshold(value, lambda) {
  if (value > lambda) {
    return value - lambda;
  }
  if (value < -lambda) {
    return value + lambda;
  }
  return 0;
}

function gramMatrix(X) {
  const Xt = transpose(X);
  return Xt.map((leftColumn) =>
    Xt.map((rightColumn) => dot(leftColumn, rightColumn))
  );
}

function standardizeColumns(X) {
  const columns = transpose(X);
  const means = columns.map((values) => mean(values));
  const centered = X.map((row) => row.map((value, index) => value - means[index]));
  const centeredColumns = transpose(centered);
  const scales = centeredColumns.map((values) => {
    const scale = Math.sqrt(values.reduce((sum, value) => sum + square(value), 0));
    return scale === 0 ? 1 : scale;
  });
  return {
    X: centered.map((row) => row.map((value, index) => value / scales[index])),
    means,
    scales
  };
}

function centerVector(values) {
  const avg = mean(values);
  return values.map((value) => value - avg);
}

function standardizedRegressionSetup(X, y) {
  const standardized = standardizeColumns(X);
  const centeredY = centerVector(y);
  const gram = gramMatrix(standardized.X);
  const rhs = transpose(standardized.X).map((values) => dot(values, centeredY));
  return { ...standardized, centeredY, gram, rhs };
}

export function ridgeFromGram(gram, rhs, lambda) {
  const system = gram.map((row, index) =>
    row.map((value, columnIndex) => value + (index === columnIndex ? lambda : 0))
  );
  return solveLinearSystem(system, rhs);
}

export function lassoCoordinateDescent(gram, rhs, lambda, iterations = 80) {
  const beta = new Array(rhs.length).fill(0);

  for (let step = 0; step < iterations; step += 1) {
    for (let index = 0; index < rhs.length; index += 1) {
      let partial = rhs[index];
      for (let columnIndex = 0; columnIndex < rhs.length; columnIndex += 1) {
        if (columnIndex !== index) {
          partial -= gram[index][columnIndex] * beta[columnIndex];
        }
      }
      beta[index] = softThreshold(partial, lambda / 2) / Math.max(gram[index][index], 1e-9);
    }
  }

  return beta;
}

export function marginalCorrelations(X, y) {
  const centeredY = centerVector(y);
  const yNorm = vectorNorm(centeredY);
  return transpose(X).map((values) => {
    const centered = centerVector(values);
    return dot(centered, centeredY) / Math.max(vectorNorm(centered) * yNorm, 1e-9);
  });
}

export function topIndices(scores, d) {
  return scores
    .map((value, index) => ({ index, score: Math.abs(value) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, d)
    .map((item) => item.index);
}

export function residualAfterSingleFeature(X, y, index) {
  const feature = centerVector(column(X, index));
  const centeredY = centerVector(y);
  const coefficient = dot(feature, centeredY) / Math.max(dot(feature, feature), 1e-9);
  return centeredY.map((value, row) => value - coefficient * feature[row]);
}

function screeningToyData() {
  const rng = mulberry32(SCREENING_SEED);
  const n = 42;
  const latentA = Array.from({ length: n }, () => randomNormal(rng));
  const latentB = Array.from({ length: n }, () => randomNormal(rng));
  const X = Array.from({ length: n }, (_, row) => {
    const a = latentA[row];
    const b = latentB[row];
    return [
      a + 0.08 * randomNormal(rng),
      a + 0.22 * randomNormal(rng),
      0.8 * a + 0.2 * b + 0.2 * randomNormal(rng),
      b + 0.08 * randomNormal(rng),
      b + 0.25 * randomNormal(rng),
      0.6 * a + 0.4 * b + 0.18 * randomNormal(rng),
      randomNormal(rng),
      randomNormal(rng),
      0.4 * a + 0.1 * randomNormal(rng),
      0.25 * b + 0.2 * randomNormal(rng)
    ];
  });
  const y = Array.from({ length: n }, (_, row) => 1.4 * latentA[row] + 0.55 * latentB[row] + 0.28 * randomNormal(rng));
  return { X, y, trueIndices: [0, 3] };
}

function lowessCurvePath(xs, ys, box, padding = 22) {
  const points = scatterLayout(xs.map((x, index) => [x, ys[index]]), box, padding);
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point[0]} ${point[1]}`).join(" ");
}

function histogram(values, bins) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = Math.max((max - min) / bins, 1e-9);
  const counts = new Array(bins).fill(0);

  values.forEach((value) => {
    const index = Math.min(bins - 1, Math.floor((value - min) / width));
    counts[index] += 1;
  });

  return { counts, min, max, width };
}

function initClusterWidget(widget) {
  if (!widget) return;

  const canvas = widget.querySelector("[data-canvas]");
  const summary = widget.querySelector("[data-summary]");
  const slider = widget.querySelector("[data-cluster-k]");
  const label = widget.querySelector("[data-cluster-k-label]");
  const buttons = Array.from(widget.querySelectorAll("[data-cluster-method]"));
  const state = { k: 3, method: "kmeans" };

  function render() {
    if (!canvas) return;
    clearChildren(canvas);
    const svg = buildSvg(760, 300, "tda-widget-svg");
    const leftBox = { left: 34, top: 24, width: 324, height: 224 };
    const rightBox = { left: 410, top: 24, width: 300, height: 224 };
    const assignments =
      state.method === "hierarchical"
        ? agglomerativeAssignments(CLUSTER_POINTS, state.k)
        : runKMeans(CLUSTER_POINTS, state.k).assignments;
    const silhouettes = silhouetteValues(CLUSTER_POINTS, assignments);
    const average = mean(silhouettes);
    const positioned = scatterLayout(CLUSTER_POINTS, leftBox);
    const order = silhouettes
      .map((value, index) => ({ value, index, cluster: assignments[index] }))
      .sort((left, right) => left.cluster - right.cluster || right.value - left.value);

    drawText(svg, leftBox.left, 16, state.method === "hierarchical" ? "Hierarchical cut" : "K-means partition");
    drawText(svg, rightBox.left, 16, "Silhouette widths");
    drawScatterAxes(svg, leftBox);
    drawLine(svg, rightBox.left, rightBox.top + rightBox.height, rightBox.left + rightBox.width, rightBox.top + rightBox.height, "slld-axis");
    drawLine(svg, rightBox.left + rightBox.width / 2, rightBox.top, rightBox.left + rightBox.width / 2, rightBox.top + rightBox.height, "slld-grid-line");

    positioned.forEach((point, index) => {
      drawCircle(svg, point[0], point[1], 6.2, `slld-point ${colorClass(assignments[index])}`);
    });

    order.forEach((item, orderIndex) => {
      const barHeight = 12;
      const y = rightBox.top + 6 + orderIndex * (barHeight + 3);
      const zeroX = rightBox.left + rightBox.width / 2;
      const width = (Math.abs(item.value) * (rightBox.width / 2 - 12));
      const x = item.value >= 0 ? zeroX : zeroX - width;
      drawRect(svg, x, y, width, barHeight, `slld-bar ${colorClass(item.cluster)}`);
    });

    drawText(svg, rightBox.left + 4, rightBox.top + rightBox.height + 18, "-1", "slld-svg-small");
    drawText(svg, rightBox.left + rightBox.width / 2, rightBox.top + rightBox.height + 18, "0", "slld-svg-small", "middle");
    drawText(svg, rightBox.left + rightBox.width - 4, rightBox.top + rightBox.height + 18, "1", "slld-svg-small", "end");

    canvas.appendChild(svg);

    if (label) {
      label.textContent = String(state.k);
    }

    if (summary) {
      summary.innerHTML =
        `<strong>Average silhouette</strong>: ${formatNumber(average, 2)}. ` +
        `The slide deck uses silhouette widths as a partition diagnostic: large positive values mean points are well placed, values near zero sit between clusters, and negative values flag likely misassignment.`;
    }
  }

  slider?.addEventListener("input", (event) => {
    state.k = Number(event.target.value);
    render();
  });

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      state.method = button.dataset.clusterMethod;
      buttons.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  render();
}

function initPcaWidget(widget) {
  if (!widget) return;

  const canvas = widget.querySelector("[data-canvas]");
  const summary = widget.querySelector("[data-summary]");
  const scaleButtons = Array.from(widget.querySelectorAll("[data-pca-scale]"));
  const retainButtons = Array.from(widget.querySelectorAll("[data-pca-retain]"));
  const state = { standardize: false, retain: 1 };

  function render() {
    if (!canvas) return;
    clearChildren(canvas);

    const model = principalComponents2d(PCA_POINTS, state.standardize);
    const reconstruction = reconstructFromPca(model, state.retain);
    const originalView = state.standardize
      ? model.transformed
      : PCA_POINTS;
    const reconstructedView = state.standardize
      ? applyCenterAndScale(reconstruction, model.mean, model.scales)
      : reconstruction;
    const svg = buildSvg(760, 320, "tda-widget-svg");
    const left = { left: 34, top: 28, width: 318, height: 228 };
    const right = { left: 404, top: 28, width: 318, height: 228 };
    const placedOriginal = scatterLayout(originalView, left);
    const placedReconstruction = scatterLayout(reconstructedView, right);
    const lineLength = 78;
    const originSource = state.standardize ? [0, 0] : model.mean;
    const origin = scatterLayout([...originalView, originSource], left).slice(-1)[0];

    drawText(svg, left.left, 18, state.standardize ? "Standardized feature space" : "Original feature space");
    drawText(svg, right.left, 18, state.retain === 1 ? "Reconstruction with one component" : "Reconstruction with both components");
    drawScatterAxes(svg, left);
    drawScatterAxes(svg, right);

    placedOriginal.forEach((point) => drawCircle(svg, point[0], point[1], 5.8, "slld-point is-blue"));
    placedReconstruction.forEach((point) => drawCircle(svg, point[0], point[1], 5.8, "slld-point is-green"));

    const axisDirections = model.eigenvectors.map((vector) => [vector[0], -vector[1]]);
    axisDirections.forEach((vector, index) => {
      const scaled = scaleVector(vector, lineLength);
      drawLine(svg, origin[0], origin[1], origin[0] + scaled[0], origin[1] + scaled[1], `slld-line ${colorClass(index)}`);
      drawLine(svg, origin[0], origin[1], origin[0] - scaled[0], origin[1] - scaled[1], `slld-line ${colorClass(index)}`);
      drawText(svg, origin[0] + scaled[0] + 8, origin[1] + scaled[1], `PC${index + 1}`, "slld-svg-small");
    });

    const totalVariance = model.eigenvalues.reduce((sum, value) => sum + value, 0);
    const pve1 = model.eigenvalues[0] / totalVariance;
    const pve2 = model.eigenvalues[1] / totalVariance;
    drawRect(svg, right.left + 36, right.top + right.height + 24, 180 * pve1, 12, "slld-bar is-blue");
    drawRect(svg, right.left + 36 + 180 * pve1, right.top + right.height + 24, 180 * pve2, 12, "slld-bar is-green");
    drawText(svg, right.left + 36, right.top + right.height + 18, "Variance explained", "slld-svg-small");

    canvas.appendChild(svg);

    if (summary) {
      summary.innerHTML =
        `<strong>PC1 PVE</strong>: ${formatNumber(100 * pve1, 1)}%. ` +
        `<strong>PC2 PVE</strong>: ${formatNumber(100 * pve2, 1)}%. ` +
        `The slides distinguish scores, loadings, and scree information; the standardized view echoes the warning that scaling can change PCA non-trivially.`;
    }
  }

  scaleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.standardize = button.dataset.pcaScale === "standardized";
      scaleButtons.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  retainButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.retain = Number(button.dataset.pcaRetain);
      retainButtons.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  render();
}

function initSmoothingWidget(widget) {
  if (!widget) return;

  const canvas = widget.querySelector("[data-canvas]");
  const summary = widget.querySelector("[data-summary]");
  const buttons = Array.from(widget.querySelectorAll("[data-smooth-mode]"));
  const slider = widget.querySelector("[data-smooth-param]");
  const label = widget.querySelector("[data-smooth-param-label]");
  const state = { mode: "lowess", param: 0.28 };

  function renderLowess(svg, box) {
    drawScatterAxes(svg, box);
    const points = scatterLayout(LOWESS_X.map((x, index) => [x, LOWESS_Y[index]]), box);
    points.forEach((point) => drawCircle(svg, point[0], point[1], 4.6, "slld-point is-blue"));
    drawPath(svg, lowessCurvePath(LOWESS_X, LOWESS_Y, box), "slld-line is-muted");
    drawPath(svg, lowessCurvePath(LOWESS_X, lowess(LOWESS_X, LOWESS_Y, state.param), box), "slld-line is-orange");
    drawText(svg, box.left, 18, "LOWESS fit");
  }

  function renderKde(svg, box) {
    drawScatterAxes(svg, box);
    const grid = Array.from({ length: 160 }, (_, index) => -3 + (6 * index) / 159);
    const trueDensity = grid.map((x) => 0.55 * gaussianKernel((x + 1.2) / 0.7) / 0.7 + 0.45 * gaussianKernel((x - 1.8) / 0.9) / 0.9);
    const estimated = gaussianKde(KDE_SAMPLES, grid, state.param);
    drawPath(svg, lowessCurvePath(grid, trueDensity, box), "slld-line is-muted");
    drawPath(svg, lowessCurvePath(grid, estimated, box), "slld-line is-green");
    scatterLayout(KDE_SAMPLES.map((x) => [x, 0]), box, 22).forEach((point) => {
      drawLine(svg, point[0], box.top + box.height - 10, point[0], box.top + box.height - 2, "slld-rug");
    });
    drawText(svg, box.left, 18, "Kernel density estimate");
  }

  function render() {
    if (!canvas) return;
    clearChildren(canvas);
    const svg = buildSvg(760, 290, "tda-widget-svg");
    const box = { left: 40, top: 28, width: 680, height: 210 };

    if (state.mode === "lowess") {
      renderLowess(svg, box);
      if (label) {
        label.textContent = formatNumber(state.param, 2);
      }
      if (summary) {
        summary.innerHTML =
          `<strong>Span</strong>: ${formatNumber(state.param, 2)}. ` +
          `LOWESS uses local weighted least squares; smaller spans track more detail, while larger spans suppress local variation and can miss curvature.`;
      }
    } else {
      renderKde(svg, box);
      if (label) {
        label.textContent = formatNumber(state.param, 2);
      }
      if (summary) {
        summary.innerHTML =
          `<strong>Bandwidth</strong>: ${formatNumber(state.param, 2)}. ` +
          `The density slides use bandwidth to frame the bias-variance dilemma: larger bandwidth smooths away noise but also blurs structure.`;
      }
    }

    canvas.appendChild(svg);
  }

  slider?.addEventListener("input", (event) => {
    state.param = Number(event.target.value);
    render();
  });

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.smoothMode;
      state.param = state.mode === "lowess" ? 0.28 : 0.55;
      if (slider) {
        slider.min = state.mode === "lowess" ? "0.15" : "0.22";
        slider.max = state.mode === "lowess" ? "0.7" : "1.2";
        slider.step = state.mode === "lowess" ? "0.01" : "0.02";
        slider.value = String(state.param);
      }
      buttons.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  render();
}

function initResamplingWidget(widget) {
  if (!widget) return;

  const canvas = widget.querySelector("[data-canvas]");
  const summary = widget.querySelector("[data-summary]");
  const buttons = Array.from(widget.querySelectorAll("[data-resample-mode]"));
  const state = { mode: "cv" };

  function renderCv(svg) {
    const folds = makeKFolds(12, 5);
    drawText(svg, 38, 18, "5-fold cross-validation");
    folds.forEach((fold, foldIndex) => {
      const y = 46 + foldIndex * 34;
      drawText(svg, 36, y + 15, `Fold ${foldIndex + 1}`, "slld-svg-small");
      for (let index = 0; index < 12; index += 1) {
        const isTest = fold.includes(index);
        drawRect(svg, 110 + index * 42, y, 32, 18, `slld-bar ${isTest ? "is-pink" : "is-blue"}`);
      }
    });
    drawText(svg, 110, 235, "Test folds move across the sample; training always uses the remaining observations.", "slld-svg-small");
  }

  function renderBootstrap(svg) {
    const sample = bootstrapIndices(RESAMPLE_VALUES.length, 14);
    const means = bootstrapMeans(RESAMPLE_VALUES, 180, 21);
    const hist = histogram(means, 16);
    drawText(svg, 38, 18, "Bootstrap resampling");
    RESAMPLE_VALUES.forEach((_, index) => {
      drawText(svg, 44 + index * 48, 62, `x${index + 1}`, "slld-svg-small", "middle");
      drawRect(svg, 28 + index * 48, 72, 32, 16, "slld-bar is-muted");
    });
    sample.forEach((picked, drawIndex) => {
      drawText(svg, 44 + drawIndex * 48, 120, String(picked + 1), "slld-svg-small", "middle");
      drawRect(svg, 28 + drawIndex * 48, 130, 32, 16, "slld-bar is-green");
    });
    const maxCount = Math.max(...hist.counts, 1);
    hist.counts.forEach((count, binIndex) => {
      const width = 320 / hist.counts.length;
      const height = (count / maxCount) * 82;
      drawRect(svg, 360 + binIndex * width, 188 - height, Math.max(10, width - 2), height, "slld-bar is-blue");
    });
    drawText(svg, 360, 206, "Approximate sampling distribution of the mean", "slld-svg-small");
  }

  function renderPermutation(svg) {
    const observed = differenceInMeans(PERM_VALUES, PERM_LABELS);
    const permuted = permutationNull(PERM_VALUES, PERM_LABELS, 200, 17);
    const hist = histogram(permuted, 18);
    const maxCount = Math.max(...hist.counts, 1);
    drawText(svg, 38, 18, "Permutation null distribution");
    hist.counts.forEach((count, binIndex) => {
      const width = 560 / hist.counts.length;
      const height = (count / maxCount) * 150;
      drawRect(svg, 80 + binIndex * width, 208 - height, Math.max(10, width - 2), height, "slld-bar is-yellow");
    });
    const observedX = 80 + ((observed - hist.min) / Math.max(hist.max - hist.min, 1e-9)) * 560;
    drawLine(svg, observedX, 44, observedX, 214, "slld-line is-pink");
    drawText(svg, observedX + 8, 54, "observed statistic", "slld-svg-small");
    drawText(svg, 80, 236, "Shuffle labels to simulate the no-association null, not the sampling distribution.", "slld-svg-small");
  }

  function render() {
    if (!canvas) return;
    clearChildren(canvas);
    const svg = buildSvg(760, 270, "tda-widget-svg");

    if (state.mode === "cv") {
      renderCv(svg);
      if (summary) {
        summary.innerHTML =
          "<strong>Cross-validation</strong> estimates out-of-sample prediction error for model tuning and model assessment. The slides stress that this is different from resampling to estimate a statistic's sampling variability.";
      }
    } else if (state.mode === "bootstrap") {
      renderBootstrap(svg);
      if (summary) {
        summary.innerHTML =
          "<strong>Bootstrap</strong> resamples with replacement from the empirical distribution to approximate sampling variability and build interval estimates when analytic formulas are hard to derive.";
      }
    } else {
      renderPermutation(svg);
      if (summary) {
        summary.innerHTML =
          "<strong>Random permutations</strong> target a null distribution under no association, which is conceptually different from the bootstrap world used for standard-error estimation.";
      }
    }

    canvas.appendChild(svg);
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.resampleMode;
      buttons.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  render();
}

function ellipsePoints(center, gram, radius, steps = 120) {
  const a = gram[0][0];
  const b = gram[0][1];
  const d = gram[1][1];
  const trace = a + d;
  const delta = Math.sqrt(square(a - d) + 4 * square(b));
  const eigenvalues = [(trace + delta) / 2, (trace - delta) / 2];
  let first = Math.abs(b) > 1e-9 ? [b, eigenvalues[0] - a] : a >= d ? [1, 0] : [0, 1];
  first = normalize(first);
  const second = [-first[1], first[0]];
  const radius1 = Math.sqrt(radius / Math.max(eigenvalues[0], 1e-9));
  const radius2 = Math.sqrt(radius / Math.max(eigenvalues[1], 1e-9));

  return Array.from({ length: steps }, (_, index) => {
    const theta = (2 * Math.PI * index) / steps;
    const point = addVectors(
      center,
      addVectors(
        scaleVector(first, radius1 * Math.cos(theta)),
        scaleVector(second, radius2 * Math.sin(theta))
      )
    );
    return point;
  });
}

function initRegularizationWidget(widget) {
  if (!widget) return;

  const canvas = widget.querySelector("[data-canvas]");
  const summary = widget.querySelector("[data-summary]");
  const buttons = Array.from(widget.querySelectorAll("[data-regularizer]"));
  const slider = widget.querySelector("[data-regularization-lambda]");
  const label = widget.querySelector("[data-regularization-lambda-label]");
  const setup = standardizedRegressionSetup(REGRESSION_X, REGRESSION_Y);
  const ls = solveLinearSystem(setup.gram, setup.rhs);
  const state = { method: "ridge", lambda: 0.7 };

  function render() {
    if (!canvas) return;
    clearChildren(canvas);

    const beta =
      state.method === "ridge"
        ? ridgeFromGram(setup.gram, setup.rhs, state.lambda)
        : lassoCoordinateDescent(setup.gram, setup.rhs, state.lambda);
    const svg = buildSvg(760, 320, "tda-widget-svg");
    const left = { left: 44, top: 30, width: 286, height: 236 };
    const right = { left: 408, top: 34, width: 280, height: 210 };
    const contourRadii = [0.6, 1.2, 2.2, 4.0];
    const allPoints = [
      ...contourRadii.flatMap((radius) => ellipsePoints(ls, setup.gram, radius)),
      ls,
      beta,
      [0, 0]
    ];
    const placed = scatterLayout(allPoints, left, 26);
    let cursor = 0;

    drawText(svg, left.left, 18, state.method === "ridge" ? "Ridge geometry" : "LASSO geometry");
    drawText(svg, right.left, 18, "Coefficient shrinkage");
    drawScatterAxes(svg, left);
    drawLine(svg, right.left, right.top + right.height, right.left + right.width, right.top + right.height, "slld-axis");

    contourRadii.forEach(() => {
      const contour = placed.slice(cursor, cursor + 120);
      cursor += 120;
      drawPath(
        svg,
        contour.map((point, index) => `${index === 0 ? "M" : "L"} ${point[0]} ${point[1]}`).join(" ") + " Z",
        "slld-contour"
      );
    });

    const lsPoint = placed[cursor];
    const betaPoint = placed[cursor + 1];
    const origin = placed[cursor + 2];

    if (state.method === "ridge") {
      const radius = Math.hypot(betaPoint[0] - origin[0], betaPoint[1] - origin[1]);
      svg.appendChild(createSvgElement("circle", {
        cx: origin[0],
        cy: origin[1],
        r: radius,
        class: "slld-penalty"
      }));
    } else {
      const deltaX = Math.abs(betaPoint[0] - origin[0]);
      const deltaY = Math.abs(betaPoint[1] - origin[1]);
      drawPolygon(svg, [
        [origin[0], origin[1] - deltaY],
        [origin[0] + deltaX, origin[1]],
        [origin[0], origin[1] + deltaY],
        [origin[0] - deltaX, origin[1]]
      ], "slld-penalty");
    }

    drawCircle(svg, lsPoint[0], lsPoint[1], 6.4, "slld-point is-muted");
    drawCircle(svg, betaPoint[0], betaPoint[1], 6.4, `slld-point ${state.method === "ridge" ? "is-blue" : "is-orange"}`);
    drawText(svg, lsPoint[0] + 10, lsPoint[1] - 8, "LS", "slld-svg-small");
    drawText(svg, betaPoint[0] + 10, betaPoint[1] - 8, state.method === "ridge" ? "Ridge" : "LASSO", "slld-svg-small");

    const barBase = right.top + right.height;
    const maxAbs = Math.max(...ls.map((value) => Math.abs(value)), 1);
    [ls, beta].forEach((coefficients, rowIndex) => {
      coefficients.forEach((value, index) => {
        const height = (Math.abs(value) / maxAbs) * 82;
        const x = right.left + 40 + index * 96 + rowIndex * 24;
        drawRect(svg, x, barBase - height, 18, height, `slld-bar ${rowIndex === 0 ? "is-muted" : state.method === "ridge" ? "is-blue" : "is-orange"}`);
      });
    });
    drawText(svg, right.left + 40, right.top + right.height + 18, "LS", "slld-svg-small");
    drawText(svg, right.left + 64, right.top + right.height + 18, state.method === "ridge" ? "Ridge" : "LASSO", "slld-svg-small");
    drawText(svg, right.left + 120, right.top + right.height + 18, "β1", "slld-svg-small");
    drawText(svg, right.left + 216, right.top + right.height + 18, "β2", "slld-svg-small");

    canvas.appendChild(svg);

    if (label) {
      label.textContent = formatNumber(state.lambda, 2);
    }

    if (summary) {
      summary.innerHTML =
        `<strong>${state.method === "ridge" ? "Ridge" : "LASSO"} coefficients</strong>: ` +
        `(${formatNumber(beta[0], 2)}, ${formatNumber(beta[1], 2)}). ` +
        `The slides emphasize the variance-reduction idea: stronger penalization shrinks coefficients, lowers variance, and eventually raises bias.`;
    }
  }

  slider?.addEventListener("input", (event) => {
    state.lambda = Number(event.target.value);
    render();
  });

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      state.method = button.dataset.regularizer;
      buttons.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  render();
}

function initScreeningWidget(widget) {
  if (!widget) return;

  const canvas = widget.querySelector("[data-canvas]");
  const summary = widget.querySelector("[data-summary]");
  const buttons = Array.from(widget.querySelectorAll("[data-screen-mode]"));
  const slider = widget.querySelector("[data-screen-d]");
  const label = widget.querySelector("[data-screen-d-label]");
  const toy = screeningToyData();
  const state = { mode: "sis", d: 4 };

  function render() {
    if (!canvas) return;
    clearChildren(canvas);
    const svg = buildSvg(760, 300, "tda-widget-svg");
    const scores =
      state.mode === "sis"
        ? marginalCorrelations(toy.X, toy.y)
        : marginalCorrelations(toy.X, residualAfterSingleFeature(toy.X, toy.y, topIndices(marginalCorrelations(toy.X, toy.y), 1)[0]));
    const selected = topIndices(scores, state.d);
    const maxScore = Math.max(...scores.map((value) => Math.abs(value)), 1e-6);
    const baseY = 238;

    drawText(svg, 40, 18, state.mode === "sis" ? "Sure independence screening" : "One residual iteration (ISIS idea)");
    drawLine(svg, 42, baseY, 720, baseY, "slld-axis");

    scores.forEach((score, index) => {
      const height = (Math.abs(score) / maxScore) * 150;
      const x = 60 + index * 62;
      const className = toy.trueIndices.includes(index)
        ? "slld-bar is-green"
        : selected.includes(index)
          ? "slld-bar is-blue"
          : "slld-bar is-muted";
      drawRect(svg, x, baseY - height, 34, height, className);
      drawText(svg, x + 17, baseY + 16, `X${index + 1}`, "slld-svg-small", "middle");
    });

    drawLine(svg, 60 + (state.d - 0.5) * 62, 54, 60 + (state.d - 0.5) * 62, baseY, "slld-grid-line");
    drawText(svg, 60 + (state.d - 0.5) * 62 + 8, 64, `keep top ${state.d}`, "slld-svg-small");
    drawText(svg, 60, 268, "Green = truly relevant in the toy problem, blue = selected by the screening rule.", "slld-svg-small");

    canvas.appendChild(svg);

    if (label) {
      label.textContent = String(state.d);
    }

    if (summary) {
      const recovered = toy.trueIndices.filter((index) => selected.includes(index)).length;
      summary.innerHTML =
        `<strong>Recovered true signals</strong>: ${recovered}/${toy.trueIndices.length}. ` +
        "The deck frames screening as a conservative first pass in the p >> n regime: keep enough variables so false negatives stay rare, then apply a heavier selection step later.";
    }
  }

  slider?.addEventListener("input", (event) => {
    state.d = Number(event.target.value);
    render();
  });

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.screenMode;
      buttons.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  render();
}

export function enhanceSlldNotesPage(root = document) {
  const page = enhanceMathNotebookPage(root, {
    bodyClass: "slld-notes-page"
  });

  if (!page) {
    return null;
  }

  initClusterWidget(page.querySelector('[data-widget="cluster-explorer"]'));
  initPcaWidget(page.querySelector('[data-widget="pca-explorer"]'));
  initSmoothingWidget(page.querySelector('[data-widget="smoothing-explorer"]'));
  initResamplingWidget(page.querySelector('[data-widget="resampling-explorer"]'));
  initRegularizationWidget(page.querySelector('[data-widget="regularization-explorer"]'));
  initScreeningWidget(page.querySelector('[data-widget="screening-explorer"]'));

  return page;
}
