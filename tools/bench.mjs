#!/usr/bin/env node
// Benchmark (TICKET-04 §1): node tools/bench.mjs --seed 42 --duration 30 --out bench.json [--headless]
// Opens a real 1280x720 Chrome/Chromium window (not fullscreen) with vsync and the frame-rate limit disabled,
// loads the standard bench scene from the game's own server, measures frame times in the page, and samples
// the browser's total RSS (all its processes) while measuring. Needs Chrome/Chromium/Edge (set CHROME_PATH if not found).
import { spawn, execFile } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import os from 'node:os';
import { join } from 'node:path';
import { startServer } from './serve.mjs';

const T0 = performance.timeOrigin; // process start (epoch ms)
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const seed = Number.parseInt(opt('seed', '42'), 10), duration = Number(opt('duration', '30')), out = opt('out');
const headless = argv.includes('--headless');
if (!out || !Number.isInteger(seed) || !(duration > 0)) { process.stderr.write('usage: bench --seed 42 --duration 30 --out bench.json [--headless]\n'); process.exit(1); }

function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const c = {
    win32: ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'],
    darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
    linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium', '/usr/bin/microsoft-edge'],
  }[process.platform] || [];
  return c.find(existsSync);
}

// Sum RSS of every browser process launched with our private profile dir.
function browserRssMb(profile) {
  return new Promise((ok) => {
    if (process.platform === 'win32') {
      const ps = `$d='${profile.replace(/'/g, "''")}'; (Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*$d*" } | Measure-Object WorkingSetSize -Sum).Sum`;
      execFile('powershell', ['-NoProfile', '-Command', ps], (e, so) => ok(e ? null : Number(so.trim()) / 1048576 || null));
    } else {
      execFile('ps', ['-axo', 'rss=,command='], { maxBuffer: 1 << 24 }, (e, so) => {
        if (e) return ok(null);
        let kb = 0;
        for (const line of so.split('\n')) if (line.includes(profile)) kb += Number(line.trim().split(/\s+/)[0]) || 0;
        ok(kb ? kb / 1024 : null);
      });
    }
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  const chrome = findChrome();
  if (!chrome) throw new Error('Chrome/Chromium/Edge not found; set CHROME_PATH');
  const server = await startServer(0);
  const port = server.address().port, cdpPort = 9400 + Math.floor(Math.random() * 400);
  const profile = mkdtempSync(join(tmpdir(), 'ddl-bench-'));
  const vsyncFlags = ['--disable-gpu-vsync', '--disable-frame-rate-limit'];
  const flags = [`--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--window-size=1280,720', '--window-position=40,40', ...vsyncFlags, '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
  if (headless) flags.push('--headless=new');
  const proc = spawn(chrome, [...flags, 'about:blank'], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 100 && !target; i++) { await sleep(100); try { target = (await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json()).find((t) => t.type === 'page'); } catch {} }
  if (!target) throw new Error('could not connect to the browser');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); pending.get(d.id)?.(d); };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.result?.value;
  // exact 1280x720 viewport regardless of window decorations
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?bench&seed=${seed}&duration=${duration}` });

  let peak = null, phase = 'idle';
  const deadline = Date.now() + (duration + 3 + 60) * 1000;
  while (phase !== 'done' && Date.now() < deadline) {
    await sleep(500);
    phase = await ev('window.__bench && window.__bench.phase') || 'idle';
    if (phase === 'measure') { const m = await browserRssMb(profile); if (m != null) peak = Math.max(peak ?? 0, m); }
  }
  if (phase !== 'done') throw new Error('benchmark did not finish');
  const r = await ev('window.__bench.result');
  const firstFrameEpoch = await ev('window.__bench.firstFrameEpoch');
  const ua = await ev('navigator.userAgent');
  const chromeVer = (/(?:Chrome|Edg)\/([\d.]+)/.exec(ua) || [])[1] || 'unknown';
  const report = {
    contract_version: '1.3',
    avg_fps: r.avg_fps,
    p1_low_fps: r.p1_low_fps,
    frame_ms_p95: r.frame_ms_p95,
    frames: r.frames,
    load_ms: Math.round(firstFrameEpoch - T0),
    peak_mem_mb: peak == null ? null : Math.round(peak),
    vsync_off: true,
    renderer: `three.js r160 (WebGLRenderer, WebGL2) in Chrome ${chromeVer}${headless ? ' headless' : ''}; GPU: ${r.gpu}; canvas ${r.canvas.join('x')}`,
    os: `${os.type()} ${os.release()} (${os.arch()}), CPU ${os.cpus()[0]?.model?.trim()}, RAM ${Math.round(os.totalmem() / 1073741824)} GB`,
    seed, duration_s: duration, scene: { shades: r.shades, motes: r.motes, lit: ['L1', 'L2', 'L3'] },
    notes: `vsync off via Chrome flags ${vsyncFlags.join(' ')}; peak_mem_mb = peak summed RSS of all browser processes during the measured window, sampled every ~0.5 s`,
  };
  writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  try { await send('Browser.close'); } catch {}
  proc.kill();
  server.close();
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(0);
}
main().catch((e) => { process.stderr.write(`bench failed: ${e.message}\n`); process.exit(1); });
