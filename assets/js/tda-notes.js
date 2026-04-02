const SVG_NS = "http://www.w3.org/2000/svg";
const EPSILON = 1e-6;

const COMPLEX_POINTS = [
  { x: 62, y: 186, label: "A" },
  { x: 176, y: 54, label: "B" },
  { x: 286, y: 186, label: "C" },
  { x: 350, y: 118, label: "D" }
];

const NERVE_POINTS = [
  { x: 78, y: 188, label: "x1" },
  { x: 178, y: 72, label: "x2" },
  { x: 282, y: 188, label: "x3" },
  { x: 360, y: 116, label: "x4" }
];

const PERSISTENCE_POINTS = [
  { x: 52, y: 186, label: "a" },
  { x: 136, y: 72, label: "b" },
  { x: 222, y: 186, label: "c" },
  { x: 308, y: 186, label: "d" }
];

const PERSISTENCE_STEPS = [
  { label: "t0", edges: [], faces: [] },
  { label: "t1", edges: [[0, 1]], faces: [] },
  { label: "t2", edges: [[0, 1], [1, 2]], faces: [] },
  { label: "t3", edges: [[0, 1], [1, 2], [2, 3]], faces: [] },
  { label: "t4", edges: [[0, 1], [1, 2], [2, 3], [0, 2]], faces: [] },
  { label: "t5", edges: [[0, 1], [1, 2], [2, 3], [0, 2]], faces: [[0, 1, 2]] }
];

const H0_INTERVALS = [
  { label: "[a]", birth: 0, death: Infinity, accent: "green" },
  { label: "[b]", birth: 0, death: 1, accent: "yellow" },
  { label: "[c]", birth: 0, death: 2, accent: "blue" },
  { label: "[d]", birth: 0, death: 3, accent: "pink" }
];

const H1_INTERVALS = [{ label: "[gamma]", birth: 4, death: 5, accent: "orange" }];

const DIAGRAM_ONE = [
  { id: "A", birth: 0.18, death: 0.66 },
  { id: "B", birth: 0.32, death: 0.83 },
  { id: "C", birth: 0.6, death: 0.92 }
];

const DIAGRAM_TWO = [
  { id: "D", birth: 0.22, death: 0.57 },
  { id: "E", birth: 0.38, death: 0.73 }
];

const MATCHINGS = [
  {
    id: "bottleneck",
    label: "Near-optimal matching",
    pairs: [
      { from: "A", to: "D" },
      { from: "B", to: "E" },
      { from: "C", to: "diag" }
    ]
  },
  {
    id: "loose",
    label: "Looser matching",
    pairs: [
      { from: "A", to: "E" },
      { from: "B", to: "diag" },
      { from: "C", to: "D" }
    ]
  }
];

const GENEO_BASE_VALUES = [2.0, 3.5, 1.0, 4.0, 2.5, 1.5];

function createSvgElement(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attrs).forEach(([key, value]) => {
    node.setAttribute(key, String(value));
  });
  return node;
}

