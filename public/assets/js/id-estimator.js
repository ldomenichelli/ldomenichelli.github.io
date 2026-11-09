/**
 * Dependency-free intrinsic-dimensionality estimators, shared by browser and tests.
 * All distances use the original coordinates, never a display projection.
 *
 * Conventions and primary references:
 * MLE: Levina & Bickel (2004), local (k-1)/sum(log(Tk/Tj)), arithmetic mean.
 * https://www.stat.berkeley.edu/~bickel/mldim.pdf
 * TwoNN: Facco et al. (2017), empirical CDF i/N, origin-constrained least squares
 * on the lowest 90% of ratios (the empirical ranks retain the full denominator).
 * https://www.nature.com/articles/s41598-017-11873-y
 * Correlation: Grassberger & Procaccia (1983), slope of log C(r) vs log r.
 * https://doi.org/10.1103/PhysRevLett.50.346
 * ESSa (simplex order 1): Johnsson, Soneson & Fontes (2015).
 * https://doi.org/10.1109/TPAMI.2014.2343220
 * PCA participation ratio: (sum eigenvalues)^2 / sum eigenvalues^2, a global
 * effective LINEAR dimension, not in general the manifold's intrinsic dimension.
 * https://ganguli-gang.stanford.edu/pdf/17.theory.measurement.pdf
 */

function vectors(points) {
  if (!Array.isArray(points) || !points.length) return null;
  const rows = points.map((p) => Array.isArray(p) ? p : p && [p.x, p.y]);
  const dim = rows[0]?.length;
  return dim && rows.every((p) => Array.isArray(p) && p.length === dim && p.every(Number.isFinite)) ? rows : null;
}

function invalid(status, details = {}) {
  return { value: NaN, valid: false, status, ...details };
}

function summarize(localValues, details = {}) {
  const finite = localValues.filter(Number.isFinite);
  const excludedCount = localValues.length - finite.length;
  if (!finite.length) return invalid('degenerate', { localValues, validCount: 0, excludedCount, ...details });
  return {
    value: finite.reduce((a, b) => a + b, 0) / finite.length,
    valid: true, status: excludedCount ? 'partial' : 'ok',
    localValues, validCount: finite.length, excludedCount, ...details
  };
}

function effectiveK(k, count) {
  return Number.isFinite(k) && k >= 2 ? Math.min(Math.floor(k), count) : NaN;
}

/** Sorted non-self neighbours; exact duplicates remain visible at distance zero. */
export function sortedNeighborCache(points) {
  const rows = vectors(points);
  if (!rows) return [];
  const cache = rows.map(() => []);
  const pairDistances = [];
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const distance = Math.hypot(...rows[i].map((v, d) => v - rows[j][d]));
      cache[i].push({ index: j, distance });
      cache[j].push({ index: i, distance });
      pairDistances.push(distance);
    }
  }
  for (const row of cache) row.sort((a, b) => a.distance - b.distance || a.index - b.index);
  // Non-enumerable metadata keeps the public row-array contract intact.
  Object.defineProperty(cache, 'pairDistances', { value: pairDistances.sort((a, b) => a - b) });
  return cache;
}

export function pairwiseSortedDistances(points) {
  return sortedNeighborCache(points).map((row) => row.map((p) => p.distance));
}

export function localMleFromSortedDistances(sortedDistances, k = 12) {
  if (!Array.isArray(sortedDistances) || sortedDistances.length < 2) return NaN;
  const kEff = effectiveK(k, sortedDistances.length);
  if (!(kEff >= 2)) return NaN;
  const Tk = sortedDistances[kEff - 1];
  if (!(Tk > 0) || !Number.isFinite(Tk)) return NaN;
  let sum = 0;
  for (let j = 0; j < kEff - 1; j += 1) {
    const Tj = sortedDistances[j];
    if (!(Tj > 0) || Tj > Tk || (j && Tj < sortedDistances[j - 1])) return NaN;
    const ratio = Tk / Tj;
    sum += Number.isFinite(ratio) ? Math.log(ratio) : Math.log(Tk) - Math.log(Tj);
  }
  return sum > 0 ? (kEff - 1) / sum : NaN;
}

