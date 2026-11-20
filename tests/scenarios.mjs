// Headless acceptance scenarios. Each maps to a PRD-0 / TICKET-02 requirement.
// Shared by tests/scenarios.test.mjs (pass/fail) and tools/proof.mjs (saves real CLI output as evidence).
// Phase 2 changes to Phase 1 scenarios are listed in docs/notes/phase-2.md §4 with reasons.
import { TUNING as T, RULES } from '../src/sim.mjs';

const S = T.score;
const off = { random_motes: false, random_shades: false, random_drifters: false, wind_enabled: false, motes: [], shades: [], drifters: [], charms: [] };
const ev = (L, name) => L.filter((l) => l.type === 'event' && l.name === name);
const snap = (L, tick) => L.find((l) => l.type === 'snapshot' && l.tick === tick);
const end = (L) => L[L.length - 1];
const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;
const hd = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const allLitBut = (last, pos) => [1, 2, 3, 4].map((i) => ({ id: `L${i}`, lit: true })).concat([{ id: last, pos }]);

export const SCENARIOS = [
  // ---------------- Phase 1 requirements, re-checked with the standard numbers
  {
    id: 'R1-move-speed', req: 'Player runs at 6 m/s; move [0,1] at yaw 0 goes +Z',
    scenario: { ...off }, inputs: { frames: [{ tick: 0, move: [0, 1] }] }, ticks: 60,
    check: (L) => [[near(snap(L, 60).player.pos[2], T.player_speed) && near(snap(L, 60).player.pos[0], 0), `pos after 1 s = ${snap(L, 60).player.pos}`],
      [near(snap(L, 60).player.vel[2], 6), `vel = ${snap(L, 60).player.vel}`]],
  },
  {
    id: 'R2-camera-yaw-and-normalize', req: 'cam_yaw_deg rotates input (yaw 90: [0,1] -> +X); diagonal input normalized',
    scenario: { ...off }, inputs: { frames: [{ tick: 0, move: [0, 1], cam_yaw_deg: 90 }, { tick: 60, move: [1, 1], cam_yaw_deg: 0 }] }, ticks: 120,
    check: (L) => {
      const a = snap(L, 60).player.pos, b = snap(L, 120).player.pos;
      return [[near(a[0], 6) && near(a[2], 0), `yaw-90 pos ${a}`], [near(Math.hypot(b[0] - a[0], b[2] - a[2]), 6), 'diagonal distance 6 m in 1 s']];
    },
  },
  {
    id: 'R3-jump', req: 'Jump 7 m/s, gravity 20: apex ~1.225 m, lands after ~0.7 s; only from the ground',
    scenario: { ...off }, inputs: { frames: [{ tick: 0, jump: true }, { tick: 1, jump: false }, { tick: 10, jump: true }] }, ticks: 120, every: 1,
    check: (L) => {
      const maxY = Math.max(...L.filter((l) => l.type === 'snapshot').map((s) => s.player.pos[1]));
      const land = L.find((l) => l.type === 'snapshot' && l.tick > 0 && l.player.grounded)?.tick;
      return [[maxY > 1.15 && maxY <= 1.226, `apex ${maxY}`], [land >= 41 && land <= 44, `landed at tick ${land}`], [snap(L, 120).player.pos[1] === 0, 'no double jump, back on ground']];
    },
  },
  {
    id: 'R4-pickup-radius', req: 'Mote picked when XZ <= 1.0 (no score for picking up in v1.1)',
    scenario: { ...off, motes: [[0, 0, 5]] }, inputs: { frames: [{ tick: 0, move: [0, 1] }] }, ticks: 60,
    check: (L) => {
      const p = ev(L, 'mote_picked');
      return [[p.length === 1 && p[0].data.carried === 1, 'one mote_picked'], [Math.abs(p[0].tick - 40) <= 1, `picked at tick ${p[0].tick}, expected ~40`],
        [snap(L, 60).score === 0 && snap(L, 60).motes_active === 0, 'score 0, no motes left']];
    },
  },
  {
    id: 'R5-carry-capacity', req: 'Cannot carry more than 10 motes',
    scenario: { ...off, player: { carried: 9 }, motes: [[0, 0, 0.5], [0, 0, 0.6]] }, ticks: 10,
    check: (L) => [[ev(L, 'mote_picked').length === 1, 'only one picked'], [snap(L, 10).player.carried === 10 && snap(L, 10).motes_active === 1, 'capped at 10']],
  },
  {
    id: 'R6-deposit-and-light', req: 'Interact within 2.0 m deposits; lantern lights at 10; +10 per mote deposited, +100 per lantern',
    scenario: { ...off, player: { carried: 10 }, lanterns: [{ id: 'L1', pos: [0, 0, 2] }] },
    inputs: { frames: [{ tick: 0, interact: true }, { tick: 1, interact: false }] }, ticks: 10,
    check: (L) => {
      const d = ev(L, 'deposit')[0];
      return [[d && d.tick === 1 && d.data.amount === 10 && d.data.deposited === 10, JSON.stringify(d)], [ev(L, 'lantern_lit')[0]?.data.lantern_id === 'L1', 'L1 lit'],
        [snap(L, 10).score === 10 * S.per_mote + S.per_lantern && snap(L, 10).player.carried === 0, `score ${snap(L, 10).score}`]];
    },
  },
  {
    id: 'R7-partial-deposit-out-of-range', req: 'Partial deposits are remembered; nothing beyond 2.0 m',
    scenario: { ...off, player: { carried: 2 }, lanterns: [{ id: 'L1', pos: [0, 0, 2] }, { id: 'L2', pos: [0, 0, -2.1] }] },
    inputs: { frames: [{ tick: 0, interact: true }, { tick: 1, interact: false }] }, ticks: 5, every: 5,
    check: (L) => [[ev(L, 'deposit').length === 1 && ev(L, 'deposit')[0].data.deposited === 2 && ev(L, 'deposit')[0].data.lantern_id === 'L1', 'one partial deposit into L1'],
      [ev(L, 'lantern_lit').length === 0 && snap(L, 5).score === 20, 'not lit, +20']],
  },
  {
    id: 'R8-win-all-lit', req: 'Lighting the last lantern wins with floor(seconds left)*2 + 50 per flame; pre-lit lanterns give nothing',
    scenario: { ...off, player: { carried: 10 }, lanterns: allLitBut('L5', [0, 0, 1]) }, inputs: { frames: [{ tick: 0, interact: true }] }, ticks: 100,
    check: (L) => {
      const expected = 100 + 100 + Math.floor(300 - 1 / 60) * 2 + 3 * 50;
      const go = ev(L, 'game_over')[0];
      return [[go?.tick === 1 && go.data.result === 'won' && go.data.reason === 'all_lit', JSON.stringify(go)], [end(L).score === expected && end(L).ticks === 1, `end ${JSON.stringify(end(L))}, expected ${expected}`]];
    },
  },
  {
    id: 'R9-pulse', req: 'Pulse: cost 3, 3D radius 5 from feet+0.8, stun, 4 m push over 15 ticks, +5 per shade, cooldown 3 s',
    scenario: { ...off, player: { carried: 5 }, shades: [{ id: 'A', pos: [4.9, 0.8, 0] }, { id: 'B', pos: [-5.1, 0.8, 0] }] },
    inputs: { frames: [{ tick: 0, pulse: true }, { tick: 1, pulse: false }, { tick: 2, pulse: true }] }, ticks: 20, every: 1,
    check: (L) => {
      const p = ev(L, 'pulse'), a15 = snap(L, 15).shades.find((s) => s.id === 'A'), a20 = snap(L, 20).shades.find((s) => s.id === 'A');
      return [[p.length === 1 && JSON.stringify(p[0].data.stunned_ids) === '["A"]', `pulses ${JSON.stringify(p)}`],
        [a15.state === 'stunned' && near(a15.pos[0], 8.9) && near(a20.pos[0], 8.9), `A pushed 4 m in 15 ticks then stops: ${a15.pos} / ${a20.pos}`],
        [snap(L, 1).player.carried === 2 && snap(L, 1).score === 5 && near(snap(L, 1).player.pulse_cd_s, 3), 'cost, score, cooldown']];
    },
  },
  {
    id: 'R10-pulse-needs-light', req: 'Pulse with fewer than 3 carried does nothing',
    scenario: { ...off, player: { carried: 2 }, shades: [{ pos: [3, 1, 0] }] }, inputs: { frames: [{ tick: 0, pulse: true }] }, ticks: 5, every: 5,
    check: (L) => [[ev(L, 'pulse').length === 0 && snap(L, 5).player.carried === 2, 'no pulse']],
  },
  {
    id: 'R11-stun-duration', req: 'Stun lasts 120 ticks; re-pulse refreshes stun; then the shade chases again',
    scenario: { ...off, player: { carried: 6 }, shades: [{ id: 'A', pos: [2, 1, 0] }] },
    inputs: { frames: [{ tick: 0, pulse: true }, { tick: 1, pulse: false }, { tick: 180, pulse: true }] }, ticks: 320, every: 1,
    check: (L) => {
      const s119 = snap(L, 119).shades[0], s121 = snap(L, 121).shades[0], s200 = snap(L, 200).shades[0];
      return [[s119.state === 'stunned' && near(s119.pos[0], 6), `stunned at 119 ${JSON.stringify(s119)}`], [s121.state === 'chase' && s121.pos[0] < 6, `chasing at 121 ${JSON.stringify(s121)}`],
        [ev(L, 'pulse').length === 2 && s200.state === 'stunned', 'second pulse stuns again']];
    },
  },
  {
    id: 'R12-shade-chase-hit-recoil', req: 'Shade chases at 4 m/s; hit: -1 flame, drop floor(carried/2) on a 1.5-2.5 m ring (TTL 8 s), recoil 2 m / 60 ticks, invuln 90',
    scenario: { ...off, player: { carried: 4 }, shades: [{ id: 'S1', pos: [5, 1, 0] }] }, ticks: 300,
    check: (L) => {
      const h = ev(L, 'player_hit'), s70 = snap(L, 70), drops = s70.motes.filter((m) => m.kind === 'dropped');
      return [[h.length >= 2 && Math.abs(h[0].tick - 60) <= 1, `first hit tick ${h[0]?.tick}`], [h[0].data.flames === 2 && h[0].data.dropped === 2 && h[0].data.by === 'shade', JSON.stringify(h[0].data)],
        [drops.length === 2 && drops.every((m) => hd(m.pos, [0, 0, 0]) >= 1.5 - 1e-3 && hd(m.pos, [0, 0, 0]) <= 2.5 + 1e-3 && m.ttl_s > 7.7), `dropped motes ${JSON.stringify(drops)}`],
        [s70.shades[0].state === 'recoil' && near(s70.player.invuln, (90 - 10) / 60), `recoil + invuln ${JSON.stringify(s70.shades[0])} ${s70.player.invuln}`],
        [h[1].tick - h[0].tick >= 90, `gap ${h[1].tick - h[0].tick} >= 90`]];
    },
  },
  {
    id: 'R13-lose-no-flames', req: 'Losing the last flame ends the game: lost/no_flames',
    scenario: { ...off, player: { flames: 1 }, shades: [{ pos: [0.5, 1, 0] }] }, ticks: 100,
    check: (L) => [[ev(L, 'game_over')[0]?.data.reason === 'no_flames' && end(L).state === 'lost' && end(L).ticks === 1, JSON.stringify(end(L))]],
  },
  {
    id: 'R14-dawn', req: 'Time out = lost/dawn',
    scenario: { ...off, time_left_s: 2 }, ticks: 500,
    check: (L) => [[ev(L, 'game_over')[0]?.tick === 120 && ev(L, 'game_over')[0].data.reason === 'dawn' && end(L).ticks === 120, JSON.stringify(ev(L, 'game_over'))]],
  },
  {
    id: 'R15-safe-radius', req: 'Shades are blocked at 6 m from a lit lantern',
    scenario: { ...off, player: { pos: [0, 0, 20] }, shades: [{ id: 'S1', pos: [0, 1, 10] }], lanterns: [{ id: 'L1', pos: [0, 0, 20], lit: true }] }, ticks: 600,
    check: (L) => {
      const ds = L.filter((l) => l.type === 'snapshot').map((s) => hd(s.shades[0].pos, [0, 0, 20]));
      return [[Math.min(...ds) >= 6 - 1e-3, `closest ${Math.min(...ds).toFixed(3)}`], [near(ds.at(-1), 6, 0.01), 'waits at the edge'], [ev(L, 'player_hit').length === 0, 'no hits']];
    },
  },
  {
    id: 'R16-night1-spawns', req: 'Night 1: 20 motes on distinct points, +1 at tick 240; 2 shades at tick 300 (spawning), then 1 every 480; ids S1..',
    scenario: { player: { pos: [0, 0, 25] }, lanterns: [{ id: 'L1', lit: true }] }, ticks: 800,
    check: (L) => {
      const s0 = snap(L, 0), sp = ev(L, 'shade_spawned');
      const keys = new Set(s0.motes.map((m) => m.pos.join()));
      return [[s0.motes_active === 20 && keys.size === 20 && s0.shades.length === 0 && s0.motes.every((m) => m.kind === 'random' && m.ttl_s === null), 'start: 20 distinct random motes, no shades'],
        [snap(L, 240).motes_active === 21, `motes at 240: ${snap(L, 240).motes_active}`],
        [sp.map((e) => `${e.tick}:${e.data.id}`).join() === '300:S1,300:S2,780:S3', `spawns ${sp.map((e) => `${e.tick}:${e.data.id}`)}`],
        [snap(L, 310).shades.every((s) => s.state === 'spawning') && snap(L, 370).shades.every((s) => s.state !== 'spawning'), 'spawning state then active'],
        [snap(L, 300).shades.every((s) => hd(s.pos, [0, 0, 25]) >= 15 && near(Math.hypot(s.pos[0], s.pos[2]), 37, 0.01)), 'on r37 points, >= 15 m from player']];
    },
  },
  // ---------------- Phase 2 features
  {
    id: 'P1-dash', req: 'Dash: 14 m/s for 12 ticks in move direction, cooldown 1.5 s from dash start',
    scenario: { ...off }, inputs: { frames: [{ tick: 0, move: [1, 0], dash: true }, { tick: 1, move: [0, 0], dash: false }, { tick: 30, dash: true }, { tick: 31, dash: false }, { tick: 90, dash: true }] }, ticks: 110, every: 1,
    check: (L) => {
      const d = ev(L, 'dash');
      return [[near(snap(L, 12).player.pos[0], 2.8), `x after dash ${snap(L, 12).player.pos[0]}`], [near(snap(L, 1).player.dash_cd_s, 1.5), 'cooldown 1.5 s'],
        [d.map((e) => e.tick).join() === '1,91', `dash ticks ${d.map((e) => e.tick)} (press at 30 ignored, at 90 ok)`],
        [near(snap(L, 102).player.pos[0], 2.8 + 2.8), 'standing dash goes along facing (+X, last move dir)']];
    },
  },
  {
    id: 'P2-air-dash-keeps-height', req: 'Dash in the air keeps altitude',
    scenario: { ...off }, inputs: { frames: [{ tick: 0, jump: true }, { tick: 10, dash: true, move: [0, 1] }] }, ticks: 90, every: 1,
    check: (L) => {
      const ys = [12, 16, 21].map((t) => snap(L, t).player.pos[1]);
      return [[ys[0] > 0.5 && ys.every((y) => near(y, ys[0])), `y during dash ${ys}`], [snap(L, 23).player.pos[1] > ys[0] && snap(L, 90).player.grounded, 'vertical motion resumes after dash, then lands']];
    },
  },
  {
    id: 'P3-charm', req: 'Bùa Gió: pickup event, 600 ticks, run 7.2 m/s, dash without cooldown, respawn after 2700 ticks',
    night: 2, scenario: { ...off, charms: [{ id: 'C1', pos: [35, 0, 0] }], player: { pos: [35, 0, 0] } },
    inputs: { frames: [{ tick: 1, move: [-1, 0] }, { tick: 61, move: [0, 0] }, { tick: 70, dash: true }, { tick: 71, dash: false }, { tick: 75, dash: true }, { tick: 76, dash: false }, { tick: 90, dash: true }] }, ticks: 120, every: 1,
    check: (L) => {
      const c = ev(L, 'charm_picked')[0], s = snap(L, 61);
      return [[c?.tick === 1 && c.data.charm_id === 'C1' && c.data.charm_ticks === 600, JSON.stringify(c)],
        [near(snap(L, 1).player.pos[0] - s.player.pos[0], 7.2), `run speed ${snap(L, 1).player.pos[0] - s.player.pos[0]} m/s`],
        [ev(L, 'dash').map((e) => e.tick).join() === '71,91', `dashes ${ev(L, 'dash').map((e) => e.tick)} (press during dash ignored, no cooldown)`],
        [s.charms[0].available === false && near(s.charms[0].respawn_s, (2700 - 60) / 60), `charm ${JSON.stringify(s.charms[0])}`]];
    },
  },
  {
    id: 'P4-fall-respawn', req: 'Fall below Y=-10: -1 flame, lose all motes (lost), wait 60 ticks, respawn at start with invuln 90',
    scenario: { ...off, player: { pos: [39, 0, 0], carried: 4 } }, inputs: { frames: [{ tick: 0, move: [1, 0] }, { tick: 20, move: [0, 0] }] }, ticks: 200, every: 1,
    check: (L) => {
      const h = ev(L, 'player_hit');
      const t = h[0]?.tick, r = snap(L, t + 60);
      return [[h.length === 1 && h[0].data.by === 'fall' && h[0].data.flames === 2 && h[0].data.lost === 4 && h[0].data.dropped === 0, JSON.stringify(h)],
        [snap(L, t - 1).player.pos[1] >= -10 && snap(L, t).player.pos[1] < -10, 'triggered when Y < -10'],
        [r.player.pos.join() === '0,0,0' && r.player.carried === 0 && near(r.player.invuln, 1.5) && snap(L, t + 59).player.pos[1] < -10, `respawn ${JSON.stringify(r.player)}`]];
    },
  },
  {
    id: 'P5-fall-last-flame', req: 'Falling with the last flame loses at once (no respawn)',
    scenario: { ...off, player: { pos: [39.5, 0, 0], flames: 1 } }, inputs: { frames: [{ tick: 0, move: [1, 0] }] }, ticks: 300,
    check: (L) => [[end(L).state === 'lost' && ev(L, 'game_over')[0].data.reason === 'no_flames' && ev(L, 'game_over')[0].tick === ev(L, 'player_hit')[0].tick, JSON.stringify(end(L))]],
  },
  {
    id: 'P6-jump-pad-night2', req: 'Night 2 pad: vy 14, 24 m/s toward the other island, keys ignored in flight, ~1.4 s, lands on island B',
    night: 2, scenario: { ...off, player: { pos: [20, 0, 18] } }, inputs: { frames: [{ tick: 5, move: [-1, 0] }] }, ticks: 100, every: 1,
    check: (L) => {
      const land = L.find((l) => l.type === 'snapshot' && l.tick > 1 && l.player.grounded);
      return [[land && land.tick >= 82 && land.tick <= 86, `landed at tick ${land?.tick}`], [land && hd(land.player.pos, [70, 0, 0]) < 28, `landed on B at ${land?.player.pos}`],
        [ev(L, 'player_hit').length === 0, 'no fall']];
    },
  },
  {
    id: 'P7-night3-ramp-and-cliff', req: 'Night 3: ramp at 30° climbs to tier 1 (Y=3); tier-2 cliff blocks walking',
    night: 3, scenario: { ...off, player: { pos: [25.981, 0, 15] } }, inputs: { frames: [{ tick: 0, move: [-0.866, -0.5] }] }, ticks: 80,
    check: (L) => [[near(snap(L, 80).player.pos[1], 3) && snap(L, 80).player.grounded, `on tier 1: ${JSON.stringify(snap(L, 80).player.pos)}`], [near(snap(L, 30).player.pos[1], 1.5, 0.15), `mid-ramp y ${snap(L, 30).player.pos[1]}`]],
  },
  {
    id: 'P8-night3-cliff-wall', req: 'Night 3: walking into the tier-2 cliff from tier 0 is blocked',
    night: 3, scenario: { ...off, player: { pos: [0, 0, -11] } }, inputs: { frames: [{ tick: 0, move: [0, 1] }] }, ticks: 120,
    check: (L) => [[snap(L, 120).player.pos[2] <= -8 + 0.11 && snap(L, 120).player.pos[1] === 0, `stopped at ${snap(L, 120).player.pos}`]],
  },
  {
    id: 'P9-night3-jump-pad', req: 'Night 3 pad (0,3,13): vy 12, 8 m/s toward -Z, lands on tier 2 (Y=6)',
    night: 3, scenario: { ...off, player: { pos: [0, 3, 13] } }, ticks: 80, every: 1,
    check: (L) => {
      const land = L.find((l) => l.type === 'snapshot' && l.tick > 1 && l.player.grounded);
      return [[land && land.player.pos[1] === 6 && Math.hypot(land.player.pos[0], land.player.pos[2]) <= 8, `landed ${JSON.stringify(land?.player.pos)} at ${land?.tick}`]];
    },
  },
  {
    id: 'P10-safe-zone-evict', req: 'Shade inside a lantern that lights is pushed to the 6 m edge within 30 ticks and deals no damage meanwhile',
    scenario: { ...off, player: { pos: [0, 0, 24], carried: 1 }, lanterns: [{ id: 'L1', deposited: 9 }], shades: [{ id: 'S1', pos: [0, 1, 26.5], state: 'chase' }] },
    inputs: { frames: [{ tick: 0, interact: true }] }, ticks: 60, every: 1,
    check: (L) => [[ev(L, 'lantern_lit').length === 1 && ev(L, 'player_hit').length === 0, 'lit, no hit'],
      [hd(snap(L, 31).shades[0].pos, [0, 0, 25]) >= 6 - 1e-3, `at 31: ${hd(snap(L, 31).shades[0].pos, [0, 0, 25]).toFixed(3)} m`],
      [hd(snap(L, 15).shades[0].pos, [0, 0, 25]) < 6, 'moving out gradually']],
  },
  {
    id: 'P11-drifter-steal', req: 'Gió Lạc: chase when carrying >= 5 within 15 m, steal min(3, carried) on touch (1.2 m), flee 240 ticks then removed',
    night: 2, scenario: { ...off, player: { carried: 6 }, drifters: [{ id: 'D1', pos: [6, 1.5, 0] }] }, ticks: 300,
    check: (L) => {
      const s = ev(L, 'drifter_steal')[0];
      return [[s && s.data.drifter_id === 'D1' && s.data.amount === 3 && s.data.carried === 3, JSON.stringify(s)], [snap(L, 10).drifters[0].state === 'chase', 'chasing'],
        [snap(L, s.tick - (s.tick % 10) + 10).drifters[0].state === 'flee' && snap(L, 290).drifters[0].state === 'removed', 'flee then removed'], [ev(L, 'player_hit').length === 0, 'no flame lost']];
    },
  },
  {
    id: 'P12-drifter-pulsed-while-chasing', req: 'Pulse on a chasing Gió Lạc makes it flee without stealing',
    night: 2, scenario: { ...off, player: { carried: 8 }, drifters: [{ id: 'D1', pos: [4, 1.5, 0], state: 'chase' }] }, inputs: { frames: [{ tick: 0, pulse: true }] }, ticks: 60,
    check: (L) => [[ev(L, 'drifter_steal').length === 0 && snap(L, 10).drifters[0].state === 'flee' && snap(L, 60).player.carried === 5, JSON.stringify(snap(L, 10).drifters)]],
  },
  {
    id: 'P13-drifter-drop', req: 'Pulse on a fleeing Gió Lạc with loot drops it as dropped motes; it vanishes after 120 ticks',
    night: 2, scenario: { ...off, player: { carried: 3 }, drifters: [{ id: 'D1', pos: [3, 1.5, 0], state: 'flee', stolen: 3 }] }, inputs: { frames: [{ tick: 0, pulse: true }] }, ticks: 130, every: 10,
    check: (L) => {
      const d = ev(L, 'drifter_drop')[0];
      return [[d?.data.amount === 3 && d.data.drifter_id === 'D1', JSON.stringify(d)], [snap(L, 10).motes.filter((m) => m.kind === 'dropped').length === 3, 'three dropped motes'],
        [snap(L, 110).drifters[0].state === 'flee' && snap(L, 130).drifters[0].state === 'removed', 'vanishes after 120 ticks']];
    },
  },
  {
    id: 'P14-pause', req: 'Pause: tick advances, sim_tick/time/movement freeze, state "paused", paused/resumed events',
    scenario: { ...off }, inputs: { frames: [{ tick: 0, move: [0, 1] }, { tick: 10, pause: true }, { tick: 11, pause: false }, { tick: 40, pause: true }] }, ticks: 60,
    check: (L) => [[ev(L, 'paused')[0]?.tick === 11 && ev(L, 'resumed')[0]?.tick === 41, `${JSON.stringify(ev(L, 'paused'))} ${JSON.stringify(ev(L, 'resumed'))}`],
      [snap(L, 20).state === 'paused' && snap(L, 20).sim_tick === 10 && snap(L, 30).player.pos[2] === snap(L, 20).player.pos[2], JSON.stringify(snap(L, 20).player)],
      [snap(L, 60).sim_tick === 30 && near(snap(L, 60).time_left_s, 300 - 0.5) && near(snap(L, 60).player.pos[2], 3), `end ${JSON.stringify(snap(L, 60).player.pos)}`]],
  },
  {
    id: 'P15-win-on-last-tick', req: 'All lit on the very tick time runs out counts as a win',
    scenario: { ...off, time_left_s: 1, player: { carried: 10 }, lanterns: allLitBut('L5', [0, 0, 1]) }, inputs: { frames: [{ tick: 59, interact: true }] }, ticks: 100,
    check: (L) => [[ev(L, 'game_over')[0]?.data.result === 'won' && ev(L, 'game_over')[0].tick === 60 && end(L).score === 100 + 100 + 0 + 150, JSON.stringify(end(L))]],
  },
  {
    id: 'P16-interact-tie-and-one-hit-per-tick', req: 'Equal distance -> smaller id; two touching shades cost only one flame per tick',
    scenario: { ...off, player: { carried: 3 }, lanterns: [{ id: 'L2', pos: [0, 0, -1.5] }, { id: 'L1', pos: [0, 0, 1.5] }], shades: [{ id: 'S2', pos: [0.5, 1, 0] }, { id: 'S1', pos: [-0.5, 1, 0] }] },
    inputs: { frames: [{ tick: 0, interact: true }] }, ticks: 3, every: 1,
    check: (L) => [[ev(L, 'deposit')[0]?.data.lantern_id === 'L1', 'L1 chosen'], [ev(L, 'player_hit').length === 1 && snap(L, 1).player.flames === 2, 'one flame lost'],
      [snap(L, 1).shades.find((s) => s.id === 'S1').state === 'recoil' && snap(L, 1).shades.find((s) => s.id === 'S2').state === 'chase', 'S1 (lower id) hit, S2 did nothing']],
  },
  {
    id: 'P17-night3-wind', req: 'Night 3 wind: gust at 30 s for 5 s, random direction, pushes 2 m/s',
    night: 3, scenario: { ...off, wind_enabled: true }, ticks: 2110, every: 10,
    check: (L) => {
      const w = snap(L, 1810).wind, a = snap(L, 1800).player.pos, b = snap(L, 2110).player.pos;
      const moved = hd(a, b), dir = (Math.atan2(b[2] - a[2], b[0] - a[0]) * 180) / Math.PI;
      return [[!snap(L, 1790).wind.active && w.active && !snap(L, 2110).wind.active, `wind ${JSON.stringify(w)}`], [moved > 9.8 && moved <= 10.01, `pushed ${moved.toFixed(3)} m`],
        [Math.abs(((dir - w.dir_deg + 540) % 360) - 180) < 1, `direction ${dir.toFixed(1)} vs ${w.dir_deg}`]];
    },
  },
  {
    id: 'P18-nights-2-3-setup', req: 'Night 2/3 maps: lantern ids/positions, duration, charms; Night 3 shades 4.5 m/s; drifters at tick 1200',
    night: 3, scenario: { ...off, shades: [{ id: 'S1', pos: [0, 1, -20] }] }, ticks: 60, every: 60,
    check: (L) => {
      const s0 = snap(L, 0), first = L.find((l) => l.type === 'event' && l.name === 'night_start');
      return [[s0.night === 3 && s0.lanterns.length === 7 && s0.lanterns[0].pos.join() === '0,6,6' && s0.time_left_s === 360, 'night 3 setup'], [first?.data.night === 3, 'night_start'],
        [near(hd(snap(L, 60).shades[0].pos, [0, 0, -20]), 4.5, 0.01), `shade moved ${hd(snap(L, 60).shades[0].pos, [0, 0, -20])} m in 1 s`]];
    },
  },
  {
    id: 'P19-night2-drifter-spawn', req: 'Night 2 default: 6 lanterns, 330 s, charm C1 at (35,0,0), Gió Lạc D1 spawns at tick 1200 (idle)',
    night: 2, scenario: { player: { pos: [0, 0, 20] }, lanterns: [{ id: 'L1', lit: true }] }, ticks: 1210, every: 10,
    check: (L) => {
      const s0 = snap(L, 0), s = snap(L, 1200);
      return [[s0.lanterns.length === 6 && s0.time_left_s === 330 && s0.charms[0].pos.join() === '35,0,0' && s0.drifters.length === 0, 'night 2 setup'],
        [snap(L, 1190).drifters.length === 0 && s.drifters.length === 1 && s.drifters[0].id === 'D1' && s.drifters[0].state === 'idle', JSON.stringify(s.drifters)]];
    },
  },
];
