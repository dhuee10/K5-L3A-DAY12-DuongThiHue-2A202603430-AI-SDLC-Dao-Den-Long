// Browser front-end: renders the deterministic sim (src/sim.mjs) with three.js.
// All gameplay rules live in sim.mjs; this file only draws, plays sounds and reads the keyboard.
import * as THREE from 'three';
import { createGame, step, timeLeft, TUNING, RULES, TICK_RATE } from './sim.mjs';

const $ = (id) => document.getElementById(id);
const WARM = new THREE.Color(0xffb347), VIOLET = new THREE.Color(0x6a3fa0);

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const NIGHT_FOG = new THREE.Color(0x1a0f2e), DAWN_FOG = new THREE.Color(0x3a2a40);
scene.background = NIGHT_FOG.clone();
scene.fog = new THREE.Fog(NIGHT_FOG.clone(), 25, 95);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 400);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

const hemi = new THREE.HemisphereLight(0x8a7ab8, 0x1a1020, 0.35);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0xb8a8ff, 0.35);
moon.position.set(-30, 50, -20);
scene.add(moon);

// sea of clouds
const sea = new THREE.Mesh(new THREE.CircleGeometry(300, 48), new THREE.MeshLambertMaterial({ color: 0x3b2a5e }));
sea.rotation.x = -Math.PI / 2; sea.position.y = -6; scene.add(sea);
const puffMat = new THREE.MeshLambertMaterial({ color: 0x5a4a80 });
for (let i = 0; i < 70; i++) {
  const a = (i / 70) * Math.PI * 2 + Math.sin(i * 7.3) * 0.2, r = 50 + (i * 37) % 60;
  const puff = new THREE.Mesh(new THREE.SphereGeometry(3 + (i % 5), 10, 8), puffMat);
  puff.position.set(Math.cos(a) * r, -5 + (i % 3), Math.sin(a) * r); puff.scale.y = 0.5; scene.add(puff);
}

// island
const islandMat = new THREE.MeshLambertMaterial({ color: 0x2c3a2a });
const island = new THREE.Mesh(new THREE.CylinderGeometry(RULES.island_radius + 1, RULES.island_radius - 6, 6, 48), islandMat);
island.position.y = -3; scene.add(island);
const rockMat = new THREE.MeshLambertMaterial({ color: 0x3d3550 });
for (let i = 0; i < 26; i++) {
  const a = (i / 26) * Math.PI * 2, r = RULES.island_radius + 0.3;
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8 + (i % 3) * 0.4), rockMat);
  rock.position.set(Math.cos(a) * r, 0.2, Math.sin(a) * r); scene.add(rock);
}
// a few trees (decoration only, no collision)
const treeMat = new THREE.MeshLambertMaterial({ color: 0x1f3326 }), trunkMat = new THREE.MeshLambertMaterial({ color: 0x3a2a20 });
for (let i = 0; i < 14; i++) {
  const a = i * 2.4, r = 10 + (i * 13) % 26;
  const t = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.6), trunkMat); trunk.position.y = 0.8;
  const top = new THREE.Mesh(new THREE.ConeGeometry(1.3, 3, 8), treeMat); top.position.y = 2.8;
  t.add(trunk, top); t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); scene.add(t);
}

// ---------- Mây ----------
function makeMay() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 1.0, 12), new THREE.MeshLambertMaterial({ color: 0x4f7fb0 }));
  body.position.y = 0.55;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), new THREE.MeshLambertMaterial({ color: 0xf2d2b0 }));
  head.position.y = 1.32;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.42, 20), new THREE.MeshLambertMaterial({ color: 0xe8d39a })); // nón lá
  hat.position.y = 1.62;
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.35), new THREE.MeshBasicMaterial({ color: 0x664422 }));
  string.position.set(0.55, 1.28, 0.2);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.18, 10), lampMat);
  lamp.position.set(0.55, 1.05, 0.2);
  const light = new THREE.PointLight(0xffa040, 1.2, 9, 1.6);
  light.position.copy(lamp.position);
  g.add(body, head, hat, string, lamp, light);
  g.userData = { lamp, lampMat, light };
  return g;
}
const may = makeMay();
scene.add(may);