function clearChildren(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function simplexKey(simplex) {
  return [...simplex].sort((left, right) => left - right).join("-");
}

function edgeExists(simplexSet, a, b) {
  return simplexSet.has(simplexKey([a, b]));
}

function faceExists(simplexSet, a, b, c) {
  return simplexSet.has(simplexKey([a, b, c]));
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
    const head = values[index];
    const tails = combinations(values.slice(index + 1), size - 1);
    tails.forEach((tail) => items.push([head, ...tail]));
  }
  return items;
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function circleIntersections(a, b, radius) {
  const d = distance(a, b);
  if (d > 2 * radius + EPSILON || d < EPSILON) {
    return [];
  }

  const half = d / 2;
  const hSquared = radius * radius - half * half;
  if (hSquared < -EPSILON) {
    return [];
  }

  const h = Math.sqrt(Math.max(0, hSquared));
  const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const dx = (b.x - a.x) / d;
  const dy = (b.y - a.y) / d;
  const perp = { x: -dy, y: dx };

  return [
    { x: midpoint.x + perp.x * h, y: midpoint.y + perp.y * h },
    { x: midpoint.x - perp.x * h, y: midpoint.y - perp.y * h }
  ];
}

function disksHaveCommonIntersection(points, simplex, radius) {
  if (simplex.length <= 1) {
    return true;
  }

  const simplexPoints = simplex.map((index) => points[index]);
  const candidates = simplexPoints.map((point) => ({ x: point.x, y: point.y }));

  combinations(simplexPoints, 2).forEach(([left, right]) => {
    circleIntersections(left, right, radius).forEach((candidate) => candidates.push(candidate));
  });

  return candidates.some((candidate) =>
    simplexPoints.every((point) => distance(candidate, point) <= radius + EPSILON)
  );
}

export function computeVietorisRipsComplex(points, radius) {
  const vertices = points.map((_, index) => [index]);
  const edges = [];
  const faces = [];
  const indices = points.map((_, index) => index);

  combinations(indices, 2).forEach(([left, right]) => {
    if (distance(points[left], points[right]) <= 2 * radius + EPSILON) {
      edges.push([left, right]);
    }
  });

  const edgeSet = new Set(edges.map((edge) => simplexKey(edge)));
  combinations(indices, 3).forEach(([a, b, c]) => {
    if (edgeExists(edgeSet, a, b) && edgeExists(edgeSet, a, c) && edgeExists(edgeSet, b, c)) {
      faces.push([a, b, c]);
    }
  });

  return { vertices, edges, faces };
}

export function computeCechComplex(points, radius) {
  const vertices = points.map((_, index) => [index]);
  const edges = [];
  const faces = [];
  const indices = points.map((_, index) => index);

  combinations(indices, 2).forEach((simplex) => {
    if (disksHaveCommonIntersection(points, simplex, radius)) {
      edges.push(simplex);
    }
  });

  combinations(indices, 3).forEach((simplex) => {
    if (disksHaveCommonIntersection(points, simplex, radius)) {
      faces.push(simplex);
    }
  });

  return { vertices, edges, faces };
}

export function circularShift(values, offset) {
  const length = values.length;
  const shift = ((offset % length) + length) % length;
  return values.map((_, index) => values[(index - shift + length) % length]);
}

export function applyCircularAverage(values, neighborShift = 1) {
  const length = values.length;
  return values.map((value, index) => {
    const neighbor = values[(index + neighborShift) % length];
    return Number(((value + neighbor) / 2).toFixed(6));
  });
}

export function supNormDistance(left, right) {
  return left.reduce((maxDistance, value, index) => {
    return Math.max(maxDistance, Math.abs(value - right[index]));
  }, 0);
}

function accentClass(name) {
  return `is-${name}`;
}

function drawPoint(svg, point, className = "") {
  svg.appendChild(
    createSvgElement("circle", {
      cx: point.x,
      cy: point.y,
      r: 7,
      class: `tda-svg-point ${className}`.trim()
    })
  );

  const label = createSvgElement("text", {
    x: point.x + 11,
    y: point.y - 9,
    class: "tda-svg-label"
  });
  label.textContent = point.label;
  svg.appendChild(label);
}

function drawEdge(svg, points, edge, className = "") {
  const [left, right] = edge.map((index) => points[index]);
  svg.appendChild(
    createSvgElement("line", {
      x1: left.x,
      y1: left.y,
      x2: right.x,
      y2: right.y,
      class: `tda-svg-edge ${className}`.trim()
    })
  );
}

function drawFace(svg, points, face, className = "") {
  const path = face
    .map((index, step) => `${step === 0 ? "M" : "L"} ${points[index].x} ${points[index].y}`)
    .join(" ");
  svg.appendChild(
    createSvgElement("path", {
      d: `${path} Z`,
      class: `tda-svg-face ${className}`.trim()
    })
  );
}

function buildSvg(width, height, className = "") {
  return createSvgElement("svg", {
    viewBox: `0 0 ${width} ${height}`,
    class: className,
    role: "img",
    "aria-hidden": "true"
  });
}

function renderComplex(svg, points, complex, options = {}) {
  const {
    faceClass = "",
    edgeClass = "",
    pointClass = "",
    circles = 0,
    drawPoints = true,
    pointIndices = points.map((_, index) => index)
  } = options;

  if (circles > 0) {
    points.forEach((point) => {
      svg.appendChild(
        createSvgElement("circle", {
          cx: point.x,
          cy: point.y,
          r: circles,
          class: "tda-svg-radius"
        })
      );
    });
  }

  complex.faces.forEach((face) => drawFace(svg, points, face, faceClass));
  complex.edges.forEach((edge) => drawEdge(svg, points, edge, edgeClass));
  if (drawPoints) {
    pointIndices.forEach((index) => drawPoint(svg, points[index], pointClass));
  }
}

function formatRadius(radius) {
  return (radius / 100).toFixed(2);
}

function pointById(collection, id) {
  return collection.find((point) => point.id === id);
}

function diagonalProjection(point) {
  const midpoint = (point.birth + point.death) / 2;
  return { birth: midpoint, death: midpoint };
}

function matchingCost(leftPoint, rightPoint) {
  if (rightPoint === "diag") {
    return (leftPoint.death - leftPoint.birth) / 2;
  }
  return Math.max(Math.abs(leftPoint.birth - rightPoint.birth), Math.abs(leftPoint.death - rightPoint.death));
}

function matchingSummary(matching) {
  const costs = matching.pairs.map((pair) => {
    const leftPoint = pointById(DIAGRAM_ONE, pair.from);
    const rightPoint = pair.to === "diag" ? "diag" : pointById(DIAGRAM_TWO, pair.to);
    return matchingCost(leftPoint, rightPoint);
  });

  const bottleneck = Math.max(...costs);
  const wasserstein = costs.reduce((sum, cost) => sum + cost, 0);
  return { bottleneck, wasserstein };
}

function buildProgressBar() {
  let progress = document.querySelector(".tda-progress");
  if (!progress) {
    progress = document.createElement("div");
    progress.className = "tda-progress";
    progress.innerHTML = '<span class="tda-progress-bar"></span>';
    document.body.prepend(progress);
  }
  return progress.querySelector(".tda-progress-bar");
}

function bindProgress(article, bar) {
  let ticking = false;

  function update() {
    ticking = false;
    const rect = article.getBoundingClientRect();
    const viewport = window.innerHeight;
    const total = Math.max(article.offsetHeight - viewport * 0.55, 1);
    const passed = Math.min(Math.max(-rect.top + viewport * 0.18, 0), total);
    bar.style.transform = `scaleX(${(passed / total).toFixed(4)})`;
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(update);
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  onScroll();
}

function buildNotebookToc(pageRoot) {
  const tocRoot = pageRoot.querySelector("[data-tda-toc]");
  const jumpRoot = pageRoot.querySelector("[data-tda-jump]");
  const sections = Array.from(pageRoot.querySelectorAll("[data-tda-section]"));

  if (!tocRoot || !sections.length) {
    return;
  }

  const fragment = document.createDocumentFragment();
  const jumpSelect = jumpRoot ? document.createElement("select") : null;

  if (jumpSelect) {
    jumpSelect.className = "tda-jump-select";
    jumpSelect.setAttribute("aria-label", "Jump to lecture section");
  }

  sections.forEach((section, index) => {
    const id = section.id;
    const label = section.getAttribute("data-tda-label") || section.querySelector("h2")?.textContent || `Section ${index + 1}`;
    const link = document.createElement("a");
    link.className = "tda-toc-link";
    link.href = `#${id}`;
    link.dataset.target = id;
    link.textContent = label;
    fragment.appendChild(link);

    if (jumpSelect) {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = label;
      jumpSelect.appendChild(option);
    }
  });

  tocRoot.appendChild(fragment);

  if (jumpRoot && jumpSelect) {
    jumpRoot.appendChild(jumpSelect);
    jumpSelect.addEventListener("change", (event) => {
      const target = pageRoot.querySelector(`#${event.target.value}`);
      if (target) {
        target.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      }
    });
  }

  const links = Array.from(tocRoot.querySelectorAll("[data-target]"));

  function setActive(id) {
    links.forEach((link) => link.classList.toggle("is-active", link.dataset.target === id));
    if (jumpSelect) {
      jumpSelect.value = id;
    }
  }

  if (!("IntersectionObserver" in window)) {
    setActive(sections[0].id);
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top);

      if (visible[0]) {
        setActive(visible[0].target.id);
      }
    },
    {
      rootMargin: "-18% 0px -62% 0px",
      threshold: [0.05, 0.2, 0.4]
    }
  );

  sections.forEach((section) => observer.observe(section));
  setActive(sections[0].id);
}

