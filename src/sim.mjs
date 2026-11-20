// Pure, deterministic game logic for Đảo Đèn Lồng (Contract v1.2: TICKET-02 numbers + TICKET-03 lantern fuel).
// No DOM, no Math.random, no wall clock. Shared by the browser game and the headless runner.
// step() follows the mandatory 12-stage tick order from TICKET-02; stage numbers are marked below.
import { NIGHTS, groundAt, insideTower } from './maps.mjs';

export const TICK_RATE = 60;
export { NIGHTS };

export const TUNING = Object.freeze({
  player_speed: 6,
  carry_capacity: 10,
  lantern_cost: 10,
  lantern_count_night1: 5,
  pickup_radius: 1.0,
  interact_radius: 2.0,
  pulse_cost: 3,
  pulse_radius: 5,
  night1_duration_s: 240,
  flames: 3,
  invuln_s: 1.5,
  hit_drop_ratio: 0.5,
  pulse_stun_s: 2,
  pulse_push_m: 4,
  pulse_cooldown_s: 3,
  safe_radius: 6,
  shade_speed: 4,
  shade_hit_radius: 1.0,
  fall_enabled: true,
  dash_speed: 14,
  dash_duration_s: 0.2,
  dash_cooldown_s: 1.5,
  night2_duration_s: 270,
  night3_duration_s: 300,
  fuel_max: 100,
  fuel_decay_per_s: 1.0,
  fuel_per_mote: 10,
  relight_cost: 5,
  win_ratio: 0.6,
  drain_per_s: 5,
  low_fuel_threshold: 30,
  capacity_max: 20,
  // TICKET-03 §5 replaces the score table. per_second_left is removed (0); per_mote = mote put into a lantern.
  score: { per_mote: 5, per_lantern: 100, per_relight: 40, per_stun: 5, per_stun_drain: 15, per_second_left: 0, per_flame_left: 50, per_lit_at_dawn: 50 },
});

// Standard rule constants from TICKET-02 that are not contract tuning keys.
export const RULES = Object.freeze({
  jump_velocity: 7, gravity: 20,
  pickup_dy: 1.5, hit_dy: 1.5,
  motes_initial: 20, motes_cap: 30, mote_spawn_every: 240,
  dropped_ttl: 480, drop_ring_min: 1.5, drop_ring_max: 2.5,
  stun_ticks: 120, push_ticks: 15, pulse_center_dy: 0.8,
  shade_detect: 12, shade_giveup: 18, shade_first_spawn: 300, shade_min_player_dist: 15,
  recoil_m: 2, recoil_ticks: 60, evict_ticks: 30,
  invuln_ticks: 90, fall_y: -10, fall_wait: 60,
  charm_ticks: 600, charm_respawn: 2700, charm_speed: 7.2,
  drifter_speed: 7, drifter_idle_speed: 2, drifter_max: 2, drifter_every: 1200,
  drifter_chase_carry: 5, drifter_detect: 15, drifter_touch: 1.2, drifter_steal: 3,
  drifter_flee_ticks: 240, drifter_drop_vanish: 120,
  wind_every: 1800, wind_ticks: 300, wind_speed: 2, wind_warn: 120,
  // own choices (ticket silent), documented in docs/notes/phase-2.md
  shade_spawning_ticks: 60, shade_wander_speed: 1.5, wander_turn_ticks: 120,
  shade_hover: 1.0, drifter_hover: 1.5, step_up: 0.35,
  drain_reach: 2,
});

const DASH_TICKS = Math.round(TUNING.dash_duration_s * TICK_RATE); // 12
const DASH_CD = Math.round(TUNING.dash_cooldown_s * TICK_RATE); // 90
const PULSE_CD = Math.round(TUNING.pulse_cooldown_s * TICK_RATE); // 180
const SHADE_SPEED_ONLY_N1 = TUNING.shade_speed;
// Fuel is kept in integer 1/60 units (TICKET-03 §1): burn 1 unit/tick, drain 5 units/tick, 600 units per mote.
const FU = TICK_RATE;
const FUEL_MAX = TUNING.fuel_max * FU, FUEL_LOW = TUNING.low_fuel_threshold * FU, FUEL_PER_MOTE = TUNING.fuel_per_mote * FU;
const BURN = Math.round(TUNING.fuel_decay_per_s), DRAIN = Math.round(TUNING.drain_per_s);
export const fuelOf = (l) => (l.lit ? l.fuel / FU : 0);
export const hasSafeZone = (l) => l.lit && l.fuel >= FUEL_LOW;
export const capacityOf = (p) => Math.min(TUNING.capacity_max, TUNING.carry_capacity + 2 * p.lights);
export const winThreshold = (g) => Math.ceil(TUNING.win_ratio * g.lanterns.length - 1e-9);
const round1 = (v) => { const r = Math.round(v * 10) / 10; return Object.is(r, -0) ? 0 : r; };

