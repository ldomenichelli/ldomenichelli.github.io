import { buildSvg, clearChildren, createSvgElement, enhanceMathNotebookPage } from "./math-notebook.js";

const EPSILON = 1e-9;

const DISCRETE_POSITIONS = [0.1, 0.48, 0.86];
const DISCRETE_PRESETS = {
  shift: {
    label: "shifted mass",
    source: [6, 3, 1],
    target: [1, 3, 6]
  },
  split: {
    label: "split target",
    source: [5, 4, 1],
    target: [2, 5, 3]
  },
  central: {
    label: "central pile",
    source: [2, 7, 1],
    target: [4, 1, 5]
  }
};

const ONE_D_POSITIONS = [0.08, 0.24, 0.4, 0.56, 0.72, 0.88];
const ONE_D_PRESETS = {
  shift: {
    label: "translated bump",
    source: [4, 6, 3, 1, 0.5, 0.5],
    target: [0.5, 1, 3, 6, 4, 1]
  },
  split: {
    label: "one peak to two peaks",
    source: [1, 3, 7, 4, 1, 0.5],
    target: [4, 1, 2, 1.5, 4, 4]
  },
  tails: {
    label: "mass in the tails",
    source: [3, 1, 0.5, 0.5, 2, 5],
    target: [5, 2, 0.5, 0.5, 1, 3]
  }
};

const GEODESIC_SOURCE_ATOMS = [-1.35, -0.7, -0.1, 0.38, 0.92];
const GEODESIC_TARGET_ATOMS = [-0.8, -0.12, 0.46, 0.92, 1.42];

const SINKHORN_PRESETS = {
  sharp: {
    label: "sharp shift",
    source: normalizeWeights([7, 2, 1]),
    target: normalizeWeights([1, 2, 7]),
    p: 2
  },
  mixed: {
    label: "mixed redistribution",
    source: normalizeWeights([5, 3, 2]),
    target: normalizeWeights([2, 6, 2]),
    p: 2
  }
};

const BARYCENTER_PRESETS = {
  bimodal: {
    label: "two separated modes",
    left: [-1.2, -0.72, -0.16, 0.34, 0.82],
    right: [-0.38, 0.18, 0.74, 1.18, 1.5]
  },
  crossing: {
    label: "crossing supports",
    left: [-1.35, -0.82, -0.34, 0.12, 0.58],
    right: [-0.9, -0.22, 0.32, 0.98, 1.42]
  }
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

export function normalizeWeights(values) {
  const total = sum(values);
  if (total <= EPSILON) {
    return values.map(() => 1 / values.length);
  }
  return values.map((value) => value / total);
}

export function costMatrixFromPositions(sourcePositions, targetPositions, p = 1) {
  return sourcePositions.map((source) => targetPositions.map((target) => Math.abs(source - target) ** p));
}

function combinations(values, size) {
  if (size === 0) {
    return [[]];
  }
  if (size > values.length) {
    return [];
  }

  const items = [];
  for (let index = 0; index <= values.length - size; index += 1) {
    const tails = combinations(values.slice(index + 1), size - 1);
    tails.forEach((tail) => items.push([values[index], ...tail]));
  }
  return items;
}

function gaussianSolve(matrix, vector) {
  const n = vector.length;
  const augmented = matrix.map((row, rowIndex) => [...row, vector[rowIndex]]);

  for (let col = 0; col < n; col += 1) {
    let pivotRow = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(augmented[row][col]) > Math.abs(augmented[pivotRow][col])) {
        pivotRow = row;
      }
    }

    if (Math.abs(augmented[pivotRow][col]) <= EPSILON) {
      return null;
    }

    if (pivotRow !== col) {
      [augmented[col], augmented[pivotRow]] = [augmented[pivotRow], augmented[col]];
    }

    const pivot = augmented[col][col];
    for (let entry = col; entry <= n; entry += 1) {
      augmented[col][entry] /= pivot;
    }

    for (let row = 0; row < n; row += 1) {
      if (row === col) {
        continue;
      }
      const factor = augmented[row][col];
      if (Math.abs(factor) <= EPSILON) {
        continue;
      }
      for (let entry = col; entry <= n; entry += 1) {
        augmented[row][entry] -= factor * augmented[col][entry];
      }
    }
  }

  return augmented.map((row) => row[n]);
}

export function computePlanCost(plan, costs) {
  return plan.reduce((total, row, rowIndex) => {
    return total + row.reduce((rowTotal, value, colIndex) => rowTotal + value * costs[rowIndex][colIndex], 0);
  }, 0);
}

