"use strict";
/* DOOMED — 06_game.js : états du jeu, joueur, portes, ennemis, projectiles, objets, tir
 *
 * CONTRAT (vérifié par test.html — ne rien retirer de cette liste) :
 *   FOURNIT : G ENEMY_DEF WEAPONS · wantsPointerLock onPointerUnlock say lireProgression sauverProgression inventaire · newPlayer startGame optionsTest preparerNiveaux startLevel restartLevel
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
};

const WEAPONS = [
  { name: 'Pistolet', ammo: null, cool: 0.35, pellets: 1, spread: 0.01, dmgMin: 10, dmgMax: 15, range: 20 },
  { name: 'Fusil à pompe', ammo: 'shells', cool: 0.9, pellets: 7, spread: 0.08, dmgMin: 6, dmgMax: 10, range: 12 },
  { name: 'Poing', ammo: null, cool: 0.5, pellets: 1, spread: 0, dmgMin: 8, dmgMax: 16, range: 1.2 },
  { name: 'Mitrailleuse', ammo: 'bullets', cool: 0.11, pellets: 1, spread: 0.03, dmgMin: 8, dmgMax: 12, range: 20 },
  { name: 'Lance-roquettes', ammo: 'rockets', cool: 0.9, pellets: 1, spread: 0, dmgMin: 0, dmgMax: 0, range: 0, rocket: true }
];

function wantsPointerLock() { return ['play', 'pause', 'title', 'clear', 'dead', 'victory'].includes(G.state); }   // libérée seulement en pause (Échap, P)
function onPointerUnlock() { if (G.state === 'play') G.state = 'pause'; }
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
           rockets: P.rockets, armor: P.armor, backpack: !!P.backpack };
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
    owned: [true, false, true, false, false], bullets: 50, rockets: 0, keys: {} };
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
  const mult = [0.7, 1, 1.4][skill];
  for (const e of list) e.hp = Math.round(e.def.hp * mult);

  G.enemies = list;
  G.items = L.items.map(it => Object.assign({}, it));
  G.shots = []; G.fx = [];
  G.kills = 0; G.total = G.enemies.length; G.time = 0; G.flowT = 0;
  G.state = 'play';
  say(L.name);
  musicStart();
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
  if (pressed('Tab')) G.minimap = !G.minimap;
  if (G.msgT > 0) G.msgT -= dt;
  G.pickFlash = Math.max(0, G.pickFlash - dt);
  G.stateT += dt;

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

  if (G.state === 'title' && pressed('KeyC')) {
    const prog = lireProgression();
    if (prog.reached > 0) {
      startGame();
      const n = Math.min(prog.reached, MAPS.length - 1);
      if (prog.inv[n]) Object.assign(G.P, prog.inv[n], { owned: prog.inv[n].owned.slice() });   // armes et munitions gagnées
      startLevel(n);
      return;
    }
  }
}

function updatePlay(dt) {
  const P = G.P;
  G.time += dt;
  if (pressed('KeyP') || pressed('Escape')) {
    G.state = 'pause';
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
  for (let n = 1; n <= 5; n++) {
    const codeD = 'Digit' + n, codeN = 'Numpad' + n;
    if ((pressed(codeD) || pressed(codeN)) && P.owned[n - 1]) P.weapon = n - 1;
  }
  P.cool -= dt; P.flash -= dt;
  P.kick = Math.max(0, P.kick - dt * 4);
  P.hurt = Math.max(0, P.hurt - dt);
  P.invisT = Math.max(0, (P.invisT || 0) - dt);
  if ((MOUSE.down || KEYS.Space) && P.cool <= 0) fire();
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
      onLava = G.L.floorType[cy * G.L.w + cx] === 1;
    }
  }
  // lave : 5 dégâts dès le contact, puis toutes les 0,5 s ; le délai continue de courir hors de la lave
  // (une traversée rapide brûle quand même, et sautiller dessus ne brûle pas plus vite)
  P.lavaT = Math.max(0, P.lavaT - dt);
  if (onLava && P.lavaT <= 0) {
    P.lavaT = 0.5;
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
  updateDoors(dt);
  updateEnemies(dt);
  updateShots(dt);
  for (const f of G.fx) f.t += dt;          // explosions des boules de feu (sinon G.fx grossit sans fin)
  G.flowT -= dt;
  if (G.flowT <= 0) { computeFlow(); G.flowT = 0.25; }
  G.fx = G.fx.filter(f => f.t < 0.35);
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
          else if ((D.t -= dt) <= 0) { D.state = 'closing'; const v2 = distVol(Math.hypot(P.x - cx, P.y - cy)); sfx.door(v2); }
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
          else if ((D.t -= dt) <= 0) { D.state = 'closing'; sfx.door(v); }
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
  const r = e.def.ranged || e.def.hitscan;
  if (!r || !see || d <= r.min || d >= r.max || e.cool > 0 || Math.random() >= dt * 1.2) return false;
  e.state = 'attack'; e.ranged = true; e.t = 0.6; e.hitAt = 0.3; e.hitDone = false;
  e.cool = rand(r.cool[0], r.cool[1]);
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

function hurtPlayer(dmg, src) {
  const P = G.P;
  if (G.state !== 'play') return;
  if (G.triche && G.triche.invincible) return;   // test d'un niveau en mode invincible
  let mult = [0.6, 1, 1.5][G.skill] || 1;
  dmg = Math.round(dmg * mult);
  let absorbed = 0;
  if (P.armor > 0) {
    absorbed = Math.min(Math.round(dmg / 3), P.armor);
    P.armor -= absorbed;
  }
  const rest = dmg - absorbed;
  P.hp -= rest;
  P.hurt = 0.5; sfx.hurt();
  P.faceDir = Math.sign(angNorm(Math.atan2(src.y - P.y, src.x - P.x) - P.a));
}

function updateEnemies(dt) {
  const P = G.P, alive = G.state === 'play';
  for (const e of G.enemies) {
    e.anim += dt;
    if (e.state === 'dead') { e.t += dt; continue; }
    const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy);
    const see = alive && d < 16 && losClear(e.x, e.y, P.x, P.y);
    // droit sur le joueur seulement si le corps passe ; sinon (angle de mur entre les deux) on suit le chemin
    const ft = see && passageLibre(e.x, e.y, P.x, P.y, e.def.r + 0.02) ? null : (cibleChemin(e) || (see ? null : flowTarget(e)));
    e.suitChemin = ft !== null;
    if (ft !== null) { e.tx = ft.x; e.ty = ft.y; }
    else if (see) { e.tx = P.x; e.ty = P.y; }
    e.moving = false;
    if (e.def.charge && updateCharge(e, d, see, dt)) continue;   // âme perdue en charge
    switch (e.state) {
      case 'idle': if (see && d < 12) wake(e); break;
      case 'pain': if ((e.t -= dt) <= 0) e.state = 'chase'; break;
      case 'attack':
        e.t -= dt;
        if (!e.hitDone && e.t <= e.hitAt) {
          e.hitDone = true;
          if (e.ranged) { if (see) { if (e.def.hitscan) enemyShoot(e); else spawnFireball(e); } }
          else if (d < 1.4 && alive) { hurtPlayer(e.def.melee, e); }
        }
        if (e.t <= 0) e.state = 'chase';
        break;
      case 'chase': {
        e.cool -= dt;
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
          : Math.max(0.9, ((e.def.ranged || e.def.hitscan || e.def.charge || {}).min || 0) + 1);
        if (gd > garde) {
          gx /= gd; gy /= gd;
          if (e.sideT > 0) {   // contourne un obstacle
            e.sideT -= dt;
            const sx = -gy * e.sideDir, sy = gx * e.sideDir;
            gx = gx * 0.3 + sx; gy = gy * 0.3 + sy;
          }
          const sp = e.def.speed * dt, ox = e.x, oy = e.y;
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

function damageEnemy(e, dmg) {
  if (e.state === 'dead') return;   // déjà mort : rien à faire
  e.hp -= dmg;
  const v = distVol(Math.hypot(e.x - G.P.x, e.y - G.P.y));
  if (e.hp <= 0) {
    e.state = 'dead'; e.t = 0; G.kills++; sfx.edeath(e.type, v);
    if (e.def.drop && ITEM_TEX[e.def.drop]) G.items.push({ type: e.def.drop, x: e.x, y: e.y, taken: false });
    return;
  }
  wake(e);
  if (Math.random() < 0.5) { e.state = 'pain'; e.t = 0.25; sfx.epain(v, e.type); }
}

/* ---------- tir du joueur (hitscan) ---------- */
function fire() {
  const P = G.P;
  let w = WEAPONS[P.weapon];
  if (w.ammo !== null && P[w.ammo] <= 0) {
    P.weapon = 0;
    sfx.click();
    w = WEAPONS[0];
  } else if (w.ammo !== null) {
    P[w.ammo]--;
  }

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
function spawnFireball(e) {
  const P = G.P;
  let a = Math.atan2(P.y - e.y, P.x - e.x);
  if (P.invisT > 0) {
    a += (Math.random() * 2 - 1) * 0.35;
  }
  const r = e.def.ranged || { speed: 5, dmg: 12, color: 'fire' };
  G.shots.push({ x: e.x + Math.cos(a) * 0.4, y: e.y + Math.sin(a) * 0.4, vx: Math.cos(a) * r.speed, vy: Math.sin(a) * r.speed,
                 life: 4, dmg: r.dmg, color: r.color });
  sfx.fireball(distVol(Math.hypot(P.x - e.x, P.y - e.y)));
}

function spawnRocket() {
  const P = G.P;
  const a = P.a;
  const speed = 10;
  G.shots.push({ x: P.x + Math.cos(a) * 0.5, y: P.y + Math.sin(a) * 0.5, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 3, rocket: true });
  sfx.fireball(1);
}

function enemyShoot(e) {
  const P = G.P, h = e.def.hitscan, d = Math.hypot(P.x - e.x, P.y - e.y);
  sfx.pistol();
  if (!losClear(e.x, e.y, P.x, P.y)) return;
  let missChance = Math.min(0.6, d / 25);   // rate plus souvent de loin
  if (P.invisT > 0) {
    missChance += 0.4;
  }
  if (Math.random() < Math.min(0.9, missChance)) return;
  hurtPlayer(randInt(h.dmg[0], h.dmg[1]), e);
}

function updateShots(dt) {
  const P = G.P;
  for (const s of G.shots) {
    if (s.rocket) {
      let exploded = false;
      for (let k = 0; k < 2 && !exploded && s.life > 0; k++) {
        s.x += s.vx * dt / 2; s.y += s.vy * dt / 2;
        if (solidAt(s.x, s.y)) exploded = true;
        else for (const e of G.enemies) {
          if (e.state !== 'dead' && Math.hypot(e.x - s.x, e.y - s.y) < 0.4) { exploded = true; break; }
        }
      }
      if (!exploded) s.life -= dt; else s.life = 0;
    } else {
      for (let k = 0; k < 2 && s.life > 0; k++) {   // 2 sous-pas : pas de traversée de mur
        s.x += s.vx * dt / 2; s.y += s.vy * dt / 2;
        if (solidAt(s.x, s.y)) s.life = 0;
        else if (G.state === 'play' && Math.hypot(s.x - P.x, s.y - P.y) < 0.35) { s.life = 0; hurtPlayer(s.dmg || 12, s); }
      }
    }
    if (s.life <= 0) {
      G.fx.push({ x: s.x - s.vx * 0.02, y: s.y - s.vy * 0.02, t: 0 });
      const vol = distVol(Math.hypot(s.x - P.x, s.y - P.y));
      if (s.rocket) {
        for (const e of G.enemies) {
          if (e.state === 'dead') continue;
          const d = Math.hypot(e.x - s.x, e.y - s.y);
          if (d < 2.5) damageEnemy(e, Math.round(60 * (1 - d / 2.5)));
        }
        const dp = Math.hypot(P.x - s.x, P.y - s.y);
        if (dp < 2.5 && G.state === 'play') hurtPlayer(Math.round(60 * (1 - dp / 2.5)), s);
      }
      sfx.boom(vol);
    }
  }
  G.shots = G.shots.filter(s => s.life > 0);
}

/* ---------- objets ---------- */
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
      P.shells = Math.min(cap, P.shells + 8); say('Cartouches (+8)');
    } else if (it.type === 'shotgun') {
      const cap = P.backpack ? 100 : 50;
      if (!P.hasShotgun) { P.hasShotgun = true; P.weapon = 1; say('Fusil à pompe !'); sfx.weapon(); }
      else say('Cartouches (+12)');
      P.shells = Math.min(cap, P.shells + 12);
    } else if (it.type === 'keyRed' || it.type === 'keyBlue' || it.type === 'keyYellow') {
      const k = { keyRed: 'red', keyBlue: 'blue', keyYellow: 'yellow' }[it.type];
      P.keys = P.keys || {}; P.keys[k] = true; say('Clé ' + { red: 'rouge', blue: 'bleue', yellow: 'jaune' }[k] + ' !');
    } else if (it.type === 'armor') {
      if (P.armor >= 100) continue;
      P.armor = Math.min(100, P.armor + 50); say('Armure (+50)');
    } else if (it.type === 'chaingun') {
      const capBul = P.backpack ? 400 : 200;
      P.owned[3] = true; P.weapon = 3; P.bullets = Math.min(capBul, P.bullets + 20);
      say('Mitrailleuse ! (+20 balles)'); sfx.weapon();
    } else if (it.type === 'launcher') {
      const capRoc = P.backpack ? 100 : 50;
      P.owned[4] = true; P.weapon = 4; P.rockets = Math.min(capRoc, P.rockets + 2);
      say('Lance-roquettes ! (+2 roquettes)'); sfx.weapon();
    } else if (it.type === 'bullets') {
      const capBul = P.backpack ? 400 : 200;
      if (P.bullets >= capBul) continue;
      P.bullets = Math.min(capBul, P.bullets + 20); say('Balles (+20)');
    } else if (it.type === 'rockets') {
      const capRoc = P.backpack ? 100 : 50;
      if (P.rockets >= capRoc) continue;
      P.rockets = Math.min(capRoc, P.rockets + 1); say('Roquettes (+1)');
    } else if (it.type === 'berserk') {
      P.berserk = true; P.hp = Math.max(P.hp, 100); say('Berserk !');
    } else if (it.type === 'invis') {
      P.invisT = 30; say('Invisibilité !');
    } else if (it.type === 'mega') {
      P.hp = 200; P.armor = 200; say('Mégasphère !');
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

      G.state = 'clear'; G.stateT = 0;   // souris gardée : le niveau suivant se joue sans recliquer
    } else sfx.oof();
    return;
  }
  sfx.oof();
}

