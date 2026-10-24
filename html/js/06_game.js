"use strict";
/* DOOMED — 06_game.js : états du jeu, joueur, portes, ennemis, projectiles, objets, tir
 *
 * CONTRAT (vérifié par test.html — ne rien retirer de cette liste) :
 *   FOURNIT : G ENEMY_DEF NB_CARTES_JEU WEAPONS sonFD · wantsPointerLock onPointerUnlock say lireProgression sauverProgression inventaire · newPlayer startGame continuerPartie optionsTest preparerNiveaux startLevel restartLevel
 *             mkEnemy solidCell solidAt tryMove losClear passageLibre porteVerrouillee computeFlow flowTarget cibleChemin · gameUpdate updatePlay updateWorld updateDoors
 *             updateEnemies updateShots updatePickups · wake wakeNear startRangedAttack updateCharge hurtPlayer damageEnemy fire hitscan
 *             spawnFireball spawnRocket enemyShoot useAction · enemyTex collectSprites
 *             G.state ∈ title | play | pause | dead | clear | victory
 *   UTILISE : 01, TX (02), sfx distVol (03), MAPS loadLevel CELL_* (04)
 *   RÈGLE : les listes G.shots et G.fx doivent être vidées au fil du temps (pas de croissance sans fin).
 */

const G = {
  state: 'title', level: 0, L: null, P: null,
  enemies: [], shots: [], fx: [], items: [],
  kills: 0, total: 0, time: 0, stateT: 0,
  msg: '', msgT: 0, minimap: true, snap: null,
  pickFlash: 0, faceLook: 0, faceT: 0, totals: { kills: 0, total: 0, time: 0 },
  skill: 1,
};

const ENEMY_DEF = {
  imp:      { hp: 60,  speed: 1.6, melee: 10, r: 0.3,  scale: 0.9,
              ranged: { min: 2, max: 10, cool: [1.5, 2.5], speed: 5, dmg: 12, color: 'fire' } },
  pinky:    { hp: 150, speed: 2.6, melee: 15, r: 0.35, scale: 0.85 },
  caco:     { hp: 200, speed: 1.1, melee: 12, r: 0.4,  scale: 0.8, fly: 0.25,
              ranged: { min: 2, max: 12, cool: [2, 3], speed: 4, dmg: 15, color: 'blue' } },
  soldier:  { hp: 20,  speed: 1.4, melee: 0,  r: 0.3,  scale: 0.85,
              hitscan: { min: 1, max: 14, cool: [1.2, 2], dmg: [3, 9] }, drop: 'bullets' },
  lostsoul: { hp: 30,  speed: 2.2, melee: 0,  r: 0.3,  scale: 0.55, fly: 0.3,
              charge: { min: 1.5, max: 7, cool: [2, 3], speed: 7, dmg: 10, time: 0.8 } },
  baron:    { hp: 600, speed: 1.2, melee: 25, r: 0.45, scale: 1.1,
              ranged: { min: 2, max: 14, cool: [1.2, 2], speed: 6, dmg: 25, color: 'green' } },
  sporeling: {hp: 120, speed: 1.8, melee: 5, r: 0.4, scale: 0.75, ranged: {min: 3, max: 9, cool: [1.8, 2.8], speed: 6, dmg: 14, color: 'green'}, drop: 'medkit'},   // créé par le modèle : Sporeling,
  vulture: {hp: 450, speed: 1.8, melee: 35, r: 0.45, scale: 1.2, fly: 0.35, charge: {min: 6, max: 12, cool: [3, 4], speed: 9, dmg: 40, time: 0.8}, drop: 'armor'},   // créé par le modèle : Vulturion des Cendres
  // bestiaire de Doom II (lot 4) — plombs : tirs par salve ; rafale : salves enchaînées ; guide : missile qui suit sa cible
  // (rad/s) ; eventail : boules tirées ensemble (écart en rad) ; ames : crache des âmes perdues ; flamme : feu sur la cible
  sergent:     { hp: 30,   speed: 1.4, melee: 0,  r: 0.3,  scale: 0.85, hitscan: { min: 1, max: 12, cool: [1.4, 2.2], dmg: [3, 9], plombs: 3 }, drop: 'ammo' },
  commando:    { hp: 70,   speed: 1.4, melee: 0,  r: 0.3,  scale: 0.9,  hitscan: { min: 1, max: 14, cool: [1.6, 2.4], dmg: [3, 9], rafale: 4 }, drop: 'bullets' },
  chevalier:   { hp: 500,  speed: 1.2, melee: 20, r: 0.45, scale: 1.1,  ranged: { min: 2, max: 14, cool: [1.3, 2.1], speed: 6, dmg: 20, color: 'green' } },
  revenant:    { hp: 300,  speed: 1.9, melee: 18, r: 0.35, scale: 1.05, ranged: { min: 2, max: 16, cool: [1.6, 2.6], speed: 5, dmg: 20, color: 'tracer', guide: 2.2 } },
  mancubus:    { hp: 600,  speed: 0.9, melee: 0,  r: 0.45, scale: 1.3,  ranged: { min: 2, max: 14, cool: [2, 3], speed: 6, dmg: 18, color: 'manc', eventail: [-0.18, 0, 0.18] } },
  arachno:     { hp: 500,  speed: 1.3, melee: 0,  r: 0.45, scale: 1.0,  ranged: { min: 2, max: 14, cool: [1.8, 2.6], speed: 9, dmg: 8, color: 'apls', rafale: 4 } },
  elementaire: { hp: 400,  speed: 0.9, melee: 0,  r: 0.45, scale: 0.9,  fly: 0.3, ranged: { min: 1.5, max: 12, cool: [2.5, 4], speed: 0, dmg: 0, color: 'fire', ames: true } },
  cyber:       { hp: 4000, speed: 1.3, melee: 0,  r: 0.45, scale: 1.9,  boss: true, ranged: { min: 2, max: 18, cool: [1.6, 2.4], speed: 8, dmg: 0, color: 'rocket', rafale: 3, roquette: true } },
  araignee:    { hp: 3000, speed: 1.4, melee: 0,  r: 0.45, scale: 1.5,  boss: true, hitscan: { min: 1, max: 18, cool: [0.6, 1], dmg: [3, 9], plombs: 3, rafale: 3 } },
  archivile:   { hp: 700,  speed: 2.0, melee: 0,  r: 0.35, scale: 1.05, flamme: { min: 0, max: 12, cool: [2.5, 3.5], dmg: 20 }, resurrection: true },
  spectre:     { hp: 150,  speed: 2.6, melee: 15, r: 0.35, scale: 0.85, fuzz: true },   // pinky presque invisible (images du pinky)
};
const NB_CARTES_JEU = MAPS.length;   // cartes du jeu (sans celles de l'éditeur) : elles reçoivent le bestiaire de Doom II

const WEAPONS = [
  { name: 'Pistolet', ammo: null, cool: 0.35, pellets: 1, spread: 0.01, dmgMin: 10, dmgMax: 15, range: 20 },
  { name: 'Fusil à pompe', ammo: 'shells', cool: 0.9, pellets: 7, spread: 0.08, dmgMin: 6, dmgMax: 10, range: 12 },
  { name: 'Poing', ammo: null, cool: 0.5, pellets: 1, spread: 0, dmgMin: 8, dmgMax: 16, range: 1.2 },
  { name: 'Mitrailleuse', ammo: 'bullets', cool: 0.11, pellets: 1, spread: 0.03, dmgMin: 8, dmgMax: 12, range: 20 },
  { name: 'Lance-roquettes', ammo: 'rockets', cool: 0.9, pellets: 1, spread: 0, dmgMin: 0, dmgMax: 0, range: 0, rocket: true },
  { name: 'Tronçonneuse', ammo: null, cool: 0.07, pellets: 1, spread: 0, dmgMin: 2, dmgMax: 20, range: 1.3, scie: true },
  { name: 'Fusil à plasma', ammo: 'cells', cool: 0.09, pellets: 1, spread: 0, dmgMin: 5, dmgMax: 40, range: 0, plasma: true },
  { name: 'BFG 9000', ammo: 'cells', cout: 40, cool: 1.4, pellets: 1, spread: 0, dmgMin: 100, dmgMax: 800, range: 0, bfg: true },
];
const sonFD = (nom, vol, repli) => { if (!(typeof jouerSonFD === 'function' && jouerSonFD(nom, vol === undefined ? 1 : vol)) && repli) repli(); };

function wantsPointerLock() { return ['play', 'pause', 'title', 'clear', 'dead', 'victory'].includes(G.state); }   // libérée seulement en pause (Échap, P)
function onPointerUnlock() { if (G.state === 'play') { G.state = 'pause'; G.menu = typeof nouveauMenu === 'function' ? nouveauMenu() : null; } }   // menu de Doom (07c)
function say(m) { G.msg = m; G.msgT = 2.5; }

function lireProgression() {
  try {
    const raw = localStorage.getItem('doomed_progress');
    if (raw) {
      const p = JSON.parse(raw);
      return { reached: typeof p.reached === 'number' ? p.reached : 0, best: (p.best && typeof p.best === 'object') ? p.best : {},
               inv: (p.inv && typeof p.inv === 'object') ? p.inv : {} };
    }
  } catch (_) {}
  return { reached: 0, best: {}, inv: {} };
}

