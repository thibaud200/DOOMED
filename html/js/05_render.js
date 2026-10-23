"use strict";
/* DOOMED — 05_render.js : raycasting DDA (murs, portes), sol/plafond, sprites -> FB
 *
 * CONTRAT (vérifié par test.html — ne rien retirer de cette liste) :
 *   FOURNIT : FOV_PLANE VSCALE shadeOf shadePx camera lumiere render3D renderFloorCeil castWalls drawSprites
 *             render3D(view{x,y,a,z?}, niveau, sprites[{x,y,tex,scale,z?,bright?,flat?}]) remplit FB et ZBUF,
 *             sans dessiner sur ctx (c'est 07_hud qui fait putImageData).
 *             view.z = hauteur de l'œil (0,5 normale, 0,1 = au sol) ; lumiere(L, cx, cy) = lumière de la case.
 *   UTILISE : W PLAY_H HOR TEX FB ZBUF clamp (01) · TX WALL_TEX (02) · CELL_* (04)
 *   RÈGLE : doit rester rapide (test.html exige < 8 ms par image).
 */

const FOV_PLANE = 0.66;                    // demi-largeur du plan caméra (FOV ≈ 66°)
const VSCALE = W / (2 * FOV_PLANE);        // échelle verticale = horizontale : texels carrés

/* lumière selon la distance (1 = plein, 0,1 = presque noir) */
const shadeOf = d => clamp(1.12 - d * 0.075, 0.1, 1);

/* couleur c assombrie par s (0..256) */
function shadePx(c, s) {
  return 0xFF000000 | ((((c >>> 16) & 255) * s >> 8) << 16) | ((((c >>> 8) & 255) * s >> 8) << 8) | (((c & 255) * s) >> 8);
}

/* repère de la caméra pour une vue { x, y, a, z? } */
function camera(view) {
  const dx = Math.cos(view.a), dy = Math.sin(view.a);
  return { px: view.x, py: view.y, a: view.a, dx, dy, plx: -dy * FOV_PLANE, ply: dx * FOV_PLANE,   // plan = « droite »
           z: view.z === undefined ? 0.5 : view.z };
}

/* lumière propre à la case (cx, cy) : 1 = normale (tâche 8 : lumière par zone) */
function lumiere(L, cx, cy) {
  if (L.light && cx >= 0 && cy >= 0 && cx < L.w && cy < L.h) return L.light[cy * L.w + cx];
  return 1;
}

/* view {x, y, a, z?} ; L niveau ; sprites [{x, y, tex, scale, z, bright, flat}] */
function render3D(view, L, sprites) {
  const cam = camera(view);
  renderFloorCeil(cam, L);
  castWalls(cam, L);
  drawSprites(cam, L, sprites);
}

/* ---- sol (sous l'horizon) et plafond (au-dessus), rangée par rangée ---- */
function renderFloorCeil(cam, L) {
  const { px, py, dx, dy, plx, ply, z } = cam;
  const fl = TX.floor.px, ce = TX.ceil.px;
  const r0x = dx - plx, r0y = dy - ply, r1x = dx + plx, r1y = dy + ply;

  if (L.sky) {
    // ciel comme dans Doom : 1024 colonnes pour un tour complet (la texture se répète), colonne selon l'angle de
    // chaque rayon ; l'horizon est le bas de la texture. Pixels rangés ligne par ligne : indice = ligne × largeur + colonne
    const sky = TX.sky, skyPx = sky.px, SW = sky.w, SH = sky.h;
    const col0 = new Int32Array(W);
    for (let x = 0; x < W; x++) {
      const ang = cam.a + Math.atan(((2 * x) / W - 1) * FOV_PLANE);   // angle du rayon de cette colonne
      col0[x] = ((Math.floor((ang / (2 * Math.PI)) * 1024) % SW) + SW) % SW;
    }
    for (let y = 0; y < HOR; y++) {
      const ligne = Math.min(SH - 1, ((y * SH) / HOR) | 0) * SW;
      let i = y * W;
      for (let x = 0; x < W; x++, i++) FB[i] = skyPx[ligne + col0[x]];
    }
  } else {
    for (let y = 0; y < HOR; y++) {
      const rowDist = VSCALE * (1 - z) / (HOR - y - 0.5);
      const stx = rowDist * (r1x - r0x) / W, sty = rowDist * (r1y - r0y) / W;
      let fx = px + rowDist * r0x, fy = py + rowDist * r0y;
      const base = ((shadeOf(rowDist) * 256) | 0);
      for (let x = 0, i = y * W; x < W; x++, i++) {
        const t = ((((fy * TEX) | 0) & 63) << 6) | (((fx * TEX) | 0) & 63);
        FB[i] = shadePx(ce[t], (base * lumiere(L, fx | 0, fy | 0)) | 0);
        fx += stx; fy += sty;
      }
    }
  }

  for (let y = HOR; y < PLAY_H; y++) {
    const rowDist = VSCALE * z / (y - HOR + 0.5);
    const stx = rowDist * (r1x - r0x) / W, sty = rowDist * (r1y - r0y) / W;
    let fx = px + rowDist * r0x, fy = py + rowDist * r0y;
    const base = (shadeOf(rowDist) * 256) | 0;
    for (let x = 0, i = y * W; x < W; x++, i++) {
      if (L.floorType && L.floorType[(fy | 0) * L.w + (fx | 0)] === 1) {
        const t = ((((fy * TEX) | 0) & 63) << 6) | (((fx * TEX) | 0) & 63);
        FB[i] = TX.lava.px[t];
      } else {
        const t = ((((fy * TEX) | 0) & 63) << 6) | (((fx * TEX) | 0) & 63);
        FB[i] = shadePx(fl[t], (base * lumiere(L, fx | 0, fy | 0)) | 0);
      }
      fx += stx; fy += sty;
    }
  }
}

