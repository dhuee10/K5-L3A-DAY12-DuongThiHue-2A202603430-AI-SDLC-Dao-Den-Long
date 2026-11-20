// Drives the real browser game over Chrome DevTools Protocol and checks the sim ticks in real time.
// usage: node tools/browser-check.mjs <chrome-path> [url]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const [chrome, url = 'http://localhost:8099/?autostart'] = process.argv.slice(2);
const port = 9333;
const proc = spawn(chrome, ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'ddl-chrome-'))}`, '--window-size=1280,720', url], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); pending.get(d.id)?.(d); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.result.value;
const key = (type, code, k) => send('Input.dispatchKeyEvent', { type, code, key: k });
await sleep(2500);
const out = {};
out.errors = await ev('window.__errs || null');
out.t0 = await ev('JSON.stringify({steps: __game().steps, pos: __game().player.pos, time: document.getElementById("time").textContent})');
await key('keyDown', 'KeyW', 'w'); await sleep(1500); await key('keyUp', 'KeyW', 'w');
out.afterW = await ev('JSON.stringify({steps: __game().steps, pos: __game().player.pos.map(v=>+v.toFixed(2)), time: document.getElementById("time").textContent, score: __game().score})');
await sleep(12000);
out.later = await ev('JSON.stringify({steps: __game().steps, state: __game().state, flames: __game().player.flames, end: document.getElementById("end").className})');
await key("keyDown", "KeyR", "r"); await key("keyUp", "KeyR", "r"); await sleep(1000);
out.replay = await ev(`JSON.stringify({steps: __game().steps, state: __game().state, flames: __game().player.flames, score: __game().score, end: document.getElementById("end").className})`);
const ok = JSON.parse(out.afterW).pos[2] > 5 && JSON.parse(out.later).state === "lost" && JSON.parse(out.replay).state === "playing" && JSON.parse(out.replay).flames === 3;
out.result = ok ? "PASS" : "FAIL";
console.log(JSON.stringify(out, null, 1));
proc.kill();
process.exit(0);
