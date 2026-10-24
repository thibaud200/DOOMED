"use strict";
/* DOOMED — 02_assets.js : textures, sprites et armes générés par le code (aucun fichier image)
 *
 * CONTRAT (vérifié par test.html — ne rien retirer de cette liste) :
 *   FOURNIT : texFromCanvas grit TX WALL_TEX MONSTRES_GENERES enregistrerPoses ASSET_LIST drawAssetSheet entreeImage imageIA appliquerImagesIA OBJETS_IA appliquerObjetsIA appliquerImagesFreedoom
 *             TX.<nom> pour chaque nom de ASSET_LIST = { w, h, px: Uint32Array(w*h), cv: canvas }
 *             (murs/sol/plafond 64×64 opaques ; sprites : pixel 0 = transparent)
 *             TX.wpPistol TX.wpShotgun TX.wpFlash = canvas (armes en vue subjective)
 *             WALL_TEX[1..4] = brique, tech, porte, sortie
 *   UTILISE : TEX makeCanvas rgb rand ctx text W H (01) · IMAGES_IA (01b, facultatif : images ComfyUI) · IMAGES_FREEDOOM (01c, facultatif : images Freedoom, prioritaires)
 *   RÈGLE : on peut changer le DESSIN des textures, jamais leur format ni leurs noms.
 */

// TEX, makeCanvas et rgb sont définis dans 01_core.js

/* Canvas -> {w, h, px:Uint32Array, cv} : format attendu par le moteur (05_render.js).
   Pour un sprite, les pixels peu opaques valent 0 (transparent). */
function texFromCanvas(c, sprite) {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const px = new Uint32Array(c.width * c.height);
  for (let i = 0; i < px.length; i++) {
    if (sprite && d[i * 4 + 3] < 128) { px[i] = 0; continue; }
    px[i] = rgb(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
  }
  return { w: c.width, h: c.height, px, cv: c };
}

/* Image dessinée par ComfyUI (js/01b_images_ia.js, pixels indexés en base64) -> même format que texFromCanvas.
   null si l'image est absente ou illisible : l'appelant garde alors son dessin procédural. */
function entreeImage(nom) {   // Freedoom d'abord (images du jeu libre Freedoom), puis ComfyUI (monstres créés par le modèle)
  return (typeof IMAGES_FREEDOOM !== 'undefined' && IMAGES_FREEDOOM[nom]) || (typeof IMAGES_IA !== 'undefined' && IMAGES_IA[nom]) || null;
}

function imageIA(nom) {
  const e = entreeImage(nom);
  if (!e) return null;
  try {
    const n = e.w * e.h, d = atob(e.d), pal = [];
    if (d.length !== n) return null;
    for (let i = 0; i + 6 <= e.pal.length; i += 6)
      pal.push([parseInt(e.pal.substr(i, 2), 16), parseInt(e.pal.substr(i + 2, 2), 16), parseInt(e.pal.substr(i + 4, 2), 16)]);
    const c = makeCanvas(e.w, e.h), x = c.getContext('2d'), img = x.createImageData(e.w, e.h), px = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      const v = d.charCodeAt(i);
      if (e.tr && v === 0) continue;
      const q = pal[v];
      if (!q) return null;
      img.data[i * 4] = q[0]; img.data[i * 4 + 1] = q[1]; img.data[i * 4 + 2] = q[2]; img.data[i * 4 + 3] = 255;
      px[i] = rgb(q[0], q[1], q[2]);
    }
    x.putImageData(img, 0, 0);
    return { w: e.w, h: e.h, px, cv: c };
  } catch (err) { console.error('image IA ' + nom, err); return null; }
}

/* grain : points sombres/clairs au hasard (utilisé aussi par le HUD) */
function grit(x, w, h, n, dark, light) {
  for (let i = 0; i < n; i++) {
    x.fillStyle = Math.random() < 0.5 ? dark : light;
    x.fillRect((Math.random() * w) | 0, (Math.random() * h) | 0, 1, 1);
  }
}

const TX = {};
const WALL_TEX = [];   // indexé par code de case (1 brique, 2 tech, 3 porte, 4 sortie, 5-6 interrupteur, 7 barrière)

/* monstres créés par le modèle (outils/ia_tache.py monstre) : [type, nom de sa fonction de dessin] */
const MONSTRES_GENERES = [
  ['sporeling', 'drawSporeling'],
  ['vulture', 'drawVulture'],
];

