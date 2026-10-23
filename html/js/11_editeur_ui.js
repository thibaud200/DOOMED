"use strict";
/* DOOMED — 11_editeur_ui.js : interface de l'éditeur de niveaux (page editeur.html)
 *
 * CONTRAT (vérifié par test.html — ne rien retirer de cette liste) :
 *   FOURNIT : ED ED_COULEURS ED_NOMS dessinerGrille construirePalette remplirListe afficherValidation cliqueCase enregistrerNiveau chargerNiveau testerNiveau exporterNiveau construireInterface
 *   UTILISE : 04_maps.js (LEGEND MAPS validateMap lireNiveauxPerso ecrireNiveauxPerso ecrireNiveauTest),
 *             10_editeur_logique.js
 *   RÈGLES : tout l'affichage est construit DANS l'élément racine passé à initEditeur(racine) ;
 *            les éléments sont retrouvés par ED.racine.querySelector('#ed-…') (jamais document.getElementById).
 *            Rien ne s'exécute au chargement du fichier : c'est editeur.html qui appelle initEditeur.
 */

/* état de l'éditeur */
const ED = { rows: null, nom: 'Mon niveau', angle: 0, outil: '#', racine: null, canvas: null, cell: 16, peint: false };

/* couleur de chaque caractère de carte dans la grille */
const ED_COULEURS = {
  '#': '#8a5a40', '%': '#77808c', '=': '#e08a20', 'E': '#3df08a', '$': '#b07a5a', '.': '#1c1c1c', 'P': '#ffd040',
  'R': '#e02020', 'B': '#2050f0', 'J': '#e0c010', 'r': '#ff6060', 'b': '#6090ff', 'j': '#ffe060', '~': '#ff6a10',
  'K': '#b01818', 'I': '#4070ff', 'M': '#d0d8e0', 'G': '#8a5a2a',
  '1': '#c03020', '2': '#e080a0', '3': '#d02020', '4': '#6a7a50', '5': '#ff8020', '6': '#d9a58a',
  'H': '#f0f0f0', 'A': '#c09040', 'S': '#806040', 'V': '#30a040', 'C': '#666a70', 'L': '#4a5a3a', 'm': '#d9b658', 'k': '#cc3333', '@': '#c181ca', '&': '#5fe1c0' };

/* nom affiché dans la palette ; seuls les caractères présents dans LEGEND sont proposés */
const ED_NOMS = {
  '#': 'Brique', '%': 'Tech', '=': 'Porte', 'E': 'Sortie', '$': 'Secret', '.': 'Sol', 'P': 'Départ',
  'R': 'Porte rouge', 'B': 'Porte bleue', 'J': 'Porte jaune', 'r': 'Clé rouge', 'b': 'Clé bleue', 'j': 'Clé jaune', '~': 'Lave',
  'K': 'Berserk', 'I': 'Invisibilité', 'M': 'Mégasphère', 'G': 'Sac à dos',
  '1': 'Diablotin', '2': 'Démon rose', '3': 'Cacodémon', '4': 'Soldat', '5': 'Âme perdue', '6': 'Baron',
  'H': 'Trousse', 'A': 'Cartouches', 'S': 'Fusil', 'V': 'Armure', 'C': 'Mitrailleuse', 'L': 'Lance-roquettes',
  'm': 'Balles', 'k': 'Roquettes', '@': 'Sporeling', '&': 'Vulturion des Cendres' };

function dessinerGrille() {
  if (!ED.canvas || !ED.rows) return;
  const h = ED.rows.length, w = ED.rows[0].length, c = ED.cell, x = ED.canvas.getContext('2d');
  ED.canvas.width = w * c; ED.canvas.height = h * c;
  x.fillStyle = '#000'; x.fillRect(0, 0, w * c, h * c);
  x.font = 'bold ' + Math.floor(c * 0.7) + 'px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const ch = ED.rows[j][i], entite = SPAWN[ch] || ITEM[ch] || ch === 'P';
    x.fillStyle = entite ? ED_COULEURS['.'] : (ED_COULEURS[ch] || '#f0f');
    x.fillRect(i * c, j * c, c, c);
    if (entite) {
      x.fillStyle = ED_COULEURS[ch] || '#fff';
      x.beginPath(); x.arc(i * c + c / 2, j * c + c / 2, c * 0.42, 0, 7); x.fill();
      x.fillStyle = '#000'; x.fillText(ch, i * c + c / 2, j * c + c / 2 + 1);
    }
  }
  x.strokeStyle = 'rgba(255,255,255,.07)'; x.lineWidth = 1; x.beginPath();
  for (let i = 0; i <= w; i++) { x.moveTo(i * c + 0.5, 0); x.lineTo(i * c + 0.5, h * c); }
  for (let j = 0; j <= h; j++) { x.moveTo(0, j * c + 0.5); x.lineTo(w * c, j * c + 0.5); }
  x.stroke();
}

