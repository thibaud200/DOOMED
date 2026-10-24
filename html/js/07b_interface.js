"use strict";
/* DOOMED — 07b_interface.js : interface à la Doom, avec les images de Freedoom (01f) : barre d'état, visage, police,
 * carte automatique (Tab), écran de statistiques de fin de niveau, texte de fin
 *
 * CONTRAT (vérifié par test.html — ne rien retirer de cette liste) :
 *   FOURNIT : IU interfaceDoomPrete texteDoom largeurTexteDoom nombreDoom chiffresDoom barreDoom nomVisage carteAuto statsNiveau ecranStats ecranFin
 *             TEXTE_FIN
 *   UTILISE : 01 (ctx W H PLAY_H HUD_H HOR), G WEAPONS (06), CELL_* (04), jouerSonFD (03c), INTERFACE_FREEDOOM (01f)
 *   RÈGLE : l'écran fait 480×320 et la barre de Doom 320×32 : tout est dessiné ×1,5 (ECH), barre de 48 px en bas.
 * Sans les images (01f absent ou pas encore chargé), interfaceDoomPrete() est faux et 07_hud.js garde son affichage.
 */

const ECH = W / 320;                        // 1,5 : un pixel de Doom
const IU = {};                              // images d'interface (HTMLImageElement) par nom Doom
(function () {
  if (typeof INTERFACE_FREEDOOM === 'undefined' || typeof Image === 'undefined') return;
  for (const [nom, v] of Object.entries(INTERFACE_FREEDOOM)) { const im = new Image(); im.src = v.img; IU[nom] = im; }
})();
const _pret = n => !!(IU[n] && IU[n].complete && IU[n].naturalWidth > 0);
function interfaceDoomPrete() { return _pret('STBAR_FR') && _pret('STTNUM0') && _pret('STFST00') && _pret('STCFN065'); }

/* dessine l'image n au point Doom (x, y) — ou en pixels écran si ecran = true ; renvoie sa largeur à l'écran */
function _img(n, x, y, e, ecran) {
  if (!_pret(n)) return 0;
  e = e || ECH;
  const im = IU[n], px = ecran ? x : x * ECH, py = ecran ? y : y * ECH;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(im, Math.round(px), Math.round(py), Math.round(im.width * e), Math.round(im.height * e));
  return im.width * e;
}

/* ---------- police de Doom (STCFN : capitales, chiffres, ponctuation ; accents et minuscules ramenés) ---------- */
const _SANS_ACCENT = { 'À': 'A', 'Â': 'A', 'Ä': 'A', 'É': 'E', 'È': 'E', 'Ê': 'E', 'Ë': 'E', 'Î': 'I', 'Ï': 'I', 'Ô': 'O',
  'Ö': 'O', 'Ù': 'U', 'Û': 'U', 'Ü': 'U', 'Ç': 'C', '’': "'", '«': '"', '»': '"', '—': '-', '–': '-', '…': '...' };
function _glyphes(s) {
  return [...String(s).toUpperCase()].map(c => _SANS_ACCENT[c] || c).join('');
}
function largeurTexteDoom(s, e) {
  e = e || ECH;
  let l = 0;
  for (const c of _glyphes(s)) { const n = 'STCFN' + String(c.charCodeAt(0)).padStart(3, '0'); l += (_pret(n) ? IU[n].width : 4) * e; }
  return l;
}
/* texte en police de Doom, en pixels écran ; align : 'left' (défaut), 'center', 'right' ; renvoie la largeur */
function texteDoom(s, x, y, e, align) {
  e = e || ECH;
  const l = largeurTexteDoom(s, e);
  let cx = align === 'center' ? x - l / 2 : align === 'right' ? x - l : x;
  for (const c of _glyphes(s)) {
    const n = 'STCFN' + String(c.charCodeAt(0)).padStart(3, '0');
    if (_pret(n)) { _img(n, cx, y, e, true); cx += IU[n].width * e; } else cx += 4 * e;
  }
  return l;
}

/* nombre positif en chiffres Doom (STTNUM grands rouges, STYSNUM petits jaunes, STGNUM gris, WINUM écran de stats), aligné à
   droite sur xDroite (coordonnées Doom) ; renvoie le x Doom du premier chiffre */
