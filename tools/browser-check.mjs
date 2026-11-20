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
await key('Escape', 'Escape'); await sleep(500);
ok('Pause key again resumes', (await ev('__mode()')) === 'play' && (await ev('__game().simTick')) > s2, {});

// 3. settings persist across reloads
await ev(`(()=>{const v=document.getElementById('vol'); v.value=33; v.dispatchEvent(new Event('input')); const s=document.getElementById('sens'); s.value=150; s.dispatchEvent(new Event('input'));})()`);
await nav(`${base}/`);
const saved = await ev(`[document.getElementById('vol').value, document.getElementById('sens').value]`);
ok('Settings (volume, mouse sensitivity) saved between sessions', saved[0] === '33' && saved[1] === '150', { saved });
await ev(`(()=>{const c=document.getElementById('cb'); c.checked=true; c.dispatchEvent(new Event('change'));})()`);
await nav(`${base}/`);
ok('Colour-blind palette setting saved and applied', (await ev(`document.getElementById('cb').checked && document.body.classList.contains('cb')`)) === true, {});
await ev(`(()=>{const c=document.getElementById('cb'); c.checked=false; c.dispatchEvent(new Event('change'));})()`);

// 4. full flow: menu -> intro -> play -> win -> next night ... -> dawn; lose -> replay same night
await ev(`document.getElementById('btnStart').click()`); await sleep(300);
ok('Menu -> Night 1 intro with Ông Đăng', (await ev('__mode()')) === 'intro' && /Ông Đăng/.test(await ev(`document.getElementById('introQuote').textContent`)), { name: await ev(`document.getElementById('introName').textContent`) });
// Phase 3 win rule: survive to dawn with >= 60 % lit. Light every lantern (full fuel) and fast-forward the clock to 0.5 s before dawn.
const winNight = `(()=>{const g=__game(); g.lanterns.forEach((l)=>{ l.lit=true; l.everLit=true; l.fuel=6000; }); g.shades.length=0; g.baseTime = g.simTick/60 + 0.5; })()`;
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
// Phase 4: leaderboard entry after Bình Minh (Vietnamese name = bonus); an invalid name is refused first
const saveIn = (box, name) => ev(`(async()=>{const b=document.getElementById('${box}'); b.querySelector('.nameIn').value=${JSON.stringify(name)}; b.querySelector('.saveBtn').click(); await new Promise(r=>setTimeout(r,700)); return b.querySelector('.saveMsg').textContent;})()`);
const badMsg = await saveIn('saveBoxDawn', 'ab');
const goodMsg = await saveIn('saveBoxDawn', 'Mây_Đêm3');
ok('Bình Minh: name entry rejects "ab", saves "Mây_Đêm3" to the board', /⚠/.test(badMsg) && /Đã lưu/.test(goodMsg), { badMsg, goodMsg });

// lose -> replay same night
await nav(`${base}/?autostart&night=2`);
await ev(`(()=>{const g=__game(); g.player.flames=1; g.player.invuln=0; g.shades.length=0;})()`);
await ev(`(()=>{const g=__game(); g.shades.push({id:'S9',pos:[g.player.pos[0]+0.3,1,g.player.pos[2]],hover:1,state:'chase',t:0,push:0,pushDir:[1,0],evict:null,heading:0,turn:0});})()`);
await sleep(1800);
const btn = await ev(`document.getElementById('btnNext').textContent`);
const loseMsg = await saveIn('saveBoxResult', 'Tester_1');
ok('After a loss: name entry saves to the board', /Đã lưu/.test(loseMsg), { loseMsg });
await ev(`document.getElementById('btnNext').click()`); await sleep(400);
ok('Lose -> replay the same night', btn === 'Chơi lại Đêm 2' && (await ev('__game().night')) === 2 && (await ev('__game().state')) === 'playing', { btn });

// Phase 4: leaderboard screen from the main menu, survives a reload (stored on disk by the server)
await nav(`${base}/`);
await ev(`document.getElementById('btnBoard').click()`); await sleep(600);
const rows = await ev(`[...document.querySelectorAll('#boardRows tr')].map(r=>[...r.children].map(c=>c.textContent))`);
const note = await ev(`document.getElementById('boardNote').textContent`);
ok('Leaderboard screen from menu: entries in score order, stored on disk', rows.length >= 2 && rows.some((r) => r[1] === 'Mây_Đêm3') && rows.some((r) => r[1] === 'Tester_1') && rows.every((r, i) => i === 0 || +rows[i - 1][2] >= +r[2]) && /đĩa/.test(note), { rows, note });

