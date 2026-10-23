"""Photos d'un niveau construit, prises dans l'éditeur Unreal (serveur MCP, CaptureViewport) : à quoi il ressemble.

    python photos_niveau.py <n> [<n> …]   (ou 1-96)  →  <fiches>\\E<n>\\photos\\dessus.jpg, depart.jpg, salle.jpg, sortie.jpg

Une vue de dessus, plafond masqué (juger la forme : salles ou couloirs), puis trois vues à hauteur d'yeux, calculées
sur la grille : le départ (tourné vers l'espace le plus ouvert), la plus
grande salle loin du départ, l'arrivée devant la sortie. Les sprites (monstres, objets) sont tournés vers l'appareil :
dans l'éditeur, rien ne les fait pivoter (c'est le jeu qui le fait à chaque image).
L'éditeur doit être ouvert, sans partie en cours, et rien d'autre ne doit le piloter en même temps.
"""
import json, math, sys
from pathlib import Path
from PIL import Image

ICI = Path(__file__).resolve().parent
sys.path.insert(0, r'C:\workspace IA\Unreal\outils')
sys.path.insert(0, r'C:\workspace IA\Unreal\methode\outils')
import ue
import fiches as F
from jouer import PROFIL, carte_du_niveau, nom_carte
from ue_py import executer

CASE = float(PROFIL['echelle']['case_cm'])
OEIL = 165.0
FICHES = Path(PROFIL['chaine']['racine']) / PROFIL['chaine']['fiches']
V4 = F.V4


def course(G, x, y, d):
    n = 0
    while G.libre(x + d[0] * (n + 1), y + d[1] * (n + 1)):
        n += 1
    return n


def vues(G):
    """[(nom, x, y, yaw)] en cases ; yaw en degrés (0 = +X d'Unreal = vers la droite de la carte, 90 = vers le bas)."""
    yaw = lambda d: math.degrees(math.atan2(d[1], d[0]))
    p = G.depart()
    out = []
    d = max(V4, key=lambda d: course(G, *p, d))
    out.append(('depart', p[0], p[1], yaw(d)))
    dist = G.acces(p, secrets=True)
    loin = max(dist.values())
    ouvert = lambda q: sum(G.libre(q[0] + a, q[1] + b) for a in range(-3, 4) for b in range(-3, 4))
    cand = [q for q, k in dist.items() if k >= loin * .3] or list(dist)
    c = max(cand, key=ouvert)
    d = max(V4, key=lambda d: course(G, *c, d))
    recul = min(3, course(G, *c, (-d[0], -d[1])))          # un peu en retrait pour voir la salle
    out.append(('salle', c[0] - d[0] * recul, c[1] - d[1] * recul, yaw(d)))
    for ex, ey in G.cases(G.c['sortie']):
        for d in V4:
            f = (ex - d[0], ey - d[1])
            if G.libre(*f):
                recul = min(3, course(G, *f, (-d[0], -d[1])))
                out.append(('sortie', f[0] - d[0] * recul, f[1] - d[1] * recul, yaw(d)))
                break
        if len(out) == 3:
            break
    return out


TOURNER = '''
import unreal, math
cam = unreal.Vector(%f, %f, %f)
for a in unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors():
    # armes à ramasser : l'éditeur ne montre qu'une boîte blanche (l'arme n'apparaît qu'en jeu)
    if a.get_actor_label().split('_')[0] in ('Pistol', 'Rifle', 'GrenadeLauncher'):
        a.set_is_temporarily_hidden_in_editor(True)
    piv = [c for c in a.get_components_by_class(unreal.SceneComponent) if c.get_name() == 'Pivot']
    if piv:
        l = a.get_actor_location()
        piv[0].set_world_rotation(unreal.Rotator(0, 0, math.degrees(math.atan2(cam.y - l.y, cam.x - l.x)) + 90), False, False)
'''


PLAN = '''
import unreal
EAS = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
w = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
cap = EAS.spawn_actor_from_class(unreal.SceneCapture2D, unreal.Vector(%(x)f, %(y)f, 3000), unreal.Rotator(-90, -90, 0))
try:
    sc = cap.capture_component2d
    rt = unreal.RenderingLibrary.create_render_target2d(w, %(lx)d, %(ly)d, unreal.TextureRenderTargetFormat.RTF_RGBA8)
    sc.set_editor_property('texture_target', rt)
    sc.set_editor_property('projection_type', unreal.CameraProjectionMode.ORTHOGRAPHIC)
    sc.set_editor_property('ortho_width', %(largeur)f)
    sc.set_editor_property('capture_source', unreal.SceneCaptureSource.SCS_BASE_COLOR)
    sc.set_editor_property('capture_every_frame', False)
    for a in EAS.get_all_level_actors():
        if a.get_actor_label() in ('Plafond', 'Brouillard', 'Inst_Caissons'):
            sc.hide_actor_components(a)
    sc.capture_scene()
    unreal.RenderingLibrary.export_render_target(w, rt, '%(dossier)s', 'dessus')
finally:
    EAS.destroy_actor(cap)
'''