function nombreDoom(val, xDroite, y, pre, e) {
  return chiffresDoom(String(Math.max(0, Math.round(val))), xDroite, y, pre, e);
}
/* chaîne de chiffres (« 07 ») alignée à droite sur xDroite, coordonnées Doom ; renvoie le x Doom du premier chiffre */
function chiffresDoom(s, xDroite, y, pre, e) {
  pre = pre || 'STTNUM';
  let x = xDroite;
  for (let i = s.length - 1; i >= 0; i--) {
    const n = pre + s[i];
    x -= (_pret(n) ? IU[n].width : 14) * (e || ECH) / ECH;
    _img(n, x, y, e);
  }
  return x;
}

/* ---------- visage : santé (5 niveaux), regard, douleur, sourire, rage, mort, invulnérable ---------- */
function nomVisage() {
  const P = G.P, now = performance.now();
  if (G.state === 'dead' || P.hp <= 0) return 'STFDEAD0';
  if ((G.triche && G.triche.invincible) || P.invulT > 0) return 'STFGOD0';
  const niv = Math.min(4, Math.floor((100 - clamp(P.hp, 0, 100)) * 5 / 101));
  if (G.sourireJusqua > now) return 'STFEVL' + niv;                     // arme ramassée
  if (P.hurt > 0) {
    if (G.ouchJusqua > now) return 'STFOUCH' + niv;                     // gros coup
    if (P.faceDir > 0) return 'STFTR' + niv + '0';                       // attaque venue de la droite
    if (P.faceDir < 0) return 'STFTL' + niv + '0';
    return 'STFST' + niv + '1';
  }
  if (G.tirDepuis && now - G.tirDepuis > 2000) return 'STFKILL' + niv;  // tir prolongé
  return 'STFST' + niv + (clamp((G.faceLook | 0) + 1, 0, 2));
}

/* ---------- barre d'état (coordonnées de Doom, y de 168 à 200, dessinée ×1,5) ---------- */
const ARMES_DOOM = [['Pistolet'], ['Fusil à pompe'], ['Mitrailleuse'], ['Lance-roquettes'], ['Fusil à plasma'], ['BFG 9000']];
const MUNITIONS_DOOM = [['bullets', 173, 200], ['shells', 179, 50], ['cells', 185, 300], ['rockets', 191, 50]];
function barreDoom() {
  const P = G.P, y0 = 168;
  ctx.save(); ctx.translate(0, PLAY_H - y0 * ECH);                     // y Doom 168 → haut de la barre (PLAY_H)
  _img('STBAR_FR', 0, y0);
  const w = WEAPONS[P.weapon], mun = w && w.ammo ? P[w.ammo] : null;
  if (mun !== null && mun !== undefined) nombreDoom(mun, 44, 171);
  nombreDoom(Math.max(0, P.hp), 90, 171); _img('STTPRCNT', 90, 171);
  ARMES_DOOM.forEach(([nom], i) => {
    const k = WEAPONS.findIndex(a => a.name === nom), a = k >= 0 && P.owned && P.owned[k];
    _img((a ? 'STYSNUM' : 'STGNUM') + (i + 2), 111 + (i % 3) * 12, 172 + Math.floor(i / 3) * 10);
  });
  _img(nomVisage(), 143, 168);
  nombreDoom(Math.round(P.armor || 0), 221, 171); _img('STTPRCNT', 221, 171);
  const cles = P.keys || {};
  if (cles.blue) _img('STKEYS0', 239, 171);
  if (cles.yellow) _img('STKEYS1', 239, 181);
  if (cles.red) _img('STKEYS2', 239, 191);
  for (const [champ, y, max] of MUNITIONS_DOOM) {
    nombreDoom(P[champ] || 0, 288, y, 'STYSNUM');
    nombreDoom(max * (P.backpack ? 2 : 1), 314, y, 'STYSNUM');
  }
  ctx.restore();
}