function construirePalette() {
  const pal = ED.racine.querySelector('#ed-palette');
  pal.innerHTML = '';
  let n = 0;
  // ordre voulu : terrain, départ, ennemis, objets (Object.entries mettrait les clés '1'…'6' en premier)
  const base = '#%=RBJE$.~P123456HASVCLmkrbjKIMG';   // murs et portes, sortie, terrain, départ, ennemis, objets
  const ordre = base.split('').filter(c => c in ED_NOMS).concat(Object.keys(ED_NOMS).filter(c => !base.includes(c)));
  for (const ch of ordre) {
    const nom = ED_NOMS[ch];
    if (!(ch in LEGEND)) continue;
    const b = document.createElement('button');
    b.className = 'outil' + (ch === ED.outil ? ' actif' : '');
    b.dataset.ch = ch;
    b.innerHTML = `<span class="pastille" style="background:${ED_COULEURS[ch] || '#f0f'}"></span>${nom} <small>${ch}</small>`;
    b.addEventListener('click', () => {
      ED.outil = ch;
      for (const o of pal.querySelectorAll('.outil')) o.classList.toggle('actif', o === b);
    });
    pal.appendChild(b); n++;
  }
  return n;
}

function remplirListe() {
  const liste = ED.racine.querySelector('#ed-liste');
  if (!liste) return;
  liste.innerHTML = '';
  const noms = MAPS.map(m => m.name).concat(lireNiveauxPerso().map(m => m.name).filter(n => !MAPS.some(m => m.name === n)));
  for (const nom of noms) {
    const o = document.createElement('option');
    o.value = nom; o.textContent = nom;
    liste.appendChild(o);
  }
}

function afficherValidation() {
  const errs = validateMap({ name: ED.nom, rows: ED.rows });
  if (!errs.length && !cheminVersSortie(ED.rows)) errs.push('sortie inatteignable depuis le départ P');
  const s = statistiques(ED.rows), boite = ED.racine && ED.racine.querySelector('#ed-infos');
  if (boite) {
    const ligne = o => Object.entries(o).map(([k, v]) => `${k} × ${v}`).join(', ') || 'aucun';
    boite.innerHTML = (errs.length
      ? '<span class="ko">À corriger :</span>\n' + errs.map(e => '• ' + e).join('\n')
      : '<span class="ok">Niveau valide ✔</span>') +
      `\n\n${ED.rows[0].length} × ${ED.rows.length} cases\nEnnemis (${s.total}) : ${ligne(s.ennemis)}\nObjets : ${ligne(s.objets)}`;
  }
  return errs;
}

function cliqueCase(x, y) {
  ED.rows = peindre(ED.rows, x, y, ED.outil);
  dessinerGrille();
  afficherValidation();
}

function enregistrerNiveau() {
  const champ = ED.racine && ED.racine.querySelector('#ed-nom');
  if (champ && champ.value.trim()) ED.nom = champ.value.trim();
  if (afficherValidation().length) return false;
  const liste = lireNiveauxPerso().filter(m => m.name !== ED.nom);
  liste.push({ name: ED.nom, angle: ED.angle || 0, rows: ED.rows.slice() });
  const ok = ecrireNiveauxPerso(liste);
  remplirListe();
  return ok;
}

function chargerNiveau(nom) {
  const m = MAPS.find(x => x.name === nom) || lireNiveauxPerso().find(x => x.name === nom);
  if (!m) return false;
  ED.rows = m.rows.slice(); ED.nom = m.name; ED.angle = m.angle || 0;
  const champ = ED.racine && ED.racine.querySelector('#ed-nom');
  if (champ) champ.value = m.name;
  dessinerGrille(); afficherValidation();
  return true;
}

function testerNiveau() {
  const champ = ED.racine && ED.racine.querySelector('#ed-nom');
  if (champ && champ.value.trim()) ED.nom = champ.value.trim();
  if (afficherValidation().length) return false;
  if (!ecrireNiveauTest({ name: ED.nom, angle: ED.angle || 0, rows: ED.rows })) return false;
  window.open('index.html#test', '_blank');
  return true;
}

