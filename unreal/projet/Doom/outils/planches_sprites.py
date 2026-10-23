"""Planches de sprites pour Unreal : une texture par monstre, 8 colonnes (rotations 1 à 8) × une ligne par image Doom.

    python planches_sprites.py        (lit DOOMED_import\\freedoom, écrit DOOMED_import\\planches\\*.png + planches.json)

Chaque case a la même taille et le même point d'ancrage (pied du monstre, centre horizontal) : le jeu n'a qu'à choisir
la case, sans recaler l'image. Une image sans rotation (« 0 », mort, cadavre) est recopiée dans les 8 colonnes.
Les monstres créés pour DOOMED (sporeling, vulture) n'existent qu'en vue de face 64×64 : leur planche reprend
textures\\<type><pose>.png dans les 8 colonnes, ancrée en bas.
"""
import json
from pathlib import Path
from PIL import Image

IMPORT = Path(r'C:\workspace IA\Unreal\DOOMED_import')
FD = IMPORT / 'freedoom'
SORTIE = IMPORT / 'planches'

# monstre -> préfixe Freedoom et rôle de chaque image (états de Doom 1)
DOOM = {
    'imp':      ('TROO', {'marche': 'ABCD', 'attaque': 'EFG', 'douleur': 'H', 'mort': 'IJKLM'}),
    'pinky':    ('SARG', {'marche': 'ABCD', 'attaque': 'EFG', 'douleur': 'H', 'mort': 'IJKLMN'}),
    'caco':     ('HEAD', {'marche': 'A', 'attaque': 'BCD', 'douleur': 'EF', 'mort': 'GHIJKL'}),
    'soldier':  ('POSS', {'marche': 'ABCD', 'attaque': 'EF', 'douleur': 'G', 'mort': 'HIJKL'}),
    'lostsoul': ('SKUL', {'marche': 'AB', 'attaque': 'CD', 'douleur': 'E', 'mort': 'FGHIJK'}),
    'baron':    ('BOSS', {'marche': 'ABCD', 'attaque': 'EFG', 'douleur': 'H', 'mort': 'IJKLMNO'}),
}
IA = {'sporeling': None, 'vulture': None}          # poses : A, B (marche), Atk, Pain, Corpse
# + monstres créés par le modèle local (creer_monstre.py : Doom\profil\monstres\<type>.json)
IA.update({json.loads(f.read_text(encoding='utf-8'))['type']: None
           for f in sorted((Path(__file__).resolve().parent.parent / 'profil' / 'monstres').glob('*.json'))})
PROJECTILES = {'fireball': 'BAL1', 'fireballBlue': 'BAL2', 'fireballGreen': 'BAL7'}


def planche_doom(prefixe, roles, infos):
    lettres = ''.join(roles.values())
    vues = {}                                           # (lettre, colonne 0..7) -> (image, ancrage gauche, ancrage haut)
    for l in lettres:
        for col in range(8):
            cle = next(k for k in (f'{prefixe}_{l}_{col + 1}', f'{prefixe}_{l}_0') if k in infos)
            i = infos[cle]
            vues[l, col] = (Image.open(FD / 'sprites' / prefixe / f'{cle}.png'), i['gauche'], i['haut'])
    g = max(a for _, a, _ in vues.values()); d = max(im.width - a for im, a, _ in vues.values())
    h = max(t for _, _, t in vues.values()); b = max(0, max(im.height - t for im, _, t in vues.values()))
    demi = max(g, d)
    cw, ch = 2 * demi, h + b
    out = Image.new('RGBA', (8 * cw, len(lettres) * ch), (0, 0, 0, 0))
    for (l, col), (im, a, t) in vues.items():
        out.paste(im, (col * cw + demi - a, lettres.index(l) * ch + h - t), im)
    lignes, k = {}, 0
    for role, ls in roles.items():
        lignes[role] = [k, len(ls)]; k += len(ls)
    return out, {'case': [cw, ch], 'pied': h, 'lignes': lignes, 'nb_lignes': len(lettres)}


def planche_ia(type_):
    poses = ['A', 'B', 'Atk', 'Pain', 'Corpse']
    ims = [Image.open(IMPORT / 'textures' / f'{type_}{p}.png') for p in poses]
    cw, ch = ims[0].size
    out = Image.new('RGBA', (8 * cw, len(ims) * ch), (0, 0, 0, 0))
    for r, im in enumerate(ims):
        for col in range(8):
            out.paste(im, (col * cw, r * ch), im)
    return out, {'case': [cw, ch], 'pied': ch, 'lignes': {'marche': [0, 2], 'attaque': [2, 1], 'douleur': [3, 1], 'mort': [4, 1]},
                 'nb_lignes': len(ims)}


def main():
    infos = json.loads((FD / 'freedoom.json').read_text(encoding='utf-8'))['sprites']
    SORTIE.mkdir(exist_ok=True)
    meta = {'cm_par_pixel': 3.2, 'note': 'joueur Doom = 56 unités = 180 cm ; une unité Doom ≈ un pixel de sprite'}
    for type_, (pre, roles) in DOOM.items():
        im, m = planche_doom(pre, roles, infos)
        im.save(SORTIE / f'{type_}.png'); meta[type_] = m
    for type_ in IA:
        im, m = planche_ia(type_)
        im.save(SORTIE / f'{type_}.png'); meta[type_] = m
    for nom, pre in PROJECTILES.items():
        im, m = planche_doom(pre, {'vol': 'AB', 'impact': 'CDE'}, infos)
        im.save(SORTIE / f'{nom}.png'); meta[nom] = m
    (SORTIE / 'planches.json').write_text(json.dumps(meta, indent=1, ensure_ascii=False), encoding='utf-8')
    for k, v in meta.items():
        if isinstance(v, dict):
            print(k, v['case'], v['nb_lignes'], 'lignes')


if __name__ == '__main__':
    main()
