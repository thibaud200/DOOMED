"use strict";
/* DOOMED — 01_core.js : constantes, utilitaires, écran, entrées, boucle principale
 *
 * CONTRAT (vérifié par test.html — ne rien retirer de cette liste) :
 *   FOURNIT : W H HUD_H PLAY_H HOR TEX · cv ctx fitCanvas · clamp rand randInt angNorm rgb makeCanvas lireReglages SETTINGS sauverReglages
 *             FB_IMG FB ZBUF · text · KEYS PRESSED MOUSE pressed ENTER · FATAL showFatal
 *             DEBUG_FPS DEBUG_ASSETS FPS · frame
 *   UTILISE (s'il existe) : audioUnlock wantsPointerLock onPointerUnlock gameUpdate gameDraw drawAssetSheet
 *   RÈGLE : touches lues par e.code (position physique). Si window.NO_LOOP est vrai, la boucle ne démarre pas (tests).
 */

const W = 480, H = 320, HUD_H = 48, PLAY_H = H - HUD_H, HOR = PLAY_H / 2;
const TEX = 64;

const cv = document.getElementById('c');
cv.width = W; cv.height = H;
const ctx = cv.getContext('2d');

function fitCanvas() {
  const r = Math.min(innerWidth / W, innerHeight / H);
  const s = r >= 1 ? Math.floor(r) : r;
  cv.style.width = (W * s) + 'px';
  cv.style.height = (H * s) + 'px';
}
addEventListener('resize', fitCanvas);
fitCanvas();

/* ---------- utilitaires ---------- */
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
function angNorm(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
const rgb = (r, g, b) => (0xFF000000 | (b << 16) | (g << 8) | r) >>> 0;
function makeCanvas(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  if (paint) paint(c.getContext('2d'), c);
  return c;
}

function lireReglages() {
  try {
    const raw = localStorage['doomed_settings'];
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return {};
}

const SETTINGS = Object.assign({ sens: 1, volume: 0.45, music: true }, lireReglages());

function sauverReglages() {
  try { localStorage.setItem('doomed_settings', JSON.stringify(SETTINGS)); return true; } catch (e) { return false; }
}

/* ---------- tampon de la vue 3D ---------- */
const FB_IMG = ctx.createImageData(W, PLAY_H);
const FB = new Uint32Array(FB_IMG.data.buffer);
const ZBUF = new Float32Array(W);

/* ---------- texte ---------- */
function text(str, x, y, size, color, align) {
  ctx.font = 'bold ' + size + 'px monospace';
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';
  ctx.fillText(str, x + 1, y + 1);
  ctx.fillStyle = color || '#fff';
  ctx.fillText(str, x, y);
}

/* ---------- entrées (position physique des touches : ZQSD et WASD) ---------- */
const KEYS = Object.create(null);
const PRESSED = new Set();
const MOUSE = { dx: 0, down: false, locked: false };
const pressed = code => PRESSED.has(code);
const ENTER = () => pressed('Enter') || pressed('NumpadEnter');
const BLOCKED = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F1', 'F2']);

addEventListener('keydown', e => {
  if (BLOCKED.has(e.code)) e.preventDefault();
  if (!KEYS[e.code]) PRESSED.add(e.code);
  KEYS[e.code] = true;
  if (typeof audioUnlock === 'function') audioUnlock();
});
addEventListener('keyup', e => { KEYS[e.code] = false; });
addEventListener('blur', () => { for (const k in KEYS) KEYS[k] = false; MOUSE.down = false; });
cv.addEventListener('mousedown', e => {
  if (typeof audioUnlock === 'function') audioUnlock();
  if (e.button === 0) MOUSE.down = true;
  PRESSED.add('Mouse' + e.button);
  if (!MOUSE.locked && cv.requestPointerLock && typeof wantsPointerLock === 'function' && wantsPointerLock()) {
    try { const p = cv.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (err) {}
  }
});
addEventListener('mouseup', e => { if (e.button === 0) MOUSE.down = false; });
addEventListener('mousemove', e => { if (MOUSE.locked) MOUSE.dx += e.movementX || 0; });
document.addEventListener('pointerlockchange', () => {
  MOUSE.locked = document.pointerLockElement === cv;
  if (!MOUSE.locked && typeof onPointerUnlock === 'function') onPointerUnlock();
});
cv.addEventListener('contextmenu', e => e.preventDefault());

/* ---------- erreurs bloquantes affichées à l'écran ---------- */
let FATAL = null;
function showFatal(msg) { FATAL = String(msg); console.error(msg); }
function drawFatal() {
  ctx.fillStyle = '#200'; ctx.fillRect(0, 0, W, H);
  text('ERREUR', W / 2, 24, 18, '#f44', 'center');
  FATAL.split('\n').slice(0, 20).forEach((l, i) => text(l.slice(0, 78), 8, 50 + i * 12, 9, '#fcc'));
}

/* ---------- boucle principale ---------- */
let DEBUG_FPS = false, DEBUG_ASSETS = false, FPS = 0;
let lastT = performance.now(), fpsAcc = 0, fpsN = 0;

function drawPlaceholder() {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  text('DOOMED — Entrée pour jouer', W / 2, H / 2, 16, '#c22', 'center');
}

function frame(t) {
  const dt = Math.min(0.05, Math.max(0, (t - lastT) / 1000));
  lastT = t;
  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 0.5) { FPS = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  if (pressed('F1')) DEBUG_FPS = !DEBUG_FPS;
  if (pressed('F2')) DEBUG_ASSETS = !DEBUG_ASSETS;

  if (!FATAL && window.__bootErr) showFatal('Chargement : ' + window.__bootErr);
  if (FATAL) drawFatal();
  else {
    try {
      if (typeof gameUpdate === 'function') gameUpdate(dt);
      if (typeof gameDraw === 'function') gameDraw(); else drawPlaceholder();
      if (DEBUG_ASSETS && typeof drawAssetSheet === 'function') drawAssetSheet();
    } catch (err) { showFatal((err && err.stack) || err); }
  }
  if (DEBUG_FPS) {
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, 62, 14);
    text(FPS + ' i/s', 4, 7, 10, '#0f0');
  }
  PRESSED.clear();
  MOUSE.dx = 0;
  requestAnimationFrame(frame);
}
addEventListener('load', () => { if (!window.NO_LOOP) requestAnimationFrame(frame); });
