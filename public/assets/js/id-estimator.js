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