function exporterNiveau() {
  const champ = ED.racine && ED.racine.querySelector('#ed-nom');
  if (champ && champ.value.trim()) ED.nom = champ.value.trim();
  const texte = carteEnTexte({ name: ED.nom, angle: ED.angle || 0, rows: ED.rows });
  const zone = ED.racine && ED.racine.querySelector('#ed-export');
  if (zone) { zone.value = texte; zone.focus(); zone.select(); }
  return texte;
}

function construireInterface(racine) {
  racine.innerHTML = '';
  const el = (tag, props, parent) => { const e = Object.assign(document.createElement(tag), props); (parent || racine).appendChild(e); return e; };
  el('h1', { textContent: 'DOOMED — éditeur de niveaux' });
  const barre = el('div', {});
  el('span', { textContent: 'Nom ' }, barre);
  el('input', { id: 'ed-nom', value: ED.nom, size: 18 }, barre);
  el('span', { textContent: '  Taille ' }, barre);
  el('input', { id: 'ed-largeur', type: 'number', value: 24, min: ED_LIMITES.min, max: ED_LIMITES.max }, barre);
  el('span', { textContent: '×' }, barre);
  el('input', { id: 'ed-hauteur', type: 'number', value: 16, min: ED_LIMITES.min, max: ED_LIMITES.max }, barre);
  el('button', { id: 'ed-nouveau', textContent: 'Nouveau' }, barre);
  el('button', { id: 'ed-redim', textContent: 'Redimensionner' }, barre);
  el('button', { id: 'ed-enregistrer', textContent: 'Enregistrer' }, barre);
  el('button', { id: 'ed-tester', textContent: '▶ Tester' }, barre);
  el('button', { id: 'ed-exporter', textContent: 'Exporter' }, barre);
  el('span', { textContent: '  Niveau ' }, barre);
  el('select', { id: 'ed-liste' }, barre);
  el('button', { id: 'ed-charger', textContent: 'Charger' }, barre);
  const zone = el('div', { id: 'ed-zone' });
  el('div', { id: 'ed-palette' }, zone);
  el('canvas', { id: 'ed-grille' }, zone);
  el('div', { id: 'ed-infos' }, zone);
  el('div', { textContent: 'Clic gauche (ou glisser) : peindre · clic droit : sol · « Exporter » donne le texte à coller dans MAPS (js/04_maps.js).' });
  el('textarea', { id: 'ed-export', placeholder: 'Texte exporté…' });
}

function initEditeur(racine) {
  ED.racine = racine;
  construireInterface(racine);
  const $ = id => racine.querySelector('#' + id);
  ED.canvas = $('ed-grille');
  ED.rows = grilleVide(24, 16);
  const caseSouris = ev => {
    const r = ED.canvas.getBoundingClientRect();
    return [Math.floor((ev.clientX - r.left) * ED.canvas.width / r.width / ED.cell),
            Math.floor((ev.clientY - r.top) * ED.canvas.height / r.height / ED.cell)];
  };
  const peindreSouris = ev => {
    const [x, y] = caseSouris(ev);
    if (ev.buttons & 2 || ev.button === 2) { const o = ED.outil; ED.outil = '.'; cliqueCase(x, y); ED.outil = o; }
    else cliqueCase(x, y);
  };
  ED.canvas.addEventListener('contextmenu', ev => ev.preventDefault());
  ED.canvas.addEventListener('mousedown', ev => { ED.peint = true; peindreSouris(ev); });
  ED.canvas.addEventListener('mousemove', ev => { if (ED.peint) peindreSouris(ev); });
  addEventListener('mouseup', () => { ED.peint = false; });
  const taille = () => [+$('ed-largeur').value || 24, +$('ed-hauteur').value || 16];
  $('ed-nouveau').addEventListener('click', () => { ED.rows = grilleVide(...taille()); dessinerGrille(); afficherValidation(); });
  $('ed-redim').addEventListener('click', () => { ED.rows = redimensionner(ED.rows, ...taille()); dessinerGrille(); afficherValidation(); });
  $('ed-enregistrer').addEventListener('click', () => { if (enregistrerNiveau()) $('ed-infos').insertAdjacentText('afterbegin', 'Enregistré ✔ — '); });
  $('ed-tester').addEventListener('click', () => testerNiveau());
  $('ed-exporter').addEventListener('click', () => exporterNiveau());
  $('ed-charger').addEventListener('click', () => {
    if (chargerNiveau($('ed-liste').value)) { $('ed-largeur').value = ED.rows[0].length; $('ed-hauteur').value = ED.rows.length; }
  });
  construirePalette();
  remplirListe();
  dessinerGrille();
  afficherValidation();
  return ED;
}
