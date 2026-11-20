#!/usr/bin/env node
// Headless runner per Test Contract v1.0.
// node src/headless.mjs --seed 1 --night 1 [--scenario s.json] [--inputs i.json] --ticks 600 --out out.jsonl [--snapshot-every 10]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createGame, step, snapshot } from './sim.mjs';

class InputError extends Error {}
const fail = (msg, code) => { process.stderr.write(`error: ${msg}\n`); process.exit(code); };

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) fail(`unexpected argument ${k}`, 1);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) fail(`missing value for ${k}`, 1);
    a[k.slice(2)] = v; i++;
  }
  const int = (name, req, def) => {
    if (a[name] === undefined) { if (req) fail(`--${name} is required`, 1); return def; }
    if (!/^-?\d+$/.test(a[name])) fail(`--${name} must be an integer`, 1);
    return parseInt(a[name], 10);
  };
  const opts = {
    seed: int('seed', true),
    night: int('night', true),
    ticks: int('ticks', true),
    snapshotEvery: int('snapshot-every', false, 10),
    scenario: a.scenario, inputs: a.inputs, out: a.out,
  };
  if (!opts.out) fail('--out is required', 1);
  if (![1, 2, 3].includes(opts.night)) fail(`night ${opts.night} is not available (1, 2 or 3)`, 1);
  if (opts.ticks < 0) fail('--ticks must be >= 0', 1);
  if (opts.snapshotEvery < 1) fail('--snapshot-every must be >= 1', 1);
  return opts;
}

function loadJson(path, what) {
  let text;
  try { text = readFileSync(path, 'utf8'); } catch (e) { throw new InputError(`cannot read ${what} file ${path}: ${e.message}`); }
  try { return JSON.parse(text.replace(/^﻿/, '')); } catch (e) { throw new InputError(`${what} is not valid JSON: ${e.message}`); }
}

const SHADE_STATES = ['spawning', 'wander', 'chase', 'recoil', 'stunned'];
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(isNum);
const check = (cond, msg) => { if (!cond) throw new InputError(msg); };

export function validateInputs(doc) {
  check(isObj(doc) && Array.isArray(doc.frames), 'inputs: expected {"frames": [...]}');
  let last = -1;
  for (const [i, f] of doc.frames.entries()) {
    check(isObj(f), `inputs: frame ${i} is not an object`);
    check(Number.isInteger(f.tick) && f.tick >= 0, `inputs: frame ${i} tick must be a non-negative integer`);
    check(f.tick > last, `inputs: frame ${i} tick ${f.tick} is not strictly increasing`);
    last = f.tick;
    if ('move' in f) check(Array.isArray(f.move) && f.move.length === 2 && f.move.every((x) => isNum(x) && x >= -1 && x <= 1), `inputs: frame ${i} move must be [x,z] in [-1,1]`);
    if ('cam_yaw_deg' in f) check(isNum(f.cam_yaw_deg), `inputs: frame ${i} cam_yaw_deg must be a number`);
    for (const b of ['jump', 'interact', 'pulse', 'dash', 'pause']) if (b in f) check(typeof f[b] === 'boolean', `inputs: frame ${i} ${b} must be boolean`);
  }
  return doc.frames;
}