/* ---- murs et portes (DDA), une colonne par rayon ; remplit ZBUF ---- */
function castWalls(cam, L) {
  const { px, py, dx, dy, plx, ply, z } = cam;
  const gw = L.w, gh = L.h, grid = L.grid;
  for (let x = 0; x < W; x++) {
    const k = 2 * x / W - 1;
    const rdx = dx + plx * k, rdy = dy + ply * k;
    let mx = px | 0, my = py | 0, lx = mx, ly = my;   // (lx, ly) : dernière case vide traversée
    const ddx = rdx === 0 ? 1e30 : Math.abs(1 / rdx), ddy = rdy === 0 ? 1e30 : Math.abs(1 / rdy);
    let stepX, stepY, sdx, sdy;
    if (rdx < 0) { stepX = -1; sdx = (px - mx) * ddx; } else { stepX = 1; sdx = (mx + 1 - px) * ddx; }
    if (rdy < 0) { stepY = -1; sdy = (py - my) * ddy; } else { stepY = 1; sdy = (my + 1 - py) * ddy; }

    let dist = 64, tex = TX.brick, u = 0, side = 0, inDoor = false;
    for (let n = 0; n < 96; n++) {
      lx = mx; ly = my;
      if (sdx < sdy) { sdx += ddx; mx += stepX; side = 0; } else { sdy += ddy; my += stepY; side = 1; }
      if (mx < 0 || my < 0 || mx >= gw || my >= gh) { dist = side ? sdy - ddy : sdx - ddx; break; }
      const code = grid[my * gw + mx];
      if (code === CELL_EMPTY) { inDoor = false; continue; }
      if (code === CELL_DOOR) {
        // porte en retrait d'une demi-case, qui coulisse dans son plan
        const D = L.doors[L.doorAt[my * gw + mx]];
        let t, hu;
        if (D.plane === 'x') { t = (mx + 0.5 - px) / rdx; hu = py + t * rdy - my; }
        else { t = (my + 0.5 - py) / rdy; hu = px + t * rdx - mx; }
        if (t > 0 && hu >= 0 && hu < 1 && hu >= D.open) {
          dist = t; u = hu - D.open; side = D.plane === 'x' ? 0 : 1;
          if ((side === 0 && rdx < 0) || (side === 1 && rdy > 0)) u = Math.min(0.9999, 1 - u);   // vue de l'autre côté : panneau à l'endroit
          tex = D.key == null ? TX.door : (D.key === 'red' ? TX.doorRed : D.key === 'blue' ? TX.doorBlue : TX.doorYellow);
          break;
        }
        inDoor = true;
        continue;
      }
      dist = side ? sdy - ddy : sdx - ddx;
      let wx = side ? px + dist * rdx : py + dist * rdy;
      wx -= Math.floor(wx);
      if ((side === 0 && rdx < 0) || (side === 1 && rdy > 0)) wx = 1 - wx;   // textures à l'endroit (sinon « TIXE »)
      u = wx;
      tex = inDoor ? TX.tech : WALL_TEX[code];   // embrasure de porte : panneau tech
      break;
    }

    ZBUF[x] = dist;
    const lineH = VSCALE / dist, y0 = HOR - (1 - z) * lineH;   // haut du mur ; le bas est à HOR + z × lineH
    const tx = Math.min(TEX - 1, (u * TEX) | 0), stepT = TEX / lineH;
    const ys = Math.max(0, Math.ceil(y0)), ye = Math.min(PLAY_H, Math.ceil(y0 + lineH));
    let tp = (ys - y0) * stepT;
    const s = (shadeOf(dist) * (side ? 0.78 : 1) * lumiere(L, lx, ly) * 256) | 0, tpx = tex.px;
    for (let y = ys, i = ys * W + x; y < ye; y++, i += W) {
      FB[i] = shadePx(tpx[(((tp | 0) & 63) << 6) | tx], s);
      tp += stepT;
    }
  }
}

