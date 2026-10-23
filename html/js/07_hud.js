"use strict";
/* DOOMED — 07_hud.js : arme, HUD, visage, minimap, écrans titre / pause / mort / fin
 *
 * CONTRAT (vérifié par test.html — ne rien retirer de cette liste) :
 *   FOURNIT : gameDraw hudBg panel startMelt fmtTime drawWeapon drawHUD drawFace drawMinimap drawTitle drawVictory
 *   UTILISE : 01, TX grit (02), MAPS loadLevel CELL_* (04), render3D (05), G collectSprites (06)
 *   RÈGLE : tout texte doit tenir dans l'écran 480×320 ; le HUD dans sa barre de 48 px (y de 272 à 320).
 */

let HUD_BG = null;
function hudBg() {
  if (HUD_BG) return HUD_BG;
  HUD_BG = makeCanvas(W, HUD_H, x => {
    x.fillStyle = '#4a4238'; x.fillRect(0, 0, W, HUD_H);
    grit(x, W, HUD_H, 1800, 'rgba(0,0,0,.25)', 'rgba(255,255,255,.07)');
    x.fillStyle = '#80745f'; x.fillRect(0, 0, W, 1);
    x.fillStyle = '#221e19'; x.fillRect(0, 1, W, 1);
    for (const sx of [96, 200, 280, 380]) {
      x.fillStyle = '#221e19'; x.fillRect(sx - 1, 4, 1, HUD_H - 8);
      x.fillStyle = '#80745f'; x.fillRect(sx, 4, 1, HUD_H - 8);
    }
  });
  return HUD_BG;
}

function gameDraw() {
  if (G.state === 'title') return drawTitle();
  if (G.state === 'victory') return drawVictory();
  const P = G.P;
  const view = G.state === 'dead' ? { x: P.x, y: P.y, a: P.a, z: Math.max(0.1, 0.5 - G.stateT * 0.4) } : P;
  render3D(view, G.L, collectSprites());
  ctx.putImageData(FB_IMG, 0, 0);
  drawWeapon();   // dessine aussi le flash, derrière l'arme
  if (G.state === 'play') {
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.fillRect(W / 2 - 3, HOR, 2, 1); ctx.fillRect(W / 2 + 2, HOR, 2, 1);
    ctx.fillRect(W / 2, HOR - 3, 1, 2); ctx.fillRect(W / 2, HOR + 2, 1, 2);
  }
  if (P.hurt > 0) { ctx.fillStyle = `rgba(200,0,0,${Math.min(0.45, P.hurt * 0.8)})`; ctx.fillRect(0, 0, W, PLAY_H); }
  if (G.pickFlash > 0) { ctx.fillStyle = `rgba(255,230,120,${G.pickFlash})`; ctx.fillRect(0, 0, W, PLAY_H); }
  drawHUD();
  if (G.minimap) drawMinimap();
  if (G.msgT > 0) text(G.msg, 6, 10, 10, '#ffd040');

  if (G.state === 'pause') {
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, W, PLAY_H);
    text('PAUSE', W / 2, HOR - 10, 26, '#e33', 'center');
    text('Entrée, P ou clic pour reprendre', W / 2, HOR + 18, 10, '#ccc', 'center');
    ['Sensibilité : ' + SETTINGS.sens.toFixed(2), 'Volume : ' + Math.round(SETTINGS.volume * 100) + ' %',
     'Musique : ' + (SETTINGS.music ? 'oui' : 'non')]
      .forEach((l, i) => text(l, W / 2, HOR + 44 + i * 14, 10, i === (G.optLigne || 0) ? '#ffd040' : '#ccc', 'center'));
    text('↑ ↓ : choisir   ← → : régler', W / 2, HOR + 92, 8, '#888', 'center');
  } else if (G.state === 'dead') {
    ctx.fillStyle = `rgba(120,0,0,${Math.min(0.6, G.stateT * 0.6)})`; ctx.fillRect(0, 0, W, PLAY_H);
    text('VOUS ÊTES MORT', W / 2, HOR - 10, 24, '#f33', 'center');
    if (G.stateT > 1) text('Entrée : recommencer le niveau', W / 2, HOR + 18, 10, '#eee', 'center');
  } else if (G.state === 'clear') {
    const secrets = G.L.secrets || [];
    const found = secrets.filter(x => x.found).length;
    panel(['NIVEAU TERMINÉ', G.L.name, '', `Ennemis : ${G.kills} / ${G.total}`, `Secrets : ${found} / ${secrets.length}`, `Temps : ${fmtTime(G.time)}`, '',
      G.level + 1 < MAPS.length ? 'Entrée : niveau suivant' : 'Entrée : continuer']);
  }

  if (G.melt) {
    const off = G.melt.off;
    for (let i = 0, sx = 0; sx < W; i++, sx += 2) {
      const dy = Math.max(0, G.melt.t * 400 - off[i]);
      if (dy >= H) continue;
      ctx.drawImage(G.melt.img, sx, 0, 2, H - dy, sx, dy, 2, H - dy);
    }
  }
}

