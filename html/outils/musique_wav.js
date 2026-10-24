/* Musiques de Freedoom en fichiers WAV, avec le synthétiseur du jeu (js\03b_musique.js) — pour la version Unreal.
 *
 *   node outils\musique_wav.js <dossier de sortie> [fréquence=32000] [nom D_… ou numéro…]
 *
 * Un fichier par morceau (D_RUNNIN.wav…), mono 16 bits, une seule lecture du morceau (le jeu le fait boucler).
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const racine = path.join(__dirname, '..');
const { SynthFM, lireMidi, lireGenmidi } = require(path.join(racine, 'js', '03b_musique.js'));
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(racine, 'js', '01d_musiques_freedoom.js'), 'utf8') + ';this.M = MUSIQUES_FREEDOOM;', ctx);
const M = ctx.M, b64 = s => new Uint8Array(Buffer.from(s, 'base64'));

const [dossier, fe = '32000', ...choix] = process.argv.slice(2);
if (!dossier) { console.log('usage : node outils\\musique_wav.js <dossier> [fréquence] [morceaux…]'); process.exit(1); }
fs.mkdirSync(dossier, { recursive: true });
const banque = lireGenmidi(b64(M.genmidi));
const tous = [...M.pistes, M.titre, M.entracte, M.texte].filter(Boolean);
const liste = choix.length ? tous.filter((p, i) => choix.includes(p.nom) || choix.includes(String(i + 1))) : tous;

for (const p of liste) {
  const t0 = Date.now(), midi = lireMidi(b64(p.midi)), s = new SynthFM(banque, +fe);
  s.charger(midi); s.boucle = false;
  const n = Math.ceil((midi.duree + 1.5) * +fe), x = s.rendre(n);
  let crete = 0, somme = 0;
  for (const v of x) { crete = Math.max(crete, Math.abs(v)); somme += v * v; }
  const pcm = Buffer.alloc(44 + n * 2);
  pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + n * 2, 4); pcm.write('WAVEfmt ', 8);
  pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22); pcm.writeUInt32LE(+fe, 24);
  pcm.writeUInt32LE(+fe * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(path.join(dossier, p.nom + '.wav'), pcm);
  console.log(`${p.nom} : ${midi.duree.toFixed(1)} s, crête ${crete.toFixed(2)}, niveau moyen ${Math.sqrt(somme / n).toFixed(3)}, ` +
              `${((Date.now() - t0) / 1000).toFixed(1)} s de calcul`);
}