// ---------- dynamic entity pools ----------
const lanternViews = new Map(), moteViews = new Map(), shadeViews = new Map();
const moteGeo = new THREE.SphereGeometry(0.13, 8, 6), moteMat = new THREE.MeshBasicMaterial({ color: 0xffe08a });
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,220,140,1)'); gr.addColorStop(0.3, 'rgba(255,180,80,.5)'); gr.addColorStop(1, 'rgba(255,160,60,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
})();
const glowMat = new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false });

function makeLantern(l) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 3.2), new THREE.MeshLambertMaterial({ color: 0x3a2a24 }));
  pole.position.y = 1.6;
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x3a2850, emissive: 0x1a0c2a });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.75, 18, 12), bodyMat);
  body.scale.y = 1.25; body.position.y = 3.6;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 0.25, 12), new THREE.MeshLambertMaterial({ color: 0x2a1a14 }));
  cap.position.y = 4.55;
  const light = new THREE.PointLight(0xffa040, 0, 22, 1.4); light.position.y = 3.6;
  const glow = new THREE.Sprite(glowMat.clone()); glow.scale.setScalar(5); glow.position.y = 3.6; glow.material.opacity = 0;
  // ring on the ground showing the safe radius once lit
  const ring = new THREE.Mesh(new THREE.RingGeometry(TUNING.safe_radius - 0.08, TUNING.safe_radius, 48), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
  g.add(pole, body, cap, light, glow, ring);
  g.userData = { bodyMat, light, glow, ring, wasLit: false };
  scene.add(g);
  return g;
}

function makeShade() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x24123a, emissive: 0x2a0d45, transparent: true, opacity: 0.92 });
  const blob = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 12), mat);
  blob.scale.set(1, 1.15, 1);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.0, 12), mat); tail.rotation.x = Math.PI; tail.position.y = -0.8;
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xc9a0ff });
  const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), eyeMat), e2 = e1.clone();
  e1.position.set(-0.22, 0.15, 0.65); e2.position.set(0.22, 0.15, 0.65);
  g.add(blob, tail, e1, e2);
  g.userData = { mat, eyeMat };
  scene.add(g);
  return g;
}

// pulse rings + sky lanterns (visual only)
const effects = [];
function pulseRing(pos) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.1, 48), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.position.set(pos[0], 0.3, pos[2]); scene.add(m);
  effects.push({ m, t: 0, dur: 0.45, kind: 'ring' });
}
const skyLanternGeo = new THREE.CylinderGeometry(0.22, 0.16, 0.45, 8);
function releaseSkyLanterns(pos) {
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(skyLanternGeo, new THREE.MeshBasicMaterial({ color: 0xffb05a }));
    const glow = new THREE.Sprite(glowMat); glow.scale.setScalar(1.4); m.add(glow);
    m.position.set(pos[0] + (Math.random() - 0.5) * 2, 4, pos[2] + (Math.random() - 0.5) * 2);
    scene.add(m);
    effects.push({ m, t: 0, dur: 40, kind: 'sky', vx: (Math.random() - 0.5) * 0.6, vz: (Math.random() - 0.5) * 0.6, vy: 0.9 + Math.random() * 0.6, ph: Math.random() * 6 });
  }
}

