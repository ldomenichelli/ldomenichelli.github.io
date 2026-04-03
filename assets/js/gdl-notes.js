import { buildSvg, clearChildren, createSvgElement, enhanceMathNotebookPage } from "./math-notebook.js";

const EPSILON = 1e-9;

const SYMMETRY_POINTS = [
  [-44, -18],
  [0, 42],
  [46, -10]
];

const SYMMETRY_EDGES = [
  [0, 1],
  [1, 2],
  [2, 0]
];

const SET_ELEMENTS = [
  { label: "a", value: [1.1, 0.35] },
  { label: "b", value: [0.25, 1.05] },
  { label: "c", value: [0.82, 0.68] }
];

const SET_PERMUTATIONS = {
  original: [0, 1, 2],
  swap: [1, 0, 2],
  reverse: [2, 1, 0]
};

const CNN_KERNEL = [
  [0, 1, 0],
  [1, 1, 1],
  [0, 1, 0]
];

const CNN_PATTERN = [
  [0, 0, 1, 0, 0],
  [0, 1, 1, 1, 0],
  [0, 0, 1, 0, 0],
  [0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0]
];

const MESSAGE_GRAPH = {
  positions: [
    [120, 90],
    [210, 52],
    [300, 90],
    [272, 192],
    [148, 192],
    [210, 132]
  ],
  adjacency: [
    [1, 4, 5],
    [0, 2, 5],
    [1, 3, 5],
    [2, 4, 5],
    [0, 3, 5],
    [0, 1, 2, 3, 4]
  ],
  initial: [0.15, 0.92, 0.28, 0.76, 0.22, 0.55]
};

const SMOOTH_GRAPH = {
  positions: [
    [76, 108],
    [156, 108],
    [236, 108],
    [316, 108],
    [396, 108],
    [476, 108]
  ],
  adjacency: [
    [1],
    [0, 2],
    [1, 3],
    [2, 4],
    [3, 5],
    [4]
  ],
  initial: [1, 0, 1, 0, 1, 0]
};

const GEODESIC_CURVE = [
  [82, 62],
  [306, 62],
  [306, 110],
  [128, 110],
  [128, 160],
  [346, 160],
  [346, 208],
  [168, 208]
];

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

function lerp(left, right, t) {
  return left + (right - left) * t;
}

function mixColor(left, right, t) {
  const amount = clamp(t, 0, 1);
  const r = Math.round(lerp(left[0], right[0], amount));
  const g = Math.round(lerp(left[1], right[1], amount));
  const b = Math.round(lerp(left[2], right[2], amount));
  return `rgb(${r} ${g} ${b})`;
}

function nodeStyle(value) {
  const amount = clamp(value, 0, 1);
  return `fill:${mixColor([231, 207, 116], [137, 182, 227], amount)};stroke:rgba(214,226,219,0.8);stroke-width:1.2`;
}

function drawText(svg, x, y, text, className = "gdl-svg-small", attrs = {}) {
  const node = createSvgElement("text", { x, y, class: className, ...attrs });
  node.textContent = text;
  svg.appendChild(node);
  return node;
}

function drawLine(svg, x1, y1, x2, y2, className = "gdl-axis", attrs = {}) {
  svg.appendChild(createSvgElement("line", { x1, y1, x2, y2, class: className, ...attrs }));
}

function drawCircle(svg, cx, cy, r, className = "gdl-node is-blue", attrs = {}) {
  svg.appendChild(createSvgElement("circle", { cx, cy, r, class: className, ...attrs }));
}

