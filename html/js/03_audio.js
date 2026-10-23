"use strict";
/* DOOMED — 03_audio.js : effets sonores synthétisés (WebAudio, aucun fichier son)
 *
 * CONTRAT (vérifié par test.html — ne rien retirer de cette liste) :
 *   FOURNIT : audioUnlock tone noise distVol voixMonstre sfx MUSIQUE musicStart musicStop
 *             sfx.{pistol shotgun click hit sight claw bite fireball boom epain edeath hurt pdeath
 *                  pickup weapon door oof switch} — chaque son doit marcher même sans audio (AC nul)
 *   UTILISE : clamp (01)
 */

let AC = null, MASTER = null, NOISE = null;

/* Les navigateurs n'autorisent le son qu'après une action de l'utilisateur. */
function audioUnlock() {
  if (!AC) {
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      MASTER = AC.createGain(); MASTER.gain.value = SETTINGS.volume; MASTER.connect(AC.destination);
      NOISE = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
      const d = NOISE.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { AC = null; return; }
  }
  if (AC.state === 'suspended') AC.resume();
}

function tone(f0, f1, dur, vol, type, delay) {
  if (!AC || vol <= 0) return;
  const t = AC.currentTime + (delay || 0), o = AC.createOscillator(), g = AC.createGain();
  o.type = type || 'square';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(MASTER);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, vol, freq, delay, filter) {
  if (!AC || vol <= 0) return;
  const t = AC.currentTime + (delay || 0), n = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  n.buffer = NOISE;
  f.type = filter || 'lowpass'; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(f).connect(g).connect(MASTER);
  n.start(t, Math.random() * 0.5); n.stop(t + dur + 0.02);
}

/* volume selon la distance au joueur (v = 1 tout près, 0,1 au loin) */
const distVol = d => clamp(1 - d / 18, 0.1, 1);

function voixMonstre(type) {
  var d = null;
  if (typeof ENEMY_DEF !== 'undefined' && ENEMY_DEF[type]) d = ENEMY_DEF[type];
  else d = { scale: 0.9, hp: 100 };
  return {
    f: clamp(Math.round(700 - d.scale * 350 - Math.min(d.hp, 1200) / 4), 45, 700),
    duree: clamp(0.25 + d.scale * 0.35 + Math.min(d.hp, 1200) / 3000, 0.25, 1),
    onde: d.fly ? 'triangle' : (d.ranged || d.hitscan) ? 'sawtooth' : 'square'
  };
}

const sfx = {
  pistol() { noise(0.12, 0.7, 1800); tone(190, 60, 0.08, 0.35, 'square'); },
  shotgun() {
    noise(0.35, 1, 900); tone(120, 40, 0.22, 0.6, 'sawtooth');
    noise(0.06, 0.35, 2500, 0.45, 'highpass'); noise(0.06, 0.35, 2000, 0.62, 'highpass');
  },
  click() { tone(900, 600, 0.04, 0.2, 'square'); },
  hit() { noise(0.08, 0.5, 2200); },
  sight(type, v) {
    if (type === 'imp') { tone(300, 700, 0.35, 0.3 * v, 'sawtooth'); tone(290, 650, 0.35, 0.2 * v, 'square'); }
    else if (type === 'pinky') { tone(90, 50, 0.5, 0.5 * v, 'sawtooth'); noise(0.4, 0.3 * v, 400); }
    else { const vo = voixMonstre(type); tone(vo.f, vo.f * 1.8, vo.duree, 0.4 * v, vo.onde); }
  },
  claw(v) { noise(0.15, 0.5 * v, 3000, 0, 'bandpass'); },
  bite(v) { tone(110, 60, 0.15, 0.5 * v, 'sawtooth'); noise(0.12, 0.4 * v, 700); },
  fireball(v) { noise(0.4, 0.5 * v, 600); tone(200, 80, 0.4, 0.2 * v, 'triangle'); },
  boom(v) { noise(0.45, 0.6 * v, 450); },
  epain(v, type) {
    if (type && type !== 'imp' && type !== 'pinky') { const vo = voixMonstre(type); tone(vo.f * 1.3, vo.f * 0.6, 0.2, 0.35 * v, vo.onde); }
    else { tone(250, 120, 0.2, 0.35 * v, 'square'); }
  },
  edeath(type, v) {
    if (type === 'imp') { tone(500, 70, 0.6, 0.4 * v, 'sawtooth'); noise(0.4, 0.3 * v, 800); }
    else if (type === 'pinky') { tone(140, 30, 0.8, 0.5 * v, 'sawtooth'); noise(0.6, 0.4 * v, 300); }
    else { const vo = voixMonstre(type || ''); tone(vo.f * 1.2, vo.f * 0.25, vo.duree * 1.5, 0.45 * v, vo.onde); noise(0.5, 0.35 * v, 300 + vo.f); }
  },
  hurt() { tone(160, 80, 0.2, 0.55, 'square'); },
  pdeath() { tone(300, 40, 1.2, 0.6, 'sawtooth'); noise(0.8, 0.4, 500); },
  pickup() { tone(660, 990, 0.1, 0.35); tone(880, 1320, 0.12, 0.35, 'square', 0.07); },
  weapon() { tone(400, 400, 0.08, 0.3); tone(600, 600, 0.08, 0.3, 'square', 0.08); tone(800, 800, 0.15, 0.3, 'square', 0.16); },
  door(v) { noise(0.6, 0.45 * v, 250); tone(55, 40, 0.6, 0.35 * v, 'sawtooth'); },
  oof() { tone(130, 90, 0.18, 0.4, 'square'); },
  switch() { tone(1200, 1200, 0.05, 0.3); [440, 554, 659, 880].forEach((f, i) => tone(f, f, 0.14, 0.3, 'square', 0.1 + i * 0.1)); },
};

const MUSIQUE = { timer: null, pas: 0, prochain: 0, actif: true, vol: 0.5 };

function musicStart() {
  if (!AC || !MUSIQUE.actif || MUSIQUE.timer) return;
  const pasDur = 60 / 140 / 2, motifBasse = [55, 55, 65, 55, 73, 55, 65, 49];

  function tick() {
    while (MUSIQUE.prochain < AC.currentTime + 0.2) {
      const p = MUSIQUE.pas % 16;
      let d = Math.max(0, MUSIQUE.prochain - AC.currentTime);
      if (p === 0 || p === 4 || p === 8 || p === 12) tone(120, 40, 0.12, 0.5 * MUSIQUE.vol, 'sine', d);
      if (p === 4 || p === 12) noise(0.08, 0.3 * MUSIQUE.vol, 2500, d, 'highpass');
      if (p % 2 === 0) tone(motifBasse[(p / 2) % motifBasse.length], motifBasse[(p / 2) % motifBasse.length], 0.18, 0.25 * MUSIQUE.vol, 'sawtooth', d);
      MUSIQUE.pas++;
      MUSIQUE.prochain += pasDur;
    }
  }

  tick();
  MUSIQUE.timer = setInterval(tick, 50);
}

function musicStop() {
  if (!MUSIQUE.timer) return;
  clearInterval(MUSIQUE.timer);
  MUSIQUE.timer = null;
}