function almostEqual(left, right, tolerance = 1e-7) {
  return Math.abs(left - right) <= tolerance;
}

function planMarginalResidual(plan, source, target) {
  const rowResidual = Math.max(
    ...plan.map((row, rowIndex) => Math.abs(sum(row) - source[rowIndex]))
  );
  const colResidual = Math.max(
    ...target.map((_, colIndex) => {
      const total = plan.reduce((columnTotal, row) => columnTotal + row[colIndex], 0);
      return Math.abs(total - target[colIndex]);
    })
  );
  return Math.max(rowResidual, colResidual);
}

export function solveTransport3x3(source, target, costs) {
  if (source.length !== 3 || target.length !== 3) {
    throw new Error("solveTransport3x3 expects 3x3 marginals.");
  }

  const cells = Array.from({ length: 9 }, (_, index) => index);
  let best = null;

  combinations(cells, 5).forEach((support) => {
    const matrix = Array.from({ length: 5 }, () => Array(5).fill(0));
    const rhs = [source[0], source[1], source[2], target[0], target[1]];

    support.forEach((cell, column) => {
      const rowIndex = Math.floor(cell / 3);
      const colIndex = cell % 3;
      matrix[rowIndex][column] = 1;
      if (colIndex < 2) {
        matrix[3 + colIndex][column] = 1;
      }
    });

    const solution = gaussianSolve(matrix, rhs);
    if (!solution) {
      return;
    }

    const plan = Array.from({ length: 3 }, () => Array(3).fill(0));
    support.forEach((cell, index) => {
      plan[Math.floor(cell / 3)][cell % 3] = Math.abs(solution[index]) <= 1e-8 ? 0 : solution[index];
    });

    const isFeasible =
      plan.every((row) => row.every((value) => value >= -1e-8)) &&
      source.every((value, rowIndex) => almostEqual(sum(plan[rowIndex]), value, 1e-6)) &&
      target.every((value, colIndex) => {
        const total = plan.reduce((columnTotal, row) => columnTotal + row[colIndex], 0);
        return almostEqual(total, value, 1e-6);
      });

    if (!isFeasible) {
      return;
    }

    const cost = computePlanCost(plan, costs);
    if (!best || cost < best.cost - 1e-9) {
      best = { plan, cost };
    }
  });

  if (!best) {
    throw new Error("No feasible transport plan found for the 3x3 problem.");
  }

  return best;
}

function matrixEntropy(plan) {
  return -plan.reduce((total, row) => {
    return total + row.reduce((rowTotal, value) => rowTotal + (value > EPSILON ? value * Math.log(value) : 0), 0);
  }, 0);
}

export function sinkhorn(source, target, costs, epsilon, iterations = 120) {
  const rows = source.length;
  const cols = target.length;
  const kernel = costs.map((row) => row.map((value) => Math.exp(-value / epsilon)));
  let u = Array(rows).fill(1);
  let v = Array(cols).fill(1);

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    u = source.map((mass, rowIndex) => {
      const denom = sum(kernel[rowIndex].map((value, colIndex) => value * v[colIndex]));
      return mass / Math.max(denom, EPSILON);
    });

    v = target.map((mass, colIndex) => {
      const denom = sum(kernel.map((row, rowIndex) => row[colIndex] * u[rowIndex]));
      return mass / Math.max(denom, EPSILON);
    });
  }

  const plan = Array.from({ length: rows }, (_, rowIndex) =>
    Array.from({ length: cols }, (_, colIndex) => u[rowIndex] * kernel[rowIndex][colIndex] * v[colIndex])
  );

  return {
    plan,
    cost: computePlanCost(plan, costs),
    entropy: matrixEntropy(plan),
    residual: planMarginalResidual(plan, source, target)
  };
}

export function cumulativeDistribution(weights) {
  let running = 0;
  return weights.map((value) => {
    running += value;
    return running;
  });
}

export function greedy1DTransport(source, target) {
  const plan = [];
  let sourceIndex = 0;
  let targetIndex = 0;
  let sourceLeft = source[0] ?? 0;
  let targetLeft = target[0] ?? 0;

  while (sourceIndex < source.length && targetIndex < target.length) {
    const moved = Math.min(sourceLeft, targetLeft);
    if (moved > EPSILON) {
      plan.push({ source: sourceIndex, target: targetIndex, mass: moved });
    }

    sourceLeft -= moved;
    targetLeft -= moved;

    if (sourceLeft <= EPSILON) {
      sourceIndex += 1;
      sourceLeft = source[sourceIndex] ?? 0;
    }

    if (targetLeft <= EPSILON) {
      targetIndex += 1;
      targetLeft = target[targetIndex] ?? 0;
    }
  }

  return plan;
}

