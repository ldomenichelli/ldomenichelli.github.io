/** Reproducible synthetic manifolds. Every estimator receives these same N-D vectors. */
export const ID_DATASETS = {
  line: { name: 'Line', dimension: 1, description: 'One straight degree of freedom in three coordinates.' },
  circle: { name: 'Circle', dimension: 1, description: 'A curved one-dimensional loop in three coordinates.' },
  plane: { name: 'Plane', dimension: 2, description: 'A flat two-dimensional patch in three coordinates.' },
  swissroll: { name: 'Swiss roll', dimension: 2, description: 'A two-dimensional sheet rolled through three-dimensional space.' },
  sphere: { name: 'Sphere surface', dimension: 2, description: 'Points on a surface, not inside the sphere.' },
  ball: { name: 'D-dimensional ball', dimension: null, description: 'Uniform samples inside a ball; choose two to eight dimensions.' }
};

export const ID_DEFAULTS = Object.freeze({ dataset: 'swissroll', n: 240, k: 16, noise: 0, outliers: 0, boundary: 0, duplicates: 0, dimension: 3, seed: 42, correlationLow: 0.01, correlationHigh: 0.1 });

export function seededRandom(seed) {
  let state = Number(seed) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateIdData(state) {
  state = { ...ID_DEFAULTS, ...state };
  if (!Object.hasOwn(ID_DATASETS, state.dataset)) state.dataset = ID_DEFAULTS.dataset;
  state.boundary = Math.max(0, Math.min(0.18, Number(state.boundary) || 0));
  state.dimension = Math.max(2, Math.min(8, Math.round(Number(state.dimension) || 3)));
  state.n = Math.max(2, Math.min(480, Math.round(Number(state.n) || ID_DEFAULTS.n)));
  const random = seededRandom(state.seed);
  const gaussian = () => Math.sqrt(-2 * Math.log(Math.max(Number.MIN_VALUE, random()))) * Math.cos(2 * Math.PI * random());
  const dimension = state.dataset === 'ball' ? state.dimension : ID_DATASETS[state.dataset].dimension;
  const ambientDimension = state.dataset === 'ball' ? Math.max(3, dimension) : 3;
  const points = [];
  const outlierIndices = new Set();
  let rejected = 0;
  while (points.length < state.n) {
    let point;
    if (state.dataset === 'line') {
      const t = random() * 2 - 1;
      point = [t, t * 0.45, t * 0.2];
    } else if (state.dataset === 'circle') {
      const theta = random() * Math.PI * 2;
      point = [Math.cos(theta), Math.sin(theta), 0];
    } else if (state.dataset === 'plane') {
      const u = random() * 2 - 1;
      const v = random() * 2 - 1;
      point = [u, v, u * 0.25 + v * 0.15];
    } else if (state.dataset === 'swissroll') {
      const t = Math.PI * (1.5 + 3 * random());
      point = [t * Math.cos(t) / 14, (random() * 2 - 1) * 0.65, t * Math.sin(t) / 14];
    } else {
      const d = state.dataset === 'sphere' ? 3 : dimension;
      const vector = Array.from({ length: d }, gaussian);
      const norm = Math.hypot(...vector) || 1;
      const radius = state.dataset === 'sphere' ? 1 : random() ** (1 / d);
      point = vector.map(value => radius * value / norm);
      while (point.length < ambientDimension) point.push(0);
    }
    // Half-space truncation keeps sample size fixed, and changes support rather than piling up points.
    if (state.boundary > 0 && point[0] < -1 + state.boundary * 6) {
      rejected += 1;
      continue;
    }
    const perturbation = Array.from({ length: ambientDimension }, gaussian);
    const outlierTicket = random();
    const outlier = Array.from({ length: ambientDimension }, () => (random() * 2 - 1) * 1.7);
    point = point.map((value, axis) => value + state.noise * perturbation[axis]);
    if (outlierTicket < state.outliers) {
      point = outlier;
      outlierIndices.add(points.length);
    }
    points.push(point);
  }
  const duplicateIndices = new Set();
  const duplicateCount = Math.min(points.length - 2, Math.floor(points.length * state.duplicates));
  for (let j = 0; j < duplicateCount; j += 1) {
    const index = points.length - 1 - j;
    points[index] = [...points[j % (points.length - duplicateCount)]];
    duplicateIndices.add(index);
    if (outlierIndices.has(j % (points.length - duplicateCount))) outlierIndices.add(index);
    else outlierIndices.delete(index);
  }
  return { points, dimension, ambientDimension, outlierIndices, duplicateIndices, rejected };
}