export function estimateMle(points, k = 12, options = {}) {
  const rows = vectors(points);
  if (!rows) return invalid('invalid-data', { localValues: [] });
  const cache = options.cache || sortedNeighborCache(rows);
  const kEff = effectiveK(k, rows.length - 1);
  if (!(kEff >= 2)) return invalid('insufficient-neighbors', { localValues: [] });
  const localValues = cache.map((row) => localMleFromSortedDistances(row.map((n) => n.distance), kEff));
  return summarize(localValues, { k: kEff });
}

/** Legacy scalar API, accepting both coordinate arrays and {x,y} objects. */
export function datasetMle(points, k = 12) {
  return estimateMle(points, k).value;
}

const LOG_SQRT_2PI = 0.9189385332046727;
const LANCZOS_COEFFS = [
  676.5203681218851, -1259.1392167224028, 771.3234287776531,
  -176.6150291621406, 12.507343278686905, -0.13857109526572012,
  9.984369578019572e-6, 1.5056327351493116e-7
];

export function logGamma(z) {
  if (!(z > 0) || !Number.isFinite(z)) return NaN;
  if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  let x = 0.9999999999998099;
  const zz = z - 1;
  for (let i = 0; i < LANCZOS_COEFFS.length; i += 1) x += LANCZOS_COEFFS[i] / (zz + i + 1);
  const t = zz + LANCZOS_COEFFS.length - 0.5;
  return LOG_SQRT_2PI + (zz + 0.5) * Math.log(t) - t + Math.log(x);
}

/** Continuous gamma-function extension, with its exact n -> 1 limit. */
export function expectedSimplexSkewness(n) {
  if (n === 1) return 0;
  if (!(n > 1) || !Number.isFinite(n)) return NaN;
  return Math.exp(2 * logGamma(n / 2) - logGamma((n + 1) / 2) - logGamma((n - 1) / 2));
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += a[i] * b[i];
  return s;
}

export function essPairTerms(vi, vj) {
  if (!Array.isArray(vi) || !Array.isArray(vj) || vi.length !== vj.length || !vi.every(Number.isFinite) || !vj.every(Number.isFinite)) {
    return { ni: NaN, nj: NaN, dot: NaN, area: NaN, denominator: NaN, contribution: NaN };
  }
  const ni = Math.hypot(...vi);
  const nj = Math.hypot(...vj);
  const dp = dot(vi, vj);
  const prod = ni * nj;
  // Normalize before subtracting squared terms, avoiding overflow and the
  // subtraction of two large squared norms for almost parallel vectors.
  const cosine = prod > 0 ? Math.max(-1, Math.min(1, dp / prod)) : 1;
  const sineSquared = Math.max(0, 1 - cosine * cosine);
  const contribution = sineSquared <= 16 * Number.EPSILON ? 0 : Math.sqrt(sineSquared);
  return { ni, nj, dot: dp, area: prod * contribution, denominator: prod, contribution };
}

export function essStatistic(points) {
  const rows = vectors(points);
  if (!rows || rows.length < 3) return { numerator: NaN, denominator: NaN, sHat: NaN, pairs: 0, centroid: [], centered: [] };
  const dim = rows[0].length;
  // Offset first, so a large translation does not needlessly reduce precision.
  const origin = rows[0];
  const offsets = rows.map((p) => p.map((v, d) => v - origin[d]));
  const meanOffset = Array(dim).fill(0);
  for (const p of offsets) for (let d = 0; d < dim; d += 1) meanOffset[d] += p[d] / rows.length;
  const centroid = meanOffset.map((v, d) => v + origin[d]);
  const centered = offsets.map((p) => p.map((v, d) => v - meanOffset[d]));
  const norms = centered.map((p) => Math.hypot(...p));
  let numerator = 0;
  let denominator = 0;
  let pairs = 0;
  for (let i = 0; i < centered.length; i += 1) {
    for (let j = i + 1; j < centered.length; j += 1) {
      const product = norms[i] * norms[j];
      const cosine = product > 0 ? Math.max(-1, Math.min(1, dot(centered[i], centered[j]) / product)) : 1;
      const sineSquared = Math.max(0, 1 - cosine * cosine);
      numerator += product * (sineSquared <= 16 * Number.EPSILON ? 0 : Math.sqrt(sineSquared));
      denominator += product;
      pairs += 1;
    }
  }
  return { numerator, denominator, sHat: denominator > 0 ? numerator / denominator : NaN, pairs, centroid, centered };
}

