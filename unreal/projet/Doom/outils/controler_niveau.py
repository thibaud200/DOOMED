"""Contrôle d'un niveau construit, dans l'éditeur ouvert (lancé par controler.py, après le calcul de la navigation).

    python ue_py.py controler_niveau.py CARTE=<fiche.json> SORTIE=<rapport.json>     (ou NIVEAU=0 pour E1 exporté)

Vérifie, case par case de la grille : chaque monstre, objet, porte, secret et sortie a son acteur ; la navigation mène
du départ à la sortie (portes comprises) et à chaque monstre au sol. Écrit le rapport JSON :
{ok, erreurs[], alertes[], comptes{}}. Une erreur = niveau injouable ; une alerte = à regarder.
"""
import glob, json, math, sys, unicodedata
from pathlib import Path
import unreal

sys.path.insert(0, r'C:\workspace IA\Unreal\methode\outils')
import fiches

PROFIL_CHEMIN = Path(globals().get('PROFIL', r'C:\workspace IA\Unreal\Doom\profil\jeu.json'))
PROFIL = fiches.charger_profil(PROFIL_CHEMIN)
PC = PROFIL['construction']
CASE = float(PROFIL['echelle']['case_cm'])
D = json.load(open(PC['source_cartes'], encoding='utf-8'))
for f in sorted(glob.glob(str(PROFIL_CHEMIN.parent / 'monstres' / '*.json'))):
    m = json.load(open(f, encoding='utf-8'))
    D['legende']['ennemis'][m['car']] = m['type']
if globals().get('CARTE'):
    F = json.load(open(CARTE, encoding='utf-8'))
    N = {'name': F['nom'], 'rows': F['rows']}
else:
    N = D['niveaux'][int(globals().get('NIVEAU', 0))]
ROWS = N['rows']
G = fiches.Grille(ROWS, PROFIL)
c = G.c
erreurs, alertes = [], []

UES = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem)
assert not UES.get_game_world(), 'une partie tourne (PIE) : contrôle annulé'
W = UES.get_editor_world()
s = unicodedata.normalize('NFKD', N['name']).encode('ascii', 'ignore').decode()
code, _, titre = s.partition(' ')
attendu = code + '_' + ''.join(ch for ch in titre.title() if ch.isalnum())
if not W.get_path_name().split('.')[-1] == attendu:
    erreurs.append(f'carte ouverte {W.get_path_name()} ≠ {attendu} attendue')

acteurs = {a.get_actor_label(): a for a in unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors()
           if 'DOOMED' in [str(t) for t in a.tags]}
comptes = {'acteurs': len(acteurs)}

# ---------- présence des acteurs ----------
ARMES = PC['armes']
OBJETS = {k for k in PC['objets'] if not k.startswith('_')}
manque = []
nm = no = ndecor = 0
for y, r in enumerate(ROWS):
    for x, ch in enumerate(r):
        t = D['legende']['ennemis'].get(ch)
        o = D['legende']['objets'].get(ch)
        if t:
            nm += 1
            if f'{t}_{x}_{y}' not in acteurs:
                manque.append(f'monstre {t} ({x},{y})')
        elif o:
            if o in ARMES:
                nom = f'{ARMES[o]}_{x}_{y}'
            elif o in OBJETS:
                nom = f'{o}_{x}_{y}'
            else:
                alertes.append(f'objet {o} ({x},{y}) non géré par la construction (pas posé)')
                continue
            no += 1
            if nom not in acteurs:
                manque.append(f'objet {o} ({x},{y})')
        elif ch in c['portes'] and f'{"PorteVerrouillee" if ch in c["cles"] else "Porte"}_{x}_{y}' not in acteurs:
            manque.append(f'porte ({x},{y})')
        elif ch in c.get('decor', ''):
            ndecor += 1                      # décor en instances (acteur Inst_Decor) : compté plus bas
        elif ch in c.get('embuscade', '') and any(G.libre(x + dx, y + dy) for dx, dy in fiches.V4) \
                and f'Embuscade_{x}_{y}' not in acteurs:
            manque.append(f'embuscade ({x},{y})')
        elif ch == c['secret'] and any(G.libre(x + dx, y + dy) for dx, dy in fiches.V4) and f'Secret_{x}_{y}' not in acteurs:
            manque.append(f'passage secret ({x},{y})')
        elif ch == c['sortie'] and any(G.libre(x + dx, y + dy) for dx, dy in fiches.V4) and f'Sortie_{x}_{y}' not in acteurs:
            manque.append(f'sortie ({x},{y})')