export function makeRng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function round3(v) {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
}
const hd = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const idNum = (id) => { const m = /(\d+)$/.exec(id); return m ? +m[1] : 0; };
const byId = (a, b) => idNum(a.id) - idNum(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const nextId = (list, prefix, counter) => { let id; do { id = `${prefix}${counter.n++}`; } while (list.some((e) => e.id === id)); return id; };

export function durationOf(night) { return NIGHTS[night].duration_s; }

// ---------------------------------------------------------------- setup
export function createGame({ seed = 0, night = 1, scenario = null } = {}) {
  const map = NIGHTS[night];
  if (!map) throw new Error(`unknown night ${night}`);
  const sc = scenario || {};
  const g = {
    map, night, rng: makeRng(seed),
    tick: 0, simTick: 0, paused: false,
    state: 'playing', result: null, score: 0,
    baseTime: sc.time_left_s ?? map.duration_s,
    player: {
      pos: map.start.slice(), vel: [0, 0, 0], grounded: true, facing: [0, 1],
      flames: TUNING.flames, carried: 0, invuln: 0, pulseCd: 0, dashCd: 0, dashTicks: 0, dashDir: [0, 1],
      charm: 0, launch: null, fallWait: 0, lights: 0,
    },
    lanterns: map.lanterns.map((l) => ({ id: l.id, pos: l.pos.slice(), deposited: 0, lit: false, fuel: 0, everLit: false, relits: 0, justLit: false })),
    motes: [], shades: [], drifters: [], charms: map.charms.map((c) => ({ id: c.id, pos: c.pos.slice(), available: true, respawn: 0 })),
    ids: { M: { n: 1 }, S: { n: 1 }, D: { n: 1 } },
    randomMotes: sc.random_motes ?? true,
    randomShades: sc.random_shades ?? true,
    randomDrifters: sc.random_drifters ?? map.drifters,
    windEnabled: sc.wind_enabled ?? map.wind,
    wind: { active: 0, dir: 0 },
    prev: { jump: false, interact: false, pulse: false, dash: false, pause: false },
    events: [],
  };
  const p = g.player;
  if (sc.player) {
    const sp = sc.player;
    if (sp.pos) p.pos = sp.pos.slice(0, 3).map(Number);
    if (sp.carried != null) p.carried = sp.carried;
    if (sp.flames != null) p.flames = sp.flames;
    if (sp.invuln_ticks != null) p.invuln = sp.invuln_ticks;
    if (sp.dash_cd_ticks != null) p.dashCd = sp.dash_cd_ticks;
    if (sp.pulse_cd_ticks != null) p.pulseCd = sp.pulse_cd_ticks;
    if (sp.charm_ticks != null) p.charm = sp.charm_ticks;
    if (sp.successful_lights != null) p.lights = sp.successful_lights;
  }
  const g0 = groundAt(map, p.pos[0], p.pos[2]);
  p.grounded = g0 !== null && Math.abs(p.pos[1] - g0) <= RULES.step_up;
  if (p.grounded) p.pos[1] = g0;

  for (const l of sc.lanterns || []) {
    const t = g.lanterns.find((x) => x.id === l.id);
    if (!t) continue;
    if (l.pos) t.pos = l.pos.slice(0, 3).map(Number);
    if (l.deposited != null) t.deposited = l.deposited;
    if (l.lit != null) t.lit = !!l.lit;
    if (l.ever_lit != null) t.everLit = !!l.ever_lit;
    if (l.relit_count != null) t.relits = l.relit_count;
    if (t.lit) { t.everLit = true; t.fuel = Math.round((l.fuel ?? TUNING.fuel_max) * FU); }
    else t.fuel = 0;
  }

  if (sc.motes) for (const m of sc.motes) addMote(g, Array.isArray(m) ? m : m.pos, Array.isArray(m) ? 'random' : m.kind || 'random', Array.isArray(m) ? null : m.ttl_ticks ?? (m.ttl_s != null ? Math.round(m.ttl_s * 60) : null));
  else if (g.randomMotes) {
    const pts = map.motePoints.map((_, i) => i);
    for (let i = 0; i < RULES.motes_initial && pts.length; i++) {
      const k = Math.floor(g.rng() * pts.length);
      addMote(g, map.motePoints[pts.splice(k, 1)[0]], 'random', null);
    }
  }

  for (const s of sc.shades || []) {
    const sh = addShade(g, s.pos.slice(0, 3).map(Number), s.id, s.state || 'wander', s.state_ticks_left ?? 0, true);
    if (sh.state === 'stunned') sh.push = 0;
    if (s.target_lantern_id) sh.target = s.target_lantern_id;
    if (sh.state === 'drain' && !sh.target) sh.target = nearestBy(g.lanterns, sh.pos, (l) => l.lit)?.id ?? null;
  }
  for (const d of sc.drifters || []) {
    g.drifters.push({ id: d.id || nextId(g.drifters, 'D', g.ids.D), pos: d.pos.slice(0, 3).map(Number), state: d.state || 'idle', stolen: d.stolen ?? 0, t: d.state_ticks_left ?? (d.state === 'flee' ? RULES.drifter_flee_ticks : 0), heading: 0, turn: 0 });
  }
  for (const d of g.drifters) idNum(d.id) >= g.ids.D.n && (g.ids.D.n = idNum(d.id) + 1);
  if (sc.charms) {
    g.charms = sc.charms.map((c, i) => ({ id: c.id || `C${i + 1}`, pos: (c.pos || map.charms[i]?.pos || [0, 0, 0]).slice(0, 3).map(Number), available: c.available ?? true, respawn: c.respawn_ticks ?? (c.respawn_s != null ? Math.round(c.respawn_s * 60) : 0) }));
  }
  return g;
}

function addMote(g, pos, kind, ttl) {
  const m = { id: `M${g.ids.M.n++}`, pos: [pos[0], pos[1] ?? 0, pos[2]], kind, ttl };
  g.motes.push(m);
  return m;
}

function addShade(g, pos, id, state, t, fromScenario) {
  if (!id) id = nextId(g.shades, 'S', g.ids.S);
  else if (idNum(id) >= g.ids.S.n && /^S\d+$/.test(id)) g.ids.S.n = idNum(id) + 1;
  const gr = groundAt(g.map, pos[0], pos[2]);
  const hover = fromScenario ? pos[1] - (gr ?? 0) : RULES.shade_hover;
  const s = { id, pos: [pos[0], (gr ?? 0) + hover, pos[2]], hover, state, t, push: 0, pushDir: [1, 0], evict: null, heading: 0, turn: 0, target: null, drainTicks: 0 };
  if (fromScenario) s.pos[1] = pos[1];
  g.shades.push(s);
  return s;
}

// nearest element (XZ) passing the filter; equal distance -> smaller id
function nearestBy(list, pos, ok) {
  let best = null, bd = Infinity;
  for (const e of [...list].sort(byId)) { if (!ok(e)) continue; const d = hd(pos, e.pos); if (d < bd - 1e-9) { best = e; bd = d; } }
  return best;
}

export function timeLeft(g) { return g.baseTime - g.simTick / TICK_RATE; }
const emit = (g, name, data) => g.events.push({ type: 'event', tick: g.tick, name, data });
const targetable = (g) => g.player.fallWait === 0;

function dropMotes(g, n, center) {
  for (let i = 0; i < n; i++) {
    const a = g.rng() * Math.PI * 2;
    const r = RULES.drop_ring_min + g.rng() * (RULES.drop_ring_max - RULES.drop_ring_min);
    const x = center[0] + r * Math.cos(a), z = center[2] + r * Math.sin(a);
    const gy = groundAt(g.map, x, z);
    addMote(g, [x, gy ?? center[1], z], 'dropped', RULES.dropped_ttl);
  }
}

// ---------------------------------------------------------------- step
// input: { move:[x,z], cam_yaw_deg, jump, interact, pulse, dash, pause }
export function step(g, input) {
  g.events = [];
  if (g.state !== 'playing') return g.events;
  g.tick++;
  const pressed = {};
  for (const k of Object.keys(g.prev)) pressed[k] = !!input[k] && !g.prev[k];
  for (const k of Object.keys(g.prev)) g.prev[k] = !!input[k];

  // 1. input: pause first
  if (pressed.pause) {
    g.paused = !g.paused;
    emit(g, g.paused ? 'paused' : 'resumed', {});
  }
  if (g.paused) return g.events;

  const p = g.player, map = g.map, dt = 1 / TICK_RATE;

  // 2. counters
  g.simTick++;
  if (p.invuln > 0) p.invuln--;
  if (p.pulseCd > 0) p.pulseCd--;
  if (p.dashCd > 0) p.dashCd--;
  if (p.charm > 0) p.charm--;
  if (g.wind.active > 0) g.wind.active--;
  for (const s of g.shades) {
    if (s.t > 0 && --s.t === 0) {
      if (s.state === 'spawning' || s.state === 'recoil' || s.state === 'stunned') s.state = 'wander';
    }
  }
  for (const d of g.drifters) if (d.state === 'flee' && d.t > 0 && --d.t === 0) d.state = 'removed';
  g.motes = g.motes.filter((m) => m.ttl == null || --m.ttl > 0);
  for (const c of g.charms) if (!c.available && c.respawn > 0 && --c.respawn === 0) c.available = true;
  // 2b. fuel: burn 1/60 per tick for every lit lantern, then drain 5/60 per tick per draining shade
  for (const l of g.lanterns) if (l.lit) l.fuel -= BURN;
  for (const s of g.shades) {
    if (s.state !== 'drain') continue;
    const l = g.lanterns.find((x) => x.id === s.target);
    if (!l || !l.lit) continue;
    l.fuel -= DRAIN;
    if (++s.drainTicks % TICK_RATE === 0) emit(g, 'fuel_drain', { lantern_id: l.id, shade_id: s.id, fuel: round1(Math.max(0, l.fuel) / FU) });
  }
  // 2c. lanterns with fuel <= 0 go out
  for (const l of g.lanterns) {
    if (l.lit && l.fuel <= 0) { l.lit = false; l.fuel = 0; l.deposited = 0; emit(g, 'lantern_out', { lantern_id: l.id }); }
  }

  // 3. move Mây
  movePlayer(g, input, pressed, dt);

  // 4. pick up motes + charms
  if (targetable(g)) {
    const keep = [];
    for (const m of g.motes) {
      if (p.carried < capacityOf(p) && hd(p.pos, m.pos) <= TUNING.pickup_radius && Math.abs(p.pos[1] - m.pos[1]) <= RULES.pickup_dy) {
        p.carried++;
        emit(g, 'mote_picked', { carried: p.carried });
      } else keep.push(m);
    }
    g.motes = keep;
    for (const c of g.charms) {
      if (c.available && hd(p.pos, c.pos) <= TUNING.pickup_radius && Math.abs(p.pos[1] - c.pos[1]) <= RULES.pickup_dy) {
        c.available = false; c.respawn = RULES.charm_respawn; p.charm = RULES.charm_ticks;
        emit(g, 'charm_picked', { charm_id: c.id, charm_ticks: RULES.charm_ticks });
      }
    }
  }

  // 5. interact
  if (pressed.interact && p.carried > 0 && targetable(g)) {
    let best = null, bestD = Infinity;
    const refuelNeed = (l) => Math.min(p.carried, Math.ceil((FUEL_MAX - l.fuel) / FUEL_PER_MOTE));
    for (const l of [...g.lanterns].sort(byId)) {
      if (l.lit && refuelNeed(l) <= 0) continue; // full lantern is not receivable
      const d = hd(p.pos, l.pos);
      if (d <= TUNING.interact_radius && d < bestD) { best = l; bestD = d; }
    }
    if (best && best.lit) {
      const used = refuelNeed(best);
      best.fuel = Math.min(FUEL_MAX, best.fuel + FUEL_PER_MOTE * used);
      p.carried -= used;
      g.score += used * TUNING.score.per_mote;
      emit(g, 'refuel', { lantern_id: best.id, amount: used, fuel: round1(best.fuel / FU) });
      if (best.fuel >= FUEL_LOW) best.justLit = true; // safe zone restored: evict shades inside
    } else if (best) {
      const cost = best.everLit ? TUNING.relight_cost : TUNING.lantern_cost;
      const amount = Math.min(p.carried, cost - best.deposited);
      if (amount > 0) {
        p.carried -= amount;
        best.deposited += amount;
        g.score += amount * TUNING.score.per_mote;
        emit(g, 'deposit', { lantern_id: best.id, amount, deposited: best.deposited });
        if (best.deposited >= cost) {
          const relight = best.everLit;
          best.lit = true; best.justLit = true; best.everLit = true; best.fuel = FUEL_MAX;
          if (relight) best.relits++;
          p.lights++;
          g.score += relight ? TUNING.score.per_relight : TUNING.score.per_lantern;
          emit(g, 'lantern_lit', { lantern_id: best.id, relight });
        }
      }
    }
  }

  // 6. safe zones: shades inside a lantern that just lit are evicted to the edge over 30 ticks
  for (const l of g.lanterns) {
    if (!l.justLit) continue;
    l.justLit = false;
    for (const s of g.shades) {
      const d = hd(s.pos, l.pos);
      if (d < TUNING.safe_radius) {
        let dx = s.pos[0] - l.pos[0], dz = s.pos[2] - l.pos[2];
        if (d < 1e-9) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
        s.evict = { from: [s.pos[0], s.pos[2]], to: [l.pos[0] + dx * TUNING.safe_radius, l.pos[2] + dz * TUNING.safe_radius], n: 0 };
        if (s.state === 'drain') { s.state = 'wander'; s.target = null; }
      }
    }
  }

  // 7. pulse
  if (pressed.pulse && p.pulseCd === 0 && p.carried >= TUNING.pulse_cost && targetable(g)) {
    p.carried -= TUNING.pulse_cost;
    p.pulseCd = PULSE_CD;
    const c = [p.pos[0], p.pos[1] + RULES.pulse_center_dy, p.pos[2]];
    const d3 = (q) => Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2]);
    const ids = [];
    for (const s of g.shades) {
      if (d3(s.pos) > TUNING.pulse_radius) continue;
      ids.push(s.id);
      g.score += s.state === 'drain' ? TUNING.score.per_stun_drain : TUNING.score.per_stun;
      s.target = null;
      s.state = 'stunned'; s.t = RULES.stun_ticks; s.push = RULES.push_ticks;
      let dx = s.pos[0] - p.pos[0], dz = s.pos[2] - p.pos[2];
      const dl = Math.hypot(dx, dz);
      s.pushDir = dl < 1e-9 ? [1, 0] : [dx / dl, dz / dl];
    }
    for (const d of g.drifters) {
      if (d.state === 'removed' || d3(d.pos) > TUNING.pulse_radius) continue;
      if (d.state === 'chase') { d.state = 'flee'; d.t = RULES.drifter_flee_ticks; }
      else if (d.state === 'flee' && d.stolen > 0) {
        const amount = d.stolen;
        for (let i = 0; i < amount; i++) addMote(g, [d.pos[0], groundAt(map, d.pos[0], d.pos[2]) ?? p.pos[1], d.pos[2]], 'dropped', RULES.dropped_ttl);
        d.stolen = 0; d.t = RULES.drifter_drop_vanish;
        emit(g, 'drifter_drop', { drifter_id: d.id, amount });
      }
    }
    emit(g, 'pulse', { stunned_ids: ids });
  }

  // 8. move shades + drifters
  moveShades(g, dt);
  moveDrifters(g, dt);

  // 9. contact: drifters steal first, then shades hit (ascending id, max one flame per tick)
  if (targetable(g)) {
    for (const d of [...g.drifters].sort(byId)) {
      if ((d.state !== 'idle' && d.state !== 'chase') || p.carried <= 0) continue;
      if (hd(p.pos, d.pos) <= RULES.drifter_touch) {
        const amount = Math.min(RULES.drifter_steal, p.carried);
        p.carried -= amount; d.stolen = amount; d.state = 'flee'; d.t = RULES.drifter_flee_ticks;
        emit(g, 'drifter_steal', { drifter_id: d.id, amount, carried: p.carried });
      }
    }
    for (const s of [...g.shades].sort(byId)) {
      if ((s.state !== 'wander' && s.state !== 'chase') || s.evict) continue;
      if (hd(p.pos, s.pos) > TUNING.shade_hit_radius || Math.abs(p.pos[1] - s.pos[1]) > RULES.hit_dy) continue;
      if (p.invuln > 0) continue; // touch during invulnerability does nothing
      p.flames--;
      const dropped = Math.floor(p.carried * TUNING.hit_drop_ratio);
      p.carried -= dropped;
      dropMotes(g, dropped, p.pos);
      p.invuln = RULES.invuln_ticks;
      s.state = 'recoil'; s.t = RULES.recoil_ticks;
      emit(g, 'player_hit', { by: 'shade', flames: p.flames, dropped });
      break;
    }
  }

  // 10. spawns (on the new sim tick T)
  const T = g.simTick;
  if (g.randomMotes && T % RULES.mote_spawn_every === 0 && g.motes.length < RULES.motes_cap) {
    const free = map.motePoints.filter((pt) => !g.motes.some((m) => Math.abs(m.pos[0] - pt[0]) < 1e-6 && Math.abs(m.pos[2] - pt[2]) < 1e-6));
    if (free.length) addMote(g, free[Math.floor(g.rng() * free.length)], 'random', null);
  }
  if (g.randomShades && T >= RULES.shade_first_spawn && (T - RULES.shade_first_spawn) % map.shade_interval_ticks === 0) {
    const n = T === RULES.shade_first_spawn ? 2 : 1;
    for (let i = 0; i < n && g.shades.length < map.shade_max; i++) {
      const valid = map.shadePoints.filter((pt) => hd(pt, p.pos) >= RULES.shade_min_player_dist && !g.lanterns.some((l) => l.lit && hd(pt, l.pos) < TUNING.safe_radius));
      if (!valid.length) break;
      const pt = valid[Math.floor(g.rng() * valid.length)];
      const s = addShade(g, pt, null, 'spawning', RULES.shade_spawning_ticks, false);
      emit(g, 'shade_spawned', { id: s.id });
    }
  }
  if (g.randomDrifters && T % RULES.drifter_every === 0 && g.drifters.filter((d) => d.state !== 'removed').length < RULES.drifter_max) {
    const pt = map.shadePoints[Math.floor(g.rng() * map.shadePoints.length)];
    g.drifters.push({ id: nextId(g.drifters, 'D', g.ids.D), pos: [pt[0], (groundAt(map, pt[0], pt[2]) ?? 0) + RULES.drifter_hover, pt[2]], state: 'idle', stolen: 0, t: 0, heading: g.rng() * Math.PI * 2, turn: RULES.wander_turn_ticks });
  }
  if (g.windEnabled && T % RULES.wind_every === 0) {
    g.wind = { active: RULES.wind_ticks, dir: Math.floor(g.rng() * 360) };
  }

  // 11. win / lose
  if (p.flames <= 0) { p.flames = 0; endGame(g, 'lost', 'no_flames'); }
  else if (timeLeft(g) <= 1e-9) {
    const lit = g.lanterns.filter((l) => l.lit).length;
    if (lit >= winThreshold(g)) endGame(g, 'won', 'dawn_survived');
    else endGame(g, 'lost', 'dawn');
  }
  return g.events;
}

