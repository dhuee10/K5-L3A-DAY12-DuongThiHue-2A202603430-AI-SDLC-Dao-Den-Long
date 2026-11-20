// Drives the REAL browser game over Chrome DevTools Protocol (real key presses, reads live state).
// usage: node tools/browser-check.mjs <chrome-path> [base-url] [--gpu]
// Needs the game server running (PORT=8099 node tools/serve.mjs). Prints JSON with "result": "PASS"/"FAIL".
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const chrome = args[0], base = (args[1] && !args[1].startsWith('--') ? args[1] : 'http://localhost:8099').replace(/\/$/, '');
const gpu = args.includes('--gpu');
const port = 9333;
const flags = ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'ddl-chrome-'))}`, '--window-size=1280,720'];
if (!gpu) flags.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
const proc = spawn(chrome, [...flags, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); pending.get(d.id)?.(d); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.result?.value;
const key = async (code, k, holdMs = 60) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: k }); await sleep(holdMs); await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k }); };
const nav = async (url) => { await send('Page.navigate', { url }); await sleep(2500); };
await send('Page.enable');

const out = {}, checks = [];
const ok = (name, cond, detail) => { checks.push({ name, pass: !!cond, detail }); };

// 1. movement in real time
await nav(`${base}/?autostart&night=1`);
const z0 = await ev('__game().player.pos[2]');
await key('KeyW', 'w', 1500);
const z1 = await ev('__game().player.pos[2]');
ok('W moves Mây forward (~6 m/s)', z1 - z0 > 6, { moved: +(z1 - z0).toFixed(2) });

// 2. pause freezes logic, resume continues
await key('Escape', 'Escape');
const s1 = await ev('__game().simTick'); await sleep(1000); const s2 = await ev('__game().simTick');
ok('Esc pauses: sim frozen + menu shown', s1 === s2 && (await ev('__mode()')) === 'paused' && !(await ev('document.getElementById("pause").classList.contains("hidden")')), { s1, s2 });
await key('KeyP', 'p'); await sleep(500);
ok('P resumes', (await ev('__mode()')) === 'play' && (await ev('__game().simTick')) > s2, {});

// 3. settings persist across reloads
await ev(`(()=>{const v=document.getElementById('vol'); v.value=33; v.dispatchEvent(new Event('input')); const s=document.getElementById('sens'); s.value=150; s.dispatchEvent(new Event('input'));})()`);
await nav(`${base}/`);
const saved = await ev(`[document.getElementById('vol').value, document.getElementById('sens').value]`);
ok('Settings (volume, mouse sensitivity) saved between sessions', saved[0] === '33' && saved[1] === '150', { saved });

// 4. full flow: menu -> intro -> play -> win -> next night ... -> dawn; lose -> replay same night
await ev(`document.getElementById('btnStart').click()`); await sleep(300);
ok('Menu -> Night 1 intro with Ông Đăng', (await ev('__mode()')) === 'intro' && /Ông Đăng/.test(await ev(`document.getElementById('introQuote').textContent`)), { name: await ev(`document.getElementById('introName').textContent`) });
const winNight = `(()=>{const g=__game(); const ls=g.lanterns; ls.forEach((l,i)=>{ if(i<ls.length-1) l.lit=true; }); const l=ls.at(-1); g.player.pos=[l.pos[0]+1,l.pos[1],l.pos[2]]; g.player.grounded=true; g.player.carried=10; g.shades.length=0; })()`;
for (const n of [1, 2, 3]) {
  await ev(`document.getElementById('btnGo').click()`); await sleep(400);
  ok(`Night ${n} starts`, (await ev('__game().night')) === n && (await ev('__mode()')) === 'play', {});
  await ev(winNight); await key('KeyE', 'e'); await sleep(1600);
  if (n < 3) {
    ok(`Night ${n} win -> result -> next`, (await ev('__mode()')) === 'result' && (await ev(`document.getElementById('btnNext').textContent`)) === `Sang Đêm ${n + 1}`, {});
    await ev(`document.getElementById('btnNext').click()`); await sleep(300);
  }
}
const totalShown = await ev(`document.getElementById('dawnScore').textContent`);
ok('Night 3 win -> Bình Minh screen with total score', (await ev('__mode()')) === 'dawn' && +totalShown > 0, { total: totalShown });

// lose -> replay same night
await nav(`${base}/?autostart&night=2`);
await ev(`(()=>{const g=__game(); g.player.flames=1; g.player.invuln=0; g.shades.length=0;})()`);
await ev(`(()=>{const g=__game(); g.shades.push({id:'S9',pos:[g.player.pos[0]+0.3,1,g.player.pos[2]],hover:1,state:'chase',t:0,push:0,pushDir:[1,0],evict:null,heading:0,turn:0});})()`);
await sleep(1800);
const btn = await ev(`document.getElementById('btnNext').textContent`);
await ev(`document.getElementById('btnNext').click()`); await sleep(400);
ok('Lose -> replay the same night', btn === 'Chơi lại Đêm 2' && (await ev('__game().night')) === 2 && (await ev('__game().state')) === 'playing', { btn });

// 5. FPS at 1280x720 over 8 s of play (Night 3, the heaviest map)
await nav(`${base}/?autostart&night=3`);
await ev('window.__fps.length = 0');
await key('KeyW', 'w', 8000);
const fps = await ev('window.__fps.slice(1)');
const avg = fps.reduce((a, b) => a + b, 0) / Math.max(1, fps.length);
out.fps = { renderer: gpu ? 'GPU (ANGLE default)' : 'SwiftShader (software, CPU only)', avg: +avg.toFixed(1), samples: fps.map((f) => +f.toFixed(1)) };
ok('Average FPS >= 30 at 1280x720 (Night 3)', avg >= 30, out.fps);

out.checks = checks;
out.result = checks.every((c) => c.pass) ? 'PASS' : 'FAIL';
console.log(JSON.stringify(out, null, 1));
proc.kill();
process.exit(0);
