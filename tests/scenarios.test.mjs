import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run, validateScenario, validateInputs } from '../src/headless.mjs';
import { TUNING } from '../src/sim.mjs';
import { SCENARIOS } from './scenarios.mjs';

export function runScenario(sc, seed = 1) {
  const text = run({
    seed,
    scenario: sc.scenario ? validateScenario(structuredClone(sc.scenario)) : null,
    frames: sc.inputs ? validateInputs(structuredClone(sc.inputs)) : [],
    ticks: sc.ticks,
    snapshotEvery: sc.every ?? 10,
  });
  return { text, lines: text.trim().split('\n').map((l) => JSON.parse(l)) };
}

for (const sc of SCENARIOS) {
  test(`${sc.id}: ${sc.req}`, () => {
    const { lines } = runScenario(sc);
    for (const [ok, msg] of sc.check(lines)) assert.ok(ok, msg);
  });
}

test('output format: first line snapshot tick 0, last line end, every snapshot on schedule', () => {
  const { lines } = runScenario({ ticks: 95, every: 10 });
  assert.equal(lines[0].type, 'snapshot');
  assert.equal(lines[0].tick, 0);
  assert.equal(lines[0].time_left_s, TUNING.night1_duration_s);
  assert.deepEqual(lines[0].player.pos, [0, 0, 0]);
  const last = lines.at(-1);
  assert.equal(last.type, 'end');
  assert.equal(last.ticks, 95);
  const ticks = lines.filter((l) => l.type === 'snapshot').map((l) => l.tick);
  assert.deepEqual(ticks, [0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
  for (const s of lines.filter((l) => l.type === 'snapshot')) {
    assert.equal(s.sim_tick, s.tick);
    for (const sh of s.shades) assert.ok(sh.pos.every((v) => Math.round(v * 1000) / 1000 === v));
  }
});

test('determinism: same seed gives identical output, different seed differs', () => {
  const a = runScenario({ ticks: 1200 }, 42).text;
  const b = runScenario({ ticks: 1200 }, 42).text;
  const c = runScenario({ ticks: 1200 }, 43).text;
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('game.contract.json tuning matches the numbers the game uses', () => {
  const c = JSON.parse(readFileSync(new URL('../game.contract.json', import.meta.url), 'utf8'));
  assert.equal(c.contract_version, '1.0');
  assert.deepEqual(c.tuning, JSON.parse(JSON.stringify(TUNING)));
});

// CLI-level checks (real process, real exit codes)
const dir = mkdtempSync(join(tmpdir(), 'ddl-'));
const cli = (args) => spawnSync(process.execPath, ['src/headless.mjs', ...args], { encoding: 'utf8' });
const base = ['--seed', '1', '--night', '1', '--ticks', '30', '--out', join(dir, 'o.jsonl')];

test('CLI: valid run exits 0 and writes end line', () => {
  const r = cli(base);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(readFileSync(join(dir, 'o.jsonl'), 'utf8').trim().split('\n').at(-1)).type, 'end');
});

test('CLI: malformed inputs / scenario exit 2 with stderr', () => {
  const bad = {
    'notjson.json': '{frames: oops',
    'dupe.json': JSON.stringify({ frames: [{ tick: 3 }, { tick: 3 }] }),
    'move.json': JSON.stringify({ frames: [{ tick: 0, move: [2, 0] }] }),
    'btn.json': JSON.stringify({ frames: [{ tick: 0, pulse: 1 }] }),
  };
  for (const [name, body] of Object.entries(bad)) {
    writeFileSync(join(dir, name), body);
    const r = cli([...base, '--inputs', join(dir, name)]);
    assert.equal(r.status, 2, `${name}: ${r.status}`);
    assert.ok(r.stderr.length > 0);
  }
  writeFileSync(join(dir, 'sc.json'), JSON.stringify({ motes: [[1, 2]] }));
  assert.equal(cli([...base, '--scenario', join(dir, 'sc.json')]).status, 2);
});

test('CLI: missing required args / unknown night exit non-zero', () => {
  assert.notEqual(cli(['--seed', '1']).status, 0);
  assert.notEqual(cli(['--seed', '1', '--night', '9', '--ticks', '1', '--out', join(dir, 'x')]).status, 0);
});