function endGame(g, result, reason) {
  if (result === 'won') {
    const s = TUNING.score;
    for (const l of g.lanterns) if (l.lit) g.score += s.per_lit_at_dawn + Math.floor(l.fuel / FU);
    g.score += g.player.flames * s.per_flame_left;
  }
  g.state = result;
  g.result = { result, reason };
  emit(g, 'game_over', { result, reason });
}

// Wind warning is purely presentational: true during the 2 s before a gust.
export function windWarning(g) {
  if (!g.windEnabled) return false;
  const r = g.simTick % RULES.wind_every;
  return r >= RULES.wind_every - RULES.wind_warn;
}

function movePlayer(g, input, pressed, dt) {
  const p = g.player, map = g.map;
  if (p.fallWait > 0) {
    if (--p.fallWait === 0 && p.flames > 0) {
      p.pos = map.start.slice(); p.vel = [0, 0, 0]; p.grounded = true; p.launch = null; p.dashTicks = 0;
      p.pos[1] = groundAt(map, p.pos[0], p.pos[2]) ?? 0;
      p.invuln = RULES.invuln_ticks;
    }
    return;
  }
  // camera-relative input
  let mx = input.move?.[0] ?? 0, mz = input.move?.[1] ?? 0;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const th = ((input.cam_yaw_deg ?? 0) * Math.PI) / 180;
  const wx = mx * Math.cos(th) + mz * Math.sin(th);
  const wz = -mx * Math.sin(th) + mz * Math.cos(th);
  const wl = Math.hypot(wx, wz);
  if (wl > 1e-9) p.facing = [wx / wl, wz / wl];

  // jump pad (feet on the pad)
  if (p.grounded) {
    for (const pad of map.pads) {
      if (hd(p.pos, pad.pos) <= 1 && Math.abs(p.pos[1] - pad.pos[1]) < 0.05) {
        let dx, dz;
        if (pad.target) { dx = pad.target[0] - pad.pos[0]; dz = pad.target[1] - pad.pos[2]; const l = Math.hypot(dx, dz); dx /= l; dz /= l; }
        else [dx, dz] = pad.dir;
        p.launch = [dx * pad.speed, dz * pad.speed];
        p.vel[1] = pad.vy; p.grounded = false;
        break;
      }
    }
  }
  if (pressed.jump && p.grounded) { p.vel[1] = RULES.jump_velocity; p.grounded = false; }
  if (pressed.dash && p.dashTicks === 0 && (p.dashCd === 0 || p.charm > 0)) {
    p.dashTicks = DASH_TICKS;
    p.dashDir = wl > 1e-9 ? [wx / wl, wz / wl] : p.facing.slice();
    if (p.charm === 0) p.dashCd = DASH_CD;
    emit(g, 'dash', {});
  }

  let hx, hz;
  const dashing = p.dashTicks > 0;
  if (dashing) { hx = p.dashDir[0] * TUNING.dash_speed; hz = p.dashDir[1] * TUNING.dash_speed; p.dashTicks--; }
  else if (p.launch) { [hx, hz] = p.launch; }
  else { const sp = p.charm > 0 ? RULES.charm_speed : TUNING.player_speed; hx = wx * sp; hz = wz * sp; }
  if (g.wind.active > 0) {
    const a = (g.wind.dir * Math.PI) / 180;
    hx += Math.cos(a) * RULES.wind_speed; hz += Math.sin(a) * RULES.wind_speed;
  }

  // horizontal move with cliffs / tower as walls (slide along axes)
  const tryMove = (nx, nz) => {
    const gr = groundAt(map, nx, nz);
    if (gr !== null && gr > p.pos[1] + RULES.step_up) return false;
    if (insideTower(map, nx, nz, p.pos[1])) return false;
    p.pos[0] = nx; p.pos[2] = nz; return true;
  };
  const nx = p.pos[0] + hx * dt, nz = p.pos[2] + hz * dt;
  if (!tryMove(nx, nz)) { tryMove(nx, p.pos[2]) || tryMove(p.pos[0], nz); }

  // vertical
  const gr = groundAt(map, p.pos[0], p.pos[2]);
  if (p.grounded) {
    if (gr === null || gr < p.pos[1] - RULES.step_up) { p.grounded = false; p.vel[1] = 0; }
    else p.pos[1] = gr;
  }
  if (!p.grounded && !dashing) {
    p.vel[1] -= RULES.gravity * dt;
    p.pos[1] += p.vel[1] * dt;
    if (gr !== null && p.vel[1] <= 0 && p.pos[1] <= gr) {
      p.pos[1] = gr; p.vel[1] = 0; p.grounded = true; p.launch = null;
    }
  }
  p.vel[0] = hx; p.vel[2] = hz;
  if (p.grounded) p.vel[1] = 0;

  // fall off the island
  if (p.pos[1] < RULES.fall_y) {
    const lost = p.carried;
    p.carried = 0; p.flames--; p.fallWait = RULES.fall_wait; p.vel = [0, 0, 0]; p.launch = null; p.dashTicks = 0;
    emit(g, 'player_hit', { by: 'fall', flames: Math.max(0, p.flames), dropped: 0, lost });
  }
}

