"use strict";
/* DOOMED — 03c_sons.js : bruitages de Freedoom à la place des sons synthétisés (quand ils existent)
 *
 * CONTRAT (vérifié par test.html — ne rien retirer de cette liste) :
 *   FOURNIT : jouerSonFD SONS_MONSTRES SONS_JEU
 *   UTILISE : AC MASTER sfx (03) · SONS_FREEDOOM (01e, facultatif)
 *
 * Chaque son de sfx (03_audio.js) est d'abord cherché dans SONS_JEU (ou, pour un monstre, dans SONS_MONSTRES) ; s'il a
 * un bruitage Freedoom, celui-ci est joué, sinon le son synthétisé d'origine (monstres créés par le modèle, « click »…).
 * Les noms sont ceux des sons de Doom (DSPISTOL…) ; plusieurs noms = l'un d'eux au hasard.
 */

/* bruitages de chaque monstre : vue (il repère le joueur), douleur, mort, actif (grognement en marchant) */
const SONS_MONSTRES = {
  imp:      { vue: ['DSBGSIT1', 'DSBGSIT2'], douleur: 'DSPOPAIN', mort: ['DSBGDTH1', 'DSBGDTH2'], actif: 'DSBGACT' },
  pinky:    { vue: 'DSSGTSIT', douleur: 'DSDMPAIN', mort: 'DSSGTDTH', actif: 'DSDMACT' },
  caco:     { vue: 'DSCACSIT', douleur: 'DSDMPAIN', mort: 'DSCACDTH', actif: 'DSDMACT' },
  soldier:  { vue: ['DSPOSIT1', 'DSPOSIT2', 'DSPOSIT3'], douleur: 'DSPOPAIN', mort: ['DSPODTH1', 'DSPODTH2', 'DSPODTH3'], actif: 'DSPOSACT' },
  lostsoul: { vue: 'DSSKLATK', douleur: 'DSDMPAIN', mort: 'DSFIRXPL', actif: 'DSDMACT' },
  baron:    { vue: 'DSBRSSIT', douleur: 'DSDMPAIN', mort: 'DSBRSDTH', actif: 'DSDMACT' },
  sergent:     { vue: ['DSPOSIT1', 'DSPOSIT2', 'DSPOSIT3'], douleur: 'DSPOPAIN', mort: ['DSPODTH1', 'DSPODTH2', 'DSPODTH3'], actif: 'DSPOSACT' },
  commando:    { vue: ['DSPOSIT1', 'DSPOSIT2', 'DSPOSIT3'], douleur: 'DSPOPAIN', mort: ['DSPODTH1', 'DSPODTH2', 'DSPODTH3'], actif: 'DSPOSACT' },
  chevalier:   { vue: 'DSKNTSIT', douleur: 'DSDMPAIN', mort: 'DSKNTDTH', actif: 'DSDMACT' },
  revenant:    { vue: 'DSSKESIT', douleur: 'DSPOPAIN', mort: 'DSSKEDTH', actif: 'DSSKEACT' },
  mancubus:    { vue: 'DSMANSIT', douleur: 'DSMNPAIN', mort: 'DSMANDTH', actif: 'DSPOSACT' },
  arachno:     { vue: 'DSBSPSIT', douleur: 'DSDMPAIN', mort: 'DSBSPDTH', actif: 'DSBSPACT' },
  elementaire: { vue: 'DSPESIT', douleur: 'DSPEPAIN', mort: 'DSPEDTH', actif: 'DSDMACT' },
  cyber:       { vue: 'DSCYBSIT', douleur: 'DSDMPAIN', mort: 'DSCYBDTH', actif: 'DSDMACT' },
  araignee:    { vue: 'DSSPISIT', douleur: 'DSDMPAIN', mort: 'DSSPIDTH', actif: 'DSDMACT' },
  archivile:   { vue: 'DSVILSIT', douleur: 'DSVIPAIN', mort: 'DSVILDTH', actif: 'DSVILACT' },
  spectre:     { vue: 'DSSGTSIT', douleur: 'DSDMPAIN', mort: 'DSSGTDTH', actif: 'DSDMACT' },
};