function bindProofControls(pageRoot) {
  const proofs = Array.from(pageRoot.querySelectorAll(".tda-proof"));
  if (!proofs.length) {
    return;
  }

  const expand = pageRoot.querySelector('[data-proof-action="expand"]');
  const collapse = pageRoot.querySelector('[data-proof-action="collapse"]');

  if (expand) {
    expand.addEventListener("click", () => proofs.forEach((proof) => (proof.open = true)));
  }

  if (collapse) {
    collapse.addEventListener("click", () => proofs.forEach((proof) => (proof.open = false)));
  }
}

function initSimplicialBuilder(root) {
  if (!root) {
    return;
  }

  const canvas = root.querySelector("[data-canvas]");
  const caption = root.querySelector("[data-caption]");
  const modeButtons = Array.from(root.querySelectorAll("[data-mode]"));
  const state = { mode: "simplex" };

  const descriptions = {
    simplex: "A 2-simplex is the convex hull of three affinely independent points. Here sigma = <A,B,C> is filled in.",
    faces: "Every face of sigma is obtained by removing vertices: the three edges and the three 0-simplices are all visible.",
    skeleton: "The 1-skeleton keeps only simplices of dimension <= 1. The extra edge C-D stays, but the filled triangle disappears.",
    subcomplex: "A subcomplex keeps chosen simplices together with all of their faces. Here L contains AC, CD, and the vertices A, C, D."
  };

  function render() {
    if (!canvas) {
      return;
    }

    clearChildren(canvas);
    const svg = buildSvg(400, 240, "tda-widget-svg");

    const simplex = { edges: [[0, 1], [1, 2], [0, 2]], faces: [[0, 1, 2]] };
    const skeleton = { edges: [[0, 1], [1, 2], [0, 2], [2, 3]], faces: [] };
    const subcomplex = { edges: [[0, 2], [2, 3]], faces: [] };

    if (state.mode === "simplex") {
      renderComplex(svg, COMPLEX_POINTS, simplex, {
        faceClass: "is-yellow",
        edgeClass: "is-strong",
        pointIndices: [0, 1, 2]
      });
      drawEdge(svg, COMPLEX_POINTS, [2, 3], "is-muted");
      drawPoint(svg, COMPLEX_POINTS[3], "is-muted");
    } else if (state.mode === "faces") {
      renderComplex(svg, COMPLEX_POINTS, simplex, {
        edgeClass: "is-yellow",
        pointIndices: [0, 1, 2]
      });
      drawEdge(svg, COMPLEX_POINTS, [2, 3], "is-muted");
      drawPoint(svg, COMPLEX_POINTS[3], "is-muted");
    } else if (state.mode === "skeleton") {
      renderComplex(svg, COMPLEX_POINTS, skeleton, { edgeClass: "is-blue", pointIndices: [0, 1, 2, 3] });
    } else {
      renderComplex(svg, COMPLEX_POINTS, subcomplex, { edgeClass: "is-green", pointIndices: [0, 2, 3] });
      drawPoint(svg, COMPLEX_POINTS[1], "is-muted");
    }

    canvas.appendChild(svg);
    if (caption) {
      caption.textContent = descriptions[state.mode];
    }
  }

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      modeButtons.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  render();
}