/* ---------- carte automatique (Tab) : murs vus en rouge, portes en jaune (ou couleur de leur clé), sortie en vert ---- */
function carteAuto() {
  const L = G.L, P = G.P;
  if (!L.vu) L.vu = new Uint8Array(L.w * L.h);
  const c = Math.min((W - 16) / L.w, (PLAY_H - 16) / L.h), ox = (W - L.w * c) / 2, oy = (PLAY_H - L.h * c) / 2;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, PLAY_H);
  const plein = (x, y) => x < 0 || y < 0 || x >= L.w || y >= L.h || L.grid[y * L.w + x] !== CELL_EMPTY;
  const vu = (x, y) => L.carteComplete || L.vu[y * L.w + x];
  ctx.lineWidth = 1;
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
    const code = L.grid[y * L.w + x];
    if (code === CELL_EMPTY || !vu(x, y)) continue;
    let coul = '#fc0000';
    if (code === CELL_DOOR) { const D = L.doors[L.doorAt[y * L.w + x]]; coul = { red: '#ff3030', blue: '#4070ff', yellow: '#ffe040' }[D.key] || '#e8c048'; }
    else if (code === CELL_EXIT) coul = '#40e040';
    if (!L.vu[y * L.w + x]) coul = '#707070';                           // carte de l'ordinateur : murs pas encore vus en gris
    ctx.strokeStyle = coul; ctx.beginPath();
    const X = ox + x * c, Y = oy + y * c;
    if (!plein(x, y - 1)) { ctx.moveTo(X, Y + 0.5); ctx.lineTo(X + c, Y + 0.5); }
    if (!plein(x, y + 1)) { ctx.moveTo(X, Y + c - 0.5); ctx.lineTo(X + c, Y + c - 0.5); }
    if (!plein(x - 1, y)) { ctx.moveTo(X + 0.5, Y); ctx.lineTo(X + 0.5, Y + c); }
    if (!plein(x + 1, y)) { ctx.moveTo(X + c - 0.5, Y); ctx.lineTo(X + c - 0.5, Y + c); }
    ctx.stroke();
  }
  // le joueur : flèche blanche
  const px = ox + P.x * c, py = oy + P.y * c, a = P.a, r = Math.max(4, c * 0.7);
  ctx.strokeStyle = '#fff'; ctx.beginPath();
  ctx.moveTo(px - Math.cos(a) * r, py - Math.sin(a) * r); ctx.lineTo(px + Math.cos(a) * r, py + Math.sin(a) * r);
  ctx.lineTo(px + Math.cos(a + 2.5) * r * 0.6, py + Math.sin(a + 2.5) * r * 0.6);
  ctx.moveTo(px + Math.cos(a) * r, py + Math.sin(a) * r); ctx.lineTo(px + Math.cos(a - 2.5) * r * 0.6, py + Math.sin(a - 2.5) * r * 0.6);
  ctx.stroke();
  texteDoom(L.name, 4, PLAY_H - 12, ECH);
}

