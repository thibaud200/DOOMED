"""Fiches du modèle local : contrôle, réparation automatique, ordres de retouche. Commun à tous les jeux : tout ce qui
est propre au jeu vient du profil (<jeu>\\profil\\jeu.json, sections carte, gabarits, difficulte).

    python fiches.py valider <fiche.json> [--type carte|plan_niveau|monstre|ordres] [--plan plan.json] [--profil jeu.json]
    python fiches.py reparer <carte.json> [--plan plan.json] [--profil jeu.json]      (réécrit la fiche, notes affichées)
    python fiches.py ordres <ordres.json> <carte.json> [--profil jeu.json]           (applique, réécrit la carte)
    python fiches.py voir <carte.json> [x,y,l,h]                                      (grille avec coordonnées)

Principe (leçon du jeu HTML) : le modèle décide de la forme ; l'outil corrige seul les défauts mécaniques (bord, porte
mal encadrée, monstre trop près du départ, clé manquante…) et ne renvoie au modèle que ce qu'il ne sait pas réparer.
"""
import json, math, random, re, sys
from pathlib import Path

METHODE = Path(__file__).resolve().parent.parent
SCHEMAS = METHODE / 'schemas'
PROFIL_DEFAUT = METHODE.parent / 'Doom' / 'profil' / 'jeu.json'
V4 = ((1, 0), (-1, 0), (0, 1), (0, -1))
TYPES = {'medkit': 'soin'}


# ---------------------------------------------------------------- profil
def charger_profil(chemin=None):
    chemin = Path(chemin or PROFIL_DEFAUT)
    p = json.loads(chemin.read_text(encoding='utf-8'))
    p['_dossier'] = str(chemin.parent)
    cat = p['carte']['categories']
    # monstres créés par le modèle (profil\monstres\<type>.json) : leur caractère rejoint la légende
    for f in sorted((chemin.parent / 'monstres').glob('*.json')):
        m = json.loads(f.read_text(encoding='utf-8'))
        p['carte']['legende'].setdefault(m['car'], f"monstre {m['nom']} ({m['type']})")
        if m['car'] not in cat['monstres']:
            cat['monstres'] += m['car']
        p['monstres_existants'].setdefault(m['car'], {'type': m['type'], 'nom': m['nom'], 'role': m['resume']})
    return p


def lire(chemin):
    return json.loads(Path(chemin).read_text(encoding='utf-8'))