/* inventaire du joueur (armes, munitions, armure) : gardé au début de chaque niveau et avec la progression */
function inventaire(P) {
  return { owned: P.owned.slice(), hasShotgun: P.hasShotgun, weapon: P.weapon, shells: P.shells, bullets: P.bullets,
           rockets: P.rockets, cells: P.cells || 0, armor: P.armor, backpack: !!P.backpack };
}

function sauverProgression(p) {
  try {
    localStorage.setItem('doomed_progress', JSON.stringify({ reached: p.reached | 0, best: p.best || {}, inv: p.inv || {} }));
    return true;
  } catch (e) {
    return false;
  }
}

function newPlayer() {
  return { x: 0, y: 0, a: 0, hp: 100, shells: 0, hasShotgun: false, weapon: 0,
    cool: 0, bob: 0, moving: 0, kick: 0, flash: 0, hurt: 0, faceDir: 0, armor: 0, lavaT: 0,
    owned: [true, false, true, false, false, false, false, false], bullets: 50, rockets: 0, cells: 0, keys: {},
    invulT: 0, combiT: 0, lunettesT: 0, teleT: 0, bfgT: 0 };
}

function startGame() {
  G.P = newPlayer();
  G.totals = { kills: 0, total: 0, time: 0 };
  startLevel(0);
}

/* options de test lues dans l'adresse (page niveaux.html) : ?niveau=N&difficulte=0..2&invincible=1&armes=1 ; null sans niveau */
function optionsTest(recherche) {
  const q = new URLSearchParams(recherche === undefined ? location.search : recherche), n = parseInt(q.get('niveau'), 10);
  if (!(n >= 1)) return null;
  const d = parseInt(q.get('difficulte'), 10);
  return { niveau: n, difficulte: d >= 0 && d <= 2 ? d : 1, invincible: q.get('invincible') === '1', armes: q.get('armes') === '1' };
}

function preparerNiveaux() {
  if (G.niveauxPrets) return;   // une seule fois
  G.niveauxPrets = true;
  for (const m of lireNiveauxPerso()) if (!MAPS.some(x => x.name === m.name)) MAPS.push(m);
  if (location.hash === '#test') {
    const t = lireNiveauTest();
    if (t) {
      MAPS.push(Object.assign({}, t, { name: 'TEST — ' + t.name }));
      G.P = newPlayer();
      G.totals = { kills: 0, total: 0, time: 0 };
      startLevel(MAPS.length - 1);
      G.modeTest = true;
    }
  }
  const o = optionsTest();   // lancement direct d'un niveau, pour le tester sans refaire les précédents
  if (o && !G.modeTest) {
    G.skill = o.difficulte; G.triche = o;
    G.P = newPlayer();
    if (o.armes) Object.assign(G.P, { owned: [true, true, true, true, true], hasShotgun: true, shells: 50, bullets: 200, rockets: 50 });
    G.totals = { kills: 0, total: 0, time: 0 };
    startLevel(Math.min(o.niveau, MAPS.length) - 1);
    if (o.invincible) say(G.L.name + ' — test : invincible');
  }
}

function startLevel(i) {
  const L = G.L = loadLevel(i), P = G.P;
  G.level = i;
  P.x = L.start.x; P.y = L.start.y; P.a = L.start.a;
  P.cool = 0; P.hurt = 0; P.flash = 0; P.kick = 0;
  P.keys = {};
  P.berserk = false; P.invisT = 0;

  G.snap = inventaire(P);   // inventaire au début du niveau : on le retrouve si l'on meurt

  const skill = (G.skill === undefined) ? 1 : G.skill;
  let list = L.enemies.map(e => mkEnemy(e.type, e.x, e.y));
  if (skill === 0) {
    for (let k = 2; k < list.length; k += 3) list.splice(k--, 1);
  }
  if (i < NB_CARTES_JEU) bestiaire(list, i);
  const mult = [0.7, 1, 1.4][skill];
  for (const e of list) e.hp = Math.round(e.def.hp * mult);

  G.enemies = list;
  G.items = L.items.map(it => Object.assign({}, it));
  G.nbObjets = G.items.length;   // objets de la carte (écran de stats : les objets lâchés ne comptent pas)
  G.sourireJusqua = G.ouchJusqua = G.tirDepuis = 0;   // minuteries du visage (07b)
  G.shots = []; G.fx = [];
  G.kills = 0; G.total = G.enemies.length; G.time = 0; G.flowT = 0;
  G.state = 'play';
  say(L.name);
  musicStart();
}

/* Les cartes du jeu ne placent que les 6 monstres d'origine : une partie d'entre eux devient, selon le niveau, un monstre
   de Doom II de même rôle (soldats → sergents, commandos ; pinky → spectres ; cacos → élémentaires, mancubus…). Le
   tirage dépend du niveau et du rang du monstre : la même carte donne toujours les mêmes monstres. Deux boss : le
   cyberdémon au dernier niveau, l'araignée cervelle deux niveaux avant. */
function bestiaire(list, niv) {
  const tirage = k => ((((niv + 1) * 73856093) ^ ((k + 1) * 19349663)) >>> 0) % 1000 / 1000;
  const regles = {
    soldier: [[1, 0.3, 'sergent'], [3, 0.2, 'commando']], pinky: [[2, 0.3, 'spectre'], [12, 0.1, 'archivile']],
    imp: [[4, 0.1, 'chevalier'], [9, 0.12, 'revenant']], caco: [[6, 0.2, 'elementaire'], [8, 0.15, 'mancubus']],
    sporeling: [[9, 0.25, 'arachno']], baron: [[0, 0.5, 'chevalier', 6], [5, 0.2, 'mancubus'], [7, 0.2, 'arachno'], [11, 0.1, 'archivile']],
  };
  list.forEach((e, k) => {
    let t = tirage(k);
    for (const [min, part, type, max] of regles[e.type] || []) {
      if (niv >= min && (max === undefined || niv < max) && t < part) { list[k] = mkEnemy(type, e.x, e.y); break; }
      if (niv >= min && (max === undefined || niv < max)) t -= part;
    }
  });
  const boss = niv === NB_CARTES_JEU - 1 ? 'cyber' : niv === NB_CARTES_JEU - 3 ? 'araignee' : null;
  if (boss && list.length) {
    const k = Math.max(0, list.findIndex(e => e.type === 'baron' || e.type === 'chevalier'));
    list[k] = mkEnemy(boss, list[k].x, list[k].y);
  }
}

function restartLevel() {
  Object.assign(G.P, G.snap, { owned: G.snap.owned.slice(), hp: 100 });
  startLevel(G.level);
}

function mkEnemy(type, x, y) {
  return { type, def: ENEMY_DEF[type], x, y, hp: ENEMY_DEF[type].hp, state: 'idle', t: 0,
    cool: rand(0.5, 1.5), anim: Math.random() * 10, moving: false, tx: x, ty: y,
    sideT: 0, sideDir: 1, ranged: false, hitAt: 0, hitDone: false };
}

/* ---------- collisions, ligne de vue ---------- */
function solidCell(cx, cy) {
  const L = G.L;
  if (cx < 0 || cy < 0 || cx >= L.w || cy >= L.h) return true;
  const code = L.grid[cy * L.w + cx];
  if (code === CELL_EMPTY) return false;
  if (code === CELL_DOOR) return L.doors[L.doorAt[cy * L.w + cx]].open < 0.95;
  return true;
}
const solidAt = (x, y) => solidCell(Math.floor(x), Math.floor(y));

/* déplacement avec glissement le long des murs (axes testés séparément) */
function tryMove(o, mx, my, r) {
  if (o === G.P && G.triche && G.triche.traverse) { o.x = clamp(o.x + mx, 1, G.L.w - 1); o.y = clamp(o.y + my, 1, G.L.h - 1); return; }   // idclip (07c)
  if (mx) {
    const nx = o.x + mx, ex = nx + Math.sign(mx) * r;
    if (!solidAt(ex, o.y - r) && !solidAt(ex, o.y + r)) o.x = nx;
  }
  if (my) {
    const ny = o.y + my, ey = ny + Math.sign(my) * r;
    if (!solidAt(o.x - r, ey) && !solidAt(o.x + r, ey)) o.y = ny;
  }
}

function losClear(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, n = Math.ceil(Math.hypot(dx, dy) * 8);
  for (let i = 1; i < n; i++) if (solidAt(ax + dx * i / n, ay + dy * i / n)) return false;
  return true;
}

/* Le corps d'un ennemi (carré de demi-côté r, comme dans tryMove) peut-il aller en ligne droite de A à B
   sans toucher de mur ? losClear ne suit que le centre : il « voit » passer au ras d'un angle où le corps bute. */
function passageLibre(ax, ay, bx, by, r) {
  const dx = bx - ax, dy = by - ay, n = Math.max(1, Math.ceil(Math.hypot(dx, dy) * 10));
  for (let i = 1; i <= n; i++) {
    const x = ax + dx * i / n, y = ay + dy * i / n;
    if (solidAt(x - r, y - r) || solidAt(x + r, y - r) || solidAt(x - r, y + r) || solidAt(x + r, y + r)) return false;
  }
  return true;
}

/* porte à clé que le joueur ne peut pas encore ouvrir : les ennemis non plus (sinon ils s'y entassent) */
function porteVerrouillee(L, i) {
  const D = L.doors && L.doors[L.doorAt[i]];
  return !!(D && D.key && !(G.P && G.P.keys && G.P.keys[D.key]));
}

