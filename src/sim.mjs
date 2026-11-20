// Pure, deterministic game logic for Đảo Đèn Lồng.
// No DOM, no Math.random, no wall clock. Shared by the browser game and headless runner.

export const TICK_RATE = 60;

export const TUNING = Object.freeze({
  player_speed: 6,
  carry_capacity: 10,
  lantern_cost: 5,
  lantern_count_night1: 5,
  pickup_radius: 1.0,
  interact_radius: 2.5,
  pulse_cost: 1,
  pulse_radius: 6,
  night1_duration_s: 300,
  flames: 3,
  invuln_s: 1.5,
  hit_drop_ratio: 0.5,
  pulse_stun_s: 3,
  pulse_push_m: 4,
  pulse_cooldown_s: 1,
  safe_radius: 4,
  shade_speed: 3.5,
  shade_hit_radius: 1.0,
  fall_enabled: false,
  score: { per_mote: 10, per_lantern: 100, per_stun: 25, per_second_left: 1, per_flame_left: 50 },
});

// Values that are not part of the contract tuning but are fixed game rules.
export const RULES = Object.freeze({
  island_radius: 40,          // player cannot leave this circle (no falling)
  lantern_ring_radius: 22,    // default lantern layout: pentagon, L1 at +Z
  jump_velocity: 7,           // m/s
  gravity: 20,                // m/s^2
  initial_motes: 40,
  mote_min_r: 3, mote_max_r: 37,
  mote_respawn_below: 15,     // respawn when fewer active motes than this
  mote_respawn_every_s: 2,
  initial_shades: 2,
  shade_spawn_ring: 32,
  shade_spawn_every_s: 30,
  shade_max: 6,
  shade_y: 1.0,
});

// mulberry32: small seeded PRNG, identical in every JS engine.
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

const secToTicks = (s) => Math.round(s * TICK_RATE);
const dist2 = (a, b) => { const dx = a[0] - b[0], dz = a[2] - b[2]; return Math.hypot(dx, dz); };

export function defaultLanterns() {
  const out = [];
  for (let i = 0; i < TUNING.lantern_count_night1; i++) {
    const ang = (i * 2 * Math.PI) / TUNING.lantern_count_night1;
    const r = RULES.lantern_ring_radius;
    out.push({ id: `L${i + 1}`, pos: [round3(r * Math.sin(ang)), 0, round3(r * Math.cos(ang))], deposited: 0, lit: false });
  }
  return out;
}

export function round3(v) {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
}

// Build a game. `scenario` is an already validated object (or null).
export function createGame({ seed = 0, scenario = null } = {}) {
  const sc = scenario || {};
  const g = {
    rng: makeRng(seed),
    steps: 0,
    state: 'playing',
    result: null,
    score: 0,
    baseTime: sc.time_left_s ?? TUNING.night1_duration_s,
    player: { pos: [0, 0, 0], vy: 0, grounded: true, flames: TUNING.flames, carried: 0, invuln: 0, pulseCd: 0 },
    lanterns: defaultLanterns(),
    motes: [],
    shades: [],
    nextMoteId: 1,
    nextShadeId: 1,
    randomMotes: sc.random_motes ?? true,
    randomShades: sc.random_shades ?? true,
    moteTimer: 0,
    shadeTimer: 0,
    prevButtons: { jump: false, interact: false, pulse: false },
    events: [],
  };

  if (sc.player) {
    if (sc.player.pos) g.player.pos = sc.player.pos.slice(0, 3).map(Number);
    if (sc.player.carried != null) g.player.carried = sc.player.carried;
    if (sc.player.flames != null) g.player.flames = sc.player.flames;
    g.player.grounded = g.player.pos[1] <= 0;
  }
  if (sc.lanterns) {
    for (const l of sc.lanterns) {
      const target = g.lanterns.find((x) => x.id === l.id);
      if (!target) continue;
      if (l.pos) target.pos = l.pos.slice(0, 3).map(Number);
      if (l.deposited != null) target.deposited = l.deposited;
      if (l.lit != null) target.lit = !!l.lit;
    }
  }

  if (sc.motes) {
    for (const m of sc.motes) addMote(g, [m[0], 0, m[2]]);
  } else if (g.randomMotes) {
    for (let i = 0; i < RULES.initial_motes; i++) addMote(g, randomMotePos(g));
  }

  if (sc.shades) {
    for (const s of sc.shades) addShade(g, s.pos.slice(0, 3).map(Number), s.id);
  } else if (g.randomShades) {
    for (let i = 0; i < RULES.initial_shades; i++) addShade(g, randomShadePos(g));
  }
  return g;
}

function addMote(g, pos) {
  g.motes.push({ id: `M${g.nextMoteId++}`, pos: [pos[0], 0, pos[2]] });
}

