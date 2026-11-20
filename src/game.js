// Browser front-end: renders the deterministic sim (src/sim.mjs) with three.js.
// All gameplay rules live in sim.mjs; this file only draws, plays sound, handles menus and reads input.
import * as THREE from 'three';
import { createGame, step, timeLeft, windWarning, TUNING, RULES, TICK_RATE, NIGHTS, fuelOf, capacityOf, winThreshold } from './sim.mjs';
import { groundAt } from './maps.mjs';

const $ = (id) => document.getElementById(id);
const C = { // TICKET-02 standard palette
  sky: 0x0E1430, fog: 0x1B2350, grass: 0x2F5D50, sand: 0xC9B48A, wood: 0x6B4A2F, sea: 0x12384A,
  lit: 0xFFB347, core: 0xFFE9B0, off: 0x5B5F6E, moteCore: 0xFFF6C2, moteHalo: 0xFFE58A,
  shade: 0x120A1A, shadeRim: 0x7A3CFF, shadeStun: 0x3A3450, shirt: 0xE8E2D0, scarf: 0xC8102E, gold: 0xF2C14E, drifter: 0x8FA3B8,
};
const STORY = {
  1: 'Đảo Bến là nơi thuyền mây ghé đầu tiên. Thắp năm ngọn đèn để người đi biển mây tìm được đường về, cháu nhé.',
  2: 'Đảo Cau có hai nửa nối bằng cầu tre. Bục nhảy sẽ đưa cháu qua đảo bên kia. Cẩn thận Gió Lạc, chúng thích cướp đom đóm của người mang nhiều.',
  3: 'Đảo Chuông cao ba tầng, gió mạnh lắm. Khi lá bay rối là gió sắp nổi, đứng vững nhé. Đèn cao nhất nằm cạnh tháp chuông.',
};

// ---------- settings (persisted) ----------
const settings = (() => { try { return { volume: 70, sens: 100, cb: false, ...JSON.parse(localStorage.getItem('ddl-settings') || '{}') }; } catch { return { volume: 70, sens: 100, cb: false }; } })();
const SHADE_RIM = () => (settings.cb ? 0x00B3FF : C.shadeRim); // TICKET-03 §6 colour-blind palette
const applyCb = () => document.body.classList.toggle('cb', !!settings.cb);
applyCb();
const saveSettings = () => { try { localStorage.setItem('ddl-settings', JSON.stringify(settings)); } catch { /* private mode */ } };

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(C.sky);
scene.fog = new THREE.Fog(C.fog, 30, 120);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 500);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
const ambient = new THREE.AmbientLight(0x8890c0, 0.15);
const moon = new THREE.DirectionalLight(0xb8c0ff, 0.3); moon.position.set(-30, 60, -20);
scene.add(ambient, moon);
const sea = new THREE.Mesh(new THREE.CircleGeometry(400, 48), new THREE.MeshLambertMaterial({ color: C.sea }));
sea.rotation.x = -Math.PI / 2; sea.position.y = -9; scene.add(sea);
const puffMat = new THREE.MeshLambertMaterial({ color: 0x1d4a5e });
for (let i = 0; i < 60; i++) {
  const a = (i / 60) * Math.PI * 2, r = 70 + (i * 37) % 90;
  const puff = new THREE.Mesh(new THREE.SphereGeometry(4 + (i % 5), 10, 8), puffMat);
  puff.position.set(35 + Math.cos(a) * r, -8 + (i % 3), Math.sin(a) * r); puff.scale.y = 0.45; scene.add(puff);
}

const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,246,194,1)'); gr.addColorStop(0.35, 'rgba(255,229,138,.5)'); gr.addColorStop(1, 'rgba(255,229,138,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
})();
const glowMat = new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false });
const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

