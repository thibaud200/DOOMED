"""Bruitages de Freedoom pour DOOMED : extrait les sons DS* de freedoom2.wad (format DMX, 8 bits non signés).

    python outils\\sons_freedoom.py            → js\\01e_sons_freedoom.js (lu par js\\03c_sons.js)

Format DMX : u16 format (3), u16 fréquence, u32 nombre d'échantillons, puis les échantillons ; les 16 premiers et les
16 derniers sont du remplissage et sont retirés. Licence : celle de Freedoom (BSD modifiée), voir CREDITS.md.
"""
import base64, json, struct
from pathlib import Path

ICI = Path(__file__).resolve().parent.parent
WAD = ICI / 'ressources' / 'freedoom' / 'freedoom2.wad'
SORTIE = ICI / 'js' / '01e_sons_freedoom.js'


def lumps(d):
    n, off = struct.unpack_from('<ii', d, 4)
    for i in range(n):
        p, taille, nom = struct.unpack_from('<ii8s', d, off + 16 * i)
        yield nom.rstrip(b'\0').decode('ascii', 'replace'), d[p:p + taille]


if __name__ == '__main__':
    sons = {}
    for nom, data in lumps(WAD.read_bytes()):
        if not nom.startswith('DS') or len(data) < 8:
            continue
        fmt, freq, n = struct.unpack_from('<HHI', data, 0)
        if fmt != 3:
            continue
        pcm = data[8:8 + n]
        if len(pcm) > 32:
            pcm = pcm[16:-16]
        sons[nom] = {'f': freq, 'd': base64.b64encode(pcm).decode()}
    js = ('"use strict";\n/* DOOMED — 01e_sons_freedoom.js : bruitages de Freedoom (sons DMX de freedoom2.wad : 8 bits non signés,\n'
          ' * en base64, avec leur fréquence). Fichier généré par outils\\sons_freedoom.py — ne pas modifier à la main.\n'
          ' * Licence Freedoom (BSD modifiée) : voir CREDITS.md.\n *\n'
          ' * CONTRAT (vérifié par test.html — ne rien retirer de cette liste) :\n'
          ' *   FOURNIT : SONS_FREEDOOM\n */\n'
          'const SONS_FREEDOOM = ' + json.dumps(sons, separators=(',', ':')) + ';\n')
    SORTIE.write_text(js, encoding='utf-8')
    print(f'{len(sons)} sons → {SORTIE} ({SORTIE.stat().st_size // 1024} Ko)')
