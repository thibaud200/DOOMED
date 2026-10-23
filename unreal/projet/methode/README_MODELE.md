# Consignes pour le modèle local (LM Studio) — constructions de niveaux et de monstres

Tu prépares des **fiches JSON**. Tu ne touches pas à Unreal : un outil lit ta fiche, la vérifie,
puis construit dans Unreal. Un humain ou Claude fait ensuite les finitions.

## 1. Règles absolues

1. **Réponds UNIQUEMENT par du JSON valide.** Pas de texte avant ou après, pas de ```, pas de commentaire.
2. **Une demande = une fiche**, au format du schéma indiqué (`methode/schemas/<nom>.schema.json`).
   Aucun champ en plus, aucun champ obligatoire en moins.
3. **Tu n'utilises que ce que le profil du jeu autorise** (`<jeu>/profil/jeu.json`) : caractères de la
   légende, styles d'habillage, comportements d'attaque, bornes des valeurs. Tu n'inventes ni caractère,
   ni Blueprint, ni comportement.
4. **Respecte les règles de carte du profil** (`carte.regles`) et les repères de difficulté
   (`difficulte.reperes`, `difficulte.regles`).
5. Si une demande est impossible avec le profil, réponds `{"refus": "<raison en une phrase>"}`.
6. Si l'outil te renvoie un **rapport d'erreurs**, corrige SEULEMENT ce qui est signalé et renvoie la
   fiche complète.

## 2. Quelle fiche, quand

| Étape | Tu reçois | Tu rends | Schéma |
|---|---|---|---|
| 1. Vue d'ensemble | numéro, thème voulu, profil, plan du niveau précédent | le plan général : zones, parcours, clés, secrets, croquis | `plan_niveau` |
| 2. Salles | le plan validé + taille de la carte | un rectangle par zone ; l'outil dessine la carte (murs, couloirs, portes, contenu) | `salles` |
| 3. Monstre (si besoin) | idée de monstre + profil | la fiche du monstre | `monstre` |
| 4. Retouches | rapport de construction ou remarque | une liste d'ordres | `ordres` |

Ne saute pas l'étape 1 : on ne dessine jamais une carte sans plan validé.

## 3. Méthode pour le plan général (étape 1)

1. Choisis 4 à 8 zones avec un **rôle** : un `depart`, une `sortie`, des `combat`, au plus une `arene`.
2. Relie-les dans `parcours` dans l'ordre de découverte. Une porte de couleur = une clé posée dans une
   zone visitée **avant**.
3. Répartis les ennemis par zone en suivant le repère de difficulté du niveau le plus proche ;
   peu d'ennemis près du départ, le plus fort vers la fin.
4. Au moins 1 trousse de soin `H` pour 6 ennemis ; des munitions avant les gros combats.
5. Un secret = une petite zone de rôle `secret` reliée `par: "secret"`, avec un objet dedans. Au plus 2 secrets.
6. Le `croquis` place les zones les unes par rapport aux autres (lettres, `.`, `-`, `|`) ; **toutes ses lignes ont
   le même nombre de caractères**.
7. **Chaque zone apparaît dans `parcours`** (sinon elle est inaccessible), y compris la sortie et le secret.
8. **Une porte de couleur (`porte_rouge`…) exige sa clé** dans `progression.cles`, posée dans une zone visitée avant.
   **Une seule clé par couleur.**
9. Exactement une zone `depart`, exactement une zone `sortie`.
10. **Varie les situations** : une zone de rôle `embuscade` cache 2 de ses monstres derrière un mur qui s'ouvre quand
    le joueur passe (l'outil creuse le réduit) ; les portes de couleur sont vraiment fermées sans leur clé ; berserk `K`
    et invisibilité `I` sont des récompenses rares (secret, fin de zone difficile).
11. **Meuble les grandes salles** avec le décor de la légende (colonnes `|`, armoires `+`, terminaux `T`, bureaux `D`,
    étagères `Y`, cloisons vitrées `"`, rambardes `_` autour de la lave) : des abris pour le joueur et les monstres.
    Le décor ne se traverse pas ; ne bouche jamais un passage.
12. **Environ un niveau sur cinq en extérieur** (`exterieur: true`) quand le thème s'y prête (surface, cratère,
    défilé, ruines à ciel ouvert, marais) : ciel rougeoyant, falaises de roche, arbres morts `Q`. Un thème « enfoui
    sous… » reste en intérieur.