// ---------- level geometry ----------
let level = null;
function buildLevel(map) {
  if (level) scene.remove(level);
  level = new THREE.Group(); scene.add(level);
  const grass = lambert(C.grass), sand = lambert(C.sand), wood = lambert(C.wood);
  for (const is of map.islands) {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(is.r, is.r - 5, 5, 64), grass);
    top.position.set(is.c[0], -2.5, is.c[1]); level.add(top);
    const beach = new THREE.Mesh(new THREE.RingGeometry(is.r - 1.5, is.r, 64), sand);
    beach.rotation.x = -Math.PI / 2; beach.position.set(is.c[0], 0.02, is.c[1]); level.add(beach);
  }
  if (map.bridge) {
    const b = map.bridge;
    for (let x = b.x0; x < b.x1; x += 0.6) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, b.z1 - b.z0), wood);
      plank.position.set(x + 0.25, -0.08, 0); level.add(plank);
    }
  }
  if (map.night === 3) {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, 24, 0, Math.PI, false); shape.absarc(0, 0, 12, Math.PI, 0, true);
    const tier1 = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: false, curveSegments: 32 }), grass);
    tier1.rotation.x = Math.PI / 2; tier1.position.y = 3; level.add(tier1);
    const tier2 = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 6, 40), grass); tier2.position.y = 3; level.add(tier2);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 8, 20), wood); tower.position.y = 10; level.add(tower);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.8, 2.2, 20), lambert(0x7a2a20)); roof.position.y = 15.1; level.add(roof);
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 10, 0, Math.PI * 2, 0, Math.PI / 1.6), lambert(C.gold, { side: THREE.DoubleSide, emissive: 0x332200 }));
    bell.position.y = 13.4; bell.rotation.x = Math.PI; level.add(bell);
    for (const deg of [30, 150]) {
      const th = (deg * Math.PI) / 180, gp = new THREE.Group();
      gp.rotation.y = -(th + Math.PI); gp.position.set(27 * Math.cos(th), 1.5, 27 * Math.sin(th));
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(6, 3), 0.3, 3), sand); ramp.rotation.z = Math.atan2(3, 6); gp.add(ramp); level.add(gp);
    }
  }
  for (const pad of map.pads) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.12, 24), lambert(C.gold, { emissive: 0x664400 }));
    m.position.set(pad.pos[0], pad.pos[1] + 0.06, pad.pos[2]); level.add(m);
    const s = new THREE.Sprite(glowMat); s.scale.setScalar(3); s.position.set(pad.pos[0], pad.pos[1] + 0.5, pad.pos[2]); level.add(s);
  }
  const treeMat = lambert(0x24473d), trunkMat = lambert(C.wood);
  for (let i = 0; i < 18; i++) {
    const is = map.islands[i % map.islands.length], a = i * 2.4, r = 6 + (i * 13) % (is.r - 10);
    const x = is.c[0] + Math.cos(a) * r, z = is.c[1] + Math.sin(a) * r, gy = groundAt(map, x, z);
    if (gy === null || map.lanterns.some((l) => Math.hypot(l.pos[0] - x, l.pos[2] - z) < 4) || map.pads.some((p) => Math.hypot(p.pos[0] - x, p.pos[2] - z) < 3)) continue;
    if (map.night === 3 && (Math.hypot(x, z) < 9 || Math.abs(Math.hypot(x, z) - 24) < 2 || Math.abs(Math.hypot(x, z) - 12) < 2)) continue;
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.6), trunkMat); trunk.position.y = 0.8;
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.3, 3, 8), treeMat); top.position.y = 2.8;
    t.add(trunk, top); t.position.set(x, gy, z); level.add(t);
  }
}

// ---------- Mây ----------
const may = (() => {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 1.0, 12), lambert(C.shirt)); body.position.y = 0.55;
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 8, 16), lambert(C.scarf)); scarf.rotation.x = Math.PI / 2; scarf.position.y = 1.07;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.04), lambert(C.scarf)); tail.position.set(0.1, 0.9, -0.3);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), lambert(0xf2d2b0)); head.position.y = 1.32;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.42, 20), lambert(0xe8d39a)); hat.position.y = 1.62;
  const lampMat = new THREE.MeshBasicMaterial({ color: C.lit });
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.18, 10), lampMat); lamp.position.set(0.55, 1.05, 0.2);
  const light = new THREE.PointLight(C.lit, 1.2, 9, 1.6); light.position.copy(lamp.position);
  g.add(body, scarf, tail, head, hat, lamp, light);
  g.userData = { lampMat, light };
  scene.add(g); return g;
})();

// ---------- entity pools ----------
const views = { lanterns: new Map(), motes: new Map(), shades: new Map(), drifters: new Map(), charms: new Map() };
const moteGeo = new THREE.SphereGeometry(0.12, 8, 6), moteMat = new THREE.MeshBasicMaterial({ color: C.moteCore });