function initNerveExplorer(root) {
  if (!root) {
    return;
  }

  const canvas = root.querySelector("[data-canvas]");
  const radiusInput = root.querySelector("[data-radius]");
  const radiusValue = root.querySelector("[data-radius-value]");
  const summary = root.querySelector("[data-summary]");
  const viewButtons = Array.from(root.querySelectorAll("[data-view]"));
  const state = {
    radius: Number(radiusInput?.value || 72),
    view: "both"
  };

  function render() {
    if (!canvas) {
      return;
    }

    clearChildren(canvas);
    const svg = buildSvg(430, 260, "tda-widget-svg");
    const cech = computeCechComplex(NERVE_POINTS, state.radius);
    const vr = computeVietorisRipsComplex(NERVE_POINTS, state.radius);

    if (state.view === "cech" || state.view === "both") {
      renderComplex(svg, NERVE_POINTS, cech, {
        faceClass: "is-yellow",
        edgeClass: "is-yellow",
        circles: state.radius,
        drawPoints: false
      });
    }

    if (state.view === "vr" || state.view === "both") {
      renderComplex(svg, NERVE_POINTS, vr, {
        faceClass: state.view === "both" ? "is-blue is-offset" : "is-blue",
        edgeClass: state.view === "both" ? "is-blue is-dashed" : "is-blue",
        drawPoints: false
      });
    }

    NERVE_POINTS.forEach((point) => drawPoint(svg, point));

    canvas.appendChild(svg);

    if (radiusValue) {
      radiusValue.textContent = formatRadius(state.radius);
    }

    if (summary) {
      summary.innerHTML =
        `<strong>Cech</strong>: ${cech.edges.length} edges, ${cech.faces.length} faces.<br>` +
        `<strong>Vietoris-Rips</strong>: ${vr.edges.length} edges, ${vr.faces.length} faces.<br>` +
        "In this toy cloud the Cech complex stays inside the Vietoris-Rips complex, exactly as in the notes.";
    }
  }

  radiusInput?.addEventListener("input", (event) => {
    state.radius = Number(event.target.value);
    render();
  });

  viewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      viewButtons.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  render();
}