const essCurves = new Map();

export function estimateEssDimension(sHat, maxN = 24) {
  if (!Number.isFinite(sHat) || sHat < 0 || sHat > 1 || !Number.isInteger(maxN) || maxN < 2) {
    return { nHat: NaN, status: 'invalid', bracket: null, curve: [] };
  }
  if (!essCurves.has(maxN)) essCurves.set(maxN, Array.from({ length: maxN }, (_, i) => Object.freeze({ n: i + 1, s: expectedSimplexSkewness(i + 1) })));
  const curve = essCurves.get(maxN);
  if (sHat === 0) return { nHat: 1, status: 'ok', bracket: [1, 2], curve };
  const last = curve[curve.length - 1];
  if (sHat > last.s) return { nHat: NaN, status: 'above-range', lowerBound: maxN, bracket: null, curve };
  const exact = curve.find((p) => Math.abs(p.s - sHat) <= 1e-14);
  if (exact) return { nHat: exact.n, status: 'ok', bracket: [Math.max(1, exact.n - 1), exact.n], curve };
  // Smooth interpolation of the theoretical gamma curve, including 1 < n < 2.
  // This is an effective dimension; noninteger n is not a Euclidean space.
  let lo = 1;
  let hi = maxN;
  for (let iteration = 0; iteration < 45; iteration += 1) {
    const mid = (lo + hi) / 2;
    if (expectedSimplexSkewness(mid) < sHat) lo = mid;
    else hi = mid;
  }
  const nHat = (lo + hi) / 2;
  return { nHat, status: 'ok', bracket: [Math.floor(nHat), Math.ceil(nHat)], curve };
}

/** Mean local ESS over each point and its k neighbours; no subsampling. */
export function estimateEss(points, k = 12, options = {}) {
  const rows = vectors(points);
  if (!rows) return invalid('invalid-data', { localValues: [], localSkewness: [] });
  const kEff = effectiveK(k, rows.length - 1);
  if (!(kEff >= 2)) return invalid('insufficient-neighbors', { localValues: [], localSkewness: [] });
  const cache = options.cache || sortedNeighborCache(rows);
  const maxDimension = options.maxDimension ?? 24;
  let aboveRangeCount = 0;
  const localSkewness = [];
  const localValues = cache.map((neighbors, i) => {
    const localPoints = [rows[i], ...neighbors.slice(0, kEff).map((p) => rows[p.index])];
    const stats = essStatistic(localPoints);
    localSkewness.push(stats.sHat);
    const result = estimateEssDimension(stats.sHat, maxDimension);
    if (result.status === 'above-range') aboveRangeCount += 1;
    return result.nHat;
  });
  const result = summarize(localValues, { k: kEff, localSkewness, aboveRangeCount, maxDimension, curve: estimateEssDimension(0, maxDimension).curve });
  if (!result.valid && aboveRangeCount) result.status = 'above-range';
  return result;
}

function linearFit(points, throughOrigin = false) {
  if (points.length < 3) return null;
  const xMean = throughOrigin ? 0 : points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const yMean = throughOrigin ? 0 : points.reduce((sum, p) => sum + p.y, 0) / points.length;
  let xx = 0;
  let xy = 0;
  for (const p of points) {
    xx += (p.x - xMean) ** 2;
    xy += (p.x - xMean) * (p.y - yMean);
  }
  if (!(xx > 0)) return null;
  const slope = xy / xx;
  const intercept = throughOrigin ? 0 : yMean - slope * xMean;
  const actualYMean = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  const total = points.reduce((sum, p) => sum + (p.y - actualYMean) ** 2, 0);
  const residual = points.reduce((sum, p) => sum + (p.y - slope * p.x - intercept) ** 2, 0);
  return { slope, intercept, r2: total > 0 ? 1 - residual / total : NaN };
}