/* Carte des distances au joueur : G.flow[i] = nombre de pas BFS depuis la case du joueur.
   -1 = inconnu/inaccessible. Une case est traversable si vide ou porte (les ennemis ouvrent les portes),
   sauf une porte à clé encore verrouillée. */
function computeFlow() {
  const L = G.L;
  if (!G.flow || G.flow.length !== L.w * L.h) G.flow = new Int16Array(L.w * L.h);
  G.flow.fill(-1);
  const sx = Math.floor(G.P.x), sy = Math.floor(G.P.y);
  if (sx < 0 || sy < 0 || sx >= L.w || sy >= L.h) return;
  const si = sy * L.w + sx, scode = L.grid[si];
  if (scode !== CELL_EMPTY && scode !== CELL_DOOR) return;
  G.flow[si] = 0;
  let head = 0; const q = [si];
  while (head < q.length) {
    const i = q[head++], d = G.flow[i];
    const x = i % L.w, y = (i / L.w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;   // bornes testées avant l'indice : pas de saut d'un bord à l'autre
      if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h) continue;
      const j = ny * L.w + nx, c = L.grid[j];
      if ((c !== CELL_EMPTY && c !== CELL_DOOR) || G.flow[j] !== -1 || (c === CELL_DOOR && porteVerrouillee(L, j))) continue;
      G.flow[j] = d + 1; q.push(j);
    }
  }
}

/* Prochaine case vers le joueur pour l'ennemi e : la voisine (4 directions) de plus petite
   distance G.flow. null si aucune, ou si G.flow n'est pas encore calculée (computeFlow est
   appelée après updateEnemies dans updateWorld : à la 1re image d'un niveau, G.flow peut manquer). */
function flowTarget(e) {
  const L = G.L;
  if (!G.flow || G.flow.length !== L.w * L.h) return null;
  const cx = Math.floor(e.x), cy = Math.floor(e.y);
  let bestV = Infinity, bx = null, by = null;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {   // pas de diagonale : coins de murs
    const nx = cx + dx, ny = cy + dy;
    if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h) continue;
    const v = G.flow[ny * L.w + nx];
    if (v >= 0 && v < bestV) { bestV = v; bx = nx; by = ny; }
  }
  return bx === null ? null : { x: bx + 0.5, y: by + 0.5 };
}

/* Point à viser pour l'ennemi e qui suit G.flow : le centre de la case la plus avancée du chemin (jusqu'à
   5 cases) qu'il peut rejoindre en ligne droite SANS que son corps touche un mur. Viser simplement la case
   voisine faisait couper les angles : le corps butait sur le coin, glissait, repartait (blocage aux
   intersections). Si même la 1re case n'est pas rejoignable, il se recentre d'abord dans sa case. */
function cibleChemin(e) {
  const L = G.L, r = e.def.r + 0.02;
  if (!G.flow || G.flow.length !== L.w * L.h) return null;
  const x0 = Math.floor(e.x), y0 = Math.floor(e.y);
  let cx = x0, cy = y0, best = null, premiere = null;
  for (let k = 0; k < 5; k++) {
    const ici = (cx >= 0 && cy >= 0 && cx < L.w && cy < L.h) ? G.flow[cy * L.w + cx] : -1;
    let bv = ici >= 0 ? ici : Infinity, nx = null, ny = null;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ax = cx + dx, ay = cy + dy;
      if (ax < 0 || ay < 0 || ax >= L.w || ay >= L.h) continue;
      const v = G.flow[ay * L.w + ax];
      if (v >= 0 && v < bv) { bv = v; nx = ax; ny = ay; }
    }
    if (nx === null) break;   // case du joueur atteinte, ou aucune voisine plus proche
    cx = nx; cy = ny;
    if (!premiere) premiere = { x: cx + 0.5, y: cy + 0.5 };
    if (!passageLibre(e.x, e.y, cx + 0.5, cy + 0.5, r)) break;
    best = { x: cx + 0.5, y: cy + 0.5 };
  }
  if (best || !premiere) return best;
  // 1re case pas rejoignable tout droit (coin de mur, porte encore fermée) : se recentrer, puis y aller
  return Math.hypot(e.x - x0 - 0.5, e.y - y0 - 0.5) > 0.05 ? { x: x0 + 0.5, y: y0 + 0.5 } : premiere;
}

/* ---------- boucle de jeu ---------- */
function gameUpdate(dt) {
  if (G.state === 'title') preparerNiveaux();   // niveaux de l'éditeur, mode test
  if (G.melt && (G.melt.t += dt) > 1.2) G.melt = null;
  if (G.state !== 'play' && G.state !== 'pause') musicStop();
  if (pressed('Tab')) G.automap = !G.automap;          // carte automatique (07b), comme Doom
  if (G.msgT > 0) G.msgT -= dt;
  G.pickFlash = Math.max(0, G.pickFlash - dt);
  G.stateT += dt;

  if (typeof menuActif === 'function' && menuActif()) { menuMaj(); return; }   // menus de Doom (07c)
  if (G.state === 'play' && typeof codesTriche === 'function') codesTriche();

  let go = ENTER() || pressed('Mouse0');
  const inTitle = G.state === 'title';

  switch (G.state) {
    case 'title': if (go && !inTitle) startGame(); break;
    case 'pause': {
      G.optLigne = G.optLigne || 0;
      if (pressed('ArrowUp')) G.optLigne = (G.optLigne + 2) % 3;
      if (pressed('ArrowDown')) G.optLigne = (G.optLigne + 1) % 3;
      const sens = (pressed('ArrowRight') ? 1 : 0) - (pressed('ArrowLeft') ? 1 : 0);
      if (sens) {
        if (G.optLigne === 0) SETTINGS.sens = clamp(Math.round((SETTINGS.sens + sens * 0.25) * 100) / 100, 0.5, 2);
        else if (G.optLigne === 1) {
          SETTINGS.volume = clamp(Math.round((SETTINGS.volume + sens * 0.1) * 10) / 10, 0, 1);
          if (typeof MASTER !== 'undefined' && MASTER) MASTER.gain.value = SETTINGS.volume;
        } else {
          SETTINGS.music = !SETTINGS.music;
          if (typeof MUSIQUE !== 'undefined') { MUSIQUE.actif = SETTINGS.music; if (!SETTINGS.music) musicStop(); }
        }
        sauverReglages();
      }
      if (go || pressed('KeyP')) G.state = 'play';
      break;
    }
    case 'play': updatePlay(dt); break;
    case 'dead':
      updateWorld(dt);
      if (G.stateT > 1 && go) restartLevel();
      break;
    case 'clear':
      if (G.stateT > 0.5 && go) {
        startMelt();
        if (G.level + 1 < MAPS.length) startLevel(G.level + 1);
        else { G.state = 'victory'; G.stateT = 0; }
      }
      break;
    case 'victory': if (G.stateT > 1 && go) G.state = 'title'; break;
  }

  if (inTitle) {
    let arrowUsed = false;
    if (pressed('ArrowRight')) { G.skill = Math.min(2, G.skill + 1); arrowUsed = true; }
    else if (pressed('ArrowLeft')) { G.skill = Math.max(0, G.skill - 1); arrowUsed = true; }

    if (!arrowUsed && go) startGame();
  }

  if (G.state === 'title' && pressed('KeyC') && continuerPartie()) return;
}

/* reprend au dernier niveau atteint, avec les armes et munitions gagnées ; faux sans progression */
function continuerPartie() {
  const prog = lireProgression();
  if (!(prog.reached > 0)) return false;
  startGame();
  const n = Math.min(prog.reached, MAPS.length - 1);
  if (prog.inv[n]) Object.assign(G.P, prog.inv[n], { owned: prog.inv[n].owned.slice() });
  startLevel(n);
  return true;
}

