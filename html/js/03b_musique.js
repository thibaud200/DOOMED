"use strict";
/* DOOMED — 03b_musique.js : musiques de Freedoom, jouées par un synthétiseur FM qui imite la carte son OPL2 d'époque
 *
 * CONTRAT (vérifié par test.html — ne rien retirer de cette liste) :
 *   FOURNIT : SynthFM lireMidi lireGenmidi musiqueFreedoomDebut musiqueFreedoomFin MUSIQUE_FD
 *   UTILISE : AC MASTER (03) · MUSIQUES_FREEDOOM (01d, facultatif)
 *
 * Les morceaux sont des fichiers MIDI de freedoom2.wad (D_RUNNIN…) ; les instruments sont ceux de sa banque GENMIDI
 * (réglages OPL2 : deux opérateurs FM par voix, enveloppes, formes d'onde). Le synthétiseur calcule les échantillons
 * lui-même : le même code tourne dans le navigateur (ici) et sous Node (outils\musique_wav.js, pour la version Unreal).
 */

/* ---------- lecture d'un fichier MIDI : liste d'événements datés en secondes ---------- */
function lireMidi(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const txt = (o, n) => String.fromCharCode.apply(null, u8.subarray(o, o + n));
  if (txt(0, 4) !== 'MThd') throw new Error('pas un fichier MIDI');
  const ntr = dv.getUint16(10), div = dv.getUint16(12);
  let o = 8 + dv.getUint32(4), evs = [];
  for (let t = 0; t < ntr && o < u8.length; t++) {
    const fin = o + 8 + dv.getUint32(o + 4);
    let p = o + 8, tick = 0, statut = 0;
    const vlq = () => { let v = 0, b; do { b = u8[p++]; v = (v << 7) | (b & 127); } while (b & 128); return v; };
    while (p < fin) {
      tick += vlq();
      let s = u8[p];
      if (s & 128) p++; else s = statut;
      if (s === 0xFF) {                                  // méta : tempo seulement
        const type = u8[p++], n = vlq();
        if (type === 0x51) evs.push({ tick, tempo: (u8[p] << 16) | (u8[p + 1] << 8) | u8[p + 2] });
        if (type === 0x2F) break;
        p += n;
      } else if (s === 0xF0 || s === 0xF7) { p += vlq(); }
      else {
        statut = s;
        const k = s & 0xF0, c = s & 15, a = u8[p++], b = (k === 0xC0 || k === 0xD0) ? 0 : u8[p++];
        evs.push({ tick, k, c, a, b });
      }
    }
    o = fin;
  }
  evs.sort((x, y) => x.tick - y.tick || ((x.tempo ? 0 : 1) - (y.tempo ? 0 : 1)));
  // ticks → secondes avec les changements de tempo (500 000 µs par noire par défaut)
  let tempo = 500000, t0 = 0, tick0 = 0;
  const sortie = [];
  for (const e of evs) {
    const t = t0 + (e.tick - tick0) * tempo / 1e6 / div;
    if (e.tempo) { t0 = t; tick0 = e.tick; tempo = e.tempo; continue; }
    e.t = t; sortie.push(e);
  }
  const duree = sortie.length ? sortie[sortie.length - 1].t + 0.5 : 0;
  return { evs: sortie, duree };
}

/* ---------- banque GENMIDI : 175 instruments OPL2 (128 mélodiques + 47 percussions) ---------- */
function lireGenmidi(u8) {
  if (String.fromCharCode.apply(null, u8.subarray(0, 8)) !== '#OPL_II#') throw new Error('GENMIDI invalide');
  const op = (o) => ({                                   // registres 20h, 60h, 80h, E0h, 40h de l'OPL2
    am: (u8[o] >> 7) & 1, vib: (u8[o] >> 6) & 1, sus: (u8[o] >> 5) & 1, mult: u8[o] & 15,
    ar: u8[o + 1] >> 4, dr: u8[o + 1] & 15, sl: u8[o + 2] >> 4, rr: u8[o + 2] & 15,
    onde: u8[o + 3] & 3, tl: u8[o + 5] & 63 });
  const voix = (o) => ({ mod: op(o), fb: (u8[o + 6] >> 1) & 7, additif: u8[o + 6] & 1, car: op(o + 7),
    decal: new Int16Array(u8.slice(o + 14, o + 16).buffer)[0] });
  const inst = [];
  for (let i = 0; i < 175; i++) {
    const o = 8 + i * 36, drap = u8[o] | (u8[o + 1] << 8);
    inst.push({ fixe: !!(drap & 1), double: !!(drap & 4), accord: u8[o + 2], note: u8[o + 3],
                v: [voix(o + 4), voix(o + 20)] });
  }
  return inst;
}

