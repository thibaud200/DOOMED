# Crédits et licences

## Graphismes Freedoom

Les sprites des monstres (diablotin, démon, cacodémon, soldat, âme perdue, baron, et le bestiaire de Doom II :
sergent, commando, chevalier de l'Enfer, revenant, mancubus, arachnotron, élémentaire de douleur, cyberdémon,
araignée cervelle, archi-infâme), les objets, les projectiles, les armes en main (dont tronçonneuse, fusil à plasma,
BFG) et les textures (murs, portes, sortie, interrupteurs, sol, plafond, lave et nukage animés, téléporteur, ciel)
viennent de **Freedoom 0.13.0** (https://freedoom.github.io/).

- Copyright © 2001-2024 Contributors to the Freedoom project. All rights reserved.
- Licence : de type BSD 3 clauses — texte complet dans `ressources/freedoom/COPYING.txt` (à conserver avec le jeu).
- Auteurs : `ressources/freedoom/CREDITS.txt`.
- Source : `ressources/freedoom/freedoom2.wad` (archive officielle `freedoom-0.13.0.zip`, SHA-256
  `3f9b264f3e3ce503b4fb7f6bdcb1f419d93c7b546f4df3e874dd878db9688f59`, identique à la somme publiée par le projet).
- Conversion : `outils/freedoom_doomed.py` → `js/01c_images_freedoom.js`.

Conformément à la licence, le nom « Freedoom » et celui de ses contributeurs ne sont pas utilisés pour promouvoir
DOOMED ; ce fichier sert seulement à créditer l'origine des images.

## Interface et bruitages Freedoom

- Interface à la Doom : barre d'état (libellés refaits en français), chiffres, visages du marine, clés, police des
  messages et des menus, tête de mort des menus, réglettes, cadres de sauvegarde, fonds de l'écran de statistiques
  et du texte de fin. Extraction : `outils/interface_freedoom.py` → `js/01f_interface_freedoom.js`.
- Bruitages (sons `DS…` de `freedoom2.wad`) : `outils/sons_freedoom.py` → `js/01e_sons_freedoom.js`.

Même origine, mêmes droits et même licence que ci-dessus.

## Extraits de niveaux Freedoom (références pour le modèle)

Les cartes MAP01 à MAP32 de `freedoom2.wad` sont converties en grilles et découpées en extraits
(`outils/freedoom_niveaux.py` → `outils/formes/freedoom.json`). Le générateur de niveaux en montre 2 au modèle local
comme inspiration quand il dessine ou améliore la forme d'un niveau ; une forme trop proche d'un extrait est refusée.
Même licence que ci-dessus.

## Musiques Freedoom

Les 35 musiques (un morceau par niveau, dans l'ordre des cartes : D_RUNNIN pour le niveau 1, D_STALKS pour le 2…) et
la banque d'instruments OPL2 `GENMIDI` viennent de `freedoom2.wad` (Freedoom 0.13.0, mêmes droits et même licence que
ci-dessus ; compositeurs dans `CREDITS.txt` de Freedoom). Extraction : `outils/musiques_freedoom.py` →
`js/01d_musiques_freedoom.js`. Elles sont jouées par le synthétiseur FM du jeu (`js/03b_musique.js`), qui imite la
carte son OPL2 ; la version Unreal utilise des fichiers WAV calculés par ce même synthétiseur (`outils/musique_wav.js`).

## Images générées

Les monstres créés par le modèle local (Sporeling, Vulturion…) sont dessinés par ComfyUI (`outils/comfy_doomed.py`
→ `js/01b_images_ia.js`).