function oneDimensionalCost(source, target, positions, p = 1) {
  return greedy1DTransport(source, target).reduce((total, flow) => {
    return total + flow.mass * Math.abs(positions[flow.source] - positions[flow.target]) ** p;
  }, 0);
}

export function displacementInterpolateAtoms(sourceAtoms, targetAtoms, t) {
  return sourceAtoms.map((value, index) => (1 - t) * value + t * targetAtoms[index]);
}

export function barycenterAtoms(atomSets, weights) {
  if (!atomSets.length) {
    return [];
  }

  return atomSets[0].map((_, index) =>
    atomSets.reduce((total, atoms, atomSetIndex) => total + atoms[index] * weights[atomSetIndex], 0)
  );
}

function formatMass(value) {
  return value.toFixed(2);
}

function formatCost(value) {
  return value.toFixed(3);
}

function appendText(svg, attrs, text) {
  const label = createSvgElement("text", attrs);
  label.textContent = text;
  svg.appendChild(label);
  return label;
}

function normalizeToCanvas(value, minValue, maxValue, left, right) {
  const ratio = (value - minValue) / (maxValue - minValue || 1);
  return left + ratio * (right - left);
}

function sampledDensity(atoms, minValue, maxValue, steps = 140, bandwidth = 0.16) {
  return Array.from({ length: steps }, (_, index) => {
    const x = minValue + (index / (steps - 1)) * (maxValue - minValue);
    const density = atoms.reduce((total, atom) => {
      const z = (x - atom) / bandwidth;
      return total + Math.exp(-0.5 * z * z);
    }, 0);
    return { x, y: density / (atoms.length * bandwidth * Math.sqrt(2 * Math.PI)) };
  });
}

function densityPath(points, mapX, mapY, baseline) {
  const commands = points.map((point, index) => `${index === 0 ? "M" : "L"} ${mapX(point.x)} ${mapY(point.y)}`);
  commands.push(`L ${mapX(points.at(-1).x)} ${baseline}`);
  commands.push(`L ${mapX(points[0].x)} ${baseline} Z`);
  return commands.join(" ");
}