/* ---------- synthétiseur ---------- */
const MULT_OPL = [0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 12, 12, 15, 15];
const SINUS = new Float32Array(4096);
for (let i = 0; i < 4096; i++) SINUS[i] = Math.sin(i / 4096 * 2 * Math.PI);

function onde(type, phase) {                              // phase en tours (0..1)
  const f = phase - Math.floor(phase), s = SINUS[(f * 4096) | 0];
  if (type === 0) return s;
  if (type === 1) return f < 0.5 ? s : 0;                 // demi-sinus
  if (type === 2) return Math.abs(s);                      // sinus redressé
  return (f % 0.5) < 0.25 ? Math.abs(s) : 0;               // quarts de sinus
}

// durée d'attaque (0 → plein) et de chute (plein → silence) d'après les taux OPL (0 = jamais, 15 = immédiat)
const tAttaque = r => r === 0 ? 1e9 : r >= 15 ? 0.0005 : 2.826 / Math.pow(2, r - 1);
const tChute = r => r === 0 ? 1e9 : 39.28 / Math.pow(2, r - 1);
const dB = a => Math.pow(10, -a / 20);

class SynthFM {
  constructor(genmidi, frequence) {
    this.inst = genmidi; this.fe = frequence || 44100;
    this.voix = []; this.canaux = [];
    for (let c = 0; c < 16; c++) this.canaux.push({ prog: 0, vol: 100 / 127, expr: 1, bend: 0 });
    this.morceau = null; this.pos = 0; this.t = 0; this.boucle = true; this.volume = 0.6;
    this.xPrec = 0; this.yPrec = 0; this.cHp = Math.exp(-2 * Math.PI * 20 / this.fe);
  }
  charger(midi) { this.morceau = midi; this.pos = 0; this.t = 0; this.voix = [];
    for (const c of this.canaux) Object.assign(c, { prog: 0, vol: 100 / 127, expr: 1, bend: 0 }); }

  _op(o, freq, vel) {                                      // un opérateur : phase, enveloppe
    return { o, f: freq * MULT_OPL[o.mult], ph: 0, env: 0, etat: 0,
      ta: tAttaque(o.ar), td: tChute(o.dr), tr: tChute(o.rr), sl: o.sl === 15 ? 0 : dB(o.sl * 3),
      niv: dB(o.tl * 0.75) * vel };
  }
  noteOn(c, note, vel) {
    const can = this.canaux[c];
    let ins, n = note;
    if (c === 9) { if (note < 35 || note > 81) return; ins = this.inst[128 + note - 35]; }
    else ins = this.inst[can.prog];
    const v = vel / 127;
    for (let k = 0; k < (ins.double ? 2 : 1); k++) {
      const vx = ins.v[k];
      let m = (ins.fixe ? ins.note : n) + vx.decal;
      if (k === 1) m += (ins.accord - 128) / 64;           // seconde voix légèrement désaccordée
      const freq = 440 * Math.pow(2, (m - 69) / 12);
      this.voix.push({ c, note, fb: vx.fb, additif: vx.additif, m: this._op(vx.mod, freq, vx.additif ? v : 1),
        p: this._op(vx.car, freq, v), y1: 0, y2: 0, bend0: can.bend });
    }
    if (this.voix.length > 32) this.voix.splice(0, this.voix.length - 32);   // polyphonie bornée
  }
  noteOff(c, note) {
    for (const v of this.voix) if (v.c === c && v.note === note && v.p.etat < 3) { v.m.etat = 3; v.p.etat = 3; }
  }
  evenement(e) {
    const can = this.canaux[e.c];
    if (e.k === 0x90 && e.b > 0) this.noteOn(e.c, e.a, e.b);
    else if (e.k === 0x80 || e.k === 0x90) this.noteOff(e.c, e.a);
    else if (e.k === 0xC0) can.prog = e.a;
    else if (e.k === 0xE0) can.bend = ((e.b << 7 | e.a) - 8192) / 8192 * 2;   // ±2 demi-tons
    else if (e.k === 0xB0) {
      if (e.a === 7) can.vol = e.b / 127;
      else if (e.a === 11) can.expr = e.b / 127;
      else if (e.a === 120 || e.a === 123) for (const v of this.voix) if (v.c === e.c) { v.m.etat = 3; v.p.etat = 3; }
    }
  }
  _env(op, dt) {                                           // 0 attaque, 1 chute, 2 maintien, 3 relâche, 4 fini
    if (op.etat === 0) { op.env += dt / op.ta; if (op.env >= 1) { op.env = 1; op.etat = 1; } }
    else if (op.etat === 1) { op.env -= dt / op.td; if (op.env <= op.sl) { op.env = op.sl; op.etat = op.o.sus ? 2 : 3; } }
    else if (op.etat === 3) { op.env -= dt / op.tr; if (op.env <= 0) { op.env = 0; op.etat = 4; } }
    return op.env * op.env;                                // courbe proche de la décroissance en décibels
  }
  /* calcule n échantillons (mono, -1..1) ; reboucle le morceau à la fin */
  rendre(n) {
    const out = new Float32Array(n), dt = 1 / this.fe, M = this.morceau;
    if (!M) return out;
    for (let i = 0; i < n; i++) {
      while (this.pos < M.evs.length && M.evs[this.pos].t <= this.t) this.evenement(M.evs[this.pos++]);
      if (this.pos >= M.evs.length && this.t >= M.duree) {
        if (!this.boucle) break;
        this.pos = 0; this.t = 0; for (const v of this.voix) { v.m.etat = 3; v.p.etat = 3; }
      }
      let s = 0;
      for (let k = this.voix.length - 1; k >= 0; k--) {
        const v = this.voix[k], can = this.canaux[v.c];
        const em = this._env(v.m, dt), ep = this._env(v.p, dt);
        if (v.p.etat === 4 && (v.additif ? v.m.etat === 4 : true)) { this.voix.splice(k, 1); continue; }
        const b = Math.pow(2, can.bend / 12);
        v.m.ph += v.m.f * b * dt; v.p.ph += v.p.f * b * dt;
        const fbk = v.fb ? (v.y1 + v.y2) * 0.5 * Math.pow(2, v.fb - 7) : 0;
        const ym = onde(v.m.o.onde, v.m.ph + fbk) * em * v.m.niv;
        v.y2 = v.y1; v.y1 = ym;
        const yp = v.additif ? onde(v.p.o.onde, v.p.ph) * ep * v.p.niv + ym
                             : onde(v.p.o.onde, v.p.ph + ym * 1.2) * ep * v.p.niv;
        s += yp * can.vol * can.expr;
      }
      // composante continue retirée (formes d'onde OPL demi-sinus, toujours positives) : passe-haut à ~20 Hz,
      // comme le condensateur de sortie d'une carte son ; puis écrêtage doux pour les morceaux chargés
      const h = s - this.xPrec + this.cHp * this.yPrec; this.xPrec = s; this.yPrec = h;
      out[i] = Math.tanh(h * this.volume * 0.22);
      this.t += dt;
    }
    return out;
  }
}