function initHomologyExplorer(root) {
  if (!root) {
    return;
  }

  const canvas = root.querySelector("[data-canvas]");
  const summary = root.querySelector("[data-summary]");
  const sceneButtons = Array.from(root.querySelectorAll("[data-scene]"));
  const state = { scene: "cycle" };

  const scenes = {
    disconnected: {
      title: "Two connected components",
      text: "At this stage beta_0 = 2 and beta_1 = 0: there are two components and no loop.",
      draw(svg) {
        const points = [
          { x: 84, y: 114, label: "A" },
          { x: 156, y: 114, label: "B" },
          { x: 248, y: 172, label: "C" },
          { x: 320, y: 172, label: "D" }
        ];
        drawEdge(svg, points, [0, 1], "is-green");
        drawEdge(svg, points, [2, 3], "is-green");
        points.forEach((point) => drawPoint(svg, point));
      }
    },
    cycle: {
      title: "A 1-cycle that is not a boundary",
      text: "The triangle boundary closes up, so it is a cycle. Because no 2-simplex fills it yet, the class survives in H_1.",
      draw(svg) {
        const trianglePoints = COMPLEX_POINTS.slice(0, 3);
        renderComplex(
          svg,
          trianglePoints,
          { edges: [[0, 1], [1, 2], [0, 2]], faces: [] },
          { edgeClass: "is-orange", pointIndices: [0, 1, 2] }
        );
      }
    },
    filled: {
      title: "The same loop becomes a boundary",
      text: "Once the 2-simplex <A,B,C> is present, the boundary of that simplex kills the 1-cycle. Now beta_1 = 0.",
      draw(svg) {
        const trianglePoints = COMPLEX_POINTS.slice(0, 3);
        renderComplex(
          svg,
          trianglePoints,
          { edges: [[0, 1], [1, 2], [0, 2]], faces: [[0, 1, 2]] },
          { faceClass: "is-yellow", edgeClass: "is-orange", pointIndices: [0, 1, 2] }
        );
      }
    },
    cavity: {
      title: "A cavity intuition",
      text: "The notes also point upward: a 2-hole is a cavity bounded by 2-dimensional faces, just as a 1-hole is bounded by edges.",
      draw(svg) {
        const tetra = [
          { x: 116, y: 170, label: "v0" },
          { x: 208, y: 50, label: "v1" },
          { x: 300, y: 170, label: "v2" },
          { x: 208, y: 132, label: "v3" }
        ];
        drawFace(svg, tetra, [0, 1, 3], "is-blue");
        drawFace(svg, tetra, [1, 2, 3], "is-blue");
        drawFace(svg, tetra, [0, 2, 3], "is-blue");
        [
          [0, 1],
          [1, 2],
          [0, 2],
          [0, 3],
          [1, 3],
          [2, 3]
        ].forEach((edge) => drawEdge(svg, tetra, edge, "is-blue"));
        tetra.forEach((point) => drawPoint(svg, point));
      }
    }
  };

  function render() {
    clearChildren(canvas);
    const svg = buildSvg(400, 236, "tda-widget-svg");
    scenes[state.scene].draw(svg);
    canvas.appendChild(svg);
    if (summary) {
      summary.innerHTML = `<strong>${scenes[state.scene].title}</strong><br>${scenes[state.scene].text}`;
    }
  }

  sceneButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.scene = button.dataset.scene;
      sceneButtons.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  render();
}