const fmtTime = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');

function panel(lines) {
  const h = lines.length * 16 + 24, y0 = HOR - h / 2;
  ctx.fillStyle = '#1a1510'; ctx.fillRect(110, y0, W - 220, h);
  ctx.strokeStyle = '#d33'; ctx.lineWidth = 2; ctx.strokeRect(110.5, y0 + 0.5, W - 221, h - 1);
  lines.forEach((l, i) => text(l, W / 2, y0 + 20 + i * 16, i === 0 ? 16 : 11, i === 0 ? '#ff3' : '#eee', 'center'));
}

function startMelt() {
  const img = makeCanvas(W, H, x => x.drawImage(cv, 0, 0));
  const n = Math.floor(W / 2);
  const off = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    off[i] = Math.random() * 40;
  }
  G.melt = { img: img, t: 0, off: off };
}

/* ---------- arme en vue subjective ---------- */
function drawWeapon() {
  const P = G.P;
  const imgs = [TX.wpPistol, TX.wpShotgun, TX.wpFist, TX.wpChaingun, TX.wpRocket];
  const img = imgs[P.weapon] || TX.wpPistol;
  const bx = Math.cos(P.bob) * 7 * P.moving, by = Math.abs(Math.sin(P.bob)) * 6 * P.moving;
  const drop = G.state === 'dead' ? Math.min(60, G.stateT * 80) : 0;
  const x = Math.round((W - img.width) / 2 + bx), y = Math.round(PLAY_H - img.height + by + P.kick * (P.weapon === 1 ? 14 : 8) + drop);
  if (P.flash > 0 && P.weapon !== 2) { const f = TX.wpFlash; ctx.drawImage(f, x + (img.width - f.width) / 2, y - f.height + 14); }
  ctx.drawImage(img, x, y);
}

/* ---------- barre d'état ---------- */
function drawHUD() {
  const P = G.P, y = PLAY_H;
  ctx.drawImage(hudBg(), 0, y);
  // la barre fait HUD_H = 48 px : chiffres et libellés doivent tenir dedans
  const big = (s, cx) => text(s, cx, y + 19, 24, '#ff3', 'center');
  const label = (s, cx) => text(s, cx, y + 40, 9, '#ddd', 'center');

  // Munitions de l'arme en main : P[WEAPONS[P.weapon].ammo] ou « -- » si null
  const wDef = WEAPONS[P.weapon];
  const ammoVal = (wDef && wDef.ammo) ? P[wDef.ammo] : null;
  big(ammoVal === null || ammoVal === undefined ? '--' : String(ammoVal), 48);
  label('MUNITIONS', 48);

  // case VITALITÉ (x 96–200) : vie en grand, puis deux petites lignes ; jamais sous le visage (x 217–263)
  text(Math.max(0, P.hp) + '%', 148, y + 16, 22, '#ff3', 'center');
  text('VITALITÉ', 148, y + 34, 8, '#ddd', 'center');
  text('ARMURE ' + Math.round(P.armor || 0) + '%', 148, y + 43, 8, '#7fdcff', 'center');

  drawFace(240, y + 24);

  // cases d'armes 1 à 5 dans la case ARMES (x de 280 à 380)
  const owned = P.owned || [true, false, true, false, false];
  for (let i = 0; i < 5; i++) {
    const cx = 292 + i * 19;
    if (P.weapon === i) { ctx.strokeStyle = '#ffe058'; ctx.lineWidth = 2; ctx.strokeRect(cx - 7, y + 13, 14, 14); ctx.lineWidth = 1; }
    text(String(i + 1), cx, y + 20, 14, owned[i] ? '#fff47c' : '#8a8070', 'center');
  }
  label('ARMES', 330);

  big(G.kills + '/' + G.total, 430); label('TUÉS', 430);
  ['red', 'blue', 'yellow'].forEach((k, i) => {   // clés possédées, entre le visage et les armes
    if (P.keys && P.keys[k]) { ctx.fillStyle = { red: '#e02020', blue: '#3060ff', yellow: '#f0d020' }[k]; ctx.fillRect(268, y + 8 + i * 11, 6, 8); }
  });
}