/* ---------- sprites à dessiner ---------- */
const ITEM_TEX = { medkit: () => TX.medkit, ammo: () => TX.ammo, shotgun: () => TX.shotgun, armor: () => TX.armor, chaingun: () => TX.chaingun, launcher: () => TX.launcher, bullets: () => TX.bullets, rockets: () => TX.rockets, berserk: () => TX.berserk, invis: () => TX.invis, mega: () => TX.mega, backpack: () => TX.backpack, keyRed: () => TX.keyRed, keyBlue: () => TX.keyBlue, keyYellow: () => TX.keyYellow };
const ITEM_SCALE = { medkit: 0.32, ammo: 0.3, shotgun: 0.2, armor: 0.3, chaingun: 0.2, launcher: 0.22, bullets: 0.3, rockets: 0.3, berserk: 0.3, invis: 0.35, mega: 0.35, backpack: 0.3, keyRed: 0.25, keyBlue: 0.25, keyYellow: 0.25 };

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
    out.push({ x: e.x, y: e.y, tex: enemyTex(e), scale: e.def.scale, flat: e.state === 'dead',
      z: e.def.fly && e.state !== 'dead' ? (e.def.fly + 0.04 * Math.sin(e.anim * 3)) * pres : 0 });
  }
  for (const s of G.shots) out.push({ x: s.x, y: s.y, tex: s.color === 'blue' ? TX.fireballBlue : s.color === 'green' ? TX.fireballGreen : TX.fireball, scale: 0.32, z: 0.3, bright: true });
  for (const f of G.fx) out.push({ x: f.x, y: f.y, tex: TX.puff, scale: 0.35 + f.t * 1.5, z: 0.25, bright: true, flat: true });
  return out;
}