function updatePlay(dt) {
  const P = G.P;
  G.time += dt;
  if (pressed('KeyP') || pressed('Escape')) {
    G.state = 'pause';
    G.menu = pressed('Escape') && typeof nouveauMenu === 'function' ? nouveauMenu() : null;   // Échap : menu de Doom (07c) ; P : pause simple
    if (MOUSE.locked && document.exitPointerLock) document.exitPointerLock();
    return;
  }
  // plein écran : touche F
  if (pressed('KeyF')) {
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    try {
      if (!fsEl) {
        const p = cv.requestFullscreen ? cv.requestFullscreen() : null;
        if (p && typeof p.catch === 'function') p.catch(function () {});
      } else if (document.exitFullscreen) {
        document.exitFullscreen().catch(function () {});
      }
    } catch (e) {}
  }
  // musique : touche M
  if (pressed('KeyM')) {
    MUSIQUE.actif = !MUSIQUE.actif;
    if (MUSIQUE.actif) musicStart(); else musicStop();
    say(MUSIQUE.actif ? 'Musique : oui' : 'Musique : non');
  }
  // rotation (flèches + souris)
  const turn = (KEYS.ArrowRight ? 1 : 0) - (KEYS.ArrowLeft ? 1 : 0);
  P.a = angNorm(P.a + turn * 2.6 * dt + MOUSE.dx * 0.0025 * SETTINGS.sens);
  // déplacement : avancer/reculer + pas de côté
  const f = (KEYS.KeyW || KEYS.ArrowUp ? 1 : 0) - (KEYS.KeyS || KEYS.ArrowDown ? 1 : 0);
  const s = (KEYS.KeyD ? 1 : 0) - (KEYS.KeyA ? 1 : 0);
  let mx = Math.cos(P.a) * f - Math.sin(P.a) * s, my = Math.sin(P.a) * f + Math.cos(P.a) * s;
  const len = Math.hypot(mx, my);
  if (len > 0) {
    const sp = 3.2 * dt / len;
    tryMove(P, mx * sp, my * sp, 0.25);
    P.bob += dt * 9; P.moving = Math.min(1, P.moving + dt * 6);
  } else P.moving = Math.max(0, P.moving - dt * 6);
  // armes : synchronisation possédées puis sélection clavier
  if (P.hasShotgun) P.owned[1] = true;
  const choix = n => pressed('Digit' + n) || pressed('Numpad' + n);
  if (choix(3) && P.owned[5]) P.weapon = P.weapon === 2 ? 5 : 2;   // 3 : poing ou tronçonneuse, comme le 1 de Doom
  else if (choix(6) && P.owned[6]) P.weapon = 6;
  else if (choix(7) && P.owned[7]) P.weapon = 7;
  for (let n = 1; n <= 5; n++) {
    if (n === 3 && P.owned[5]) continue;
    const codeD = 'Digit' + n, codeN = 'Numpad' + n;
    if ((pressed(codeD) || pressed(codeN)) && P.owned[n - 1]) P.weapon = n - 1;
  }
  P.cool -= dt; P.flash -= dt;
  P.kick = Math.max(0, P.kick - dt * 4);
  P.hurt = Math.max(0, P.hurt - dt);
  P.invisT = Math.max(0, (P.invisT || 0) - dt);
  for (const k of ['invulT', 'combiT', 'lunettesT', 'teleT', 'scieT']) P[k] = Math.max(0, (P[k] || 0) - dt);   // bonus et effets à durée
  if (P.bfgT > 0 && (P.bfgT -= dt) <= 0) { P.bfgT = 0; P.flash = 0.12; P.kick = 1.5; tirJoueur('bfg', 9, randInt(100, 800)); }
  teleporter();
  if ((MOUSE.down || KEYS.Space) && P.cool <= 0) fire();
  G.tirDepuis = (MOUSE.down || KEYS.Space) ? (G.tirDepuis || performance.now()) : 0;   // visage enragé (07b) si ça dure
  if (pressed('KeyE')) useAction();
  // visage du HUD : regard qui change de temps en temps
  G.faceT -= dt;
  if (G.faceT <= 0) { G.faceLook = randInt(-1, 1); G.faceT = rand(0.8, 2); }

  updateWorld(dt);
  // lave : brûlure périodique si le joueur est sur une case de lave
  let onLava = false;
  if (G.L && G.L.floorType) {
    const cx = P.x | 0, cy = P.y | 0;
    if (cx >= 0 && cy >= 0 && cx < G.L.w && cy < G.L.h) {
      const ft = G.L.floorType[cy * G.L.w + cx];
      onLava = (ft === 1 || ft === 2) && !(P.combiT > 0);   // lave ou nukage, sauf avec la combinaison anti-radiations
      P.solNukage = ft === 2;                               // le nukage brûle deux fois moins souvent
    }
  }
  // lave : 5 dégâts dès le contact, puis toutes les 0,5 s ; le délai continue de courir hors de la lave
  // (une traversée rapide brûle quand même, et sautiller dessus ne brûle pas plus vite)
  P.lavaT = Math.max(0, P.lavaT - dt);
  if (onLava && P.lavaT <= 0) {
    P.lavaT = P.solNukage ? 1 : 0.5;
    hurtPlayer(5, { x: P.x, y: P.y });
  }

  updatePickups();
  if (P.hp <= 0) {
    P.hp = 0; G.state = 'dead'; G.stateT = 0; sfx.pdeath();   // souris gardée : on rejoue sans recliquer
  }
}

function updateWorld(dt) {
  if (G.L && Array.isArray(G.L.flicker) && G.L.light) {
    for (const i of G.L.flicker) {
      if (Math.random() < 0.15) G.L.light[i] = Math.random() < 0.5 ? 0.3 : 1;
    }
  }
  const L = G.L, t = (G.time || 0);
  if (L && L.light) {
    for (const i of L.glow || []) L.light[i] = 0.55 + 0.45 * Math.sin(t * 3);
    for (const i of L.strobe || []) L.light[i] = (Math.floor(t * 2) % 2) ? 1 : 0.25;
  }
  animerSols(t);
  updateDoors(dt);
  updateEnemies(dt);
  updateShots(dt);
  for (const f of G.fx) f.t += dt;          // explosions des boules de feu (sinon G.fx grossit sans fin)
  G.flowT -= dt;
  if (G.flowT <= 0) { computeFlow(); G.flowT = 0.25; }
  G.fx = G.fx.filter(f => f.t < 0.35);
}

/* sols animés de Doom : lave (4 images) et nukage (3 images), 8 images par seconde ; le rendu lit TX.lavaAnim, TX.nukageAnim */
function animerSols(t) {
  for (const [nom, n] of [['lava', 4], ['nukage', 3]]) {
    const im = [TX[nom], ...Array.from({ length: n - 1 }, (_, k) => TX[nom + (k + 2)])].filter(Boolean);
    if (im.length) TX[nom + 'Anim'] = im[Math.floor(t * 8) % im.length];
  }
}

/* ---------- portes ---------- */
function bodies() {
  const list = G.enemies.filter(e => e.state !== 'dead').map(e => ({ x: e.x, y: e.y, r: e.def.r }));
  if (G.state === 'play') list.push({ x: G.P.x, y: G.P.y, r: 0.25 });
  return list;
}
function updateDoors(dt) {
  const B = bodies(), P = G.P;
  if (G.keyMsgT > dt) G.keyMsgT -= dt; else G.keyMsgT = 0;
  for (const D of G.L.doors) {
    const cx = D.x + 0.5, cy = D.y + 0.5;
    let near, inside;
    if (D.key) {
      const hasKey = !!(P.keys && P.keys[D.key]);
      near = Math.hypot(P.x - cx, P.y - cy) < 1.5;
      inside = false;
      if (!hasKey) {
        D.state = 'closed';
        D.open = 0;
        if (near && G.keyMsgT <= 0) {
          const names = { red: 'rouge', blue: 'bleue', yellow: 'jaune' };
          say('Il faut la clé ' + (names[D.key] || D.key));
          sfx.oof();
          G.keyMsgT = 1;
        }
      } else if (D.state === 'closed') {
        D.state = 'opening';
        const v = distVol(Math.hypot(P.x - cx, P.y - cy));
        sfx.door(v);
      }
    } else {
      near = B.some(b => Math.hypot(b.x - cx, b.y - cy) < 1.5);
      inside = B.some(b => Math.abs(b.x - cx) < 0.5 + b.r && Math.abs(b.y - cy) < 0.5 + b.r);
    }
    if (D.key) {
      const hasKey = !!(P.keys && P.keys[D.key]);
      switch (D.state) {
        case 'opening': D.open += dt * 2; if (D.open >= 1) { D.open = 1; D.state = 'open'; D.t = 3; } break;
        case 'open':
          if (hasKey && near) D.t = 3;
          else if ((D.t -= dt) <= 0) { D.state = 'closing'; const v2 = distVol(Math.hypot(P.x - cx, P.y - cy)); sfx.door(v2, true); }
          break;
        case 'closing':
          if (hasKey && near) { D.state = 'opening'; break; }
          D.open -= dt * 2; if (D.open <= 0) { D.open = 0; D.state = 'closed'; }
          break;
      }
    } else {
      const v = distVol(Math.hypot(P.x - cx, P.y - cy));
      switch (D.state) {
        case 'closed': if (near) { D.state = 'opening'; sfx.door(v); } break;
        case 'opening': D.open += dt * 2; if (D.open >= 1) { D.open = 1; D.state = 'open'; D.t = 3; } break;
        case 'open':
          if (near || inside) D.t = 3;
          else if ((D.t -= dt) <= 0) { D.state = 'closing'; sfx.door(v, true); }
          break;
        case 'closing':
          if (near || inside) { D.state = 'opening'; break; }
          D.open -= dt * 2; if (D.open <= 0) { D.open = 0; D.state = 'closed'; }
          break;
      }
    }
  }
}

/* ---------- ennemis ---------- */
function wake(e) {
  if (e.state !== 'idle') return;
  e.state = 'chase'; e.cool = rand(0.3, 1);
  sfx.sight(e.type, distVol(Math.hypot(e.x - G.P.x, e.y - G.P.y)));
}
/* Le bruit (tir) réveille les ennemis à moins de r cases DE MARCHE, en passant par le sol et les portes
   ouvertes : ni à travers un mur, ni à travers une porte fermée. Avant, il traversait tout dans un rayon r,
   et des monstres d'autres salles arrivaient par surprise, comme apparus devant le joueur. */
