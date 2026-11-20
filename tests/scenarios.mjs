// Headless acceptance scenarios. Each one maps to a PRD-0 / Test Contract requirement.
// Used by tests/scenarios.test.mjs (pass/fail) and tools/proof.mjs (saves real output as evidence).
import { TUNING as T } from '../src/sim.mjs';

const S = T.score;
const off = { random_motes: false, random_shades: false, motes: [], shades: [] };
const ev = (lines, name) => lines.filter((l) => l.type === 'event' && l.name === name);
const snap = (lines, tick) => lines.find((l) => l.type === 'snapshot' && l.tick === tick);
const end = (lines) => lines[lines.length - 1];
const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;

export const SCENARIOS = [
  {
    id: 'R1-move-speed',
    req: 'Player moves at player_speed; move [0,1] at yaw 0 goes +Z',
    scenario: { ...off },
    inputs: { frames: [{ tick: 0, move: [0, 1] }] },
    ticks: 60,
    check: (L) => [
      [near(snap(L, 60).player.pos[2], T.player_speed), `z after 1s = ${snap(L, 60).player.pos[2]}, expected ${T.player_speed}`],
      [near(snap(L, 60).player.pos[0], 0), 'x stays 0'],
    ],
  },
  {
    id: 'R2-camera-yaw-and-normalize',
    req: 'cam_yaw_deg rotates input (yaw 90: [0,1] -> +X); diagonal input is normalized',
    scenario: { ...off },
    inputs: { frames: [{ tick: 0, move: [0, 1], cam_yaw_deg: 90 }, { tick: 60, move: [1, 1], cam_yaw_deg: 0 }] },
    ticks: 120,
    check: (L) => {
      const a = snap(L, 60).player.pos, b = snap(L, 120).player.pos;
      const d = Math.hypot(b[0] - a[0], b[2] - a[2]);
      return [
        [near(a[0], T.player_speed) && near(a[2], 0), `pos after yaw-90 move = ${a}`],
        [near(d, T.player_speed), `diagonal distance in 1s = ${d.toFixed(3)}, expected ${T.player_speed}`],
      ];
    },
  },
  {
    id: 'R3-jump',
    req: 'Jump lifts the player (Y>0) then lands back at Y=0',
    scenario: { ...off },
    inputs: { frames: [{ tick: 0, jump: true }, { tick: 1, jump: false }] },
    ticks: 120, every: 10,
    check: (L) => [
      [snap(L, 20).player.pos[1] > 0.5, `y at tick 20 = ${snap(L, 20).player.pos[1]}`],
      [snap(L, 120).player.pos[1] === 0, 'landed at y=0'],
    ],
  },
  {
    id: 'R4-pickup-radius',
    req: 'Mote picked exactly when within pickup_radius; +per_mote score',
    scenario: { ...off, motes: [[0, 0, 5]] },
    inputs: { frames: [{ tick: 0, move: [0, 1] }] },
    ticks: 60,
    check: (L) => {
      const p = ev(L, 'mote_picked');
      // player moves 0.1 m/tick; distance <= pickup_radius first at z = 5 - r
      const expectTick = Math.round(((5 - T.pickup_radius) / T.player_speed) * 60);
      return [
        [p.length === 1 && p[0].data.carried === 1, 'one mote_picked with carried 1'],
        [Math.abs(p[0].tick - expectTick) <= 1, `picked at tick ${p[0].tick}, expected ~${expectTick}`],
        [snap(L, 60).score === S.per_mote && snap(L, 60).motes_active === 0, 'score and motes_active updated'],
      ];
    },
  },
  {
    id: 'R5-carry-capacity',
    req: 'Cannot carry more than carry_capacity motes',
    scenario: { ...off, player: { carried: T.carry_capacity - 1 }, motes: [[0, 0, 0.5], [0, 0, 0.6]] },
    ticks: 10,
    check: (L) => [
      [ev(L, 'mote_picked').length === 1, 'only one picked'],
      [snap(L, 10).player.carried === T.carry_capacity && snap(L, 10).motes_active === 1, 'carried capped, one mote left'],
    ],
  },
  {
    id: 'R6-deposit-and-light',
    req: 'Interact within interact_radius deposits; lantern lights at lantern_cost; +per_lantern',
    scenario: { ...off, player: { carried: T.lantern_cost + 2 }, lanterns: [{ id: 'L1', pos: [0, 0, T.interact_radius] }] },
    inputs: { frames: [{ tick: 0, interact: true }, { tick: 1, interact: false }] },
    ticks: 10,
    check: (L) => {
      const d = ev(L, 'deposit')[0], lit = ev(L, 'lantern_lit')[0];
      return [
        [d && d.tick === 1 && d.data.lantern_id === 'L1' && d.data.amount === T.lantern_cost && d.data.deposited === T.lantern_cost, `deposit event ${JSON.stringify(d)}`],
        [lit && lit.data.lantern_id === 'L1', 'lantern_lit L1'],
        [snap(L, 10).player.carried === 2 && snap(L, 10).score === S.per_lantern, 'leftover carried 2, score per_lantern'],
      ];
    },
  },
  {
    id: 'R7-partial-deposit-out-of-range',
    req: 'Partial deposit accumulates; no deposit beyond interact_radius',
    scenario: { ...off, player: { carried: 2 }, lanterns: [{ id: 'L1', pos: [0, 0, 2] }, { id: 'L2', pos: [0, 0, -(T.interact_radius + 0.5)] }] },
    inputs: { frames: [{ tick: 0, interact: true }, { tick: 1, interact: false }] },
    ticks: 5,
    check: (L) => [
      [ev(L, 'deposit').length === 1 && ev(L, 'deposit')[0].data.deposited === 2, 'one partial deposit into L1'],
      [ev(L, 'lantern_lit').length === 0, 'not lit yet'],
    ],
  },
  {
    id: 'R8-win-all-lit',
    req: 'Lighting the last lantern wins (all_lit) with time + flame bonus',
    scenario: { ...off, player: { carried: T.lantern_cost }, lanterns: [
      { id: 'L1', lit: true }, { id: 'L2', lit: true }, { id: 'L3', lit: true }, { id: 'L4', lit: true }, { id: 'L5', pos: [0, 0, 1] }] },
    inputs: { frames: [{ tick: 0, interact: true }] },
    ticks: 100,
    check: (L) => {
      const go = ev(L, 'game_over')[0];
      const expected = S.per_lantern + Math.floor(T.night1_duration_s - 1 / 60) * S.per_second_left + T.flames * S.per_flame_left;
      return [
        [go && go.tick === 1 && go.data.result === 'won' && go.data.reason === 'all_lit', `game_over ${JSON.stringify(go)}`],
        [end(L).state === 'won' && end(L).ticks === 1 && end(L).score === expected, `end ${JSON.stringify(end(L))}, expected score ${expected}`],
        [ev(L, 'lantern_lit').length === 1, 'pre-lit lanterns gave no events/score'],
      ];
    },
  },
  {
    id: 'R9-pulse',
    req: 'Pulse costs pulse_cost, stuns shades in pulse_radius, pushes pulse_push_m, +per_stun; cooldown',
    scenario: { ...off, player: { carried: 3 }, shades: [{ id: 'A', pos: [T.pulse_radius, 1, 0] }, { id: 'B', pos: [T.pulse_radius + 0.5, 1, 0] }] },
    inputs: { frames: [{ tick: 0, pulse: true }, { tick: 1, pulse: false }, { tick: 2, pulse: true }, { tick: 3, pulse: false }] },
    ticks: 10, every: 1,
    check: (L) => {
      const p = ev(L, 'pulse');
      const a = snap(L, 1).shades.find((s) => s.id === 'A');
      return [
        [p.length === 1 && JSON.stringify(p[0].data.stunned_ids) === '["A"]', `pulse events ${JSON.stringify(p)} (second press blocked by cooldown)`],
        [a.state === 'stunned' && near(a.pos[0], T.pulse_radius + T.pulse_push_m), `A after pulse ${JSON.stringify(a)}`],
        [snap(L, 1).player.carried === 3 - T.pulse_cost && snap(L, 1).score === S.per_stun, 'cost and score'],
      ];
    },
  },
  {
    id: 'R10-pulse-needs-light',
    req: 'Pulse with less than pulse_cost carried does nothing',
    scenario: { ...off, player: { carried: 0 }, shades: [{ pos: [3, 1, 0] }] },
    inputs: { frames: [{ tick: 0, pulse: true }] },
    ticks: 5,
    check: (L) => [[ev(L, 'pulse').length === 0, 'no pulse event']],
  },
  {
    id: 'R11-stun-duration',
    req: 'Stunned shade stays still for pulse_stun_s then chases again',
    scenario: { ...off, player: { carried: 1 }, shades: [{ id: 'A', pos: [2, 1, 0] }] },
    inputs: { frames: [{ tick: 0, pulse: true }] },
    ticks: Math.round(T.pulse_stun_s * 60) + 20, every: 1,
    check: (L) => {
      const n = Math.round(T.pulse_stun_s * 60);
      const s1 = snap(L, 1).shades[0], s2 = snap(L, n - 1).shades[0], s3 = snap(L, n + 10).shades[0];
      return [
        [s2.state === 'stunned' && s2.pos[0] === s1.pos[0], 'still stunned and not moving before stun ends'],
        [s3.state !== 'stunned' && s3.pos[0] < s1.pos[0], `chasing again after stun: ${JSON.stringify(s3)}`],
      ];
    },
  },
  {
    id: 'R12-shade-chase-and-hit',
    req: 'Shade chases at shade_speed; contact within shade_hit_radius costs a flame and drops hit_drop_ratio of carried; invuln_s',
    scenario: { ...off, player: { carried: 4 }, shades: [{ id: 'S1', pos: [5, 1, 0] }] },
    ticks: 300,
    check: (L) => {
      const h = ev(L, 'player_hit');
      const firstTick = Math.ceil(((5 - T.shade_hit_radius) / T.shade_speed) * 60);
      return [
        [h.length >= 2, `hits: ${h.length}`],
        [Math.abs(h[0].tick - firstTick) <= 1, `first hit tick ${h[0].tick}, expected ~${firstTick}`],
        [h[0].data.by === 'shade' && h[0].data.flames === T.flames - 1 && h[0].data.dropped === Math.floor(4 * T.hit_drop_ratio), `hit data ${JSON.stringify(h[0].data)}`],
        [h[1].tick - h[0].tick === Math.round(T.invuln_s * 60), `gap between hits ${h[1].tick - h[0].tick} = invuln`],
      ];
    },
  },
  {
    id: 'R13-lose-no-flames',
    req: 'Losing the last flame ends the game: lost/no_flames',
    scenario: { ...off, player: { flames: 1 }, shades: [{ pos: [0.5, 1, 0] }] },
    ticks: 100,
    check: (L) => {
      const go = ev(L, 'game_over')[0];
      return [
        [go && go.tick === 1 && go.data.result === 'lost' && go.data.reason === 'no_flames', JSON.stringify(go)],
        [end(L).state === 'lost' && end(L).ticks === 1, `stops at game over: ${JSON.stringify(end(L))}`],
      ];
    },
  },
  {
    id: 'R14-dawn',
    req: 'When time runs out the night is lost: lost/dawn',
    scenario: { ...off, time_left_s: 2 },
    ticks: 500,
    check: (L) => {
      const go = ev(L, 'game_over')[0];
      return [
        [go && go.tick === 120 && go.data.reason === 'dawn' && go.data.result === 'lost', JSON.stringify(go)],
        [end(L).ticks === 120 && end(L).state === 'lost', JSON.stringify(end(L))],
      ];
    },
  },
  {
    id: 'R15-safe-radius',
    req: 'Shades cannot enter safe_radius of a lit lantern (player standing at lantern is safe)',
    scenario: { ...off, player: { pos: [0, 0, 20] }, shades: [{ id: 'S1', pos: [0, 1, 10] }], lanterns: [{ id: 'L1', pos: [0, 0, 20], lit: true }] },
    ticks: 600, every: 10,
    check: (L) => {
      let minD = Infinity;
      for (const s of L.filter((l) => l.type === 'snapshot')) minD = Math.min(minD, Math.hypot(s.shades[0].pos[0], s.shades[0].pos[2] - 20));
      return [
        [minD >= T.safe_radius, `closest shade distance to lit lantern ${minD.toFixed(3)} >= ${T.safe_radius}`],
        [ev(L, 'player_hit').length === 0, 'no hits'],
      ];
    },
  },
  {
    id: 'R16-random-spawn',
    req: 'Default night: random motes/shades exist; shades spawn over time with shade_spawned',
    // player waits safely at lit L1 (default position) so the night lasts long enough to see spawns
    scenario: { player: { pos: [0, 0, 22] }, lanterns: [{ id: 'L1', lit: true }] },
    ticks: 60 * 65, every: 60,
    check: (L) => {
      const s0 = snap(L, 0);
      const sp = ev(L, 'shade_spawned');
      return [
        [s0.motes_active > 0 && s0.shades.length > 0 && s0.lanterns.length === T.lantern_count_night1, 'initial world populated'],
        [sp.length >= 1 && sp[0].data.id === `S${s0.shades.length + 1}`, `spawned ${JSON.stringify(sp.map((e) => e.data.id))}`],
      ];
    },
  },
];
