"use strict";
/* DOOMED — 07c_menus.js : menus à la Doom (curseur tête de mort, 5 difficultés, options à réglettes, 6 emplacements de
 * sauvegarde, aide) et codes de triche (iddqd, idkfa, idfa, iddt, idclip, idclevNN)
 *
 * CONTRAT (vérifié par test.html — ne rien retirer de cette liste) :
 *   FOURNIT : DIFFICULTES NB_SAUVEGARDES nouveauMenu menuActif menuMaj dessinerMenu lancerPartie codesTriche
 *             etatPartie sauverPartie chargerPartie lireSauvegardes
 *   UTILISE : 01 (ctx W H HOR pressed ENTER PRESSED SETTINGS sauverReglages), G MAPS newPlayer startGame startLevel
 *             continuerPartie mkEnemy ENEMY_DEF WEAPONS say lireProgression (06), doom fondTitre fmtTime (07),
 *             texteDoom largeurTexteDoom _img _pret ECH (07b), jouerSonFD (03c), musicStart musicStop MUSIQUE (03)
 *   RÈGLE : les menus ne servent qu'avec l'interface Doom (doom() vrai) ; sinon 06/07 gardent l'écran titre et la pause
 *           d'origine (touches ← → pour la difficulté, C pour continuer, P pour reprendre).
 */

/* les 5 difficultés de Doom (libellés de la version française) et la difficulté interne G.skill (0 à 2) qu'elles utilisent */
const DIFFICULTES = [
  { nom: 'Trop jeune pour mourir', skill: 0 },   // + dégâts reçus divisés par 2, munitions doublées
  { nom: 'Hé, pas trop fort !', skill: 0 },
  { nom: 'Fais-moi mal !', skill: 1 },
  { nom: 'Ultra-violence', skill: 2 },
  { nom: 'Cauchemar !', skill: 2 },              // + monstres rapides, munitions doublées
];
const NB_SAUVEGARDES = 6;

const _son = n => { if (typeof jouerSonFD === 'function') jouerSonFD(n, 0.8); };
const _enJeu = () => G.state !== 'title';

/* ---------- pages ---------- */
function _pages() {
  const P = {};
  P.principal = { titre: 'DOOMED', items: () => {
    const l = [];
    if (_enJeu()) l.push({ t: 'Reprendre la partie', ok: fermerMenu });
    l.push({ t: 'Nouvelle partie', ok: () => _aller('difficulte', _enJeu() ? 2 : 2) });
    if (!_enJeu() && lireProgression().reached > 0) l.push({ t: 'Continuer', ok: () => { G.menu = null; continuerPartie(); } });
    l.push({ t: 'Options', ok: () => _aller('options') });
    l.push({ t: 'Charger une partie', ok: () => _aller('charger') });
    if (_enJeu() && G.state !== 'dead') l.push({ t: 'Sauvegarder', ok: () => _aller('sauver') });
    l.push({ t: 'Commandes', ok: () => _aller('aide') });
    if (_enJeu()) l.push({ t: 'Abandonner la partie', ok: () => _confirmer('Abandonner la partie en cours ?', () => { G.menu = null; G.state = 'title'; }) });
    return l;
  } };
  P.difficulte = { titre: 'Nouvelle partie', petit: true, items: () => DIFFICULTES.map((d, i) => ({ t: d.nom,
    ok: () => i === 4 ? _confirmer('Cauchemar : les monstres sont rapides et sans pitié. Vous êtes sûr ?', () => lancerPartie(4)) : lancerPartie(i) })) };
  P.options = { titre: 'Options', items: () => [
    { t: 'Sensibilité', thermo: [7, Math.round((SETTINGS.sens - 0.5) / 0.25)],
      reg: s => { SETTINGS.sens = clamp(Math.round((SETTINGS.sens + s * 0.25) * 100) / 100, 0.5, 2); } },
    { t: 'Volume', thermo: [11, Math.round(SETTINGS.volume * 10)],
      reg: s => { SETTINGS.volume = clamp(Math.round((SETTINGS.volume + s * 0.1) * 10) / 10, 0, 1); if (typeof MASTER !== 'undefined' && MASTER) MASTER.gain.value = SETTINGS.volume; } },
    { t: 'Musique', val: () => SETTINGS.music ? 'oui' : 'non',
      reg: () => { SETTINGS.music = !SETTINGS.music; if (typeof MUSIQUE !== 'undefined') { MUSIQUE.actif = SETTINGS.music; if (!SETTINGS.music) musicStop(); else if (G.state === 'play' || G.state === 'pause') musicStart(); } } },
    { t: 'Barre d\'état', val: () => SETTINGS.hudClassique ? 'classique' : 'doom', reg: () => { SETTINGS.hudClassique = !SETTINGS.hudClassique; } },
    { t: 'Mini-carte', val: () => G.minimap ? 'oui' : 'non', reg: () => { G.minimap = !G.minimap; } },
  ] };
  const emplacements = sauver => () => lireSauvegardes().map((s, i) => ({ emplacement: true, t: s ? s.nom : '- vide -',
    ok: () => {
      if (sauver) { sauverPartie(i); say('Partie sauvegardée'); fermerMenu(); }
      else if (s) { if (chargerPartie(i)) { G.menu = null; say('Partie chargée'); } else G.menu.msg = 'Sauvegarde illisible'; }
    } }));
  P.charger = { titre: 'Charger une partie', items: emplacements(false) };
  P.sauver = { titre: 'Sauvegarder', items: emplacements(true) };
  P.aide = { titre: 'Commandes', aide: [
    ['Avancer / reculer', 'Z S  ou  flèches'], ['Pas de côté', 'Q D'], ['Tourner', 'souris  ou  flèches'],
    ['Tirer', 'clic  ou  espace'], ['Armes', '1 à 5'], ['Utiliser / ouvrir', 'E'],
    ['Carte', 'Tab'], ['Menu / pause', 'Échap  /  P'], ['Plein écran / musique', 'F  /  M'],
  ], items: () => [] };
  return P;
}
const PAGES = _pages();

