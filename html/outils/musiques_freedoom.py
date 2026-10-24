"""Musiques de Freedoom pour DOOMED : extrait les morceaux MIDI et la banque d'instruments GENMIDI de freedoom2.wad.

    python outils\\musiques_freedoom.py            → js\\01d_musiques_freedoom.js (lu par js\\03b_musique.js)

Les morceaux sont gardés dans l'ordre du WAD, qui est celui des cartes (D_RUNNIN = carte 1, D_STALKS = carte 2…) ;
le titre (D_DM2TTL), l'entracte (D_DM2INT) et l'écran de texte (D_READ_M) sont mis à part.
Licence : celle de Freedoom (BSD modifiée), voir ressources\\freedoom\\COPYING.txt et CREDITS.md.
"""
import base64, json, struct
from pathlib import Path

ICI = Path(__file__).resolve().parent.parent
WAD = ICI / 'ressources' / 'freedoom' / 'freedoom2.wad'
SORTIE = ICI / 'js' / '01d_musiques_freedoom.js'
A_PART = {'D_DM2TTL': 'titre', 'D_DM2INT': 'entracte', 'D_READ_M': 'texte'}


def lumps(d):
    n, off = struct.unpack_from('<ii', d, 4)
    for i in range(n):
        p, taille, nom = struct.unpack_from('<ii8s', d, off + 16 * i)
        yield nom.rstrip(b'\0').decode('ascii', 'replace'), d[p:p + taille]


if __name__ == '__main__':
    d = WAD.read_bytes()
    b64 = lambda b: base64.b64encode(b).decode()
    pistes, autres, genmidi = [], {}, None
    for nom, data in lumps(d):
        if nom == 'GENMIDI':
            genmidi = data
        elif nom.startswith('D_') and data[:4] == b'MThd':
            (autres.__setitem__(A_PART[nom], {'nom': nom, 'midi': b64(data)}) if nom in A_PART
             else pistes.append({'nom': nom, 'midi': b64(data)}))
    assert genmidi and pistes, 'GENMIDI ou musiques introuvables dans le WAD'
    js = ('"use strict";\n/* DOOMED — 01d_musiques_freedoom.js : musiques de Freedoom (fichiers MIDI de freedoom2.wad, en base64)\n'
          ' * et banque d\'instruments OPL2 GENMIDI. Fichier généré par outils\\musiques_freedoom.py — ne pas modifier à la main.\n'
          ' * Licence Freedoom (BSD modifiée) : voir CREDITS.md.\n *\n'
          ' * CONTRAT (vérifié par test.html — ne rien retirer de cette liste) :\n'
          ' *   FOURNIT : MUSIQUES_FREEDOOM\n */\n'
          'const MUSIQUES_FREEDOOM = ' + json.dumps({'genmidi': b64(genmidi), 'pistes': pistes, **autres}) + ';\n')
    SORTIE.write_text(js, encoding='utf-8')
    print(f'{len(pistes)} morceaux de niveau + {", ".join(autres)} → {SORTIE} ({SORTIE.stat().st_size // 1024} Ko)')