function makeLantern() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 3.2), lambert(C.wood)); pole.position.y = 1.6;
  const bodyMat = lambert(C.off, { emissive: 0x000000 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.75, 18, 12), bodyMat); body.scale.y = 1.25; body.position.y = 3.6;
  const coreMat = new THREE.MeshBasicMaterial({ color: C.core, transparent: true, opacity: 0 });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), coreMat); core.position.y = 3.6;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 0.25, 12), lambert(0x2a1a14)); cap.position.y = 4.55;
  const light = new THREE.PointLight(C.lit, 0, 24, 1.4); light.position.y = 3.6;
  const glow = new THREE.Sprite(glowMat.clone()); glow.scale.setScalar(5); glow.position.y = 3.6; glow.material.opacity = 0;
  const ring = new THREE.Mesh(new THREE.RingGeometry(TUNING.safe_radius - 0.1, TUNING.safe_radius, 64), new THREE.MeshBasicMaterial({ color: C.lit, transparent: true, opacity: 0, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
  // fuel bar (lit lanterns) and a paper tear (unlit lanterns) so lit/unlit differ without colour
  const barBg = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.18), new THREE.MeshBasicMaterial({ color: 0x0E1430, transparent: true, opacity: 0.8, depthTest: false, fog: false }));
  const barMat = new THREE.MeshBasicMaterial({ color: C.lit, depthTest: false, fog: false });
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.11), barMat); bar.position.z = 0.01;
  const barG = new THREE.Group(); barG.add(barBg, bar); barG.position.y = 5.1; barG.renderOrder = 10;
  const tear = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.06), new THREE.MeshBasicMaterial({ color: 0x0E1430 }));
  tear.position.set(0.15, 3.5, 0.72); tear.rotation.z = 0.5;
  g.add(pole, body, core, cap, light, glow, ring, barG, tear);
  g.userData = { bodyMat, coreMat, light, glow, ring, body, barG, bar, barMat, tear };
  scene.add(g); return g;
}
function makeShade() {
  const g = new THREE.Group();
  const mat = lambert(C.shade, { emissive: 0x05020a });
  const blob = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 12), mat); blob.scale.set(1, 1.15, 1);
  const rimMat = new THREE.MeshBasicMaterial({ color: SHADE_RIM(), transparent: true, opacity: 0.45, side: THREE.BackSide });
  const rim = new THREE.Mesh(new THREE.SphereGeometry(0.85, 16, 12), rimMat); rim.scale.set(1, 1.15, 1);
  const tailM = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.0, 12), mat); tailM.rotation.x = Math.PI; tailM.position.y = -0.8;
  const eyeMat = new THREE.MeshBasicMaterial({ color: SHADE_RIM() });
  const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), eyeMat), e2 = e1.clone();
  e1.position.set(-0.22, 0.15, 0.68); e2.position.set(0.22, 0.15, 0.68);
  g.add(blob, rim, tailM, e1, e2);
  g.userData = { mat, rimMat, eyeMat };
  scene.add(g); return g;
}
function makeDrifter() {
  const g = new THREE.Group(), mat = new THREE.MeshLambertMaterial({ color: C.drifter, side: THREE.DoubleSide, transparent: true, opacity: 0.9, emissive: 0x1a2430 });
  const segs = [];
  for (let i = 0; i < 7; i++) { const s = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.35), mat); g.add(s); segs.push(s); }
  g.userData = { segs, mat };
  scene.add(g); return g;
}
function makeCharm() {
  const g = new THREE.Group();
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.04), new THREE.MeshBasicMaterial({ color: C.scarf }));
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.56, 0.81, 0.05)), new THREE.LineBasicMaterial({ color: C.gold }));
  const glow = new THREE.Sprite(glowMat); glow.scale.setScalar(1.6);
  g.add(paper, edge, glow); scene.add(g); return g;
}

const effects = [];
function pulseRing(pos) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.1, 48), new THREE.MeshBasicMaterial({ color: C.core, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.position.set(pos[0], pos[1] + 0.3, pos[2]); scene.add(m);
  effects.push({ m, t: 0, dur: 0.45, kind: 'ring' });
}
const skyGeo = new THREE.CylinderGeometry(0.22, 0.16, 0.45, 8);
function releaseSkyLanterns(pos) { // creative extra (Phase 1): sky lanterns rise from each lit lantern
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ color: C.lit }));
    const gl = new THREE.Sprite(glowMat); gl.scale.setScalar(1.4); m.add(gl);
    m.position.set(pos[0] + (Math.random() - 0.5) * 2, pos[1] + 4, pos[2] + (Math.random() - 0.5) * 2); scene.add(m);
    effects.push({ m, t: 0, dur: 40, kind: 'sky', vx: (Math.random() - 0.5) * 0.6, vz: (Math.random() - 0.5) * 0.6, vy: 0.9 + Math.random() * 0.6, ph: Math.random() * 6 });
  }
}
// wind leaves (visual warning + gust)
const leafMat = new THREE.MeshBasicMaterial({ color: 0x9fbf6a, side: THREE.DoubleSide });
const leaves = Array.from({ length: 40 }, () => { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.15), leafMat); m.visible = false; scene.add(m); return { m, a: Math.random() * 6.28, r: 2 + Math.random() * 10, h: Math.random() * 4 }; });