function nouveauMenu(page) { return { page: page || 'principal', sel: 0, pile: [], confirm: null, msg: '' }; }
function _aller(page, sel) { G.menu.pile.push([G.menu.page, G.menu.sel]); G.menu.page = page; G.menu.sel = sel || 0; G.menu.msg = ''; }
function _confirmer(texte, oui) { G.menu.confirm = { texte, oui }; }
function fermerMenu() { G.menu = null; if (G.state === 'pause') G.state = 'play'; }

/* le menu prend la main : écran titre, ou pause ouverte par Échap (P donne une pause simple) */
function menuActif() {
  if (!doom()) return false;
  if (G.state === 'title' && !G.menu) G.menu = nouveauMenu();
  return (G.state === 'title' || G.state === 'pause') && !!G.menu;
}

function lancerPartie(d) {
  G.difficulte = d; G.skill = DIFFICULTES[d].skill; G.menu = null;
  startGame();
}

function menuMaj() {
  const M = G.menu, page = PAGES[M.page];
  const oui = ENTER() || pressed('Mouse0') || pressed('Space');
  const retour = pressed('Escape') || pressed('Backspace') || pressed('Mouse2');
  if (M.confirm) {
    if (oui || pressed('KeyO') || pressed('KeyY')) { const f = M.confirm.oui; M.confirm = null; _son('DSPISTOL'); f(); }
    else if (retour || pressed('KeyN')) { M.confirm = null; _son('DSSWTCHX'); }
    return;
  }
  const items = page.items();
  if (retour || (page.aide && oui)) {
    _son('DSSWTCHX');
    if (M.pile.length) [M.page, M.sel] = M.pile.pop();
    else if (_enJeu()) fermerMenu();
    return;
  }
  if (!items.length) return;
  const haut = pressed('ArrowUp') || pressed('KeyW'), bas = pressed('ArrowDown') || pressed('KeyS');
  if (haut || bas) { M.sel = (M.sel + (bas ? 1 : items.length - 1)) % items.length; M.msg = ''; _son('DSPSTOP'); }
  M.sel = Math.min(M.sel, items.length - 1);
  const it = items[M.sel], sens = (pressed('ArrowRight') || pressed('KeyD') ? 1 : 0) - (pressed('ArrowLeft') || pressed('KeyA') ? 1 : 0);
  if (sens && it.reg) { it.reg(sens); sauverReglages(); _son('DSSTNMOV'); }
  else if (oui) {
    if (it.ok) { _son('DSPISTOL'); it.ok(); }
    else if (it.reg) { it.reg(1); sauverReglages(); _son('DSSTNMOV'); }
  }
}