function linePath(points, mapX, mapY) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${mapX(point.x)} ${mapY(point.y)}`).join(" ");
}

function stepPath(points, mapX, mapY) {
  if (!points.length) {
    return "";
  }

  const commands = [`M ${mapX(points[0].x)} ${mapY(points[0].y)}`];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    commands.push(`L ${mapX(current.x)} ${mapY(previous.y)}`);
    commands.push(`L ${mapX(current.x)} ${mapY(current.y)}`);
  }
  return commands.join(" ");
}

function updateSliderLabels(sliders) {
  sliders.forEach((slider) => {
    const label = slider.closest(".ot-slider-row")?.querySelector("[data-value]");
    if (label) {
      label.textContent = slider.value;
    }
  });
}

function renderHeatmapSvg(plan, costs, title) {
  const svg = buildSvg(300, 220, "tda-widget-svg ot-widget-svg");
  const cellWidth = 74;
  const cellHeight = 44;
  const left = 58;
  const top = 42;
  const maxValue = Math.max(...plan.flat(), EPSILON);

  appendText(svg, { x: 16, y: 18, class: "tda-svg-small-label" }, title);

  for (let rowIndex = 0; rowIndex < 3; rowIndex += 1) {
    appendText(svg, { x: 16, y: top + rowIndex * cellHeight + 28, class: "tda-svg-small-label" }, `x${rowIndex + 1}`);
  }

  for (let colIndex = 0; colIndex < 3; colIndex += 1) {
    appendText(svg, { x: left + colIndex * cellWidth + 24, y: 26, class: "tda-svg-small-label" }, `y${colIndex + 1}`);
  }

  plan.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      const rect = createSvgElement("rect", {
        x: left + colIndex * cellWidth,
        y: top + rowIndex * cellHeight,
        width: cellWidth - 6,
        height: cellHeight - 6,
        rx: 10,
        class: "ot-heat-cell",
        style: `opacity:${0.12 + 0.88 * (value / maxValue)}`
      });
      svg.appendChild(rect);
      appendText(
        svg,
        {
          x: left + colIndex * cellWidth + 8,
          y: top + rowIndex * cellHeight + 18,
          class: "ot-heat-mass"
        },
        formatMass(value)
      );
      appendText(
        svg,
        {
          x: left + colIndex * cellWidth + 8,
          y: top + rowIndex * cellHeight + 34,
          class: "ot-heat-cost"
        },
        `c=${formatCost(costs[rowIndex][colIndex])}`
      );
    });
  });

  return svg;
}

function initDiscreteCouplingWidget(root) {
  if (!root) {
    return;
  }

  const canvas = root.querySelector("[data-canvas]");
  const summary = root.querySelector("[data-summary]");
  const sourceSliders = Array.from(root.querySelectorAll("[data-source-mass]"));
  const targetSliders = Array.from(root.querySelectorAll("[data-target-mass]"));
  const powerButtons = Array.from(root.querySelectorAll("[data-cost-power]"));
  const presetButtons = Array.from(root.querySelectorAll("[data-coupling-preset]"));
  const state = {
    p: 1,
    source: [...DISCRETE_PRESETS.shift.source],
    target: [...DISCRETE_PRESETS.shift.target]
  };

  function applyPreset(presetKey) {
    const preset = DISCRETE_PRESETS[presetKey];
    state.source = [...preset.source];
    state.target = [...preset.target];
    sourceSliders.forEach((slider, index) => {
      slider.value = String(state.source[index]);
    });
    targetSliders.forEach((slider, index) => {
      slider.value = String(state.target[index]);
    });
    updateSliderLabels([...sourceSliders, ...targetSliders]);
    presetButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.couplingPreset === presetKey));
  }

  function render() {
    if (!canvas) {
      return;
    }

    clearChildren(canvas);
    const source = normalizeWeights(state.source);
    const target = normalizeWeights(state.target);
    const costs = costMatrixFromPositions(DISCRETE_POSITIONS, DISCRETE_POSITIONS, state.p);
    const exact = solveTransport3x3(source, target, costs);

    const wrapper = document.createElement("div");
    wrapper.className = "ot-widget-grid";

    const flowSvg = buildSvg(420, 244, "tda-widget-svg ot-widget-svg");
    const baseX = 48;
    const spanX = 324;
    const sourceY = 90;
    const targetY = 196;
    const maxBarHeight = 48;

    appendText(flowSvg, { x: 18, y: 20, class: "tda-svg-small-label" }, "Mass geometry and optimal flows");
    flowSvg.appendChild(createSvgElement("line", { x1: 24, y1: sourceY, x2: 392, y2: sourceY, class: "tda-axis-line" }));
    flowSvg.appendChild(createSvgElement("line", { x1: 24, y1: targetY, x2: 392, y2: targetY, class: "tda-axis-line" }));

    const sourcePoints = DISCRETE_POSITIONS.map((position) => baseX + position * spanX);
    const targetPoints = DISCRETE_POSITIONS.map((position) => baseX + position * spanX);

    source.forEach((mass, index) => {
      const x = sourcePoints[index];
      const height = mass * maxBarHeight / Math.max(...source);
      flowSvg.appendChild(
        createSvgElement("rect", {
          x: x - 16,
          y: sourceY - height,
          width: 32,
          height,
          rx: 8,
          class: "ot-mass-bar is-blue"
        })
      );
      appendText(flowSvg, { x: x - 12, y: sourceY + 18, class: "tda-svg-small-label" }, `x${index + 1}`);
      appendText(flowSvg, { x: x - 16, y: sourceY - height - 8, class: "tda-svg-small-label" }, formatMass(mass));
    });

    target.forEach((mass, index) => {
      const x = targetPoints[index];
      const height = mass * maxBarHeight / Math.max(...target);
      flowSvg.appendChild(
        createSvgElement("rect", {
          x: x - 16,
          y: targetY - height,
          width: 32,
          height,
          rx: 8,
          class: "ot-mass-bar is-yellow"
        })
      );
      appendText(flowSvg, { x: x - 12, y: targetY + 18, class: "tda-svg-small-label" }, `y${index + 1}`);
      appendText(flowSvg, { x: x - 16, y: targetY - height - 8, class: "tda-svg-small-label" }, formatMass(mass));
    });

    exact.plan.forEach((row, rowIndex) => {
      row.forEach((mass, colIndex) => {
        if (mass <= EPSILON) {
          return;
        }
        flowSvg.appendChild(
          createSvgElement("line", {
            x1: sourcePoints[rowIndex],
            y1: sourceY + 2,
            x2: targetPoints[colIndex],
            y2: targetY - 2,
            class: "ot-flow-line",
            style: `stroke-width:${2 + 20 * mass}`
          })
        );
      });
    });

    wrapper.appendChild(flowSvg);
    wrapper.appendChild(renderHeatmapSvg(exact.plan, costs, "Optimal coupling pi"));
    canvas.appendChild(wrapper);

    if (summary) {
      const objective = exact.cost;
      const wp = objective ** (1 / state.p);
      const active = exact.plan.flat().filter((value) => value > 1e-6).length;
      summary.innerHTML =
        "<strong>Problem</strong>: minimize sum c_ij pi_ij with prescribed row and column sums.<br>" +
        `<strong>Objective</strong>: ${formatCost(objective)}; <strong>derived</strong> W${state.p} = ${formatCost(wp)}.<br>` +
        `${active} active transport entries. Changing the masses alters the feasible polytope; changing p changes the geometry encoded by the costs.`;
    }
  }

  sourceSliders.forEach((slider, index) => {
    slider.addEventListener("input", () => {
      state.source[index] = Number(slider.value);
      updateSliderLabels([...sourceSliders, ...targetSliders]);
      render();
    });
  });

  targetSliders.forEach((slider, index) => {
    slider.addEventListener("input", () => {
      state.target[index] = Number(slider.value);
      updateSliderLabels([...sourceSliders, ...targetSliders]);
      render();
    });
  });

  powerButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.p = Number(button.dataset.costPower);
      powerButtons.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  presetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      applyPreset(button.dataset.couplingPreset);
      render();
    });
  });

  applyPreset("shift");
  powerButtons.forEach((button) => button.classList.toggle("is-active", Number(button.dataset.costPower) === state.p));
  render();
}

function initOneDTransportWidget(root) {
  if (!root) {
    return;
  }

  const canvas = root.querySelector("[data-canvas]");
  const summary = root.querySelector("[data-summary]");
  const presetButtons = Array.from(root.querySelectorAll("[data-oned-preset]"));
  const powerButtons = Array.from(root.querySelectorAll("[data-oned-power]"));
  const state = {
    preset: "shift",
    p: 1
  };

  function render() {
    const preset = ONE_D_PRESETS[state.preset];
    const source = normalizeWeights(preset.source);
    const target = normalizeWeights(preset.target);
    const cdfSource = cumulativeDistribution(source);
    const cdfTarget = cumulativeDistribution(target);
    const plan = greedy1DTransport(source, target);
    const objective = oneDimensionalCost(source, target, ONE_D_POSITIONS, state.p);

    clearChildren(canvas);
    const svg = buildSvg(760, 336, "tda-widget-svg ot-widget-svg");
    const left = 46;
    const right = 724;
    const width = right - left;
    const mapX = (position) => left + position * width;
    const maxMass = Math.max(...source, ...target);

    appendText(svg, { x: 16, y: 18, class: "tda-svg-small-label" }, "Ordered supports, monotone matching, and cumulative distribution functions");
    svg.appendChild(createSvgElement("line", { x1: left, y1: 92, x2: right, y2: 92, class: "tda-axis-line" }));
    svg.appendChild(createSvgElement("line", { x1: left, y1: 188, x2: right, y2: 188, class: "tda-axis-line" }));
    svg.appendChild(createSvgElement("line", { x1: left, y1: 312, x2: right, y2: 312, class: "tda-axis-line" }));
    svg.appendChild(createSvgElement("line", { x1: left, y1: 312, x2: left, y2: 226, class: "tda-axis-line" }));

    appendText(svg, { x: 16, y: 64, class: "tda-svg-small-label" }, "source mass");
    appendText(svg, { x: 16, y: 160, class: "tda-svg-small-label" }, "target mass");
    appendText(svg, { x: 16, y: 226, class: "tda-svg-small-label" }, "CDFs");

    ONE_D_POSITIONS.forEach((position, index) => {
      const x = mapX(position);
      const sourceHeight = (source[index] / maxMass) * 44;
      const targetHeight = (target[index] / maxMass) * 44;
      svg.appendChild(createSvgElement("rect", { x: x - 20, y: 92 - sourceHeight, width: 18, height: sourceHeight, rx: 6, class: "ot-mass-bar is-blue" }));
      svg.appendChild(createSvgElement("rect", { x: x + 2, y: 188 - targetHeight, width: 18, height: targetHeight, rx: 6, class: "ot-mass-bar is-yellow" }));
      appendText(svg, { x: x - 7, y: 206, class: "tda-svg-small-label" }, String(index + 1));
    });

    plan.forEach((flow) => {
      const x1 = mapX(ONE_D_POSITIONS[flow.source]) - 11;
      const x2 = mapX(ONE_D_POSITIONS[flow.target]) + 11;
      svg.appendChild(
        createSvgElement("line", {
          x1,
          y1: 104,
          x2,
          y2: 176,
          class: "ot-flow-line",
          style: `stroke-width:${2 + 24 * flow.mass}`
        })
      );
    });

    const cdfPointsSource = [{ x: 0, y: 0 }, ...ONE_D_POSITIONS.map((position, index) => ({ x: position, y: cdfSource[index] }))];
    const cdfPointsTarget = [{ x: 0, y: 0 }, ...ONE_D_POSITIONS.map((position, index) => ({ x: position, y: cdfTarget[index] }))];
    const mapY = (value) => 312 - value * 74;

    svg.appendChild(
      createSvgElement("path", {
        d: stepPath(cdfPointsSource, mapX, mapY),
        class: "ot-step-line is-blue"
      })
    );
    svg.appendChild(
      createSvgElement("path", {
        d: stepPath(cdfPointsTarget, mapX, mapY),
        class: "ot-step-line is-yellow"
      })
    );

    appendText(svg, { x: 650, y: 242, class: "tda-svg-small-label" }, "F_mu");
    appendText(svg, { x: 650, y: 260, class: "tda-svg-small-label" }, "F_nu");

    canvas.appendChild(svg);

    if (summary) {
      summary.innerHTML =
        "<strong>Exact in one dimension</strong>: order the support and transport monotonically.<br>" +
        `For this preset, W${state.p}^${state.p} = ${formatCost(objective)} and W${state.p} = ${formatCost(objective ** (1 / state.p))}.<br>` +
        (state.p === 1
          ? "For W1, the same quantity can be read from the area between the two CDFs."
          : "For p >= 1, the monotone coupling is still optimal in one dimension; quadratic cost simply weights long moves more heavily.");
    }
  }

  presetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.preset = button.dataset.onedPreset;
      presetButtons.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  powerButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.p = Number(button.dataset.onedPower);
      powerButtons.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  presetButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.onedPreset === state.preset));
  powerButtons.forEach((button) => button.classList.toggle("is-active", Number(button.dataset.onedPower) === state.p));
  render();
}

function initGeodesicWidget(root) {
  if (!root) {
    return;
  }

  const canvas = root.querySelector("[data-canvas]");
  const summary = root.querySelector("[data-summary]");
  const slider = root.querySelector("[data-geodesic-time]");
  const label = root.querySelector("[data-geodesic-label]");
  const minValue = -1.6;
  const maxValue = 1.7;
  const state = { t: Number(slider?.value || 0) / 100 };

  function render() {
    const atoms = displacementInterpolateAtoms(GEODESIC_SOURCE_ATOMS, GEODESIC_TARGET_ATOMS, state.t);
    const leftCurve = sampledDensity(GEODESIC_SOURCE_ATOMS, minValue, maxValue);
    const rightCurve = sampledDensity(GEODESIC_TARGET_ATOMS, minValue, maxValue);
    const currentCurve = sampledDensity(atoms, minValue, maxValue);
    const maxDensity = Math.max(...leftCurve.map((point) => point.y), ...rightCurve.map((point) => point.y), ...currentCurve.map((point) => point.y));

    clearChildren(canvas);
    const svg = buildSvg(760, 268, "tda-widget-svg ot-widget-svg");
    const left = 48;
    const right = 724;
    const bottom = 212;
    const mapX = (value) => normalizeToCanvas(value, minValue, maxValue, left, right);
    const mapY = (value) => bottom - (value / maxDensity) * 120;

    appendText(svg, { x: 16, y: 18, class: "tda-svg-small-label" }, "Displacement interpolation under an optimal matching");
    svg.appendChild(createSvgElement("line", { x1: left, y1: bottom, x2: right, y2: bottom, class: "tda-axis-line" }));

    svg.appendChild(createSvgElement("path", { d: densityPath(leftCurve, mapX, mapY, bottom), class: "ot-density-fill is-blue" }));
    svg.appendChild(createSvgElement("path", { d: densityPath(rightCurve, mapX, mapY, bottom), class: "ot-density-fill is-yellow" }));
    svg.appendChild(createSvgElement("path", { d: densityPath(currentCurve, mapX, mapY, bottom), class: "ot-density-fill is-green" }));

    GEODESIC_SOURCE_ATOMS.forEach((value) => {
      svg.appendChild(createSvgElement("circle", { cx: mapX(value), cy: 238, r: 5, class: "ot-particle is-blue" }));
    });
    atoms.forEach((value) => {
      svg.appendChild(createSvgElement("circle", { cx: mapX(value), cy: 222, r: 5.5, class: "ot-particle is-green" }));
    });
    GEODESIC_TARGET_ATOMS.forEach((value) => {
      svg.appendChild(createSvgElement("circle", { cx: mapX(value), cy: 252, r: 5, class: "ot-particle is-yellow" }));
    });

    appendText(svg, { x: 16, y: 238, class: "tda-svg-small-label" }, "mu_0");
    appendText(svg, { x: 16, y: 224, class: "tda-svg-small-label" }, "mu_t");
    appendText(svg, { x: 16, y: 252, class: "tda-svg-small-label" }, "mu_1");
    canvas.appendChild(svg);

    if (label) {
      label.textContent = state.t.toFixed(2);
    }

    if (summary) {
      summary.innerHTML =
        `<strong>Path of measures</strong>: mu_t = ((1 - t) id + tT)# mu_0 with t = ${state.t.toFixed(2)}.<br>` +
        "In this toy one-dimensional setting the particles move along straight trajectories determined by the optimal monotone matching. For quadratic cost, this is the basic picture behind Wasserstein geodesics.";
    }
  }

  slider?.addEventListener("input", (event) => {
    state.t = Number(event.target.value) / 100;
    render();
  });

  render();
}

