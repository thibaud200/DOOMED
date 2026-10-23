"use strict";
/* DOOMED — 10_editeur_logique.js : calculs de l'éditeur de niveaux (aucun accès à la page)
 *
 * CONTRAT (vérifié par test.html — ne rien retirer de cette liste) :
 *   FOURNIT : ED_LIMITES grilleVide peindre redimensionner carteEnTexte texteEnCarte statistiques cheminVersSortie
 *   UTILISE : LEGEND SPAWN ITEM validateMap (04_maps.js)
 *   RÈGLES : une carte = tableau de chaînes (rows), une chaîne par ligne, toutes de même longueur.
 *            Les fonctions ne modifient JAMAIS le tableau reçu : elles renvoient un nouveau tableau.
 *   Chargé par editeur.html et test.html (pas par le jeu).
 */

const ED_LIMITES = { min: 8, max: 64 };   // largeur et hauteur autorisées d'une carte

function grilleVide(w, h) {
  w = Math.max(ED_LIMITES.min, Math.min(ED_LIMITES.max, w | 0));
  h = Math.max(ED_LIMITES.min, Math.min(ED_LIMITES.max, h | 0));
  const rows = [];
  for (let y = 0; y < h; y++) rows.push(y === 0 || y === h - 1 ? '#'.repeat(w) : '#' + '.'.repeat(w - 2) + '#');
  rows[1] = '#P' + rows[1].slice(2);
  rows[h - 1] = rows[h - 1].slice(0, w - 2) + 'E#';
  return rows;
}

function peindre(rows, x, y, ch) {
  const h = rows.length, w = h ? rows[0].length : 0;
  if (x < 0 || y < 0 || x >= w || y >= h || !(ch in LEGEND)) return rows;
  const bord = x === 0 || y === 0 || x === w - 1 || y === h - 1;
  if (bord && LEGEND[ch] === 0) return rows;                    // le bord doit rester fermé
  const out = ch === 'P' ? rows.map(r => r.replace(/P/g, '.')) : rows.slice();
  out[y] = out[y].slice(0, x) + ch + out[y].slice(x + 1);
  return out;
}

function redimensionner(rows, w, h) {
  const out = grilleVide(w, h).map(r => r.replace(/[PE]/g, r[0] === '#' && r.indexOf('.') < 0 ? '#' : '.'));
  const W2 = out[0].length, H2 = out.length;
  for (let y = 1; y < Math.min(rows.length, H2) - 1; y++)
    for (let x = 1; x < Math.min(rows[0].length, W2) - 1; x++)
      out[y] = out[y].slice(0, x) + rows[y][x] + out[y].slice(x + 1);
  if (!out.some(r => r.includes('P'))) out[1] = '#P' + out[1].slice(2);
  if (!out.some(r => r.includes('E'))) out[H2 - 1] = out[H2 - 1].slice(0, W2 - 2) + 'E#';
  return out;
}

function carteEnTexte(carte) {
  const nom = String(carte.name || 'Niveau').split('\\').join('\\\\').split("'").join("\\'");
  return `  { name: '${nom}', angle: ${carte.angle || 0}, rows: [\n` +
    carte.rows.map(r => `    "${r}",\n`).join('') + '  ] },\n';
}

function texteEnCarte(texte) {
  const rows = String(texte).split('\n').map(l => {
    l = l.trim();
    if (l.endsWith(',')) l = l.slice(0, -1).trim();
    if (l.length >= 2 && l.startsWith('"') && l.endsWith('"')) l = l.slice(1, -1);
    return l.trim();
  }).filter(l => l.length > 0);
  if (rows.length < 3 || rows.some(r => r.length !== rows[0].length)) return null;
  return { rows };
}

function statistiques(rows) {
  const s = { ennemis: {}, objets: {}, total: 0 };
  for (const r of rows) for (const c of r) {
    if (SPAWN[c]) { s.ennemis[SPAWN[c]] = (s.ennemis[SPAWN[c]] || 0) + 1; s.total++; }
    else if (ITEM[c]) s.objets[ITEM[c]] = (s.objets[ITEM[c]] || 0) + 1;
  }
  return s;
}

function cheminVersSortie(rows) {
  const h = rows.length, w = h ? rows[0].length : 0;
  let depart = null;
  for (let y = 0; y < h && !depart; y++) { const x = rows[y].indexOf('P'); if (x >= 0) depart = [x, y]; }
  if (!depart) return false;
  const vu = new Set([depart.join()]), file = [depart];
  const passe = c => LEGEND[c] === 0 || c === '=';
  while (file.length) {
    const [x, y] = file.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const c = rows[ny][nx];
      if (c === 'E') return true;
      if (passe(c) && !vu.has(nx + ',' + ny)) { vu.add(nx + ',' + ny); file.push([nx, ny]); }
    }
  }
  return false;
}