/* ---------- dessin ---------- */
function _thermo(x, y, n, pos) {            // réglette de Doom : coordonnées Doom
  _img('M_THERML', x, y);
  for (let i = 0; i < n; i++) _img('M_THERMM', x + 8 + i * 8, y);
  _img('M_THERMR', x + 8 + n * 8, y);
  _img('M_THERMO', x + 8 + clamp(pos, 0, n - 1) * 8, y);
}
function _emplacement(x, y) {               // cadre d'emplacement de sauvegarde (24 cases de 8)
  _img('M_LSLEFT', x - 8, y);
  for (let i = 0; i < 24; i++) _img('M_LSCNTR', x + i * 8, y);
  _img('M_LSRGHT', x + 24 * 8, y);
}
function dessinerMenu() {
  const M = G.menu; if (!M) return;
  const page = PAGES[M.page], items = page.items(), e = ECH * 1.5;
  if (G.state !== 'title' || M.page !== 'principal') { ctx.fillStyle = G.state === 'title' ? 'rgba(0,0,0,.85)' : 'rgba(0,0,0,.7)'; ctx.fillRect(0, 0, W, H); }   // le logo ne gêne que la page principale
  if (M.page !== 'principal') texteDoom(page.titre, W / 2, 26, ECH * 2.2, 'center');
  if (page.aide) {
    page.aide.forEach(([a, b], i) => { texteDoom(a, W / 2 - 8, 74 + i * 20, ECH * 0.9, 'right'); texteDoom(b, W / 2 + 8, 74 + i * 20, ECH * 0.9); });
    texteDoom('Entrée : retour', W / 2, 74 + page.aide.length * 20 + 10, ECH, 'center');
    return;
  }
  const principal = M.page === 'principal', pas = principal ? 26 : page.petit ? 28 : 30;
  const y0 = principal ? (G.state === 'title' ? 128 : 70) : 70, x0 = principal ? 150 : page.petit ? 80 : 60;
  items.forEach((it, i) => {
    const y = y0 + i * pas;
    if (it.emplacement) {
      _emplacement((x0 + 20) / ECH, (y - 2) / ECH);
      texteDoom(it.t, x0 + 24, y + 2, ECH);
    } else {
      const ei = Math.min(e, (W - x0 - 20) / largeurTexteDoom(it.t, 1));       // libellé trop long : rétréci pour tenir
      texteDoom(it.t, x0, y, ei);
      if (it.thermo) _thermo(250 / ECH, (y + 1) / ECH, it.thermo[0], it.thermo[1]);
      if (it.val) texteDoom(it.val(), 290, y, e);
    }
  });
  if (items.length) {                                                   // tête de mort qui cligne, à gauche du choix
    const crane = (performance.now() / 260 | 0) % 2 ? 'M_SKULL2' : 'M_SKULL1';
    _img(crane, (x0 - 32) / ECH, (y0 + M.sel * pas - 6) / ECH);
  }
  if (M.msg) texteDoom(M.msg, W / 2, H - 30, ECH, 'center');
  if (M.confirm) {
    ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillRect(0, HOR - 40, W, 80);
    const mots = M.confirm.texte.split(' '), lignes = [''];
    for (const m of mots) { const l = (lignes[lignes.length - 1] + ' ' + m).trim(); if (largeurTexteDoom(l, ECH) > W - 40) lignes.push(m); else lignes[lignes.length - 1] = l; }
    lignes.forEach((l, i) => texteDoom(l, W / 2, HOR - 26 + i * 16, ECH, 'center'));
    texteDoom('Entrée ou O : oui    Échap ou N : non', W / 2, HOR + 18, ECH, 'center');
  }
}

