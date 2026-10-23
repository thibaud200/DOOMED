# DOOMED

Un jeu de tir à l'ancienne, façon Doom, en deux versions :

| Dossier | Version | Pour jouer |
|---|---|---|
| [`html/`](html/) | Navigateur (moteur maison en JavaScript, rendu « raycasting » pixelisé) | ouvrir `html/index.html` (ou `html/Jouer.bat` sous Windows) |
| [`unreal/`](unreal/) | Unreal Engine 5.8, en 3D (95 niveaux, menus, sauvegarde en 5 emplacements) | télécharger l'archive de la [dernière Release](https://github.com/thibaud200/DOOMED/releases/latest), la décompresser et lancer `DOOMED/Doom.exe` (Windows 64 bits, DirectX 12) |

Pour bricoler la version Unreal et la recompiler : [`unreal/COMPILER.md`](unreal/COMPILER.md) (nos fichiers sources
sont dans `unreal/projet/` ; le moteur et les packs Fab se récupèrent à part).

## Commandes

| Action | Version navigateur | Version Unreal |
|---|---|---|
| Se déplacer | Z Q S D (W A S D en QWERTY) ou flèches | Z Q S D (W A S D en QWERTY) |
| Regarder / tourner | souris (cliquer dans le jeu pour la capturer) ou ← → | souris |
| Tirer | clic gauche ou Espace | clic gauche |
| Ouvrir un passage secret, actionner la sortie | E | E |
| Pause | P ou Échap | Échap ou P (menu : reprendre, sauvegarder, charger, quitter) |
| Changer d'arme | 1 à 5 | Maj gauche (arme suivante) |
| Sauter | — | Espace (niveaux en extérieur seulement) |
| Plein écran / musique | F / M | — |

Les clés de couleur (rouge, bleue, jaune) ouvrent les portes de leur couleur. Le bilan de fin de niveau compte les ennemis
tués, les secrets trouvés et le temps.

## Crédits et licences

- Graphismes et textures d'origine : **Freedoom 0.13.0** (https://freedoom.github.io/), licence de type BSD 3 clauses —
  texte complet dans [`licences/freedoom/COPYING.txt`](licences/freedoom/COPYING.txt), auteurs dans
  [`licences/freedoom/CREDITS.txt`](licences/freedoom/CREDITS.txt). Détail des emprunts : [`html/CREDITS.md`](html/CREDITS.md).
- Monstres supplémentaires : images générées localement (ComfyUI).
- Version Unreal : faite avec Unreal® Engine (Unreal® est une marque d'Epic Games, Inc. ; Unreal® Engine,
  Copyright 1998–2026, Epic Games, Inc.). Elle utilise aussi des éléments du modèle de projet « First Person / Arena
  Shooter » d'Epic et de packs Fab (Modular SciFi Season 1 Starter Bundle, Underground SciFi), sous leurs licences.