// ---------- audio (WebAudio, generated) ----------
let actx = null, master = null, musicOn = false, nextNote = 0;
const PENTA = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];
function ensureAudio() {
  if (actx) return;
  try { actx = new AudioContext(); master = actx.createGain(); master.connect(actx.destination); applyVolume(); } catch { actx = null; }
}
const applyVolume = () => { if (master) master.gain.value = settings.volume / 100; };
function tone(freq, dur = 0.25, type = 'sine', vol = 0.12, when = 0) {
  if (!actx) return;
  const t0 = actx.currentTime + when, o = actx.createOscillator(), gn = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(vol, t0 + 0.015); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(gn).connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
}
function music() { // soft night pad + sparse pentatonic notes
  if (!actx || !musicOn) return;
  if (actx.currentTime >= nextNote) {
    const f = PENTA[Math.floor(Math.random() * PENTA.length)] / 2;
    tone(f, 2.6, 'sine', 0.035); tone(f * 1.5, 2.2, 'triangle', 0.015, 0.4);
    nextNote = actx.currentTime + 1.2 + Math.random() * 1.6;
  }
}
const SFX = {
  mote_picked: (d) => tone(PENTA[d.carried % PENTA.length] * 2, 0.18, 'sine', 0.08),
  deposit: () => tone(392, 0.3, 'triangle', 0.1),
  lantern_lit: () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.9, 'triangle', 0.09, i * 0.09)),
  pulse: () => { tone(880, 0.35, 'sine', 0.1); tone(1320, 0.3, 'sine', 0.06, 0.04); },
  player_hit: () => tone(140, 0.4, 'sawtooth', 0.07),
  shade_spawned: () => { tone(98, 0.7, 'sine', 0.06); tone(92.5, 0.7, 'sine', 0.05, 0.1); },
  dash: () => tone(660, 0.12, 'square', 0.04),
  charm_picked: () => [784, 988, 1175].forEach((f, i) => tone(f, 0.3, 'triangle', 0.07, i * 0.06)),
  drifter_steal: () => tone(300, 0.5, 'sawtooth', 0.05),
  refuel: () => tone(587.33, 0.25, 'triangle', 0.08),
  lantern_out: () => [440, 330, 220].forEach((f, i) => tone(f, 0.5, 'sine', 0.07, i * 0.12)),
  game_over: (d) => d.result === 'won' ? [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, 1.2, 'triangle', 0.09, i * 0.15)) : [392, 330, 262].forEach((f, i) => tone(f, 0.8, 'sine', 0.08, i * 0.25)),
};
const jumpSfx = () => tone(520, 0.15, 'triangle', 0.06);

// ---------- input ----------
const keys = new Set();
let camYaw = 0, dragging = false, lastX = 0;
addEventListener('keydown', (e) => {
  if (e.repeat && (e.code === 'Escape' || e.code === 'KeyP')) return;
  keys.add(e.code);
  if (e.code === 'Escape' || e.code === 'KeyP') { if (mode === 'play') setPaused(true); else if (mode === 'paused') setPaused(false); }
  if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); if (mode === 'play') setPaused(true); });
renderer.domElement.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; });
addEventListener('pointerup', () => { dragging = false; });
addEventListener('pointermove', (e) => { if (dragging && mode === 'play') { camYaw -= (e.clientX - lastX) * 0.3 * (settings.sens / 100); lastX = e.clientX; } });

function readInput() {
  const k = (c) => keys.has(c);
  const x = (k('KeyA') ? 1 : 0) - (k('KeyD') ? 1 : 0); // three.js camera along +Z: screen-right is -X
  const z = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0);
  return { move: [x, z], cam_yaw_deg: camYaw, jump: k('Space'), interact: k('KeyE'), pulse: k('KeyF') || k('KeyJ'), dash: k('ShiftLeft') || k('ShiftRight') || k('KeyK'), pause: false };
}

// ---------- flow: menu -> intro -> play -> result -> next night -> dawn ----------
let mode = 'menu', game = null, night = 1, total = 0, acc = 0, settingsReturn = 'menu', lastCountdown = -1;
const overlays = ['menu', 'intro', 'pause', 'settings', 'result', 'dawn'];
const show = (id) => { for (const o of overlays) $(o).classList.toggle('hidden', o !== id); $('hudRoot').classList.toggle('hidden', !(id === null || id === 'pause' || id === 'result')); };

