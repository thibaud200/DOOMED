#!/usr/bin/env python3
"""DOOMED — interface_freedoom.py : images d'interface de Freedoom (barre d'état, chiffres, visages, clés, police,
curseur et réglettes des menus, écran de statistiques, fonds) tirées de ressources/freedoom/freedoom2.wad.

    python outils/interface_freedoom.py            → js/01f_interface_freedoom.js (INTERFACE_FREEDOOM)
    python outils/interface_freedoom.py --planche  (en plus : outils/images_revue/interface_planche.png)

Les images portant du texte anglais (« AMMO », « HEALTH », « ARMS »…) sont refaites en français : les lettres du bandeau
sont effacées (rangée du dessus recopiée) puis réécrites avec la police de Doom (STCFN) éclaircie. Les menus et les
libellés de l'écran de statistiques sont écrits par le jeu avec cette police (texteDoom, 07b_interface.js).
Images : Copyright © 2001-2024 Contributors to the Freedoom project, licence de type BSD 3 clauses (CREDITS.md).
"""
import base64, io, json, sys
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import freedoom_doomed as F

ROOT = Path(__file__).resolve().parent.parent
SORTIE = ROOT / 'js' / '01f_interface_freedoom.js'
NOMS = (['STBAR', 'STARMS', 'STTPRCNT', 'STTMINUS', 'M_SKULL1', 'M_SKULL2', 'M_THERML', 'M_THERMM', 'M_THERMR', 'M_THERMO',
         'M_LSLEFT', 'M_LSCNTR', 'M_LSRGHT', 'WIPCNT', 'WIMINUS', 'WICOLON', 'INTERPIC', 'BOSSBACK', 'STFGOD0', 'STFDEAD0']
        + [f'{p}{i}' for p in ('STTNUM', 'STYSNUM', 'STGNUM', 'WINUM') for i in range(10)]
        + [f'STKEYS{i}' for i in range(6)]
        + [f'STF{k}{n}{c}' for n in range(5) for k, c in (('ST', 0), ('ST', 1), ('ST', 2), ('TL', 0), ('TR', 0))]
        + [f'STF{k}{n}' for n in range(5) for k in ('OUCH', 'EVL', 'KILL')]
        + [f'STCFN{i:03d}' for i in range(33, 96)])


def png(im):
    b = io.BytesIO(); im.save(b, 'PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()


# petite police des libellés de la barre (5 px de haut, comme « AMMO », « HEALTH » d'origine) : la police STCFN
# fait 7 px et devient illisible une fois écrasée
PETITE = {
    'A': [' ### ', '#   #', '#####', '#   #', '#   #'], 'E': ['#####', '#    ', '#### ', '#    ', '#####'],
    'I': ['###', ' # ', ' # ', ' # ', '###'], 'M': ['#   #', '## ##', '# # #', '#   #', '#   #'],
    'N': ['#   #', '##  #', '# # #', '#  ##', '#   #'], 'R': ['#### ', '#   #', '#### ', '#  # ', '#   #'],
    'S': [' ####', '#    ', ' ### ', '    #', '#### '], 'T': ['#####', '  #  ', '  #  ', '  #  ', '  #  '],
    'U': ['#   #', '#   #', '#   #', '#   #', ' ### '], '.': [' ', ' ', ' ', ' ', '#'],
}


def ecrire_libelle(fond, texte, x0, x1, lignes=(24, 29)):
    """Efface les lettres du bandeau entre x0 et x1 (rangée du dessus recopiée) puis y centre texte (gris clair,
    ombre sombre en bas à droite, comme les libellés gravés d'origine)."""
    px = fond.load()
    for x in range(x0, x1):
        for y in range(*lignes):
            px[x, y] = px[x, lignes[0] - 1]
    largeur = sum(len(PETITE[c][0]) + 1 for c in texte) - 1
    x = x0 + (x1 - x0 - largeur) // 2
    for c in texte:
        g = PETITE[c]
        for dy, ligne in enumerate(g):
            for dx, v in enumerate(ligne):
                if v == '#':
                    if x + dx + 1 < fond.width and lignes[0] + dy + 1 < fond.height:
                        px[x + dx + 1, lignes[0] + dy + 1] = (40, 40, 40, 255)
        for dy, ligne in enumerate(g):
            for dx, v in enumerate(ligne):
                if v == '#':
                    px[x + dx, lignes[0] + dy] = (200, 200, 200, 255)
        x += len(g[0]) + 1


if __name__ == '__main__':
    w = F.Wad(F.WAD)
    images = {n: w.image(n) for n in NOMS}
    # barre d'état en français : panneau ARMES posé à x 104 (comme Doom en solo), libellés traduits
    bar = images['STBAR'].copy()
    bar.alpha_composite(images['STARMS'], (104, 0))
    for texte, x0, x1 in (('MUNIT.', 4, 44), ('SANTE', 48, 101), ('ARMES', 106, 141), ('ARMURE', 179, 230)):
        ecrire_libelle(bar, texte, x0, x1)
    images['STBAR_FR'] = bar
    sortie = {n: {'w': im.width, 'h': im.height, 'img': png(im)} for n, im in images.items()}
    js = ('"use strict";\n/* DOOMED — 01f_interface_freedoom.js : images d\'interface de Freedoom (GÉNÉRÉ par outils/interface_freedoom.py\n'
          ' * depuis ressources/freedoom/freedoom2.wad, ne pas modifier à la main). Licence de type BSD 3 clauses : CREDITS.md.\n *\n'
          ' * CONTRAT (vérifié par test.html — ne rien retirer de cette liste) :\n'
          ' *   FOURNIT : INTERFACE_FREEDOOM\n'
          ' *             INTERFACE_FREEDOOM.<nom Doom> = { w, h, img } (img : PNG en data URL ; STBAR_FR = barre traduite)\n */\n'
          'const INTERFACE_FREEDOOM = ' + json.dumps(sortie, separators=(',', ':')) + ';\n')
    SORTIE.write_text(js, encoding='utf-8')
    print(f'{len(sortie)} images → {SORTIE} ({SORTIE.stat().st_size // 1024} Ko)')
    if '--planche' in sys.argv:
        d = ROOT / 'outils' / 'images_revue'; d.mkdir(exist_ok=True)
        bar.resize((bar.width * 3, bar.height * 3), Image.NEAREST).save(d / 'interface_barre.png')
        print('planche :', d / 'interface_barre.png')