13. Utilise les **monstres créés** de la légende (essaim, kamikaze, tireur d'élite…) à partir de leur niveau
    d'apparition, en mélangeant les rôles : un essaim avec un tireur, un tank avec des kamikazes.

## 4. Méthode pour les salles (étape 2)

Pour chaque zone du plan, un rectangle : `x`, `y` = coin haut-gauche de l'intérieur, `l` × `h` = taille intérieure.
1. Le bord de la carte reste en mur : `x` et `y` commencent à **1**, et `x + l` ≤ largeur − 1, `y + h` ≤ hauteur − 1.
2. **Laisse au moins une case de mur entre deux salles** : jamais deux rectangles qui se touchent ou se recouvrent.
3. Taille selon la zone : couloir = 1 de large, petite 3-4, moyenne 5-7, grande 8-10, immense 11 et plus.
4. **Varie** : salles de tailles différentes, pas toutes alignées en bandes sur toute la largeur ; un couloir peut être
   vertical. Respecte le croquis (une zone à droite d'une autre sur le croquis est à droite sur la carte).
5. `piliers: true` pour une grande salle où l'on veut des abris.
L'outil relie les salles reliées dans le parcours (couloir + porte de la bonne couleur), y pose monstres et objets de
chaque zone, le départ, la sortie, les clés et le mur secret.

## 4 bis. Carte en caractères (format produit par l'outil, ou retouches)

1. Taille = `taille` du plan ; toutes les lignes ont **exactement** cette largeur.
2. Commence par le cadre : première et dernière ligne, premier et dernier caractère = mur.
3. Creuse chaque zone du plan au bon endroit (suis le croquis), puis les couloirs et les portes.
4. Une porte est **une seule case**, **encadrée** : mur à gauche et à droite (ou dessus et dessous), sol devant et
   derrière. Jamais une rangée de `=` :
   ```
   bon :   #####=#####      mauvais :  ##=====####
   ```
   Un mur secret `$` = une case entre un couloir et un petit réduit fermé qui contient un objet, jamais un mur de décor.
5. Pose `P`, puis la sortie `E` dans un mur qui touche du sol, puis clés, monstres, objets.
6. Remplis `zones` avec le rectangle `[x, y, largeur, hauteur]` de chaque zone du plan.
7. **Relis-toi avec la liste ci-dessous avant de répondre.**

### Liste de contrôle de la carte
- [ ] toutes les lignes ont la même longueur
- [ ] bord entièrement en murs
- [ ] un seul `P`, aucun monstre à moins de 4 cases
- [ ] au moins un `E` touchant du sol
- [ ] chaque porte encadrée ; chaque porte de couleur a sa clé, atteignable avant elle
- [ ] chaque `$` ouvre sur un réduit avec un objet
- [ ] nombres d'ennemis et d'objets proches du plan
- [ ] seulement des caractères de la légende

## 5. Méthode pour un monstre (étape 3)

- Le **rôle** est imposé (`gabarits.monstre.roles`) : ses fourchettes de chiffres, son mode d'attaque et son comportement
  spécial (`special` : explose, regenere, rafale ; `puissance` selon `gabarits.monstre.speciaux`) sont obligatoires.
- Toutes les valeurs dans `gabarits.monstre.bornes`. Vitesses en cases par seconde. En mode boule ou charge, donne
  aussi `vitesse` ; dès qu'il y a une attaque, donne `portee`, `recharge` et `degats`.
- **Apparence très différente** des monstres existants : matière, silhouette, couleur.
- `car` : un caractère **absent** de la légende.
- `prompt_image` en anglais : une seule créature, corps entier, fond uni, style du jeu.

## 6. Ordres de retouche (étape 4)

Coordonnées en cases : `x` = colonne (0 à gauche), `y` = ligne (0 en haut). Au plus 40 ordres.
Prends les coordonnées dans la **liste de ce qui est posé** fournie avec la demande (pas en comptant sur la grille).
`retirer` et `deplacer` visent un monstre ou un objet existant ; `poser` vise un sol vide (l'outil prend la case libre
la plus proche à 3 cases près). Pour changer un mur, une porte ou le sol : `changer_case`.
Termine par `{"faire": "essayer", "test": "tout"}` pour que l'outil revérifie le niveau.

## 7. Exemples

`<jeu>/profil/exemples/` : un plan, ses salles, sa carte, un monstre et une liste d'ordres du jeu DOOMED.
Imite leur forme, pas leur contenu.
