// Standard maps from TICKET-02 Part 2. Angle θ from +X: point = (r cos θ, y, r sin θ).
const DEG = Math.PI / 180;
const ring = (n, r, startDeg, stepDeg, y = 0, cx = 0, cz = 0) =>
  Array.from({ length: n }, (_, i) => {
    const a = (startDeg + i * stepDeg) * DEG;
    return [cx + r * Math.cos(a), y, cz + r * Math.sin(a)];
  });
const lanterns = (list) => list.map((pos, i) => ({ id: `L${i + 1}`, pos }));

const N1 = {
  night: 1, name: 'Đảo Bến', duration_s: 240, start: [0, 0, 0],
  shade_speed: 4.0, shade_interval_ticks: 480, shade_max: 6,
  lanterns: lanterns([[0, 0, 25], [23.8, 0, 7.7], [14.7, 0, -20.2], [-14.7, 0, -20.2], [-23.8, 0, 7.7]]),
  motePoints: [...ring(8, 12, 0, 45), ...ring(16, 33, 0, 22.5)],
  shadePoints: ring(12, 37, 15, 30),
  pads: [], charms: [], drifters: false, wind: false,
  islands: [{ c: [0, 0], r: 40 }],
};

const N2 = {
  night: 2, name: 'Đảo Cau', duration_s: 270, start: [0, 0, 0],
  shade_speed: 4.0, shade_interval_ticks: 420, shade_max: 8,
  lanterns: lanterns([[0, 0, 20], [17, 0, -10], [-17, 0, -10], [70, 0, 20], [87, 0, -10], [53, 0, -10]]),
  motePoints: [
    ...ring(4, 10, 0, 90), ...ring(8, 22, 0, 45),
    ...ring(4, 10, 0, 90, 0, 70, 0), ...ring(8, 22, 0, 45, 0, 70, 0),
  ],
  shadePoints: [...ring(8, 26, 22.5, 45), ...ring(8, 26, 22.5, 45, 0, 70, 0)],
  pads: [
    { pos: [20, 0, 18], vy: 14, speed: 24, target: [70, 0] },
    { pos: [50, 0, -18], vy: 14, speed: 24, target: [0, 0] },
  ],
  charms: [{ id: 'C1', pos: [35, 0, 0] }],
  drifters: true, wind: false,
  islands: [{ c: [0, 0], r: 28 }, { c: [70, 0], r: 28 }],
  bridge: { x0: 26, x1: 44, z0: -2, z1: 2 },
};

const N3 = {
  night: 3, name: 'Đảo Chuông', duration_s: 300,
  start: [0, 0, -30], // ticket gives no Night 3 start; (0,0,0) is inside the bell tower. See phase-2 notes A-P2-3
  shade_speed: 4.5, shade_interval_ticks: 360, shade_max: 10,
  lanterns: lanterns([[0, 6, 6], [18, 3, 10], [-18, 3, 10], [35, 0, -10], [-35, 0, -10], [20, 0, -35], [-20, 0, -35]]),
  motePoints: [...ring(18, 34, 0, 20, 0), ...ring(8, 18, 20, 20, 3), ...ring(4, 5, 45, 90, 6)],
  shadePoints: ring(16, 43, 0, 22.5),
  pads: [{ pos: [0, 3, 13], vy: 12, speed: 8, dir: [0, -1] }],
  charms: [{ id: 'C1', pos: [30, 0, 25] }, { id: 'C2', pos: [-30, 0, 25] }],
  drifters: true, wind: true,
  islands: [{ c: [0, 0], r: 45 }],
  ramps: [30, 150].map((d) => ({ dx: Math.cos(d * DEG), dz: Math.sin(d * DEG) })),
  tower: { r: 2, top: 14 },
};

export const NIGHTS = { 1: N1, 2: N2, 3: N3 };

// Highest walkable surface Y at (x,z), or null over the sea of clouds.
export function groundAt(map, x, z) {
  let g = null;
  for (const is of map.islands) if (Math.hypot(x - is.c[0], z - is.c[1]) <= is.r) g = 0;
  const b = map.bridge;
  if (b && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) g = 0;
  if (map.night === 3 && g !== null) {
    const r = Math.hypot(x, z);
    if (z > 0 && r >= 12 && r <= 24) g = 3;
    if (r <= 8) g = 6;
    for (const rp of map.ramps) {
      const u = x * rp.dx + z * rp.dz, v = -x * rp.dz + z * rp.dx;
      if (u >= 24 && u <= 30 && Math.abs(v) <= 1.5) g = Math.max(g, (3 * (30 - u)) / 6);
    }
  }
  return g;
}

// Solid obstacles that nothing can enter (bell tower).
export function insideTower(map, x, z, y) {
  return !!map.tower && Math.hypot(x, z) < map.tower.r && y < map.tower.top;
}