/* visage du marine : regard, douleur, sang selon la vie */
function drawFace(cx, cy) {
  const P = G.P, hp = Math.max(0, P.hp), dead = G.state === 'dead', k = hp / 100;
  ctx.fillStyle = '#1a140e'; ctx.fillRect(cx - 23, cy - 23, 46, 46);
  // ombre interne
  ctx.fillStyle = 'rgba(0,0,0,.5)';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(cx - 8 + i * 5, cy + 6 + i * 4, 10 - i * 2, 14 - i * 2, 0, 0, 7);
    ctx.fill();
  }
  // peau avec teinte et texture
  const skin = `rgb(${180 + 45 * k | 0},${135 + 35 * k | 0},${100 + 25 * k | 0})`;
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.ellipse(cx, cy + 2, 14, 18, 0, 0, 7); ctx.fill();
  // ombre sur la peau
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath(); ctx.ellipse(cx - 6, cy + 10, 11, 14, 0.3, 0, 7); ctx.fill();
  // front
  ctx.fillStyle = '#d8c5b0';
  ctx.fillRect(cx - 12, cy - 16, 24, 8);
  ctx.fillRect(cx - 10, cy - 14, 20, 3);
  // cheveux (arri`re du crâne)
  ctx.fillStyle = '#4a3520';
  ctx.beginPath(); ctx.ellipse(cx, cy - 10, 15, 7, 0, Math.PI, 0); ctx.fill();
  ctx.fillRect(cx - 16, cy - 13, 32, 4);
  if (dead) {
    ctx.strokeStyle = '#300'; ctx.lineWidth = 1.8;
    for (const ex of [cx - 6, cx + 6]) {
      ctx.beginPath(); ctx.moveTo(ex - 3, cy - 5); ctx.lineTo(ex + 4, cy + 2); ctx.moveTo(ex + 4, cy - 5); ctx.lineTo(ex - 3, cy + 2); ctx.stroke();
    }
  } else {
    const look = P.hurt > 0 ? P.faceDir : G.faceLook;
    // blanc des yeux (symétriques)
    ctx.fillStyle = '#f8f6e8';
    ctx.beginPath(); ctx.ellipse(cx - 6, cy - 4, 3.5, 2.2, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 6, cy - 4, 3.5, 2.2, 0, 0, 7); ctx.fill();
    // iris, décalés selon le regard
    ctx.fillStyle = '#0a3f6e';
    ctx.beginPath(); ctx.arc(cx - 6 + look * 1.6, cy - 4, 1.7, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 6 + look * 1.6, cy - 4, 1.7, 0, 7); ctx.fill();
    // reflet
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx - 6.5 + look * 1.6, cy - 5, 1, 1); ctx.fillRect(cx + 5.5 + look * 1.6, cy - 5, 1, 1);
    // sourcils
    ctx.fillStyle = '#5a3820';
    const frown = P.hurt > 0 ? 1 : 0;
    ctx.fillRect(cx - 11, cy - 7 + frown, 9, 2.5);
    ctx.fillRect(cx + 2.5, cy - 7 + frown, 9, 2.5);
    // lèvres intérieures
    ctx.fillStyle = '#3a1f12';
    ctx.beginPath();
    ctx.moveTo(cx - 10.5, cy - 7 + frown + 0.3);
    ctx.lineTo(cx - 6.5, cy - 5.5 + frown * 0.8);
    ctx.lineTo(cx - 6.5, cy - 7.2 + frown);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 10.5, cy - 7 + frown + 0.3);
    ctx.lineTo(cx + 6.5, cy - 5.5 + frown * 0.8);
    ctx.lineTo(cx + 6.5, cy - 7.2 + frown);
    ctx.fill();
  }
  // joue et menton
  if (!dead) {
    const a = (0.25 + 0.15 * Math.abs(Math.sin(performance.now() * 0.003))).toFixed(2);
    ctx.fillStyle = `rgba(120,${90 + 35 * k | 0},${70 + 30 * k | 0},${a})`;
    ctx.beginPath();
    ctx.moveTo(cx - 12, cy + 8);
    ctx.lineTo(cx - 5, cy + 15);
    ctx.lineTo(cx + 6, cy + 13);
    ctx.lineTo(cx + 13, cy + 9);
    ctx.fill();
  }
  if (P.hurt > 0 || dead) {
    ctx.fillStyle = '#4a1515'; ctx.fillRect(cx - 6, cy + 8, 12, 5);
    ctx.fillStyle = '#ddd'; ctx.fillRect(cx - 5, cy + 9, 10, 1.2);
  } else if (P.flash > 0 || G.pickFlash > 0) {
    ctx.fillStyle = '#fff8d0'; ctx.fillRect(cx - 6, cy + 9, 12, 2.5);
  } else {
    ctx.fillStyle = '#7a3828';
    ctx.fillRect(cx - 6, cy + 10, 12, 2);
  }
  // sang : une traînée par tranche de 20 PV perdus
  ctx.fillStyle = '#b33';
  const wounds = Math.min(5, Math.floor((100 - hp) / 20));
  for (let i = 0; i < wounds; i++) {
    if (i === 0) {   // entaille en diagonale sur le front
      ctx.strokeStyle = '#b33'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - 11, cy + 1);
      ctx.lineTo(cx - 7, cy + 4);
      ctx.lineTo(cx - 4, cy + 5);
      ctx.stroke(); ctx.lineWidth = 1;
    } else {
      ctx.fillRect(cx - 8 + i * 5.5, cy - 8 + (i % 2) * 7.5, 3, 7 + (i % 3) * 2.5);
    }
  }
}