function wakeNear(x, y, r) {
  const L = G.L, cx = Math.floor(x), cy = Math.floor(y);
  if (!L || cx < 0 || cy < 0 || cx >= L.w || cy >= L.h) return;
  const dist = new Map([[cy * L.w + cx, 0]]), file = [cy * L.w + cx];
  for (let h = 0; h < file.length; h++) {
    const i = file[h], d = dist.get(i), ix = i % L.w, iy = (i / L.w) | 0;
    if (d >= r) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = ix + dx, ny = iy + dy;
      if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h || solidCell(nx, ny)) continue;   // porte : seulement ouverte
      const j = ny * L.w + nx;
      if (!dist.has(j)) { dist.set(j, d + 1); file.push(j); }
    }
  }
  for (const e of G.enemies) {
    if (e.state !== 'idle' || Math.hypot(e.x - x, e.y - y) >= r) continue;
    if (dist.has(Math.floor(e.y) * L.w + Math.floor(e.x))) wake(e);
  }
}

function startRangedAttack(e, d, see, dt) {
  const r = e.def.ranged || e.def.hitscan || e.def.flamme;
  if (!r || !see || d <= r.min || d >= r.max || e.cool > 0 || Math.random() >= dt * 1.2) return false;
  e.rafale = r.rafale || 1;
  const prep = e.def.flamme ? 0.9 : 0.3;   // l'archi-infâme prépare son feu
  e.state = 'attack'; e.ranged = true; e.t = prep + 0.3 + 0.12 * (e.rafale - 1); e.hitAt = e.t - prep; e.hitDone = false;
  e.cool = rand(r.cool[0], r.cool[1]);
  if (e.def.flamme) sonFD('DSVILATK', distVol(d));
  return true;
}

/* archi-infâme : le feu jaillit sous la cible (vue directe), puis la projette en l'air */
function flamme(e, T) {
  if (!losClear(e.x, e.y, T.x, T.y)) return;
  G.fx.push({ x: T.x, y: T.y, t: 0, tex: 'fireball', grand: true });
  sonFD('DSBAREXP', distVol(Math.hypot(T.x - G.P.x, T.y - G.P.y)));
  if (T === G.P) hurtPlayer(e.def.flamme.dmg + 50, e); else damageEnemy(T, 70, e);
}

/* archi-infâme : ranime un cadavre proche (sauf boss, archi-infâmes et élémentaires) ; vrai s'il l'a fait */
function ressusciter(e) {
  if ((e.reveilT = (e.reveilT || 0) - 1 / 60) > 0) return false;
  e.reveilT = 0.5;
  const c = G.enemies.find(m => m.state === 'dead' && !m.def.boss && m.type !== 'archivile' && m.type !== 'elementaire'
    && m.t > 1 && Math.hypot(m.x - e.x, m.y - e.y) < 1.4);
  if (!c) return false;
  c.state = 'chase'; c.hp = c.def.hp; c.t = 0; c.cool = 1; G.kills = Math.max(0, G.kills - 1);
  e.state = 'attack'; e.ranged = false; e.t = 0.6; e.hitAt = -1; e.hitDone = true;
  sonFD('DSSLOP', distVol(Math.hypot(c.x - G.P.x, c.y - G.P.y)));
  return true;
}

function updateCharge(e, d, see, dt) {
  const c = e.def.charge;
  if (!c) return false;
  const P = G.P;
  if (e.state === 'charge') {
    e.t -= dt; e.moving = true;
    const sp = c.speed * dt, ox = e.x, oy = e.y;
    tryMove(e, e.cvx * sp, e.cvy * sp, e.def.r);
    if (G.state === 'play' && Math.hypot(P.x - e.x, P.y - e.y) < e.def.r + 0.35) { hurtPlayer(c.dmg, e); e.state = 'chase'; }
    else if (Math.hypot(e.x - ox, e.y - oy) < sp * 0.3 || e.t <= 0) e.state = 'chase';
    return true;
  }
  if (e.state === 'chase' && see && d > c.min && d < c.max && e.cool <= 0) {
    e.state = 'charge'; e.t = c.time; e.cvx = (P.x - e.x) / d; e.cvy = (P.y - e.y) / d;
    e.cool = rand(c.cool[0], c.cool[1]);
    return true;
  }
  return false;
}

/* téléporteur T : vers la n-ième arrivée d de la carte ; un monstre sur l'arrivée est écrasé (télé-frag) */
function teleporter() {
  const P = G.P, L = G.L, cx = Math.floor(P.x), cy = Math.floor(P.y);
  if (P.teleT > 0 || !L.telep || !L.telep.length || !L.arrivees.length || L.floorType[cy * L.w + cx] !== 3) return;
  const k = L.telep.findIndex(t => t.x === cx && t.y === cy);
  const a = L.arrivees[Math.min(Math.max(0, k), L.arrivees.length - 1)];
  G.fx.push({ x: P.x, y: P.y, t: 0, tex: 'telefog', grand: true });
  P.x = a.x; P.y = a.y; P.teleT = 0.8;
  G.fx.push({ x: a.x + Math.cos(P.a) * 0.6, y: a.y + Math.sin(P.a) * 0.6, t: 0, tex: 'telefog', grand: true });
  for (const e of G.enemies) if (e.state !== 'dead' && Math.hypot(e.x - a.x, e.y - a.y) < e.def.r + 0.3) damageEnemy(e, 10000);
  sonFD('DSTELEPT', 1, () => sfx.door(1));
}

function hurtPlayer(dmg, src) {
  const P = G.P;
  if (G.state !== 'play') return;
  if (G.triche && G.triche.invincible) return;   // test d'un niveau en mode invincible
  if (P.invulT > 0) return;                      // sphère d'invulnérabilité
  let mult = G.difficulte === 0 ? 0.5 : [0.6, 1, 1.5][G.skill] || 1;   // « Trop jeune pour mourir » : moitié des dégâts
  dmg = Math.round(dmg * mult);
  let absorbed = 0;
  if (P.armor > 0) {
    absorbed = Math.min(Math.round(dmg / 3), P.armor);
    P.armor -= absorbed;
  }
  const rest = dmg - absorbed;
  P.hp -= rest;
  P.hurt = 0.5; sfx.hurt();
  if (rest >= 20) G.ouchJusqua = performance.now() + 800;   // gros coup : visage « aïe » (07b)
  P.faceDir = Math.sign(angNorm(Math.atan2(src.y - P.y, src.x - P.x) - P.a));
}

/* cible d'un monstre : le joueur, ou le monstre d'une autre espèce qui l'a blessé, tant qu'il vit (comme dans Doom) */
function cibleDe(e) {
  const c = e.cible;
  if (c && c.state !== 'dead' && G.enemies.includes(c)) return c;
  e.cible = null;
  return G.P;
}

function updateEnemies(dt) {
  const P = G.P;
  for (const e of G.enemies) {
    e.anim += dt;
    if (e.state === 'dead') { e.t += dt; continue; }
    const T = cibleDe(e), contreMonstre = T !== P, alive = G.state === 'play' || contreMonstre;
    const dx = T.x - e.x, dy = T.y - e.y, d = Math.hypot(dx, dy);
    const see = alive && d < 16 && losClear(e.x, e.y, T.x, T.y);
    // droit sur la cible seulement si le corps passe ; sinon (angle de mur entre les deux) on suit le chemin
    const ft = see && passageLibre(e.x, e.y, T.x, T.y, e.def.r + 0.02) ? null : contreMonstre ? null : (cibleChemin(e) || (see ? null : flowTarget(e)));
    e.suitChemin = ft !== null;
    if (ft !== null) { e.tx = ft.x; e.ty = ft.y; }
    else if (see) { e.tx = T.x; e.ty = T.y; }
    if (e.def.resurrection && e.state === 'chase' && ressusciter(e)) continue;
    e.moving = false;
    if (e.def.charge && !contreMonstre && updateCharge(e, d, see, dt)) continue;   // âme perdue en charge
    switch (e.state) {
      case 'idle': if (see && d < 12) wake(e); break;
      case 'pain': if ((e.t -= dt) <= 0) e.state = 'chase'; break;
      case 'attack':
        e.t -= dt;
        if (!e.hitDone && e.t <= e.hitAt) {
          if (e.ranged) { if (see) { if (e.def.hitscan) enemyShoot(e, T); else if (e.def.flamme) flamme(e, T); else spawnFireball(e, T); } }
          else if (d < 1.4 && alive) { if (contreMonstre) damageEnemy(T, e.def.melee, e); else hurtPlayer(e.def.melee, e); }
          if (e.ranged && --e.rafale > 0) e.hitAt -= 0.12;   // salves enchaînées (commando, arachnotron, cyberdémon…)
          else e.hitDone = true;
        }
        if (e.t <= 0) e.state = 'chase';
        break;
      case 'chase': {
        e.cool -= dt * (G.difficulte === 4 ? 1.6 : 1);
        if (!alive) break;
        if (e.def.melee > 0 && see && d < 1.2 && e.cool <= 0) {
          e.state = 'attack'; e.ranged = false; e.t = 0.45; e.hitAt = 0.2; e.hitDone = false;
          e.cool = e.type === 'imp' ? 1.2 : 1.0;
          if (e.type === 'imp') sfx.claw(distVol(d)); else sfx.bite(distVol(d));
          break;
        }
        if (startRangedAttack(e, d, see, dt)) break;   // boule de feu ou tir instantané, selon la fiche
        let gx = e.tx - e.x, gy = e.ty - e.y;
        const gd = Math.hypot(gx, gy);
        const garde = e.suitChemin ? 0.03 : !see ? 0.2 : e.def.melee > 0 ? 0.9   // sans corps à corps : rester à portée de tir
          : Math.max(0.9, ((e.def.ranged || e.def.hitscan || e.def.charge || e.def.flamme || {}).min || 0) + 1);
        if (gd > garde) {
          gx /= gd; gy /= gd;
          if (e.sideT > 0) {   // contourne un obstacle
            e.sideT -= dt;
            const sx = -gy * e.sideDir, sy = gx * e.sideDir;
            gx = gx * 0.3 + sx; gy = gy * 0.3 + sy;
          }
          const sp = e.def.speed * dt * (G.difficulte === 4 ? 1.5 : 1), ox = e.x, oy = e.y;   // Cauchemar : monstres rapides
          tryMove(e, gx * sp, gy * sp, e.def.r);
          e.moving = true;
          if (Math.hypot(e.x - ox, e.y - oy) < sp * 0.3) { e.sideT = rand(0.4, 0.9); e.sideDir = Math.random() < 0.5 ? -1 : 1; }
        }
        break;
      }
    }
  }
  // les ennemis ne se superposent pas. Celui qui est le plus loin du joueur cède le passage : c'est lui
  // qu'on repousse. Avant, chacun reculait de moitié : deux monstres côte à côte devant une porte ou un
  // passage trop étroit pour deux se repoussaient à égalité, à l'infini, et aucun ne passait.
  const live = G.enemies.filter(e => e.state !== 'dead');
  const L = G.L, flowOk = G.flow && G.flow.length === L.w * L.h;
  const rang = e => {
    const v = flowOk ? G.flow[Math.floor(e.y) * L.w + Math.floor(e.x)] : -1;
    return (v >= 0 ? v : 1e4) + Math.hypot(e.x - P.x, e.y - P.y) * 1e-3;
  };
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i], b = live[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = a.def.r + b.def.r;
    if (d > 0.001 && d < min) {
      const ux = dx / d, uy = dy / d, s = rang(b) >= rang(a) ? 1 : -1;   // s = 1 : b cède ; à égalité, b
      const cede = s > 0 ? b : a, passe = s > 0 ? a : b, ox = cede.x, oy = cede.y;
      tryMove(cede, s * ux * (min - d), s * uy * (min - d), cede.def.r);
      const reste = (min - d) - ((cede.x - ox) * ux + (cede.y - oy) * uy) * s;   // coincé contre un mur : l'autre recule le reste
      if (reste > 0.001) tryMove(passe, -s * ux * reste, -s * uy * reste, passe.def.r);
    }
  }
}

