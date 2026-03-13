/**
 * Intrinsic-dimensionality helpers.
 * Dependency-free so both browser and Node tests can use the same code.
 */

export function localMleFromSortedDistances(sortedDistances, k) {
  if (!Array.isArray(sortedDistances) || sortedDistances.length < 2) return NaN;
  const kEff = Math.max(2, Math.min(k, sortedDistances.length));
  const Tk = sortedDistances[kEff - 1];
  if (!(Tk > 0)) return NaN;

  let sum = 0;
  for (let j = 0; j < kEff - 1; j += 1) {
    const Tj = sortedDistances[j];
    if (!(Tj > 0) || Tj > Tk) return NaN;
    sum += Math.log(Tk / Tj);
  }
  const avg = sum / (kEff - 1);
  return avg > 0 ? 1 / avg : NaN;
}

export function pairwiseSortedDistances(points) {
  return points.map((p, i) => {
    const ds = [];
    for (let j = 0; j < points.length; j += 1) {
      if (i === j) continue;
      const q = points[j];
      ds.push(Math.hypot(p.x - q.x, p.y - q.y));
    }
    ds.sort((a, b) => a - b);
    return ds;
  });
}

export function datasetMle(points, k) {
  const cache = pairwiseSortedDistances(points);
  const vals = cache.map((d) => localMleFromSortedDistances(d, k)).filter(Number.isFinite);
  if (!vals.length) return NaN;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

const LOG_SQRT_2PI = 0.9189385332046727;
const LANCZOS_COEFFS = [
  676.5203681218851,
  -1259.1392167224028,
  771.3234287776531,
  -176.6150291621406,
  12.507343278686905,
  -0.13857109526572012,
  9.984369578019572e-6,
  1.5056327351493116e-7
];

export function logGamma(z) {
  if (!(z > 0)) return NaN;
  if (z < 0.5) {
    const reflected = Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
    return reflected;
  }

  let x = 0.9999999999998099;
  const zz = z - 1;
  for (let i = 0; i < LANCZOS_COEFFS.length; i += 1) x += LANCZOS_COEFFS[i] / (zz + i + 1);
  const t = zz + LANCZOS_COEFFS.length - 0.5;
  return LOG_SQRT_2PI + (zz + 0.5) * Math.log(t) - t + Math.log(x);
}

export function expectedSimplexSkewness(n) {
  if (!(n >= 2)) return NaN;
  return Math.exp(2 * logGamma(n / 2) - logGamma((n + 1) / 2) - logGamma((n - 1) / 2));
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += a[i] * b[i];
  return s;
}

function norm(a) {
  return Math.sqrt(dot(a, a));
}

export function essPairTerms(vi, vj) {
  const ni = norm(vi);
  const nj = norm(vj);
  const dp = dot(vi, vj);
  const prod = ni * nj;
  const area = Math.sqrt(Math.max(0, ni * ni * nj * nj - dp * dp));
  return { ni, nj, dot: dp, area, denominator: prod, contribution: prod > 0 ? area / prod : 0 };
}

export function essStatistic(points) {
  if (!Array.isArray(points) || points.length < 3) {
    return { numerator: NaN, denominator: NaN, sHat: NaN, pairs: 0, centroid: [] };
  }
  const dim = points[0].length;
  const centroid = Array(dim).fill(0);
  for (const p of points) for (let d = 0; d < dim; d += 1) centroid[d] += p[d];
  for (let d = 0; d < dim; d += 1) centroid[d] /= points.length;

  const centered = points.map((p) => p.map((v, d) => v - centroid[d]));
  let numerator = 0;
  let denominator = 0;
  let pairs = 0;
  for (let i = 0; i < centered.length; i += 1) {
    for (let j = i + 1; j < centered.length; j += 1) {
      const t = essPairTerms(centered[i], centered[j]);
      numerator += t.area;
      denominator += t.denominator;
      pairs += 1;
    }
  }
  return { numerator, denominator, sHat: denominator > 0 ? numerator / denominator : NaN, pairs, centroid, centered };
}

export function estimateEssDimension(sHat, maxN = 24) {
  if (!Number.isFinite(sHat)) return { nHat: NaN, status: 'invalid', bracket: null, curve: [] };
  const curve = [];
  for (let n = 2; n <= maxN; n += 1) curve.push({ n, s: expectedSimplexSkewness(n) });

  if (sHat <= curve[0].s) return { nHat: 1, status: 'below-range', bracket: [2, 3], curve };
  const last = curve[curve.length - 1];
  if (sHat >= last.s) return { nHat: last.n, status: 'above-range', bracket: [last.n - 1, last.n], curve };

  for (let i = 0; i < curve.length - 1; i += 1) {
    const a = curve[i];
    const b = curve[i + 1];
    if (sHat >= a.s && sHat <= b.s) {
      const t = (sHat - a.s) / (b.s - a.s);
      return { nHat: a.n + t, status: 'ok', bracket: [a.n, b.n], curve };
    }
  }
  return { nHat: NaN, status: 'invalid', bracket: null, curve };
}