/* ---------- codes de triche (tapés en jeu, comme dans Doom) ---------- */
function codesTriche() {
  for (const code of PRESSED) {
    const c = /^Key([A-Z])$/.exec(code) || /^(?:Digit|Numpad)(\d)$/.exec(code);
    if (!c) continue;
    G.bande = ((G.bande || '') + c[1].toLowerCase()).slice(-12);
    const b = G.bande, P = G.P;
    let fait = null;
    const triche = () => (G.triche = G.triche || {});
    if (b.endsWith('iddqd')) { triche().invincible = !G.triche.invincible; P.hp = Math.max(P.hp, 100); fait = G.triche.invincible ? 'Mode dieu' : 'Mode dieu désactivé'; }
    else if (b.endsWith('idkfa') || b.endsWith('idfa')) {
      P.owned = P.owned.map(() => true); P.hasShotgun = true; P.backpack = true;
      Object.assign(P, { shells: 100, bullets: 400, rockets: 100, armor: 200 });
      if (P.cells !== undefined) P.cells = 600;
      if (b.endsWith('idkfa')) { P.keys = { red: true, blue: true, yellow: true }; fait = 'Armes, munitions et clés'; }
      else fait = 'Armes et munitions';
    }
    else if (b.endsWith('iddt')) { G.L.carteComplete = !G.L.carteComplete; fait = G.L.carteComplete ? 'Carte complète' : 'Carte normale'; }
    else if (b.endsWith('idclip')) { triche().traverse = !G.triche.traverse; fait = G.triche.traverse ? 'Traverse-murailles' : 'Traverse-murailles désactivé'; }
    else if (/idclev\d\d$/.test(b)) {
      const n = parseInt(b.slice(-2), 10);
      if (n >= 1 && n <= MAPS.length) { G.bande = ''; startLevel(n - 1); fait = 'Niveau ' + n; }
    }
    if (fait) { PRESSED.delete(code); G.bande = ''; say(fait); _son('DSGETPOW'); }   // la touche finale ne sert pas au jeu (F, P…)
  }
}

/* ---------- sauvegardes (6 emplacements dans le navigateur) ---------- */
function lireSauvegardes() {
  let l = [];
  try { l = JSON.parse(localStorage.getItem('doomed_sauvegardes') || '[]'); } catch (_) {}
  return Array.from({ length: NB_SAUVEGARDES }, (_, i) => (l[i] && l[i].etat ? l[i] : null));
}
const _versB64 = a => { let s = ''; for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); };
const _depuisB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
function etatPartie() {
  const L = G.L;
  return {
    carte: L.name, level: G.level, difficulte: G.difficulte === undefined ? 2 : G.difficulte, skill: G.skill,
    P: Object.assign({}, G.P), snap: G.snap, totals: G.totals, kills: G.kills, total: G.total, time: G.time,
    enemies: G.enemies.map(e => Object.assign({}, e, { def: undefined, cible: undefined })),
    items: G.items, nbObjets: G.nbObjets,
    grid: _versB64(L.grid), vu: L.vu ? _versB64(L.vu) : null, carteComplete: !!L.carteComplete,
    doors: L.doors.map(d => Object.assign({}, d)), secrets: L.secrets.map(s => !!s.found),
  };
}
function sauverPartie(i) {
  const l = lireSauvegardes(), d = new Date();
  l[i] = { nom: `${G.L.name.split(' ')[0]} ${fmtTime(G.time)} — ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`,
           etat: etatPartie() };
  try { localStorage.setItem('doomed_sauvegardes', JSON.stringify(l)); return true; } catch (e) { return false; }
}
function chargerPartie(i) {
  const s = lireSauvegardes()[i];
  if (!s) return false;
  const E = s.etat;
  let n = MAPS.findIndex(m => m.name === E.carte);
  if (n < 0) n = E.level;
  if (!(n >= 0 && n < MAPS.length)) return false;
  G.difficulte = E.difficulte; G.skill = E.skill;
  G.P = Object.assign(newPlayer(), E.P);
  G.totals = E.totals;
  startLevel(n);
  const L = G.L, g = _depuisB64(E.grid);
  if (g.length === L.grid.length) L.grid.set(g);
  if (E.vu) { const v = _depuisB64(E.vu); if (v.length === L.grid.length) L.vu = v; }
  L.carteComplete = E.carteComplete;
  E.doors.forEach((d, k) => { if (L.doors[k]) Object.assign(L.doors[k], d); });
  E.secrets.forEach((f, k) => { if (L.secrets[k]) L.secrets[k].found = f; });
  Object.assign(G.P, E.P);
  G.enemies = E.enemies.filter(e => ENEMY_DEF[e.type]).map(e => Object.assign(mkEnemy(e.type, e.x, e.y), e, { def: ENEMY_DEF[e.type] }));
  G.items = E.items; G.nbObjets = E.nbObjets; G.snap = E.snap;
  G.kills = E.kills; G.total = E.total; G.time = E.time;
  G.state = 'play';
  return true;
}