comptes.update(monstres=nm, objets=no)


def instances(famille):
    a = acteurs.get(f'Inst_{famille}')
    return sum(k.get_instance_count() for k in a.get_components_by_class(unreal.InstancedStaticMeshComponent)) if a else 0


comptes['instances'] = {k[5:]: instances(k[5:]) for k in acteurs if k.startswith('Inst_')}
if instances('Decor') != ndecor:
    manque.append(f'décor : {instances("Decor")} instance(s) pour {ndecor} case(s)')
if not instances('Murs'):
    erreurs.append('aucun mur (Inst_Murs vide)')
if manque:
    erreurs.append(f'{len(manque)} acteur(s) absent(s) : ' + ', '.join(manque[:8]))
if 'Depart' not in acteurs:
    erreurs.append('départ du joueur absent')
if not any(k.startswith(PC['arme_depart'] + '_') for k in acteurs):
    alertes.append(f'arme de départ {PC["arme_depart"]} absente')

# ---------- navigation ----------
NAV = unreal.NavigationSystemV1
nav = next(iter(unreal.GameplayStatics.get_all_actors_of_class(W, unreal.RecastNavMesh)), None)
centre = lambda x, y: unreal.Vector((x + .5) * CASE, (y + .5) * CASE, 100)


def chemin(a, b):
    p = NAV.find_path_to_location_synchronously(W, a, b, nav)
    return p is not None and p.is_valid() and not p.is_partial()


p = G.depart()
if not nav:
    erreurs.append('aucun maillage de navigation')
elif p:
    depart = centre(*p)
    if NAV.project_point_to_navigation(W, depart, nav, None, unreal.Vector(50, 50, 300)) is None:
        erreurs.append('le départ n\'est pas sur le maillage de navigation (navigation non calculée ?)')
    else:
        sorties = [(x + dx, y + dy) for x, y in G.cases(c['sortie']) for dx, dy in fiches.V4 if G.libre(x + dx, y + dy)]
        if sorties and not any(chemin(depart, centre(*q)) for q in sorties):
            erreurs.append('aucun chemin de navigation du départ à la sortie')
        sans_secret = G.acces(p)
        volants = {t for t, e in D['ennemis'].items() if e.get('fly')}
        isoles = []
        for x, y in G.cases(G.monstres):
            t = D['legende']['ennemis'].get(G.at(x, y))
            if (x, y) in sans_secret and t not in volants and not chemin(depart, centre(x, y)):
                isoles.append(f'{t} ({x},{y})')
        if isoles:
            alertes.append(f'{len(isoles)} monstre(s) sans chemin jusqu\'au joueur : ' + ', '.join(isoles[:6]))
        comptes['cases_atteignables'] = len(sans_secret)

rapport = {'niveau': N['name'], 'carte': W.get_path_name(), 'ok': not erreurs, 'erreurs': erreurs, 'alertes': alertes,
           'comptes': comptes}
if globals().get('SORTIE'):
    Path(SORTIE).parent.mkdir(parents=True, exist_ok=True)
    Path(SORTIE).write_text(json.dumps(rapport, ensure_ascii=False, indent=1), encoding='utf-8')
print(json.dumps(rapport, ensure_ascii=False))