def ecrire(chemin, donnees):
    Path(chemin).parent.mkdir(parents=True, exist_ok=True)
    Path(chemin).write_text(json.dumps(donnees, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')


# ---------------------------------------------------------------- schémas (sous-ensemble de JSON Schema, sans dépendance)
_T = {'object': dict, 'array': list, 'string': str, 'integer': int, 'number': (int, float), 'boolean': bool,
      'null': type(None)}


def schema(nom):
    return json.loads((SCHEMAS / f'{nom}.schema.json').read_text(encoding='utf-8'))


def _schema(v, s, p, err):
    if 'oneOf' in s:
        bons = [x for x in s['oneOf'] if not erreurs_schema(v, x, p)]
        if len(bons) != 1:
            faire = v.get('faire') if isinstance(v, dict) else None
            cand = [x for x in s['oneOf'] if x.get('properties', {}).get('faire', {}).get('const') == faire]
            err.extend(erreurs_schema(v, cand[0], p) if cand else [f'{p} : forme inconnue ({faire!r})'])
        return
    t = s.get('type')
    if t:
        ts = t if isinstance(t, list) else [t]
        if not any(isinstance(v, _T[x]) and not (x in ('integer', 'number') and isinstance(v, bool)) for x in ts):
            err.append(f'{p} : doit être de type {t}'); return
    if 'const' in s and v != s['const']:
        err.append(f'{p} : doit valoir {s["const"]!r}')
    if 'enum' in s and v not in s['enum']:
        err.append(f'{p} : {v!r} n\'est pas permis (choix : {", ".join(map(str, s["enum"]))})')
    if isinstance(v, str):
        if len(v) < s.get('minLength', 0) or len(v) > s.get('maxLength', 10 ** 9):
            err.append(f'{p} : longueur {len(v)} hors limites')
        if 'pattern' in s and not re.search(s['pattern'], v):
            err.append(f'{p} : {v!r} ne suit pas le motif {s["pattern"]}')
    if isinstance(v, (int, float)) and not isinstance(v, bool) and v < s.get('minimum', -10 ** 18):
        err.append(f'{p} : inférieur à {s["minimum"]}')
    if isinstance(v, list):
        if len(v) < s.get('minItems', 0) or len(v) > s.get('maxItems', 10 ** 9):
            err.append(f'{p} : {len(v)} éléments (attendu {s.get("minItems", 0)} à {s.get("maxItems", "∞")})')
        for i, x in enumerate(v):
            _schema(x, s.get('items', {}), f'{p}[{i}]', err)
    if isinstance(v, dict):
        for k in s.get('required', []):
            if k not in v:
                err.append(f'{p} : champ obligatoire « {k} » absent')
        pr = s.get('properties', {})
        for k, x in v.items():
            if k in pr:
                _schema(x, pr[k], f'{p}.{k}', err)
            elif s.get('additionalProperties') is False:
                err.append(f'{p} : champ « {k} » non prévu')
            elif isinstance(s.get('additionalProperties'), dict):
                _schema(x, s['additionalProperties'], f'{p}.{k}', err)


def erreurs_schema(v, s, p='fiche'):
    e = []
    _schema(v, s, p, e)
    return e


# ---------------------------------------------------------------- grille
class Grille:
    def __init__(self, rows, profil):
        self.g = [list(r) for r in rows]
        self.h, self.w = len(self.g), len(self.g[0]) if self.g else 0
        c = profil['carte']['categories']
        self.c = c
        self.murs, self.portes, self.sol_ch = set(c['murs']), set(c['portes']), set(c['sol'])
        self.monstres, self.objets = set(c['monstres']), set(c['objets'])
        self.decor = set(c.get('decor', ''))           # objets de décor : ni mur ni sol, on ne passe pas
        self.legende = set(profil['carte']['legende'])

    rows = property(lambda s: [''.join(r) for r in s.g])

    def at(self, x, y):
        return self.g[y][x] if 0 <= x < self.w and 0 <= y < self.h else self.c['mur_defaut']

    def mur(self, x, y):
        return self.at(x, y) in self.murs

    def libre(self, x, y):             # case où l'on marche (sol, départ, monstre, objet)
        ch = self.at(x, y)
        return ch not in self.murs and ch not in self.portes and ch not in self.decor

    def vide(self, x, y):              # sol sans rien dessus
        return self.at(x, y) == self.c['sol_defaut']

    def cases(self, quoi):
        return [(x, y) for y in range(self.h) for x in range(self.w) if self.g[y][x] in quoi]

    def depart(self):
        p = self.cases(self.c['depart'])
        return p[0] if p else None

    def acces(self, depart, cles=None, secrets=False, portes=True):
        """Cases atteignables à pied ; les portes de couleur ne s'ouvrent qu'avec leur clé (cles=None : toutes)."""
        vu, file = {depart: 0}, [depart]
        for x, y in file:
            for dx, dy in V4:
                n = (x + dx, y + dy); ch = self.at(*n)
                if n in vu:
                    continue
                if ch in self.portes:
                    cle = self.c['cles'].get(ch)
                    if not portes or (cle and cles is not None and cle not in cles):
                        continue
                elif ch in self.c['secret'] + self.c.get('embuscade', '') and secrets:
                    pass                       # « secrets » : on passe aussi les murs qui s'ouvrent (secret, embuscade)
                elif not self.libre(*n):
                    continue
                vu[n] = vu[(x, y)] + 1; file.append(n)
        return vu

    def acces_avec_cles(self, depart, secrets=False):
        cles = set()
        while True:
            vu = self.acces(depart, cles, secrets)
            n = {self.at(*c) for c in vu} & set(self.c['cles'].values())
            if n <= cles:
                return vu, cles
            cles |= n

    def encadree(self, x, y):
        m, l = self.mur, self.libre
        return (m(x - 1, y) and m(x + 1, y) and l(x, y - 1) and l(x, y + 1)) or \
               (m(x, y - 1) and m(x, y + 1) and l(x - 1, y) and l(x + 1, y))

    def inventaire(self):
        """Ce qui est posé, avec coordonnées : un petit modèle lit mieux une liste qu'une grille."""
        lignes = []
        for quoi, cars in (('départ', self.c['depart']), ('sortie', self.c['sortie']), ('porte', self.c['portes']),
                           ('secret', self.c['secret']), ('monstre', ''.join(self.monstres)), ('objet', ''.join(self.objets))):
            cases = self.cases(cars)
            if cases:
                lignes.append(f'{quoi} : ' + ', '.join(f'{self.at(x, y)} ({x},{y})' for x, y in cases))
        return '\n'.join(lignes)

    def texte(self, x0=0, y0=0, l=None, h=None):
        l, h = l or self.w, h or self.h
        x1, y1 = min(self.w, x0 + l), min(self.h, y0 + h)
        tete = '    ' + ''.join(str(x // 10) if x >= 10 else ' ' for x in range(x0, x1))
        tete2 = '    ' + ''.join(str(x % 10) for x in range(x0, x1))
        return '\n'.join([tete, tete2] + [f'{y:3} ' + ''.join(self.g[y][x0:x1]) for y in range(y0, y1)])


# ---------------------------------------------------------------- contrôles
def bornes(profil):
    return profil['carte']['taille_min'], profil['carte']['taille_max']


def valider_carte(carte, profil, plan=None):
    """(erreurs, alertes). Erreurs = la carte ne peut pas être construite ou jouée ; alertes = écart au plan ou dosage."""
    err, al = erreurs_schema(carte, schema('carte'), 'carte'), []
    rows = carte.get('rows') or []
    if not rows or not all(isinstance(r, str) for r in rows):
        return err or ['carte.rows vide'], al
    G = Grille(rows, profil); c = G.c
    (wmin, hmin), (wmax, hmax) = bornes(profil)
    if len({len(r) for r in rows}) != 1:
        err.append(f'lignes de longueurs différentes : {sorted({len(r) for r in rows})}')
        return err, al
    if not (wmin <= G.w <= wmax and hmin <= G.h <= hmax):
        err.append(f'taille {G.w}×{G.h} hors des bornes {wmin}×{hmin} à {wmax}×{hmax}')
    if plan and [G.w, G.h] != list(plan['taille']):
        al.append(f'taille {G.w}×{G.h} ≠ plan {plan["taille"][0]}×{plan["taille"][1]}')
    inconnus = {ch for r in rows for ch in r if ch not in G.legende}
    if inconnus:
        err.append(f'caractères hors légende : {" ".join(sorted(inconnus))}')
    for x, y in [(x, y) for y in range(G.h) for x in range(G.w) if x in (0, G.w - 1) or y in (0, G.h - 1)]:
        if not G.mur(x, y):
            err.append(f'bord ouvert en ({x},{y})'); break
    P = G.cases(c['depart'])
    if len(P) != 1:
        err.append(f'{len(P)} départs {c["depart"]} (il en faut exactement 1)')
        return err, al
    p = P[0]
    E = G.cases(c['sortie'])
    sorties = [(x + dx, y + dy) for x, y in E for dx, dy in V4 if G.libre(x + dx, y + dy)]
    if not sorties:
        err.append(f'aucune sortie {c["sortie"]} ne touche une case de sol')
    for x, y in G.cases(c['portes']):
        if not G.encadree(x, y):
            err.append(f'porte ({x},{y}) mal encadrée : il faut un mur de chaque côté et du sol devant et derrière')
    for x, y in G.cases(G.monstres):
        if math.hypot(x - p[0], y - p[1]) < c['distance_depart_min']:
            err.append(f'monstre ({x},{y}) à moins de {c["distance_depart_min"]} cases du départ')
    vu, cles = G.acces_avec_cles(p)
    for porte, cle in c['cles'].items():
        for x, y in G.cases(porte):
            if not G.cases(cle):
                err.append(f'porte {porte} ({x},{y}) sans clé {cle} dans le niveau')
            elif cle not in cles:
                err.append(f'clé {cle} inatteignable avant la porte {porte} ({x},{y})')
    if sorties and not any(s in vu for s in sorties):
        err.append('sortie inatteignable depuis le départ')
    tout, _ = G.acces_avec_cles(p, secrets=True)
    perdus = [(x, y) for x, y in G.cases(G.monstres | G.objets) if (x, y) not in tout]
    if perdus:
        err.append(f'{len(perdus)} monstre(s)/objet(s) inatteignables, ex. {perdus[:4]}')
    for x, y in G.cases(c['secret']):
        reduits = [n for n in ((x + dx, y + dy) for dx, dy in V4) if G.libre(*n) and n not in vu]
        if not any(G.at(*q) in G.objets for r in reduits for q in G.acces(r, portes=False)):
            err.append(f'mur secret ({x},{y}) : pas de réduit fermé contenant un objet derrière')
    for x, y in G.cases(c.get('embuscade', '')):
        reduits = [n for n in ((x + dx, y + dy) for dx, dy in V4) if G.libre(*n) and n not in vu]
        if any(G.libre(x + dx, y + dy) and (x + dx, y + dy) in vu for dx, dy in V4) and \
                not any(G.at(*q) in G.monstres for r in reduits for q in G.acces(r, portes=False)):
            err.append(f'mur d\'embuscade ({x},{y}) : pas de réduit fermé avec des monstres derrière')
    # dosage (alertes : le modèle a le dernier mot sur l'équilibre, l'outil complète au besoin)
    nm, no = len(G.cases(G.monstres)), len(G.cases(G.objets))
    if len(G.cases(c['soin'])) < nm / c['soin_pour_ennemis']:
        al.append(f'{len(G.cases(c["soin"]))} soin(s) pour {nm} ennemis (au moins 1 pour {c["soin_pour_ennemis"]})')
    if len(G.cases(c['chef'])) > c['chefs_max']:
        err.append(f'plus de {c["chefs_max"]} chefs {c["chef"]}')
    if plan:
        pe = sum(sum(z['ennemis'].values()) for z in plan['zones'])
        po = sum(sum(z['objets'].values()) for z in plan['zones'])
        if pe and abs(nm - pe) > max(2, pe * .3):
            al.append(f'{nm} ennemis pour {pe} prévus au plan')
        if po and abs(no - po) > max(2, po * .3):
            al.append(f'{no} objets pour {po} prévus au plan')
        nv = plan['progression'].get('nouveau_monstre')
        if nv and len(G.cases(nv)) < 3:
            al.append(f'nouveau monstre {nv} présent {len(G.cases(nv))} fois (au moins 3)')
        for z, (x, y, l, h) in (carte.get('zones') or {}).items():
            if x < 0 or y < 0 or x + l > G.w or y + h > G.h:
                al.append(f'zone {z} hors de la carte')
    return err, al


def valider_plan(plan, profil):
    err = erreurs_schema(plan, schema('plan_niveau'), 'plan')
    if err:
        return err, []
    al = []
    c = profil['carte']['categories']
    ids = [z['id'] for z in plan['zones']]
    if len(set(ids)) != len(ids):
        err.append('identifiants de zones en double')
    roles = [z['role'] for z in plan['zones']]
    for r in ('depart', 'sortie'):
        if roles.count(r) != 1:
            err.append(f'il faut exactement une zone de rôle « {r} » ({roles.count(r)} trouvée(s))')
    for l in plan['parcours']:
        for k in ('de', 'vers'):
            if l[k] not in ids:
                err.append(f'parcours : zone inconnue « {l[k]} »')
    # toutes les zones reliées au départ
    voisins = {i: set() for i in ids}
    for l in plan['parcours']:
        if l['de'] in voisins and l['vers'] in voisins:
            voisins[l['de']].add(l['vers']); voisins[l['vers']].add(l['de'])
    dep = next((z['id'] for z in plan['zones'] if z['role'] == 'depart'), None)
    if dep:
        vu, file = {dep}, [dep]
        for z in file:
            for n in voisins[z] - vu:
                vu.add(n); file.append(n)
        isolees = set(ids) - vu
        if isolees:
            err.append(f'zones non reliées au départ : {", ".join(sorted(isolees))}')
    leg = profil['carte']['legende']
    for z in plan['zones']:
        for ch in z['ennemis']:
            if ch not in c['monstres']:
                err.append(f'zone {z["id"]} : « {ch} » n\'est pas un monstre de la légende')
        for ch in z['objets']:
            if ch not in c['objets']:
                err.append(f'zone {z["id"]} : « {ch} » n\'est pas un objet de la légende')
    couleurs = {'rouge': 'R', 'bleue': 'B', 'jaune': 'J'}
    for k in plan['progression']['cles']:
        if k['zone'] not in ids or k['ouvre'] not in ids:
            err.append(f'clé {k["couleur"]} : zone inconnue')
    for l in plan['parcours']:
        if l['par'].startswith('porte_') and l['par'][6:] not in [k['couleur'] for k in plan['progression']['cles']]:
            err.append(f'liaison {l["de"]}→{l["vers"]} par {l["par"]} sans clé de cette couleur dans la progression')
    (wmin, hmin), (wmax, hmax) = bornes(profil)
    w, h = plan['taille']
    if not (wmin <= w <= wmax and hmin <= h <= hmax):
        err.append(f'taille {w}×{h} hors des bornes {wmin}×{hmin} à {wmax}×{hmax}')
    if plan['style'] not in profil['habillage']['styles']:
        err.append(f'style « {plan["style"]} » inconnu (choix : {", ".join(profil["habillage"]["styles"])})')
    nv = plan['progression'].get('nouveau_monstre')
    if nv and nv not in c['monstres']:
        err.append(f'nouveau_monstre « {nv} » absent de la légende')
    if len({len(r) for r in plan['croquis']}) != 1:
        al.append('croquis : lignes de longueurs différentes')
    ne = sum(sum(z['ennemis'].values()) for z in plan['zones'])
    nchefs = sum(z['ennemis'].get(c['chef'], 0) for z in plan['zones'])
    if nchefs > c['chefs_max']:
        err.append(f'{nchefs} chefs « {c["chef"]} » (au plus {c["chefs_max"]})')
    ref = min(profil['difficulte']['reperes'], key=lambda r: abs(r['niveau'] - plan['niveau']))
    if ne < ref['ennemis'] * .6 or ne > ref['ennemis'] * 1.6:
        al.append(f'{ne} ennemis ; repère du niveau {ref["niveau"]} : {ref["ennemis"]}')
    return err, al


def valider_monstre(m, profil):
    err = erreurs_schema(m, schema('monstre'), 'monstre')
    if err:
        return err, []
    B = profil['gabarits']['monstre']['bornes']; c = profil['carte']['categories']
    existant = profil['monstres_existants'].get(m['car'])
    if m['car'] in profil['carte']['legende'] and not (existant and existant.get('type') == m['type']):
        err.append(f'caractère « {m["car"]} » déjà pris dans la légende')
    if any(v.get('type') == m['type'] for k, v in profil['monstres_existants'].items() if k != m['car']):
        err.append(f'type « {m["type"]} » déjà pris')
    for k, v in m['stats'].items():
        if k in B and not B[k][0] <= v <= B[k][1]:
            err.append(f'stats.{k} = {v} hors bornes {B[k]}')
    a = m['attaque']
    if a['mode'] != 'aucun':
        for k in ('portee', 'recharge', 'degats'):
            if k not in a:
                err.append(f'attaque.{k} obligatoire en mode {a["mode"]}')
        if 'portee' in a and not (B['portee_min'][0] <= a['portee'][0] <= B['portee_min'][1]
                                  and B['portee_max'][0] <= a['portee'][1] <= B['portee_max'][1] and a['portee'][0] < a['portee'][1]):
            err.append(f'attaque.portee {a["portee"]} hors bornes (min {B["portee_min"]}, max {B["portee_max"]})')
        if 'recharge' in a and not all(B['recharge_s'][0] <= x <= B['recharge_s'][1] for x in a['recharge']):
            err.append(f'attaque.recharge {a["recharge"]} hors bornes {B["recharge_s"]}')
        if 'degats' in a and not all(B['degats'][0] <= x <= B['degats'][1] for x in a['degats']):
            err.append(f'attaque.degats {a["degats"]} hors bornes {B["degats"]}')
        if a['mode'] in ('boule', 'charge') and 'vitesse' not in a:
            err.append(f'attaque.vitesse obligatoire en mode {a["mode"]}')
        if a['mode'] == 'boule' and 'couleur' not in a:
            err.append('attaque.couleur obligatoire en mode boule')
    if a['mode'] == 'aucun' and m['stats']['melee'] == 0:
        err.append('monstre inoffensif : ni attaque ni dégâts au contact')
    if re.search(r'[àâçéèêëîïôûùüÿœ]', m['prompt_image'], re.I):
        err.append('prompt_image doit être en anglais')
    # rôle : les chiffres restent dans ses fourchettes, l'attaque et le comportement spécial lui correspondent
    roles = {k: v for k, v in profil['gabarits']['monstre'].get('roles', {}).items() if not k.startswith('_')}
    if roles:
        R = roles.get(m.get('role'))
        if not R:
            err.append(f'role « {m.get("role")} » inconnu (choix : {", ".join(roles)})')
        else:
            for k in ('hp', 'speed', 'melee', 'fly'):
                if k in R and not R[k][0] <= m['stats'].get(k, 0) <= R[k][1]:
                    err.append(f'rôle {m["role"]} : stats.{k} doit être entre {R[k][0]} et {R[k][1]}')
            if 'mode' in R and a['mode'] not in R['mode']:
                err.append(f'rôle {m["role"]} : attaque.mode doit être {" ou ".join(R["mode"])}')
            if 'portee_max' in R and not R['portee_max'][0] <= a.get('portee', [0, 0])[1] <= R['portee_max'][1]:
                err.append(f'rôle {m["role"]} : portée maximale entre {R["portee_max"][0]} et {R["portee_max"][1]}')
            if R.get('special', 'aucun') != m.get('special', 'aucun') and R.get('special'):
                err.append(f'rôle {m["role"]} : special doit être « {R["special"]} »')
    sp, pu = m.get('special', 'aucun'), m.get('puissance', 0)
    if sp == 'explose' and not 10 <= pu <= 60:
        err.append('special explose : puissance (dégâts) entre 10 et 60')
    if sp == 'regenere' and not 2 <= pu <= 15:
        err.append('special regenere : puissance (PV par seconde) entre 2 et 15')
    if sp == 'rafale' and a['mode'] not in ('balle', 'boule'):
        err.append('special rafale : seulement en mode balle ou boule')
    return err, []


def valider(fiche, type_, profil, plan=None):
    if type_ == 'carte':
        return valider_carte(fiche, profil, plan)
    if type_ == 'plan_niveau':
        return valider_plan(fiche, profil)
    if type_ == 'monstre':
        return valider_monstre(fiche, profil)
    if type_ == 'ordres':
        return erreurs_schema(fiche, schema('ordres'), 'ordres'), []
    raise ValueError(type_)


# ---------------------------------------------------------------- réparations automatiques
def _plus_proche(G, depuis, ok, interdit=()):
    vu, file = {depuis}, [depuis]
    for x, y in file:
        if ok(x, y) and (x, y) not in interdit:
            return (x, y)
        for dx, dy in V4:
            n = (x + dx, y + dy)
            if n not in vu and 0 <= n[0] < G.w and 0 <= n[1] < G.h and G.libre(*n):
                vu.add(n); file.append(n)
    return None


def _relier(G, zone, principale):
    """Creuse le passage le plus court (en murs ordinaires, jamais le bord) de `zone` vers `principale`."""
    cout, avant, file = {c: 0 for c in zone}, {}, sorted(zone)
    while file:
        file.sort(key=lambda c: cout[c]); x, y = file.pop(0)
        if (x, y) in principale:
            n = (x, y)
            while n and n not in zone:
                if G.mur(*n):
                    G.g[n[1]][n[0]] = G.c['sol_defaut']
                n = avant.get(n)
            return True
        for dx, dy in V4:
            n = (x + dx, y + dy)
            if 0 < n[0] < G.w - 1 and 0 < n[1] < G.h - 1 and G.at(*n) not in (G.c['secret'], G.c['sortie']):
                nc = cout[(x, y)] + (0 if G.libre(*n) or G.at(*n) in G.portes else 1)
                if n not in cout or nc < cout[n]:
                    cout[n], avant[n] = nc, (x, y); file.append(n)
    return False


def reparer_carte(carte, profil, plan=None):
    """Corrige les défauts mécaniques. Renvoie (carte, notes). La forme voulue par le modèle est conservée."""
    notes = []
    c = profil['carte']['categories']
    leg = profil['carte']['legende']
    rows = [r for r in carte.get('rows') or [] if isinstance(r, str)]
    (wmin, hmin), (wmax, hmax) = bornes(profil)
    w, h = plan['taille'] if plan else (max(map(len, rows), default=wmin), len(rows))
    w, h = min(max(w, wmin), wmax), min(max(h, hmin), hmax)
    if len(rows) != h or any(len(r) != w for r in rows):
        notes.append(f'grille ramenée à {w}×{h} (complétée en murs)')
        rows = [(r + c['mur_defaut'] * w)[:w] for r in (rows + [c['mur_defaut'] * w] * h)[:h]]
    G = Grille(rows, profil)
    inconnus = 0
    for y in range(h):
        for x in range(w):
            if G.g[y][x] not in leg:
                G.g[y][x] = c['sol_defaut'] if G.g[y][x] == ' ' else c['mur_defaut']; inconnus += 1
            if (x in (0, w - 1) or y in (0, h - 1)) and not G.mur(x, y):
                G.g[y][x] = c['mur_defaut']; notes.append(f'bord fermé en ({x},{y})')
    if inconnus:
        notes.append(f'{inconnus} caractère(s) hors légende remplacés')
    # départ
    P = G.cases(c['depart'])
    for x, y in P[1:]:
        G.g[y][x] = c['sol_defaut']; notes.append(f'départ en trop retiré ({x},{y})')
    if not P:
        zones_carte = carte.get('zones') if isinstance(carte.get('zones'), dict) else {}
        zone = zones_carte.get(next((z['id'] for z in (plan or {}).get('zones', []) if z['role'] == 'depart'), ''), None)
        cand = [(x, y) for x, y in G.cases(c['sol_defaut']) if not zone or (zone[0] <= x < zone[0] + zone[2] and zone[1] <= y < zone[1] + zone[3])]
        if not cand:
            return carte | {'rows': G.rows}, notes + ['aucune case de sol pour le départ']
        x, y = cand[0]; G.g[y][x] = c['depart']; notes.append(f'départ ajouté en ({x},{y})')
    p = G.depart()
    # rangées de portes (le modèle ferme toute une ouverture de « = ») : une porte au milieu, le reste en mur
    for horiz in (True, False):
        vu = set()
        for x, y in G.cases(c['portes']):
            if (x, y) in vu:
                continue
            run, (a, b) = [], (x, y)
            while G.at(a, b) in G.portes:
                run.append((a, b)); a, b = (a + 1, b) if horiz else (a, b + 1)
            vu |= set(run)
            if len(run) >= 2:
                garde = run[len(run) // 2]
                for q in run:
                    if q != garde:
                        G.g[q[1]][q[0]] = c['mur_defaut']
                notes.append(f'rangée de {len(run)} portes ramenée à une porte en {garde}')
    # portes mal encadrées → sol (le passage reste ouvert)
    for x, y in G.cases(c['portes']):
        if not G.encadree(x, y):
            G.g[y][x] = c['sol_defaut']; notes.append(f'porte mal encadrée ({x},{y}) remplacée par du sol')
    # zones de sol isolées → reliées au départ
    for _ in range(10):
        tout = set(G.acces(p, secrets=True))
        reste = [q for q in G.cases(set(leg) - G.murs - G.portes) if q not in tout]
        if not reste:
            break
        zone = set(G.acces(reste[0], portes=True))
        if len(zone) < 3 and not any(G.at(*q) in G.objets | G.monstres for q in zone):
            for x, y in zone:
                G.g[y][x] = c['mur_defaut']
            notes.append(f'îlot de sol {sorted(zone)[:2]} muré')
        elif _relier(G, zone, tout):
            notes.append(f'zone isolée autour de {reste[0]} reliée par un passage')
        else:
            break
    # monstres trop près du départ → repoussés
    for x, y in G.cases(G.monstres):
        if math.hypot(x - p[0], y - p[1]) < c['distance_depart_min']:
            ch = G.g[y][x]
            cible = _plus_proche(G, (x, y), lambda a, b: G.vide(a, b) and math.hypot(a - p[0], b - p[1]) >= c['distance_depart_min'] + 1)
            G.g[y][x] = c['sol_defaut']
            if cible:
                G.g[cible[1]][cible[0]] = ch; notes.append(f'monstre {ch} ({x},{y}) éloigné du départ → {cible}')
            else:
                notes.append(f'monstre {ch} ({x},{y}) retiré (trop près du départ)')
    # sortie
    vu, _ = G.acces_avec_cles(p)
    E = G.cases(c['sortie'])
    if not any((x + dx, y + dy) in vu for x, y in E for dx, dy in V4):
        for x, y in E:
            G.g[y][x] = c['mur_defaut']
        loin = max(vu.values())
        murs = sorted({(x + dx, y + dy) for (x, y), d in vu.items() if d >= loin * .85 for dx, dy in V4
                       if G.at(x + dx, y + dy) == c['mur_defaut'] and 0 < x + dx < w - 1 and 0 < y + dy < h - 1})
        if not murs:
            murs = sorted({(x + dx, y + dy) for (x, y) in vu for dx, dy in V4 if G.at(x + dx, y + dy) in G.murs - {c['secret']}})
        if murs:
            x, y = max(murs, key=lambda q: min(vu.get((q[0] + dx, q[1] + dy), 0) for dx, dy in V4 if (q[0] + dx, q[1] + dy) in vu))
            G.g[y][x] = c['sortie']; notes.append(f'sortie placée en ({x},{y}), au plus loin du départ')
    # une seule clé par couleur : la plus proche du départ est gardée
    dist = G.acces(p, secrets=True)
    for cle in c['cles'].values():
        cles_ = sorted(G.cases(cle), key=lambda q: dist.get(q, 10 ** 6))
        for x, y in cles_[1:]:
            G.g[y][x] = c['sol_defaut']; notes.append(f'clé {cle} en double retirée ({x},{y})')
    # clés manquantes ou derrière leur porte : posées sur une case vide atteignable sans cette porte
    for porte, cle in c['cles'].items():
        if not G.cases(porte):
            continue
        vu, cles = G.acces_avec_cles(p)
        if cle in cles:
            continue
        for x, y in G.cases(cle):
            G.g[y][x] = c['sol_defaut']
        cand = sorted((q for q, d in vu.items() if G.vide(*q) and d >= 3), key=lambda q: -vu[q])
        if cand:
            x, y = cand[0]; G.g[y][x] = cle; notes.append(f'clé {cle} posée en ({x},{y}), avant sa porte')
    # murs secrets sans réduit garni
    vu, _ = G.acces_avec_cles(p)
    for x, y in G.cases(c['secret']):
        reduits = [n for n in ((x + dx, y + dy) for dx, dy in V4) if G.libre(*n) and n not in vu]
        cases = [q for r in reduits for q in G.acces(r, portes=False)]
        if any(G.at(*q) in G.objets for q in cases):
            continue
        libres = [q for q in cases if G.vide(*q)]
        if libres:
            q = libres[0]; G.g[q[1]][q[0]] = c['soin']; notes.append(f'objet {c["soin"]} ajouté dans le réduit secret {q}')
        else:
            G.g[y][x] = c['mur_defaut']; notes.append(f'mur secret ({x},{y}) sans réduit : remplacé par un mur')
    # murs d'embuscade sans réduit garni de monstres : mur ordinaire
    vu, _ = G.acces_avec_cles(p)
    for x, y in G.cases(c.get('embuscade', '')):
        reduits = [n for n in ((x + dx, y + dy) for dx, dy in V4) if G.libre(*n) and n not in vu]
        if not any(G.at(*q) in G.monstres for r in reduits for q in G.acces(r, portes=False)):
            G.g[y][x] = c['mur_defaut']; notes.append(f'mur d\'embuscade ({x},{y}) sans monstres derrière : mur ordinaire')
    # chefs en trop : les plus proches du départ deviennent des monstres ordinaires (le premier de la légende)
    chefs = G.cases(c['chef'])
    if len(chefs) > c['chefs_max']:
        ordinaire = next(m for m in c['monstres'] if m != c['chef'])
        dist = G.acces(p, secrets=True)
        for x, y in sorted(chefs, key=lambda q: dist.get(q, 10 ** 6))[:len(chefs) - c['chefs_max']]:
            G.g[y][x] = ordinaire; notes.append(f'chef en trop ({x},{y}) remplacé par {ordinaire}')
    # soins : au moins 1 pour N ennemis, dans des recoins atteignables
    vu, _ = G.acces_avec_cles(p)
    manque = math.ceil(len(G.cases(G.monstres)) / c['soin_pour_ennemis']) - len(G.cases(c['soin']))
    if manque > 0:
        recoins = sorted((q for q in vu if G.vide(*q) and sum(G.mur(q[0] + dx, q[1] + dy) for dx, dy in V4) >= 2 and vu[q] >= 3),
                         key=lambda q: vu[q])
        pas = max(1, len(recoins) // (manque + 1))
        for q in recoins[pas::pas][:manque]:
            G.g[q[1]][q[0]] = c['soin']; notes.append(f'soin ajouté en {q}')
    return carte | {'rows': G.rows}, notes


def reparer_plan(plan, profil):
    """Corrige les défauts mécaniques d'un plan (relevés la nuit du 22/10 : le modèle répétait la même erreur 3 fois).
    Renvoie (plan, notes). Ne touche qu'à un plan au bon format."""
    if erreurs_schema(plan, schema('plan_niveau'), 'plan'):
        return plan, []
    notes, c = [], profil['carte']['categories']
    zones = plan['zones']
    ids = [z['id'] for z in zones]
    roles = [z['role'] for z in zones]
    if roles.count('depart') == 0:
        zones[0]['role'] = 'depart'; notes.append(f'zone {zones[0]["id"]} devient le départ')
    if roles.count('sortie') == 0:
        z = next(z for z in reversed(zones) if z['role'] not in ('depart', 'secret'))
        z['role'] = 'sortie'; notes.append(f'zone {z["id"]} devient la sortie')
    for r in ('depart', 'sortie'):
        for z in [z for z in zones if z['role'] == r][1:]:
            z['role'] = 'combat'; notes.append(f'{r} en trop : zone {z["id"]} devient une zone de combat')
    plan['parcours'] = [l for l in plan['parcours'] if l['de'] in ids and l['vers'] in ids]
    # zones isolées : reliées par une porte à la zone précédente de la liste (déjà reliée)
    dep = next(z['id'] for z in zones if z['role'] == 'depart')
    for _ in range(len(zones)):
        vu, file = {dep}, [dep]
        for z in file:
            for l in plan['parcours']:
                for a, b in ((l['de'], l['vers']), (l['vers'], l['de'])):
                    if a == z and b not in vu:
                        vu.add(b); file.append(b)
        isolee = next((z for z in zones if z['id'] not in vu), None)
        if not isolee:
            break
        i = ids.index(isolee['id'])
        voisine = next((ids[j] for j in range(i - 1, -1, -1) if ids[j] in vu), dep)
        par = 'secret' if isolee['role'] == 'secret' else 'porte'
        plan['parcours'].append({'de': voisine, 'vers': isolee['id'], 'par': par})
        notes.append(f'zone {isolee["id"]} reliée à {voisine} ({par})')
    # porte de couleur sans clé : clé posée dans la zone d'où l'on vient
    couleurs = [k['couleur'] for k in plan['progression']['cles']]
    for l in plan['parcours']:
        if l['par'].startswith('porte_') and l['par'][6:] not in couleurs:
            plan['progression']['cles'].append({'couleur': l['par'][6:], 'zone': l['de'], 'ouvre': l['vers']})
            couleurs.append(l['par'][6:]); notes.append(f'clé {l["par"][6:]} ajoutée dans {l["de"]}')
    for k in plan['progression']['cles']:
        if k['zone'] not in ids or k['ouvre'] not in ids:
            k['zone'] = dep if k['zone'] not in ids else k['zone']
            k['ouvre'] = k['ouvre'] if k['ouvre'] in ids else ids[-1]
    # chefs en trop
    trop = sum(z['ennemis'].get(c['chef'], 0) for z in zones) - c['chefs_max']
    for z in reversed(zones):
        while trop > 0 and z['ennemis'].get(c['chef'], 0):
            z['ennemis'][c['chef']] -= 1; trop -= 1
            notes.append(f'chef en trop retiré de {z["id"]}')
    if plan['style'] not in profil['habillage']['styles']:
        plan['style'] = profil['habillage']['defaut']; notes.append('style remplacé par le style par défaut')
    return plan, notes


# ---------------------------------------------------------------- salles en rectangles → carte dessinée par l'outil
TAILLES = {'couloir': (1, 2), 'petite': (3, 4), 'moyenne': (5, 7), 'grande': (8, 10), 'immense': (11, 40)}
PORTES = {'porte': '=', 'porte_rouge': 'R', 'porte_bleue': 'B', 'porte_jaune': 'J', 'secret': '$'}
CLES = {'rouge': 'r', 'bleue': 'b', 'jaune': 'j'}


TAILLE_VOULUE = {'couloir': (1, 5), 'petite': (3, 3), 'moyenne': (6, 5), 'grande': (9, 7), 'immense': (12, 9)}


def _touche(A, B, marge=1):
    """Les rectangles (marge = une case de mur exigée entre eux) se recouvrent-ils ?"""
    return (A['x'] - marge < B['x'] + B['l'] and B['x'] - marge < A['x'] + A['l']
            and A['y'] - marge < B['y'] + B['h'] and B['y'] - marge < A['y'] + A['h'])


def _place_libre(r, autres, W, H, pres=None):
    """Déplace (et au besoin rétrécit) r vers l'emplacement libre le plus proche de `pres` ; False si aucun."""
    l0, h0 = r['l'], r['h']
    for l, h in [(l0, h0), (max(1, l0 - 2), max(1, h0 - 2)), (min(l0, 3), min(h0, 3)), (min(l0, 2), min(h0, 2)), (1, 1)]:
        cand = [(x, y) for y in range(1, H - h) for x in range(1, W - l)
                if not any(_touche({'x': x, 'y': y, 'l': l, 'h': h}, o) for o in autres)]
        if cand:
            cx, cy = pres or (r['x'], r['y'])
            r['x'], r['y'] = min(cand, key=lambda q: abs(q[0] + l / 2 - cx) + abs(q[1] + h / 2 - cy))
            r['l'], r['h'] = l, h
            return True
    return False


def valider_salles(s, plan):
    """(salles réparées, erreurs, alertes). L'outil ramène les salles dans la carte, rogne les chevauchements et place
    les zones oubliées ; il ne reste d'erreur que si la carte n'a vraiment plus de place."""
    err = erreurs_schema(s, schema('salles'), 'salles')
    if err:
        return s, err, []
    al = []
    W, H = plan['taille']
    zones = {z['id']: z for z in plan['zones']}
    vus = {}
    for r in s['salles']:
        if r['id'] not in zones or r['id'] in vus:
            al.append(f'salle « {r["id"]} » ignorée (pas une zone du plan, ou en double)'); continue
        x0, y0, l0, h0 = r['x'], r['y'], r['l'], r['h']
        r['l'], r['h'] = max(1, r['l']), max(1, r['h'])
        r['x'], r['y'] = min(max(1, r['x']), W - 2), min(max(1, r['y']), H - 2)
        r['l'], r['h'] = min(r['l'], W - 1 - r['x']), min(r['h'], H - 1 - r['y'])
        if (x0, y0, l0, h0) != (r['x'], r['y'], r['l'], r['h']):
            al.append(f'salle {r["id"]} ramenée dans la carte : {x0},{y0} {l0}×{h0} → {r["x"]},{r["y"]} {r["l"]}×{r["h"]}')
        vus[r['id']] = r
    # chevauchements : la plus petite salle est rognée du côté qui lui laisse le plus de place, sinon déplacée
    for _ in range(3):
        bouge = False
        ids = list(vus)
        for i, a in enumerate(ids):
            for b in ids[i + 1:]:
                A, B = vus[a], vus[b]
                if not _touche(A, B):
                    continue
                if A['l'] * A['h'] < B['l'] * B['h']:
                    A, B = B, A
                options = [dict(B, x=A['x'] + A['l'] + 1, l=B['x'] + B['l'] - (A['x'] + A['l'] + 1)),
                           dict(B, l=A['x'] - 1 - B['x']),
                           dict(B, y=A['y'] + A['h'] + 1, h=B['y'] + B['h'] - (A['y'] + A['h'] + 1)),
                           dict(B, h=A['y'] - 1 - B['y'])]
                options = [o for o in options if o['l'] >= 1 and o['h'] >= 1 and not _touche(A, o)]
                if options:
                    B.update(max(options, key=lambda o: o['l'] * o['h']))
                    al.append(f'salle {B["id"]} rognée pour laisser un mur avec {A["id"]}')
                elif _place_libre(B, [o for k, o in vus.items() if k != B['id']], W, H):
                    al.append(f'salle {B["id"]} déplacée (posée sur {A["id"]})')
                else:
                    err.append(f'plus de place pour la salle {B["id"]}')
                bouge = True
        if not bouge:
            break
    # zones oubliées : posées près de la zone à laquelle le parcours les relie
    for zid, z in zones.items():
        if zid in vus:
            continue
        voisin = next((li['de'] if li['vers'] == zid else li['vers'] for li in plan['parcours']
                       if zid in (li['de'], li['vers']) and (li['de'] if li['vers'] == zid else li['vers']) in vus), None)
        pres = (vus[voisin]['x'] + vus[voisin]['l'] / 2, vus[voisin]['y'] + vus[voisin]['h'] / 2) if voisin else (W / 2, H / 2)
        l, h = TAILLE_VOULUE[z['taille']]
        r = {'id': zid, 'x': 1, 'y': 1, 'l': l, 'h': h}
        if _place_libre(r, list(vus.values()), W, H, pres):
            vus[zid] = r; s['salles'].append(r)
            al.append(f'zone {zid} oubliée : salle posée en {r["x"]},{r["y"]} {r["l"]}×{r["h"]}')
        else:
            err.append(f'zone « {zid} » du plan sans salle, et plus de place pour la poser')
    s['salles'] = [r for r in s['salles'] if r['id'] in vus and vus[r['id']] is r]
    for r in s['salles']:
        a, b = TAILLES[zones[r['id']]['taille']]
        if zones[r['id']]['taille'] != 'couloir' and not a <= max(r['l'], r['h']) <= b + 2:
            al.append(f'salle {r["id"]} : {r["l"]}×{r["h"]} pour une zone « {zones[r["id"]]["taille"]} »')
    return s, err, al


def dessiner_salles(salles, plan, profil, graine=0):
    """Carte complète à partir des rectangles du modèle et du plan : salles, couloirs, portes, contenu, départ, sortie."""
    c = profil['carte']['categories']
    W, H = plan['taille']
    rnd = random.Random(plan['niveau'] * 7919 + graine)
    g = [[c['mur_defaut']] * W for _ in range(H)]
    R = {r['id']: r for r in salles['salles']}
    Z = {z['id']: z for z in plan['zones']}
    dans = lambda q, r: r['x'] <= q[0] < r['x'] + r['l'] and r['y'] <= q[1] < r['y'] + r['h']
    centre = lambda r: (r['x'] + r['l'] // 2, r['y'] + r['h'] // 2)
    interieur = lambda q: 0 < q[0] < W - 1 and 0 < q[1] < H - 1
    for r in R.values():
        for y in range(r['y'], r['y'] + r['h']):
            for x in range(r['x'], r['x'] + r['l']):
                g[y][x] = c['sol_defaut']
    # couloirs : chemin le moins coûteux entre les centres des deux salles (Dijkstra, virages pénalisés pour des couloirs
    # droits). Interdit : le bord, les salles secrètes et le mur qui les entoure (sinon un couloir longe la salle secrète
    # et on y entre sans le passage — E23, 22/10). Coûteux : traverser une autre salle. Bon marché : un couloir existant.
    secretes = {k for k, z in Z.items() if z['role'] == 'secret'} | \
               {li['vers'] for li in plan['parcours'] if li['par'] == 'secret' and Z.get(li['vers'], {}).get('role') != 'depart'}
    # une zone secrète ne s'atteint que par son passage : ses autres liaisons sont ignorées
    plan = dict(plan, parcours=[li for li in plan['parcours'] if li['par'] == 'secret'
                                or not ({li['de'], li['vers']} & secretes)])
    autour = lambda q, r: r['x'] - 1 <= q[0] <= r['x'] + r['l'] and r['y'] - 1 <= q[1] <= r['y'] + r['h']

    def couloir(a, b, de, vers):
        import heapq
        depart_, arrivee = centre(R[de]), centre(R[vers])
        interdit = [R[k] for k in secretes if k not in (de, vers)]
        file, vu = [(0, depart_, None, [])], {}
        while file:
            cout, q, d, chemin = heapq.heappop(file)
            if q == arrivee:
                return chemin
            if vu.get((q, d), 1e9) <= cout:
                continue
            vu[(q, d)] = cout
            for dd in V4:
                n_ = (q[0] + dd[0], q[1] + dd[1])
                if not interieur(n_) or any(autour(n_, r) for r in interdit):
                    continue
                pas = 0.5 if g[n_[1]][n_[0]] == c['sol_defaut'] else 1
                if any(dans(n_, o) for k, o in R.items() if k not in (de, vers)):
                    pas += 4
                if d is not None and dd != d:
                    pas += 2
                heapq.heappush(file, (cout + pas, n_, dd, chemin + [n_]))
        return []
    portes = []
    for li in plan['parcours']:
        if li['de'] not in R or li['vers'] not in R:
            continue
        A, B = R[li['de']], R[li['vers']]
        if li['de'] in secretes:              # toujours vers la salle secrète : le mur secret est à son entrée
            A, B, li = B, A, dict(li, de=li['vers'], vers=li['de'])
        pts = couloir(A, B, li['de'], li['vers'])
        for q in pts:
            if interieur(q) and g[q[1]][q[0]] not in set(PORTES.values()):
                g[q[1]][q[0]] = c['sol_defaut']
        if li['par'] != 'ouvert':
            k = next((i for i, q in enumerate(pts) if dans(q, B)), None)
            if k and not dans(pts[k - 1], A) and interieur(pts[k - 1]):
                portes.append((pts[k - 1], PORTES[li['par']]))
    # piliers, lave, murs de la couleur de la zone
    for i, (zid, r) in enumerate(R.items()):
        z = Z[zid]
        mur = {'brique': '#', 'tech': '%'}.get(z.get('murs'), '%' if i % 2 else '#')
        for y in range(r['y'] - 1, r['y'] + r['h'] + 1):
            for x in range(r['x'] - 1, r['x'] + r['l'] + 1):
                if 0 <= x < W and 0 <= y < H and g[y][x] in c['murs']:
                    g[y][x] = mur
        # piliers : demandés, ou d'office dans une très grande salle (sinon de grands vides sans abri)
        if (r.get('piliers') or (r.get('piliers') is None and min(r['l'], r['h']) >= 7)) and r['l'] >= 6 and r['h'] >= 6:
            for y in range(r['y'] + 2, r['y'] + r['h'] - 2, 3):
                for x in range(r['x'] + 2, r['x'] + r['l'] - 2, 3):
                    g[y][x] = mur
        if z.get('lave') and r['l'] >= 5 and r['h'] >= 5:
            for y in range(r['y'] + 2, r['y'] + r['h'] - 2):
                for x in range(r['x'] + 2, r['x'] + r['l'] - 2):
                    g[y][x] = '~'
    for (x, y), ch in portes:
        g[y][x] = ch
    G = Grille([''.join(r) for r in g], profil)

    def libres(r, coins=False):
        cases = [(x, y) for y in range(r['y'], r['y'] + r['h']) for x in range(r['x'], r['x'] + r['l']) if G.vide(x, y)]
        if coins:
            cases.sort(key=lambda q: -sum(G.mur(q[0] + dx, q[1] + dy) for dx, dy in V4))
        return cases
    dep = next(z['id'] for z in plan['zones'] if z['role'] == 'depart')
    cand = sorted(libres(R[dep]), key=lambda q: math.dist(q, centre(R[dep])))
    p = cand[0]
    G.g[p[1]][p[0]] = c['depart']
    # clés, objets (recoins d'abord), puis monstres répartis, loin du départ
    for k in plan['progression']['cles']:
        if k['zone'] in R:
            l = libres(R[k['zone']], coins=True)
            if l:
                q = l[0]; G.g[q[1]][q[0]] = CLES[k['couleur']]
    for zid, r in R.items():
        objets = [ch for ch, n in Z[zid]['objets'].items() if ch in G.objets for _ in range(n)]
        if zid in secretes and not objets:          # un secret récompense toujours
            objets = [c['soin']]
        l = libres(r, coins=True)
        for ch, q in zip(objets, l[:len(objets)]):
            G.g[q[1]][q[0]] = ch
        pris = [p]
        for ch in [ch for ch, n in Z[zid]['ennemis'].items() if ch in G.monstres for _ in range(n)]:
            l = [q for q in libres(r) if math.dist(q, p) >= c['distance_depart_min'] + 1]
            if not l:
                break
            q = max(l, key=lambda q: min(math.dist(q, o) for o in pris) + rnd.random())
            G.g[q[1]][q[0]] = ch; pris.append(q)
    # zones « embuscade » : 2 de leurs monstres passent dans un réduit caché derrière un mur qui s'ouvre au passage
    for zid, r in R.items():
        if Z[zid]['role'] != 'embuscade' or 'embuscade' not in c:
            continue
        ici = [q for q in G.cases(G.monstres) if dans(q, r)][:2]
        if not ici:
            continue
        chars = [G.at(*q) for q in ici]
        for x, y in ici:
            G.g[y][x] = c['sol_defaut']
        sols = [(x, y) for y in range(r['y'], r['y'] + r['h']) for x in range(r['x'], r['x'] + r['l']) if G.vide(x, y)
                and (x in (r['x'], r['x'] + r['l'] - 1) or y in (r['y'], r['y'] + r['h'] - 1))]
        if not creuser_embuscade(G, sols, chars, rnd):
            for ch, (x, y) in zip(chars, ici):
                G.g[y][x] = ch                     # pas de mur assez épais : les monstres restent dans la salle
    # sortie : mur de la salle de sortie touchant son sol, le plus loin du départ
    sor = R[next(z['id'] for z in plan['zones'] if z['role'] == 'sortie')]
    anneau = [(x, y) for y in range(sor['y'] - 1, sor['y'] + sor['h'] + 1) for x in range(sor['x'] - 1, sor['x'] + sor['l'] + 1)
              if G.at(x, y) in G.murs and G.at(x, y) not in (c['secret'],) and 0 <= x < W and 0 <= y < H
              and any(dans((x + dx, y + dy), sor) and G.libre(x + dx, y + dy) for dx, dy in V4)]
    if anneau:
        q = max(anneau, key=lambda q: math.dist(q, p)); G.g[q[1]][q[0]] = c['sortie']
    return {'niveau': plan['niveau'], 'nom': plan['nom'], 'style': plan['style'], 'sky': bool(plan.get('exterieur')),
            'rows': G.rows, 'zones': {k: [r['x'], r['y'], r['l'], r['h']] for k, r in R.items()}}


# ---------------------------------------------------------------- embuscades et bonus (nouveaux niveaux et niveaux existants)
def creuser_embuscade(G, sols, monstres, rnd):
    """Un réduit de 2 cases creusé dans un mur épais, derrière une case de sol de `sols`, fermé par un mur d'embuscade
    (s'ouvre seul quand le joueur passe) ; `monstres` (2 au plus) y sont cachés. Renvoie la case du mur, ou None."""
    c = G.c
    plein = lambda x, y: G.at(x, y) in (c['mur_defaut'], '%') and 0 < x < G.w - 1 and 0 < y < G.h - 1
    sols = list(sols)
    rnd.shuffle(sols)
    for fx, fy in sols:
        for dx, dy in V4:
            w, c1, c2 = (fx + dx, fy + dy), (fx + 2 * dx, fy + 2 * dy), (fx + 3 * dx, fy + 3 * dy)
            cote = [(q[0] + dy, q[1] + dx) for q in (w, c1, c2)] + [(q[0] - dy, q[1] - dx) for q in (w, c1, c2)]
            if all(plein(*q) for q in (w, c1, c2)) and all(G.at(*q) in G.murs for q in cote + [(fx + 4 * dx, fy + 4 * dy)]) \
                    and G.at(*cote[0]) != c['secret'] and G.at(*cote[3]) != c['secret']:
                G.g[c1[1]][c1[0]] = G.g[c2[1]][c2[0]] = c['sol_defaut']
                for m, q in zip(monstres[:2], (c1, c2)):
                    G.g[q[1]][q[0]] = m
                G.g[w[1]][w[0]] = c['embuscade']
                return w
    return None


def ajouter_embuscades(carte, profil, nb, graine=0):
    """Niveaux existants : `nb` réduits d'embuscade près des salles éloignées du départ, garnis de 2 monstres du niveau
    (les plus courants, jamais un chef). Renvoie (carte, notes)."""
    G = Grille(carte['rows'], profil); c = G.c
    rnd = random.Random(graine)
    p = G.depart()
    dist = G.acces(p)
    presents = [G.at(*q) for q in G.cases(G.monstres) if G.at(*q) != c['chef']]
    if not presents or not p:
        return carte, []
    courants = sorted(set(presents), key=presents.count, reverse=True)
    loin = max(dist.values())
    # dans une salle (bord compris : 6 voisines libres sur 9), pas dans un couloir (3)
    salle = lambda q: sum(G.libre(q[0] + a, q[1] + b) for a in (-1, 0, 1) for b in (-1, 0, 1)) >= 5
    sols = [q for q, d in dist.items() if d >= max(6, loin * .3) and G.vide(*q) and salle(q)]
    notes, poses = [], []
    for k in range(nb):
        loin_des_autres = [q for q in sols if all(abs(q[0] - a) + abs(q[1] - b) > 8 for a, b in poses)]
        w = creuser_embuscade(G, loin_des_autres, [courants[k % len(courants)], courants[(k + 1) % len(courants)]], rnd)
        if not w:
            break
        poses.append(w); notes.append(f'embuscade creusée en {w}')
    return carte | {'rows': G.rows}, notes


def ajouter_bonus(carte, profil, n, graine=0):
    """Berserk (K) un niveau sur 3, invisibilité (I) un sur 4, dans un recoin à mi-parcours. Renvoie (carte, notes)."""
    G = Grille(carte['rows'], profil)
    rnd = random.Random(graine)
    p = G.depart()
    dist = G.acces(p)
    if not p or not dist:
        return carte, []
    loin = max(dist.values())
    recoins = [q for q, d in dist.items() if loin * .3 <= d <= loin * .7 and G.vide(*q)
               and sum(G.mur(q[0] + a, q[1] + b) for a, b in V4) >= 2]
    rnd.shuffle(recoins)
    notes = []
    for ch, garde in (('K', n % 3 == 0), ('I', n % 4 == 1)):
        if garde and ch in G.legende and not G.cases(ch) and recoins:
            q = recoins.pop(); G.g[q[1]][q[0]] = ch; notes.append(f'bonus {ch} posé en {q}')
    return carte | {'rows': G.rows}, notes


def meubler(carte, profil, objets, densite=1 / 25, ecart=4, graine=0):
    """Pose des objets de décor (`objets` : caractères, tirés au hasard) dans les zones dégagées : une case de sol vide
    entourée de sol (5 × 5 presque libre), loin du départ, des portes, secrets et sorties, à `ecart` cases au moins les
    uns des autres ; un objet pour 1/densite cases dégagées. Chaque pose est annulée si elle rend quelque chose
    inatteignable. Renvoie (carte, notes)."""
    G = Grille(carte['rows'], profil); c = G.c
    rnd = random.Random(graine)
    p = G.depart()
    if not p:
        return carte, []
    speciaux = set(c['portes']) | set(c['secret']) | set(c['sortie']) | set(c.get('embuscade', ''))
    degage = lambda x, y: sum(G.libre(x + a, y + b) for a in range(-2, 3) for b in range(-2, 3)) >= 21
    cand = [(x, y) for y in range(G.h) for x in range(G.w) if G.vide(x, y) and degage(x, y)
            and abs(x - p[0]) + abs(y - p[1]) > 4
            and not any(G.at(x + a, y + b) in speciaux for a in range(-2, 3) for b in range(-2, 3))]
    rnd.shuffle(cand)
    voulu = round(len(cand) * densite)
    tout_avant = set(G.acces(p, secrets=True))
    poses = []
    for x, y in cand:
        if len(poses) >= voulu:
            break
        if any(abs(x - a) + abs(y - b) < ecart for a, b in poses):
            continue
        G.g[y][x] = rnd.choice(objets)
        tout = set(G.acces(p, secrets=True))
        if len(tout) < len(tout_avant) - 1:                        # la pose coupe un passage : on la retire
            G.g[y][x] = c['sol_defaut']; continue
        tout_avant = tout
        poses.append((x, y))
    return carte | {'rows': G.rows}, ([f'{len(poses)} objets de décor posés dans les zones dégagées'] if poses else [])


def part_couloirs(G):
    """Part du sol en couloir (case de sol entre deux murs face à face) : au-delà de 0,4, le niveau manque de salles."""
    sol = [(x, y) for y in range(G.h) for x in range(G.w) if G.libre(x, y)]
    cou = [(x, y) for x, y in sol if (G.mur(x - 1, y) and G.mur(x + 1, y)) or (G.mur(x, y - 1) and G.mur(x, y + 1))]
    return len(cou) / max(1, len(sol))


# ---------------------------------------------------------------- ordres de retouche (sur la fiche, hors d'Unreal)
def appliquer_ordres(carte, ordres, profil):
    """Applique la liste ; renvoie (carte, rapport) avec une ligne « fait » ou « refusé : raison » par ordre."""
    G = Grille(carte['rows'], profil); c = G.c
    light = [list(r) for r in carte['light']] if carte.get('light') else None
    rapport = []

    def dedans(x, y):
        return 0 < x < G.w - 1 and 0 < y < G.h - 1

    # tolérance (nuit du 22/10 : 120 ordres refusés pour une case voisine) : la case visée est prise à 3 cases près
    def proche(x, y, ok, rayon=3):
        cand = [(a, b) for b in range(y - rayon, y + rayon + 1) for a in range(x - rayon, x + rayon + 1)
                if dedans(a, b) and ok(a, b)]
        return min(cand, key=lambda q: (abs(q[0] - x) + abs(q[1] - y), q)) if cand else None

    occupe = lambda a, b: G.at(a, b) in G.monstres | G.objets
    for i, o in enumerate(ordres['ordres']):
        f, x, y = o['faire'], o.get('x'), o.get('y')
        r = 'fait'
        if f in ('poser', 'retirer', 'deplacer', 'changer_case', 'lampe') and not dedans(x, y):
            r = 'refusé : case hors de la carte ou sur le bord'
        elif f == 'poser':
            q = proche(x, y, G.vide)
            if o['car'] not in G.monstres | G.objets:
                r = f'refusé : « {o["car"]} » n\'est ni un monstre ni un objet'
            elif not q:
                r = f'refusé : aucun sol vide près de ({x},{y})'
            else:
                G.g[q[1]][q[0]] = o['car']; r = 'fait' + (f' en {q}' if q != (x, y) else '')
        elif f == 'retirer':
            q = proche(x, y, occupe, 2)
            if not q:
                r = f'refusé : rien à retirer près de ({x},{y})'
            else:
                r = f'fait ({G.at(*q)} en {q})'; G.g[q[1]][q[0]] = c['sol_defaut']
        elif f == 'deplacer':
            vx, vy = o['vers_x'], o['vers_y']
            q = proche(x, y, lambda a, b: occupe(a, b) or G.at(a, b) == c['depart'], 2)
            v = proche(vx, vy, G.vide) if dedans(vx, vy) else None
            if not q:
                r = f'refusé : rien à déplacer près de ({x},{y})'
            elif not v:
                r = f'refusé : aucun sol vide près de ({vx},{vy})'
            else:
                G.g[v[1]][v[0]], G.g[q[1]][q[0]] = G.g[q[1]][q[0]], c['sol_defaut']; r = f'fait ({q} → {v})'
        elif f == 'changer_case':
            if o['car'] not in G.legende:
                r = f'refusé : « {o["car"]} » hors légende'
            else:
                G.g[y][x] = o['car']
        elif f == 'lampe':
            if not G.libre(x, y):
                r = 'refusé : une lampe se pose sur une case de sol'
            else:
                if light is None:
                    light = [['0'] * G.w for _ in range(G.h)]
                light[y][x] = str(max(1, min(9, round(o.get('intensite', 1) * 5))))
        elif f == 'regarder':
            zone = (carte.get('zones') or {}).get(o['zone'])
            if not zone and re.match(r'^\d+,\d+$', o['zone']):
                a, b = map(int, o['zone'].split(',')); zone = [max(0, a - 5), max(0, b - 5), 11, 11]
            r = ('vue :\n' + G.texte(*zone)) if zone else f'refusé : zone « {o["zone"]} » inconnue'
        elif f == 'essayer':
            e, a = valider_carte(carte | {'rows': G.rows}, profil)
            r = 'contrôle : ' + ('aucune erreur' if not e else '; '.join(e)) + (' | alertes : ' + '; '.join(a) if a else '')
        rapport.append(f'{i + 1}. {f} : {r}')
    out = carte | {'rows': G.rows}
    if light:
        out['light'] = [''.join(r) for r in light]
    return out, rapport


# ---------------------------------------------------------------- ligne de commande
def _args(argv):
    opts, pos, i = {}, [], 0
    while i < len(argv):
        if argv[i].startswith('--'):
            opts[argv[i][2:]] = argv[i + 1]; i += 2
        else:
            pos.append(argv[i]); i += 1
    return opts, pos


def deviner_type(fiche):
    return 'carte' if 'rows' in fiche else 'ordres' if 'ordres' in fiche else 'monstre' if 'stats' in fiche else 'plan_niveau'


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    opts, pos = _args(sys.argv[1:])
    prof = charger_profil(opts.get('profil'))
    plan = lire(opts['plan']) if 'plan' in opts else None
    cmd = pos[0]
    if cmd == 'valider':
        f = lire(pos[1]); t = opts.get('type') or deviner_type(f)
        e, a = valider(f, t, prof, plan)
        print(f'{t} : ' + ('OK' if not e else f'{len(e)} erreur(s)'))
        for x in e: print('  ERREUR', x)
        for x in a: print('  alerte', x)
        sys.exit(1 if e else 0)
    elif cmd == 'reparer':
        f, notes = reparer_carte(lire(pos[1]), prof, plan)
        ecrire(pos[1], f)
        print('\n'.join(notes) or 'rien à réparer')
        e, a = valider_carte(f, prof, plan)
        print('après réparation :', 'OK' if not e else e, a or '')
    elif cmd == 'ordres':
        carte, rap = appliquer_ordres(lire(pos[2]), lire(pos[1]), prof)
        ecrire(pos[2], carte)
        print('\n'.join(rap))
    elif cmd == 'voir':
        G = Grille(lire(pos[1])['rows'], prof)
        print(G.texte(*map(int, pos[2].split(','))) if len(pos) > 2 else G.texte())
