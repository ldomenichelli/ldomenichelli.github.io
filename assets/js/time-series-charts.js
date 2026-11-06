import { buildSvg, clearChildren, createSvgElement } from "./math-notebook.js";

const element = createSvgElement;

function text(svg, x, y, value, className, attributes = {}) {
  const node = element("text", { x, y, class: className, ...attributes });
  node.textContent = value;
  svg.append(node);
  return node;
}

function line(svg, x1, y1, x2, y2, className) {
  svg.append(element("line", { x1, y1, x2, y2, class: className }));
}

function tickStep(min, max, count) {
  const raw = Math.max((max - min) / count, 1e-12);
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

function ticks(min, max, count, integer = false) {
  const step = Math.max(tickStep(min, max, count), integer ? 1 : 0);
  const result = [];
  for (let value = Math.ceil((min - step * 1e-6) / step) * step; value <= max + step * 1e-6; value += step) {
    result.push(Number(value.toPrecision(10)));
  }
  return result;
}

function number(value) {
  if (Math.abs(value) < 1e-10) return "0";
  if (Math.abs(value) >= 10000 || Math.abs(value) < 0.001) return value.toExponential(1);
  return String(Number(value.toFixed(3)));
}

function path(points) {
  return points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

export function prepareCharts(canvas) {
  clearChildren(canvas);
  canvas.classList.add("ts-chart-grid");
  canvas.classList.toggle("is-compact", canvas.getBoundingClientRect().width < 640);
}

export function makeChart(canvas, title, options = {}) {
  const { xDomain = [1, 48], yDomain = [0, 1], wide = false, height = 240,
    xLabel = "Time step", xTicks, yTicks, integerX = true, left = 52,
    description = title, reference = null } = options;
  const available = Math.max(canvas.getBoundingClientRect().width, 220);
  const columns = !wide && !canvas.classList.contains("is-compact") ? 2 : 1;
  const gap = parseFloat(getComputedStyle(canvas).columnGap) || 16;
  // The viewBox tracks the panel's actual width, so labels keep their font size.
  const width = Math.max(220, Math.floor((available - gap * (columns - 1)) / columns) - 2);
  const panel = document.createElement("div");
  panel.className = `ts-chart-panel${wide ? " is-wide" : ""}`;
  const heading = document.createElement("h4");
  heading.className = "ts-chart-title";
  heading.textContent = title;
  const svg = buildSvg(width, height, "tda-widget-svg ts-plot");
  svg.removeAttribute("aria-hidden");
  svg.setAttribute("aria-label", description);
  const accessibleTitle = element("title");
  accessibleTitle.textContent = description;
  svg.append(accessibleTitle);
  panel.append(heading, svg);
  canvas.append(panel);

  const bounds = { left, top: 16, right: width - 18, bottom: height - 48 };
  const [xMin, xMax] = xDomain;
  const [yMin, yMax] = yDomain;
  const sx = value => bounds.left + (value - xMin) / Math.max(xMax - xMin, 1e-12) * (bounds.right - bounds.left);
  const sy = value => bounds.bottom - (value - yMin) / Math.max(yMax - yMin, 1e-12) * (bounds.bottom - bounds.top);
  const layer = element("g", { class: "ts-plot-data" });
  const background = element("g");
  svg.append(background);
  const verticalTicks = yTicks || ticks(yMin, yMax, 4);
  verticalTicks.forEach(value => {
    line(svg, bounds.left, sy(value), bounds.right, sy(value), "ts-grid-line");
    text(svg, bounds.left - 9, sy(value), number(value), "ts-svg-number", { "text-anchor": "end", "dominant-baseline": "middle" });
  });
  if (reference !== null && reference >= yMin && reference <= yMax) {
    line(svg, bounds.left, sy(reference), bounds.right, sy(reference), "ts-zero-line");
  }
  line(svg, bounds.left, bounds.bottom, bounds.right, bounds.bottom, "ts-axis");
  let horizontalTicks = xTicks;
  if (!horizontalTicks) {
    // Always mark the sample's endpoints; retain only interior ticks with room
    // for a label on either side, rather than leaving a short axis with one tick.
    horizontalTicks = [xMin];
    ticks(xMin, xMax, width < 360 ? 4 : 7, integerX).forEach(value => {
      if (sx(value) - sx(horizontalTicks.at(-1)) >= 38 && sx(xMax) - sx(value) >= 38) {
        horizontalTicks.push(value);
      }
    });
    if (xMax > xMin) horizontalTicks.push(xMax);
  }
  horizontalTicks.forEach(value => {
    line(svg, sx(value), bounds.bottom, sx(value), bounds.bottom + 5, "ts-axis");
    text(svg, sx(value), bounds.bottom + 20, number(value), "ts-svg-number", { "text-anchor": "middle" });
  });
  text(svg, (bounds.left + bounds.right) / 2, height - 7, xLabel, "ts-axis-label", { "text-anchor": "middle" });
  svg.append(layer);
  return { svg, panel, layer, background, bounds, sx, sy, width, height, xDomain, yDomain };
}

export function chartLine(plot, values, className, start = 1, step = 1) {
  const points = values.map((value, index) => [plot.sx(start + index * step), plot.sy(value)]);
  if (!points.length) return;
  plot.layer.append(element("path", { d: path(points), class: className }));
}

export function chartPoints(plot, values, className = "ts-observed-point", start = 1) {
  values.forEach((value, index) => {
    plot.layer.append(element("circle", { cx: plot.sx(start + index), cy: plot.sy(value), r: 3, class: className }));
  });
}

export function chartBand(plot, lower, upper, start = 1) {
  const points = lower.map((value, index) => [plot.sx(start + index), plot.sy(value)]);
  points.push(...upper.map((value, index) => [plot.sx(start + index), plot.sy(value)]).reverse());
  plot.layer.append(element("path", { d: `${path(points)} Z`, class: "ts-range-fill" }));
}

export function chartCorrelations(canvas, title, values, sampleSize, className, wide = false) {
  const plot = makeChart(canvas, title, {
    xDomain: [0.5, values.length + 0.5], yDomain: [-1, 1], yTicks: [-1, -0.5, 0, 0.5, 1],
    xTicks: [1, 3, 6, 9, 12].filter(value => value <= values.length), xLabel: "Lag", reference: 0, wide,
    description: `${title}. Correlation by lag, on a common scale from minus one to one. Shading is a white-noise reference band.`
  });
  const bound = 1.96 / Math.sqrt(sampleSize);
  const { left, right } = plot.bounds;
  plot.background.append(element("rect", {
    x: left, y: plot.sy(bound), width: right - left, height: plot.sy(-bound) - plot.sy(bound), class: "ts-confidence-fill"
  }));
  [bound, -bound].forEach(value => line(plot.background, left, plot.sy(value), right, plot.sy(value), "ts-confidence-line"));
  values.forEach((value, index) => {
    line(plot.layer, plot.sx(index + 1), plot.sy(0), plot.sx(index + 1), plot.sy(value), `ts-acf-stem ${className}`);
    plot.layer.append(element("circle", { cx: plot.sx(index + 1), cy: plot.sy(value), r: 2.8, class: `ts-point ${className}` }));
  });
  return plot;
}

export function chartLegend(canvas, entries, note = "") {
  const legend = document.createElement("div");
  legend.className = "ts-chart-legend";
  entries.forEach(([label, className, kind = "line"]) => {
    const item = document.createElement("span");
    item.className = "ts-legend-item";
    const swatch = element("svg", { viewBox: "0 0 28 14", width: 28, height: 14, class: "ts-legend-swatch", "aria-hidden": "true" });
    if (kind === "fill") swatch.append(element("rect", { x: 1, y: 2, width: 26, height: 10, rx: 2, class: className }));
    else if (kind === "point") swatch.append(element("circle", { cx: 14, cy: 7, r: 3, class: className }));
    else line(swatch, 2, 7, 26, 7, className);
    item.append(swatch, document.createTextNode(label));
    legend.append(item);
  });
  canvas.append(legend);
  if (note) {
    const caption = document.createElement("p");
    caption.className = "ts-chart-note";
    caption.textContent = note;
    canvas.append(caption);
  }
}

export function observeChartSize(canvas, render) {
  let previousWidth = Math.round(canvas.getBoundingClientRect().width);
  let pendingFrame = 0;
  if (!("ResizeObserver" in window)) {
    window.addEventListener("resize", render);
    return;
  }
  const observer = new ResizeObserver(entries => {
    const width = Math.round(entries[0].contentRect.width);
    if (width === previousWidth || width < 1) return;
    previousWidth = width;
    // Rebuilding panels also changes height. Defer that mutation until after
    // ResizeObserver delivery so it cannot trigger an observation loop.
    cancelAnimationFrame(pendingFrame);
    pendingFrame = requestAnimationFrame(render);
  });
  observer.observe(canvas);
}