function damageEnemy(e, dmg, src) {
  if (e.state === 'dead') return;   // déjà mort : rien à faire
  e.hp -= dmg;
  const v = distVol(Math.hypot(e.x - G.P.x, e.y - G.P.y));
  if (e.hp <= 0) {
    e.state = 'dead'; e.t = 0; G.kills++; sfx.edeath(e.type, v);
    if (e.def.drop && ITEM_TEX[e.def.drop]) G.items.push({ type: e.def.drop, x: e.x, y: e.y, taken: false });
    if (e.def.ranged && e.def.ranged.ames) for (const a of [0, 2.1, 4.2]) cracherAme(e, a);   // l'élémentaire libère 3 âmes
    return;
  }
  // blessé par un monstre d'une autre espèce : il se retourne contre lui (combats entre monstres)
  if (src && src.def && src !== e && src.type !== e.type) { e.cible = src; if (e.state === 'idle') e.state = 'chase'; }
  else wake(e);
  if (Math.random() < (e.def.boss ? 0.1 : 0.5)) { e.state = 'pain'; e.t = 0.25; sfx.epain(v, e.type); }
}

/* élémentaire de douleur : une âme perdue jaillit devant lui (20 au plus dans le niveau) */
function cracherAme(e, decalage) {
  if (G.enemies.filter(m => m.type === 'lostsoul' && m.state !== 'dead').length >= 20) return;
  const T = cibleDe(e), a = Math.atan2(T.y - e.y, T.x - e.x) + (decalage || 0);
  const x = e.x + Math.cos(a) * 0.8, y = e.y + Math.sin(a) * 0.8;
  if (solidAt(x, y)) return;
  const m = mkEnemy('lostsoul', x, y); m.state = 'chase'; m.cool = 0.3; if (T !== G.P) m.cible = T;
  G.enemies.push(m); G.total++;
}

/* ---------- tir du joueur (hitscan) ---------- */
function fire() {
  const P = G.P;
  let w = WEAPONS[P.weapon];
  const cout = w.cout || 1;
  if (w.ammo !== null && (P[w.ammo] || 0) < cout) {
    P.weapon = 0;
    sfx.click();
    w = WEAPONS[0];
  } else if (w.ammo !== null) {
    P[w.ammo] -= cout;
  }
  if (w.plasma || w.bfg || w.scie) return tirSpecial(w);

  const sg = P.weapon === 1;
  const fist = P.weapon === 2;
  P.cool = w.cool;
  P.flash = 0.08;
  P.kick = 1;

  if (sg) sfx.shotgun();
  else if (fist) sfx.hit();
  else sfx.pistol();

  const dmgMul = fist && P.berserk ? 10 : 1;

  if (w.rocket) {
    spawnRocket();
  } else {
    for (let i = 0; i < w.pellets; i++) {
      const ang = P.a + rand(-w.spread, w.spread);
      const e = hitscan(ang, w.range);
      if (e) damageEnemy(e, Math.round(randInt(w.dmgMin, w.dmgMax)) * dmgMul);
    }
  }

  wakeNear(P.x, P.y, 8);
}

/* tronçonneuse (corps à corps rapide), fusil à plasma (projectiles), BFG (boule lâchée après une charge) */
function tirSpecial(w) {
  const P = G.P;
  P.cool = w.cool; P.kick = w.bfg ? 0 : 0.5; P.flash = w.scie ? 0 : 0.08;
  if (w.scie) {
    P.scieT = 0.15;
    const e = hitscan(P.a, w.range);
    if (e) { damageEnemy(e, randInt(w.dmgMin, w.dmgMax)); P.a = angNorm(P.a + clamp(angNorm(Math.atan2(e.y - P.y, e.x - P.x) - P.a), -0.05, 0.05)); }
    sonFD(e ? 'DSSAWHIT' : 'DSSAWFUL', 0.7, () => sfx.hit());
  } else if (w.plasma) {
    tirJoueur('plasma', 14, randInt(w.dmgMin, w.dmgMax));
    sonFD('DSPLASMA', 0.8, () => sfx.pistol());
  } else {
    P.bfgT = 0.6; P.flash = 0;   // la boule part après la charge (gameUpdate → updatePlay)
    sonFD('DSBFG', 1, () => sfx.fireball(1));
  }
  wakeNear(P.x, P.y, 8);
}
function tirJoueur(couleur, vitesse, dmg) {
  const P = G.P, a = P.a;
  G.shots.push({ x: P.x + Math.cos(a) * 0.4, y: P.y + Math.sin(a) * 0.4, vx: Math.cos(a) * vitesse, vy: Math.sin(a) * vitesse,
                 life: 3, dmg, color: couleur, joueur: true, plasma: couleur === 'plasma', bfg: couleur === 'bfg' });
}
/* BFG : à l'impact, 40 rayons partent du joueur sur 90° ; chacun frappe le premier monstre visible (15 × 1d8) */
function rayonsBfg() {
  const P = G.P;
  for (let k = 0; k < 40; k++) {
    const e = hitscan(P.a - Math.PI / 4 + k * Math.PI / 2 / 39, 32);
    if (!e) continue;
    let dmg = 0; for (let j = 0; j < 15; j++) dmg += randInt(1, 8);
    damageEnemy(e, dmg);
    G.fx.push({ x: e.x, y: e.y, t: 0, tex: 'shotBfg' });
  }
}

function hitscan(ang, range) {
  const P = G.P;
  let best = null, bd = range;
  for (const e of G.enemies) {
    if (e.state === 'dead') continue;
    const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy);
    if (d > bd) continue;
    const diff = Math.abs(angNorm(Math.atan2(dy, dx) - ang));
    if (diff < Math.atan2(e.def.r, d) && losClear(P.x, P.y, e.x, e.y)) { best = e; bd = d; }
  }
  return best;
}

/* ---------- boules de feu ---------- */
function spawnFireball(e, T) {
  const P = G.P;
  T = T || P;
  let a = Math.atan2(T.y - e.y, T.x - e.x);
  if (T === P && P.invisT > 0) {
    a += (Math.random() * 2 - 1) * 0.35;
  }
  const r = e.def.ranged || { speed: 5, dmg: 12, color: 'fire' };
  if (r.ames) { cracherAme(e, 0); sonFD('DSSKLATK', distVol(Math.hypot(P.x - e.x, P.y - e.y))); return; }
  for (const ec of r.eventail || [0]) {
    const b = a + ec;
    G.shots.push({ x: e.x + Math.cos(b) * 0.4, y: e.y + Math.sin(b) * 0.4, vx: Math.cos(b) * r.speed, vy: Math.sin(b) * r.speed,
                   life: 4, dmg: r.dmg, color: r.color, src: e, rocket: !!r.roquette, guide: r.guide, cible: r.guide ? T : null });
  }
  const v = distVol(Math.hypot(P.x - e.x, P.y - e.y));
  if (r.roquette) sonFD('DSRLAUNC', v, () => sfx.fireball(v));
  else if (r.color === 'apls') sonFD('DSPLASMA', v, () => sfx.fireball(v));
  else if (r.guide) sonFD('DSSKEATK', v, () => sfx.fireball(v));
  else if (r.eventail) sonFD('DSMANATK', v, () => sfx.fireball(v));
  else sfx.fireball(v);
}