function clearViews() {
  for (const m of Object.values(views)) { for (const v of m.values()) scene.remove(v); m.clear(); }
  for (const e of effects) scene.remove(e.m);
  effects.length = 0;
}
function showIntro(n) {
  night = n; mode = 'intro';
  const map = NIGHTS[n];
  $('introNight').textContent = `Đêm ${n}`; $('introName').textContent = map.name;
  $('introQuote').textContent = `"${STORY[n]}" (Ông Đăng)`;
  const need = Math.ceil(TUNING.win_ratio * map.lanterns.length - 1e-9);
  $('introGoal').textContent = `Giữ ít nhất ${need}/${map.lanterns.length} Đèn Lồng Lớn còn sáng tới bình minh (${Math.floor(map.duration_s / 60)}:${String(map.duration_s % 60).padStart(2, '0')}). Đèn cháy hết dầu sẽ tắt: châm thêm đom đóm để giữ lửa.`;
  buildLevel(map); clearViews();
  show('intro');
}
function startNight() {
  clearViews();
  game = createGame({ seed: Date.now() >>> 0, night });
  acc = 0; camYaw = 0; lastCountdown = -1; mode = 'play';
  ensureAudio(); musicOn = true;
  $('bar').innerHTML = '<i></i>'.repeat(TUNING.capacity_max);
  show(null);
}
function setPaused(p) { mode = p ? 'paused' : 'play'; show(p ? 'pause' : null); musicOn = !p; }
function onGameOver({ result, reason }) {
  musicOn = false;
  const why = { dawn_survived: `Bình minh lên, ${game.map.name} vẫn còn sáng!`, dawn: 'Trời đã sáng nhưng đảo còn quá ít đèn.', no_flames: 'Mây đã mất hết lửa trong sương đen.' }[reason];
  setTimeout(() => {
    if (result === 'won') {
      total += game.score;
      if (night === 3) { mode = 'dawn'; $('dawnScore').textContent = total; show('dawn'); return; }
      $('resTitle').textContent = `Đêm ${night} hoàn thành!`;
      $('btnNext').textContent = `Sang Đêm ${night + 1}`;
      $('btnNext').onclick = () => showIntro(night + 1);
    } else {
      $('resTitle').textContent = 'Thua rồi…';
      $('btnNext').textContent = `Chơi lại Đêm ${night}`;
      $('btnNext').onclick = () => startNight();
    }
    $('resText').innerHTML = `${why}<br>Điểm đêm này: <b>${result === 'won' ? game.score : 0}</b> · Tổng điểm: <b>${total}</b>`;
    mode = 'result'; show('result');
  }, 1000);
}
$('btnStart').onclick = () => { total = 0; ensureAudio(); showIntro(1); };
$('btnGo').onclick = startNight;
$('btnResume').onclick = () => setPaused(false);
$('btnRestart').onclick = startNight;
$('btnMenu').onclick = $('btnMenu2').onclick = $('btnDawnMenu').onclick = () => { mode = 'menu'; musicOn = false; game = null; clearViews(); show('menu'); };
const openSettings = (from) => { settingsReturn = from; show('settings'); };
$('btnSettings1').onclick = () => openSettings('menu');
$('btnSettings2').onclick = () => openSettings('pause');
$('btnSettingsBack').onclick = () => show(settingsReturn);
$('vol').value = settings.volume; $('sens').value = settings.sens; $('cb').checked = !!settings.cb;
$('cb').onchange = (e) => { settings.cb = e.target.checked; applyCb(); saveSettings(); for (const v of views.shades.values()) { v.userData.rimMat.color.set(SHADE_RIM()); v.userData.eyeMat.color.set(SHADE_RIM()); } };
const syncSettingsUi = () => { $('volVal').textContent = settings.volume + '%'; $('sensVal').textContent = (settings.sens / 100).toFixed(1) + '×'; };
$('vol').oninput = (e) => { settings.volume = +e.target.value; applyVolume(); syncSettingsUi(); saveSettings(); };
$('sens').oninput = (e) => { settings.sens = +e.target.value; syncSettingsUi(); saveSettings(); };
syncSettingsUi();

function handleEvents(events) {
  for (const e of events) {
    SFX[e.name]?.(e.data);
    if (e.name === 'pulse') pulseRing(game.player.pos);
    if (e.name === 'lantern_lit') releaseSkyLanterns(game.lanterns.find((l) => l.id === e.data.lantern_id).pos);
    if (e.name === 'player_hit') flashT = 0.35;
    if (e.name === 'game_over') onGameOver(e.data);
  }
}

// ---------- sync + render ----------
let flashT = 0, time = 0, facing = 0;
const tmpV = new THREE.Vector3();
function pool(map, list, make, apply) {
  const seen = new Set();
  for (const e of list) { seen.add(e.id); let v = map.get(e.id); if (!v) { v = make(e); map.set(e.id, v); } apply(v, e); }
  for (const [id, v] of map) if (!seen.has(id)) { scene.remove(v); map.delete(id); }
}

