// Benchmark statistics exactly as defined in TICKET-04 §1 (dt in milliseconds, one per frame).
export function benchStats(dts) {
  const n = dts.length;
  if (n === 0) return { frames: 0, avg_fps: 0, p1_low_fps: 0, frame_ms_p95: 0 };
  const sum = dts.reduce((a, b) => a + b, 0);
  const sorted = [...dts].sort((a, b) => a - b);
  const k = Math.max(1, Math.ceil(0.01 * n));
  const worst = sorted.slice(n - k);
  const meanWorst = worst.reduce((a, b) => a + b, 0) / k;
  // 95th percentile, nearest-rank method: smallest value with at least 95 % of samples <= it
  const p95 = sorted[Math.min(n - 1, Math.ceil(0.95 * n) - 1)];
  const r = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
  return { frames: n, avg_fps: r((1000 * n) / sum), p1_low_fps: r(1000 / meanWorst), frame_ms_p95: r(p95, 2) };
}

// Camera path of the benchmark: circle r 30 m at Y 15 around (0,0,0), starts at 0° = (30,15,0),
// counter-clockwise seen from above (angle from +X toward +Z, the same convention as the maps), 15 s per lap.
export function benchCamera(tSec) {
  const a = (2 * Math.PI * tSec) / 15;
  return [30 * Math.cos(a), 15, 30 * Math.sin(a)];
}