// ---------- sound (WebAudio, generated, no files) ----------
let actx = null, muted = false;
const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
function tone(freq, dur = 0.25, type = 'sine', vol = 0.12, when = 0) {
  if (!actx || muted) return;
  const t0 = actx.currentTime + when, o = actx.createOscillator(), gn = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(vol, t0 + 0.015); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(gn).connect(actx.destination); o.start(t0); o.stop(t0 + dur + 0.05);
}
const SFX = {
  mote_picked: (d) => tone(PENTA[d.carried % PENTA.length] * 2, 0.18, 'sine', 0.08),
  deposit: () => tone(392, 0.3, 'triangle', 0.1),
  lantern_lit: () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.9, 'triangle', 0.09, i * 0.09)),
  pulse: () => { tone(880, 0.35, 'sine', 0.1); tone(1320, 0.3, 'sine', 0.06, 0.04); },
  player_hit: () => tone(140, 0.4, 'sawtooth', 0.06),
  shade_spawned: () => tone(110, 0.6, 'sine', 0.05),
  game_over: (d) => d.result === 'won' ? [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, 1.2, 'triangle', 0.09, i * 0.15)) : [392, 330, 262].forEach((f, i) => tone(f, 0.8, 'sine', 0.08, i * 0.25)),
};

// ---------- input ----------
const keys = new Set();
let camYaw = 0, dragging = false, lastX = 0;
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'KeyM') muted = !muted;
  if ((e.code === 'KeyR' || e.code === 'Enter') && game && game.state !== 'playing') startGame();
  if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
renderer.domElement.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; });
addEventListener('pointerup', () => { dragging = false; });
addEventListener('pointermove', (e) => { if (dragging) { camYaw -= (e.clientX - lastX) * 0.3; lastX = e.clientX; } });

function readInput() {
  const k = (c) => keys.has(c);
  // three.js camera looking along +Z has screen-right = -X, so "right" maps to move x = -1
  const x = (k('KeyA') ? 1 : 0) - (k('KeyD') ? 1 : 0);
  const z = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0);
  return { move: [x, z], cam_yaw_deg: camYaw, jump: k('Space'), interact: k('KeyE'), pulse: k('KeyF') || k('KeyJ') };
}

// ---------- game state ----------
let game = null, acc = 0, last = performance.now(), facing = 0;

function clearViews() {
  for (const m of [lanternViews, moteViews, shadeViews]) { for (const v of m.values()) scene.remove(v); m.clear(); }
  for (const e of effects) scene.remove(e.m);
  effects.length = 0;
}

function startGame() {
  clearViews();
  game = createGame({ seed: (Date.now() >>> 0) });
  acc = 0; camYaw = 0; facing = 0;
  $('end').classList.add('hidden'); $('start').classList.add('hidden');
  $('hud').classList.remove('hidden'); $('help').classList.remove('hidden');
  if (!actx) { try { actx = new AudioContext(); } catch { actx = null; } }
}
$('play').onclick = startGame;
$('again').onclick = startGame;
$('cap').textContent = TUNING.carry_capacity;
$('lcount').textContent = TUNING.lantern_count_night1;

function handleEvents(events) {
  for (const e of events) {
    SFX[e.name]?.(e.data);
    if (e.name === 'pulse') pulseRing(game.player.pos);
    if (e.name === 'lantern_lit') releaseSkyLanterns(game.lanterns.find((l) => l.id === e.data.lantern_id).pos);
    if (e.name === 'player_hit') flashT = 0.35;
    if (e.name === 'game_over') showEnd(e.data);
  }
}

function showEnd({ result, reason }) {
  const why = { all_lit: 'Cả năm Đèn Lồng Lớn đã sáng. Đảo Bến ấm áp trở lại!', dawn: 'Trời đã sáng mà đảo vẫn chưa đủ đèn.', no_flames: 'Mây đã mất hết lửa trong sương đen.' }[reason];
  $('endTitle').textContent = result === 'won' ? 'Chiến thắng!' : 'Thua rồi…';
  $('endText').innerHTML = `${why}<br>Điểm: <b>${game.score}</b> · Đèn đã thắp: ${game.lanterns.filter((l) => l.lit).length}/${game.lanterns.length}`;
  setTimeout(() => $('end').classList.remove('hidden'), 900);
}

