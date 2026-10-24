#!/usr/bin/env python3
"""DOOMED — freedoom_doomed.py : sprites, textures et armes en main tirés de Freedoom (ressources/freedoom/freedoom2.wad).

Freedoom (https://freedoom.github.io/) est sous licence de type BSD 3 clauses : voir ressources/freedoom/COPYING.txt
(à conserver avec le projet) et CREDITS.txt pour les auteurs.

Chaîne : lecture du WAD (format « picture » de Doom + palette PLAYPAL, textures TEXTURE1/PNAMES, sols 64×64),
mise à la taille exacte attendue par le jeu (monstres et murs 64×64, objets 32×32, armes au sol 64×24, ciel 256×128 entier,
armes en main agrandies ×1,5 car l'écran du jeu fait 480 de large contre 320 dans Doom), puis écriture de
js/01c_images_freedoom.js : IMAGES_FREEDOOM.<nom de TX> = { w, h, tr, pal, d } (même format que js/01b_images_ia.js).
Le jeu consulte IMAGES_FREEDOOM avant IMAGES_IA : les monstres créés par le modèle (absents de Freedoom) gardent
leurs images ComfyUI.

    python outils/freedoom_doomed.py            (régénère js/01c_images_freedoom.js)
    python outils/freedoom_doomed.py --planche  (en plus : outils/images_revue/freedoom_planche.png)
"""
import base64, json, struct, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
WAD = ROOT / 'ressources' / 'freedoom' / 'freedoom2.wad'
SORTIE = ROOT / 'js' / '01c_images_freedoom.js'

