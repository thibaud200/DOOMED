"""Version « haute définition » des images de DOOMED pour Unreal : agrandissement par IA (ComfyUI, 4x-UltraSharp).

    python agrandir.py [murs] [sprites] [objets]      (sans argument : tout)

Sorties dans DOOMED_import\\hd\\ :
  murs\\<NOM>.png + <NOM>_N.png   textures murales et sols ×16 (deux passes ×4), raccords conservés (l'image est agrandie
                                  au milieu d'une mosaïque 3 × 3 d'elle-même, puis recadrée) ; _N = carte de relief (normales)
  planches\\<type>.png             planches de sprites ×4 (couleur et transparence agrandies séparément) + planches.json
  objets\\<nom>.png                objets à ramasser ×4
ComfyUI doit tourner (modèle 4x-UltraSharp.pth dans models\\upscale_models) ; aucune autre dépendance que Pillow.
"""
import json, shutil, sys
from pathlib import Path
from PIL import Image, ImageFilter

sys.path.insert(0, r'C:\workspace IA\Doom\outils')
import comfy_doomed as comfy            # client ComfyUI du jeu HTML (envoi d'image, exécution d'un graphe)

IMPORT = Path(r'C:\workspace IA\Unreal\DOOMED_import')
HD = IMPORT / 'hd'
MODELE = '4x-UltraSharp.pth'
MURS = {'BRICK7': 'textures', 'STARTAN3': 'textures', 'EXITSTON': 'textures', 'BIGDOOR2': 'textures',
        'FLOOR4_8': 'sols', 'CEIL3_5': 'sols', 'LAVA1': 'sols',
        'RROCK18': 'sols', 'ROCK4': 'textures', 'RROCK05': 'sols'}       # extérieurs : terre, falaise, roche brûlée
OBJETS = {'medkit': 'MEDI_A_0', 'ammo': 'SHEL_A_0', 'armor': 'ARM1_A_0', 'bullets': 'CLIP_A_0', 'rockets': 'ROCK_A_0',
          'berserk': 'PSTR_A_0', 'invis': 'PINS_A_0', 'mega': 'MEGA_A_0', 'backpack': 'BPAK_A_0',
          'keyRed': 'RKEY_A_0', 'keyBlue': 'BKEY_A_0', 'keyYellow': 'YKEY_A_0'}


def x4(img, nom):
    """Une passe ×4 du modèle sur une image RGB."""
    graphe = {
        '1': {'class_type': 'LoadImage', 'inputs': {'image': comfy.envoyer(img.convert('RGB'), nom)}},
        '2': {'class_type': 'UpscaleModelLoader', 'inputs': {'model_name': MODELE}},
        '3': {'class_type': 'ImageUpscaleWithModel', 'inputs': {'upscale_model': ['2', 0], 'image': ['1', 0]}},
        '4': {'class_type': 'SaveImage', 'inputs': {'images': ['3', 0], 'filename_prefix': 'doomed_hd/' + nom}},
    }
    return comfy.executer(graphe, '4')


def raccordable_x4(img, nom):
    """×4 sans couture : on agrandit la mosaïque 3 × 3 et on garde la case du milieu."""
    w, h = img.size
    mos = Image.new('RGB', (3 * w, 3 * h))
    for i in range(3):
        for j in range(3):
            mos.paste(img, (i * w, j * h))
    return x4(mos, nom).crop((4 * w, 4 * h, 8 * w, 8 * h))


def normales(img, force=6.0):
    """Carte de normales (espace tangent) tirée de la luminosité : les joints sombres deviennent des creux."""
    g = img.convert('L').filter(ImageFilter.GaussianBlur(1.5))
    w, h = g.size
    p = g.load()
    out = Image.new('RGB', (w, h))
    q = out.load()
    for y in range(h):
        for x in range(w):
            dx = (p[(x + 1) % w, y] - p[(x - 1) % w, y]) / 255 * force
            dy = (p[x, (y + 1) % h] - p[x, (y - 1) % h]) / 255 * force
            n = (-dx, -dy, 1.0)
            l = (n[0] ** 2 + n[1] ** 2 + 1) ** .5
            q[x, y] = tuple(int((c / l * .5 + .5) * 255) for c in n)
    return out


def rgba_x4(im, nom):
    """Sprite transparent : la couleur (sur fond noir) et la transparence passent chacune par le modèle."""
    noir = Image.new('RGB', im.size)
    noir.paste(im, (0, 0), im)
    coul = x4(noir, nom + '_c')
    alpha = x4(im.getchannel('A').convert('RGB'), nom + '_a').convert('L').point(lambda v: 255 if v > 110 else 0)
    coul.putalpha(alpha)
    return coul


def murs(seuls=None):
    (HD / 'murs').mkdir(parents=True, exist_ok=True)
    for nom, dossier in MURS.items():
        if seuls and nom not in seuls:
            continue
        src = Image.open(IMPORT / 'freedoom' / dossier / f'{nom}.png').convert('RGB')
        # adoucir d'abord (×2 bicubique + léger flou) : sur les gros pixels bruts, le modèle invente un quadrillage
        doux = src.resize((src.width * 2, src.height * 2), Image.BICUBIC).filter(ImageFilter.GaussianBlur(0.8))
        a = raccordable_x4(doux, nom)
        if max(a.size) < 1024:                                   # 64 px de côté : deuxième passe
            a = raccordable_x4(a, nom + '_2')
        a.save(HD / 'murs' / f'{nom}.png')
        normales(a.resize((a.width // 2, a.height // 2), Image.LANCZOS)).resize(a.size, Image.BICUBIC).save(HD / 'murs' / f'{nom}_N.png')
        print('mur', nom, src.size, '->', a.size)
        comfy.liberer()


def sprites():
    (HD / 'planches').mkdir(parents=True, exist_ok=True)
    meta = json.loads((IMPORT / 'planches' / 'planches.json').read_text(encoding='utf-8'))
    for nom, m in meta.items():
        if isinstance(m, dict):
            rgba_x4(Image.open(IMPORT / 'planches' / f'{nom}.png').convert('RGBA'), 'pl_' + nom).save(HD / 'planches' / f'{nom}.png')
            print('planche', nom)
    shutil.copy(IMPORT / 'planches' / 'planches.json', HD / 'planches' / 'planches.json')   # cases et ancrages inchangés (en pixels d'origine)
    comfy.liberer()


def objets():
    (HD / 'objets').mkdir(parents=True, exist_ok=True)
    for nom, img in OBJETS.items():
        rgba_x4(Image.open(IMPORT / 'freedoom' / 'sprites' / img[:4] / f'{img}.png').convert('RGBA'), 'obj_' + nom).save(HD / 'objets' / f'{nom}.png')
    print('objets', len(OBJETS))
    comfy.liberer()


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    # python agrandir.py murs LAVA1 : seulement ces textures (noms en capitales)
    seuls = [a for a in sys.argv[1:] if a.isupper() or a[0].isdigit()]
    quoi = [a for a in sys.argv[1:] if a not in seuls] or ['murs', 'sprites', 'objets']
    for q in quoi:
        murs(seuls) if q == 'murs' else {'sprites': sprites, 'objets': objets}[q]()