// ---------- sync + render ----------
let flashT = 0, time = 0;
function sync(dt) {
  time += dt;
  const p = game.player;
  // Mây
  may.position.set(p.pos[0], p.pos[1], p.pos[2]);
  const mv = readInput().move;
  if (mv[0] || mv[1]) {
    const th = (camYaw * Math.PI) / 180;
    const wx = mv[0] * Math.cos(th) + mv[1] * Math.sin(th), wz = -mv[0] * Math.sin(th) + mv[1] * Math.cos(th);
    const target = Math.atan2(wx, wz);
    let d = target - facing; d = Math.atan2(Math.sin(d), Math.cos(d)); facing += d * Math.min(1, dt * 12);
  }
  may.rotation.y = facing;
  const blink = p.invuln > 0 && Math.floor(time * 12) % 2 === 0;
  may.visible = !blink;
  const carry = p.carried / TUNING.carry_capacity;
  may.userData.light.intensity = 0.6 + carry * 2.2; // hat lantern brightens with carried light
  may.userData.lampMat.color.setHSL(0.09, 1, 0.45 + carry * 0.25);

  // lanterns
  let litCount = 0;
  for (const l of game.lanterns) {
    let v = lanternViews.get(l.id);
    if (!v) { v = makeLantern(l); lanternViews.set(l.id, v); }
    v.position.set(l.pos[0], 0, l.pos[2]);
    const u = v.userData, frac = l.lit ? 1 : l.deposited / TUNING.lantern_cost;
    if (l.lit) litCount++;
    const target = l.lit ? 2.6 : frac * 0.8;
    u.light.intensity += (target - u.light.intensity) * Math.min(1, dt * 3);
    u.bodyMat.emissive.copy(VIOLET).lerp(WARM, frac).multiplyScalar(l.lit ? 1 : 0.25 + frac * 0.5);
    u.glow.material.opacity = l.lit ? 0.75 + Math.sin(time * 2 + l.pos[0]) * 0.1 : frac * 0.3;
    u.ring.material.opacity = l.lit ? 0.25 : 0;
  }

  // motes
  const seen = new Set();
  for (const m of game.motes) {
    seen.add(m.id);
    let v = moteViews.get(m.id);
    if (!v) {
      v = new THREE.Mesh(moteGeo, moteMat); const s = new THREE.Sprite(glowMat); s.scale.setScalar(1.1); v.add(s);
      v.userData.ph = Math.random() * 6; scene.add(v); moteViews.set(m.id, v);
    }
    v.position.set(m.pos[0] + Math.sin(time * 1.3 + v.userData.ph) * 0.15, 0.9 + Math.sin(time * 2 + v.userData.ph) * 0.25, m.pos[2]);
  }
  for (const [id, v] of moteViews) if (!seen.has(id)) { scene.remove(v); moteViews.delete(id); }

  // shades
  for (const s of game.shades) {
    let v = shadeViews.get(s.id);
    if (!v) { v = makeShade(); shadeViews.set(s.id, v); }
    v.position.set(s.pos[0], s.pos[1] + 0.6 + Math.sin(time * 3 + s.pos[0]) * 0.12, s.pos[2]);
    v.lookAt(p.pos[0], v.position.y, p.pos[2]);
    const stunned = s.state === 'stunned';
    v.userData.mat.opacity = stunned ? 0.45 : 0.92;
    v.userData.eyeMat.color.set(stunned ? 0x6a5a80 : 0xc9a0ff);
    v.scale.setScalar(stunned ? 0.8 : 1);
  }

  // island brightens as lanterns are lit
  const k = litCount / TUNING.lantern_count_night1;
  hemi.intensity = 0.35 + k * 0.55;
  scene.background.copy(NIGHT_FOG).lerp(DAWN_FOG, k);
  scene.fog.color.copy(scene.background);
  islandMat.color.setRGB(0.17 + k * 0.12, 0.23 + k * 0.12, 0.16 + k * 0.04);
  if (flashT > 0) { flashT -= dt; scene.background.lerp(new THREE.Color(0x3a1050), Math.max(0, flashT) * 2); }

  // effects
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i]; e.t += dt;
    if (e.kind === 'ring') {
      const s = 1 + (e.t / e.dur) * (TUNING.pulse_radius - 1); e.m.scale.setScalar(s); e.m.material.opacity = 0.9 * (1 - e.t / e.dur);
    } else {
      e.m.position.x += (e.vx + Math.sin(time + e.ph) * 0.3) * dt; e.m.position.z += e.vz * dt; e.m.position.y += e.vy * dt;
    }
    if (e.t >= e.dur) { scene.remove(e.m); effects.splice(i, 1); }
  }

  // camera: behind Mây, looking along the camera yaw
  const th = (camYaw * Math.PI) / 180;
  const cx = p.pos[0] - Math.sin(th) * 9, cz = p.pos[2] - Math.cos(th) * 9;
  camera.position.lerp(new THREE.Vector3(cx, p.pos[1] + 5.5, cz), Math.min(1, dt * 8));
  camera.lookAt(p.pos[0], p.pos[1] + 1.4, p.pos[2]);

  // HUD
  $('flames').innerHTML = 'Lửa: ' + Array.from({ length: TUNING.flames }, (_, i) => `<span class="${i < p.flames ? '' : 'out'}">●</span>`).join(' ');
  $('carried').textContent = p.carried;
  $('lit').textContent = litCount;
  $('score').textContent = game.score;
  const tl = Math.max(0, Math.ceil(timeLeft(game)));
  $('time').textContent = `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`;
  $('pulse').textContent = p.pulseCd > 0 ? 'đang hồi…' : p.carried >= TUNING.pulse_cost ? 'sẵn sàng (F)' : 'cần đom đóm';
  let hint = '';
  if (game.state === 'playing') {
    const near = game.lanterns.find((l) => !l.lit && Math.hypot(l.pos[0] - p.pos[0], l.pos[2] - p.pos[2]) <= TUNING.interact_radius);
    if (near) hint = p.carried > 0 ? `Nhấn E để nạp ánh sáng vào đèn ${near.id} (${near.deposited}/${TUNING.lantern_cost})` : `Đèn ${near.id} cần ${TUNING.lantern_cost - near.deposited} đom đóm nữa`;
    else if (p.carried >= TUNING.carry_capacity) hint = 'Túi đã đầy, mang về đèn thôi!';
  }
  $('hint').textContent = hint;
}

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (game) {
    if (game.state === 'playing') {
      acc += dt;
      while (acc >= 1 / TICK_RATE) {
        acc -= 1 / TICK_RATE;
        handleEvents(step(game, readInput()));
        if (game.state !== 'playing') break;
      }
      if (keys.has('ArrowLeft')) camYaw += 120 * dt;
      if (keys.has('ArrowRight')) camYaw -= 120 * dt;
    }
    sync(dt);
  } else {
    camera.position.set(Math.sin(now / 6000) * 45, 22, Math.cos(now / 6000) * 45);
    camera.lookAt(0, 0, 0);
    if (!lanternViews.size) { const g0 = createGame({ seed: 1 }); for (const l of g0.lanterns) { const v = makeLantern(l); v.position.set(l.pos[0], 0, l.pos[2]); lanternViews.set(l.id, v); } }
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__game = () => game; // debug hook for manual checks in the console

// Screenshot helpers for evidence: ?autostart skips the title card; ?showcase also pre-lights 2 lanterns.
const qs = new URLSearchParams(location.search);
if (qs.has('autostart') || qs.has('showcase')) {
  startGame();
  if (qs.has('showcase')) {
    game.lanterns[0].lit = true; game.lanterns[1].lit = true; game.lanterns[2].deposited = 3;
    game.player.carried = 6; game.player.pos = [3, 0, 14];
  }
}