/* ---- sprites, du plus loin au plus proche, avec leur ombre au sol ---- */
function drawSprites(cam, L, sprites) {
  const { px, py, dx, dy, plx, ply, z } = cam;
  const inv = 1 / (plx * dy - dx * ply);
  for (const sp of sprites) { const ox = sp.x - px, oy = sp.y - py; sp.d = ox * ox + oy * oy; }
  sprites.sort((a, b) => b.d - a.d);
  for (const sp of sprites) {
    const ox = sp.x - px, oy = sp.y - py;
    const tX = inv * (dy * ox - dx * oy), tY = inv * (-ply * ox + plx * oy);
    if (tY < 0.15) continue;
    const scrX = (W / 2) * (1 + tX / tY);
    const unit = VSCALE / tY, hgt = unit * sp.scale, wid = hgt * sp.tex.w / sp.tex.h;
    const bottom = HOR + z * unit - (sp.z || 0) * unit, top = bottom - hgt, left = scrX - wid / 2;
    const xs = Math.max(0, Math.ceil(left)), xe = Math.min(W, Math.ceil(left + wid));
    const ys = Math.max(0, Math.ceil(top)), ye = Math.min(PLAY_H, Math.ceil(bottom));
    if (xs >= xe || ys >= ye) continue;
    const sh = sp.bright ? 256 : (shadeOf(tY) * lumiere(L, sp.x | 0, sp.y | 0) * 256) | 0;
    const tw = sp.tex.w, th = sp.tex.h, tpx = sp.tex.px;

    /* ombre au sol, AVANT le sprite : ellipse aplatie sur la ligne du sol,
       qui assombrit les pixels déjà dessinés (sol) au lieu de les repeindre */
    if (!sp.flat) {
      const floorY = HOR + z * unit;                       // ligne du sol sous le sprite
      const rx = wid * 0.45, ry = Math.max(1, unit * 0.06);
      const sx0 = Math.max(0, Math.ceil(scrX - rx)), sx1 = Math.min(W, Math.ceil(scrX + rx));
      const sy0 = Math.max(0, Math.ceil(floorY - ry)), sy1 = Math.min(PLAY_H, Math.ceil(floorY + ry));
      const k = sp.z > 0 ? 0.35 : 0.55;                    // plus légère sous un objet en l'air
      for (let x = sx0; x < sx1; x++) {
        if (tY >= ZBUF[x]) continue;
        const nx = (x - scrX) / rx;
        for (let y = sy0; y < sy1; y++) {
          const ny = (y - floorY) / ry, r2 = nx * nx + ny * ny;
          if (r2 >= 1) continue;
          const i = y * W + x;
          FB[i] = shadePx(FB[i], (256 * (1 - k * (1 - r2))) | 0);
        }
      }
    }

    for (let x = xs; x < xe; x++) {
      if (tY >= ZBUF[x]) continue;
      const tx = Math.min(tw - 1, ((x - left) * tw / wid) | 0);
      for (let y = ys; y < ye; y++) {
        const c = tpx[Math.min(th - 1, ((y - top) * th / hgt) | 0) * tw + tx];
        if (c) FB[y * W + x] = shadePx(c, sh);
      }
    }
  }
}
