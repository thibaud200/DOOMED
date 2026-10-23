# Crédits et licences

## Graphismes Freedoom

Les sprites des monstres d'origine (diablotin, démon, cacodémon, soldat, âme perdue, baron), les objets, les
projectiles, les armes en main et les textures (murs, portes, sortie, sol, plafond, lave, ciel) viennent de
**Freedoom 0.13.0** (https://freedoom.github.io/).

- Copyright © 2001-2024 Contributors to the Freedoom project. All rights reserved.
- Licence : de type BSD 3 clauses — texte complet dans `licences/freedoom/COPYING.txt` (racine du dépôt) (à conserver avec le jeu).
- Auteurs : `licences/freedoom/CREDITS.txt`.
- Source : `ressources/freedoom/freedoom2.wad` (archive officielle `freedoom-0.13.0.zip`, SHA-256
  `3f9b264f3e3ce503b4fb7f6bdcb1f419d93c7b546f4df3e874dd878db9688f59`, identique à la somme publiée par le projet).
- Conversion : `outils/freedoom_doomed.py` → `js/01c_images_freedoom.js`.

Conformément à la licence, le nom « Freedoom » et celui de ses contributeurs ne sont pas utilisés pour promouvoir
DOOMED ; ce fichier sert seulement à créditer l'origine des images.

## Extraits de niveaux Freedoom (références pour le modèle)

Les cartes MAP01 à MAP32 de `freedoom2.wad` sont converties en grilles et découpées en extraits
(`outils/freedoom_niveaux.py` → `outils/formes/freedoom.json`). Le générateur de niveaux en montre 2 au modèle local
comme inspiration quand il dessine ou améliore la forme d'un niveau ; une forme trop proche d'un extrait est refusée.
Même licence que ci-dessus.

## Images générées

Les monstres créés par le modèle local (Sporeling, Vulturion…) sont dessinés par ComfyUI (`outils/comfy_doomed.py`
→ `js/01b_images_ia.js`).