function drawRect(svg, x, y, width, height, className = "gdl-patch", attrs = {}) {
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

function drawBadge(svg, x, y, width, height, label, detail) {
  drawRect(svg, x, y, width, height, "gdl-badge", { rx: 12 });
  drawText(svg, x + 14, y + 20, label, "gdl-svg-label");
  drawText(svg, x + 14, y + 40, detail, "gdl-svg-small");
}

function drawGraph(svg, positions, adjacency, values, options = {}) {
  const {
    nodeRadius = 13,
    edgeClass = "gdl-edge",
    highlightNode = null,
    highlightEdges = []
  } = options;

  adjacency.forEach((neighbors, index) => {
    neighbors.forEach((neighbor) => {
      if (neighbor <= index) return;
      const isHighlighted = highlightEdges.some(
        ([left, right]) => (left === index && right === neighbor) || (left === neighbor && right === index)
      );
      drawLine(
        svg,
        positions[index][0],
        positions[index][1],
        positions[neighbor][0],
        positions[neighbor][1],
        isHighlighted ? "gdl-edge is-bottleneck" : edgeClass
      );
    });
  });

  positions.forEach((position, index) => {
    drawCircle(svg, position[0], position[1], nodeRadius, "gdl-node", {
      style: nodeStyle(values[index] ?? 0.5)
    });
    if (highlightNode === index) {
      drawCircle(svg, position[0], position[1], nodeRadius + 4, "gdl-neighborhood");
    }
    drawText(svg, position[0] - 4, position[1] + 4, String(index + 1), "gdl-svg-number");
  });
}

function drawVectorBars(svg, vector, x, y, width, colors = ["is-blue", "is-green"]) {
  vector.forEach((value, index) => {
    const barWidth = clamp(Math.abs(value) * width, 18, width);
    drawRect(svg, x, y + index * 22, barWidth, 12, `gdl-bar ${colors[index % colors.length]}`, { rx: 6 });
    drawText(svg, x + barWidth + 8, y + index * 22 + 10, formatNumber(value, 2), "gdl-svg-small");
  });
}

function drawGrid(svg, grid, x, y, cellSize, options = {}) {
  const {
    palette = "input",
    numberScale = 0,
    activeThreshold = 0.5,
    highlightCells = []
  } = options;

  grid.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      const isActive = value > activeThreshold;
      const isHighlighted = highlightCells.some(([r, c]) => r === rowIndex && c === colIndex);
      let className = "gdl-patch";
      if (palette === "kernel") {
        className = isActive ? "gdl-patch is-kernel" : "gdl-patch";
      } else if (palette === "output") {
        className = isHighlighted ? "gdl-patch is-active" : "gdl-patch";
      } else {
        className = isActive ? "gdl-patch is-active" : "gdl-patch";
      }

      drawRect(svg, x + colIndex * cellSize, y + rowIndex * cellSize, cellSize - 3, cellSize - 3, className, {
        rx: 6
      });

      if (numberScale) {
        drawText(
          svg,
          x + colIndex * cellSize + cellSize / 2 - 6,
          y + rowIndex * cellSize + cellSize / 2 + 4,
          formatNumber(value, numberScale),
          "gdl-svg-number"
        );
      }
    });
  });
}

export function translatePoints(points, dx, dy) {
  return points.map(([x, y]) => [x + dx, y + dy]);
}

export function rotatePoint(point, angleRadians) {
  const [x, y] = point;
  const cosine = Math.cos(angleRadians);
  const sine = Math.sin(angleRadians);
  return [cosine * x - sine * y, sine * x + cosine * y];
}

export function applyPermutation(values, permutation) {
  return permutation.map((index) => values[index]);
}

export function sumPool(vectors) {
  return vectors.reduce(
    (accumulator, vector) => accumulator.map((value, index) => value + vector[index]),
    Array(vectors[0]?.length ?? 0).fill(0)
  );
}

function encodeSetElement(vector) {
  return [1.15 * vector[0] + 0.35 * vector[1], 0.25 * vector[0] + 1.05 * vector[1]];
}

export function convolveValid(grid, kernel) {
  const output = [];
  const rows = grid.length - kernel.length + 1;
  const cols = grid[0].length - kernel[0].length + 1;

  for (let row = 0; row < rows; row += 1) {
    const outRow = [];
    for (let col = 0; col < cols; col += 1) {
      let total = 0;
      for (let kRow = 0; kRow < kernel.length; kRow += 1) {
        for (let kCol = 0; kCol < kernel[0].length; kCol += 1) {
          total += grid[row + kRow][col + kCol] * kernel[kRow][kCol];
        }
      }
      outRow.push(total);
    }
    output.push(outRow);
  }

  return output;
}

export function shiftGrid(grid, dx, dy) {
  const rows = grid.length;
  const cols = grid[0].length;
  const shifted = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const nextRow = row + dy;
      const nextCol = col + dx;
      if (nextRow >= 0 && nextRow < rows && nextCol >= 0 && nextCol < cols) {
        shifted[nextRow][nextCol] = grid[row][col];
      }
    }
  }

  return shifted;
}

export function messagePassStep(adjacency, features, alpha = 0.55) {
  return features.map((value, index) => {
    const neighbors = adjacency[index];
    const neighborMean = neighbors.length ? mean(neighbors.map((neighbor) => features[neighbor])) : value;
    return alpha * value + (1 - alpha) * neighborMean;
  });
}

export function runMessagePassing(adjacency, initialFeatures, steps, alpha = 0.55) {
  let current = initialFeatures.slice();
  for (let step = 0; step < steps; step += 1) {
    current = messagePassStep(adjacency, current, alpha);
  }
  return current;
}