function shadeBlocked(g, x, z) {
  return groundAt(g.map, x, z) === null || insideTower(g.map, x, z, 0);
}

function moveShades(g, dt) {
  const p = g.player, map = g.map;
  const speed = (map.shade_speed ?? SHADE_SPEED_ONLY_N1) * dt;
  for (const s of g.shades) {
    if (s.evict) {
      s.evict.n++;
      const k = s.evict.n / RULES.evict_ticks;
      s.pos[0] = s.evict.from[0] + (s.evict.to[0] - s.evict.from[0]) * k;
      s.pos[2] = s.evict.from[1] + (s.evict.to[1] - s.evict.from[1]) * k;
      if (s.evict.n >= RULES.evict_ticks) s.evict = null;
      followGround(g, s);
      continue;
    }
    let dx = 0, dz = 0;
    const d = hd(s.pos, p.pos);
    if (s.state === 'wander' && targetable(g) && d <= RULES.shade_detect) s.state = 'chase';
    else if (s.state === 'chase' && (!targetable(g) || d > RULES.shade_giveup)) s.state = 'wander';
    else if (s.state === 'drain') {
      const l = g.lanterns.find((x) => x.id === s.target);
      if (targetable(g) && d <= TUNING.safe_radius) { s.state = 'chase'; s.target = null; }
      else if (!l || !l.lit || l.fuel >= FUEL_LOW || hd(s.pos, l.pos) > RULES.drain_reach) { s.state = 'wander'; s.target = null; }
    }

    if (s.state === 'stunned') {
      if (s.push > 0) {
        s.push--;
        const st = TUNING.pulse_push_m / RULES.push_ticks;
        const nx = s.pos[0] + s.pushDir[0] * st, nz = s.pos[2] + s.pushDir[1] * st;
        if (shadeBlocked(g, nx, nz)) s.push = 0; else { s.pos[0] = nx; s.pos[2] = nz; }
      }
    } else if (s.state === 'recoil') {
      const away = d < 1e-9 ? [1, 0] : [(s.pos[0] - p.pos[0]) / d, (s.pos[2] - p.pos[2]) / d];
      dx = away[0] * (RULES.recoil_m / RULES.recoil_ticks); dz = away[1] * (RULES.recoil_m / RULES.recoil_ticks);
    } else if (s.state === 'chase') {
      if (d > 1e-9) { const st = Math.min(speed, d); dx = ((p.pos[0] - s.pos[0]) / d) * st; dz = ((p.pos[2] - s.pos[2]) / d) * st; }
    } else if (s.state === 'wander') {
      // TICKET-03 §2: weak lit lantern (fuel < 30) first, else nearest unlit lantern, else roam
      const weak = nearestBy(g.lanterns, s.pos, (l) => l.lit && l.fuel < FUEL_LOW);
      const goal = weak || nearestBy(g.lanterns, s.pos, (l) => !l.lit);
      if (goal) {
        const gd = hd(s.pos, goal.pos);
        const st = Math.min(weak ? speed : RULES.shade_wander_speed * dt, Math.max(0, gd - RULES.drain_reach * 0.75));
        if (gd > 1e-9) { dx = ((goal.pos[0] - s.pos[0]) / gd) * st; dz = ((goal.pos[2] - s.pos[2]) / gd) * st; }
      } else {
        if (--s.turn <= 0) { s.heading = g.rng() * Math.PI * 2; s.turn = RULES.wander_turn_ticks; }
        const st = RULES.shade_wander_speed * dt;
        dx = Math.cos(s.heading) * st; dz = Math.sin(s.heading) * st;
      }
    }
    if (dx || dz) {
      const nx = s.pos[0] + dx, nz = s.pos[2] + dz;
      if (!shadeBlocked(g, nx, nz)) { s.pos[0] = nx; s.pos[2] = nz; }
      else if (s.state === 'wander') s.turn = 0;
    }
    // lit lanterns: blocked at the 6 m edge
    for (const l of g.lanterns) {
      if (!hasSafeZone(l)) continue;
      const e = hd(s.pos, l.pos);
      if (e < TUNING.safe_radius) {
        let ex = s.pos[0] - l.pos[0], ez = s.pos[2] - l.pos[2];
        if (e < 1e-9) { ex = 1; ez = 0; } else { ex /= e; ez /= e; }
        s.pos[0] = l.pos[0] + ex * (TUNING.safe_radius + 1e-6);
        s.pos[2] = l.pos[2] + ez * (TUNING.safe_radius + 1e-6);
      }
    }
    // arriving within 2 m of a weak lantern -> drain
    if (s.state === 'wander') {
      const weak = nearestBy(g.lanterns, s.pos, (l) => l.lit && l.fuel < FUEL_LOW);
      if (weak && hd(s.pos, weak.pos) <= RULES.drain_reach) { s.state = 'drain'; s.target = weak.id; s.drainTicks = 0; }
    }
    followGround(g, s);
  }
}