/* ---------- minimap (Tab) ---------- */
function drawMinimap() {
  const L = G.L, P = G.P, c = 3.5, ox = W - L.w * c - 8, oy = 5;
  // fond puis bordure (dans cet ordre, sinon le fond recouvre la bordure)
  ctx.fillStyle = 'rgba(10,15,5,.85)'; ctx.fillRect(ox - 2, oy - 2, L.w * c + 4, L.h * c + 4);
  ctx.strokeStyle = '#462'; ctx.lineWidth = 2; ctx.strokeRect(ox - 2, oy - 2, L.w * c + 4, L.h * c + 4);
  // grille de fond : un seul tracé pour toutes les lignes
  ctx.strokeStyle = 'rgba(100,120,80,.15)'; ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (let i = 0; i <= L.w; i += 3) { ctx.moveTo(ox + i * c - 0.5, oy - 0.5); ctx.lineTo(ox + i * c - 0.5, oy + L.h * c + 0.5); }
  for (let i = 0; i <= L.h; i += 3) { ctx.moveTo(ox - 0.5, oy + i * c - 0.5); ctx.lineTo(ox + L.w * c + 0.5, oy + i * c - 0.5); }
  ctx.stroke();
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
    const code = L.grid[y * L.w + x];
    if (code === CELL_EMPTY) continue;
    const d = L.doorAt[y * L.w + x];
    ctx.fillStyle = code === CELL_DOOR ? (L.doors[d].open > 0.5 ? '#8a6a3a' : ({ red: '#ff3030', blue: '#4070ff', yellow: '#ffe040' }[L.doors[d].key] || '#ffa040')) : 
                   (code === CELL_EXIT ? '#6ff09e' : code === CELL_TECH ? '#9aaeb8' : '#aaa58a');
    ctx.fillRect(ox + x * c, oy + y * c, c, c);
    // effet de lueur
    if (code === CELL_DOOR && L.doors[L.doorAt[y * L.w + x]].open > 0.5) {
      ctx.fillStyle = 'rgba(120,90,40,.15)';
      ctx.beginPath(); ctx.arc(ox + x * c + 1.5, oy + y * c + 1.5, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  // ennemis (point rouge vif avec lueur)
  for (const e of G.enemies) if (e.state !== 'idle' && e.state !== 'dead') {
    ctx.fillStyle = 'rgba(180,30,30,.6)';
    ctx.beginPath(); ctx.arc(ox + e.x * c, oy + e.y * c, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f44'; ctx.fillRect(ox + e.x * c - 1, oy + e.y * c - 1, 3, 3);
  }
  // joueur (carré jaune vif)
  ctx.fillStyle = '#fff680'; ctx.fillRect(ox + P.x * c - 1.5, oy + P.y * c - 1.5, 3, 3);
  ctx.strokeStyle = '#fff450'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ox + P.x * c - 2, oy + P.y * c - 1);
  ctx.lineTo(ox + (P.x + Math.cos(P.a) * 2.2) * c, oy + (P.y + Math.sin(P.a) * 2.2) * c);
  ctx.stroke();
}

/* ---------- écran titre : le hangar tourne en fond ---------- */
let TITLE_L = null;
function drawTitle() {
  if (!TITLE_L) TITLE_L = loadLevel(0);
  render3D({ x: 15.5, y: 4.5, a: performance.now() / 7000 }, TITLE_L, []);
  ctx.putImageData(FB_IMG, 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#000'; ctx.fillRect(0, PLAY_H, W, HUD_H);
  ctx.font = 'bold 64px Impact, "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const g = ctx.createLinearGradient(0, 40, 0, 100);
  g.addColorStop(0, '#ffd040'); g.addColorStop(0.5, '#e8401a'); g.addColorStop(1, '#7a0a00');
  ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText('DOOMED', W / 2, 72);
  ctx.fillStyle = g; ctx.fillText('DOOMED', W / 2, 72);
  text('hommage à Doom (1993)', W / 2, 112, 10, '#bbb', 'center');

  const diffNames = ['Facile', 'Normal', 'Difficile'];
  let curIdx = G.skill === undefined ? 1 : G.skill; if (curIdx < 0 || curIdx > 2) curIdx = 1;   // G.skill : la difficulté réellement utilisée
  text('Difficulté : < ' + diffNames[curIdx] + ' (' + diffNames.join(' / ') + ') >', W / 2, 134, 11, '#ffd040', 'center');

  const lines = [
    ['Avancer / reculer', 'Z S  (W S)  ou  ↑ ↓'], ['Pas de côté', 'Q D  (A D)'], ['Tourner', '← →  ou souris (clic)'],
    ['Tirer', 'clic gauche  ou  Espace'], ['Armes', '1  2'], ['Interrupteur de sortie', 'E'],
    ['Carte / pause', 'Tab  /  P ou Échap'],
  ];
  lines.forEach(([a, b], i) => { text(a, W / 2 - 8, 154 + i * 13, 9, '#d9cdb5', 'right'); text(b, W / 2 + 8, 154 + i * 13, 9, '#ffd040'); });
  if ((performance.now() / 500 | 0) % 2) text('Appuyez sur Entrée', W / 2, 256, 14, '#f33', 'center');

  const prog = lireProgression();
  let contY = 278;
  if (prog.reached > 0) {
    const maxLvl = MAPS.length - 1;
    const lvlN = Math.min(prog.reached + 1, maxLvl);
    text('C : continuer au niveau ' + (lvlN + 1), W / 2, contY, 13, '#ffd040', 'center');
    let bestStrs = [];
    for (let i = 0; i <= prog.reached && i < maxLvl; i++) {
      if (typeof prog.best[i] === 'number') bestStrs.push('N' + (i + 1) + ':' + fmtTime(prog.best[i]));
    }
    bestStrs = bestStrs.slice(-5);   // les 5 derniers niveaux seulement : la ligne doit tenir dans l'écran quel que soit le nombre de niveaux
    if (bestStrs.length) text(bestStrs.join('   '), W / 2, contY + 16, 9, '#aaa', 'center');
  }

  text('F1 : images/s   F2 : planche des assets', W / 2, 308, 8, '#777', 'center');
}

function drawVictory() {
  ctx.fillStyle = '#100'; ctx.fillRect(0, 0, W, H);
  text('VICTOIRE !', W / 2, 70, 30, '#ffd040', 'center');
  text('Les démons sont repoussés... pour cette fois.', W / 2, 110, 10, '#ddd', 'center');
  const T = G.totals;
  text(`Ennemis tués : ${T.kills} / ${T.total}`, W / 2, 150, 12, '#eee', 'center');
  text(`Temps total : ${fmtTime(T.time)}`, W / 2, 172, 12, '#eee', 'center');
  if (G.stateT > 1) text('Entrée : écran titre', W / 2, 240, 11, '#f33', 'center');
}