function initSinkhornWidget(root) {
  if (!root) {
    return;
  }

  const canvas = root.querySelector("[data-canvas]");
  const summary = root.querySelector("[data-summary]");
  const slider = root.querySelector("[data-epsilon]");
  const label = root.querySelector("[data-epsilon-label]");
  const presetButtons = Array.from(root.querySelectorAll("[data-sinkhorn-preset]"));
  const state = {
    preset: "sharp",
    epsilon: Number(slider?.value || 18) / 100
  };

  function render() {
    const preset = SINKHORN_PRESETS[state.preset];
    const costs = costMatrixFromPositions(DISCRETE_POSITIONS, DISCRETE_POSITIONS, preset.p);
    const exact = solveTransport3x3(preset.source, preset.target, costs);
    const regularized = sinkhorn(preset.source, preset.target, costs, state.epsilon, 180);

    clearChildren(canvas);
    const wrapper = document.createElement("div");
    wrapper.className = "ot-widget-grid is-equal";
    wrapper.appendChild(renderHeatmapSvg(exact.plan, costs, "Exact OT"));
    wrapper.appendChild(renderHeatmapSvg(regularized.plan, costs, `Sinkhorn (epsilon = ${state.epsilon.toFixed(2)})`));
    canvas.appendChild(wrapper);

    if (label) {
      label.textContent = state.epsilon.toFixed(2);
    }

    if (summary) {
      summary.innerHTML =
        `<strong>Exact objective</strong>: ${formatCost(exact.cost)}; <strong>regularized objective</strong>: ${formatCost(regularized.cost)}.<br>` +
        `<strong>Entropy</strong>: ${formatCost(regularized.entropy)}; marginal residual ${regularized.residual.toExponential(1)}.<br>` +
        "Larger regularization spreads mass across more entries, giving a smoother plan that is cheaper to compute but biased relative to exact OT.";
    }
  }

  slider?.addEventListener("input", (event) => {
    state.epsilon = Number(event.target.value) / 100;
    render();
  });

  presetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.preset = button.dataset.sinkhornPreset;
      presetButtons.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  presetButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.sinkhornPreset === state.preset));
  render();
}