function followGround(g, s) {
  const gr = groundAt(g.map, s.pos[0], s.pos[2]);
  if (gr !== null) s.pos[1] = gr + s.hover;
}

function moveDrifters(g, dt) {
  const p = g.player;
  for (const d of g.drifters) {
    if (d.state === 'removed') continue;
    const dist = hd(d.pos, p.pos);
    const wants = targetable(g) && p.carried >= RULES.drifter_chase_carry && dist <= RULES.drifter_detect && d.stolen === 0;
    if (d.state === 'idle' && wants) d.state = 'chase';
    else if (d.state === 'chase' && !wants) d.state = 'idle';
    let dx = 0, dz = 0;
    if (d.state === 'chase' && dist > 1e-9) {
      const st = Math.min(RULES.drifter_speed * dt, dist);
      dx = ((p.pos[0] - d.pos[0]) / dist) * st; dz = ((p.pos[2] - d.pos[2]) / dist) * st;
    } else if (d.state === 'flee') {
      const away = dist < 1e-9 ? [1, 0] : [(d.pos[0] - p.pos[0]) / dist, (d.pos[2] - p.pos[2]) / dist];
      dx = away[0] * RULES.drifter_speed * dt; dz = away[1] * RULES.drifter_speed * dt;
    } else if (d.state === 'idle') {
      if (--d.turn <= 0) { d.heading = g.rng() * Math.PI * 2; d.turn = RULES.wander_turn_ticks; }
      const nx = d.pos[0] + Math.cos(d.heading) * RULES.drifter_idle_speed * dt, nz = d.pos[2] + Math.sin(d.heading) * RULES.drifter_idle_speed * dt;
      if (groundAt(g.map, nx, nz) === null) { d.turn = 0; continue; }
      dx = nx - d.pos[0]; dz = nz - d.pos[2];
    }
    d.pos[0] += dx; d.pos[2] += dz;
  }
}