# monstres du jeu → préfixe Freedoom et image de chaque pose (lettre de l'image ; vue de face, rotation 1, ou 0)
MONSTRES = {
    'imp':      ('TROO', {'A': 'A', 'B': 'C', 'Atk': 'F', 'Pain': 'H', 'Corpse': 'M'}),
    'pinky':    ('SARG', {'A': 'A', 'B': 'C', 'Atk': 'F', 'Pain': 'H', 'Corpse': 'N'}),
    'caco':     ('HEAD', {'A': 'A', 'B': 'B', 'Atk': 'C', 'Pain': 'E', 'Corpse': 'L'}),
    'soldier':  ('POSS', {'A': 'A', 'B': 'C', 'Atk': 'F', 'Pain': 'G', 'Corpse': 'L'}),
    'lostsoul': ('SKUL', {'A': 'A', 'B': 'B', 'Atk': 'C', 'Pain': 'E', 'Corpse': 'I'}),
    'baron':    ('BOSS', {'A': 'A', 'B': 'C', 'Atk': 'F', 'Pain': 'H', 'Corpse': 'O'}),
    # bestiaire complet de Doom II (lot 4) : le spectre reprend les images du pinky (dessiné en flou par le rendu)
    'sergent':     ('SPOS', {'A': 'A', 'B': 'C', 'Atk': 'F', 'Pain': 'G', 'Corpse': 'L'}),
    'commando':    ('CPOS', {'A': 'A', 'B': 'C', 'Atk': 'F', 'Pain': 'G', 'Corpse': 'N'}),
    'chevalier':   ('BOS2', {'A': 'A', 'B': 'C', 'Atk': 'F', 'Pain': 'H', 'Corpse': 'O'}),
    'revenant':    ('SKEL', {'A': 'A', 'B': 'C', 'Atk': 'J', 'Pain': 'L', 'Corpse': 'Q'}),
    'mancubus':    ('FATT', {'A': 'A', 'B': 'C', 'Atk': 'H', 'Pain': 'J', 'Corpse': 'T'}),
    'arachno':     ('BSPI', {'A': 'A', 'B': 'C', 'Atk': 'H', 'Pain': 'I', 'Corpse': 'P'}),
    'elementaire': ('PAIN', {'A': 'A', 'B': 'B', 'Atk': 'E', 'Pain': 'G', 'Corpse': 'M'}),
    'cyber':       ('CYBR', {'A': 'A', 'B': 'C', 'Atk': 'F', 'Pain': 'G', 'Corpse': 'P'}),
    'araignee':    ('SPID', {'A': 'A', 'B': 'C', 'Atk': 'G', 'Pain': 'I', 'Corpse': 'S'}),
    'archivile':   ('VILE', {'A': 'A', 'B': 'C', 'Atk': 'H', 'Pain': 'Q', 'Corpse': 'Z'}),
}
VOLANTS = {'caco', 'lostsoul', 'elementaire'}       # centrés verticalement (le jeu les fait flotter)
GRANDS = {'mancubus', 'arachno', 'cyber', 'araignee'}   # 96×96 : gardent leurs détails une fois agrandis
OBJETS = {   # nom TX → (image Freedoom, taille exacte du dessin du jeu)
    'medkit': ('MEDIA0', (32, 32)), 'ammo': ('SHELA0', (32, 32)), 'bullets': ('CLIPA0', (32, 32)),
    'rockets': ('ROCKA0', (32, 32)), 'armor': ('ARM1A0', (32, 32)), 'berserk': ('PSTRA0', (32, 32)),
    'invis': ('PINSA0', (32, 32)), 'mega': ('MEGAA0', (32, 32)), 'backpack': ('BPAKA0', (32, 32)),
    'keyRed': ('RKEYA0', (32, 32)), 'keyBlue': ('BKEYA0', (32, 32)), 'keyYellow': ('YKEYA0', (32, 32)),
    'shotgun': ('SHOTA0', (64, 24)), 'chaingun': ('MGUNA0', (64, 24)), 'launcher': ('LAUNA0', (64, 24)),
    'fireball': ('BAL1A0', (32, 32)), 'fireballBlue': ('BAL2A0', (32, 32)), 'fireballGreen': ('BAL7A1A5', (32, 32)),
    'puff': ('PUFFB0', (32, 32)),
    # objets, armes et projectiles ajoutés (lots 4 à 6)
    'stim': ('STIMA0', (32, 32)), 'bonusSante': ('BON1A0', (32, 32)), 'bonusArmure': ('BON2A0', (32, 32)),
    'armorBlue': ('ARM2A0', (32, 32)), 'soul': ('SOULA0', (32, 32)), 'invul': ('PINVA0', (32, 32)),
    'suit': ('SUITA0', (32, 32)), 'computerMap': ('PMAPA0', (32, 32)), 'goggles': ('PVISA0', (32, 32)),
    'clipBox': ('AMMOA0', (32, 32)), 'shellBox': ('SBOXA0', (32, 32)), 'rocketBox': ('BROKA0', (32, 32)),
    'cells': ('CELLA0', (32, 32)), 'cellPack': ('CELPA0', (32, 32)),
    'chainsaw': ('CSAWA0', (64, 24)), 'plasma': ('PLASA0', (64, 24)), 'bfg': ('BFUGA0', (64, 32)),
    'shotPlasma': ('PLSSA0', (32, 32)), 'shotBfg': ('BFS1A0', (32, 32)), 'shotTracer': ('FATBA1', (32, 32)),
    'shotManc': ('MANFA1', (32, 32)), 'shotApls': ('APLSA0', (32, 32)), 'missile': ('MISLA1', (32, 32)),
    'telefog': ('TFOGA0', (32, 32)),
}
PROJECTILES = ('fireball', 'puff', 'shot', 'missile', 'telefog')   # centrés en hauteur
ARMES = {'wpPistol': 'PISGA0', 'wpShotgun': 'SHTGA0', 'wpFist': 'PUNGA0', 'wpChaingun': 'CHGGA0',
         'wpRocket': 'MISGA0', 'wpFlash': 'PISFA0', 'wpChainsaw': 'SAWGA0', 'wpChainsaw2': 'SAWGC0',
         'wpPlasma': 'PLSGA0', 'wpPlasmaFlash': 'PLSFA0', 'wpBfg': 'BFGGA0', 'wpBfgFlash': 'BFGFA0'}
ECHELLE_ARMES = 1.5
# murs : (texture Freedoom, traitement) — « haut » : les 64×64 du haut ; « reduit » : 128×128 réduit de moitié
MURS = {'brick': ('BRICK7', 'haut'), 'tech': ('STARTAN3', 'reduit'), 'door': ('BIGDOOR2', 'reduit'),
        'exit': ('EXITSTON', 'haut'), 'switchOff': ('SW1STARG', 'reduit'), 'switchOn': ('SW2STARG', 'reduit'),
         'barrier': ('METAL', 'haut')}
BANDES_PORTES = {'doorRed': 'DOORRED2', 'doorBlue': 'DOORBLU2', 'doorYellow': 'DOORYEL2'}
SOLS = {'floor': 'FLOOR4_8', 'ceil': 'CEIL3_5', 'lava': 'LAVA1', 'lava2': 'LAVA2', 'lava3': 'LAVA3', 'lava4': 'LAVA4',
        'nukage': 'NUKAGE1', 'nukage2': 'NUKAGE2', 'nukage3': 'NUKAGE3', 'gate': 'GATE1'}   # sols animés (lot 6)