/* ---------- écran de statistiques de fin de niveau (décompte animé, comme Doom : +2 % par tic, 35 tics/s) ---------- */
function _pourcent(a, b) { return b > 0 ? Math.round(a * 100 / b) : 100; }
function statsNiveau() {
  const secrets = G.L.secrets || [], items = (G.items || []).slice(0, G.nbObjets);   // sans les objets lâchés par les monstres
  return [_pourcent(G.kills, G.total), _pourcent(items.filter(i => i.taken).length, items.length),
          _pourcent(secrets.filter(s => s.found).length, secrets.length), Math.floor(G.time || 0)];
}
function ecranStats() {
  const t = G.stateT || 0, cibles = statsNiveau(), V = 70;              // 70 % par seconde
  // phases successives : ennemis, objets, secrets, temps (0,4 s de pause entre deux)
  const durees = [cibles[0] / V, cibles[1] / V, cibles[2] / V, Math.min(1.5, cibles[3] / 120)].map(d => d + 0.4);
  let reste = t, valeurs = [], enCours = -1;
  for (let i = 0; i < 4; i++) {
    const d = durees[i];
    if (reste >= d) { valeurs.push(cibles[i]); reste -= d; }
    else { valeurs.push(Math.min(cibles[i], Math.floor(Math.max(0, reste) * (i === 3 ? 120 : V)))); enCours = i; reste = -1; }
    if (reste < 0) { for (let j = i + 1; j < 4; j++) valeurs.push(null); break; }
  }
  // sons : un coup de pistolet tous les 3 tics pendant le décompte, une explosion à la fin de chaque ligne
  const tic = Math.floor(t * 35 / 3);
  if (enCours >= 0 && tic !== G.statsTic) { G.statsTic = tic; if (typeof jouerSonFD === 'function') jouerSonFD('DSPISTOL', 0.5); }
  if (enCours !== G.statsLigne) { if (G.statsLigne !== undefined && typeof jouerSonFD === 'function') jouerSonFD('DSBAREXP', 0.6); G.statsLigne = enCours; }

  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  if (_pret('INTERPIC')) { ctx.imageSmoothingEnabled = false; ctx.drawImage(IU.INTERPIC, 0, 0, W, H); }
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, W, H);
  texteDoom(G.L.name, W / 2, 18, ECH * 2, 'center');
  texteDoom('TERMINÉ', W / 2, 44, ECH * 2, 'center');
  const lignes = ['ENNEMIS', 'OBJETS', 'SECRETS'];
  lignes.forEach((l, i) => {
    const y = 84 + i * 30;
    texteDoom(l, 60, y, ECH * 1.6);
    if (valeurs[i] !== null) { nombreDoom(valeurs[i], 270, y / ECH, 'WINUM'); _img('WIPCNT', 270, y / ECH); }
  });
  texteDoom('TEMPS', 60, 194, ECH * 1.6);
  if (valeurs[3] !== null) {                                            // m:ss
    const s = valeurs[3], yd = 194 / ECH;
    const x = chiffresDoom(String(s % 60).padStart(2, '0'), 270, yd, 'WINUM');
    const xc = x - (_pret('WICOLON') ? IU.WICOLON.width : 6);
    _img('WICOLON', xc, yd); chiffresDoom(String(Math.floor(s / 60)), xc, yd, 'WINUM');
  }
  if (enCours < 0) {                                                    // décompte fini : les nombres exacts
    const sec = G.L.secrets || [];
    texteDoom(`Ennemis : ${G.kills} / ${G.total}   Secrets : ${sec.filter(x => x.found).length} / ${sec.length}`, W / 2, 232, ECH, 'center');
  }
  if (enCours < 0 && (performance.now() / 500 | 0) % 2)
    texteDoom(G.level + 1 < MAPS.length ? 'ENTRÉE : NIVEAU SUIVANT' : 'ENTRÉE : CONTINUER', W / 2, 280, ECH, 'center');
}

/* ---------- texte de fin (victoire) : défile lettre par lettre sur un fond, comme les fins d'épisode de Doom ---------- */
const TEXTE_FIN = [
  'LES DERNIERS DÉMONS SONT TOMBÉS.',
  'LES COULOIRS DE LA BASE NE RÉSONNENT',
  'PLUS QUE DE VOS PAS ET DU BOURDONNEMENT',
  'DES MACHINES.',
  '',
  'MAIS QUELQUE PART, DANS LES PROFONDEURS,',
  'UNE PORTE RESTE ENTROUVERTE...',
  '',
  'VOUS RECHARGEZ VOTRE ARME.',
  'L\'ENFER N\'A PAS DIT SON DERNIER MOT.',
];
function ecranFin() {
  const t = G.stateT || 0, n = Math.floor(t * 12);                       // ~12 lettres par seconde
  if (_pret('BOSSBACK')) { ctx.imageSmoothingEnabled = false; ctx.drawImage(IU.BOSSBACK, 0, 0, W, H); }
  else { ctx.fillStyle = '#100'; ctx.fillRect(0, 0, W, H); }
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, W, H);
  let reste = n;
  TEXTE_FIN.forEach((l, i) => {
    if (reste <= 0) return;
    texteDoom(l.slice(0, reste), 24, 24 + i * 18, ECH);
    reste -= l.length + 1;
  });
  const total = TEXTE_FIN.reduce((s, l) => s + l.length + 1, 0);
  if (n > total) {
    const T = G.totals || {};
    texteDoom(`ENNEMIS : ${T.kills || 0} / ${T.total || 0}    TEMPS : ${fmtTime(T.time || 0)}`, W / 2, 230, ECH, 'center');
    if ((performance.now() / 500 | 0) % 2) texteDoom('ENTRÉE : ÉCRAN TITRE', W / 2, 270, ECH, 'center');
  }
}