function addShade(g, pos, id) {
  if (!id) {
    // skip ids already used by scenario-provided shades
    do { id = `S${g.nextShadeId++}`; } while (g.shades.some((s) => s.id === id));
  }
  const shade = { id, pos: [pos[0], pos[1] ?? RULES.shade_y, pos[2]], state: 'chase', stun: 0 };
  g.shades.push(shade);
  return shade;
}

function randomMotePos(g) {
  for (let tries = 0; tries < 20; tries++) {
    const ang = g.rng() * Math.PI * 2;
    const r = RULES.mote_min_r + Math.sqrt(g.rng()) * (RULES.mote_max_r - RULES.mote_min_r);
    const p = [r * Math.cos(ang), 0, r * Math.sin(ang)];
    if (g.lanterns.every((l) => dist2(l.pos, p) > 1.5)) return p;
  }
  return [RULES.mote_min_r, 0, 0];
}

function randomShadePos(g) {
  const ang = g.rng() * Math.PI * 2;
  const r = RULES.shade_spawn_ring;
  return [r * Math.cos(ang), RULES.shade_y, r * Math.sin(ang)];
}

export function timeLeft(g) {
  return g.baseTime - g.steps / TICK_RATE;
}

function emit(g, name, data) {
  g.events.push({ type: 'event', tick: g.steps + 1, name, data });
}

function endGame(g, result, reason) {
  if (g.state !== 'playing') return;
  if (result === 'won') {
    const s = TUNING.score;
    // steps already incremented by the caller before endGame runs at end of a step
    g.score += Math.max(0, Math.floor(timeLeftAfterStep(g))) * s.per_second_left + g.player.flames * s.per_flame_left;
  }
  g.state = result;
  g.result = { result, reason };
  emit(g, 'game_over', { result, reason });
}

// During a step, `steps` is still k; the state being produced is k+1.
const timeLeftAfterStep = (g) => g.baseTime - (g.steps + 1) / TICK_RATE;