function addNoise(x, amount) {
  for (let i = 0; i < amount; i++) {
    const gx = Math.floor(Math.random() * TEX), gy = Math.floor(Math.random() * TEX);
    const alpha = Math.random() * 0.15;
    x.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`;
    x.fillRect(gx, gy, 1, 1);
  }
}

function addScanlines(x) {
  x.strokeStyle = 'rgba(0,0,0,.15)'; x.lineWidth = 0.5;
  for (let y = 0; y < TEX; y += 2) {
    x.beginPath(); x.moveTo(0, y); x.lineTo(TEX, y); x.stroke();
  }
}

/* ---------- WALLS: CYBERPUNK INDUSTRIAL ---------- */
function buildWalls() {
  
  const brick = makeCanvas(TEX, TEX, x => {
    const baseGrad = x.createLinearGradient(0, 0, 0, TEX);
    baseGrad.addColorStop(0, '#1a0c06');
    baseGrad.addColorStop(0.5, '#2d1610');
    baseGrad.addColorStop(1, '#120703');
    x.fillStyle = baseGrad; x.fillRect(0, 0, TEX, TEX);
    
    const brickColors = [
      {r: 110, g: 55, b: 40}, {r: 95, g: 50, b: 35}, {r: 125, g: 60, b: 45}
    ];
    
    for (let r = 0; r < 8; r++) {
      const off = (r % 2) ? -8 : 0;
      
      for (let c = -1; c <= 4; c++) {
        const idx = (Math.random() * brickColors.length) | 0;
        const s = 0.65 + Math.random() * 0.5, bc = brickColors[idx];
        const bx = c * 16 + off + 1, by = r * 8 + 1;
        
        x.fillStyle = `rgb(${bc.r * s | 0},${bc.g * s | 0},${bc.b * s | 0})`;
        x.fillRect(bx, by, 14, 6);
        
        const topGrad = x.createLinearGradient(bx, by, bx + 14, by);
        topGrad.addColorStop(0, `rgba(255,220,180,${0.12 * s})`);
        topGrad.addColorStop(0.3, `rgba(255,220,180,${0.25 * s})`);
        topGrad.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = topGrad;
        x.fillRect(bx + 1, by, 13, 1.2);
        
        const sideGrad = x.createLinearGradient(bx + 14, by, bx + 14, by + 6);
        sideGrad.addColorStop(0, 'rgba(0,0,0,0)');
        sideGrad.addColorStop(0.7, `rgba(0,0,0,${0.35 * s})`);
        sideGrad.addColorStop(1, `rgba(0,0,0,${0.45 * s})`);
        x.fillStyle = sideGrad;
        x.fillRect(bx + 12, by + 1, 2, 6);
        
        const mortarGrad = x.createLinearGradient(0, by + 5, 0, by + 7);
        mortarGrad.addColorStop(0, 'rgba(0,0,0,.4)');
        mortarGrad.addColorStop(0.5, `rgba(${80 * (0.6 + Math.random()*0.3) | 0},${35 * (0.6 + Math.random()*0.3) | 0},${20 * (0.6 + Math.random()*0.3) | 0},.5)`);
        mortarGrad.addColorStop(1, 'rgba(0,0,0,.5)');
        x.fillStyle = mortarGrad;
        x.fillRect(bx, by + 5, 14, 2);
        
        if (Math.random() < 0.18) {
          const cx = bx + 3 + Math.floor(Math.random() * 8), cy = by + 1 + Math.floor(Math.random() * 4);
          x.fillStyle = 'rgba(0,0,0,.25)';
          x.fillRect(cx, cy, Math.floor(Math.random() * 3) + 1, Math.floor(Math.random() * 2) + 1);
        }
      }
      
      const by = r * 8 + 1;   // haut de la rangée (le « by » de la boucle n'existe pas ici)
      const isAccentRow = (r + 1) % 3 === 0;
      if (isAccentRow) {
        for (let lx = 1; lx < TEX - 1; lx += 4) {
          x.fillStyle = `rgba(150, 20, 50, ${0.03 + Math.random() * 0.08})`;
          x.fillRect(lx, by + 6, 2, 1);
        }
      } else {
        x.fillStyle = `rgb(${75 * (0.7 + Math.random()*0.2) | 0},${32 * (0.7 + Math.random()*0.2) | 0},${18 * (0.7 + Math.random()*0.2) | 0})`;
        x.fillRect(1, by + 6, TEX - 2, 1);
      }
    }
    
    addScanlines(x);
    addNoise(x, 350);
  });

  const tech = makeCanvas(TEX, TEX, x => {
    x.fillStyle = '#14171c'; x.fillRect(0, 0, TEX, TEX);
    
    x.strokeStyle = 'rgba(60, 70, 85, 0.08)'; x.lineWidth = 0.8;
    for (let i = 0; i <= TEX; i += 8) {
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i, TEX); x.stroke();
      x.beginPath(); x.moveTo(0, i); x.lineTo(TEX, i); x.stroke();
    }
    
    for (let p = 0; p < 4; p++) {
      const i = (p >> 1), j = (p & 1) ? i + 2 : i;
      const ox = i * 32 + 2, oy = j * 32 + 2;
      
      x.strokeStyle = 'rgba(180, 190, 200, 0.3)'; x.lineWidth = 1.5;
      x.beginPath();
      x.moveTo(ox, oy); x.lineTo(ox + 28, oy);
      x.lineTo(ox + 28, oy + 28); x.lineTo(ox, oy + 28);
      x.closePath(); x.stroke();
      
      x.strokeStyle = 'rgba(60, 65, 75, 0.4)'; x.lineWidth = 1;
      x.beginPath(); x.moveTo(ox + 0.5, oy + 0.5); x.lineTo(ox + 27.5, oy + 0.5);
      x.lineTo(ox + 27.5, oy + 27.5); x.lineTo(ox + 0.5, oy + 27.5);
      x.closePath(); x.stroke();
      
      for (let gy = 2; gy < 28 - 2; gy += 4) {
        const colors = ['rgba(100, 110, 125,', 'rgba(60, 70, 85,', 'rgba(90, 100, 115,', 'rgba(70, 80, 95,'];
        const col = colors[(Math.random() * 4) | 0];
        
        for (let gx = ox + 4; gx < ox + 26 - 4; gx += 10) {
          x.fillStyle = col + `0.25)`;
          x.fillRect(gx, gy, 6, 2);
        }
        
        for (let vx = ox + 6; vx < ox + 24 - 6; vx += 12) {
          const vy = oy + 8 + Math.floor(Math.random() * 10);
          x.fillStyle = col + `0.35)`;
          x.fillRect(vx, vy, 2, 5);
        }
      }
      
      for (const [rx, ry] of [[8, 12], [20, 20]]) {
        x.strokeStyle = '#7a8596'; x.lineWidth = 1.5;
        x.beginPath();
        for (let i = 0; i < 5; i++) {
          const angle = i * Math.PI / 3 - Math.PI / 2;
          const r = 4 + Math.sin(angle * 3) * 2;
          x.lineTo(ox + rx + Math.cos(angle) * r, oy + ry + Math.sin(angle) * r);
        }
        x.closePath(); x.stroke();
        
        x.fillStyle = '#9aaab5';
        for (const [arx, ary] of [[rx - 2, ry - 2], [rx + 2, ry + 3]]) {
          x.beginPath(); x.arc(ox + arx, oy + ary, 1.8, 0, Math.PI * 2); x.fill();
        }
      }
    }
    
    const stripGrad = x.createLinearGradient(0, 30, 0, 34);
    stripGrad.addColorStop(0, 'rgba(255, 100, 80, 0.6)');
    stripGrad.addColorStop(0.25, 'rgba(255, 140, 100, 0.95)');
    stripGrad.addColorStop(0.5, 'rgba(255, 140, 100, 0.85)');
    stripGrad.addColorStop(0.75, 'rgba(255, 120, 85, 0.95)');
    stripGrad.addColorStop(1, 'rgba(255, 80, 60, 0.6)');
    x.fillStyle = stripGrad; x.fillRect(0, 30, TEX, 4);
    
    x.fillStyle = 'rgba(255, 240, 220, 0.75)';
    for (let i = 0; i < 5; i++) {
      const y = 31 + (i * 6) % 4;
      x.fillRect(2, y, TEX - 4, 0.8);
    }
    
    for (let vy = 2; vy < TEX - 2; vy += 18) {
      const vx = 4 + Math.floor(Math.random() * 3);
      x.fillStyle = 'rgba(0, 255, 150, 0.35)';
      for (let j = 0; j < 3; j++) {
        const alpha = 0.1 + Math.random() * 0.2;
        x.fillRect(vx, vy + j * 8, 3, Math.max(2, 7 - j));
      }
    }
    
    addScanlines(x);
    addNoise(x, 280);
  });

  const door = makeCanvas(TEX, TEX, x => {
    const baseGrad = x.createLinearGradient(0, 0, TEX, 0);
    baseGrad.addColorStop(0, '#353a42');
    baseGrad.addColorStop(0.5, '#41464e');
    baseGrad.addColorStop(1, '#30353d');
    x.fillStyle = baseGrad; x.fillRect(0, 0, TEX, TEX);
    
    const panelGrad = x.createLinearGradient(0, 0, 0, TEX);
    panelGrad.addColorStop(0, '#5a616b');
    panelGrad.addColorStop(0.8, '#4a525c');
    panelGrad.addColorStop(1, '#3a424c');
    
    x.fillStyle = panelGrad;
    x.fillRect(4, 4, 10, TEX - 8);
    x.fillStyle = panelGrad;
    x.fillRect(TEX - 14, 4, 10, TEX - 8);
    
    for (let y = 6; y < TEX - 6; y += 7) {
      x.fillStyle = 'rgba(200, 210, 220, 0.25)';
      x.fillRect(5, y, 54, 0.8);
      
      const barGrad = x.createLinearGradient(5, y, 59, y);
      barGrad.addColorStop(0, '#6a737e');
      barGrad.addColorStop(0.5, '#5b646e');
      barGrad.addColorStop(1, '#4a525c');
      x.fillStyle = barGrad;
      x.fillRect(5, y + 0.8, 54, 3);
      
      x.fillStyle = 'rgba(0, 0, 0, 0.4)';
      x.fillRect(5, y + 4, 54, 1.2);
    }
    
    for (const [cx, cy] of [[8, 8], [TEX - 8, 8], [8, TEX - 8], [TEX - 8, TEX - 8]]) {
      x.fillStyle = '#5a6370';
      x.fillRect(cx - 4, cy - 4, 12, 12);
      
      x.fillStyle = '#7a8596';
      for (const [bx, by] of [[cx - 3, cy - 2], [cx + 3, cy + 3]]) {
        x.beginPath(); x.arc(bx, by, 2.5, 0, Math.PI * 2); x.fill();
        x.strokeStyle = 'rgba(255,255,255,0.15)'; x.lineWidth = 0.8;
        x.beginPath(); x.moveTo(bx - 2, by); x.lineTo(bx + 2, by);
        x.moveTo(bx, by - 2); x.lineTo(bx, by + 2);
        x.stroke();
      }
    }
    
    x.strokeStyle = 'rgba(220, 160, 50, 0.45)'; x.lineWidth = 1.5;
    for (let i = 0; i < TEX; i += 3) {
      const sx = i % 2 ? -2 : TEX - 2;
      x.beginPath(); x.moveTo(sx, i); x.lineTo(sx + 3, i + 2.5); x.stroke();
    }
    
    const alertGrad = x.createRadialGradient(48 + TEX/1.2, 32 + TEX/1.2, 2, 48 + TEX/1.2, 32 + TEX/1.2, 9);
    alertGrad.addColorStop(0, 'rgba(200, 50, 50, 0.95)');
    alertGrad.addColorStop(0.4, 'rgba(150, 30, 30, 0.75)');
    alertGrad.addColorStop(1, 'rgba(150, 30, 30, 0)');
    x.fillStyle = alertGrad;
    x.beginPath(); x.arc(48 + TEX/1.2, 32 + TEX/1.2, 11, 0, Math.PI * 2); x.fill();
    
    const pulseGrad = x.createRadialGradient(48 + TEX/1.2, 32 + TEX/1.2, 2, 48 + TEX/1.2, 32 + TEX/1.2, 5);
    pulseGrad.addColorStop(0, 'rgba(255, 50, 50, 0.9)');
    pulseGrad.addColorStop(1, 'rgba(180, 0, 0, 0.6)');
    x.fillStyle = pulseGrad;
    x.beginPath(); x.arc(48 + TEX/1.2, 32 + TEX/1.2, 5, 0, Math.PI * 2); x.fill();
    
    addScanlines(x);
    addNoise(x, 220);
  });

  const exit = makeCanvas(TEX, TEX, x => {
    x.drawImage(tech, 0, 0);
    
    const outerGrad = x.createLinearGradient(8, 2, 48, 11);
    outerGrad.addColorStop(0, '#3df08a');
    outerGrad.addColorStop(0.5, '#6aff7f');
    outerGrad.addColorStop(1, '#3df08a');
    
    x.strokeStyle = outerGrad; x.lineWidth = 4.5;
    x.strokeRect(12, 3, 39, 40);
    
    x.strokeStyle = 'rgba(0, 0, 0, 0.6)'; x.lineWidth = 1;
    x.strokeRect(15, 6, 33, 34);
    
    const haloGrad = x.createRadialGradient(32, 18 + TEX/1.2, 8, 32, 18 + TEX/1.2, 28);
    haloGrad.addColorStop(0, 'rgba(61, 240, 138, 0.4)');
    haloGrad.addColorStop(0.3, 'rgba(61, 240, 138, 0.15)');
    haloGrad.addColorStop(1, 'rgba(61, 240, 138, 0)');
    x.fillStyle = haloGrad;
    x.fillRect(12, 3, 39, 40);
    
    const textColors = ['#2ebd7a', '#3df08a', '#5aff8f'];
    for (let depth = 0; depth < 3; depth++) {
      x.fillStyle = textColors[depth];
      x.font = `bold ${10 + depth}px monospace`; x.textAlign = 'center'; x.textBaseline = 'top';
      const shadow = depth * 2;
      x.fillText('EXIT', 32, 3 + shadow);
    }
    
    x.fillStyle = 'rgba(0, 0, 0, 0.55)';
    x.font = `bold 8px monospace`; x.textAlign = 'center'; x.textBaseline = 'top';
    x.fillText('EXIT', 32, 4);
    
    x.strokeStyle = '#6aff7f'; x.lineWidth = 1.5;
    x.strokeRect(18, 19 + TEX/1.2, 27, 34);
    
    for (const [tx, ty, tw] of [[20, 22 + TEX/1.2, 4], [44, 22 + TEX/1.2, 4]]) {
      const tubeGrad = x.createLinearGradient(tx, ty, tx, ty + 34);
      tubeGrad.addColorStop(0, 'rgba(100, 255, 160, 0.4)');
      tubeGrad.addColorStop(0.3, 'rgba(180, 255, 200, 0.9)');
      tubeGrad.addColorStop(0.7, 'rgba(180, 255, 200, 0.9)');
      tubeGrad.addColorStop(1, 'rgba(100, 255, 160, 0.4)');
      x.fillStyle = tubeGrad;
      x.fillRect(tx, ty, tw, 34);
    }
    
    const bulbGrad = x.createRadialGradient(32, 30 + TEX/1.2, 3, 32, 30 + TEX/1.2, 9);
    bulbGrad.addColorStop(0, '#fffbe0');
    bulbGrad.addColorStop(0.4, '#fff58f');
    bulbGrad.addColorStop(0.7, '#ffd04a');
    bulbGrad.addColorStop(1, 'rgba(255, 180, 60, 0)');
    x.fillStyle = bulbGrad;
    x.beginPath(); x.arc(32, 30 + TEX/1.2, 9, 0, Math.PI * 2); x.fill();
    
    x.fillStyle = 'rgba(255, 255, 255, 0.85)';
    x.beginPath(); x.arc(34 + TEX/1.2 - 4, 28 + TEX/1.2 - 2, 2.5, 0, Math.PI * 2); x.fill();
    
    x.strokeStyle = 'rgba(180, 160, 120, 0.4)'; x.lineWidth = 0.8;
    for (let gx = 28 + TEX/1.2 - 8; gx <= 36 + TEX/1.2; gx += 4) {
      x.beginPath(); x.moveTo(gx, 26 + TEX/1.2); x.lineTo(gx, 34 + TEX/1.2); x.stroke();
    }
    
    addScanlines(x);
    addNoise(x, 180);
  });

  const floor = makeCanvas(TEX, TEX, x => {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const s = 0.85 + Math.random() * 0.35, k = (i + j) % 2;
      
      x.fillStyle = k ? 
        `rgb(${72 * s | 0},${62 * s | 0},${51 * s | 0})` : 
        `rgb(${56 * s | 0},${50 * s | 0},${43 * s | 0})`;
      x.fillRect(i * 16, j * 16, 16, 16);
      
      const lightGrad = x.createLinearGradient(
        i * 16 + 2, j * 16 + 2, 
        i * 16 + 14, j * 16 + 14
      );
      lightGrad.addColorStop(0, 'rgba(255, 250, 235, 0.18)');
      lightGrad.addColorStop(0.5, 'rgba(255, 245, 225, 0.1)');
      lightGrad.addColorStop(1, 'rgba(255, 240, 210, 0.05)');
      x.fillStyle = lightGrad;
      x.fillRect(i * 16 + 2, j * 16 + 2, 8, 8);
      
      x.strokeStyle = 'rgba(255, 245, 230, 0.25)'; x.lineWidth = 1;
      x.beginPath(); x.moveTo(i * 16 + 2, j * 16 + 2); 
      x.lineTo(i * 16 + 12, j * 16 + 2);
      x.lineTo(i * 16 + 12, j * 16 + 12);
      x.lineTo(i * 16 + 2, j * 16 + 12);
      x.closePath(); x.stroke();
      
      x.strokeStyle = 'rgba(0, 0, 0, 0.4)'; x.lineWidth = 1.2;
      x.beginPath(); 
      x.moveTo(i * 16, j * 16 + 15); x.lineTo(i * 16 + 16, j * 16 + 15);
      x.stroke();
      x.beginPath(); 
      x.moveTo(i * 16 + 15, j * 16); x.lineTo(i * 16 + 15, j * 16 + 16);
      x.stroke();
      
      if (Math.random() < 0.22) {
        const wx = i * 16 + 5 + Math.floor(Math.random() * 6), 
              wy = j * 16 + 5 + Math.floor(Math.random() * 6);
        x.fillStyle = 'rgba(0, 0, 0, 0.2)';
        const shape = (Math.random() < 0.5) ? 'rect' : 'ellipse';
        if (shape === 'rect') {
          x.fillRect(wx, wy, Math.floor(Math.random() * 3) + 1, Math.floor(Math.random() * 2));
        } else {
          x.beginPath(); 
          x.arc(wx, wy, Math.floor(Math.random() * 1.5) + 0.5, 0, Math.PI * 2); 
          x.fill();
        }
      }
    }
    
    const floorGrad = x.createLinearGradient(0, 0, TEX, TEX);
    floorGrad.addColorStop(0, 'rgba(255, 245, 230, 0.12)');
    floorGrad.addColorStop(0.5, 'rgba(255, 240, 220, 0.06)');
    floorGrad.addColorStop(1, 'rgba(255, 235, 210, 0.03)');
    x.fillStyle = floorGrad;
    x.fillRect(0, 0, TEX, TEX);
    
    addNoise(x, 380);
  });

  const ceil = makeCanvas(TEX, TEX, x => {
    const bgGrad = x.createLinearGradient(0, 0, 0, TEX);
    bgGrad.addColorStop(0, '#2e3137');
    bgGrad.addColorStop(0.5, '#24272d');
    bgGrad.addColorStop(1, '#1d1f24');
    x.fillStyle = bgGrad; x.fillRect(0, 0, TEX, TEX);
    
    x.strokeStyle = 'rgba(80, 90, 105, 0.35)'; x.lineWidth = 1.5;
    for (let i = 0; i <= TEX; i += 20) {
      x.beginPath(); x.moveTo(0, i); x.lineTo(TEX, i); x.stroke();
      
      if (i > 10 && i < TEX - 10) {
        for (let vx = 15; vx < TEX - 15; vx += 28) {
          x.strokeStyle = `rgba(${60 + Math.random()*20}, ${70 + Math.random()*20}, ${85 + Math.random()*20}, 0.3)`;
          x.beginPath(); 
          x.moveTo(vx, i); 
          x.lineTo(vx + (TEX - i) / 8, TEX);
          x.stroke();
        }
      }
    }
    
    const panelGrad = x.createRadialGradient(28, 28, 5, 28, 28, 36);
    panelGrad.addColorStop(0, 'rgba(255, 250, 240, 0.25)');
    panelGrad.addColorStop(0.4, 'rgba(255, 245, 230, 0.12)');
    panelGrad.addColorStop(1, 'rgba(255, 240, 220, 0)');
    x.fillStyle = panelGrad;
    x.fillRect(8, 8, 48, 48);
    
    x.strokeStyle = '#7a8390'; x.lineWidth = 2;
    x.strokeRect(12, 12, 40, 40);
    
    x.strokeStyle = 'rgba(180, 170, 150, 0.3)'; x.lineWidth = 0.8;
    for (let gx = 16; gx < 48; gx += 6) {
      for (let gy = 16; gy < 48; gy += 6) {
        x.beginPath(); x.moveTo(gx, gy); x.lineTo(gx + 3, gy + 3); x.stroke();
        x.beginPath(); x.moveTo(gx + 3, gy); x.lineTo(gx, gy + 3); x.stroke();
      }
    }
    
    const bulbGrad = x.createRadialGradient(32, 32, 6, 32, 32, 40);
    bulbGrad.addColorStop(0, '#fff8d0');
    bulbGrad.addColorStop(0.3, '#fff5b0');
    bulbGrad.addColorStop(0.7, 'rgba(255, 240, 180, 0.3)');
    bulbGrad.addColorStop(1, 'rgba(255, 235, 160, 0)');
    x.fillStyle = bulbGrad;
    x.fillRect(0, 0, TEX, TEX);
    
    x.fillStyle = '#fff';
    x.beginPath(); x.arc(32, 32, 8, 0, Math.PI * 2); x.fill();
    
    x.strokeStyle = 'rgba(255, 250, 240, 0.6)'; x.lineWidth = 1.5;
    for (const [lx, ly] of [[28, 26], [36, 28]]) {
      x.beginPath(); x.moveTo(lx, ly); x.lineTo(lx + 4, ly + 3); x.stroke();
    }
    
    for (const [sx, sy] of [[15, 15], [49, 15], [15, 49]]) {
      const spotGrad = x.createRadialGradient(sx, sy, 3, sx, sy, 25);
      spotGrad.addColorStop(0, 'rgba(255, 245, 220, 0.18)');
      spotGrad.addColorStop(0.6, 'rgba(255, 240, 200, 0.06)');
      spotGrad.addColorStop(1, 'rgba(255, 235, 180, 0)');
      x.fillStyle = spotGrad;
      x.fillRect(sx - 25, sy - 25, 50, 50);
    }
    
    addScanlines(x);
    addNoise(x, 320);
  });

  TX.brick = texFromCanvas(brick); TX.tech = texFromCanvas(tech); 
  TX.door = texFromCanvas(door); TX.exit = texFromCanvas(exit); 
  TX.floor = texFromCanvas(floor); TX.ceil = texFromCanvas(ceil);
  
  WALL_TEX[1] = TX.brick; WALL_TEX[2] = TX.tech; WALL_TEX[3] = TX.door; WALL_TEX[4] = TX.exit;
  WALL_TEX[5] = WALL_TEX[6] = TX.tech; WALL_TEX[7] = TX.brick;   // interrupteurs et barrière, sans les images Freedoom
  appliquerImagesIA();
}

/* Murs, sol et plafond dessinés par ComfyUI quand ils existent (64×64). Le mot EXIT est toujours écrit ICI :
   ComfyUI ne dessine jamais de texte, il ne fournit que le fond du panneau. */
function appliquerImagesIA() {
  for (const n of ['brick', 'tech', 'door', 'floor', 'ceil']) {
    const t = imageIA(n);
    if (t && t.w === TEX && t.h === TEX) TX[n] = t;
  }
  const fond = imageIA('exit');
  if (fond && fond.w === TEX && fond.h === TEX) TX.exit = texFromCanvas(makeCanvas(TEX, TEX, x => {
    x.drawImage(fond.cv, 0, 0);
    x.fillStyle = 'rgba(0,0,0,.7)'; x.fillRect(11, 9, 42, 15);   // au centre du cadre lumineux dessiné par ComfyUI
    x.font = 'bold 13px monospace'; x.textAlign = 'center'; x.textBaseline = 'top';
    x.fillStyle = '#0a3018'; x.fillText('EXIT', 33, 11);
    x.fillStyle = '#7aff8f'; x.fillText('EXIT', 32, 10);
  }));
  WALL_TEX[1] = TX.brick; WALL_TEX[2] = TX.tech; WALL_TEX[3] = TX.door; WALL_TEX[4] = TX.exit;
  appliquerImagesFreedoom();
}

/* ---------- ENNEMIS: ULTRA-DETAILED ---------- */
function drawImp(pose) {
  return makeCanvas(TEX, TEX, x => {
    const cx = 32;
    
    if (pose === 'corpse') {
      x.fillStyle = 'rgba(100, 25, 20, 0.98)';
      x.beginPath(); x.ellipse(cx, 62, 24, 8, 0, 0, Math.PI * 2); x.fill();
      
      x.fillStyle = 'rgba(70, 15, 10, 0.95)';
      x.beginPath(); x.ellipse(cx - 5, 58, 16, 6, 0, 0, Math.PI * 2); x.fill();
      
      x.fillStyle = 'rgba(130, 45, 30, 0.95)';
      x.beginPath(); x.ellipse(cx + 8, 55, 14, 6, 0, 0, Math.PI * 2); x.fill();
      
      x.fillStyle = 'rgba(0, 0, 0, 0.8)';
      x.beginPath(); x.arc(cx + 12, 48, 5, 0, Math.PI * 2); x.fill();
      
      x.fillStyle = '#d6c8a0';
      x.fillRect(cx + 13, 47, 2, 3);
      
      for (let i = 0; i < 4; i++) {
        const bx = cx - 8 + Math.floor(Math.random() * 20);
        const by = 60 + Math.floor(Math.random() * 6);
        x.fillStyle = 'rgba(80, 15, 5, 0.8)';
        x.fillRect(bx, by, 2, Math.floor(Math.random() * 3) + 1);
      }
      
      return;
    }
    
    const b = pose === 'b' ? 1 : 0;
    x.strokeStyle = '#6e2418'; x.lineWidth = 5; x.lineCap = 'round';
    x.beginPath(); 
    x.moveTo(cx - 7, 44 + b); 
    x.lineTo(cx - 9 + b * 3, 60 - b * 2); 
    x.stroke();
    
    x.beginPath(); 
    x.moveTo(cx + 7, 44 + b); 
    x.lineTo(cx + 9 - b * 3, 60 - b * 2); 
    x.stroke();
    
    const headColors = { 'idle': '#9c3d2a', 'atk': '#b54730', 'pain': '#c46a4f' };
    x.fillStyle = headColors[pose] || '#9c3d2a';
    x.beginPath(); 
    x.ellipse(cx, 38 + b * 0.5, 10, 13, 0, 0, Math.PI * 2); 
    x.fill();
    
    const eyeColors = { 'idle': 'rgba(0, 0, 0, 0.2)', 'atk': 'rgba(100, 50, 30, 0.4)', 'pain': 'rgba(80, 40, 25, 0.5)' };
    x.fillStyle = eyeColors[pose] || 'rgba(0,0,0,0.2)';
    x.beginPath(); x.ellipse(cx + 3, 41, 6, 9, 0, 0, Math.PI * 2); 
    x.fill();
    
    x.strokeStyle = '#7c2a1e'; x.lineWidth = 3;
    x.beginPath(); 
    x.moveTo(cx + 8, 46); 
    x.quadraticCurveTo(cx + 15, 50, cx + 12, 56); 
    x.stroke();
    x.fillStyle = 'rgba(0,0,0,0.15)';
    x.beginPath(); x.arc(cx + 12, 52, 2, 0, Math.PI * 2); x.fill();
    
    const armStyles = { 'atk': '#7c2a1e', 'pain': '#7c2a1e' };
    x.strokeStyle = armStyles[pose] || '#6e2418'; x.lineWidth = 4;
    
    if (pose === 'atk') {
      x.beginPath(); 
      x.moveTo(cx - 9, 34); 
      x.lineTo(cx - 17, 20); 
      x.stroke();
      
      x.beginPath(); 
      x.moveTo(cx + 9, 34); 
      x.lineTo(cx + 17, 20); 
      x.stroke();
      
      x.strokeStyle = '#e8d5b0'; x.lineWidth = 2;
      for (const s of [-1, 1]) {
        for (let i = -1; i <= 1; i++) {
          x.beginPath(); 
          x.moveTo(cx + s * 16, 20); 
          x.lineTo(cx + s * 16 + i * 3, 14); 
          x.stroke();
        }
      }
    } else if (pose === 'pain') {
      x.beginPath(); 
      x.moveTo(cx - 9, 36); 
      x.lineTo(cx - 17, 48); 
      x.stroke();
      
      x.beginPath(); 
      x.moveTo(cx + 9, 36); 
      x.lineTo(cx + 17, 48); 
      x.stroke();
    } else {
      x.beginPath(); 
      x.moveTo(cx - 9, 36); 
      x.lineTo(cx - 12 - b * 2, 48 - b * 2); 
      x.stroke();
      
      x.beginPath(); 
      x.moveTo(cx + 9, 36); 
      x.lineTo(cx + 12 - b * 2, 48 - b * 2); 
      x.stroke();
    }
    
    const upperColors = { 'idle': '#b04a30', 'pain': '#d07a5e' };
    x.fillStyle = upperColors[pose] || '#b04a30';
    x.beginPath(); 
    x.arc(cx, 22 + b * 0.5, 9, 0, Math.PI * 2); 
    x.fill();
    
    x.strokeStyle = '#e8d5b0'; x.lineWidth = 3;
    x.beginPath(); 
    x.moveTo(cx - 6, 16); 
    x.lineTo(cx - 11, 8); 
    x.stroke();
    
    x.beginPath(); 
    x.moveTo(cx + 6, 16); 
    x.lineTo(cx + 11, 8); 
    x.stroke();
    
    const eyeColors2 = { 'idle': '#ffd23f', 'pain': '#fff' };
    x.fillStyle = eyeColors2[pose] || '#ffd23f';
    x.beginPath(); 
    x.arc(cx - 4, 21, 2.2, 0, Math.PI * 2); 
    x.fill();
    
    x.beginPath(); 
    x.arc(cx + 4, 21, 2.2, 0, Math.PI * 2); 
    x.fill();
    
    x.fillStyle = pose === 'pain' ? '#fff' : '#ffde3a';
    x.fillRect(cx - 8, 20, 4, 2); 
    x.fillRect(cx + 4, 20, 4, 2);
    
    x.strokeStyle = '#e9dcc0'; x.lineWidth = 2;
    x.beginPath(); 
    x.moveTo(cx - 9, 17); 
    x.lineTo(cx - 14, 11); 
    x.stroke();
    
    x.beginPath(); 
    x.moveTo(cx + 9, 17); 
    x.lineTo(cx + 14, 11); 
    x.stroke();
    
    x.fillStyle = '#7c2a1e';
    x.fillRect(cx - 8, 58, 16, 8);
    
    for (let i = 0; i < 40; i++) {
      const tx = cx + Math.floor(Math.random() * 20) - 10;
      const ty = 35 + Math.floor(Math.random() * 20);
      if (tx >= cx - 14 && tx <= cx + 14) {
        x.fillStyle = 'rgba(0, 0, 0, 0.08)';
        x.fillRect(tx, ty, 1, 1);
      }
    }
    
    x.strokeStyle = 'rgba(0, 0, 0, 0.25)'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(cx - 10, 68); x.lineTo(cx + 10, 68); x.stroke();
    
    addNoise(x, 40);
  });
}

function drawPinky(pose) {
  return makeCanvas(TEX, TEX, x => {
    const cx = 32;
    
    if (pose === 'corpse') {
      x.fillStyle = 'rgba(180, 45, 65, 0.98)';
      x.beginPath(); x.ellipse(cx, 62, 26, 8, 0, 0, Math.PI * 2); x.fill();
      
      x.fillStyle = 'rgba(150, 30, 50, 0.95)';
      x.beginPath(); x.ellipse(cx - 4, 58, 17, 6, 0, 0, Math.PI * 2); x.fill();
      
      x.fillStyle = 'rgba(200, 70, 90, 0.95)';
      x.beginPath(); x.ellipse(cx + 9, 55, 15, 6, 0, 0, Math.PI * 2); x.fill();
      
      x.fillStyle = 'rgba(0, 0, 0, 0.85)';
      x.beginPath(); x.arc(cx + 13, 48, 6, 0, Math.PI * 2); x.fill();
      
      for (let i = 0; i < 8; i++) {
        const bx = cx - 10 + Math.floor(Math.random() * 24);
        const by = 58 + Math.floor(Math.random() * 10);
        const size = Math.floor(Math.random() * 3) + 1;
        x.fillStyle = `rgba(200, ${20 + Math.random()*40}, 50, ${0.6 + Math.random()*0.4})`;
        x.fillRect(bx, by, size, Math.max(1, size - 1));
      }
      
      for (let i = 0; i < 3; i++) {
        const dx = cx - 6 + i * 8;
        x.fillStyle = 'rgba(150, 25, 45, 0.8)';
        for (let j = 0; j < 5; j++) {
          if (dx >= cx - 12 && dx <= cx + 16) {
            x.fillRect(dx, 70 + j * 3, 2, Math.max(1, 2 - j/3));
          }
        }
      }
      
      return;
    }
    
    const b = pose === 'b' ? 1 : 0;
    x.strokeStyle = '#8a2438'; x.lineWidth = 6; x.lineCap = 'round';
    x.beginPath(); 
    x.moveTo(cx - 7, 44 + b); 
    x.lineTo(cx - 9 + b * 3, 60 - b * 2); 
    x.stroke();
    
    x.beginPath(); 
    x.moveTo(cx + 7, 44 + b); 
    x.lineTo(cx + 9 - b * 3, 60 - b * 2); 
    x.stroke();
    
    const headColors = { 'idle': '#c43a5c', 'atk': '#d44a6c', 'pain': '#e45a7c' };
    x.fillStyle = headColors[pose] || '#c43a5c';
    x.beginPath(); 
    x.ellipse(cx, 38 + b * 0.5, 11, 14, 0, 0, Math.PI * 2); 
    x.fill();
    
    x.fillStyle = 'rgba(100, 25, 40, 0.3)';
    x.beginPath(); x.ellipse(cx + 4, 42, 7, 9, 0, 0, Math.PI * 2); 
    x.fill();
    
    x.strokeStyle = '#8a2438'; x.lineWidth = 4;
    x.beginPath(); 
    x.moveTo(cx + 9, 46); 
    x.quadraticCurveTo(cx + 17, 50, cx + 14, 58); 
    x.stroke();
    x.fillStyle = 'rgba(60, 10, 20, 0.3)';
    x.beginPath(); x.arc(cx + 14, 54, 2.5, 0, Math.PI * 2); x.fill();
    
    const armColors = { 'atk': '#8a2438', 'pain': '#8a2438' };
    x.strokeStyle = armColors[pose] || '#aa3555'; x.lineWidth = 5;
    
    if (pose === 'atk') {
      x.beginPath(); 
      x.moveTo(cx - 10, 34); 
      x.lineTo(cx - 20, 20); 
      x.stroke();
      
      x.beginPath(); 
      x.moveTo(cx + 10, 34); 
      x.lineTo(cx + 20, 20); 
      x.stroke();
      
      x.strokeStyle = 'rgba(255, 200, 220, 0.4)'; x.lineWidth = 1.5;
      for (const s of [-1, 1]) {
        for (let i = -1; i <= 1; i++) {
          x.beginPath(); 
          x.moveTo(cx + s * 17, 20); 
          x.lineTo(cx + s * 17 + i * 4, 14); 
          x.stroke();
        }
      }
    } else if (pose === 'pain') {
      x.beginPath(); 
      x.moveTo(cx - 10, 36); 
      x.lineTo(cx - 20, 50); 
      x.stroke();
      
      x.beginPath(); 
      x.moveTo(cx + 10, 36); 
      x.lineTo(cx + 20, 50); 
      x.stroke();
    } else {
      x.beginPath(); 
      x.moveTo(cx - 10, 36); 
      x.lineTo(cx - 13 - b * 2, 48 - b * 2); 
      x.stroke();
      
      x.beginPath(); 
      x.moveTo(cx + 10, 36); 
      x.lineTo(cx + 13 - b * 2, 48 - b * 2); 
      x.stroke();
    }
    
    const upperColors = { 'idle': '#d45a7c', 'pain': '#f06a8e' };
    x.fillStyle = upperColors[pose] || '#d45a7c';
    x.beginPath(); 
    x.arc(cx, 22 + b * 0.5, 10, 0, Math.PI * 2); 
    x.fill();
    
    x.strokeStyle = '#e9dccb'; x.lineWidth = 3;
    x.beginPath(); 
    x.moveTo(cx - 7, 17); 
    x.lineTo(cx - 12, 10); 
    x.stroke();
    
    x.beginPath(); 
    x.moveTo(cx + 7, 17); 
    x.lineTo(cx + 12, 10); 
    x.stroke();
    
    const eyeColors2 = { 'idle': '#fff8d0', 'pain': '#ffffe0' };
    x.fillStyle = eyeColors2[pose] || '#fff8d0';
    x.beginPath(); 
    x.arc(cx - 5, 21, 2.4, 0, Math.PI * 2); 
    x.fill();
    
    x.beginPath(); 
    x.arc(cx + 5, 21, 2.4, 0, Math.PI * 2); 
    x.fill();
    
    x.fillStyle = '#fff';
    x.beginPath(); x.arc(cx - 6, 20, 1, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.arc(cx + 6, 20, 1, 0, Math.PI * 2); x.fill();
    
    x.strokeStyle = pose === 'pain' ? '#fff' : '#ffde3a'; x.lineWidth = 2;
    x.fillRect(cx - 9, 20, 4, 2); 
    x.fillRect(cx + 4, 20, 4, 2);
    
    x.strokeStyle = '#e9dcc0'; x.lineWidth = 2.5;
    x.beginPath(); 
    x.moveTo(cx - 10, 17); 
    x.lineTo(cx - 15, 11); 
    x.stroke();
    
    x.beginPath(); 
    x.moveTo(cx + 10, 17); 
    x.lineTo(cx + 15, 11); 
    x.stroke();
    
    x.fillStyle = '#8a2438';
    x.fillRect(cx - 9, 58, 18, 9);
    
    for (let i = 0; i < 15; i++) {
      const tx = cx + Math.floor(Math.random() * 24) - 12;
      const ty = 38 + Math.floor(Math.random() * 24);
      if (tx >= cx - 16 && tx <= cx + 16 && ty < 58) {
        const size = Math.random() < 0.7 ? 1 : 2;
        x.fillStyle = 'rgba(180, 45, 65, 0.35)';
        x.fillRect(tx, ty, size, Math.max(1, size - 0.5));
      }
    }
    
    x.strokeStyle = 'rgba(0, 0, 0, 0.28)'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(cx - 12, 70); x.lineTo(cx + 12, 70); x.stroke();
    
    addNoise(x, 45);
  });
}

function drawCaco(pose) {
  return makeCanvas(TEX, TEX, x => {
    const cx = 32;
    if (pose === 'corpse') {   // boule crevée au sol
      x.fillStyle = 'rgba(90,8,8,.9)'; x.beginPath(); x.ellipse(cx, 58, 25, 5, 0, 0, 7); x.fill();
      x.fillStyle = '#8e221c'; x.beginPath(); x.ellipse(cx, 53, 19, 8, 0, Math.PI, 0); x.fill();
      x.fillStyle = '#5a1410'; x.fillRect(cx - 19, 53, 38, 3);
      x.fillStyle = '#e8dcc0'; x.fillRect(cx - 12, 47, 3, 4); x.fillRect(cx + 9, 47, 3, 4);
      x.fillStyle = '#3f8f3f'; x.beginPath(); x.arc(cx + 3, 50, 3, 0, 7); x.fill();
      return;
    }
    const b = pose === 'b' ? 1.5 : 0, cy = 31 + b, pain = pose === 'pain', atk = pose === 'atk';
    x.fillStyle = '#e8dcc0';   // cornes
    x.beginPath(); x.moveTo(cx - 13, cy - 15); x.lineTo(cx - 21, cy - 26); x.lineTo(cx - 7, cy - 18); x.fill();
    x.beginPath(); x.moveTo(cx + 13, cy - 15); x.lineTo(cx + 21, cy - 26); x.lineTo(cx + 7, cy - 18); x.fill();
    const g = x.createRadialGradient(cx - 7, cy - 8, 3, cx, cy, 22);
    g.addColorStop(0, pain ? '#ffb0a0' : '#f06a5a'); g.addColorStop(1, pain ? '#c84a3c' : '#8e1e18');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, 21, 0, 7); x.fill();
    x.fillStyle = 'rgba(0,0,0,.18)';   // bosses de la peau
    for (const [px, py] of [[-12, 8], [13, 4], [-6, 15], [9, 14], [15, -8]]) { x.beginPath(); x.arc(cx + px, cy + py, 2.5, 0, 7); x.fill(); }
    if (pain) { x.strokeStyle = '#300'; x.lineWidth = 2; x.beginPath(); x.moveTo(cx - 6, cy - 6); x.lineTo(cx + 6, cy - 6); x.stroke(); }
    else {
      x.fillStyle = '#f4f0dc'; x.beginPath(); x.arc(cx, cy - 6, 7.5, 0, 7); x.fill();
      x.fillStyle = '#3fbf3f'; x.beginPath(); x.arc(cx, cy - 6, 4.5, 0, 7); x.fill();
      x.fillStyle = '#000'; x.beginPath(); x.arc(cx, cy - 6, 2, 0, 7); x.fill();
    }
    const open = atk ? 10 : 3;
    x.fillStyle = '#3a0606'; x.beginPath(); x.ellipse(cx, cy + 9, 12, open, 0, 0, 7); x.fill();
    x.fillStyle = '#f2ead0';
    for (let i = -4; i <= 4; i++) { x.fillRect(cx + i * 2.6 - 0.6, cy + 9 - open, 1.4, 3); x.fillRect(cx + i * 2.6 - 0.6, cy + 7 + open, 1.4, 3); }
  });
}

function drawSoldier(pose) {
  return makeCanvas(TEX, TEX, x => {
    const cx = 32;
    if (pose === 'corpse') {   // allongé au sol
      x.fillStyle = 'rgba(110,10,10,.9)'; x.beginPath(); x.ellipse(cx, 58, 24, 5, 0, 0, 7); x.fill();
      x.fillStyle = '#4e5a42'; x.fillRect(cx - 16, 51, 26, 7);
      x.fillStyle = '#2e2a24'; x.fillRect(cx + 10, 53, 10, 4);
      x.fillStyle = '#c9b39a'; x.beginPath(); x.arc(cx - 19, 54, 4, 0, 7); x.fill();
      x.fillStyle = '#222'; x.fillRect(cx - 6, 49, 16, 2);
      return;
    }
    const b = pose === 'b' ? 1 : 0, pain = pose === 'pain', atk = pose === 'atk';
    const tenue = pain ? '#7d8b6c' : '#5a6848', peau = pain ? '#e8c8b0' : '#c9b39a';
    x.fillStyle = '#2e2a24';   // jambes et bottes
    x.fillRect(cx - 7 + b * 2, 42, 5, 17 - b * 2); x.fillRect(cx + 2 - b * 2, 42, 5, 17 - b * 2);
    x.fillStyle = '#15130f'; x.fillRect(cx - 8 + b * 2, 58 - b * 2, 7, 3); x.fillRect(cx + 1 - b * 2, 58 - b * 2, 7, 3);
    x.fillStyle = tenue; x.fillRect(cx - 9, 22, 18, 21);   // torse
    x.fillStyle = 'rgba(0,0,0,.2)'; x.fillRect(cx + 3, 22, 6, 21);
    x.fillStyle = '#3a2a18'; x.fillRect(cx - 9, 37, 18, 3);   // ceinture
    x.fillStyle = tenue; x.fillRect(cx - 13, 23, 5, 14); x.fillRect(cx + 8, 23, 5, 14);   // bras
    x.fillStyle = '#26282c'; x.fillRect(cx - 3, 30, 6, 12); x.fillRect(cx - 2, 26, 4, 6);   // fusil tenu vers l'avant
    x.fillStyle = '#4a3420'; x.fillRect(cx - 4, 39, 8, 4);
    if (atk) {
      x.fillStyle = '#ffe070'; x.beginPath();
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, r = i % 2 ? 3 : 7; x.lineTo(cx + Math.cos(a) * r, 25 + Math.sin(a) * r); }
      x.fill();
    }
    x.fillStyle = peau; x.beginPath(); x.arc(cx, 15, 6.5, 0, 7); x.fill();   // tête
    x.fillStyle = '#3c3a30'; x.beginPath(); x.arc(cx, 13, 7, Math.PI, 0); x.fill();   // casque
    x.fillStyle = pain ? '#fff' : '#511'; x.fillRect(cx - 4, 15, 2, 2); x.fillRect(cx + 2, 15, 2, 2);
    x.fillStyle = '#6a2a1a'; x.fillRect(cx - 2, 19, 4, 1);
  });
}

function drawLostSoul(pose) {
  return makeCanvas(TEX, TEX, x => {
    const cx = 32;
    if (pose === 'corpse') {   // crâne éteint au sol, un filet de fumée
      x.fillStyle = 'rgba(60,60,60,.5)'; x.beginPath(); x.ellipse(cx, 52, 6, 10, 0, 0, 7); x.fill();
      x.fillStyle = '#d8d4c4'; x.beginPath(); x.arc(cx, 57, 6, Math.PI, 0); x.fill(); x.fillRect(cx - 6, 57, 12, 3);
      x.fillStyle = '#222'; x.fillRect(cx - 4, 55, 3, 3); x.fillRect(cx + 1, 55, 3, 3);
      return;
    }
    const pain = pose === 'pain', atk = pose === 'atk', b = pose === 'b' ? 1 : 0, cy = 30;
    const big = atk ? 1.35 : 1;
    const flammes = [['#ff4a10', 16], ['#ff9a20', 12], ['#ffe060', 8]];
    for (const [c, r] of flammes) {   // flammes autour du crâne
      x.fillStyle = c; x.beginPath();
      for (let i = 0; i < 14; i++) {
        const a = i / 14 * Math.PI * 2, rr = (i % 2 ? r * 0.7 : r * 1.15) * big + (i + b) % 3;
        x.lineTo(cx + Math.cos(a) * rr * 0.9, cy - 3 + Math.sin(a) * rr - (Math.sin(a) < 0 ? 3 : 0));
      }
      x.fill();
    }
    x.fillStyle = pain ? '#ffffff' : '#e8e4d4'; x.beginPath(); x.arc(cx, cy - 2, 8, 0, 7); x.fill();   // crâne
    x.fillRect(cx - 5, cy + 3, 10, 4);
    x.fillStyle = '#1a0a0a';
    x.beginPath(); x.arc(cx - 3.5, cy - 3, 2.4, 0, 7); x.fill(); x.beginPath(); x.arc(cx + 3.5, cy - 3, 2.4, 0, 7); x.fill();
    x.fillRect(cx - 1, cy + 1, 2, 2);
    const jaw = atk ? 5 : 1;
    x.fillStyle = '#e8e4d4'; x.fillRect(cx - 5, cy + 7 + jaw, 10, 3);
    x.fillStyle = '#1a0a0a'; for (let i = -2; i <= 2; i++) x.fillRect(cx + i * 2 - 0.5, cy + 3, 1, 4);
  });
}

function drawBaron(pose) {
  return makeCanvas(TEX, TEX, x => {
    const cx = 32;
    if (pose === 'corpse') {   // grand corps effondré
      x.fillStyle = 'rgba(100,10,10,.9)'; x.beginPath(); x.ellipse(cx, 58, 28, 6, 0, 0, 7); x.fill();
      x.fillStyle = '#c99478'; x.beginPath(); x.ellipse(cx - 2, 53, 20, 7, 0, 0, 7); x.fill();
      x.fillStyle = '#6a4428'; x.fillRect(cx + 12, 52, 12, 5);
      x.fillStyle = '#e8dcc0'; x.fillRect(cx - 22, 47, 2, 6);
      return;
    }
    const b = pose === 'b' ? 1 : 0, pain = pose === 'pain', atk = pose === 'atk';
    const peau = pain ? '#f0c0a8' : '#d9a58a', ombre = '#a8705a';
    x.fillStyle = '#6a4428';   // pattes de bouc
    x.fillRect(cx - 10 + b * 2, 40, 8, 14); x.fillRect(cx + 2 - b * 2, 40, 8, 14);
    x.fillStyle = '#4a2c18'; x.fillRect(cx - 9 + b * 2, 53, 6, 7 - b); x.fillRect(cx + 3 - b * 2, 53, 6, 7 - b);
    x.fillStyle = '#1a1008'; x.fillRect(cx - 10 + b * 2, 60 - b, 8, 3); x.fillRect(cx + 2 - b * 2, 60 - b, 8, 3);
    x.fillStyle = peau; x.beginPath(); x.ellipse(cx, 29, 14, 14, 0, 0, 7); x.fill();   // torse massif
    x.fillStyle = 'rgba(0,0,0,.15)'; x.beginPath(); x.ellipse(cx + 5, 31, 7, 11, 0, 0, 7); x.fill();
    x.strokeStyle = ombre; x.lineWidth = 1; x.beginPath(); x.moveTo(cx, 20); x.lineTo(cx, 38); x.stroke();
    x.fillStyle = peau;   // bras
    if (atk) {
      x.fillRect(cx + 11, 6, 6, 20);
      x.fillStyle = '#40ff60'; x.beginPath(); x.arc(cx + 14, 6, 6, 0, 7); x.fill();
      x.fillStyle = '#c0ffc8'; x.beginPath(); x.arc(cx + 14, 6, 3, 0, 7); x.fill();
      x.fillStyle = peau; x.fillRect(cx - 17, 22, 6, 18);
    } else {
      x.fillRect(cx - 17, 22, 6, pain ? 14 : 19); x.fillRect(cx + 11, 22, 6, pain ? 14 : 19);
    }
    x.fillStyle = peau; x.beginPath(); x.arc(cx, 12, 7, 0, 7); x.fill();   // tête
    x.fillStyle = '#e8dcc0';   // cornes
    x.beginPath(); x.moveTo(cx - 5, 7); x.lineTo(cx - 13, 0); x.lineTo(cx - 3, 5); x.fill();
    x.beginPath(); x.moveTo(cx + 5, 7); x.lineTo(cx + 13, 0); x.lineTo(cx + 3, 5); x.fill();
    x.fillStyle = pain ? '#fff' : '#ff3010'; x.fillRect(cx - 4, 11, 3, 2); x.fillRect(cx + 1, 11, 3, 2);
    x.fillStyle = '#3a0a0a'; x.fillRect(cx - 3, 15, 6, atk ? 3 : 1);
  });
}

function drawSporeling(pose) {
  return makeCanvas(TEX, TEX, x => {
    const cx = 32;

    if (pose === 'corpse') {
      // Corps étendu au sol - silhouette basse et large aplatie
      x.fillStyle = '#4d8a1e'; 
      x.beginPath(); x.ellipse(cx, 56, 28, 7, 0, 0, 7); x.fill();

      // Taches sur le cadavre (pustules)
      x.fillStyle = '#cdd93b';
      for(let i=0; i<12; i++) {
        let px = cx - 24 + (i*4.5), py = 56 + rand(4);
        if(px < cx-25 || px > cx+25) continue;
        x.beginPath(); x.arc(px, py, 1.8, 0, 7); x.fill();
      }

      // Bouche ouverte et bave séchée (étalée sur le sol)
      x.fillStyle = '#3a0d0d'; 
      x.beginPath(); x.ellipse(cx + 20, 56, 4, 2.5, 0, 0, 7); x.fill();

      // Yeux morts (orbes rouges éteints)
      x.fillStyle = '#ff2b1f';
      x.fillRect(cx - 8, 53, 3, 3); 
      x.fillRect(cx + 6, 54, 3, 3);

      return;
    }

    const b = pose === 'b' ? 1 : 0;
    const pain = pose === 'pain';
    const atk = pose === 'atk';
    
    // Couleurs de base (plus claires pour la douleur)
    const corpsColor = pain ? '#7bc43a' : '#5da628'; 
    const tacheColor = pain ? '#eaf96b' : '#dce04f'; 
    const boucheColor = '#1c0808'; 
    const baveColor = 'rgba(180, 230, 70, 0.8)';
    
    // Corps charnu (basse et large) - forme plus organique avec des lobes
    let bodyY = pain ? 47 : atk ? 49 : 50; 
    let bodyH = pain ? 13 : atk ? 12 : 15; 
    
    // Filaments racinaires (arrière-plan/attachement au sol) - plus visibles et variés selon la pose
    x.strokeStyle = pain ? '#4a6b25' : '#3c591d'; 
    x.lineWidth = atk ? 2 : 1.5;
    
    const filamentCount = atk ? 7 : 5; // Plus de filaments en attaque (s'accroche plus fort)
    for(let i=0; i<filamentCount; i++) {
      let rx = cx - 30 + (i * 12); 
      if(rx < 4 || rx > 60) continue; // Restreindre dans le canvas
      
      x.beginPath(); 
      // Racines qui s'étalent plus en cas d'attaque ou de douleur
      const spread = atk ? 5 : pain ? 3 : b*2;
      x.moveTo(cx, bodyY-4);
      x.quadraticCurveTo((cx+rx)/2 + rand(6)-3, 58 - b*4, rx, 61-b-spread/2);
      x.stroke();
    }

    // Corps charnu (basse et large) - forme plus organique avec des lobes
    x.fillStyle = corpsColor; 
    // Forme de base (ellipse large)
    x.beginPath(); x.ellipse(cx, bodyY, 30, bodyH, 0, 0, 7); x.fill();
    
    // Lobes charnus supplémentaires pour donner un aspect plus organique et massif
    if(atk || pain) {
      x.fillStyle = corpsColor; 
      x.beginPath(); x.ellipse(cx - 15, bodyY+2, 8, 6, 0, 0, 7); x.fill(); // Lobe gauche
      x.beginPath(); x.ellipse(cx + 15, bodyY+2, 8, 6, 0, 0, 7); x.fill(); // Lobe droit
    } else {
      x.fillStyle = corpsColor; 
      x.beginPath(); x.ellipse(cx - 18, bodyY+3, 6, 5, 0, 0, 7); x.fill(); // Lobe gauche (repos)
      x.beginPath(); x.ellipse(cx + 18, bodyY+3, 6, 5, 0, 0, 7); x.fill(); // Lobe droit (repos)
    }

    // Taches pustuleuses jaunes - plus nombreuses et variées en taille
    x.fillStyle = tacheColor;
    for(let i=0; i<18; i++) { 
      let px = cx - 26 + (i*3.5), py = bodyY - 9 + rand(18);
      if(px < 5 || px > 59 || py < 34 || py > 60) continue; 

      // Ne pas dessiner de taches qui chevaucheraient le centre (bouche/yeux)
      let distToCenter = Math.abs(px - cx); 
      if(distToCenter < 12 && i % 2 === 0) continue; 

      x.beginPath(); x.arc(px, py, rand(3)+1.5, 0, 7); x.fill(); 
    }

    // Yeux (orbes rouges lumineux incrustés dans la chair) - plus grands et expressifs
    let eyeY = bodyY - 9 + b*2; 
    
    if(atk) {
      // Regard menaçant/large pour l'attaque, yeux plus petits mais intenses
      x.fillStyle = '#ff1a0d'; 
      x.beginPath(); x.arc(cx-16, eyeY+4, 5.5, 0, 7); x.fill(); 
      x.beginPath(); x.arc(cx+16, eyeY+4, 5.5, 0, 7); x.fill();
      
      // Halo lumineux (glow) plus intense en attaque
      x.fillStyle = 'rgba(255, 30, 20, .9)'; 
      x.beginPath(); x.arc(cx-16, eyeY+4, 3.8, 0, 7); x.fill(); 
      x.beginPath(); x.arc(cx+16, eyeY+4, 3.8, 0, 7); x.fill();
      
    } else {
      // Regard standard (légèrement décalé pour la pose b) - yeux plus ronds et ouverts
      let eOff = b ? -2 : 2; 
      x.fillStyle = '#ff1a0d'; 
      x.beginPath(); x.arc(cx-18+eOff, eyeY, 5.5, 0, 7); x.fill(); 
      x.beginPath(); x.arc(cx+18-eOff, eyeY, 5.5, 0, 7); x.fill();
      
      // Halo lumineux (glow) standard
      x.fillStyle = 'rgba(255, 60, 40, .9)'; 
      x.beginPath(); x.arc(cx-18+eOff, eyeY, 3.8, 0, 7); x.fill(); 
      x.beginPath(); x.arc(cx+18-eOff, eyeY, 3.8, 0, 7); x.fill();
    }

    // Bouche centrale béante (émet de la bave) - plus grande et expressive selon l'état
    let mouthH = pain ? 9 : atk ? 10 : 8; 
    let mouthW = pain ? 6.5 : atk ? 7 : 5.5; 
    
    x.fillStyle = boucheColor; 
    // Forme ovale pour l'ouverture de la gueule
    x.beginPath(); x.ellipse(cx, bodyY + 4 - b*2, mouthW, mouthH/1.8, 0, 0, 7); x.fill();

    // Bave visqueuse (dégoulinante) - plus complexe et variée selon l'état
    if(!pain && !atk) { 
      let dropLen = rand(6)+4; 
      x.fillStyle = baveColor; 
      
      // Goutte principale au centre de la bouche + gouttes secondaires sur les côtés
      x.beginPath(); 
      x.moveTo(cx-2, bodyY+4-b*2); 
      x.quadraticCurveTo(cx-1.5, bodyY+9-dropLen/2, cx, 60+b*4); 
      x.quadraticCurveTo(cx+1.5, bodyY+9-dropLen/2, cx+2, bodyY+4-b*2);
      x.fill();
      
      // Gouttes secondaires sur les côtés de la bouche (plus naturelles)
      if(b === 0 || rand(3)>1) { 
        let sideDrop = rand(4)+3;
        x.beginPath(); 
        x.moveTo(cx-6, bodyY+5-b*2); 
        x.quadraticCurveTo(cx-7, bodyY+8-sideDrop/2, cx-8, 59+b*3); 
        x.fill();
      }
      
    } else if(atk) {
      // Bave projetée en avant lors de l'attaque (plus large et plus longue) + jets latéraux
      let projLen = 16; 
      x.fillStyle = baveColor; 
      x.beginPath(); 
      x.moveTo(cx-4, bodyY+4-b*2); 
      x.lineTo(cx-7, 60+b*4); 
      x.quadraticCurveTo(cx, 63+b*4, cx+7, 60+b*4);
      x.lineTo(cx+4, bodyY+4-b*2);
      x.fill();
      
    } else if(pain) {
      // Bave en douleur : gouttes plus nombreuses et irrégulières (monstre souffre)
      let painDrops = 3; 
      for(let i=0; i<painDrops; i++) {
        let dropX = cx - 4 + rand(8); 
        let dropLen = rand(5)+2; 
        x.fillStyle = baveColor; 
        x.beginPath(); 
        x.moveTo(dropX-1, bodyY+3-b*2); 
        x.quadraticCurveTo(dropX-0.5, bodyY+7-dropLen/2, dropX, 60+b*4); 
        x.fill();
      }
    }

  });
}

function drawVulture(pose) {
  return makeCanvas(TEX, TEX, x => {
    const cx = 32;
    
    if (pose === 'corpse') {
      // Corps étendu au sol - silhouette basse et large aplatie, ailes repliées en croix
      x.fillStyle = '#1a0d14'; 
      x.beginPath(); x.ellipse(cx, 56, 32, 8, 0, 0, 7); x.fill();

      // Ailes calcinées étalées sur le sol (formes irrégulières)
      x.fillStyle = '#2b1a24'; 
      for(let i=0; i<6; i++) {
        let ax = cx - 35 + rand(70); 
        if(ax < 8 || ax > 56) continue;
        x.beginPath(); x.ellipse(ax, 54+rand(4), rand(12)+6, rand(3)+1, rand(3)-1.5, 0, 7); x.fill();
      }

      // Crâne osseux (yeux rouges éteints)
      x.fillStyle = '#8a9bae'; 
      x.beginPath(); x.arc(cx + 24, 56, 5, 0, 7); x.fill();
      
      x.fillStyle = '#ff1a0d';
      x.fillRect(cx+22, 54, 3, 3); 
      x.fillRect(cx+28, 54, 3, 3);

      // Fumée acide résiduelle au sol (serres)
      x.fillStyle = 'rgba(100, 255, 60, 0.4)'; 
      for(let i=0; i<8; i++) {
        let sx = cx - 30 + rand(60); 
        if(sx < 10 || sx > 54) continue;
        x.beginPath(); x.arc(sx, 57+rand(2), rand(4)+2, 0, 7); x.fill();
      }

      return;
    }

    const b = pose === 'b' ? 1 : 0;
    const pain = pose === 'pain';
    const atk = pose === 'atk';
    
    // Couleurs de base (plus claires pour la douleur)
    const corpsColor = pain ? '#4a352e' : '#1f1619'; 
    const aileColor  = pain ? '#5c4038' : '#2b1d22'; 
    // Le crâne reste osseux, mais peut être légèrement éclairci en douleur
    const craneColor = pain ? '#aebfd4' : '#7a9bbf'; 

    // Position du corps (vol stationnaire centré)
    let bodyY = atk ? 28 : pain ? 30 : 32; 
    let wingSpread = atk ? 1.15 : pain ? 0.85 : 1 + b * 0.1; // Les ailes s'ouvrent en attaque, se replient un peu en douleur

    // Fumée acide verte émanant des serres (sous le corps)
    if(!pain || atk) { 
      let smokeAlpha = pain ? 0.3 : atk ? 0.7 : 0.5;
      x.fillStyle = `rgba(80, 255, 60, ${smokeAlpha})`; 
      
      // Nappes de fumée en bas du sprite (sous les serres)
      let smokeBaseY = bodyY + 14;
      for(let i=0; i<3; i++) {
        let sy = smokeBaseY - rand(6); 
        x.beginPath(); 
        // Forme de goutte/flaque irrégulière
        x.moveTo(cx-8, sy); 
        x.quadraticCurveTo(cx+rand(12)-4, sy + 4, cx+10, bodyY + 20 - b*3); 
        x.quadraticCurveTo(cx+5, bodyY + 26, cx-2, bodyY + 22-b*2);
        x.fill();

        // Petites bulles de fumée
        let bubX = cx - 14 + rand(28);
        if(bubX > 5 && bubX < 59) {
           x.beginPath(); 
           x.arc(bubX, bodyY + 16 + rand(6), rand(3)+1.5, 0, 7); 
           x.fill();
        }
      }
    }

    // Ailes déployées (massives) - dessinées d'abord pour être derrière le corps central
    let wingY = bodyY + 4;
    
    // Aile gauche
    x.fillStyle = aileColor; 
    x.beginPath(); 
    // Forme de membrane osseuse/déchirée avec des pointes (plumes calcinées)
    x.moveTo(cx - 2, wingY);
    let leftWingTipX = cx - Math.floor(30 * wingSpread);
    
    if(atk) { 
        // Ailes tendues vers l'avant/bas en attaque
        x.lineTo(leftWingTipX + 4, bodyY + 12); 
        x.quadraticCurveTo(cx-8, bodyY+6, cx - 3, wingY);
    } else if(pain) {
        // Ailes affaissées (repliées plus près du corps)
        x.lineTo(leftWingTipX + 5, bodyY + 10); 
        x.quadraticCurveTo(cx-6, bodyY+4, cx - 3, wingY);
    } else {
        // Ailes déployées en vol stationnaire (large et légèrement ondulantes)
        let wave = b ? 2 : -2; 
        x.lineTo(leftWingTipX + rand(6), bodyY + 8 + wave); 
        x.quadraticCurveTo(cx-10, wingY+4-wave/2, cx - 3, wingY);
    }
    x.fill();

    // Plumes noires calcinées (pointes irrégulières sur le bord des ailes)
    x.fillStyle = corpsColor; 
    let featherCount = atk ? 8 : pain ? 5 : 6;
    for(let i=0; i<featherCount; i++) {
        // Plumes gauche (décalage progressif vers l'extérieur)
        let pxL = cx - 4 - (i * Math.floor(27*wingSpread/featherCount)); 
        if(pxL < leftWingTipX+3 || pxL > cx-5) continue; 
        
        // Plumes gauche
        x.beginPath(); 
        x.moveTo(pxL, wingY + rand(6)-1); 
        x.lineTo(pxL - 2, bodyY + 14 - b*rand(4)); 
        x.lineTo(pxL + 3, wingY + rand(8)+2); 
        x.fill();

        // Plumes droite (symétrie)
        let pxR = cx + 4 + (i * Math.floor(27*wingSpread/featherCount)); 
        if(pxR < cx+5 || pxR > leftWingTipX*-1 - 3) continue; 
        
        x.beginPath(); 
        x.moveTo(pxR, wingY + rand(6)-1); 
        x.lineTo(pxR + 2, bodyY + 14 - b*rand(4)); 
        x.lineTo(pxR - 3, wingY + rand(8)+2); 
        x.fill();
    }

    // Corps central (squelette massif)
    x.fillStyle = corpsColor; 
    let bodyW = atk ? 16 : pain ? 14 : 15;
    let bodyH = atk ? 18 : pain ? 20 : 19;
    
    // Forme de base (ovale allongé)
    x.beginPath(); 
    x.ellipse(cx, bodyY + 6, bodyW/2, bodyH/2, 0, 0, 7); 
    x.fill();

    // Serres griffues émissant la fumée (sous le corps) - dessinées en dernier pour être au premier plan
    let clawColor = pain ? '#8a9bae' : '#5c6b7d'; 
    if(!pain || atk) { 
        x.fillStyle = clawColor; 
        
        // Serre gauche
        x.beginPath(); 
        x.moveTo(cx - 10, bodyY + 12); 
        let tipLX = cx - (atk ? 8 : 6); 
        let tipLY = bodyY + (atk ? 24 : 20) - b*3;
        
        // Forme de crochet/griffe osseuse
        x.lineTo(tipLX, tipLY); 
        x.quadraticCurveTo(cx-15, bodyY+8, cx-7, bodyY + 6);
        x.fill();

        // Serre droite (symétrie)
        let tipRX = cx + (atk ? 8 : 6); 
        x.beginPath(); 
        x.moveTo(cx + 10, bodyY + 12); 
        x.lineTo(tipRX, tipLY); 
        x.quadraticCurveTo(cx+15, bodyY+8, cx+7, bodyY + 6);
        x.fill();

        // Lignes de détail sur les serres (os)
        x.strokeStyle = pain ? '#cdd9e0' : '#aebfd4'; 
        x.lineWidth = 1.5;
        
        x.beginPath(); 
        x.moveTo(cx-8, bodyY+12); 
        x.lineTo(tipLX + rand(3)-1, tipLY - 2); 
        x.stroke();

        x.beginPath(); 
        x.moveTo(cx+8, bodyY+12); 
        x.lineTo(tipRX - rand(3)+1, tipLY - 2); 
        x.stroke();
    } else if(pain) {
        // Serres recroquevillées en douleur (moins visibles, plus hautes)
        let painTipLX = cx - 5; 
        let painTipRX = cx + 5; 
        let painTipY = bodyY + 16; 
        
        x.fillStyle = clawColor; 
        // Serre gauche recroquevillée
        x.beginPath(); 
        x.moveTo(cx-8, bodyY+10); 
        x.lineTo(painTipLX, painTipY - b*2); 
        x.quadraticCurveTo(cx-4, bodyY+6, cx-5, bodyY + 8);
        x.fill();

        // Serre droite recroquevillée
        x.beginPath(); 
        x.moveTo(cx+8, bodyY+10); 
        x.lineTo(painTipRX, painTipY - b*2); 
        x.quadraticCurveTo(cx+4, bodyY+6, cx+5, bodyY + 8);
        x.fill();

        // Lignes de détail sur les serres (os)
        x.strokeStyle = '#cdd9e0'; 
        x.lineWidth = 1.2;
        
        x.beginPath(); 
        x.moveTo(cx-6, bodyY+10); 
        x.lineTo(painTipLX + rand(2)-1, painTipY - b*3 - 1); 
        x.stroke();

        x.beginPath(); 
        x.moveTo(cx+6, bodyY+10); 
        x.lineTo(painTipRX + rand(2)+1, painTipY - b*3 - 1); 
        x.stroke();
    }

    // Crâne osseux (au-dessus du corps)
    let craneY = bodyY - 6; 
    
    if(atk) {
      // Tête inclinée vers le bas en attaque, bec ouvert
      x.fillStyle = craneColor; 
      
      // Forme de crâne avec un grand bec osseux pointant vers l'avant/bas
      let beakTipX = cx + 12; 
      let beakTipY = bodyY - 4; 
      
      x.beginPath(); 
      x.moveTo(cx-6, craneY); // Arrière du crâne (gauche)
      x.lineTo(beakTipX, beakTipY); // Pointe du bec
      x.quadraticCurveTo(cx+2, bodyY + 10, cx - 4, bodyY + 8); // Mandibule inférieure ouverte
      x.fill();

      // Yeux rouges pulsants (intenses en attaque)
      let eyeGlowAlpha = atk ? 0.9 : pain ? 0.5 : 0.7; 
      x.fillStyle = `rgba(255, 30, 10, ${eyeGlowAlpha})`; 
      
      // Yeux gauche (plus grand en attaque)
      let eyeSizeL = atk ? 4.5 : pain ? 3.5 : 4; 
      x.beginPath(); x.arc(cx-2, craneY+3, eyeSizeL/1.8, 0, 7); x.fill(); 

      // Yeux droit (plus grand en attaque)
      let eyeSizeR = atk ? 4.5 : pain ? 3.5 : 4; 
      x.beginPath(); x.arc(cx+6, craneY+2, eyeSizeR/1.8, 0, 7); x.fill(); 

    } else if(pain) {
      // Tête recroquevillée en douleur (yeux fermés ou éteints)
      x.fillStyle = craneColor; 
      
      let beakTipX = cx + 9; 
      let beakTipY = bodyY - 2; 
      
      x.beginPath(); 
      x.moveTo(cx-5, craneY+1); // Arrière du crâne (gauche)
      x.lineTo(beakTipX, beakTipY); // Pointe du bec (fermée/repliée)
      x.quadraticCurveTo(cx+2, bodyY + 6, cx - 3, bodyY + 5); 
      x.fill();

      // Yeux rouges éteints/diminués en douleur
      let eyeGlowAlpha = pain ? 0.4 : atk ? 0.9 : 0.7; 
      x.fillStyle = `rgba(255, 30, 10, ${eyeGlowAlpha})`; 
      
      // Yeux gauche (plus petits en douleur)
      let eyeSizeL = pain ? 3.5 : atk ? 4.5 : 4; 
      x.beginPath(); x.arc(cx-2, craneY+4, eyeSizeL/1.8, 0, 7); x.fill(); 

      // Yeux droit (plus petits en douleur)
      let eyeSizeR = pain ? 3.5 : atk ? 4.5 : 4; 
      x.beginPath(); x.arc(cx+6, craneY+3, eyeSizeR/1.8, 0, 7); x.fill(); 

    } else {
      // Tête standard en vol stationnaire (a/b)
      let beakTipX = cx + 14; 
      let beakTipY = bodyY - 2 + b*2; 
      
      x.fillStyle = craneColor; 
      x.beginPath(); 
      x.moveTo(cx-7, craneY); // Arrière du crâne (gauche)
      x.lineTo(beakTipX, beakTipY); // Pointe du bec
      x.quadraticCurveTo(cx+2, bodyY + 8 - b*3, cx - 5, bodyY + 6 - b*2); 
      x.fill();

      // Yeux rouges pulsants (standard)
      let eyeGlowAlpha = pain ? 0.5 : atk ? 0.9 : 0.7; 
      x.fillStyle = `rgba(255, 30, 10, ${eyeGlowAlpha})`; 
      
      // Yeux gauche (standard)
      let eyeSizeL = atk ? 4.5 : pain ? 3.5 : 4; 
      x.beginPath(); x.arc(cx-3, craneY+2 + b*rand(2), eyeSizeL/1.8, 0, 7); x.fill(); 

      // Yeux droit (standard)
      let eyeSizeR = atk ? 4.5 : pain ? 3.5 : 4; 
      x.beginPath(); x.arc(cx+6, craneY+2 + b*rand(2), eyeSizeR/1.8, 0, 7); x.fill(); 

    }

  });
}

/* textures des 5 poses d'un ennemi : les 5 images ComfyUI si elles existent toutes, sinon sa fonction de dessin */
function enregistrerPoses(type, dessin) {
  const ia = ['A', 'B', 'Atk', 'Pain', 'Corpse'].map(k => imageIA(type + k));
  for (const p of ['a', 'b', 'atk', 'pain', 'corpse']) {
    const k = p === 'atk' ? 'Atk' : p === 'pain' ? 'Pain' : p === 'corpse' ? 'Corpse' : p.toUpperCase();
    TX[type + k] = ia.every(Boolean) ? ia[['a', 'b', 'atk', 'pain', 'corpse'].indexOf(p)] : texFromCanvas(dessin(p), true);
  }
}

/* enregistre les monstres créés par le modèle (dessin absent ou en erreur : ignoré, les tests le signalent) */
function buildMonstresGeneres() {
  for (const [type, nomDessin] of MONSTRES_GENERES) {
    const dessin = window[nomDessin];
    if (typeof dessin !== 'function' && !imageIA(type + 'A')) continue;   // monstre sans dessin : images ComfyUI seules
    try { enregistrerPoses(type, dessin); } catch (e) { console.error('dessin de ' + type, e); }
  }
}

function buildObjects() {
  enregistrerPoses('imp', drawImp);
  enregistrerPoses('pinky', drawPinky);
  
  TX.fireball = texFromCanvas(makeCanvas(32, 32, x => {
    const g = x.createRadialGradient(16, 16, 1, 16, 16, 15);
    g.addColorStop(0, '#fff'); g.addColorStop(0.35, '#ffd060'); 
    g.addColorStop(0.7, '#ff6a10'); g.addColorStop(1, 'rgba(255,40,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  }), true);
  
  TX.puff = texFromCanvas(makeCanvas(32, 32, x => {
    for (let i = 0; i < 14; i++) {
      x.fillStyle = ['#ffb030', '#ff6010', '#ffe080', '#c03000'][i % 4];
      x.beginPath(); x.arc(16 + rand(-9, 9), 16 + rand(-9, 9), rand(3, 7), 0, 7); x.fill();
    }
  }), true);
  
  TX.medkit = texFromCanvas(makeCanvas(32, 32, x => {
    x.fillStyle = '#d8d8d0'; x.fillRect(3, 9, 26, 20);
    x.fillStyle = '#fff'; x.fillRect(3, 9, 26, 3);
    x.fillStyle = '#9a9a92'; x.fillRect(3, 27, 26, 2);
    x.fillStyle = '#d01818'; x.fillRect(13, 12, 6, 14); x.fillRect(9, 16, 14, 6);
  }), true);
  
  TX.ammo = texFromCanvas(makeCanvas(32, 32, x => {
    x.fillStyle = '#6a4a22'; x.fillRect(3, 14, 26, 15);
    x.fillStyle = '#8f6a35'; x.fillRect(3, 14, 26, 3);
    for (let i = 0; i < 4; i++) {
      x.fillStyle = '#c42020'; x.fillRect(6 + i * 6, 6, 4, 10);
      x.fillStyle = '#d9b658'; x.fillRect(6 + i * 6, 14, 4, 3);
    }
  }), true);
  
  TX.shotgun = texFromCanvas(makeCanvas(64, 24, x => {
    x.fillStyle = '#5a3a1c'; x.fillRect(2, 10, 18, 8); x.fillRect(16, 9, 8, 6);
    x.fillStyle = '#2a2c30'; x.fillRect(22, 8, 40, 3); x.fillRect(22, 12, 40, 2);
    x.fillStyle = '#6b4423'; x.fillRect(34, 13, 14, 5);
    x.fillStyle = '#55585e'; x.fillRect(22, 8, 40, 1);
  }), true);

  TX.armor = texFromCanvas(makeCanvas(32, 32, x => {   // gilet pare-balles vert, posé au sol
    x.fillStyle = '#1f5a2a';
    x.beginPath(); x.moveTo(7, 9); x.lineTo(12, 6); x.lineTo(20, 6); x.lineTo(25, 9);
    x.lineTo(26, 29); x.lineTo(6, 29); x.closePath(); x.fill();
    x.fillStyle = '#2f8a3e'; x.fillRect(9, 10, 6, 17); x.fillRect(17, 10, 6, 17);   // deux plaques
    x.fillStyle = '#58c26a'; x.fillRect(9, 10, 6, 2); x.fillRect(17, 10, 6, 2);     // reflets
    x.fillStyle = '#0e2a14'; x.fillRect(15, 8, 2, 21);                               // fermeture
    x.fillStyle = '#c8c8b0'; x.fillRect(10, 22, 4, 2); x.fillRect(18, 22, 4, 2);     // sangles
  }), true);
  buildMoreEnemies();
  buildMoreObjects();
  buildKeyTextures();
  buildDecor();
  buildMonstresGeneres();
  buildPowerups();
  appliquerObjetsIA();
}

/* Objets au sol dessinés par ComfyUI quand ils existent : l'image ne remplace le dessin procédural que si elle
   a EXACTEMENT sa taille (32×32, fusil 64×24) et un fond transparent ; sinon le dessin reste. */
const OBJETS_IA = ['medkit', 'ammo', 'armor', 'shotgun', 'bullets', 'rockets', 'berserk', 'backpack',
  'keyRed', 'keyBlue', 'keyYellow'];
function appliquerObjetsIA() {
  for (const n of OBJETS_IA) {
    const t = imageIA(n), dessin = TX[n];
    if (t && dessin && entreeImage(n).tr && t.w === dessin.w && t.h === dessin.h) TX[n] = t;
  }
  appliquerImagesFreedoom();   // Freedoom reste prioritaire même quand un dessin est refait en cours de route
}

function buildPowerups() {
  TX.berserk = texFromCanvas(makeCanvas(32, 32, x => {   // trousse noire à croix rouge
    x.fillStyle = '#111'; x.fillRect(4, 10, 24, 20);
    x.fillStyle = '#333'; x.fillRect(4, 10, 24, 3); x.fillRect(12, 6, 8, 4);
    x.fillStyle = '#d01010'; x.fillRect(13, 13, 6, 14); x.fillRect(9, 17, 14, 6);
  }), true);
  const sphere = (c1, c2, c3) => makeCanvas(32, 32, x => {
    const g = x.createRadialGradient(13, 12, 2, 16, 16, 13);
    g.addColorStop(0, c1); g.addColorStop(0.6, c2); g.addColorStop(1, c3);
    x.fillStyle = g; x.beginPath(); x.arc(16, 16, 13, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#fff'; x.fillRect(10, 9, 3, 3);
  });
  TX.invis = texFromCanvas(sphere('#bfe0ff', '#3060e0', '#102060'), true);    // sphère bleue
  TX.mega = texFromCanvas(sphere('#ffffff', '#b8c0c8', '#505860'), true);     // sphère argentée
  TX.backpack = texFromCanvas(makeCanvas(32, 32, x => {   // sac brun
    x.fillStyle = '#6a4420'; x.fillRect(7, 8, 18, 22);
    x.fillStyle = '#8a5a2a'; x.fillRect(9, 10, 14, 8);
    x.fillStyle = '#3a2410'; x.fillRect(7, 18, 18, 2); x.fillRect(12, 4, 8, 4);
    x.fillStyle = '#c0a060'; x.fillRect(15, 19, 2, 3);
  }), true);
  appliquerObjetsIA();   // dessin ComfyUI s'il existe (même si la fonction est rappelée seule)
}

function buildDecor() {
    // TX.sky : 256x64 opaque, ciel sombre rouge-orangé + silhouettes de montagnes en bas
    const skyW = 256;
    const skyH = 64;
    let cvSky = makeCanvas(skyW, skyH);
    let ctxSky = cvSky.getContext('2d');

    // Dégradé du ciel : noir/rouge sombre en haut vers orange plus clair près de l'horizon
    for (let y = 0; y < skyH; y++) {
        let t = y / (skyH - 1);
        
        // Interpolation entre couleur haute et basse
        let cr = Math.floor(20 + t * (90 - 20));   // 20 -> 90
        let cg = Math.floor(5 + t * (35 - 5));     // 5 -> 35
        let cb = Math.floor(10 + t * (15 - 10));   // 10 -> 15

        ctxSky.fillStyle = `rgb(${cr},${cg},${cb})`;
        ctxSky.fillRect(0, y, skyW, 1);
    }

    // Silhouettes de montagnes en bas (couleur très sombre)
    let mtnR = 10;
    let mtnG = 3;
    let mtnB = 3;
    
    for (let x = 0; x < skyW; x++) {
        // Génération pseudo-aléatoire mais déterministe des hauteurs de montagne
        let hgt = Math.floor(Math.sin(x * 0.1) * 8 + Math.cos(x * 0.25) * 4 + 16);
        
        ctxSky.fillStyle = `rgb(${mtnR},${mtnG},${mtnB})`;
        for (let y = skyH - hgt; y < skyH; y++) {
            ctxSky.fillRect(x, y, 1, 1);
        }
    }

    TX.sky = texFromCanvas(cvSky);


    // TX.lava : 64x64 opaque, orange/jaune lumineux avec veines sombres
    const lavaW = 64;
    const lavaH = 64;
    let cvLava = makeCanvas(lavaW, lavaH);
    let ctxLava = cvLava.getContext('2d');

    for (let y = 0; y < lavaH; y++) {
        for (let x = 0; x < lavaW; x++) {
            // Base orange/jaune avec variations pour effet de flux
            let noiseVal = Math.sin(x * 0.3 + y * 0.2) * Math.cos(x * 0.1 - y * 0.4);
            let brightness = 0.7 + 0.3 * (noiseVal > 0 ? noiseVal : 0);

            // Couleurs de base : croûte rouge-orangé sombre (le jaune pur se confondait avec un sol peint)
            let cr = Math.floor(150 + 105 * brightness);
            let cg = Math.floor(30 + 70 * brightness * brightness);
            let cb = 10;

            ctxLava.fillStyle = `rgb(${cr},${cg},${cb})`;
            ctxLava.fillRect(x, y, 1, 1);
        }
    }

    // Ajout de veines incandescentes (jaune vif) sur la croûte
    let veinR = 255;
    let veinG = 215;
    let veinB = 90;
    
    for (let i = 0; i < 8; i++) {
        let startX = rand() * lavaW | 0;
        let startY = rand() * lavaH | 0;
        let len = 20 + (rand() * 30) | 0;
        
        ctxLava.fillStyle = `rgb(${veinR},${veinG},${veinB})`;
        
        for (let j = 0; j < len; j++) {
            startX += ((rand() - 0.5) * 4) | 0;
            startY += ((rand() - 0.5) * 2) | 0;

            if (startX >= 0 && startX < lavaW && startY >= 0 && startY < lavaH) {
                ctxLava.fillRect(startX, startY, 1, 1);
            }
        }
    }

    TX.lava = texFromCanvas(cvLava);
}

function buildKeyTextures() {
  const colors = [
    { name: 'Red',    hex: '#d01010' },
    { name: 'Blue',   hex: '#1040e0' },
    { name: 'Yellow', hex: '#e0c010' }
  ];

  for (const c of colors) {
    const doorCv = makeCanvas(64, 64);
    const dctx = doorCv.getContext('2d');
    dctx.drawImage(TX.door.cv, 0, 0);
    dctx.fillStyle = c.hex;
    dctx.fillRect(0, 0, 64, 10);
    dctx.fillRect(0, 54, 64, 10);

    const keyCv = makeCanvas(32, 32);
    const kctx = keyCv.getContext('2d');
    kctx.clearRect(0, 0, 32, 32);
    kctx.fillStyle = c.hex;
    // Tête de la clé (anneau)
    kctx.beginPath();
    kctx.arc(16, 8, 5, 0, Math.PI * 2);
    kctx.fill();
    // Trou dans l'anneau
    kctx.globalCompositeOperation = 'destination-out';
    kctx.beginPath();
    kctx.arc(16, 8, 3, 0, Math.PI * 2);
    kctx.fill();
    kctx.globalCompositeOperation = 'source-over';
    // Tige de la clé
    kctx.fillRect(14, 13, 4, 15);
    // Dents
    kctx.fillRect(18, 20, 3, 2);
    kctx.fillRect(18, 26, 3, 2);

    TX['door' + c.name] = texFromCanvas(doorCv);
    TX['key' + c.name]  = texFromCanvas(keyCv, true);
  }
  appliquerObjetsIA();   // clés dessinées par ComfyUI s'il y en a
}

function buildMoreObjects() {
  // TX.chaingun : mitrailleuse au sol (64×24) — pixel 0 = transparent
  const cvCG = makeCanvas(64, 24);
  const cxCg = cvCG.getContext('2d');
  for (let y = 0; y < 24; y++) {
    for (let xx = 0; xx < 64; xx++) {
      let col = null;
      if (xx >= 8 && xx <= 56 && y >= 6 && y <= 18) {
        const g = 90 + Math.floor((y - 6) / 2);
        col = `rgb(${g},${g + 5},${g + 10})`;
      }
      if (xx >= 48 && xx <= 56 && y >= 9 && y <= 15) {
        const bx = xx - 48;
        const by = y - 9;
        if (Math.sqrt(bx * bx + by * by) < 3.2) col = 'rgb(60,60,70)';
      }
      if (xx >= 14 && xx <= 22 && y >= 18 && y <= 23) {
        col = 'rgb(50,40,30)';
      }
      if ((y === 7 || y === 16) && xx % 4 !== 0 && xx >= 8 && xx <= 56 && y >= 6 && y <= 18) {
        const g = 90 + Math.floor((y - 6) / 2);
        col = `rgb(${g + 20},${g + 20},${g + 25})`;
      }
      if (col !== null) cxCg.fillStyle = col, cxCg.fillRect(xx, y, 1, 1);
    }
  }
  TX.chaingun = texFromCanvas(cvCG, true);

  // TX.launcher : lance-roquettes au sol (64×24) — pixel 0 = transparent
  const cvLR = makeCanvas(64, 24);
  const cxLr = cvLR.getContext('2d');
  for (let y = 0; y < 24; y++) {
    for (let xx = 0; xx < 64; xx++) {
      let col = null;
      if (xx >= 10 && xx <= 58 && y >= 7 && y <= 17) {
        const g = 60 + Math.floor((y - 7) / 2);
        col = `rgb(${g},${Math.min(255, g + 30)},${Math.max(0, g - 10)})`;
      }
      if (xx >= 54 && xx <= 62 && y >= 9 && y <= 15) {
        const bx = xx - 58;
        const by = y - 12;
        if (Math.sqrt(bx * bx + by * by) < 3.0) col = 'rgb(30,30,30)';
      }
      if (xx >= 28 && xx <= 36 && y >= 17 && y <= 23) {
        col = 'rgb(45,35,25)';
      }
      if ((y === 9 || y === 14) && xx >= 10 && xx <= 58) {
        const g = 60 + Math.floor((y - 7) / 2);
        col = `rgb(${Math.min(255, g + 15)},${Math.min(255, g + 40)},${Math.max(0, g - 10)})`;
      }
      if (col !== null) cxLr.fillStyle = col, cxLr.fillRect(xx, y, 1, 1);
    }
  }
  TX.launcher = texFromCanvas(cvLR, true);

  // TX.bullets : munitions balles (32×32) — pixel 0 = transparent
  const cvBu = makeCanvas(32, 32);
  const cxBu = cvBu.getContext('2d');
  for (let y = 0; y < 32; y++) {
    for (let xx = 0; xx < 32; xx++) {
      let col = null;
      if (xx >= 4 && xx <= 27 && y >= 8 && y <= 24) {
        const g = 130 + Math.floor((y - 8) / 3);
        col = `rgb(${g},${Math.min(255, g * 65 >> 8)},${Math.max(0, g * 35 >> 8)})`;
      }
      if (y === 8 || y === 24) {
        if (xx >= 4 && xx <= 27) col = 'rgb(90,60,30)';
      }
      if (xx >= 10 && xx <= 21 && y >= 13 && y <= 18) {
        col = 'rgb(220,220,200)';
        if ((y === 14 || y === 16) && xx % 3 !== 0) col = 'rgb(80,80,70)';
      }
      if (col !== null) cxBu.fillStyle = col, cxBu.fillRect(xx, y, 1, 1);
    }
  }
  TX.bullets = texFromCanvas(cvBu, true);

  // TX.rockets : munitions roquettes (32×32) — pixel 0 = transparent
  const cvRk = makeCanvas(32, 32);
  const cxRk = cvRk.getContext('2d');
  for (let y = 0; y < 32; y++) {
    for (let xx = 0; xx < 32; xx++) {
      let col = null;
      if (xx >= 4 && xx <= 27 && y >= 8 && y <= 24) {
        const g = 160 + Math.floor((y - 8) / 3);
        col = `rgb(${Math.min(255, g)},${Math.max(0, g * 50 >> 8)},${Math.max(0, g * 30 >> 8)})`;
      }
      if (y === 8 || y === 24) {
        if (xx >= 4 && xx <= 27) col = 'rgb(100,40,20)';
      }
      if (xx >= 9 && xx <= 22 && y >= 13 && y <= 18) {
        col = 'rgb(255,240,200)';
        if ((y === 14 || y === 16) && xx % 3 !== 0) col = 'rgb(180,50,30)';
      }
      if (col !== null) cxRk.fillStyle = col, cxRk.fillRect(xx, y, 1, 1);
    }
  }
  TX.rockets = texFromCanvas(cvRk, true);
  appliquerObjetsIA();   // balles et roquettes dessinées par ComfyUI s'il y en a
}

function buildMoreEnemies() {
  const dessins = { caco: drawCaco, soldier: drawSoldier, lostsoul: drawLostSoul, baron: drawBaron };
  for (const [type, dessin] of Object.entries(dessins)) enregistrerPoses(type, dessin);
  const boule = (c1, c2) => texFromCanvas(makeCanvas(32, 32, x => {
    const g = x.createRadialGradient(16, 16, 1, 16, 16, 15);
    g.addColorStop(0, '#fff'); g.addColorStop(0.35, c1); g.addColorStop(0.7, c2); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  }), true);
  TX.fireballBlue = boule('#a8c8ff', '#2848ff');
  TX.fireballGreen = boule('#c0ffc0', '#18c030');
}

function buildWeapons() {
  TX.wpPistol = makeCanvas(64, 72, x => {
    x.fillStyle = '#2a2c30'; x.fillRect(26, 6, 12, 40);
    x.fillStyle = '#50545b'; x.fillRect(27, 6, 3, 40);
    x.fillStyle = '#0c0c0e'; x.fillRect(29, 4, 6, 4);
    x.fillStyle = '#3a3d42'; x.fillRect(22, 32, 20, 18);
    x.fillStyle = '#c98e64';
    x.beginPath(); x.moveTo(12, 72); x.lineTo(19, 42); x.lineTo(45, 42); x.lineTo(54, 72); x.fill();
    x.fillStyle = '#a8704c'; for (let i = 0; i < 3; i++) {
      x.fillRect(21, 47 + i * 6, 22, 2);
    }
    x.fillStyle = '#e0a87e'; x.fillRect(20, 42, 8, 4);
  });
  
  TX.wpShotgun = makeCanvas(96, 80, x => {
    x.fillStyle = '#1e2024'; x.fillRect(39, 0, 8, 50); x.fillRect(49, 0, 8, 50);
    x.fillStyle = '#4a4e55'; x.fillRect(40, 0, 2, 50); x.fillRect(50, 0, 2, 50);
    x.fillStyle = '#000'; x.fillRect(41, 0, 4, 3); x.fillRect(51, 0, 4, 3);
    x.fillStyle = '#6b4423'; x.fillRect(34, 30, 28, 16);
    x.fillStyle = '#4a2e16'; for (let i = 0; i < 4; i++) x.fillRect(36, 33 + i * 3, 24, 1);
    x.fillStyle = '#2e3034'; x.fillRect(36, 46, 24, 14);
    x.fillStyle = '#c98e64';
    x.beginPath(); x.moveTo(20, 80); x.lineTo(30, 52); x.lineTo(66, 52); x.lineTo(78, 80); x.fill();
    x.fillStyle = '#a8704c'; for (let i = 0; i < 3; i++) {
      x.fillRect(32, 58 + i * 6, 32, 2);
    }
  });
  
  TX.wpFlash = makeCanvas(48, 40, x => {
    const g = x.createRadialGradient(24, 26, 2, 24, 26, 20);
    g.addColorStop(0, '#fff');
    g.addColorStop(0.3, '#ffe070');
    g.addColorStop(0.7, 'rgba(255,120,20,.8)');
    g.addColorStop(1, 'rgba(255,60,0,0)');
    x.fillStyle = g; x.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2, r = i % 2 ? 9 : 20;
      x.lineTo(24 + Math.cos(a) * r, 26 + Math.sin(a) * r * 0.8);
    }
    x.fill();
  });

  buildMoreWeapons();
}

function buildMoreWeapons() {
  TX.wpFist = makeCanvas(64, 72, x => {
    // Main droite (vue du joueur) - poing serré
    x.fillStyle = '#c98e64';
    // Base de la main / paume vue de dos
    x.fillRect(18, 30, 28, 35);
    // Doigts repliés en haut (phalanges)
    x.fillStyle = '#d9a070';
    for(let i=0; i<4; i++) {
      const fx = 16 + i * 7;
      x.fillRect(fx, 25, 6, 18); // phalange moyenne
      x.fillStyle = '#b87a5c';
      x.fillRect(fx+1, 30, 4, 2); // jointure ombre
      x.fillStyle = '#d9a070';
    }
    // Pouce sur le côté gauche
    x.fillStyle = '#d9a070';
    x.beginPath();
    x.moveTo(18, 35);
    x.lineTo(12, 42);
    x.lineTo(16, 55);
    x.lineTo(22, 50);
    x.fill();
    
    // Avant-bras / manche de combinaison (bas)
    x.fillStyle = '#3a3d42';
    x.fillRect(14, 60, 36, 12);
    // Bande de serrage
    x.fillStyle = '#50545b';
    x.fillRect(14, 62, 36, 3);
    
    // Ombres et détails des doigts (côtes)
    x.strokeStyle = 'rgba(0,0,0,0.3)';
    x.lineWidth = 1;
    for(let i=0; i<4; i++) {
      const fx = 22 + i * 7;
      x.beginPath();
      x.moveTo(fx, 26);
      x.lineTo(fx, 43);
      x.stroke();
    }
    
    // Lueur subtile sur les phalanges supérieures (nails)
    x.fillStyle = 'rgba(255,255,255,0.15)';
    for(let i=0; i<4; i++) {
      const fx = 17 + i * 7;
      x.fillRect(fx, 26, 4, 3);
    }
  });

  TX.wpChaingun = makeCanvas(96, 80, x => {
    // Corps principal du chaingun (barrel long)
    x.fillStyle = '#1e2024';
    x.fillRect(38, 5, 20, 70);
    
    // Canons multiples en spirale/alignement
    x.fillStyle = '#4a4e55';
    for(let i=0; i<6; i++) {
      const gx = 41 + (i % 3) * 4.5;
      x.fillRect(gx, 0, 2.5, 75); // canons qui dépassent en haut
    }
    
    // Muzzle brake / embout de canon
    x.fillStyle = '#0c0c0e';
    x.fillRect(36, 0, 24, 8);
    x.fillStyle = '#1a1c1f';
    for(let i=0; i<5; i++) {
      const gx = 39 + (i % 3) * 5.5;
      if(i < 6) x.fillRect(gx, -2, 2.5, 4); // bouches des canons
    }

    // Boîte de munitions / chargeur cylindrique en bas
    x.fillStyle = '#2e3034';
    x.beginPath();
    x.arc(48, 65, 14, 0, Math.PI*2);
    x.fill();
    
    // Détail du chargeur (spirale de munitions)
    x.strokeStyle = '#c9a050';
    x.lineWidth = 3;
    x.beginPath();
    for(let a=0; a<Math.PI*4; a+=0.2) {
      const r = 12 - a * 0.8; // spirale vers le centre
      if(r < 2) break;
      const px = 48 + Math.cos(a) * r;
      const py = 65 + Math.sin(a) * r * 0.7; // ellipse pour perspective
      if(a === 0) x.moveTo(px, py); else x.lineTo(px, py);
    }
    x.stroke();

    // Mains tenant l'arme (gauche sur le chargeur, droite en arrière - ici on voit surtout la main gauche/avant et poignée)
    // Main avant (sur le garde-main / devant)
    x.fillStyle = '#c98e64';
    x.beginPath(); 
    x.moveTo(30, 75); x.lineTo(38, 52); x.lineTo(60, 52); x.lineTo(68, 75); x.fill();
    
    // Doigts avant (serrés autour)
    x.fillStyle = '#a8704c'; 
    for(let i=0; i<3; i++) {
      x.fillRect(39 + i*2, 56 + i*5, 18 - Math.abs(i-1)*2, 3); // lignes de doigts stylisées
    }

    // Manche arrière (partiellement visible en bas)
    x.fillStyle = '#3a3d42';
    x.fillRect(40, 70, 16, 10);
    
    // Éclats / reflets sur le métal
    x.fillStyle = 'rgba(255,255,255,0.2)';
    x.fillRect(39, 8, 2, 60); // reflet gauche du corps
  });

  TX.wpRocket = makeCanvas(96, 80, x => {
    // Corps principal de la lance-roquettes (tube large)
    x.fillStyle = '#1e2024';
    x.fillRect(35, 10, 26, 70);
    
    // Intérieur du tube (visible en haut) - trou noir avec bague métallique
    x.fillStyle = '#0c0c0e';
    x.beginPath(); 
    x.ellipse(48, 15, 13, 6, 0, 0, Math.PI*2); // ouverture du tube (perspective)
    x.fill();
    
    // Bague de renfort autour de l'ouverture
    x.strokeStyle = '#5a5e65';
    x.lineWidth = 4;
    x.beginPath(); 
    x.ellipse(48, 15, 13, 6, 0, 0, Math.PI*2);
    x.stroke();

    // Détails de la crosse / corps en bois/vernis (partie inférieure)
    x.fillStyle = '#4a2e16';
    x.fillRect(37, 50, 22, 30);
    
    // Motif du bois
    x.strokeStyle = 'rgba(0,0,0,0.3)';
    x.lineWidth = 1;
    for(let i=0; i<4; i++) {
      x.beginPath(); 
      x.moveTo(38 + i*5, 52); 
      x.lineTo(36 + i*5, 78); 
      x.stroke();
    }

    // Mains tenant l'arme (deux mains visibles pour cette arme lourde)
    
    // Main avant (gauche du joueur, posée sur le tube)
    x.fillStyle = '#c98e64';
    x.beginPath(); 
    x.moveTo(25, 70); x.lineTo(32, 35); x.lineTo(45, 38); x.lineTo(40, 70); x.fill();
    
    // Doigts avant (serrés autour du tube)
    x.fillStyle = '#a8704c'; 
    for(let i=0; i<4; i++) {
      const dy = 38 + i * 5;
      x.fillRect(32, dy, 12 - Math.abs(i-1.5)*1.5, 3); // doigts qui entourent le tube
    }

    // Main arrière (droite du joueur, sur la crosse)
    x.fillStyle = '#c98e64';
    x.beginPath(); 
    x.moveTo(52, 70); x.lineTo(55, 55); x.lineTo(65, 58); x.lineTo(63, 70); x.fill();

    // Doigts arrière (sur la crosse)
    x.fillStyle = '#a8704c'; 
    for(let i=0; i<3; i++) {
      const dy = 58 + i * 4;
      x.fillRect(55, dy, 9 - Math.abs(i-1)*2, 2.5); // doigts sur la crosse
    }

    // Éclats / reflets sur le tube métallique (partie supérieure)
    x.fillStyle = 'rgba(255,255,255,0.2)';
    x.fillRect(36, 18, 2, 30); // reflet gauche du corps
    
    // Bandes de renfort métalliques sur le tube
    x.fillStyle = '#4a4e55';
    x.fillRect(35, 25, 26, 3);
    x.fillRect(35, 40, 26, 3);
  });
}

buildWalls();
buildObjects();
buildWeapons();
appliquerImagesFreedoom();

/* Images Freedoom (js/01c_images_freedoom.js), appliquées une fois tout dessiné : une image remplace le dessin du jeu
   si elle a exactement sa taille ; les armes en main (wp…) remplacent le canvas tel quel. Monstres créés par le
   modèle : absents de Freedoom, ils gardent leurs images ComfyUI. */
function appliquerImagesFreedoom() {
  if (typeof IMAGES_FREEDOOM === 'undefined') return;
  for (const n of Object.keys(IMAGES_FREEDOOM)) {
    const t = imageIA(n);
    if (!t) continue;
    if (n.startsWith('wp')) TX[n] = t.cv;   // armes en main (canvas) ; tronçonneuse, plasma, BFG : seulement Freedoom
    else if (n === 'sky') TX.sky = t;   // ciel : toute taille (le rendu lit sa largeur et sa hauteur)
    else if (!TX[n] || (TX[n].w === t.w && TX[n].h === t.h)) TX[n] = t;   // nouveau (bestiaire, objets des lots 4-6) ou même taille
  }
  WALL_TEX[1] = TX.brick; WALL_TEX[2] = TX.tech; WALL_TEX[3] = TX.door; WALL_TEX[4] = TX.exit;
  for (const pose of ['A', 'B', 'Atk', 'Pain', 'Corpse']) if (!TX['spectre' + pose]) TX['spectre' + pose] = TX['pinky' + pose];   // spectre : pinky flou
  WALL_TEX[5] = TX.switchOff || TX.tech; WALL_TEX[6] = TX.switchOn || TX.tech; WALL_TEX[7] = TX.barrier || TX.brick;   // interrupteurs, barrière
}
/* ---------- F2 : planche de tous les assets ---------- */
const ASSET_LIST = ['brick', 'tech', 'door', 'exit', 'floor', 'ceil', 'fireball', 'puff',
  'impA', 'impB', 'impAtk', 'impPain', 'impCorpse', 'medkit', 'ammo',
  'pinkyA', 'pinkyB', 'pinkyAtk', 'pinkyPain', 'pinkyCorpse', 'shotgun', 'armor',
  'cacoA', 'cacoB', 'cacoAtk', 'cacoPain', 'cacoCorpse', 'soldierA', 'soldierB', 'soldierAtk', 'soldierPain', 'soldierCorpse', 'lostsoulA', 'lostsoulB', 'lostsoulAtk', 'lostsoulPain', 'lostsoulCorpse', 'baronA', 'baronB', 'baronAtk', 'baronPain', 'baronCorpse',
  'fireballBlue', 'fireballGreen', 'chaingun', 'launcher', 'bullets', 'rockets',
  'doorRed', 'doorBlue', 'doorYellow', 'keyRed', 'keyBlue', 'keyYellow', 'sky', 'lava', 'sporelingA', 'sporelingB', 'sporelingAtk', 'sporelingPain', 'sporelingCorpse', 'vultureA', 'vultureB', 'vultureAtk', 'vulturePain', 'vultureCorpse', 'berserk', 'invis', 'mega', 'backpack' ];
function drawAssetSheet() {
  ctx.fillStyle = 'rgba(0,0,0,.92)'; ctx.fillRect(0, 0, W, H);
  text('ASSETS (F2 pour fermer)', 8, 9, 10, '#ff0');
  // grille calculée pour que tous les assets tiennent au-dessus de la bande des armes (y < H - 70)
  const haut = 20, bas = H - 70, n = ASSET_LIST.length;
  let cols = 6, cell = 0;
  for (;;) {
    cell = Math.floor((W - 8) / cols) - 4;
    if (Math.ceil(n / cols) * (cell + (cell >= 16 ? 12 : 4)) <= bas - haut || cols >= 60) break;   // grille qui grandit avec les monstres créés
    cols++;
  }
  ASSET_LIST.forEach((k, i) => {
    const t = TX[k];
    if (!t) return;
    const x = 6 + (i % cols) * (cell + 4), y = haut + ((i / cols) | 0) * (cell + (cell >= 16 ? 12 : 4));
    ctx.fillStyle = '#333'; ctx.fillRect(x, y, cell, cell);
    const s = Math.min(cell / t.w, cell / t.h);
    ctx.drawImage(t.cv, x + (cell - t.w * s) / 2, y + (cell - t.h * s) / 2, t.w * s, t.h * s);
    const taille = Math.min(8, Math.floor(cell * 1.6 / k.length));
    if (cell >= 16 && taille >= 5) text(k, x + cell / 2, y + cell + 5, taille, '#ccc', 'center');   // nom seulement s'il tient dans sa case
  });
  [TX.wpPistol, TX.wpShotgun, TX.wpFlash, TX.wpFist, TX.wpChaingun, TX.wpRocket].filter(Boolean)
    .forEach((c, i) => { const k = Math.min(0.75, 62 / c.height, 76 / c.width); ctx.drawImage(c, 8 + i * 78, H - 64, c.width * k, c.height * k); });
}