function sync(dt) {
  time += dt;
  const p = game.player;
  may.position.set(p.pos[0], p.pos[1], p.pos[2]);
  const want = Math.atan2(p.facing[0], p.facing[1]);
  let d = want - facing; d = Math.atan2(Math.sin(d), Math.cos(d)); facing += d * Math.min(1, dt * 12);
  may.rotation.y = facing;
  may.visible = p.fallWait === 0 && !(p.invuln > 0 && Math.floor(time * 12) % 2 === 0);
  const carry = p.carried / TUNING.carry_capacity;
  may.userData.light.intensity = 0.6 + carry * 2.2; // creative extra: hat lantern brightens with carried light
  may.userData.lampMat.color.setHSL(0.09, 1, 0.45 + carry * 0.25);

  let litCount = 0;
  pool(views.lanterns, game.lanterns, makeLantern, (v, l) => {
    v.position.set(l.pos[0], l.pos[1], l.pos[2]);
    const u = v.userData, cost = l.everLit ? TUNING.relight_cost : TUNING.lantern_cost, frac = l.lit ? 1 : l.deposited / cost;
    if (l.lit) litCount++;
    const fuel = fuelOf(l), low = l.lit && fuel < TUNING.low_fuel_threshold, blinkOff = low && Math.floor(time) % 2 === 1; // 1 Hz slow blink
    u.body.scale.set(l.lit ? 1 : 0.8, l.lit ? 1.25 : 1.0, l.lit ? 1 : 0.8); // unlit: squashed 20 %
    u.tear.visible = !l.lit;
    u.barG.visible = l.lit && !blinkOff;
    u.bar.scale.x = Math.max(0.001, fuel / TUNING.fuel_max); u.bar.position.x = -0.75 * (1 - fuel / TUNING.fuel_max);
    u.barMat.color.set(low ? (settings.cb ? 0xFFFFFF : 0xFF5A5F) : C.lit);
    u.barG.quaternion.copy(camera.quaternion);
    u.light.intensity += ((l.lit ? (blinkOff ? 0.6 : 2.6) : frac * 0.6) - u.light.intensity) * Math.min(1, dt * 6);
    u.bodyMat.color.set(l.lit ? C.lit : C.off);
    u.bodyMat.emissive.set(C.lit).multiplyScalar(l.lit ? 0.8 : frac * 0.35);
    u.coreMat.opacity = l.lit ? 1 : frac * 0.6;
    u.glow.material.opacity = l.lit ? (blinkOff ? 0.2 : 0.75 + Math.sin(time * 2 + l.pos[0]) * 0.1) : frac * 0.3;
    u.ring.material.opacity = l.lit && !low ? 0.3 : 0; // no safe zone below 30 fuel
  });
  pool(views.motes, game.motes, () => {
    const v = new THREE.Mesh(moteGeo, moteMat); const s = new THREE.Sprite(glowMat); s.scale.setScalar(1.1); v.add(s);
    v.userData.ph = Math.random() * 6; scene.add(v); return v;
  }, (v, m) => {
    v.position.set(m.pos[0] + Math.sin(time * 1.3 + v.userData.ph) * 0.15, m.pos[1] + 0.9 + Math.sin(time * 2 + v.userData.ph) * 0.25, m.pos[2]);
    v.visible = !(m.kind === 'dropped' && m.ttl < 120 && Math.floor(time * 8) % 2 === 0); // creative: dropped motes blink before vanishing
  });
  pool(views.shades, game.shades, makeShade, (v, s) => {
    v.position.set(s.pos[0], s.pos[1] - 0.4 + Math.sin(time * 3 + s.pos[0]) * 0.12, s.pos[2]);
    v.lookAt(p.pos[0], v.position.y, p.pos[2]);
    const stunned = s.state === 'stunned', spawning = s.state === 'spawning';
    v.userData.mat.color.set(stunned ? C.shadeStun : C.shade);
    v.userData.rimMat.opacity = stunned ? 0.15 : 0.45;
    v.scale.setScalar(spawning ? Math.min(1, 0.2 + (1 - s.t / RULES.shade_spawning_ticks) * 0.8) : stunned ? 0.8 : 1);
  });
  pool(views.drifters, game.drifters.filter((d) => d.state !== 'removed'), makeDrifter, (v, dr) => {
    v.position.set(dr.pos[0], dr.pos[1], dr.pos[2]);
    v.userData.segs.forEach((s, i) => { s.position.set(Math.sin(time * 6 - i * 0.7) * 0.3, Math.sin(time * 4 - i) * 0.15, -i * 0.35); s.rotation.y = Math.sin(time * 5 - i) * 0.6; });
    v.lookAt(p.pos[0], dr.pos[1], p.pos[2]); if (dr.state === 'flee') v.rotateY(Math.PI);
    v.userData.mat.opacity = dr.state === 'flee' ? 0.6 : 0.9;
  });
  pool(views.charms, game.charms, makeCharm, (v, c) => { v.visible = c.available; v.position.set(c.pos[0], c.pos[1] + 1 + Math.sin(time * 2) * 0.15, c.pos[2]); v.rotation.y = time * 1.5; });

  // island brightens with progress: ambient = 0.15 + 0.55 * lit/total
  const k = litCount / game.lanterns.length;
  ambient.intensity = 0.15 + 0.55 * k;
  scene.background.set(C.sky).lerp(new THREE.Color(C.fog), k * 0.6);
  if (flashT > 0) { flashT -= dt; scene.background.lerp(new THREE.Color(C.shadeRim), Math.max(0, flashT)); }

  // wind leaves
  const warn = windWarning(game), gust = game.wind.active > 0;
  const wa = (game.wind.dir * Math.PI) / 180;
  for (const lf of leaves) {
    lf.m.visible = warn || gust;
    if (!lf.m.visible) continue;
    if (gust) { lf.a += dt * 0.2; lf.r += dt * 4; if (lf.r > 14) lf.r = 1; }
    else { lf.a += dt * 2; }
    const bx = gust ? Math.cos(wa) * lf.r : Math.cos(lf.a) * lf.r, bz = gust ? Math.sin(wa) * lf.r : Math.sin(lf.a) * lf.r;
    lf.m.position.set(p.pos[0] + bx + Math.sin(lf.a * 3) * 2, p.pos[1] + 0.5 + lf.h + Math.sin(time * 3 + lf.a), p.pos[2] + bz + Math.cos(lf.a * 3) * 2);
    lf.m.rotation.set(time * 3 + lf.a, time * 2, 0);
  }

  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i]; e.t += dt;
    if (e.kind === 'ring') { e.m.scale.setScalar(1 + (e.t / e.dur) * (TUNING.pulse_radius - 1)); e.m.material.opacity = 0.9 * (1 - e.t / e.dur); }
    else { e.m.position.x += (e.vx + Math.sin(time + e.ph) * 0.3) * dt; e.m.position.z += e.vz * dt; e.m.position.y += e.vy * dt; }
    if (e.t >= e.dur) { scene.remove(e.m); effects.splice(i, 1); }
  }

  const th = (camYaw * Math.PI) / 180;
  const fy = p.fallWait > 0 ? game.map.start[1] : p.pos[1];
  camera.position.lerp(tmpV.set(p.pos[0] - Math.sin(th) * 9, Math.max(fy, -6) + 5.5, p.pos[2] - Math.cos(th) * 9), Math.min(1, dt * 8));
  camera.lookAt(p.pos[0], Math.max(p.pos[1], -6) + 1.4, p.pos[2]);
  hud(litCount);
}