function initBarycenterWidget(root) {
  if (!root) {
    return;
  }

  const canvas = root.querySelector("[data-canvas]");
  const summary = root.querySelector("[data-summary]");
  const slider = root.querySelector("[data-barycenter-weight]");
  const label = root.querySelector("[data-barycenter-label]");
  const presetButtons = Array.from(root.querySelectorAll("[data-barycenter-preset]"));
  const state = {
    preset: "bimodal",
    lambda: Number(slider?.value || 50) / 100
  };

  function render() {
    const preset = BARYCENTER_PRESETS[state.preset];
    const barycenter = barycenterAtoms([preset.left, preset.right], [1 - state.lambda, state.lambda]);
    const minValue = Math.min(...preset.left, ...preset.right) - 0.35;
    const maxValue = Math.max(...preset.left, ...preset.right) + 0.35;
    const leftCurve = sampledDensity(preset.left, minValue, maxValue, 140, 0.18);
    const rightCurve = sampledDensity(preset.right, minValue, maxValue, 140, 0.18);
    const baryCurve = sampledDensity(barycenter, minValue, maxValue, 140, 0.18);
    const maxDensity = Math.max(...leftCurve.map((point) => point.y), ...rightCurve.map((point) => point.y), ...baryCurve.map((point) => point.y));

    clearChildren(canvas);
    const svg = buildSvg(760, 276, "tda-widget-svg ot-widget-svg");
    const left = 48;
    const right = 724;
    const bottom = 210;
    const mapX = (value) => normalizeToCanvas(value, minValue, maxValue, left, right);
    const mapY = (value) => bottom - (value / maxDensity) * 126;

    appendText(svg, { x: 16, y: 18, class: "tda-svg-small-label" }, "Barycenter as an average in transport geometry");
    svg.appendChild(createSvgElement("line", { x1: left, y1: bottom, x2: right, y2: bottom, class: "tda-axis-line" }));
    svg.appendChild(createSvgElement("path", { d: densityPath(leftCurve, mapX, mapY, bottom), class: "ot-density-fill is-blue" }));
    svg.appendChild(createSvgElement("path", { d: densityPath(rightCurve, mapX, mapY, bottom), class: "ot-density-fill is-yellow" }));
    svg.appendChild(createSvgElement("path", { d: densityPath(baryCurve, mapX, mapY, bottom), class: "ot-density-fill is-green" }));

    preset.left.forEach((value) => svg.appendChild(createSvgElement("circle", { cx: mapX(value), cy: 236, r: 5, class: "ot-particle is-blue" })));
    barycenter.forEach((value) => svg.appendChild(createSvgElement("circle", { cx: mapX(value), cy: 222, r: 5.5, class: "ot-particle is-green" })));
    preset.right.forEach((value) => svg.appendChild(createSvgElement("circle", { cx: mapX(value), cy: 250, r: 5, class: "ot-particle is-yellow" })));

    appendText(svg, { x: 16, y: 236, class: "tda-svg-small-label" }, "mu_0");
    appendText(svg, { x: 16, y: 222, class: "tda-svg-small-label" }, "bar(mu)");
    appendText(svg, { x: 16, y: 250, class: "tda-svg-small-label" }, "mu_1");
    canvas.appendChild(svg);

    if (label) {
      label.textContent = state.lambda.toFixed(2);
    }

    if (summary) {
      summary.innerHTML =
        `<strong>Two-measure barycenter</strong>: minimize (1 - lambda) W2^2(mu, mu0) + lambda W2^2(mu, mu1) with lambda = ${state.lambda.toFixed(2)}.<br>` +
        "In one dimension, averaging quantiles gives the barycenter exactly. For more than two measures or in higher dimensions, computing barycenters becomes a genuine OT problem of its own.";
    }
  }

  slider?.addEventListener("input", (event) => {
    state.lambda = Number(event.target.value) / 100;
    render();
  });

  presetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.preset = button.dataset.barycenterPreset;
      presetButtons.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  presetButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.barycenterPreset === state.preset));
  render();
}

export function enhanceOtNotesPage(root = document) {
  const page = enhanceMathNotebookPage(root, {
    pageSelector: "[data-tda-page]",
    articleSelector: ".post-single",
    bodyClass: "ot-notes-page",
    tocOptions: { jumpLabel: "Jump to section" }
  });

  if (!page) {
    return;
  }

  initDiscreteCouplingWidget(page.querySelector('[data-widget="discrete-coupling"]'));
  initOneDTransportWidget(page.querySelector('[data-widget="one-d-transport"]'));
  initGeodesicWidget(page.querySelector('[data-widget="geodesic-flow"]'));
  initSinkhornWidget(page.querySelector('[data-widget="sinkhorn-demo"]'));
  initBarycenterWidget(page.querySelector('[data-widget="barycenter-demo"]'));
}