class Wad:
    def __init__(self, chemin):
        self.data = data = Path(chemin).read_bytes()
        _, n, off = struct.unpack('<4sii', data[:12])
        self.lumps = {}
        for k in range(n):
            p, s, nom = struct.unpack('<ii8s', data[off + 16 * k: off + 16 * k + 16])
            self.lumps.setdefault(nom.rstrip(b'\0').decode('ascii', 'replace').upper(), (p, s))
        p, _ = self.lumps['PLAYPAL']
        self.pal = [tuple(data[p + 3 * i: p + 3 * i + 3]) for i in range(256)]
        p, _ = self.lumps['PNAMES']
        n = struct.unpack('<i', data[p:p + 4])[0]
        self.pnames = [data[p + 4 + 8 * i: p + 12 + 8 * i].rstrip(b'\0').decode('ascii', 'replace').upper() for i in range(n)]
        p, _ = self.lumps['TEXTURE1']
        n = struct.unpack('<i', data[p:p + 4])[0]
        self.textures = {}
        for o in struct.unpack(f'<{n}i', data[p + 4: p + 4 + 4 * n]):
            b = p + o
            nom = data[b:b + 8].rstrip(b'\0').decode('ascii', 'replace').upper()
            w, h = struct.unpack('<hh', data[b + 12:b + 16])
            pc = struct.unpack('<h', data[b + 20:b + 22])[0]
            self.textures[nom] = (w, h, [struct.unpack('<hhh', data[b + 22 + 10 * i: b + 28 + 10 * i]) for i in range(pc)])

    def image(self, nom):
        """Image au format « picture » de Doom (sprite ou morceau de texture), avec transparence."""
        p, s = self.lumps[nom]
        b = self.data[p:p + s]
        w, h = struct.unpack('<hh', b[:4])
        im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        px = im.load()
        for x in range(w):
            q = struct.unpack('<I', b[8 + 4 * x: 12 + 4 * x])[0]
            while b[q] != 255:
                y0, ln = b[q], b[q + 1]
                for i in range(ln):
                    if 0 <= y0 + i < h:
                        px[x, y0 + i] = self.pal[b[q + 3 + i]] + (255,)
                q += ln + 4
        return im

    def sol(self, nom):
        p, _ = self.lumps[nom]
        im = Image.new('RGBA', (64, 64))
        im.putdata([self.pal[c] + (255,) for c in self.data[p:p + 4096]])
        return im

    def texture(self, nom):
        w, h, patches = self.textures[nom]
        im = Image.new('RGBA', (w, h), (0, 0, 0, 255))
        for ox, oy, i in patches:
            pa = self.image(self.pnames[i])
            im.paste(pa, (ox, oy), pa)
        return im

    def sprite(self, prefixe, lettre):
        """Vue de face d'une image de sprite : rotation 1, ou 0 (sans rotation), éventuellement nommée en paire."""
        for nom in (f'{prefixe}{lettre}1', f'{prefixe}{lettre}0'):
            if nom in self.lumps:
                return self.image(nom)
        paire = next((k for k in self.lumps if k.startswith(f'{prefixe}{lettre}1') and len(k) == 8), None)
        if paire:
            return self.image(paire)
        raise KeyError(f'{prefixe}{lettre} introuvable dans le WAD')