export function estimateTwoNN(points, options = {}) {
  const rows = vectors(points);
  if (!rows) return invalid('invalid-data', { fitPoints: [] });
  const cache = options.cache || sortedNeighborCache(rows);
  const retainedFraction = options.retainedFraction ?? 0.9;
  if (!(retainedFraction > 0 && retainedFraction <= 1)) return invalid('invalid-fit-fraction', { fitPoints: [] });
  const ratios = cache.map((row) => row.length >= 2 && row[0].distance > 0 ? row[1].distance / row[0].distance : NaN)
    .filter((r) => Number.isFinite(r) && r >= 1).sort((a, b) => a - b);
  const excludedCount = rows.length - ratios.length;
  if (ratios.length < 5) return invalid('insufficient-neighbors', { fitPoints: [], ratios, excludedCount });
  const retainedCount = Math.min(ratios.length - 1, Math.floor(ratios.length * retainedFraction));
  // i=N has F=1 and an infinite ordinate; it is never part of the fit/plot.
  const fitPoints = ratios.slice(0, -1).map((ratio, i) => {
    const cdf = (i + 1) / ratios.length;
    return { x: Math.log(ratio), y: -Math.log1p(-cdf), ratio, cdf, inFit: i < retainedCount };
  });
  const fit = linearFit(fitPoints.filter((p) => p.inFit), true);
  const details = { fitPoints, ratios, retainedFraction, retainedCount, validCount: ratios.length, excludedCount };
  if (!fit || !(fit.slope > 0) || !Number.isFinite(fit.slope)) return invalid('degenerate', details);
  return { value: fit.slope, valid: true, status: excludedCount ? 'partial' : 'ok', ...fit, ...details };
}

function quantile(sorted, probability) {
  const index = (sorted.length - 1) * probability;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
}

function countAtMost(sorted, value) {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * C(r) counts all unordered non-self pairs <=r, divided by N(N-1)/2.
 * Fit radii: pair-distance quantiles 1%..10% by default, or explicit options.range.
 * Fit 24 log-spaced radii by OLS with intercept. This selected finite-scale slope
 * is exploratory: it does not certify an asymptotic scaling plateau.
 */
export function estimateCorrelation(points, options = {}) {
  const rows = vectors(points);
  if (!rows) return invalid('invalid-data', { curve: [] });
  if (rows.length < 8) return invalid('insufficient-points', { curve: [] });
  const cache = options.cache || sortedNeighborCache(rows);
  const distances = cache.pairDistances || [];
  if (!cache.pairDistances) {
    for (let i = 0; i < cache.length; i += 1) {
      for (const p of cache[i]) if (p.index > i) distances.push(p.distance);
    }
    distances.sort((a, b) => a - b);
  }
  const totalPairs = distances.length;
  const duplicatePairs = countAtMost(distances, 0);
  const positive = distances.slice(duplicatePairs);
  if (!positive.length || !positive.every(Number.isFinite)) return invalid('degenerate', { curve: [], totalPairs, duplicatePairs });
  const lowerQuantile = options.lowerQuantile ?? 0.01;
  const upperQuantile = options.upperQuantile ?? 0.1;
  if (!(lowerQuantile > 0 && upperQuantile < 1 && lowerQuantile < upperQuantile)) return invalid('invalid-scale-range', { curve: [] });
  const range = options.range || [quantile(distances, lowerQuantile), quantile(distances, upperQuantile)];
  if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isFinite) || !(range[0] > 0 && range[1] > range[0])) {
    return invalid('invalid-scale-range', { curve: [], range, duplicatePairs });
  }
  const logLow = Math.log(range[0]);
  const logHigh = Math.log(range[1]);
  const radii = Array.from({ length: 24 }, (_, i) => Math.exp(logLow + i * (logHigh - logLow) / 23));
  // Context points outside the selected fit make scale dependence visible.
  const contextLow = Math.log(Math.max(positive[0], Math.min(range[0], quantile(positive, 0.002))));
  const contextHigh = Math.log(Math.max(range[1], quantile(positive, 0.5)));
  const context = Array.from({ length: 24 }, (_, i) => Math.exp(contextLow + i * (contextHigh - contextLow) / 23))
    .filter((r) => r < range[0] || r > range[1]);
  const curve = [...radii.map((r) => ({ r, inFit: true })), ...context.map((r) => ({ r, inFit: false }))]
    .sort((a, b) => a.r - b.r).map((p) => {
      const count = countAtMost(distances, p.r);
      const c = count / totalPairs;
      return { ...p, c, count, x: Math.log(p.r), y: c > 0 ? Math.log(c) : NaN };
    });
  const fitted = curve.filter((p) => p.inFit && p.c > 0 && p.c < 1);
  const fit = linearFit(fitted);
  const details = { curve, range, lowerQuantile, upperQuantile, totalPairs, duplicatePairs, fitCount: fitted.length };
  if (!fit || !(fit.slope > 0) || !Number.isFinite(fit.slope)) return invalid('degenerate', details);
  return { value: fit.slope, valid: true, status: duplicatePairs ? 'duplicates' : 'ok', ...fit, ...details };
}