// Phase 4: key remapping, duplicate detection, restore defaults, saved
await ev(`document.getElementById('btnBoardBack').click(); document.getElementById('btnSettings1').click()`);
await ev(`document.querySelector('#keymap button[data-action="jump"]').click()`);
await key('KeyF', 'f');
const dupMsg = await ev(`document.getElementById('keyMsg').textContent`);
const dupBtns = await ev(`document.querySelectorAll('#keymap button.dup').length`);
ok('Remap jump to F (already pulse): duplicate reported and highlighted', /Trùng phím/.test(dupMsg) && dupBtns === 2, { dupMsg, dupBtns });
await ev(`document.querySelector('#keymap button[data-action="jump"]').click()`);
await key('KeyJ', 'j');
await nav(`${base}/?autostart&night=1`);
ok('Remapped key is saved and works in play (J jumps)', (await ev(`JSON.parse(localStorage.getItem('ddl-settings')).keys.jump`)) === 'KeyJ' && await (async () => { await key('KeyJ', 'j', 80); await sleep(150); return (await ev('__game().player.pos[1]')) > 0.3; })(), {});
await ev(`document.getElementById('btnKeysReset').click()`);
ok('Restore defaults', (await ev(`JSON.parse(localStorage.getItem('ddl-settings')).keys.jump`)) === 'Space', {});

// Phase 4: captions + edge arrow when a shade appears; low-fuel caption; last-10-s caption
await ev(`(()=>{const g=__game(); g.simTick=299; g.lanterns[0].lit=true; g.lanterns[0].everLit=true; g.lanterns[0].fuel=29*60;})()`);
await sleep(1200);
const caps = await ev(`[...document.querySelectorAll('#captions div')].map(d=>d.textContent)`);
ok('Captions: "Bóng Mực xuất hiện" and low-fuel lantern', caps.some((c) => /Bóng Mực xuất hiện/.test(c)) && caps.some((c) => /sắp cạn dầu/.test(c)), { caps });
await ev(`(()=>{const g=__game(); g.baseTime = g.simTick/60 + 9.5; g.shades.length=0;})()`);
await sleep(800);
ok('Caption for the last 10 seconds', (await ev(`[...document.querySelectorAll('#captions div')].some(d=>/10 giây cuối/.test(d.textContent))`)) === true, {});

// Phase 4: UI text >= 18 px at 1280x720; large text x1.25; reduced motion setting
const minFont = `(()=>{let m=1e9; for (const el of document.querySelectorAll('body *')) { if (el.offsetParent===null && getComputedStyle(el).position!=='fixed') continue; if (![...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())) continue; const r=el.getBoundingClientRect(); if(!r.width) continue; m=Math.min(m, parseFloat(getComputedStyle(el).fontSize)); } return m;})()`;
const fPlay = await ev(minFont);
await nav(`${base}/`); const fMenu = await ev(minFont);
await ev(`document.getElementById('btnSettings1').click()`); const fSettings = await ev(minFont);
await ev(`(()=>{const c=document.getElementById('big'); c.checked=true; c.dispatchEvent(new Event('change'));})()`);
const fBig = await ev(minFont), rootBig = await ev(`getComputedStyle(document.documentElement).fontSize`);
await ev(`(()=>{const c=document.getElementById('big'); c.checked=false; c.dispatchEvent(new Event('change')); const m=document.getElementById('calm'); m.checked=true; m.dispatchEvent(new Event('change'));})()`);
ok('All visible UI text >= 18 px (play HUD, menu, settings); large text = x1.25', fPlay >= 18 && fMenu >= 18 && fSettings >= 18 && rootBig === '22.5px' && fBig >= 22.5, { fPlay, fMenu, fSettings, fBig, rootBig });
await nav(`${base}/?autostart&night=1`);
await ev(`(()=>{const g=__game(); g.player.invuln=0; g.shades.push({id:'S9',pos:[0.3,1,0],hover:1,state:'chase',t:0,push:0,pushDir:[1,0],evict:null,heading:0,turn:0});})()`);
await sleep(300);
const bg = await ev(`(()=>{return document.body.classList.contains('calm')})()`);
const fx = await ev('__fx()');
ok('Reduced motion: a hit gives no screen flash and no camera shake', bg === true && (await ev('__game().player.flames')) === 2 && fx.flashT <= 0 && fx.shakeT <= 0, fx);
await ev(`(()=>{const m=document.getElementById('calm'); m.checked=false; m.dispatchEvent(new Event('change'));})()`);

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