def cadrer(im, taille, bas=True, agrandir=False):
    """Réduit l'image si elle dépasse la taille voulue (proportions gardées) — ou, avec agrandir, l'agrandit d'un
    facteur entier (pixels nets) pour qu'elle remplisse sa case comme les dessins du jeu — puis la pose centrée en
    largeur, posée en bas (pieds au sol) ou centrée en hauteur, sur un fond transparent de la taille exacte."""
    W, H = taille
    im = im.crop(im.getbbox() or (0, 0, im.width, im.height))
    if agrandir:
        f = int(min((W - 2) / im.width, (H - 2) / im.height))
        if f >= 2:
            im = im.resize((im.width * f, im.height * f), Image.NEAREST)
    k = min(1, W / im.width, H / im.height)
    if k < 1:
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.NEAREST)
    fond = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    fond.paste(im, ((W - im.width) // 2, H - im.height if bas else (H - im.height) // 2), im)
    return fond


def encoder(im, transparent):
    """Image RGBA → entrée { w, h, tr, pal, d } : palette des couleurs utilisées ; indice 0 transparent si tr."""
    im = im.convert('RGBA')
    couleurs, d = ({}, bytearray())
    if transparent:
        couleurs[None] = 0
    for r, g, b, a in (im.get_flattened_data() if hasattr(im, 'get_flattened_data') else im.getdata()):
        cle = None if (transparent and a < 128) else (r, g, b)
        if cle not in couleurs:
            couleurs[cle] = len(couleurs)
        d.append(couleurs[cle])
    assert len(couleurs) <= 256, 'plus de 256 couleurs'
    pal = ''.join('000000' if c is None else '%02x%02x%02x' % c for c, _ in sorted(couleurs.items(), key=lambda kv: kv[1]))
    return {'w': im.width, 'h': im.height, 'tr': 1 if transparent else 0, 'pal': pal, 'd': base64.b64encode(bytes(d)).decode()}


def construire(wad):
    images = {}
    for type_, (prefixe, poses) in MONSTRES.items():
        for pose, lettre in poses.items():
            taille = (96, 96) if type_ in GRANDS else (64, 64)
            images[type_ + pose] = cadrer(wad.sprite(prefixe, lettre), taille, bas=(type_ not in VOLANTS or pose == 'Corpse'))
    for nom, (lump, taille) in OBJETS.items():
        images[nom] = cadrer(wad.image(lump), taille, bas=not nom.startswith(PROJECTILES), agrandir=True)
    for nom, (tex, mode) in MURS.items():
        t = wad.texture(tex)
        images[nom] = t.crop((0, 0, 64, 64)) if mode == 'haut' else t.resize((64, 64), Image.NEAREST)
    porte = images['door']
    for nom, bande in BANDES_PORTES.items():   # porte de couleur : bandes de couleur sur les deux côtés, comme dans Doom
        b = wad.texture(bande).resize((6, 64), Image.NEAREST)
        im = porte.copy(); im.paste(b, (0, 0)); im.paste(b, (58, 0))
        images[nom] = im
    for nom, flat in SOLS.items():
        images[nom] = wad.sol(flat)
    images['sky'] = wad.texture('SKY1')   # 256×128 entier, comme dans Doom (le rendu lit sa taille)
    for nom, lump in ARMES.items():
        a = wad.image(lump)
        images[nom] = a.resize((round(a.width * ECHELLE_ARMES), round(a.height * ECHELLE_ARMES)), Image.NEAREST)
    return images


def ecrire(images):
    opaques = set(MURS) | set(BANDES_PORTES) | set(SOLS) | {'sky'}
    lignes = ['"use strict";',
              '/* DOOMED — 01c_images_freedoom.js : sprites, textures et armes en main tirés de Freedoom (GÉNÉRÉ par',
              ' * outils/freedoom_doomed.py depuis ressources/freedoom/freedoom2.wad, ne pas modifier à la main).',
              ' * Images : Copyright © 2001-2024 Contributors to the Freedoom project. Licence de type BSD 3 clauses :',
              ' * voir ressources/freedoom/COPYING.txt ; auteurs : ressources/freedoom/CREDITS.txt.',
              ' *',
              ' * CONTRAT (vérifié par test.html — ne rien retirer de cette liste) :',
              ' *   FOURNIT : IMAGES_FREEDOOM',
              ' *             IMAGES_FREEDOOM.<nom de TX> = { w, h, tr, pal, d } : même format que IMAGES_IA (01b) ;',
              ' *             consulté AVANT IMAGES_IA par imageIA() (02)',
              ' *   UTILISE : rien',
              ' */',
              'const IMAGES_FREEDOOM = {};']
    for nom in sorted(images):
        lignes.append(f"IMAGES_FREEDOOM['{nom}'] = {json.dumps(encoder(images[nom], nom not in opaques), separators=(',', ':'))};")
    SORTIE.write_text('\n'.join(lignes) + '\n', encoding='utf-8')
    return SORTIE


def planche(images, chemin):
    from PIL import ImageDraw
    noms = sorted(images); case, cols = 110, 10
    pl = Image.new('RGB', (cols * case, ((len(noms) + cols - 1) // cols) * (case + 14)), (40, 40, 46))
    dr = ImageDraw.Draw(pl)
    for k, n in enumerate(noms):
        im = images[n].copy(); im.thumbnail((case - 8, case - 8), Image.NEAREST)
        x, y = (k % cols) * case, (k // cols) * (case + 14)
        pl.paste(im, (x + (case - im.width) // 2, y + (case - im.height) // 2), im)
        dr.text((x + 3, y + case), n, fill=(230, 230, 230))
    chemin.parent.mkdir(exist_ok=True)
    pl.save(chemin)


if __name__ == '__main__':
    images = construire(Wad(WAD))
    print(f'{ecrire(images)} : {len(images)} images')
    if '--planche' in sys.argv:
        p = Path(__file__).resolve().parent / 'images_revue' / 'freedoom_planche.png'
        planche(images, p); print('planche :', p)