function hud(litCount) {
  const p = game.player;
  $('flames').innerHTML = Array.from({ length: TUNING.flames }, (_, i) => `<span class="${i < p.flames ? 'on' : 'out'}">♦</span>`).join('');
  const tl = Math.max(0, Math.ceil(timeLeft(game) - 1e-9));
  $('timer').textContent = `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`;
  $('timer').classList.toggle('danger', tl <= 30);
  if (tl <= 30 && settings.cb) $('timer').textContent = '⚠ ' + $('timer').textContent;
  if (tl <= 10 && tl > 0 && tl !== lastCountdown && game.state === 'playing') { lastCountdown = tl; tone(tl <= 3 ? 990 : 740, 0.12, 'square', 0.05); }
  $('lit').textContent = `${litCount}/${game.lanterns.length} (cần ${winThreshold(game)})`;
  $('carry').textContent = `${p.carried}/${capacityOf(p)}`;
  $('score').textContent = game.score;
  [...$('bar').children].forEach((el, i) => { el.classList.toggle('f', i < p.carried); el.style.display = i < capacityOf(p) ? '' : 'none'; });
  const cd = (el, left, total, ready) => { const f = total ? 1 - left / total : 1; el.style.background = `conic-gradient(rgba(242,193,78,${ready ? 0.85 : 0.35}) ${f * 360}deg, rgba(14,20,48,.7) 0)`; };
  cd($('cdDash'), p.charm > 0 ? 0 : p.dashCd, 90, p.dashCd === 0 || p.charm > 0);
  cd($('cdPulse'), p.pulseCd, 180, p.pulseCd === 0 && p.carried >= TUNING.pulse_cost);
  $('charmTag').classList.toggle('hidden', p.charm <= 0);
  $('charmTag').textContent = `Bùa Gió ${Math.ceil(p.charm / 60)}s`;
  $('wind').textContent = game.wind.active > 0 ? 'Gió mạnh!' : windWarning(game) ? 'Lá bay… gió sắp nổi!' : '';
  let hint = '';
  const near = game.lanterns.filter((l) => (!l.lit || fuelOf(l) < TUNING.fuel_max - 0.05) && Math.hypot(l.pos[0] - p.pos[0], l.pos[2] - p.pos[2]) <= TUNING.interact_radius)
    .sort((a, b) => Math.hypot(a.pos[0] - p.pos[0], a.pos[2] - p.pos[2]) - Math.hypot(b.pos[0] - p.pos[0], b.pos[2] - p.pos[2]))[0];
  if (near) hint = near.lit ? `E — Châm dầu (${fuelOf(near).toFixed(0)}/${TUNING.fuel_max})` : `E — Nạp ánh sáng (${near.deposited}/${near.everLit ? TUNING.relight_cost : TUNING.lantern_cost})`;
  else if (p.carried >= capacityOf(p)) hint = 'Túi đã đầy, mang về đèn thôi!';
  $('hint').textContent = hint;
  // arrow to the nearest unlit lantern when it is off-screen
  const target = game.lanterns.filter((l) => !l.lit || fuelOf(l) < TUNING.low_fuel_threshold).sort((a, b) => Math.hypot(a.pos[0] - p.pos[0], a.pos[2] - p.pos[2]) - Math.hypot(b.pos[0] - p.pos[0], b.pos[2] - p.pos[2]))[0];
  const arrow = $('arrow');
  if (target) {
    tmpV.set(target.pos[0], target.pos[1] + 3.6, target.pos[2]).project(camera);
    const behind = tmpV.z > 1, off = behind || Math.abs(tmpV.x) > 0.95 || Math.abs(tmpV.y) > 0.95;
    arrow.classList.toggle('hidden', !off);
    if (off) {
      let x = tmpV.x, y = tmpV.y; if (behind) { x = -x; y = -y; }
      const ang = Math.atan2(x, y), m = Math.max(Math.abs(x), Math.abs(y)) || 1;
      const sx = (x / m) * 0.88, sy = (y / m) * 0.88;
      arrow.style.left = `${((sx + 1) / 2) * innerWidth - 14}px`; arrow.style.top = `${((1 - sy) / 2) * innerHeight - 15}px`;
      arrow.style.transform = `rotate(${ang}rad)`;
    }
  } else arrow.classList.add('hidden');
}