// ---------------------------------------------------------------- snapshot
export function snapshot(g) {
  const v3 = (q) => [round3(q[0]), round3(q[1]), round3(q[2])];
  const p = g.player;
  return {
    type: 'snapshot',
    tick: g.tick,
    sim_tick: g.simTick,
    night: g.night,
    state: g.state === 'playing' && g.paused ? 'paused' : g.state,
    time_left_s: round3(Math.max(0, timeLeft(g))),
    score: g.score,
    wind: { active: g.wind.active > 0, dir_deg: g.wind.active > 0 ? g.wind.dir : null },
    player: {
      pos: v3(p.pos), vel: v3(p.vel), grounded: p.grounded, flames: p.flames, carried: p.carried, capacity: capacityOf(p),
      invuln: round3(p.invuln / TICK_RATE), dash_cd_s: round3(p.dashCd / TICK_RATE), pulse_cd_s: round3(p.pulseCd / TICK_RATE), charm_s: round3(p.charm / TICK_RATE),
    },
    lanterns: g.lanterns.map((l) => ({ id: l.id, pos: v3(l.pos), lit: l.lit, deposited: l.deposited, fuel: round1(fuelOf(l)), ever_lit: l.everLit, relit_count: l.relits })),
    shades: g.shades.map((s) => ({ id: s.id, pos: v3(s.pos), state: s.state })),
    drifters: g.drifters.map((d) => ({ id: d.id, pos: v3(d.pos), state: d.state, stolen: d.stolen })),
    charms: g.charms.map((c) => ({ id: c.id, pos: v3(c.pos), available: c.available, respawn_s: c.available ? 0 : round3(c.respawn / TICK_RATE) })),
    motes_active: g.motes.length,
    motes: g.motes.map((m) => ({ id: m.id, pos: v3(m.pos), kind: m.kind, ttl_s: m.ttl == null ? null : round3(m.ttl / TICK_RATE) })),
  };
}
