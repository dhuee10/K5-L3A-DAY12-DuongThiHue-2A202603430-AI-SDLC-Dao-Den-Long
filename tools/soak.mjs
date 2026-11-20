#!/usr/bin/env node
// Soak test (TICKET-04 §2): N nights headless in ONE process, Night 1 -> 2 -> 3 rotating, night i uses seed + i.
// Seeded random input: new move direction every 30 ticks; per tick 5 % jump, 3 % dash, 2 % pulse, 10 % interact.
// usage: node --expose-gc tools/soak.mjs --seed 7 --nights 10 --out soak.json
import { writeFileSync } from 'node:fs';
import { createGame, step, makeRng, NIGHTS, TICK_RATE } from '../src/sim.mjs';

function args() {
  const a = {};
  const v = process.argv.slice(2);
  for (let i = 0; i < v.length; i += 2) {
    if (!v[i].startsWith('--') || v[i + 1] === undefined) { process.stderr.write(`error: bad argument ${v[i]}\n`); process.exit(1); }
    a[v[i].slice(2)] = v[i + 1];
  }
  const seed = Number.parseInt(a.seed ?? '7', 10), nights = Number.parseInt(a.nights ?? '10', 10);
  if (!Number.isInteger(seed) || !Number.isInteger(nights) || nights < 1 || !a.out) { process.stderr.write('usage: soak --seed <int> --nights <int> --out <file>\n'); process.exit(1); }
  return { seed, nights, out: a.out };
}

const rssMb = () => {
  if (global.gc) { global.gc(); global.gc(); }
  return Math.round((process.memoryUsage().rss / 1048576) * 10) / 10;
};

export function playNight(night, seed) {
  const game = createGame({ seed, night });
  const rng = makeRng((seed * 2654435761) >>> 0); // input stream, independent of the sim's RNG
  const maxTicks = NIGHTS[night].duration_s * TICK_RATE;
  const input = { move: [0, 0], cam_yaw_deg: 0, jump: false, interact: false, pulse: false, dash: false, pause: false };
  let ticks = 0;
  while (game.state === 'playing' && ticks < maxTicks) {
    if (ticks % 30 === 0) { const a = rng() * Math.PI * 2; input.move = [Math.cos(a), Math.sin(a)]; }
    input.jump = rng() < 0.05; input.dash = rng() < 0.03; input.pulse = rng() < 0.02; input.interact = rng() < 0.10;
    step(game, input);
    ticks++;
  }
  return { game, ticks };
}

function main() {
  const { seed, nights, out } = args();
  const t0 = performance.now();
  const results = [];
  let crashes = 0, memStart = null, game = null;
  for (let i = 0; i < nights; i++) {
    const night = (i % 3) + 1;
    try {
      if (i === 0) { game = createGame({ seed: seed + i, night }); memStart = rssMb(); game = null; } // RSS after loading the first night
      const r = playNight(night, seed + i);
      results.push(r.game.state === 'playing' ? 'timeout' : r.game.state);
      game = r.game;
    } catch (e) {
      crashes++;
      results.push('crash');
      process.stderr.write(`night ${i + 1} crashed: ${e.stack || e}\n`);
    }
    game = null; // reset between nights
  }
  const memEnd = rssMb(); // after resetting the last night
  const report = { nights, crashes, results, mem_start_mb: memStart, mem_end_mb: memEnd, duration_s: Math.round((performance.now() - t0) / 100) / 10, contract_version: '1.3', gc_exposed: !!global.gc, node: process.version };
  writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
  process.exit(crashes === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) main();
