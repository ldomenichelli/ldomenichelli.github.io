/**
 * Levina–Bickel MLE helpers.
 * Kept dependency-free so both browser and Node tests can use the same code.
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

export function summarizeFinite(values) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return { mean: NaN, median: NaN, iqr: NaN, arr: [] };
  const q = (p) => clean[Math.floor((clean.length - 1) * p)];
  const mean = clean.reduce((a, b) => a + b, 0) / clean.length;
  return { mean, median: q(0.5), iqr: q(0.75) - q(0.25), arr: clean };
}

export function localMleCurveFromSortedDistances(sortedDistances, kMin = 2, kMax = sortedDistances.length) {
  const upper = Math.max(kMin, Math.min(kMax, sortedDistances.length));
  const curve = [];
  for (let k = kMin; k <= upper; k += 1) {
    curve.push({ k, value: localMleFromSortedDistances(sortedDistances, k) });
  }
  return curve;
}

export function aggregateMleByK(distanceCache, kMin = 2, kMax = 20) {
  const maxNeighbors = distanceCache.reduce((m, ds) => Math.max(m, ds.length), 0);
  const upper = Math.min(kMax, maxNeighbors);
  const rows = [];
  for (let k = Math.max(2, kMin); k <= upper; k += 1) {
    const vals = distanceCache.map((ds) => localMleFromSortedDistances(ds, k));
    const stats = summarizeFinite(vals);
    rows.push({ k, mean: stats.mean, median: stats.median, iqr: stats.iqr, values: vals });
  }
  return rows;
}

export function aggregateMleOverKRange(distanceCache, kStart, kEnd, mode = 'mean') {
  const lo = Math.max(2, Math.min(kStart, kEnd));
  const hi = Math.max(lo, Math.max(kStart, kEnd));
  const rows = aggregateMleByK(distanceCache, lo, hi);
  const globalValues = rows.map((row) => (mode === 'median' ? row.median : row.mean)).filter(Number.isFinite);
  if (!rows.length || !globalValues.length) return { value: NaN, rows: [] };
  const value = globalValues.reduce((a, b) => a + b, 0) / globalValues.length;
  return { value, rows };
}