# plafond (bloc et caissons des modules) masqué dans l'éditeur seulement, le temps de la vue de dessus
MASQUER = '''
for a in unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors():
    if a.get_actor_label() in ('Plafond', 'Brouillard', 'Inst_Caissons'):
        a.set_is_temporarily_hidden_in_editor(%s)
'''


def photographier(n):
    nom = carte_du_niveau(n)
    chemin = f'{PROFIL["construction"]["racine"]}/Cartes/{nom_carte(nom)}'
    fiche = FICHES / f'E{n}' / 'carte.json'
    rows = F.lire(fiche)['rows'] if fiche.exists() else \
        json.loads(Path(PROFIL['construction']['source_cartes']).read_text(encoding='utf-8'))['niveaux'][n - 1]['rows']
    G = F.Grille(rows, F.charger_profil())
    if executer('import unreal\n'
                'assert not unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_game_world(), "partie en cours"\n'
                f'unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).load_level("{chemin}")\n'
                # vue « jeu » : sans icônes, volumes ni repères de l'éditeur sur les photos
                'unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).editor_set_game_view(True)\n', silencieux=True):
        print(f'E{n} : carte {chemin} impossible à ouvrir'); return []
    dossier = FICHES / f'E{n}' / 'photos'
    dossier.mkdir(parents=True, exist_ok=True)
    faites = []
    # vue de dessus : un plan (caméra orthographique, couleurs sans éclairage, plafond masqué) rendu dans une texture,
    # pour juger la forme du niveau comme la vue de dessus du jeu HTML ; 1 600 px sur le grand côté
    lx, ly = (1600, round(1600 * G.h / G.w)) if G.w >= G.h else (round(1600 * G.w / G.h), 1600)
    if executer(PLAN % {'x': G.w * CASE / 2, 'y': G.h * CASE / 2, 'lx': lx, 'ly': ly, 'largeur': G.w * CASE * 1.02,
                        'dossier': str(dossier).replace('\\', '/')}, silencieux=True) == 0:
        brut = dossier / 'dessus'
        if brut.exists():
            Image.open(brut).convert('RGB').save(dossier / 'dessus.jpg', quality=85)
            brut.unlink()
            faites.append('dessus')
    for quoi, x, y, yaw, z, pitch in [(q, x, y, yaw, OEIL, -4) for q, x, y, yaw in vues(G)]:
        cam = ((x + .5) * CASE, (y + .5) * CASE, z)
        executer(TOURNER % cam + (MASQUER % ('True' if quoi == 'dessus' else 'False')), silencieux=True)
        png = dossier / f'{quoi}.png'
        ue.capture(str(png), {'location': {'x': cam[0], 'y': cam[1], 'z': cam[2]},
                              'rotation': {'pitch': pitch, 'yaw': yaw, 'roll': 0}, 'scale': {'x': 1, 'y': 1, 'z': 1}})
        im = Image.open(png).convert('RGB')
        if quoi == 'dessus':                           # recadré sur le niveau (le reste est noir)
            boite = im.convert('L').point(lambda v: 255 if v > 20 else 0).getbbox()
            if boite:
                m = 12
                im = im.crop((max(0, boite[0] - m), max(0, boite[1] - m), min(im.width, boite[2] + m), min(im.height, boite[3] + m)))
        im.thumbnail((1600, 900) if quoi == 'dessus' else (960, 540))
        im.save(dossier / f'{quoi}.jpg', quality=82)
        png.unlink()
        faites.append(quoi)
    # sprites tournés : la carte est modifiée ; enregistrée pour que l'ouverture de la suivante ne demande rien
    executer('import unreal\nunreal.get_editor_subsystem(unreal.LevelEditorSubsystem).save_current_level()\n', silencieux=True)
    print(f'E{n} : {", ".join(faites)}')
    return faites


def numeros(args):
    for a in args:
        d, _, f = a.partition('-')
        yield from range(int(d), int(f or d) + 1)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    ue.init()
    for n in numeros(sys.argv[1:]):
        try:
            photographier(n)
        except Exception as e:
            print(f'E{n} : échec {type(e).__name__} : {e}')