/* ---------- lecture dans le navigateur : on calcule un peu d'avance et on enchaîne des tampons WebAudio ---------- */
const MUSIQUE_FD = { synth: null, timer: null, prochain: 0, piste: -1, banque: null };

function _b64(s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }

/* joue le morceau n° i (bouclé) ; renvoie false si les musiques Freedoom ne sont pas chargées */
function musiqueFreedoomDebut(i, volume) {
  if (typeof AC === 'undefined' || !AC || typeof MUSIQUES_FREEDOOM === 'undefined') return false;
  const liste = MUSIQUES_FREEDOOM.pistes;
  if (!liste || !liste.length) return false;
  if (!MUSIQUE_FD.banque) MUSIQUE_FD.banque = lireGenmidi(_b64(MUSIQUES_FREEDOOM.genmidi));
  const piste = ((i % liste.length) + liste.length) % liste.length;
  musiqueFreedoomFin();
  const s = MUSIQUE_FD.synth = new SynthFM(MUSIQUE_FD.banque, AC.sampleRate);
  s.volume = volume === undefined ? 0.6 : volume;
  s.charger(lireMidi(_b64(liste[piste].midi)));
  MUSIQUE_FD.piste = piste;
  MUSIQUE_FD.prochain = AC.currentTime + 0.1;
  const morceau = 0.25;                                     // secondes calculées à chaque tampon
  const tick = () => {
    while (MUSIQUE_FD.synth === s && MUSIQUE_FD.prochain < AC.currentTime + 0.6) {
      const n = Math.round(morceau * AC.sampleRate), buf = AC.createBuffer(1, n, AC.sampleRate);
      buf.copyToChannel(s.rendre(n), 0);
      const src = AC.createBufferSource(); src.buffer = buf; src.connect(MASTER);
      src.start(MUSIQUE_FD.prochain);
      MUSIQUE_FD.prochain += n / AC.sampleRate;
    }
  };
  tick();
  MUSIQUE_FD.timer = setInterval(tick, 100);
  return true;
}

function musiqueFreedoomFin() {
  if (MUSIQUE_FD.timer) clearInterval(MUSIQUE_FD.timer);
  MUSIQUE_FD.timer = null; MUSIQUE_FD.synth = null;
}

if (typeof module !== 'undefined') module.exports = { SynthFM, lireMidi, lireGenmidi };