let last = performance.now(), fpsAcc = 0, fpsN = 0;
window.__fps = [];
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 1) { const f = fpsN / fpsAcc; window.__fps.push(f); $('fps').textContent = `${f.toFixed(0)} FPS`; fpsAcc = 0; fpsN = 0; }
  if (game) {
    if (mode === 'play' && game.state === 'playing') {
      acc += dt;
      while (acc >= 1 / TICK_RATE) {
        acc -= 1 / TICK_RATE;
        const wasGrounded = game.player.grounded;
        handleEvents(step(game, readInput()));
        if (wasGrounded && !game.player.grounded && game.player.vel[1] > 6.9) jumpSfx();
        if (game.state !== 'playing') break;
      }
      if (keys.has('ArrowLeft')) camYaw += 120 * dt * (settings.sens / 100);
      if (keys.has('ArrowRight')) camYaw -= 120 * dt * (settings.sens / 100);
      music();
    }
    sync(mode === 'paused' ? 0 : dt);
  } else {
    camera.position.set(Math.sin(now / 6000) * 50, 25, Math.cos(now / 6000) * 50);
    camera.lookAt(0, 0, 0);
    if (!level) buildLevel(NIGHTS[1]);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__game = () => game;
window.__mode = () => mode;

// Evidence helpers: ?night=N&autostart skips menus; ?showcase pre-lights lanterns for screenshots.
const qs = new URLSearchParams(location.search);
if (qs.has('autostart') || qs.has('showcase')) {
  showIntro(+(qs.get('night') || 1)); startNight();
  if (qs.has('showcase')) {
    game.lanterns[0].lit = true; game.lanterns[0].fuel = 80 * 60; game.lanterns[0].everLit = true;
    game.lanterns[1].lit = true; game.lanterns[1].fuel = 22 * 60; game.lanterns[1].everLit = true; game.lanterns[2].deposited = 6; game.player.lights = 2;
    game.player.carried = 9; const l = game.lanterns[0].pos; game.player.pos = [l[0] + 3, l[1], l[2] - 8];
  }
}