/* sons du jeu → bruitage Freedoom (null : pas d'équivalent, le son synthétisé reste) */
const SONS_JEU = {
  pistol: 'DSPISTOL', shotgun: 'DSSHOTGN', click: null, hit: 'DSPUNCH', claw: 'DSCLAW', bite: 'DSSGTATK',
  fireball: 'DSFIRSHT', boom: 'DSRXPLOD', hurt: 'DSPLPAIN', pdeath: 'DSPLDETH', pickup: 'DSITEMUP', weapon: 'DSWPNUP',
  door: 'DSDOROPN', oof: 'DSNOWAY', switch: 'DSSWTCHN',
};

const _tampons = {};
function _tampon(nom) {
  if (_tampons[nom] !== undefined) return _tampons[nom];
  const s = typeof SONS_FREEDOOM !== 'undefined' && SONS_FREEDOOM[nom];
  if (!s || !AC) return (_tampons[nom] = null);
  const b = atob(s.d), buf = AC.createBuffer(1, b.length, s.f), x = buf.getChannelData(0);
  for (let i = 0; i < b.length; i++) x[i] = (b.charCodeAt(i) - 128) / 128;     // 8 bits non signés → -1..1
  return (_tampons[nom] = buf);
}

/* joue un bruitage Freedoom (nom DS…, ou liste : l'un au hasard) ; renvoie false s'il n'existe pas ou sans audio */
function jouerSonFD(nom, vol) {
  if (!nom || typeof AC === 'undefined' || !AC || !(vol > 0)) return false;
  if (Array.isArray(nom)) nom = nom[(Math.random() * nom.length) | 0];
  let buf;
  try { buf = _tampon(nom); } catch (e) { return false; }   // contexte audio incomplet (tests) : son synthétisé
  if (!buf) return false;
  const src = AC.createBufferSource(), g = AC.createGain();
  src.buffer = buf; g.gain.value = Math.min(1, vol);
  src.connect(g).connect(MASTER); src.start();
  return true;
}

/* branchement sur sfx : signatures d'origine gardées (voir 03_audio.js) */
(function () {
  if (typeof sfx === 'undefined') return;
  const orig = Object.assign({}, sfx);
  const simple = (nom, vol) => function () { if (!jouerSonFD(SONS_JEU[nom], vol.apply(null, arguments))) return orig[nom].apply(sfx, arguments); };
  const un = () => 1, v0 = v => (v === undefined ? 1 : v);
  for (const nom of ['pistol', 'shotgun', 'hit', 'hurt', 'pdeath', 'pickup', 'weapon', 'oof', 'switch']) sfx[nom] = simple(nom, un);
  for (const nom of ['claw', 'bite', 'fireball', 'boom']) sfx[nom] = simple(nom, v0);
  sfx.door = function (v, fermer) {
    if (!jouerSonFD(fermer ? 'DSDORCLS' : 'DSDOROPN', v0(v))) return orig.door.apply(sfx, arguments);
  };
  sfx.sight = function (type, v) {
    const m = SONS_MONSTRES[type];
    if (!(m && jouerSonFD(m.vue, v0(v)))) return orig.sight.apply(sfx, arguments);
  };
  sfx.epain = function (v, type) {
    const m = SONS_MONSTRES[type];
    if (!(m && jouerSonFD(m.douleur, v0(v)))) return orig.epain.apply(sfx, arguments);
  };
  sfx.edeath = function (type, v) {
    const m = SONS_MONSTRES[type];
    if (!(m && jouerSonFD(m.mort, v0(v)))) return orig.edeath.apply(sfx, arguments);
  };
  for (const nom in orig) if (sfx[nom] !== orig[nom]) sfx[nom].synth = orig[nom];   // son synthétisé de secours
})();