export function featureVariance(values) {
  const average = mean(values);
  return mean(values.map((value) => square(value - average)));
}

export function binaryTreeLeafCount(depth) {
  return 2 ** depth;
}

export function oversquashRatio(depth, width = 1) {
  return binaryTreeLeafCount(depth) / width;
}

export function euclideanDistance2D(left, right) {
  return Math.sqrt(square(left[0] - right[0]) + square(left[1] - right[1]));
}

export function polylineArcDistance(polyline, startIndex, endIndex) {
  const [from, to] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
  let total = 0;
  for (let index = from; index < to; index += 1) {
    total += euclideanDistance2D(polyline[index], polyline[index + 1]);
  }
  return total;
}

export function componentsInRotatedFrame(vector, angleRadians) {
  const cosine = Math.cos(angleRadians);
  const sine = Math.sin(angleRadians);
  return [
    cosine * vector[0] + sine * vector[1],
    -sine * vector[0] + cosine * vector[1]
  ];
}

function initSymmetryWidget(widget) {
  if (!widget) return;
  const canvas = widget.querySelector("[data-canvas]");
  const summary = widget.querySelector("[data-summary]");
  const buttons = Array.from(widget.querySelectorAll("[data-transform]"));
  const state = { transform: "translation" };

  function renderShapeCase(mode) {
    const svg = buildSvg(760, 300, "tda-widget-svg");
    const inputCenter = [110, 110];
    const transformedCenter = [300, 110];
    const equivariantCenter = [580, 188];
    const descriptorX = 470;
    const descriptorY = 72;
    const transformed =
      mode === "translation"
        ? translatePoints(SYMMETRY_POINTS, 38, 18)
        : SYMMETRY_POINTS.map((point) => rotatePoint(point, Math.PI / 2));

    drawText(svg, 68, 26, "input", "gdl-svg-label");
    drawText(svg, 236, 26, mode === "translation" ? "translated input" : "rotated input", "gdl-svg-label");
    drawText(svg, 468, 26, "invariant output", "gdl-svg-label");
    drawText(svg, 468, 144, "equivariant output", "gdl-svg-label");
    drawLine(svg, 176, 104, 230, 104, "gdl-arrow");

    const distanceVector = [
      euclideanDistance2D(SYMMETRY_POINTS[0], SYMMETRY_POINTS[1]) / 100,
      euclideanDistance2D(SYMMETRY_POINTS[1], SYMMETRY_POINTS[2]) / 100,
      euclideanDistance2D(SYMMETRY_POINTS[0], SYMMETRY_POINTS[2]) / 100
    ];

    const drawTriangle = (points, centerX, centerY) => {
      const shifted = points.map(([x, y]) => [centerX + x, centerY + y]);
      SYMMETRY_EDGES.forEach(([left, right]) => {
        drawLine(svg, shifted[left][0], shifted[left][1], shifted[right][0], shifted[right][1], "gdl-edge");
      });
      shifted.forEach(([x, y], index) => {
        drawCircle(svg, x, y, 8, index === 1 ? "gdl-node is-yellow" : "gdl-node is-blue");
      });
    };

    drawTriangle(SYMMETRY_POINTS, inputCenter[0], inputCenter[1]);
    drawTriangle(transformed, transformedCenter[0], transformedCenter[1]);
    drawVectorBars(svg, distanceVector, descriptorX, descriptorY, 96, ["is-blue", "is-yellow", "is-green"]);
    drawBadge(svg, descriptorX, descriptorY + 88, 170, 42, "same descriptor", "pairwise distances do not change");
    drawTriangle(transformed, equivariantCenter[0], equivariantCenter[1]);

    if (summary) {
      summary.innerHTML =
        `<strong>${mode === "translation" ? "Translation" : "Rotation"}</strong>: the shape descriptor stays fixed, while an equivariant feature map transforms with the input.<br>` +
        "Equivariance keeps track of how the output should move; invariance discards that motion and keeps only the symmetry-stable summary.";
    }

    return svg;
  }

  function renderPermutationCase() {
    const svg = buildSvg(760, 300, "tda-widget-svg");
    const permutation = [2, 0, 1];
    const ordered = SET_ELEMENTS;
    const permuted = applyPermutation(SET_ELEMENTS, permutation);
    const encoded = ordered.map((item) => encodeSetElement(item.value));
    const encodedPermuted = permuted.map((item) => encodeSetElement(item.value));
    const pooled = sumPool(encoded);

    drawText(svg, 58, 26, "ordered input", "gdl-svg-label");
    drawText(svg, 258, 26, "permuted input", "gdl-svg-label");
    drawText(svg, 470, 26, "invariant pooled output", "gdl-svg-label");
    drawText(svg, 470, 150, "equivariant elementwise output", "gdl-svg-label");
    drawLine(svg, 178, 104, 230, 104, "gdl-arrow");

    ordered.forEach((item, index) => {
      drawBadge(svg, 46, 56 + index * 46, 124, 34, item.label, `(${formatNumber(item.value[0], 1)}, ${formatNumber(item.value[1], 1)})`);
    });

    permuted.forEach((item, index) => {
      drawBadge(
        svg,
        246,
        56 + index * 46,
        124,
        34,
        item.label,
        `(${formatNumber(item.value[0], 1)}, ${formatNumber(item.value[1], 1)})`
      );
    });

    drawVectorBars(svg, pooled, 470, 62, 120);
    drawBadge(svg, 470, 110, 178, 40, "same pooled set feature", "sum / mean pooling ignores order");

    encodedPermuted.forEach((vector, index) => {
      drawVectorBars(svg, vector, 470, 178 + index * 28, 72, ["is-blue", "is-green"]);
      drawText(svg, 560, 188 + index * 28, permuted[index].label, "gdl-svg-small");
    });

    if (summary) {
      summary.innerHTML =
        "<strong>Permutation</strong>: reordering the elements changes an equivariant elementwise output in the same order, but a pooled set representation stays the same.<br>" +
        "That is the basic set-learning distinction between permutation equivariance and permutation invariance.";
    }

    return svg;
  }

  function render() {
    if (!canvas) return;
    clearChildren(canvas);
    const svg =
      state.transform === "permutation" ? renderPermutationCase() : renderShapeCase(state.transform);
    canvas.appendChild(svg);
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      state.transform = button.dataset.transform;
      buttons.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  render();
}

function initCnnWidget(widget) {
  if (!widget) return;
  const canvas = widget.querySelector("[data-canvas]");
  const summary = widget.querySelector("[data-summary]");
  const buttons = Array.from(widget.querySelectorAll("[data-shift]"));
  const state = { shifted: false };

  function render() {
    if (!canvas) return;
    clearChildren(canvas);

    const grid = state.shifted ? shiftGrid(CNN_PATTERN, 1, 1) : CNN_PATTERN;
    const output = convolveValid(grid, CNN_KERNEL);
    const flat = output.flat();
    const maxValue = Math.max(...flat);
    const highlightCells = [];
    output.forEach((row, rowIndex) => {
      row.forEach((value, colIndex) => {
        if (Math.abs(value - maxValue) <= EPSILON) {
          highlightCells.push([rowIndex, colIndex]);
        }
      });
    });

    const svg = buildSvg(760, 260, "tda-widget-svg");
    drawText(svg, 50, 20, "input patch", "gdl-svg-label");
    drawText(svg, 274, 20, "shared filter", "gdl-svg-label");
    drawText(svg, 468, 20, "feature map", "gdl-svg-label");

    drawGrid(svg, grid, 42, 42, 34, { palette: "input" });
    drawGrid(svg, CNN_KERNEL, 274, 72, 34, { palette: "kernel", numberScale: 0 });
    drawGrid(svg, output, 462, 72, 46, { palette: "output", numberScale: 0, highlightCells });

    drawLine(svg, 214, 128, 256, 128, "gdl-arrow");
    drawLine(svg, 392, 128, 442, 128, "gdl-arrow");
    drawText(svg, 42, 238, state.shifted ? "shifted one cell down-right" : "centered motif", "gdl-svg-small");

    canvas.appendChild(svg);

    if (summary) {
      summary.innerHTML =
        `<strong>Max response</strong>: ${formatNumber(maxValue, 0)} at ${highlightCells
          .map(([row, col]) => `(${row + 1}, ${col + 1})`)
          .join(" and ")}.<br>` +
        "Because the same kernel is reused everywhere, translating the input motif shifts the response map in the same way. That is the basic translation-equivariant CNN pattern.";
    }
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      state.shifted = button.dataset.shift === "shifted";
      buttons.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  render();
}

function initSetWidget(widget) {
  if (!widget) return;
  const canvas = widget.querySelector("[data-canvas]");
  const summary = widget.querySelector("[data-summary]");
  const buttons = Array.from(widget.querySelectorAll("[data-order]"));
  const state = { order: "original" };

  function render() {
    if (!canvas) return;
    clearChildren(canvas);

    const permutation = SET_PERMUTATIONS[state.order];
    const ordered = applyPermutation(SET_ELEMENTS, permutation);
    const encoded = ordered.map((item) => encodeSetElement(item.value));
    const pooled = sumPool(encoded);
    const svg = buildSvg(760, 270, "tda-widget-svg");

    drawText(svg, 48, 20, "input order", "gdl-svg-label");
    drawText(svg, 270, 20, "elementwise equivariant map", "gdl-svg-label");
    drawText(svg, 520, 20, "permutation-invariant pooling", "gdl-svg-label");

    ordered.forEach((item, index) => {
      drawBadge(
        svg,
        42,
        52 + index * 58,
        132,
        38,
        item.label,
        `(${formatNumber(item.value[0], 1)}, ${formatNumber(item.value[1], 1)})`
      );
      drawVectorBars(svg, encoded[index], 262, 62 + index * 58, 94);
      drawText(svg, 370, 70 + index * 58, item.label, "gdl-svg-small");
    });

    drawLine(svg, 184, 128, 238, 128, "gdl-arrow");
    drawLine(svg, 430, 128, 502, 128, "gdl-arrow");
    drawVectorBars(svg, pooled, 520, 80, 142);
    drawBadge(svg, 520, 134, 180, 42, "same pooled vector", "order changes, sum pool does not");

    canvas.appendChild(svg);

    if (summary) {
      summary.innerHTML =
        `<strong>Current order</strong>: ${ordered.map((item) => item.label).join(" → ")}.<br>` +
        `After the elementwise map, the outputs reorder in the same way, but the pooled set feature stays at (${formatNumber(
          pooled[0],
          2
        )}, ${formatNumber(pooled[1], 2)}).`;
    }
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      state.order = button.dataset.order;
      buttons.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  render();
}

function initMessagePassingWidget(widget) {
  if (!widget) return;
  const canvas = widget.querySelector("[data-canvas]");
  const summary = widget.querySelector("[data-summary]");
  const slider = widget.querySelector("[data-step]");
  const label = widget.querySelector("[data-step-label]");
  const state = { step: 0 };

  function render() {
    if (!canvas) return;
    clearChildren(canvas);

    const features = runMessagePassing(MESSAGE_GRAPH.adjacency, MESSAGE_GRAPH.initial, state.step, 0.55);
    const neighbors = MESSAGE_GRAPH.adjacency[5];
    const neighborMean = mean(neighbors.map((index) => features[index]));
    const svg = buildSvg(760, 300, "tda-widget-svg");

    drawText(svg, 44, 20, `layer ${state.step}`, "gdl-svg-label");
    drawGraph(svg, MESSAGE_GRAPH.positions, MESSAGE_GRAPH.adjacency, features, {
      highlightNode: 5,
      highlightEdges: neighbors.map((neighbor) => [5, neighbor])
    });

    drawBadge(svg, 430, 56, 238, 44, "message passing", "one layer mixes self-information with neighbor information");
    drawText(svg, 430, 132, "node 6 receives messages from nodes 1–5", "gdl-svg-small");
    drawText(
      svg,
      430,
      154,
      `h_6 = 0.55·self + 0.45·mean(neighbors) = ${formatNumber(features[5], 2)}`,
      "gdl-svg-small"
    );
    drawText(svg, 430, 176, `neighbor mean at this layer: ${formatNumber(neighborMean, 2)}`, "gdl-svg-small");

    MESSAGE_GRAPH.positions.forEach((position, index) => {
      drawText(svg, position[0] - 14, position[1] + 32, formatNumber(features[index], 2), "gdl-svg-small");
    });

    canvas.appendChild(svg);

    if (label) {
      label.textContent = String(state.step);
    }

    if (summary) {
      summary.innerHTML =
        `<strong>Hop radius</strong>: about ${state.step}.<br>` +
        "Each layer only exchanges information with immediate neighbors, so stacking layers grows the receptive field one graph hop at a time.";
    }
  }

  slider?.addEventListener("input", (event) => {
    state.step = Number(event.target.value);
    render();
  });

  render();
}

function drawVarianceHistory(svg, history, x, y, width, height) {
  drawLine(svg, x, y + height, x + width, y + height, "gdl-axis");
  drawLine(svg, x, y, x, y + height, "gdl-axis");
  const maxValue = Math.max(...history, EPSILON);
  const points = history.map((value, index) => [
    x + (index / Math.max(history.length - 1, 1)) * width,
    y + height - (value / maxValue) * (height - 8)
  ]);
  drawPath(svg, points, "gdl-geodesic");
}

function initOversmoothingWidget(widget) {
  if (!widget) return;
  const canvas = widget.querySelector("[data-canvas]");
  const summary = widget.querySelector("[data-summary]");
  const slider = widget.querySelector("[data-layers]");
  const label = widget.querySelector("[data-layers-label]");
  const state = { layers: 0 };

  function render() {
    if (!canvas) return;
    clearChildren(canvas);

    const current = runMessagePassing(SMOOTH_GRAPH.adjacency, SMOOTH_GRAPH.initial, state.layers, 0.65);
    const history = [];
    for (let layer = 0; layer <= state.layers; layer += 1) {
      history.push(featureVariance(runMessagePassing(SMOOTH_GRAPH.adjacency, SMOOTH_GRAPH.initial, layer, 0.65)));
    }

    const svg = buildSvg(760, 290, "tda-widget-svg");
    drawText(svg, 44, 20, "repeated local averaging on a chain", "gdl-svg-label");
    drawGraph(svg, SMOOTH_GRAPH.positions, SMOOTH_GRAPH.adjacency, current, { nodeRadius: 15 });
    SMOOTH_GRAPH.positions.forEach((position, index) => {
      drawText(svg, position[0] - 14, position[1] + 38, formatNumber(current[index], 2), "gdl-svg-small");
    });

    drawText(svg, 84, 176, "node features become harder to distinguish as the layers increase", "gdl-svg-small");
    drawText(svg, 430, 20, "feature variance across nodes", "gdl-svg-label");
    drawVarianceHistory(svg, history, 430, 40, 220, 130);
    drawText(svg, 430, 194, `current variance: ${formatNumber(history[history.length - 1], 4)}`, "gdl-svg-small");

    canvas.appendChild(svg);

    if (label) {
      label.textContent = String(state.layers);
    }

    if (summary) {
      summary.innerHTML =
        `<strong>Oversmoothing</strong>: repeated mixing drives node embeddings toward a narrow region, here reducing variance to ${formatNumber(
          history[history.length - 1],
          4
        )}.<br>` +
        "This is about representations becoming too similar, not about distant information being compressed through a graph bottleneck.";
    }
  }

  slider?.addEventListener("input", (event) => {
    state.layers = Number(event.target.value);
    render();
  });

  render();
}

function buildBinaryTreeLayout(depth) {
  const nodes = [];
  const edges = [];
  let index = 0;

  function addNode(level, top, bottom) {
    const currentIndex = index;
    index += 1;
    if (level === depth) {
      const y = (top + bottom) / 2;
      nodes.push({ x: 90 + level * 78, y, level, leaf: true });
      return currentIndex;
    }

    const mid = (top + bottom) / 2;
    nodes.push({ x: 90 + level * 78, y: mid, level, leaf: false });
    const left = addNode(level + 1, top, mid);
    const right = addNode(level + 1, mid, bottom);
    edges.push([currentIndex, left]);
    edges.push([currentIndex, right]);
    return currentIndex;
  }

  const root = addNode(0, 48, 252);
  return { nodes, edges, root };
}

function initOversquashingWidget(widget) {
  if (!widget) return;
  const canvas = widget.querySelector("[data-canvas]");
  const summary = widget.querySelector("[data-summary]");
  const slider = widget.querySelector("[data-depth]");
  const label = widget.querySelector("[data-depth-label]");
  const state = { depth: 3 };

  function render() {
    if (!canvas) return;
    clearChildren(canvas);

    const layout = buildBinaryTreeLayout(state.depth);
    const svg = buildSvg(760, 300, "tda-widget-svg");
    const bridgeX = 480;
    const bridgeY = 150;
    const targetX = 642;
    const targetY = 150;

    drawText(svg, 42, 20, `binary tree of depth ${state.depth}`, "gdl-svg-label");
    drawText(svg, 478, 20, "single narrow bridge to the target", "gdl-svg-label");

    layout.edges.forEach(([from, to]) => {
      const left = layout.nodes[from];
      const right = layout.nodes[to];
      drawLine(svg, left.x, left.y, right.x, right.y, "gdl-edge");
    });

    layout.nodes.forEach((node) => {
      drawCircle(svg, node.x, node.y, node.leaf ? 5.6 : 7.5, node.leaf ? "gdl-node is-blue" : "gdl-node is-green");
    });

    const rootNode = layout.nodes[layout.root];
    drawLine(svg, rootNode.x, rootNode.y, bridgeX, bridgeY, "gdl-edge is-bottleneck");
    drawLine(svg, bridgeX, bridgeY, targetX, targetY, "gdl-edge is-bottleneck");
    drawCircle(svg, bridgeX, bridgeY, 9, "gdl-node is-orange");
    drawCircle(svg, targetX, targetY, 11, "gdl-node is-yellow");
    drawText(svg, bridgeX - 18, bridgeY + 24, "bridge", "gdl-svg-small");
    drawText(svg, targetX - 14, targetY + 28, "target", "gdl-svg-small");

    drawBadge(svg, 478, 74, 192, 44, "incoming sources", `${binaryTreeLeafCount(state.depth)} leaves`);
    drawBadge(svg, 478, 132, 192, 44, "bottleneck width", "one edge / one hidden state path");
    drawBadge(svg, 478, 190, 192, 44, "compression ratio", `${formatNumber(oversquashRatio(state.depth), 1)} : 1`);

    canvas.appendChild(svg);

    if (label) {
      label.textContent = String(state.depth);
    }

    if (summary) {
      summary.innerHTML =
        `<strong>Oversquashing</strong>: ${binaryTreeLeafCount(state.depth)} distant sources must influence the target through one narrow bridge.<br>` +
        "This is not the same as oversmoothing. The issue is information bottlenecking through graph topology, even when node features remain distinct.";
    }
  }

  slider?.addEventListener("input", (event) => {
    state.depth = Number(event.target.value);
    render();
  });

  render();
}

function initGeodesicWidget(widget) {
  if (!widget) return;
  const canvas = widget.querySelector("[data-canvas]");
  const summary = widget.querySelector("[data-summary]");
  const buttons = Array.from(widget.querySelectorAll("[data-neighborhood]"));
  const state = { mode: "euclidean" };
  const queryIndex = 2;
  const candidateIndex = 5;

  function render() {
    if (!canvas) return;
    clearChildren(canvas);

    const query = GEODESIC_CURVE[queryIndex];
    const candidate = GEODESIC_CURVE[candidateIndex];
    const euclideanRadius = 76;
    const geodesicRadius = 150;
    const svg = buildSvg(760, 280, "tda-widget-svg");

    drawText(svg, 44, 20, state.mode === "euclidean" ? "Euclidean neighborhood" : "geodesic neighborhood", "gdl-svg-label");
    drawPath(svg, GEODESIC_CURVE, "gdl-manifold");

    if (state.mode === "euclidean") {
      drawCircle(svg, query[0], query[1], euclideanRadius, "gdl-neighborhood");
    } else {
      const lowerIndex = GEODESIC_CURVE.map((_, index) => index).filter(
        (index) => polylineArcDistance(GEODESIC_CURVE, queryIndex, index) <= geodesicRadius
      );
      const band = lowerIndex.map((index) => GEODESIC_CURVE[index]);
      if (band.length > 1) {
        drawPath(svg, band, "gdl-curve-band");
        drawPath(svg, band, "gdl-geodesic");
      }
    }

    drawLine(svg, query[0], query[1], candidate[0], candidate[1], "gdl-ambient-chord");
    GEODESIC_CURVE.forEach((point, index) => {
      const euclideanClose = euclideanDistance2D(query, point) <= euclideanRadius;
      const geodesicClose = polylineArcDistance(GEODESIC_CURVE, queryIndex, index) <= geodesicRadius;
      const highlighted = state.mode === "euclidean" ? euclideanClose : geodesicClose;
      drawCircle(svg, point[0], point[1], index === queryIndex || index === candidateIndex ? 8.5 : 6, highlighted ? "gdl-node is-yellow" : "gdl-node is-blue");
    });

    drawText(svg, query[0] - 12, query[1] - 14, "q", "gdl-svg-label");
    drawText(svg, candidate[0] + 10, candidate[1] - 4, "p", "gdl-svg-label");
    drawText(svg, 430, 72, `Euclidean(q,p) = ${formatNumber(euclideanDistance2D(query, candidate), 1)}`, "gdl-svg-small");
    drawText(svg, 430, 96, `Geodesic(q,p) ≈ ${formatNumber(polylineArcDistance(GEODESIC_CURVE, queryIndex, candidateIndex), 1)}`, "gdl-svg-small");
    drawBadge(svg, 430, 126, 220, 44, "ambient closeness", "straight-line distance in the embedding space");
    drawBadge(svg, 430, 184, 220, 44, "intrinsic closeness", "distance measured along the surface / domain");

    canvas.appendChild(svg);

    if (summary) {
      summary.innerHTML =
        `<strong>${state.mode === "euclidean" ? "Euclidean" : "Geodesic"} neighborhood</strong>: the dashed chord between q and p is short in ambient space, but the path along the curve is much longer.<br>` +
        "On non-Euclidean domains, locality should often be intrinsic rather than based only on straight-line ambient coordinates.";
    }
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.neighborhood;
      buttons.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  render();
}

function initGaugeWidget(widget) {
  if (!widget) return;
  const canvas = widget.querySelector("[data-canvas]");
  const summary = widget.querySelector("[data-summary]");
  const slider = widget.querySelector("[data-angle]");
  const label = widget.querySelector("[data-angle-label]");
  const state = { angle: 35 };
  const vector = [1.15, 0.55];

  function render() {
    if (!canvas) return;
    clearChildren(canvas);

    const angle = (state.angle * Math.PI) / 180;
    const components = componentsInRotatedFrame(vector, angle);
    const svg = buildSvg(760, 280, "tda-widget-svg");
    const origin = [210, 150];
    const scale = 66;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);

    drawText(svg, 48, 20, "same intrinsic tangent vector, different local frame", "gdl-svg-label");
    drawLine(svg, origin[0] - 90, origin[1], origin[0] + 90, origin[1], "gdl-grid-line");
    drawLine(svg, origin[0], origin[1] - 90, origin[0], origin[1] + 90, "gdl-grid-line");
    drawLine(svg, origin[0], origin[1], origin[0] + scale, origin[1], "gdl-frame-axis");
    drawLine(svg, origin[0], origin[1], origin[0], origin[1] - scale, "gdl-frame-axis");
    drawLine(svg, origin[0], origin[1], origin[0] + cosine * scale, origin[1] - sine * scale, "gdl-arrow");
    drawLine(svg, origin[0], origin[1], origin[0] - sine * scale, origin[1] - cosine * scale, "gdl-arrow");
    drawLine(
      svg,
      origin[0],
      origin[1],
      origin[0] + vector[0] * scale,
      origin[1] - vector[1] * scale,
      "gdl-geodesic"
    );
    drawCircle(svg, origin[0] + vector[0] * scale, origin[1] - vector[1] * scale, 7, "gdl-node is-green");

    drawText(svg, origin[0] + scale + 8, origin[1] + 4, "e₁", "gdl-svg-small");
    drawText(svg, origin[0] - 12, origin[1] - scale - 8, "e₂", "gdl-svg-small");
    drawText(svg, origin[0] + cosine * scale + 10, origin[1] - sine * scale + 4, "ê₁", "gdl-svg-small");
    drawText(svg, origin[0] - sine * scale + 8, origin[1] - cosine * scale - 8, "ê₂", "gdl-svg-small");
    drawText(svg, origin[0] + vector[0] * scale + 10, origin[1] - vector[1] * scale - 4, "v", "gdl-svg-label");

    drawBadge(svg, 430, 68, 222, 44, "frame rotation", `${state.angle} degrees`);
    drawBadge(svg, 430, 126, 222, 44, "components in the rotated frame", `(${formatNumber(components[0], 2)}, ${formatNumber(components[1], 2)})`);
    drawBadge(svg, 430, 184, 222, 44, "intrinsic quantity", "the tangent vector itself does not change");

    canvas.appendChild(svg);

    if (label) {
      label.textContent = `${state.angle}°`;
    }

    if (summary) {
      summary.innerHTML =
        "<strong>Gauge / local-frame intuition</strong>: changing the local coordinate frame changes the vector components, but not the underlying geometric tangent vector.<br>" +
        "Gauge-equivariant constructions are designed to commute with these local frame changes instead of depending on one arbitrary chart choice.";
    }
  }

  slider?.addEventListener("input", (event) => {
    state.angle = Number(event.target.value);
    render();
  });

  render();
}

export function enhanceGdlNotesPage(root = document) {
  const page = enhanceMathNotebookPage(root, {
    bodyClass: "gdl-notes-page"
  });

  if (!page) {
    return null;
  }

  initSymmetryWidget(page.querySelector('[data-widget="symmetry-demo"]'));
  initCnnWidget(page.querySelector('[data-widget="cnn-demo"]'));
  initSetWidget(page.querySelector('[data-widget="set-demo"]'));
  initMessagePassingWidget(page.querySelector('[data-widget="message-passing-demo"]'));
  initOversmoothingWidget(page.querySelector('[data-widget="oversmoothing-demo"]'));
  initOversquashingWidget(page.querySelector('[data-widget="oversquashing-demo"]'));
  initGeodesicWidget(page.querySelector('[data-widget="geodesic-demo"]'));
  initGaugeWidget(page.querySelector('[data-widget="gauge-demo"]'));
  return page;
}