// input: { move:[x,z], cam_yaw_deg, jump, interact, pulse }
// Advances exactly one tick. Returns events emitted in this step.
export function step(g, input) {
  g.events = [];
  if (g.state !== 'playing') return g.events;
  const dt = 1 / TICK_RATE;
  const p = g.player;
  const pressed = (k) => !!input[k] && !g.prevButtons[k];

  // 1. Movement (camera-relative, normalized if longer than 1)
  let mx = input.move?.[0] ?? 0, mz = input.move?.[1] ?? 0;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const th = ((input.cam_yaw_deg ?? 0) * Math.PI) / 180;
  const wx = mx * Math.cos(th) + mz * Math.sin(th);
  const wz = -mx * Math.sin(th) + mz * Math.cos(th);
  p.pos[0] += wx * TUNING.player_speed * dt;
  p.pos[2] += wz * TUNING.player_speed * dt;
  const r = Math.hypot(p.pos[0], p.pos[2]);
  if (r > RULES.island_radius) {
    p.pos[0] *= RULES.island_radius / r;
    p.pos[2] *= RULES.island_radius / r;
  }

  // 2. Jump (vertical only; does not change horizontal distances)
  if (pressed('jump') && p.grounded) { p.vy = RULES.jump_velocity; p.grounded = false; }
  if (!p.grounded) {
    p.vy -= RULES.gravity * dt;
    p.pos[1] += p.vy * dt;
    if (p.pos[1] <= 0) { p.pos[1] = 0; p.vy = 0; p.grounded = true; }
  }

  // 3. Pick up motes (list order, until full)
  if (p.carried < TUNING.carry_capacity) {
    const keep = [];
    for (const m of g.motes) {
      if (p.carried < TUNING.carry_capacity && dist2(p.pos, m.pos) <= TUNING.pickup_radius) {
        p.carried++;
        g.score += TUNING.score.per_mote;
        emit(g, 'mote_picked', { carried: p.carried });
      } else keep.push(m);
    }
    g.motes = keep;
  }

  // 4. Interact: deposit into the nearest unlit lantern in range
  if (pressed('interact') && p.carried > 0) {
    let best = null, bestD = Infinity;
    for (const l of g.lanterns) {
      if (l.lit) continue;
      const d = dist2(p.pos, l.pos);
      if (d <= TUNING.interact_radius && d < bestD) { best = l; bestD = d; }
    }
    if (best) {
      const amount = Math.min(p.carried, TUNING.lantern_cost - best.deposited);
      if (amount > 0) {
        p.carried -= amount;
        best.deposited += amount;
        emit(g, 'deposit', { lantern_id: best.id, amount, deposited: best.deposited });
        if (best.deposited >= TUNING.lantern_cost) {
          best.lit = true;
          g.score += TUNING.score.per_lantern;
          emit(g, 'lantern_lit', { lantern_id: best.id });
          if (g.lanterns.every((l) => l.lit)) { endGame(g, 'won', 'all_lit'); finishStep(g, input); return g.events; }
        }
      }
    }
  }

  // 5. Pulse: costs carried light, stuns + pushes shades in radius
  if (p.pulseCd > 0) p.pulseCd--;
  if (pressed('pulse') && p.pulseCd === 0 && p.carried >= TUNING.pulse_cost) {
    p.carried -= TUNING.pulse_cost;
    p.pulseCd = secToTicks(TUNING.pulse_cooldown_s);
    const ids = [];
    for (const s of g.shades) {
      const d = dist2(p.pos, s.pos);
      if (d <= TUNING.pulse_radius) {
        ids.push(s.id);
        s.state = 'stunned';
        s.stun = secToTicks(TUNING.pulse_stun_s);
        let dx = s.pos[0] - p.pos[0], dz = s.pos[2] - p.pos[2];
        const dl = Math.hypot(dx, dz);
        if (dl < 1e-9) { dx = 1; dz = 0; } else { dx /= dl; dz /= dl; }
        s.pos[0] += dx * TUNING.pulse_push_m;
        s.pos[2] += dz * TUNING.pulse_push_m;
      }
    }
    g.score += ids.length * TUNING.score.per_stun;
    emit(g, 'pulse', { stunned_ids: ids });
  }

  // 6. Shades: stun timers, chase, keep out of lit-lantern safe zones
  const sp = TUNING.shade_speed * dt;
  for (const s of g.shades) {
    if (s.stun > 0) {
      s.stun--;
      if (s.stun === 0) s.state = 'chase';
      continue;
    }
    let dx = p.pos[0] - s.pos[0], dz = p.pos[2] - s.pos[2];
    const dl = Math.hypot(dx, dz);
    if (dl > 1e-9) {
      const stepLen = Math.min(sp, dl);
      s.pos[0] += (dx / dl) * stepLen;
      s.pos[2] += (dz / dl) * stepLen;
    }
    s.state = 'chase';
    for (const l of g.lanterns) {
      if (!l.lit) continue;
      let ex = s.pos[0] - l.pos[0], ez = s.pos[2] - l.pos[2];
      const el = Math.hypot(ex, ez);
      if (el < TUNING.safe_radius) {
        if (el < 1e-9) { ex = 1; ez = 0; } else { ex /= el; ez /= el; }
        // push to just outside the boundary so the strict "cannot enter" holds after rounding
        const rr = TUNING.safe_radius + 1e-3;
        s.pos[0] = l.pos[0] + ex * rr;
        s.pos[2] = l.pos[2] + ez * rr;
        s.state = 'blocked';
      }
    }
  }

  // 7. Shade contact
  if (p.invuln > 0) p.invuln--;
  if (p.invuln === 0) {
    for (const s of g.shades) {
      if (s.stun > 0) continue;
      if (dist2(p.pos, s.pos) <= TUNING.shade_hit_radius) {
        p.flames--;
        const dropped = Math.floor(p.carried * TUNING.hit_drop_ratio);
        p.carried -= dropped;
        p.invuln = secToTicks(TUNING.invuln_s);
        emit(g, 'player_hit', { by: 'shade', flames: p.flames, dropped });
        if (p.flames <= 0) { p.flames = 0; endGame(g, 'lost', 'no_flames'); finishStep(g, input); return g.events; }
        break;
      }
    }
  }

  // 8. Spawning (only when random spawning is on)
  if (g.randomMotes) {
    if (g.motes.length < RULES.mote_respawn_below) {
      g.moteTimer++;
      if (g.moteTimer >= secToTicks(RULES.mote_respawn_every_s)) { g.moteTimer = 0; addMote(g, randomMotePos(g)); }
    } else g.moteTimer = 0;
  }
  if (g.randomShades && g.shades.length < RULES.shade_max) {
    g.shadeTimer++;
    if (g.shadeTimer >= secToTicks(RULES.shade_spawn_every_s)) {
      g.shadeTimer = 0;
      const s = addShade(g, randomShadePos(g));
      emit(g, 'shade_spawned', { id: s.id });
    }
  }

  // 9. Dawn
  if (timeLeftAfterStep(g) <= 1e-9) endGame(g, 'lost', 'dawn');
  finishStep(g, input);
  return g.events;
}

function finishStep(g, input) {
  g.prevButtons = { jump: !!input.jump, interact: !!input.interact, pulse: !!input.pulse };
  g.steps++;
}

export function snapshot(g) {
  const v3 = (p) => [round3(p[0]), round3(p[1]), round3(p[2])];
  return {
    type: 'snapshot',
    tick: g.steps,
    sim_tick: g.steps,
    state: g.state,
    time_left_s: round3(Math.max(0, timeLeft(g))),
    score: g.score,
    player: { pos: v3(g.player.pos), flames: g.player.flames, carried: g.player.carried },
    lanterns: g.lanterns.map((l) => ({ id: l.id, pos: v3(l.pos), lit: l.lit, deposited: l.deposited })),
    shades: g.shades.map((s) => ({ id: s.id, pos: v3(s.pos), state: s.state })),
    motes_active: g.motes.length,
    motes: g.motes.map((m) => ({ id: m.id, pos: v3(m.pos) })),
  };
}