/** Jacobi rotations for a small real symmetric covariance matrix. */
function symmetricEigenvalues(matrix) {
  const a = matrix.map((row) => row.slice());
  const dim = a.length;
  const scale = a.reduce((sum, row, i) => sum + Math.abs(row[i]), 0);
  if (!(scale > 0)) return Array(dim).fill(0);
  for (let iteration = 0; iteration < 100 * dim * dim; iteration += 1) {
    let p = 0;
    let q = 0;
    let largest = 0;
    for (let i = 0; i < dim; i += 1) for (let j = i + 1; j < dim; j += 1) {
      if (Math.abs(a[i][j]) > largest) { largest = Math.abs(a[i][j]); p = i; q = j; }
    }
    if (largest <= 1e-13 * scale) break;
    const theta = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]);
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const app = a[p][p];
    const aqq = a[q][q];
    const apq = a[p][q];
    for (let i = 0; i < dim; i += 1) {
      if (i === p || i === q) continue;
      const aip = a[i][p];
      const aiq = a[i][q];
      a[i][p] = a[p][i] = c * aip - s * aiq;
      a[i][q] = a[q][i] = s * aip + c * aiq;
    }
    a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
    a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
    a[p][q] = a[q][p] = 0;
  }
  return a.map((row, i) => Math.max(0, row[i])).sort((a, b) => b - a);
}

export function estimatePca(points) {
  const rows = vectors(points);
  if (!rows) return invalid('invalid-data', { eigenvalues: [], explainedVariance: [], cumulativeVariance: [], rank95: 0 });
  const dim = rows[0].length;
  if (rows.length < 2) return invalid('insufficient-points', { eigenvalues: [], explainedVariance: [], cumulativeVariance: [], rank95: 0 });
  const origin = rows[0];
  const offsets = rows.map((p) => p.map((v, d) => v - origin[d]));
  const mean = Array(dim).fill(0);
  for (const p of offsets) for (let d = 0; d < dim; d += 1) mean[d] += p[d] / rows.length;
  const covariance = Array.from({ length: dim }, () => Array(dim).fill(0));
  for (const p of offsets) {
    for (let i = 0; i < dim; i += 1) {
      for (let j = i; j < dim; j += 1) covariance[i][j] += (p[i] - mean[i]) * (p[j] - mean[j]) / (rows.length - 1);
    }
  }
  for (let i = 0; i < dim; i += 1) for (let j = 0; j < i; j += 1) covariance[i][j] = covariance[j][i];
  const eigenvalues = symmetricEigenvalues(covariance);
  const totalVariance = eigenvalues.reduce((a, b) => a + b, 0);
  if (!(totalVariance > 0) || !Number.isFinite(totalVariance)) {
    return invalid('zero-variance', { eigenvalues, explainedVariance: Array(dim).fill(0), cumulativeVariance: Array(dim).fill(0), rank95: 0, covariance, totalVariance });
  }
  const explainedVariance = eigenvalues.map((v) => v / totalVariance);
  let cumulative = 0;
  const cumulativeVariance = explainedVariance.map((v) => { cumulative += v; return cumulative; });
  const rank95 = cumulativeVariance.findIndex((v) => v >= 0.95 - 1e-12) + 1;
  const value = 1 / explainedVariance.reduce((sum, v) => sum + v * v, 0);
  return { value, valid: true, status: 'ok', eigenvalues, explainedVariance, cumulativeVariance, rank95, covariance, totalVariance };
}

/** Supply options.cache to reuse neighbour distances after changing only k. */
export function estimateAll(points, k = 12, options = {}) {
  const cache = options.cache || sortedNeighborCache(points);
  return {
    mle: estimateMle(points, k, { cache }),
    ess: estimateEss(points, k, { cache, ...options.ess }),
    twonn: estimateTwoNN(points, { cache, ...options.twonn }),
    correlation: estimateCorrelation(points, { cache, ...options.correlation }),
    pca: estimatePca(points),
    cache
  };
}
