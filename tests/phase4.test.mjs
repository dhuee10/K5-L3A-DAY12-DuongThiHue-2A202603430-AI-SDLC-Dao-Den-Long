// Phase 4 (TICKET-04): leaderboard rules + export, benchmark scene + statistics, soak runner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validName, addEntry, sortEntries, isoWithOffset, MAX_ENTRIES } from '../src/leaderboard.mjs';
import { benchStats, benchCamera } from '../src/benchstats.mjs';
import { createBenchGame, step, snapshot } from '../src/sim.mjs';
import { playNight } from '../tools/soak.mjs';

const entry = (name, score, at, extra = {}) => ({ name, score, nights_won: 1, achieved_at: at, seed: 1, ...extra });

test('leaderboard: name rules 3-12 of [A-Za-z0-9_], Vietnamese diacritics accepted (bonus)', () => {
  for (const ok of ['abc', 'Hue_2026', 'A1_b2_C3_d4_', 'Huệ', 'Mây_Đêm3', 'Nguyễn']) assert.ok(validName(ok), ok);
  for (const bad of ['ab', 'abcdefghijklm', 'a b', 'x-y', '', 'tên!', 12345, null]) assert.ok(!validName(bad), String(bad));
});

test('leaderboard: score desc, equal score -> earlier first, top 10 kept', () => {
  let list = [];
  list = addEntry(list, entry('late', 500, '2026-11-20T10:00:00+07:00'));
  list = addEntry(list, entry('early', 500, '2026-11-20T09:00:00+07:00'));
  list = addEntry(list, entry('best', 900, '2026-11-20T11:00:00+07:00'));
  assert.deepEqual(list.map((e) => e.name), ['best', 'early', 'late']);
  for (let i = 0; i < 12; i++) list = addEntry(list, entry(`p${i}x`, i * 10, `2026-11-20T12:00:${String(i).padStart(2, '0')}+07:00`));
  assert.equal(list.length, MAX_ENTRIES);
  assert.deepEqual(list.slice(0, 3).map((e) => e.name), ['best', 'early', 'late']);
  // timezone-aware tie: 08:00+07:00 is 01:00Z, earlier than 02:00Z
  assert.deepEqual(sortEntries([entry('zzz', 1, '2026-01-01T02:00:00Z'), entry('aaa', 1, '2026-01-01T08:00:00+07:00')]).map((e) => e.name), ['aaa', 'zzz']);
  assert.throws(() => addEntry([], entry('x', 1, 'now')));
  assert.match(isoWithOffset(new Date()), /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/);
});

test('leaderboard: stored on disk by the server and exported in order by run_cmd --export-leaderboard', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ddl-lb-'));
  const file = join(dir, 'board.json');
  process.env.LEADERBOARD_FILE = file;
  const { startServer } = await import(`../tools/serve.mjs?lb=${Date.now()}`);
  const server = await startServer(0);
  const url = `http://127.0.0.1:${server.address().port}/api/leaderboard`;
  const post = (e) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(e) });
  assert.equal((await post(entry('Mây', 300, '2026-11-20T10:00:00+07:00'))).status, 200);
  assert.equal((await post(entry('Hue_1', 800, '2026-11-20T10:05:00+07:00', { nights_won: 3 }))).status, 200);
  assert.equal((await post(entry('no', 999, '2026-11-20T10:06:00+07:00'))).status, 400); // name too short
  server.close();
  const out = join(dir, 'out.json');
  const r = spawnSync(process.execPath, ['tools/serve.mjs', '--export-leaderboard', out], { encoding: 'utf8', env: { ...process.env, LEADERBOARD_FILE: file } });
  assert.equal(r.status, 0, r.stderr);
  const exported = JSON.parse(readFileSync(out, 'utf8'));
  assert.deepEqual(exported.entries.map((e) => [e.name, e.score, e.nights_won]), [['Hue_1', 800, 3], ['Mây', 300, 1]]);
  for (const e of exported.entries) assert.deepEqual(Object.keys(e).sort(), ['achieved_at', 'name', 'nights_won', 'score', 'seed']);
  delete process.env.LEADERBOARD_FILE;
});

test('bench stats follow the ticket formulas', () => {
  const dts = [...Array(98).fill(10), 20, 40]; // N = 100, k = 1
  const s = benchStats(dts);
  assert.equal(s.frames, 100);
  assert.equal(s.avg_fps, Math.round((1000 * 100 / (980 + 60)) * 10) / 10);
  assert.equal(s.p1_low_fps, 25); // 1000 / 40
  assert.equal(s.frame_ms_p95, 10);
  const s2 = benchStats(Array.from({ length: 250 }, (_, i) => i + 1)); // k = ceil(2.5) = 3 -> mean(248,249,250) = 249
  assert.equal(s2.p1_low_fps, Math.round((1000 / 249) * 10) / 10);
  assert.equal(s2.frame_ms_p95, 238); // nearest rank: ceil(0.95 * 250) = 238th value
});

test('bench camera: r 30, Y 15, starts at (30,15,0), counter-clockwise (angle toward +Z), 15 s per lap', () => {
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
  assert.ok(near(benchCamera(0), [30, 15, 0]));
  assert.ok(near(benchCamera(3.75), [0, 15, 30]));
  assert.ok(near(benchCamera(15), [30, 15, 0]));
});

test('bench scene: 200 wander shades, 100 motes, L1-L3 lit at 100; no spawn/damage/pickup/burn/end; shades still move', () => {
  const g = createBenchGame(42);
  const s0 = snapshot(g);
  assert.equal(s0.shades.length, 200);
  assert.ok(s0.shades.every((s) => s.state === 'wander' && Math.hypot(s.pos[0], s.pos[2]) <= 40));
  assert.equal(s0.motes_active, 100);
  assert.deepEqual(s0.lanterns.map((l) => [l.id, l.lit, l.fuel]), [['L1', true, 100], ['L2', true, 100], ['L3', true, 100], ['L4', false, 0], ['L5', false, 0]]);
  assert.deepEqual(s0.player.pos, [0, 0, 0]);
  const events = [];
  for (let i = 0; i < 60 * 20; i++) events.push(...step(g, { move: [0, 0] }));
  const s1 = snapshot(g);
  assert.equal(events.length, 0, JSON.stringify(events.slice(0, 3)));
  assert.equal(s1.state, 'playing');
  assert.equal(s1.shades.length, 200);
  assert.ok(s1.shades.every((s) => s.state === 'wander'));
  assert.equal(s1.motes_active, 100);
  assert.equal(s1.player.flames, 3);
  assert.deepEqual(s1.lanterns.slice(0, 3).map((l) => l.fuel), [100, 100, 100]);
  assert.ok(s1.shades.some((s, i) => s.pos[0] !== s0.shades[i].pos[0]), 'shades move');
  assert.deepEqual(snapshot(createBenchGame(42)).shades, s0.shades, 'seeded: same layout every time');
});

test('soak: every night of the rotation runs to its end without throwing', () => {
  for (const n of [1, 2, 3]) {
    const { game, ticks } = playNight(n, 7 + n);
    assert.ok(game.state !== 'playing' || ticks === game.map.duration_s * 60);
  }
});