function spawnRocket() {
  const P = G.P;
  const a = P.a;
  const speed = 10;
  G.shots.push({ x: P.x + Math.cos(a) * 0.5, y: P.y + Math.sin(a) * 0.5, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 3, rocket: true });
  sfx.fireball(1);
}

function enemyShoot(e, T) {
  const P = G.P, h = e.def.hitscan;
  T = T || P;
  const d = Math.hypot(T.x - e.x, T.y - e.y);
  if (h.plombs) sonFD('DSSHOTGN', distVol(Math.hypot(P.x - e.x, P.y - e.y)), () => sfx.pistol()); else sfx.pistol();
  if (!losClear(e.x, e.y, T.x, T.y)) return;
  for (let k = 0; k < (h.plombs || 1); k++) {
    let missChance = Math.min(0.6, d / 25);   // rate plus souvent de loin
    if (T === P && P.invisT > 0) {
      missChance += 0.4;
    }
    if (Math.random() < Math.min(0.9, missChance)) continue;
    if (T === P) hurtPlayer(randInt(h.dmg[0], h.dmg[1]), e); else damageEnemy(T, randInt(h.dmg[0], h.dmg[1]), e);
  }
}

function updateShots(dt) {
  const P = G.P;
  for (const s of G.shots) {
    if (s.guide && s.cible && s.cible.state !== 'dead') {   // missile du revenant : tourne vers sa cible
      const v = Math.hypot(s.vx, s.vy), a = Math.atan2(s.vy, s.vx);
      const da = clamp(angNorm(Math.atan2(s.cible.y - s.y, s.cible.x - s.x) - a), -s.guide * dt, s.guide * dt);
      s.vx = Math.cos(a + da) * v; s.vy = Math.sin(a + da) * v;
    }
    if (s.rocket) {
      let exploded = false;
      for (let k = 0; k < 2 && !exploded && s.life > 0; k++) {
        s.x += s.vx * dt / 2; s.y += s.vy * dt / 2;
        if (solidAt(s.x, s.y)) exploded = true;
        else if (s.src && G.state === 'play' && Math.hypot(s.x - P.x, s.y - P.y) < 0.4) exploded = true;   // roquette du cyberdémon
        else for (const e of G.enemies) {
          if (e.state !== 'dead' && e !== s.src && Math.hypot(e.x - s.x, e.y - s.y) < 0.4) { exploded = true; break; }
        }
      }
      if (!exploded) s.life -= dt; else s.life = 0;
    } else {
      for (let k = 0; k < 2 && s.life > 0; k++) {   // 2 sous-pas : pas de traversée de mur
        s.x += s.vx * dt / 2; s.y += s.vy * dt / 2;
        if (solidAt(s.x, s.y)) { s.life = 0; break; }
        if (!s.joueur && G.state === 'play' && Math.hypot(s.x - P.x, s.y - P.y) < 0.35) { s.life = 0; hurtPlayer(s.dmg || 12, s.src || s); break; }
        // le projectile touche un monstre : tir du joueur, ou tir d'un monstre d'une autre espèce (combats entre monstres)
        const e = G.enemies.find(m => m.state !== 'dead' && m !== s.src && (s.joueur || (s.src && m.type !== s.src.type))
          && Math.hypot(m.x - s.x, m.y - s.y) < m.def.r + 0.1);
        if (e) { s.life = 0; s.touche = e; damageEnemy(e, s.dmg || 12, s.joueur ? null : s.src); }
      }
    }
    if (s.life <= 0) {
      G.fx.push({ x: s.x - s.vx * 0.02, y: s.y - s.vy * 0.02, t: 0, tex: s.bfg ? 'shotBfg' : s.plasma ? 'shotPlasma' : null, grand: s.bfg });
      const vol = distVol(Math.hypot(s.x - P.x, s.y - P.y));
      if (s.rocket) {
        for (const e of G.enemies) {
          if (e.state === 'dead' || (e.def.boss && s.src)) continue;   // les boss ne craignent pas les roquettes des leurs
          const d = Math.hypot(e.x - s.x, e.y - s.y);
          if (d < 2.5) damageEnemy(e, Math.round(60 * (1 - d / 2.5)), s.src);
        }
        const dp = Math.hypot(P.x - s.x, P.y - s.y);
        if (dp < 2.5 && G.state === 'play') hurtPlayer(Math.round((s.src ? 100 : 60) * (1 - dp / 2.5)), s.src || s);
      }
      if (s.bfg) rayonsBfg();
      if (s.plasma) sonFD('DSFIRXPL', vol * 0.5); else if (s.bfg) sonFD('DSRXPLOD', vol, () => sfx.boom(vol)); else sfx.boom(vol);
    }
  }
  G.shots = G.shots.filter(s => s.life > 0);
}

/* ---------- objets ---------- */
const munitionsDoublees = () => G.difficulte === 0 || G.difficulte === 4;   // difficultés extrêmes de Doom (07c)
const xM = n => munitionsDoublees() ? n * 2 : n;

function updatePickups() {
  const P = G.P;
  for (const it of G.items) {
    if (it.taken || Math.hypot(it.x - P.x, it.y - P.y) > 0.55) continue;
    if (it.type === 'medkit') {
      if (P.hp >= 100) continue;
      P.hp = Math.min(100, P.hp + 25); say('Trousse de soins (+25)');
    } else if (it.type === 'ammo') {
      const cap = P.backpack ? 100 : 50;
      if (P.shells >= cap) continue;
      P.shells = Math.min(cap, P.shells + xM(8)); say(`Cartouches (+${xM(8)})`);
    } else if (it.type === 'shotgun') {
      const cap = P.backpack ? 100 : 50;
      if (!P.hasShotgun) { P.hasShotgun = true; P.weapon = 1; say('Fusil à pompe !'); sfx.weapon(); G.sourireJusqua = performance.now() + 1500; }
      else say(`Cartouches (+${xM(12)})`);
      P.shells = Math.min(cap, P.shells + xM(12));
    } else if (it.type === 'keyRed' || it.type === 'keyBlue' || it.type === 'keyYellow') {
      const k = { keyRed: 'red', keyBlue: 'blue', keyYellow: 'yellow' }[it.type];
      P.keys = P.keys || {}; P.keys[k] = true; say('Clé ' + { red: 'rouge', blue: 'bleue', yellow: 'jaune' }[k] + ' !');
    } else if (it.type === 'armor') {
      if (P.armor >= 100) continue;
      P.armor = Math.min(100, P.armor + 50); say('Armure (+50)');
    } else if (it.type === 'chaingun') {
      const capBul = P.backpack ? 400 : 200;
      P.owned[3] = true; P.weapon = 3; P.bullets = Math.min(capBul, P.bullets + xM(20));
      say(`Mitrailleuse ! (+${xM(20)} balles)`); sfx.weapon(); G.sourireJusqua = performance.now() + 1500;
    } else if (it.type === 'launcher') {
      const capRoc = P.backpack ? 100 : 50;
      P.owned[4] = true; P.weapon = 4; P.rockets = Math.min(capRoc, P.rockets + xM(2));
      say(`Lance-roquettes ! (+${xM(2)} roquettes)`); sfx.weapon(); G.sourireJusqua = performance.now() + 1500;
    } else if (it.type === 'bullets') {
      const capBul = P.backpack ? 400 : 200;
      if (P.bullets >= capBul) continue;
      P.bullets = Math.min(capBul, P.bullets + xM(20)); say(`Balles (+${xM(20)})`);
    } else if (it.type === 'rockets') {
      const capRoc = P.backpack ? 100 : 50;
      if (P.rockets >= capRoc) continue;
      P.rockets = Math.min(capRoc, P.rockets + xM(1)); say(`Roquettes (+${xM(1)})`);
    } else if (it.type === 'berserk') {
      P.berserk = true; P.hp = Math.max(P.hp, 100); say('Berserk !');
    } else if (it.type === 'invis') {
      P.invisT = 30; say('Invisibilité !');
    } else if (it.type === 'mega') {
      P.hp = 200; P.armor = 200; say('Mégasphère !');
    } else if (!ramasserNouveau(it, P)) {
      continue;
    } else if (it.type === 'backpack') {
      P.backpack = true;
      const capShells = 100, capBullets = 400, capRockets = 100;
      P.shells = Math.min(capShells, P.shells + 4);
      P.bullets = Math.min(capBullets, P.bullets + 20);
      P.rockets = Math.min(capRockets, P.rockets + 1);
      say('Sac à dos !');
    }
    it.taken = true; G.pickFlash = 0.15; sfx.pickup();
  }
}

/* objets de Doom ajoutés (lots 4 à 6) ; faux si le joueur n'en a pas besoin (l'objet reste au sol) ; vrai sinon,
   y compris pour les objets d'avant (backpack…), traités ensuite par updatePickups */
const OBJETS_NOUVEAUX = new Set(['stim', 'bonusSante', 'bonusArmure', 'armorBlue', 'soul', 'invul', 'suit', 'computerMap', 'goggles',
  'clipBox', 'shellBox', 'rocketBox', 'cells', 'cellPack', 'chainsaw', 'plasma', 'bfg']);