export function validateScenario(sc) {
  check(isObj(sc), 'scenario: expected an object');
  if ('player' in sc) {
    check(isObj(sc.player), 'scenario: player must be an object');
    if ('pos' in sc.player) check(isVec3(sc.player.pos), 'scenario: player.pos must be [x,y,z]');
    if ('carried' in sc.player) check(Number.isInteger(sc.player.carried) && sc.player.carried >= 0, 'scenario: player.carried must be a non-negative integer');
    if ('flames' in sc.player) check(Number.isInteger(sc.player.flames) && sc.player.flames >= 0, 'scenario: player.flames must be a non-negative integer');
    for (const k of ['invuln_ticks', 'dash_cd_ticks', 'pulse_cd_ticks', 'charm_ticks']) if (k in sc.player) check(Number.isInteger(sc.player[k]) && sc.player[k] >= 0, `scenario: player.${k} must be a non-negative integer`);
  }
  for (const k of ['random_motes', 'random_shades', 'random_drifters', 'wind_enabled']) if (k in sc) check(typeof sc[k] === 'boolean', `scenario: ${k} must be boolean`);
  if ('motes' in sc) check(Array.isArray(sc.motes) && sc.motes.every((m) => isVec3(m) || (isObj(m) && isVec3(m.pos) && (!('kind' in m) || ['random', 'dropped'].includes(m.kind)))), 'scenario: motes must be [x,y,z] or {pos,kind?,ttl_s?}');
  if ('shades' in sc) {
    check(Array.isArray(sc.shades), 'scenario: shades must be an array');
    for (const s of sc.shades) {
      check(isObj(s) && isVec3(s.pos), 'scenario: each shade needs pos [x,y,z]');
      if ('id' in s) check(typeof s.id === 'string' && s.id.length > 0, 'scenario: shade id must be a string');
      if ('state' in s) check(SHADE_STATES.includes(s.state), `scenario: shade state must be one of ${SHADE_STATES.join(', ')}`);
      if ('state_ticks_left' in s) check(Number.isInteger(s.state_ticks_left) && s.state_ticks_left >= 0, 'scenario: shade state_ticks_left must be a non-negative integer');
    }
  }
  if ('lanterns' in sc) {
    check(Array.isArray(sc.lanterns), 'scenario: lanterns must be an array');
    for (const l of sc.lanterns) {
      check(isObj(l) && typeof l.id === 'string', 'scenario: each lantern needs a string id');
      if ('pos' in l) check(isVec3(l.pos), `scenario: lantern ${l.id} pos must be [x,y,z]`);
      if ('deposited' in l) check(Number.isInteger(l.deposited) && l.deposited >= 0, `scenario: lantern ${l.id} deposited must be a non-negative integer`);
      if ('lit' in l) check(typeof l.lit === 'boolean', `scenario: lantern ${l.id} lit must be boolean`);
    }
  }
  if ('drifters' in sc) {
    check(Array.isArray(sc.drifters), 'scenario: drifters must be an array');
    for (const d of sc.drifters) {
      check(isObj(d) && isVec3(d.pos), 'scenario: each drifter needs pos [x,y,z]');
      if ('id' in d) check(typeof d.id === 'string', 'scenario: drifter id must be a string');
      if ('state' in d) check(['idle', 'chase', 'flee', 'removed'].includes(d.state), 'scenario: drifter state must be idle/chase/flee/removed');
      if ('stolen' in d) check(Number.isInteger(d.stolen) && d.stolen >= 0, 'scenario: drifter stolen must be a non-negative integer');
    }
  }
  if ('charms' in sc) {
    check(Array.isArray(sc.charms), 'scenario: charms must be an array');
    for (const c of sc.charms) {
      check(isObj(c), 'scenario: each charm must be an object');
      if ('pos' in c) check(isVec3(c.pos), 'scenario: charm pos must be [x,y,z]');
      if ('available' in c) check(typeof c.available === 'boolean', 'scenario: charm available must be boolean');
    }
  }
  if ('time_left_s' in sc) check(isNum(sc.time_left_s) && sc.time_left_s > 0, 'scenario: time_left_s must be a positive number');
  return sc;
}

export function run({ seed, night = 1, scenario, frames, ticks, snapshotEvery }) {
  const g = createGame({ seed, night, scenario });
  const lines = [];
  const push = (o) => lines.push(JSON.stringify(o));
  push(snapshot(g));
  push({ type: 'event', tick: 0, name: 'night_start', data: { night } });
  const cur = { move: [0, 0], cam_yaw_deg: 0, jump: false, interact: false, pulse: false, dash: false, pause: false };
  let fi = 0;
  for (let k = 0; k < ticks && g.state === 'playing'; k++) {
    while (fi < frames.length && frames[fi].tick <= k) {
      const f = frames[fi++];
      for (const key of Object.keys(cur)) if (key in f) cur[key] = Array.isArray(f[key]) ? f[key].slice() : f[key];
    }
    const events = step(g, cur);
    for (const e of events) push(e);
    if (g.tick % snapshotEvery === 0) push(snapshot(g));
  }
  push({ type: 'end', ticks: g.tick, state: g.state, score: g.score });
  return lines.join('\n') + '\n';
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  let scenario = null, frames = [];
  try {
    if (opts.scenario) scenario = validateScenario(loadJson(opts.scenario, 'scenario'));
    if (opts.inputs) frames = validateInputs(loadJson(opts.inputs, 'inputs'));
  } catch (e) {
    if (e instanceof InputError) fail(e.message, 2);
    throw e;
  }
  const out = run({ seed: opts.seed, night: opts.night, scenario, frames, ticks: opts.ticks, snapshotEvery: opts.snapshotEvery });
  try { writeFileSync(opts.out, out); } catch (e) { fail(`cannot write ${opts.out}: ${e.message}`, 1); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (e) { fail(e.stack || String(e), 1); }
}