function drawBarcode(svg, intervals, yOffset, step) {
  const yBottom = yOffset + Math.max(0, intervals.length - 1) * 32 + 10;

  intervals.forEach((interval, index) => {
    const y = yOffset + index * 32;
    const x1 = 46 + interval.birth * 44;
    const x2 = interval.death === Infinity ? 46 + 6 * 44 : 46 + interval.death * 44;
    svg.appendChild(
      createSvgElement("line", {
        x1,
        y1: y,
        x2,
        y2: y,
        class: `tda-barcode-line ${accentClass(interval.accent)}`
      })
    );
    const label = createSvgElement("text", { x: 10, y: y + 5, class: "tda-svg-small-label" });
    label.textContent = interval.label;
    svg.appendChild(label);
  });

  const marker = 46 + step * 44;
  svg.appendChild(
    createSvgElement("line", {
      x1: marker,
      y1: yOffset - 18,
      x2: marker,
      y2: yBottom,
      class: "tda-stage-marker"
    })
  );
}

function drawPersistenceDiagram(svg, intervals, xOffset, step) {
  svg.appendChild(
    createSvgElement("line", { x1: xOffset + 18, y1: 138, x2: xOffset + 154, y2: 2, class: "tda-diagonal-line" })
  );
  svg.appendChild(
    createSvgElement("line", { x1: xOffset + 18, y1: 138, x2: xOffset + 18, y2: 2, class: "tda-axis-line" })
  );
  svg.appendChild(
    createSvgElement("line", { x1: xOffset + 18, y1: 138, x2: xOffset + 154, y2: 138, class: "tda-axis-line" })
  );

  intervals.forEach((interval) => {
    const birth = xOffset + 18 + interval.birth * 22;
    const death = interval.death === Infinity ? 6 * 22 : interval.death * 22;
    svg.appendChild(
      createSvgElement("circle", {
        cx: birth,
        cy: 138 - death,
        r: 5,
        class: `tda-diagram-point ${accentClass(interval.accent)} ${step >= interval.birth ? "is-active" : ""}`.trim()
      })
    );
  });
}

function initPersistenceExplorer(root) {
  if (!root) {
    return;
  }

  const canvas = root.querySelector("[data-canvas]");
  const slider = root.querySelector("[data-stage]");
  const stageLabel = root.querySelector("[data-stage-label]");
  const summary = root.querySelector("[data-summary]");
  const state = { step: Number(slider?.value || 0) };

  function render() {
    if (!canvas) {
      return;
    }

    clearChildren(canvas);
    const svg = buildSvg(760, 276, "tda-widget-svg");
    const step = PERSISTENCE_STEPS[state.step];
    const complex = { edges: step.edges, faces: step.faces };

    renderComplex(svg, PERSISTENCE_POINTS, complex, { faceClass: "is-yellow", edgeClass: "is-blue" });
    drawBarcode(svg, H0_INTERVALS, 58, state.step);
    drawBarcode(svg, H1_INTERVALS, 188, state.step);
    drawPersistenceDiagram(svg, [...H0_INTERVALS.filter((interval) => interval.death !== Infinity), ...H1_INTERVALS], 486, state.step);

    const leftLabel = createSvgElement("text", { x: 18, y: 24, class: "tda-svg-title" });
    leftLabel.textContent = `Filtration state ${step.label}`;
    svg.appendChild(leftLabel);

    const h0Label = createSvgElement("text", { x: 46, y: 30, class: "tda-svg-small-label" });
    h0Label.textContent = "H0 barcode";
    svg.appendChild(h0Label);

    const h1Label = createSvgElement("text", { x: 46, y: 160, class: "tda-svg-small-label" });
    h1Label.textContent = "H1 barcode";
    svg.appendChild(h1Label);

    const diagramLabel = createSvgElement("text", { x: 500, y: 24, class: "tda-svg-small-label" });
    diagramLabel.textContent = "Persistence diagram";
    svg.appendChild(diagramLabel);

    canvas.appendChild(svg);

    if (stageLabel) {
      stageLabel.textContent = step.label;
    }

    if (summary) {
      const summaries = {
        0: "All four vertices are born: we see four connected components.",
        1: "The first edge identifies two components, so one H0 class dies.",
        2: "A path on a-b-c leaves one isolated vertex d and one longer component.",
        3: "The last bridge makes the whole complex connected, so only one H0 class remains.",
        4: "Adding the edge a-c closes a loop: a 1-cycle is born.",
        5: "Filling the triangle <a,b,c> turns that loop into a boundary, so the H1 class dies."
      };
      summary.innerHTML =
        `<strong>${step.label}</strong><br>${summaries[state.step]}<br>` +
        "This mirrors the notes: connected components merge first, then a cycle appears, and finally a 2-simplex kills it.";
    }
  }

  slider?.addEventListener("input", (event) => {
    state.step = Number(event.target.value);
    render();
  });

  render();
}