function ramasserNouveau(it, P) {
  if (!OBJETS_NOUVEAUX.has(it.type)) return true;
  const sac = P.backpack ? 2 : 1, max = { bullets: 200 * sac, shells: 50 * sac, rockets: 50 * sac, cells: 300 * sac };
  const munir = (k, n) => { if ((P[k] || 0) >= max[k]) return false; P[k] = Math.min(max[k], (P[k] || 0) + xM(n)); return true; };
  const arme = (k, nom) => { const neuve = !P.owned[k]; P.owned[k] = true; if (neuve) { P.weapon = k; sfx.weapon(); G.sourireJusqua = performance.now() + 1500; } return nom; };
  let m = null;
  switch (it.type) {
    case 'stim': if (P.hp >= 100) return false; P.hp = Math.min(100, P.hp + 10); m = 'Stimulant (+10)'; break;
    case 'bonusSante': P.hp = Math.min(200, P.hp + 1); m = 'Bonus de santé'; break;
    case 'bonusArmure': P.armor = Math.min(200, (P.armor || 0) + 1); m = 'Bonus d\'armure'; break;
    case 'armorBlue': if (P.armor >= 200) return false; P.armor = 200; m = 'Méga-armure !'; break;
    case 'soul': P.hp = Math.min(200, P.hp + 100); m = 'Sphère d\'âme !'; break;
    case 'invul': P.invulT = 30; m = 'Invulnérabilité !'; break;
    case 'suit': P.combiT = 60; m = 'Combinaison anti-radiations'; break;
    case 'computerMap': G.L.carteComplete = true; m = 'Carte informatique'; break;
    case 'goggles': P.lunettesT = 120; m = 'Lunettes de vision nocturne'; break;
    case 'clipBox': if (!munir('bullets', 50)) return false; m = `Boîte de balles (+${xM(50)})`; break;
    case 'shellBox': if (!munir('shells', 20)) return false; m = `Boîte de cartouches (+${xM(20)})`; break;
    case 'rocketBox': if (!munir('rockets', 5)) return false; m = `Caisse de roquettes (+${xM(5)})`; break;
    case 'cells': if (!munir('cells', 20)) return false; m = `Cellules d'énergie (+${xM(20)})`; break;
    case 'cellPack': if (!munir('cells', 100)) return false; m = `Pack de cellules (+${xM(100)})`; break;
    case 'chainsaw': m = arme(5, 'Une tronçonneuse ! Trouvez de la viande !'); break;
    case 'plasma': munir('cells', 40); m = arme(6, 'Fusil à plasma !'); break;
    case 'bfg': munir('cells', 40); m = arme(7, 'BFG 9000 ! Oh, oui.'); break;
  }
  if (['soul', 'invul', 'suit', 'computerMap', 'goggles'].includes(it.type)) sonFD('DSGETPOW', 1);
  say(m);
  it.taken = true; G.pickFlash = 0.15; sfx.pickup();
  return false;   // déjà ramassé : updatePickups passe à l'objet suivant
}

/* ---------- touche Utiliser : interrupteur de sortie ---------- */
function useAction() {
  const P = G.P, L = G.L;
  for (let t = 0.2; t <= 1.6; t += 0.1) {
    const cx = Math.floor(P.x + Math.cos(P.a) * t), cy = Math.floor(P.y + Math.sin(P.a) * t);
    if (!solidCell(cx, cy)) continue;
    let secretFound = false;
    for (let s = 0; s < L.secrets.length; s++) {
      const sec = L.secrets[s];
      if (!sec.found && sec.x === cx && sec.y === cy) {
        L.grid[cy * L.w + cx] = CELL_EMPTY;
        sec.found = true;
        secretFound = true;
        break;
      }
    }
    if (secretFound) {
      sfx.door(1);
      say('Passage secret !');
      return;
    }
    if (L.grid[cy * L.w + cx] === CELL_SWITCH) {   // interrupteur : il s'allume et toutes les barrières du niveau s'ouvrent
      L.grid[cy * L.w + cx] = CELL_SWITCH_ON;
      let n = 0;
      for (let k = 0; k < L.grid.length; k++) if (L.grid[k] === CELL_BARRIER) { L.grid[k] = CELL_EMPTY; n++; }
      sfx.switch(); if (n) sfx.door(1);
      say(n ? 'Un passage s\'est ouvert' : 'Rien ne se passe');
      return;
    }
    if (L.grid[cy * L.w + cx] === CELL_EXIT) {
      sfx.switch();
      G.totals.kills += G.kills; G.totals.total += G.total; G.totals.time += G.time;

      const p = lireProgression();
      p.reached = Math.max(p.reached, G.level + 1);
      p.inv[G.level + 1] = inventaire(G.P);   // « continuer » reprendra le niveau suivant avec cet inventaire
      if (typeof p.best[G.level] !== 'number' || G.time < p.best[G.level]) {
        p.best[G.level] = G.time;
      }
      sauverProgression(p);

      G.statsLigne = G.statsTic = undefined;   // écran de stats (07b) : décompte depuis le début
      G.state = 'clear'; G.stateT = 0;   // souris gardée : le niveau suivant se joue sans recliquer
    } else sfx.oof();
    return;
  }
  sfx.oof();
}

/* ---------- sprites à dessiner ---------- */
const ITEM_TEX = { stim: () => TX.stim, bonusSante: () => TX.bonusSante, bonusArmure: () => TX.bonusArmure, armorBlue: () => TX.armorBlue,
  soul: () => TX.soul, invul: () => TX.invul, suit: () => TX.suit, computerMap: () => TX.computerMap, goggles: () => TX.goggles,
  clipBox: () => TX.clipBox, shellBox: () => TX.shellBox, rocketBox: () => TX.rocketBox, cells: () => TX.cells, cellPack: () => TX.cellPack,
  chainsaw: () => TX.chainsaw, plasma: () => TX.plasma, bfg: () => TX.bfg,
  medkit: () => TX.medkit, ammo: () => TX.ammo, shotgun: () => TX.shotgun, armor: () => TX.armor, chaingun: () => TX.chaingun, launcher: () => TX.launcher, bullets: () => TX.bullets, rockets: () => TX.rockets, berserk: () => TX.berserk, invis: () => TX.invis, mega: () => TX.mega, backpack: () => TX.backpack, keyRed: () => TX.keyRed, keyBlue: () => TX.keyBlue, keyYellow: () => TX.keyYellow };
const ITEM_SCALE = { stim: 0.25, bonusSante: 0.25, bonusArmure: 0.25, armorBlue: 0.3, soul: 0.35, invul: 0.35, suit: 0.45,
  computerMap: 0.3, goggles: 0.25, clipBox: 0.3, shellBox: 0.3, rocketBox: 0.3, cells: 0.25, cellPack: 0.3, chainsaw: 0.2, plasma: 0.2, bfg: 0.3,
  medkit: 0.32, ammo: 0.3, shotgun: 0.2, armor: 0.3, chaingun: 0.2, launcher: 0.22, bullets: 0.3, rockets: 0.3, berserk: 0.3, invis: 0.35, mega: 0.35, backpack: 0.3, keyRed: 0.25, keyBlue: 0.25, keyYellow: 0.25 };

function enemyTex(e) {
  const k = e.type;
  if (e.state === 'dead') return e.t < 0.2 ? TX[k + 'Pain'] : TX[k + 'Corpse'];
  if (e.state === 'pain') return TX[k + 'Pain'];
  if (e.state === 'attack' || e.state === 'charge') return TX[k + 'Atk'];
  if (e.moving && ((e.anim * 6) | 0) % 2) return TX[k + 'B'];
  return TX[k + 'A'];
}

function collectSprites() {
  const out = [];
  for (const it of G.items) if (!it.taken) out.push({ x: it.x, y: it.y, tex: ITEM_TEX[it.type](), scale: ITEM_SCALE[it.type] });
  for (const e of G.enemies) {
    // ennemis volants : à leur hauteur au loin, ils descendent à hauteur des yeux en approchant (sinon, de près, le
    // viseur tombe sous eux alors que le tir les touche)
    const pres = clamp((Math.hypot(e.x - G.P.x, e.y - G.P.y) - 0.6) / 2.4, 0, 1);
    out.push({ x: e.x, y: e.y, tex: enemyTex(e), scale: e.def.scale, flat: e.state === 'dead', fuzz: !!e.def.fuzz,
      z: e.def.fly && e.state !== 'dead' ? (e.def.fly + 0.04 * Math.sin(e.anim * 3)) * pres : 0 });
  }
  const TIRS = { blue: 'fireballBlue', green: 'fireballGreen', plasma: 'shotPlasma', bfg: 'shotBfg', tracer: 'shotTracer', manc: 'shotManc', apls: 'shotApls', rocket: 'missile' };
  for (const s of G.shots) out.push({ x: s.x, y: s.y, tex: TX[TIRS[s.color] || (s.rocket ? 'missile' : 'fireball')] || TX.fireball, scale: s.bfg ? 0.6 : 0.32, z: 0.3, bright: true });
  for (const f of G.fx) out.push({ x: f.x, y: f.y, tex: (f.tex && TX[f.tex]) || TX.puff, scale: (f.grand ? 0.8 : 0.35) + f.t * 1.5, z: 0.25, bright: true, flat: true });
  return out;
}
