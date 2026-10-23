# Reconstruire DOOMED (version Unreal) depuis les sources

Pour jouer, inutile de compiler : l'archive prête à l'emploi est dans les
[Releases](https://github.com/thibaud200/DOOMED/releases/latest). Cette page est pour ceux qui veulent bricoler le jeu :
modifier les niveaux, les monstres, les scripts, puis refabriquer l'exe.

Le dossier [`projet/`](projet/) ne contient que **nos propres fichiers**. Le moteur, le modèle de projet d'Epic et les
packs de décor Fab ne sont pas redistribués (leurs licences ne le permettent pas) : vous les récupérez vous-même, et nos
scripts réappliquent les quelques retouches qu'on leur a faites.

> Procédure écrite d'après la machine de développement ; elle n'a pas encore été rejouée sur un PC neuf. Si une étape
> coince, ouvrez une issue.

## Ce qu'il faut

| Outil | Version | Où le trouver |
|---|---|---|
| Windows | 10 ou 11, 64 bits, ~20 Go libres | — |
| Unreal Engine | **5.8** | [Epic Games Launcher](https://www.unrealengine.com/download) |
| Visual Studio | 2022 Community, avec : outils C++ **MSVC v143 (14.44.35211 ou plus récent)**, **SDK Windows 10.0.22621**, **SDK .NET Framework 4.8** | [visualstudio.microsoft.com](https://visualstudio.microsoft.com/fr/vs/community/) |
| Python | 3.11 ou plus récent (bibliothèque standard seulement) | [python.org](https://www.python.org/downloads/) |
| Pack Fab | **Modular SciFi Season 1 Starter Bundle** (murs, sols, plafonds, mobilier, rochers) | [fab.com](https://www.fab.com/listings/86913335-3c75-42bf-8404-54fe9d9d7396) |
| Pack Fab | **Underground Sci-Fi** (arbre mort du décor extérieur) | [fab.com](https://fab.com/s/c4268f023de5) |

Visual Studio sert parce que le jeu a sa propre cible de compilation : des plugins y sont limités à l'éditeur, ce qui
allège l'exe de moitié.

## Étapes

Les scripts supposent le dossier **`C:\workspace IA\Unreal`**. Pour un autre emplacement, il faut adapter `racine` et les
chemins de `Doom\profil\jeu.json`, ainsi que les chemins écrits en dur en tête de quelques scripts (`r'C:\workspace IA\Unreal…'`).

1. **Projet de base.** Dans Unreal 5.8 : *Jeux* → modèle **First Person**, variante **Arena Shooter**, en **Blueprint**,
   nom **`Doom`**, emplacement `C:\workspace IA\Unreal`. Ouvrez-le une fois, puis fermez l'éditeur.
2. **Packs Fab.** Ajoutez les deux packs au projet `Doom` (depuis Fab, dans le lanceur ou dans l'éditeur). Ils doivent
   arriver dans `Content\StarterBundle` et `Content\UndergroundSciFi`, leurs dossiers par défaut.
3. **Nos fichiers.** Copiez le contenu de `projet/` dans `C:\workspace IA\Unreal\`, en remplaçant les fichiers existants
   (`Doom.uproject` et `Config\`). Vous obtenez :
   ```
   C:\workspace IA\Unreal\
   ├── Doom\              projet Unreal : Doom.uproject, Config\, Content\DOOMED\, outils\, profil\
   ├── methode\           enchaîneur de construction (enchainer.py) et ses outils
   ├── outils\ue.py       client du serveur MCP de l'éditeur
   └── DOOMED_import\doomed.json   légende des cartes
   ```
4. **Ouvrir le projet** (`Doom.uproject`). Unreal propose de compiler le module du projet : acceptez. Le serveur MCP
   (port 8000) et l'exécution Python à distance démarrent tout seuls, d'après la configuration fournie.
5. **Préparer les Blueprints**, éditeur ouvert, dans une invite de commandes placée dans `C:\workspace IA\Unreal` :
   ```
   python Doom\outils\creer_acteurs.py
   python Doom\outils\creer_menus.py
   python Doom\outils\ue_py.py Doom\outils\retouches_packs.py
   python Doom\outils\ue_py.py Doom\outils\materiaux_instances.py
   ```
   Ces scripts : monstres, objets, portes, secrets, sortie ; touches E, Échap, P ; balles des armes du modèle ; menus,
   pause et sauvegarde ; carte `Menu` ; matériaux du pack adaptés aux instances ; matériau des rochers.
6. **Construire les 95 niveaux et fabriquer le jeu** :
   ```
   python Doom\outils\fabriquer_jeu.py --tout
   ```
   Environ 1 h 30 : chaque niveau est construit depuis sa fiche (`Doom\profil\fiches\E<n>\carte.json`), contrôlé, puis le
   jeu est compilé en Shipping et packagé dans `C:\workspace IA\Unreal\DOOMED_jeu\Windows\Doom.exe`. Le journal est dans
   `Doom\profil\fiches\bilan.txt`.

Ensuite, seuls les niveaux modifiés sont reconstruits (empreinte de la fiche et du constructeur) et le cook est
incrémental :
```
python Doom\outils\fabriquer_jeu.py                     niveaux modifiés seulement
python Doom\outils\fabriquer_jeu.py --niveaux 5,18-20   ces niveaux en plus
python Doom\outils\fabriquer_jeu.py --sans-reconstruire packaging seul
```

## Pour bricoler

- **Un niveau** : éditer sa grille dans `Doom\profil\fiches\E<n>\carte.json` (ou avec l'éditeur de niveaux,
  `Doom\Editeur_niveaux.bat`), puis relancer `fabriquer_jeu.py`. `Doom\Tester_niveau.bat <n>` ouvre un niveau dans
  l'éditeur pour y jouer. Légende des cases et règles : `Doom\profil\jeu.json`.
- **La logique de jeu** (portes, secrets, lave, objets, monstres) : fichiers `Doom\outils\dsl\*.dsl`, réécrits dans les
  Blueprints par `creer_acteurs.py`.
- **La construction d'un niveau** (murs, instances, lumières, ciel) : `Doom\outils\construire_niveau.py`.
- **Taille du jeu** : textures plafonnées à 1024 px pour le jeu (`Config\DefaultDeviceProfiles.ini`), paquet compressé
  (`Config\DefaultGame.ini`), plugins limités à l'éditeur (`Doom.uproject`).

L'écriture de nouveaux niveaux et monstres par un modèle de langage local (LM Studio) et ComfyUI (`methode\enchainer.py`)
est aussi là, mais demande une installation à part, non décrite ici.

## Licences

Textures et sprites d'origine : Freedoom (licence de type BSD, voir [`../licences/freedoom/`](../licences/freedoom/)).
Unreal® Engine : Epic Games, Inc. Les packs Fab et le modèle de projet restent sous leurs propres licences et ne sont
pas inclus ici.