function initDiagramDistanceWidget(root) {
  if (!root) {
    return;
  }

  const canvas = root.querySelector("[data-canvas]");
  const summary = root.querySelector("[data-summary]");
  const buttons = Array.from(root.querySelectorAll("[data-matching]"));
  const state = { matching: MATCHINGS[0] };

  function project(point, xOffset) {
    return {
      x: xOffset + 22 + point.birth * 170,
      y: 210 - point.death * 170
    };
  }

  function renderAxis(svg, xOffset, title) {
    svg.appendChild(createSvgElement("line", { x1: xOffset + 16, y1: 210, x2: xOffset + 16, y2: 18, class: "tda-axis-line" }));
    svg.appendChild(createSvgElement("line", { x1: xOffset + 16, y1: 210, x2: xOffset + 204, y2: 210, class: "tda-axis-line" }));
    svg.appendChild(createSvgElement("line", { x1: xOffset + 16, y1: 210, x2: xOffset + 204, y2: 22, class: "tda-diagonal-line" }));
    const label = createSvgElement("text", { x: xOffset + 16, y: 12, class: "tda-svg-small-label" });
    label.textContent = title;
    svg.appendChild(label);
  }

  function render() {
    clearChildren(canvas);
    const svg = buildSvg(520, 236, "tda-widget-svg");
    renderAxis(svg, 0, "Dgm(phi)");
    renderAxis(svg, 272, "Dgm(psi)");

    DIAGRAM_ONE.forEach((point) => {
      const projected = project(point, 0);
      svg.appendChild(createSvgElement("circle", { cx: projected.x, cy: projected.y, r: 6, class: "tda-diagram-point is-blue" }));
      const label = createSvgElement("text", { x: projected.x + 10, y: projected.y - 8, class: "tda-svg-small-label" });
      label.textContent = point.id;
      svg.appendChild(label);
    });

    DIAGRAM_TWO.forEach((point) => {
      const projected = project(point, 272);
      svg.appendChild(createSvgElement("circle", { cx: projected.x, cy: projected.y, r: 6, class: "tda-diagram-point is-yellow" }));
      const label = createSvgElement("text", { x: projected.x + 10, y: projected.y - 8, class: "tda-svg-small-label" });
      label.textContent = point.id;
      svg.appendChild(label);
    });

    state.matching.pairs.forEach((pair) => {
      const leftPoint = pointById(DIAGRAM_ONE, pair.from);
      const leftProjected = project(leftPoint, 0);
      const target = pair.to === "diag" ? diagonalProjection(leftPoint) : pointById(DIAGRAM_TWO, pair.to);
      const rightProjected = pair.to === "diag" ? project(target, 272) : project(target, 272);
      svg.appendChild(
        createSvgElement("line", {
          x1: leftProjected.x,
          y1: leftProjected.y,
          x2: rightProjected.x,
          y2: rightProjected.y,
          class: "tda-match-line"
        })
      );
    });

    canvas.appendChild(svg);

    const costs = matchingSummary(state.matching);
    if (summary) {
      summary.innerHTML =
        `<strong>${state.matching.label}</strong><br>` +
        `Bottleneck cost: ${costs.bottleneck.toFixed(2)}<br>` +
        `Wasserstein-1 cost: ${costs.wasserstein.toFixed(2)}<br>` +
        "The diagonal acts as the cost of deleting a short-lived class, exactly as in the lecture notes.";
    }
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      state.matching = MATCHINGS.find((matching) => matching.id === button.dataset.matching) || MATCHINGS[0];
      buttons.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  render();
}

function polarPoint(centerX, centerY, radius, step, total = 6) {
  const angle = -Math.PI / 2 + (step / total) * Math.PI * 2;
  return {
    x: centerX + Math.cos(angle) * radius,
    y: centerY + Math.sin(angle) * radius
  };
}

function drawSignalHexagon(svg, centerX, centerY, values, accent) {
  const points = values.map((_, index) => polarPoint(centerX, centerY, 58, index));
  const polygon = points.map((point) => `${point.x},${point.y}`).join(" ");
  svg.appendChild(createSvgElement("polygon", { points: polygon, class: `tda-hexagon-outline ${accentClass(accent)}` }));

  points.forEach((point, index) => {
    svg.appendChild(createSvgElement("circle", { cx: point.x, cy: point.y, r: 5, class: `tda-hexagon-point ${accentClass(accent)}` }));
    const label = createSvgElement("text", { x: point.x + 8, y: point.y - 8, class: "tda-svg-small-label" });
    label.textContent = values[index].toFixed(1);
    svg.appendChild(label);
  });
}

function initGeneoWidget(root) {
  if (!root) {
    return;
  }

  const canvas = root.querySelector("[data-canvas]");
  const slider = root.querySelector("[data-shift]");
  const shiftValue = root.querySelector("[data-shift-value]");
  const summary = root.querySelector("[data-summary]");
  const state = { shift: Number(slider?.value || 0) };

  function render() {
    clearChildren(canvas);
    const svg = buildSvg(620, 238, "tda-widget-svg");
    const shifted = circularShift(GENEO_BASE_VALUES, state.shift);
    const leftOutput = applyCircularAverage(shifted, 1);
    const rightOutput = circularShift(applyCircularAverage(GENEO_BASE_VALUES, 1), state.shift);
    const residual = supNormDistance(leftOutput, rightOutput);

    const inputLabel = createSvgElement("text", { x: 40, y: 20, class: "tda-svg-small-label" });
    inputLabel.textContent = `phi o g_${state.shift}`;
    svg.appendChild(inputLabel);
    drawSignalHexagon(svg, 112, 120, shifted, "blue");

    const leftLabel = createSvgElement("text", { x: 230, y: 20, class: "tda-svg-small-label" });
    leftLabel.textContent = "F(phi o g_k)";
    svg.appendChild(leftLabel);
    drawSignalHexagon(svg, 314, 120, leftOutput, "yellow");

    const rightLabel = createSvgElement("text", { x: 446, y: 20, class: "tda-svg-small-label" });
    rightLabel.textContent = "(F(phi)) o g_k";
    svg.appendChild(rightLabel);
    drawSignalHexagon(svg, 522, 120, rightOutput, "green");

    const equality = createSvgElement("text", { x: 408, y: 124, class: "tda-svg-title" });
    equality.textContent = "=";
    svg.appendChild(equality);

    canvas.appendChild(svg);

    if (shiftValue) {
      shiftValue.textContent = String(state.shift);
    }

    if (summary) {
      summary.innerHTML =
        "<strong>Operator</strong>: F(phi)(u) = (phi(u) + phi(u + 1))/2 on the cyclic six-vertex signal.<br>" +
        `Equivariance residual: ${residual.toFixed(4)}.<br>` +
        "Rotating first and then averaging gives the same result as averaging first and rotating afterward: that is the GENEO idea in the notes.";
    }
  }

  slider?.addEventListener("input", (event) => {
    state.shift = Number(event.target.value);
    render();
  });

  render();
}

export function enhanceTdaNotesPage(root = document) {
  const page = root.querySelector("[data-tda-page]");
  const article = document.querySelector(".post-single");

  if (!page || !article) {
    return;
  }

  document.body.classList.add("tda-notes-page");
  buildNotebookToc(page);
  bindProofControls(page);
  bindProgress(article, buildProgressBar());

  initSimplicialBuilder(page.querySelector('[data-widget="simplicial-builder"]'));
  initNerveExplorer(page.querySelector('[data-widget="nerve-explorer"]'));
  initHomologyExplorer(page.querySelector('[data-widget="homology-intuition"]'));
  initPersistenceExplorer(page.querySelector('[data-widget="persistence-explorer"]'));
  initDiagramDistanceWidget(page.querySelector('[data-widget="diagram-distance"]'));
  initGeneoWidget(page.querySelector('[data-widget="geneo-intuition"]'));
}
