"""Construit un niveau de DOOMED dans l'éditeur ouvert, d'après C:\\workspace IA\\Unreal\\DOOMED_import\\doomed.json.

    python ue_py.py construire_niveau.py NIVEAU=0        (0 = E1 « Hangar », … 19 = E20)
    python ue_py.py construire_niveau.py CARTE=<fiche>   (fiche carte du modèle, methode\\schemas\\carte.schema.json)

Tout ce qui est propre au jeu (échelle, textures, modules, Blueprints, conversions) vient du profil
Doom\\profil\\jeu.json (sections echelle et construction).
Relancer remplace le niveau (tous les acteurs marqués DOOMED sont détruits puis recréés).
Unités : 1 case de la carte = CASE cm ; x de la carte = +X d'Unreal, y de la carte (vers le bas) = +Y.
Contenu : murs (seulement les cases touchant un sol), sol et plafond d'un seul tenant, portes BP_DoorFrame
(s'ouvrent à l'approche), interrupteur de sortie (mur texturé EXIT), départ du joueur, éclairage.
Pas encore : ennemis, objets, mur secret ($ = mur de brique), lave (~ = sol), clés.
"""
import glob, json, math, unicodedata
from pathlib import Path
import unreal

PROFIL_CHEMIN = Path(globals().get('PROFIL', r'C:\workspace IA\Unreal\Doom\profil\jeu.json'))
PROFIL_DIR = PROFIL_CHEMIN.parent
PROFIL = json.load(open(PROFIL_CHEMIN, encoding='utf-8'))
PC = PROFIL['construction']
NIVEAU = int(globals().get('NIVEAU', 0))
IMPORT = PC['source_cartes'].rpartition('\\')[0]
CASE, HAUT = float(PROFIL['echelle']['case_cm']), float(PROFIL['echelle']['hauteur_cm'])
RACINE = PC['racine']
TAG = 'DOOMED'

assert not unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_game_world(), \
    'une partie tourne dans l\'éditeur (PIE) : arrêtez-la avant de construire'
D = json.load(open(PC['source_cartes'], encoding='utf-8'))


def monstre_cree(f):
    """Fiche monstre du modèle (profil\\monstres\\<type>.json) → définition au format du jeu HTML (ENEMY_DEF)."""
    s, a = f['stats'], f['attaque']
    e = {'hp': s['hp'], 'speed': s['speed'], 'melee': s['melee'], 'r': s['r'], 'scale': 0.9,
         'special': f.get('special', 'aucun'), 'puissance': f.get('puissance', 0)}
    if s.get('fly'):
        e['fly'] = s['fly']
    tir = {'min': a.get('portee', [0, 0])[0], 'max': a.get('portee', [0, 0])[1], 'cool': a.get('recharge', [1, 1]),
           'dmg': a.get('degats', [0, 0])}
    if a['mode'] == 'boule':
        e['ranged'] = tir | {'speed': a['vitesse'], 'color': a.get('couleur', 'fire')}
    elif a['mode'] == 'balle':
        e['hitscan'] = tir
    elif a['mode'] == 'charge':
        e['charge'] = tir | {'speed': a['vitesse'], 'time': 0.8}
    return e


for _f in sorted(glob.glob(str(PROFIL_DIR / 'monstres' / '*.json'))):
    _m = json.load(open(_f, encoding='utf-8'))
    D['ennemis'][_m['type']] = monstre_cree(_m)
    D['legende']['ennemis'][_m['car']] = _m['type']
    D['legende']['cases'][_m['car']] = 0
    PC['tailles_monstres'].setdefault(_m['type'], [round(_m['stats']['r'] * 66), 56])
# décor (profil : construction.decor) : la case reçoit sol et plafond comme du sol ; l'objet est posé plus bas
DECOR = {k: v for k, v in PC.get('decor', {}).items() if k != '_note'}      # « _ » est un objet (rambarde)
for _c in DECOR:
    D['legende']['cases'][_c] = 0
if globals().get('CARTE'):
    # fiche carte du modèle : mêmes champs que les niveaux exportés, sous les noms du schéma
    F = json.load(open(CARTE, encoding='utf-8'))
    N = {'name': F['nom'], 'rows': F['rows'], 'w': len(F['rows'][0]), 'h': len(F['rows']),
         'angle': F.get('angle', 0), 'sky': F.get('sky', False), 'light': F.get('light')}
    NIVEAU = F['niveau'] - 1
else:
    N = D['niveaux'][NIVEAU]
ROWS, W, H = N['rows'], N['w'], N['h']
CODE = D['legende']['cases']
AT = unreal.AssetToolsHelpers.get_asset_tools()
EAL, MEL = unreal.EditorAssetLibrary, unreal.MaterialEditingLibrary
EAS = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
LES = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)

# textures Freedoom agrandies par IA (agrandir.py : DOOMED_import\hd\murs, avec carte de relief _N)
TEXTURES = PC['textures']
LARGEUR = PC['textures_repet_largeur']     # brique : texture deux fois plus haute que large, répétée 2 fois en largeur
LUMIERE = PC['lumiere']                    # exposition fixe : Doom reste sombre


def nom_carte(n):
    s = unicodedata.normalize('NFKD', n['name']).encode('ascii', 'ignore').decode()
    code, _, titre = s.partition(' ')
    return code + '_' + ''.join(c for c in titre.title() if c.isalnum())


# ---------- textures et matériaux ----------
def texture(cle, relief=False):
    nom = f'T_hd_{cle}' + ('_N' if relief else '')
    dest = f'{RACINE}/Textures/{nom}'
    if not EAL.does_asset_exist(dest):
        t = unreal.AssetImportTask()
        t.set_editor_property('filename', IMPORT + r'\hd\murs' + '\\' + TEXTURES[cle] + ('_N' if relief else '') + '.png')
        t.set_editor_property('destination_path', f'{RACINE}/Textures')
        t.set_editor_property('destination_name', nom)
        t.set_editor_property('automated', True)
        t.set_editor_property('save', False)
        AT.import_asset_tasks([t])
        tx = unreal.load_asset(dest)
        if relief:
            tx.set_editor_property('compression_settings', unreal.TextureCompressionSettings.TC_NORMALMAP)
            tx.set_editor_property('srgb', False)
        EAL.save_asset(dest)
    return unreal.load_asset(dest)


def materiau_base():
    """M_DoomHD : couleur + relief, répétition réglable, émissif réglable. (M_Doom, l'ancien, reste tel quel.)"""
    dest = f'{RACINE}/Materiaux/M_DoomHD'
    if EAL.does_asset_exist(dest):
        return unreal.load_asset(dest)
    m = AT.create_asset('M_DoomHD', f'{RACINE}/Materiaux', unreal.Material, unreal.MaterialFactoryNew())
    uv = MEL.create_material_expression(m, unreal.MaterialExpressionTextureCoordinate, -900, 0)
    ru = MEL.create_material_expression(m, unreal.MaterialExpressionScalarParameter, -900, 150)
    ru.set_editor_property('parameter_name', 'RepetU'); ru.set_editor_property('default_value', 1.0)
    rv = MEL.create_material_expression(m, unreal.MaterialExpressionScalarParameter, -900, 250)
    rv.set_editor_property('parameter_name', 'RepetV'); rv.set_editor_property('default_value', 1.0)
    ap = MEL.create_material_expression(m, unreal.MaterialExpressionAppendVector, -700, 200)
    MEL.connect_material_expressions(ru, '', ap, 'A'); MEL.connect_material_expressions(rv, '', ap, 'B')
    mu = MEL.create_material_expression(m, unreal.MaterialExpressionMultiply, -550, 50)
    MEL.connect_material_expressions(uv, '', mu, 'A'); MEL.connect_material_expressions(ap, '', mu, 'B')
    tx = MEL.create_material_expression(m, unreal.MaterialExpressionTextureSampleParameter2D, -350, 0)
    tx.set_editor_property('parameter_name', 'Tex'); tx.set_editor_property('texture', texture('brique'))
    MEL.connect_material_expressions(mu, '', tx, 'UVs')
    MEL.connect_material_property(tx, 'RGB', unreal.MaterialProperty.MP_BASE_COLOR)
    nm = MEL.create_material_expression(m, unreal.MaterialExpressionTextureSampleParameter2D, -350, 200)
    nm.set_editor_property('parameter_name', 'Relief'); nm.set_editor_property('sampler_type', unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL)
    nm.set_editor_property('texture', texture('brique', True))
    MEL.connect_material_expressions(mu, '', nm, 'UVs')
    MEL.connect_material_property(nm, 'RGB', unreal.MaterialProperty.MP_NORMAL)
    # rugosité : les parties sombres (joints, creux) plus mates, les faces claires un peu brillantes
    ro = MEL.create_material_expression(m, unreal.MaterialExpressionLinearInterpolate, -150, 150)
    c1 = MEL.create_material_expression(m, unreal.MaterialExpressionConstant, -350, 400); c1.set_editor_property('r', 0.95)
    c2 = MEL.create_material_expression(m, unreal.MaterialExpressionConstant, -350, 450); c2.set_editor_property('r', 0.55)
    MEL.connect_material_expressions(c1, '', ro, 'A'); MEL.connect_material_expressions(c2, '', ro, 'B')
    MEL.connect_material_expressions(tx, 'G', ro, 'Alpha')
    MEL.connect_material_property(ro, '', unreal.MaterialProperty.MP_ROUGHNESS)
    em = MEL.create_material_expression(m, unreal.MaterialExpressionScalarParameter, -350, 550)
    em.set_editor_property('parameter_name', 'Emissif'); em.set_editor_property('default_value', 0.0)
    me = MEL.create_material_expression(m, unreal.MaterialExpressionMultiply, -150, 400)
    MEL.connect_material_expressions(tx, 'RGB', me, 'A'); MEL.connect_material_expressions(em, '', me, 'B')
    MEL.connect_material_property(me, '', unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    MEL.recompile_material(m)
    EAL.save_asset(dest)
    return m


def instance(cle, repet=(1.0, 1.0), emissif=0.0):
    repet = (repet[0] * LARGEUR.get(cle, 1.0), repet[1])
    nom = f'MI_hd_{cle}' + ('' if repet == (1.0, 1.0) else f'_{int(repet[0])}x{int(repet[1])}')
    dest = f'{RACINE}/Materiaux/{nom}'
    if EAL.does_asset_exist(dest):
        return unreal.load_asset(dest)
    mi = AT.create_asset(nom, f'{RACINE}/Materiaux', unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
    MEL.set_material_instance_parent(mi, materiau_base())
    MEL.set_material_instance_texture_parameter_value(mi, 'Tex', texture(cle))
    MEL.set_material_instance_texture_parameter_value(mi, 'Relief', texture(cle, True))
    MEL.set_material_instance_scalar_parameter_value(mi, 'RepetU', repet[0])
    MEL.set_material_instance_scalar_parameter_value(mi, 'RepetV', repet[1])
    MEL.set_material_instance_scalar_parameter_value(mi, 'Emissif', emissif)
    EAL.save_asset(dest)
    return mi


def noir():
    """MI_hd_noir : noir mat (fond derrière les panneaux sci-fi, vu par leurs parties ajourées comme avant le vide)."""
    dest = f'{RACINE}/Materiaux/MI_hd_noir'
    if EAL.does_asset_exist(dest):
        return unreal.load_asset(dest)
    mi = AT.create_asset('MI_hd_noir', f'{RACINE}/Materiaux', unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
    MEL.set_material_instance_parent(mi, materiau_base())
    MEL.set_material_instance_texture_parameter_value(mi, 'Tex', unreal.load_asset('/Engine/EngineResources/Black'))
    MEL.set_material_instance_texture_parameter_value(mi, 'Relief', unreal.load_asset('/Engine/EngineMaterials/DefaultNormal'))
    EAL.save_asset(dest)
    return mi


# ---------- niveau ----------
CHEMIN = f'{RACINE}/Cartes/{nom_carte(N)}'
if EAL.does_asset_exist(CHEMIN):
    LES.load_level(CHEMIN)
else:
    LES.new_level(CHEMIN)
for a in EAS.get_all_level_actors():
    if TAG in [str(t) for t in a.tags]:
        EAS.destroy_actor(a)

CUBE = unreal.load_asset('/Engine/BasicShapes/Cube')     # 100 cm, centré
case = lambda x, y: ROWS[y][x] if 0 <= x < W and 0 <= y < H else '#'
sol = lambda c: CODE.get(c, 1) == 0
porte = lambda c: c in '=RBJ'


def poser(acteur, label, dossier):
    acteur.set_actor_label(label)
    acteur.set_folder_path(f'DOOMED/{dossier}')
    acteur.tags = [TAG]
    return acteur


def bloc(label, dossier, centre, echelle, mi):
    a = EAS.spawn_actor_from_object(CUBE, unreal.Vector(*centre), unreal.Rotator(0, 0, 0))
    a.set_actor_scale3d(unreal.Vector(*echelle))
    a.static_mesh_component.set_material(0, mi)
    return poser(a, label, dossier)


# ---------- instances : les objets répétés (murs, panneaux, dalles, caissons, rochers, lave, décor) ne sont plus des
# acteurs séparés (1 400 par niveau en médiane, cartes de 3 à 6 Mo) mais des instances d'un composant par maillage et
# matériaux, sur un acteur par famille (« Inst_Murs »…). Restent des acteurs : ce qui bouge ou s'active (secrets,
# embuscades, sorties, portes), monstres, objets, lumières.
SDS = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem)
# ISM et non HISM : recommandation d'Epic (doc « Instanced Static Mesh Component », ISM toujours avec Nanite)
COMPOSANT_INSTANCES = unreal.InstancedStaticMeshComponent
_porteurs, _lots = {}, {}


def inst(famille, maillage, centre, echelle=(1, 1, 1), yaw=0.0, materiaux=None, collision=False, visible=True):
    m = unreal.load_asset(maillage) if isinstance(maillage, str) else maillage
    cle = (famille, m.get_path_name(), tuple(x.get_path_name() for x in materiaux or []), collision, visible)
    c = _lots.get(cle)
    if c is None:
        a = _porteurs.get(famille)
        if a is None:
            a = EAS.spawn_actor_from_class(unreal.Actor, unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0))
            _porteurs[famille] = poser(a, f'Inst_{famille}', 'Instances')
        h = SDS.k2_gather_subobject_data_for_instance(a)
        nh, _ = SDS.add_new_subobject(unreal.AddNewSubobjectParams(parent_handle=h[0], new_class=COMPOSANT_INSTANCES,
                                                                   blueprint_context=None))
        c = unreal.SubobjectDataBlueprintFunctionLibrary.get_object(unreal.SubobjectDataBlueprintFunctionLibrary.get_data(nh))
        # racine du porteur statique aussi : sinon Unreal refuse d'y attacher les instances statiques (82 avertissements
        # « AttachTo … n'est pas statique » au cook du 23/10)
        if a.root_component and a.root_component != c:
            a.root_component.set_mobility(unreal.ComponentMobility.STATIC)
        c.set_mobility(unreal.ComponentMobility.STATIC)
        c.set_static_mesh(m)
        for i, mi in enumerate(materiaux or []):
            c.set_material(i, mi)
        if collision:
            c.set_collision_profile_name('BlockAll')
        else:
            c.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
        c.set_editor_property('can_ever_affect_navigation', collision)
        c.set_visibility(visible)
        _lots[cle] = c
    c.add_instance(unreal.Transform(location=unreal.Vector(*centre), rotation=unreal.Rotator(0, 0, yaw), scale=unreal.Vector(*echelle)))
    return c


def rectangles(cases):
    """Fusion des murs : les cases d'un ensemble regroupées en rectangles (glouton, ligne par ligne) -> [(x, y, l, h)]."""
    reste, out = set(cases), []
    for y in range(H):
        for x in range(W):
            if (x, y) not in reste:
                continue
            l = 1
            while (x + l, y) in reste:
                l += 1
            h = 1
            while all((x + i, y + h) in reste for i in range(l)):
                h += 1
            for j in range(h):
                for i in range(l):
                    reste.discard((x + i, y + j))
            out.append((x, y, l, h))
    return out


# extérieur (carte : sky) : falaises de roche plus hautes, sol de terre, pas de plafond, ciel et soleil (plus bas)
EXT = PC.get('exterieur') if N.get('sky') and PC.get('exterieur') else None
HMUR = EXT['hauteur_murs'] if EXT else HAUT
if EXT:
    roche = instance(EXT['mur'], (1.0, HMUR / CASE))
    MI = {'#': roche, '$': roche, '%': roche, '!': roche, 'E': instance('sortie', emissif=0.6)}
else:
    MI = {'#': instance('brique'), '$': instance('brique'), '%': instance('tech'), 'E': instance('sortie', emissif=0.6)}
# murs exposés (une case de sol ou de porte à côté) ; les murs enfouis sont inutiles
MURS_VUS = [(x, y, ROWS[y][x]) for y in range(H) for x in range(W) if not (sol(ROWS[y][x]) or porte(ROWS[y][x]))
            and any(sol(case(x + dx, y + dy)) or porte(case(x + dx, y + dy)) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
INDIVIDUELS = '$!E'                    # murs qui bougent ou s'activent : acteurs à part (passage, embuscade, sortie)
nmurs = len(MURS_VUS)
for x, y, c in MURS_VUS:
    if c == 'E' and HMUR > HAUT:
        # sortie en extérieur : pan EXIT de la hauteur d'un mur intérieur, la falaise reprend au-dessus (sinon pan gris
        # de 6 m, texture étirée, au milieu de la roche : vu le 22/10)
        bloc(f'Mur_{x}_{y}', 'Murs', ((x + .5) * CASE, (y + .5) * CASE, HAUT / 2), (CASE / 100, CASE / 100, HAUT / 100), MI['E'])
        inst('Murs', CUBE, ((x + .5) * CASE, (y + .5) * CASE, (HAUT + HMUR) / 2), (CASE / 100, CASE / 100, (HMUR - HAUT) / 100),
             materiaux=[instance(EXT['mur'], (1.0, (HMUR - HAUT) / CASE))], collision=True)
    elif c in INDIVIDUELS:
        bloc(f'Mur_{x}_{y}', 'Murs', ((x + .5) * CASE, (y + .5) * CASE, HMUR / 2), (CASE / 100, CASE / 100, HMUR / 100), MI.get(c, MI['#']))

# sol et plafond d'un seul tenant, la texture répétée une fois par case (extérieur : terre, et le ciel pour plafond)
sol_bloc = bloc('Sol', 'Sol', (W * CASE / 2, H * CASE / 2, -10), (W * CASE / 100, H * CASE / 100, .2),
                instance(EXT['sol'] if EXT else 'sol', (W, H)))
plafond_bloc = None if EXT else \
    bloc('Plafond', 'Sol', (W * CASE / 2, H * CASE / 2, HAUT + 10), (W * CASE / 100, H * CASE / 100, .2), instance('plafond', (W, H)))

# extérieur : rochers 3D le long des falaises (visuels seuls, les cubes de roche font la collision), une paroi sur trois
if EXT:
    import random as _rnd
    alea = _rnd.Random(NIVEAU * 7919)
    rochers = [unreal.load_asset(p) for p in EXT['rochers']]
    nroc = 0
    for y in range(H):
        for x in range(W):
            if ROWS[y][x] not in '#%' or not any(sol(case(x + dx, y + dy)) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                continue
            if alea.random() > EXT['part_rochers']:
                continue
            m = alea.choice(rochers)
            b = m.get_bounding_box()
            k = CASE * alea.uniform(.95, 1.15) / max(b.max.x - b.min.x, b.max.y - b.min.y)
            # même roche que les falaises : pas de bloc gris qui jure
            mats = [instance(EXT['materiau_rochers'])] * len(m.get_editor_property('static_materials')) if EXT.get('materiau_rochers') else None
            inst('Rochers', m, ((x + .5) * CASE, (y + .5) * CASE, -b.min.z * k - 40), (k, k, k * alea.uniform(.9, 1.4)),
                 alea.uniform(0, 360), mats)
            nroc += 1
    print(f'extérieur : falaises de {HMUR} cm, {nroc} rochers')

# ---------- habillage « sci-fi » : modules 3D du pack Fab « Modular SciFi Season 1 Starter Bundle » ----------
# Les cubes ci-dessus restent comme collisions et navigation, mais invisibles ; on pose dessus, case par case :
# un panneau de mur sur chaque face de mur qui donne sur un sol (décor tourné vers le sol), un panneau de sol et
# un caisson de plafond par case de sol. Les modules sont mis à l'échelle d'une case (ils font 320 à 360 cm).
# Les murs de sortie (E) gardent leur texture EXIT. HABILLAGE = None : version texturée seule (cubes visibles).
HABILLAGE = globals().get('HABILLAGE', PROFIL['habillage']['defaut'])
MODULES = {} if EXT else PC['habillages'].get(HABILLAGE, {})        # les modules sci-fi sont des intérieurs


def module(nom, label, dossier, yaw, ancre_locale, cible, taille):
    """Pose le maillage `nom` tourné de `yaw`, mis à l'échelle pour que sa boîte locale fasse `taille` (None = garder),
    et que le point `ancre_locale` (fractions 0..1 de sa boîte, en local) tombe sur le point monde `cible`."""
    m = unreal.load_asset(MODULES[nom])
    b = m.get_bounding_box()
    mn, mx = (b.min.x, b.min.y, b.min.z), (b.max.x, b.max.y, b.max.z)
    dim = [mx[i] - mn[i] for i in range(3)]
    s = [taille[i] / dim[i] if taille[i] else 1.0 for i in range(3)]
    p = [s[i] * (mn[i] + ancre_locale[i] * dim[i]) for i in range(3)]
    t = math.radians(yaw)
    px, py = p[0] * math.cos(t) - p[1] * math.sin(t), p[0] * math.sin(t) + p[1] * math.cos(t)
    pos = (cible[0] - px, cible[1] - py, cible[2] - p[2])
    if label is None:                      # instance (la plupart) ; un acteur seulement pour un mur qui bouge
        return inst(dossier, m, pos, s, yaw)
    a = EAS.spawn_actor_from_object(m, unreal.Vector(*pos), unreal.Rotator(0, 0, yaw))
    a.set_actor_scale3d(unreal.Vector(*s))
    a.static_mesh_component.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
    a.static_mesh_component.set_editor_property('can_ever_affect_navigation', False)
    return poser(a, label, 'Decor')


if MODULES:                    # habillage en modules 3D (profil : construction.habillages)
    sol_bloc.static_mesh_component.set_visibility(False)
    plafond_bloc.static_mesh_component.set_visibility(False)
    # face décorée du mur = +Y local à yaw 0 ; on tourne le module pour qu'elle regarde la case de sol
    YAW = {(0, 1): 0, (-1, 0): 90, (0, -1): 180, (1, 0): -90}
    # collision des murs ordinaires : cubes invisibles fusionnés en rectangles (une case = un cube avant)
    for x, y, l, h in rectangles([(x, y) for x, y, c in MURS_VUS if c not in INDIVIDUELS]):
        inst('Murs', CUBE, ((x + l / 2) * CASE, (y + h / 2) * CASE, HAUT / 2), (l * CASE / 100, h * CASE / 100, HAUT / 100),
             materiaux=[MI['#']], collision=True, visible=False)
    # fond de mur visible, juste derrière les panneaux (60 cm de profondeur), sans collision : les panneaux ne se rejoignent pas
    # tout à fait aux angles, et par la fente on voyait les salles voisines (E1, 23/10). Toutes les cases de mur qui
    # touchent un sol ou une porte, en diagonale comprise (la case d'angle) ; pas la sortie (son cube EXIT est visible).
    # Un bloc par case, en retrait seulement du côté d'un sol (face avant des panneaux) : entre eux, les blocs restent
    # jointifs (des rectangles fusionnés puis rétrécis laissaient un interstice aux angles).
    # profondeur du panneau (sa boîte, mise à l'échelle) + 2 cm : à 10 cm, le fond masquait ses parties en retrait
    _b = unreal.load_asset(MODULES['mur']).get_bounding_box()
    RETRAIT = (_b.max.y - _b.min.y) + 2.0
    ouvert = lambda x, y: sol(case(x, y)) or porte(case(x, y))
    for y in range(H):
        for x in range(W):
            if ouvert(x, y) or ROWS[y][x] == 'E' or \
                    not any(ouvert(x + dx, y + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
                continue
            x0 = x * CASE + (RETRAIT if ouvert(x - 1, y) else 0)
            x1 = (x + 1) * CASE - (RETRAIT if ouvert(x + 1, y) else 0)
            y0 = y * CASE + (RETRAIT if ouvert(x, y - 1) else 0)
            y1 = (y + 1) * CASE - (RETRAIT if ouvert(x, y + 1) else 0)
            centre, echelle = ((x0 + x1) / 2, (y0 + y1) / 2, HAUT / 2), ((x1 - x0) / 100, (y1 - y0) / 100, HAUT / 100)
            if ROWS[y][x] in INDIVIDUELS:
                # mur qui s'ouvre : son fond est un acteur « Paroi_x_y_fond », attaché au passage avec ses panneaux
                # (plus bas), pour s'enfoncer avec lui ; sans fond, une fente voisine montrait la pièce secrète
                f = bloc(f'Paroi_{x}_{y}_fond', 'Parois', centre, echelle, noir())
                f.static_mesh_component.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
                f.static_mesh_component.set_editor_property('can_ever_affect_navigation', False)
            else:
                inst('Fond', CUBE, centre, echelle, materiaux=[noir()])
    individuels = {a.get_actor_label(): a for a in EAS.get_all_level_actors() if a.get_actor_label().startswith('Mur_')}
    for x, y, c in MURS_VUS:
        if c == 'E':
            continue
        if c in INDIVIDUELS and f'Mur_{x}_{y}' in individuels:
            individuels[f'Mur_{x}_{y}'].static_mesh_component.set_visibility(False)
        for (dx, dy), yaw in YAW.items():
            # face qui donne sur un sol OU sur une porte : le cube étant invisible, une face sans panneau
            # laisse voir à travers le mur (constaté à côté des portes le 21/10)
            if sol(case(x + dx, y + dy)) or porte(case(x + dx, y + dy)):
                # milieu de la frontière entre le mur et la case de sol, au ras du sol
                fx, fy = (x + .5 + dx * .5) * CASE, (y + .5 + dy * .5) * CASE
                module('mur', f'Paroi_{x}_{y}_{dx}{dy}' if c in INDIVIDUELS else None, 'Parois', yaw, (.5, 1, 0), (fx, fy, 0), (CASE, None, HAUT))
    for y in range(H):
        for x in range(W):
            if sol(ROWS[y][x]) or porte(ROWS[y][x]):
                cx, cy = (x + .5) * CASE, (y + .5) * CASE
                if ROWS[y][x] != '~':                       # la lave a sa propre dalle (plus bas)
                    module('sol', None, 'Dalles', 0, (.5, .5, 1), (cx, cy, 0), (CASE, CASE, None))
                module('plafond', None, 'Caissons', 0, (.5, .5, 0), (cx, cy, HAUT - 50), (CASE, CASE, None))
else:
    # murs texturés visibles (extérieur, ou sans habillage) : un cube par case, en instances (texture répétée par case)
    for x, y, c in MURS_VUS:
        if c not in INDIVIDUELS:
            inst('Murs', CUBE, ((x + .5) * CASE, (y + .5) * CASE, HMUR / 2), (CASE / 100, CASE / 100, HMUR / 100),
                 materiaux=[MI.get(c, MI['#'])], collision=True)

# portes : BP_DoorFrame du modèle (400 × 100 × 400 cm par défaut = une case), sans cadre (les murs voisins en tiennent lieu).
# Son battant est le maillage SM_Door, créé par le script de construction : la texture de porte va donc sur le maillage
# lui-même (contenu LevelPrototyping copié dans ce projet, sans autre usage ici).
BPS = PC['blueprints']
BP_PORTE = unreal.load_asset(BPS['porte']).generated_class()
SM_PORTE = BPS['porte_maillage']
battant = unreal.load_asset(SM_PORTE)
if battant.get_material(0) != instance('porte') or battant.get_editor_property('has_navigation_data'):
    battant.set_material(0, instance('porte'))
    # le battant ne coupe pas la navigation : la porte s'ouvre au contact de tout acteur, monstres compris. Réglé sur le
    # maillage, car le réglage par composant se perd au rechargement de la carte (script de construction relancé).
    battant.set_editor_property('has_navigation_data', False)
    EAL.save_asset(SM_PORTE)
nportes = 0
BP_ACTION = unreal.load_asset(BPS['actionnable']).generated_class()
COULEURS_PORTE = {'R': (1, unreal.LinearColor(1, .1, .1, 1)), 'B': (2, unreal.LinearColor(.2, .4, 1, 1)),
                  'J': (3, unreal.LinearColor(1, .85, .1, 1))}
for y in range(H):
    for x in range(W):
        if ROWS[y][x] in COULEURS_PORTE:
            # porte verrouillée : un bloc de porte qui s'enfonce dans le sol quand le joueur arrive avec la clé
            # (BP_DoomActionnable Type 2, objet.dsl déverrouille) ; lumière de sa couleur des deux côtés pour la repérer
            num, teinte = COULEURS_PORTE[ROWS[y][x]]
            a = EAS.spawn_actor_from_class(BP_ACTION, unreal.Vector((x + .5) * CASE, (y + .5) * CASE, 0), unreal.Rotator(0, 0, 0))
            a.set_editor_property('Type', 2)
            a.set_editor_property('Couleur', num)
            a.set_editor_property('Portee', CASE * .5 + 250)          # depuis le centre de la case voisine (4 m) et un peu plus
            v = bloc(f'Verrou_{x}_{y}', 'Portes', ((x + .5) * CASE, (y + .5) * CASE, HAUT / 2), (CASE / 100, CASE / 100, HAUT / 100), instance('porte'))
            v.static_mesh_component.set_editor_property('can_ever_affect_navigation', False)   # les monstres attendent derrière
            v.root_component.set_mobility(unreal.ComponentMobility.MOVABLE)
            v.attach_to_actor(a, '', unreal.AttachmentRule.KEEP_WORLD, unreal.AttachmentRule.KEEP_WORLD, unreal.AttachmentRule.KEEP_WORLD, False)
            poser(a, f'PorteVerrouillee_{x}_{y}', 'Portes')
            l = EAS.spawn_actor_from_class(unreal.PointLight, unreal.Vector((x + .5) * CASE, (y + .5) * CASE, HAUT - 60), unreal.Rotator(0, 0, 0))
            l.point_light_component.set_light_color(teinte)
            l.point_light_component.set_intensity(LUMIERE['intensite'] * 1.5)
            l.point_light_component.set_attenuation_radius(CASE * 1.5)
            poser(l, f'Lampe_porte_{x}_{y}', 'Lumieres')
            nportes += 1
        elif porte(ROWS[y][x]):
            passage_x = sol(case(x - 1, y)) or sol(case(x + 1, y))     # on traverse selon X : la porte barre l'axe Y
            a = EAS.spawn_actor_from_class(BP_PORTE, unreal.Vector((x + .5) * CASE, (y + .5) * CASE, 0),
                                           unreal.Rotator(0, 0, 90 if passage_x else 0))
            a.set_editor_property('Door Frame', False)
            poser(a, f'Porte_{x}_{y}', 'Portes')      # set_editor_property relance le script de construction
            nportes += 1

# départ du joueur
for y in range(H):
    for x in range(W):
        if ROWS[y][x] == 'P':
            ps = EAS.spawn_actor_from_class(unreal.PlayerStart, unreal.Vector((x + .5) * CASE, (y + .5) * CASE, 100),
                                            unreal.Rotator(0, 0, N['angle'] * 57.2958))
            poser(ps, 'Depart', 'Joueur')
            # Arena Shooter fait renaître le joueur sur un PlayerStart marqué de son équipe (BP_ShooterPlayerController,
            # OnDestroyed_Event) : sans ces marques, la liste est vide et la réapparition échoue
            ps.tags = [TAG, 'BLUE', 'RED']

# éclairage : plafonniers réguliers sur les cases de sol (une lampe tous les 3 × 3 cases), ambiance sombre
# … plus une lampe sur la case de sol devant chaque interrupteur de sortie, qui doit se voir
LAMPES_SORTIE = {(x + dx, y + dy) for y in range(H) for x in range(W) if ROWS[y][x] == 'E'
                 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if sol(case(x + dx, y + dy))}
nl = 0
for x, y in LAMPES_SORTIE:
    l = EAS.spawn_actor_from_class(unreal.PointLight, unreal.Vector((x + .5) * CASE, (y + .5) * CASE, HAUT - 40), unreal.Rotator(0, 0, 0))
    l.point_light_component.set_intensity(LUMIERE['intensite'] / 2)
    l.point_light_component.set_attenuation_radius(LUMIERE['rayon'] / 2)
    poser(l, f'Lampe_sortie_{x}_{y}', 'Lumieres'); nl += 1
for y in range(1, H, LUMIERE['pas_cases']):
    for x in range(1, W, LUMIERE['pas_cases']):
        if sol(ROWS[y][x]) and (x, y) not in LAMPES_SORTIE and not EXT:          # dehors : le soleil, pas de plafonniers
            l = EAS.spawn_actor_from_class(unreal.PointLight, unreal.Vector((x + .5) * CASE, (y + .5) * CASE, HAUT - 40), unreal.Rotator(0, 0, 0))
            c = l.point_light_component
            c.set_intensity(LUMIERE['intensite'])
            c.set_attenuation_radius(LUMIERE['rayon'])
            c.set_light_color(unreal.LinearColor(1.0, .85, .7, 1))
            poser(l, f'Lampe_{x}_{y}', 'Lumieres'); nl += 1
pp = EAS.spawn_actor_from_class(unreal.PostProcessVolume, unreal.Vector(W * CASE / 2, H * CASE / 2, HAUT / 2), unreal.Rotator(0, 0, 0))
pp.set_editor_property('unbound', True)
s = pp.settings
ev = EXT['ev100'] if EXT else LUMIERE['ev100']
for k, v in {'auto_exposure_min_brightness': ev, 'auto_exposure_max_brightness': ev}.items():
    s.set_editor_property('override_' + k, True); s.set_editor_property(k, v)
pp.settings = s
poser(pp, 'Exposition', 'Lumieres')
# brouillard volumétrique léger : les lampes dessinent des halos dans l'air (dehors : brume orange du crépuscule)
fog = EAS.spawn_actor_from_class(unreal.ExponentialHeightFog, unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0))
fc = fog.component
fc.set_editor_property('fog_density', EXT['brouillard']['densite'] if EXT else 0.008)
fc.set_editor_property('fog_inscattering_luminance', unreal.LinearColor(*EXT['brouillard']['couleur'], 1) if EXT
                       else unreal.LinearColor(0.002, 0.0015, 0.001, 1))
fc.set_volumetric_fog(True)
fc.set_volumetric_fog_extinction_scale(1.5)
fc.set_volumetric_fog_scattering_distribution(0.6)
poser(fog, 'Brouillard', 'Lumieres')
# extérieur : soleil rasant, atmosphère (rouge-orangé), lumière du ciel, nuages
if EXT:
    so = EXT['soleil']
    sun = EAS.spawn_actor_from_class(unreal.DirectionalLight, unreal.Vector(W * CASE / 2, H * CASE / 2, 2000),
                                     unreal.Rotator(0, so['tangage'], so['cap']))
    lc = sun.light_component
    lc.set_intensity(so['intensite'])
    lc.set_light_color(unreal.LinearColor(*so['couleur'], 1))
    lc.set_editor_property('atmosphere_sun_light', True)
    lc.set_editor_property('forward_shading_priority', 1)          # le soleil passe avant la lumière d'appoint
    poser(sun, 'Soleil', 'Lumieres')
    # lumière d'appoint sans ombres, à l'opposé du soleil : sans elle, les zones à l'ombre sont d'un noir total
    ap = EXT['appoint']
    fill = EAS.spawn_actor_from_class(unreal.DirectionalLight, unreal.Vector(W * CASE / 2, H * CASE / 2, 2000),
                                      unreal.Rotator(0, ap['tangage'], ap['cap']))
    fc_ = fill.light_component
    fc_.set_intensity(ap['intensite']); fc_.set_cast_shadows(False)
    fc_.set_light_color(unreal.LinearColor(*ap['couleur'], 1))
    fc_.set_editor_property('forward_shading_priority', 0)
    poser(fill, 'Ambiance', 'Lumieres')
    atm = EAS.spawn_actor_from_class(unreal.SkyAtmosphere, unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0))
    atm.get_component_by_class(unreal.SkyAtmosphereComponent).set_editor_property(
        'rayleigh_scattering', unreal.LinearColor(*EXT['ciel']['rayleigh'], 1))
    poser(atm, 'Ciel', 'Lumieres')
    sl = EAS.spawn_actor_from_class(unreal.SkyLight, unreal.Vector(W * CASE / 2, H * CASE / 2, 1000), unreal.Rotator(0, 0, 0))
    sl.light_component.set_editor_property('real_time_capture', True)
    sl.light_component.set_intensity(EXT.get('lumiere_ciel', 1.0))
    poser(sl, 'LumiereCiel', 'Lumieres')
    if EXT['ciel'].get('nuages'):
        poser(EAS.spawn_actor_from_class(unreal.VolumetricCloud, unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0)), 'Nuages', 'Lumieres')

# ---------- monstres (BP_DoomMonstre, réglé d'après ENEMY_DEF du jeu HTML) ----------
# Échelles : 1 pixel de sprite ≈ 1 unité Doom = 3,2 cm (joueur Doom 56 unités = 180 cm) ; vitesses ramenées à celle du
# joueur Arena Shooter (600 cm/s pour 3,2 cases/s dans le jeu HTML) ; distances en cases × CASE.
# Arena Shooter : joueur à 500 PV (100 dans DOOMED), balle de 25 (pistolet DOOMED 10–15) → PV des monstres × 2, dégâts × 5.
PLANCHES = json.load(open(IMPORT + r'\planches\planches.json', encoding='utf-8'))
CM_PX = PLANCHES['cm_par_pixel']
CV = PC['conversion']
PV_X, DEGATS_X, VITESSE_X = CV['pv'], CV['degats'], CV['vitesse_cm_s_par_case_s']
HD_X = CV['hd']   # les images de sprites et d'objets sont agrandies (agrandir.py) ; les tailles restent en pixels Freedoom
TAILLE = {k: v for k, v in PC['tailles_monstres'].items() if not k.startswith('_')}          # rayon, hauteur Doom
COULEUR = PC['couleurs_projectile']
BP_MONSTRE = unreal.load_asset(BPS['monstre']).generated_class()
SPECIAUX = {'aucun': 0, 'explose': 1, 'regenere': 2, 'rafale': 3}


def composant(acteur, nom):
    return next(c for c in acteur.get_components_by_class(unreal.SceneComponent) if c.get_name() == nom)


def habiller(acteur, cle, haut_cm, vol_cm=0.0, materiau=None):
    """Sprite à la taille de sa case de planche, pied posé à haut_cm sous le centre de l'acteur (+ vol)."""
    m = PLANCHES[cle]
    cw, ch = m['case']
    spr = composant(acteur, 'Sprite')
    spr.set_material(0, materiau or unreal.load_asset(f'{RACINE}/Sprites/MI_Sprite_{cle}'))
    spr.set_editor_property('relative_scale3d', unreal.Vector(cw * CM_PX / 100, ch * CM_PX / 100, 1))
    spr.set_relative_location(unreal.Vector(0, 0, -haut_cm - ch * CM_PX / 2 + m['pied'] * CM_PX + vol_cm), False, False)


nmonstres = 0
for y in range(H):
    for x in range(W):
        t = D['legende']['ennemis'].get(ROWS[y][x])
        if not t:
            continue
        e, m = D['ennemis'][t], PLANCHES[t]
        r, h = (v * CM_PX for v in TAILLE[t])
        a = EAS.spawn_actor_from_class(BP_MONSTRE, unreal.Vector((x + .5) * CASE, (y + .5) * CASE, h / 2 + 2), unreal.Rotator(0, 0, 0))
        a.capsule_component.set_capsule_size(r, h / 2)
        a.character_movement.set_editor_property('max_walk_speed', e['speed'] * VITESSE_X)
        habiller(a, t, h / 2, e.get('fly', 0) * CASE * .5)
        L = m['lignes']
        tir = e.get('ranged') or e.get('hitscan') or e.get('charge')
        reglages = {
            'PV': e['hp'] * PV_X, 'Vitesse': e['speed'] * VITESSE_X, 'Melee': e['melee'] * DEGATS_X, 'PorteeMelee': r + CV['portee_melee_marge_cm'],
            'DistReveil': CV['reveil_cases'] * CASE, 'Hauteur': h, 'DureeAttaque': tir.get('time', .6) if tir else .6,
            'NbLignes': m['nb_lignes'], 'LigneMarche': L['marche'][0], 'NbMarche': L['marche'][1],
            'LigneAttaque': L['attaque'][0], 'NbAttaque': L['attaque'][1], 'LigneDouleur': L['douleur'][0],
            'LigneMort': L['mort'][0], 'NbMort': L['mort'][1],
            'TirType': 1 if e.get('ranged') else 2 if e.get('hitscan') else 3 if e.get('charge') else 0,
            'RechargeMin': tir['cool'][0] if tir else 1.0, 'RechargeMax': tir['cool'][1] if tir else 1.0,
            'TirMin': tir['min'] * CASE if tir else 0, 'TirMax': tir['max'] * CASE if tir else 0,
            'Projectile': COULEUR.get(e.get('ranged', {}).get('color'), 0),
            'TirVitesse': tir.get('speed', 0) * VITESSE_X if tir else 0,
        }
        d = (tir or {}).get('dmg', 0)
        dmin, dmax = (d if isinstance(d, list) else [d, d])
        reglages['TirDegatsMin'], reglages['TirDegatsMax'] = dmin * DEGATS_X, dmax * DEGATS_X
        # comportement spécial (fiche monstre) : explose à la mort (dégâts), régénération (PV/s), tir en rafale
        sp = SPECIAUX.get(e.get('special', 'aucun'), 0)
        reglages['Special'] = sp
        reglages['Puissance'] = e.get('puissance', 0) * (DEGATS_X if sp == 1 else PV_X if sp == 2 else 1)
        for k, v in reglages.items():
            a.set_editor_property(k, v)
        poser(a, f'{t}_{x}_{y}', 'Monstres'); nmonstres += 1

# ---------- objets ----------
# trousse / bonus : BP_DoomObjet ; armes : ramassage d'Arena Shooter (pistolet, fusil, lance-grenades)
BP_OBJET = unreal.load_asset(BPS['objet']).generated_class()
# PV (types 0 et 2) mis à l'échelle d'Arena Shooter ; clé (3 : couleur), berserk (4), invisibilité (5 : secondes) tels quels
OBJETS = {k: (v[0], v[1] * DEGATS_X if v[0] in (0, 2) else v[1]) for k, v in PC['objets'].items() if not k.startswith('_')}
ARMES = PC['armes']
BP_ARME = unreal.load_asset(BPS['arme']).generated_class()
DT_ARMES = unreal.load_asset(BPS['liste_armes'])


def arme(nom, x, y):
    a = EAS.spawn_actor_from_class(BP_ARME, unreal.Vector((x + .5) * CASE, (y + .5) * CASE, 60), unreal.Rotator(0, 0, 0))
    a.set_editor_property('Weapon Type', unreal.DataTableRowHandle(data_table=DT_ARMES, row_name=nom))
    return poser(a, f'{nom}_{x}_{y}', 'Objets')


nobjets, absents = 0, set()
for y in range(H):
    for x in range(W):
        c = ROWS[y][x]
        if c == 'P':
            # DOOMED commence avec le pistolet ; Arena Shooter, les mains vides. Le pistolet va sur la case de sol devant
            # le départ : posé sous le joueur, il ne serait jamais ramassé (on n'« entre » pas dans un objet où l'on apparaît)
            ang = N['angle']
            devant = [(round(math.cos(ang)), round(math.sin(ang)))] + [(1, 0), (0, 1), (-1, 0), (0, -1)]
            dx, dy = next(d for d in devant if sol(case(x + d[0], y + d[1])) and ROWS[y + d[1]][x + d[0]] == '.')
            arme(PC['arme_depart'], x + dx, y + dy)
            continue
        o = D['legende']['objets'].get(c)
        if not o:
            continue
        if o in ARMES:
            arme(ARMES[o], x, y); nobjets += 1
        elif o in OBJETS:
            a = EAS.spawn_actor_from_class(BP_OBJET, unreal.Vector((x + .5) * CASE, (y + .5) * CASE, 60), unreal.Rotator(0, 0, 0))
            a.set_editor_property('Type', OBJETS[o][0]); a.set_editor_property('Valeur', OBJETS[o][1])
            tex = unreal.load_asset(f'{RACINE}/Sprites/T_obj_{o}')
            w_, h_ = tex.blueprint_get_size_x() / HD_X, tex.blueprint_get_size_y() / HD_X     # taille en pixels Freedoom
            spr = composant(a, 'Sprite')
            spr.set_material(0, unreal.load_asset(f'{RACINE}/Sprites/MI_Obj_{o}'))
            spr.set_editor_property('relative_scale3d', unreal.Vector(w_ * CM_PX / 100, h_ * CM_PX / 100, 1))
            spr.set_relative_location(unreal.Vector(0, 0, -60 + h_ * CM_PX / 2), False, False)
            poser(a, f'{o}_{x}_{y}', 'Objets'); nobjets += 1
        else:
            absents.add(o)                   # clés, berserk, invisibilité : pas encore
if absents:
    print('objets non posés (pas encore gérés) :', ', '.join(sorted(absents)))

# ---------- lave (~) : dalle lumineuse au ras du sol, lueur orange, et brûlure (BP_DoomActionnable Type 4) ----------
LAVE = PC.get('lave', {})
nlave = 0
if LAVE:
    mi_lave = instance('lave', emissif=LAVE.get('emissif', 1.6))
    for y in range(H):
        for x in range(W):
            if ROWS[y][x] != '~':
                continue
            cx, cy = (x + .5) * CASE, (y + .5) * CASE
            inst('Lave', CUBE, (cx, cy, -3), (CASE / 100, CASE / 100, .08), materiaux=[mi_lave])     # dessus à +1 cm
            a = EAS.spawn_actor_from_class(BP_ACTION, unreal.Vector(cx, cy, 0), unreal.Rotator(0, 0, 0))
            a.set_editor_property('Type', 4)
            a.set_editor_property('Portee', CASE / 2)
            a.set_editor_property('Degats', LAVE['degats_par_s'] * DEGATS_X)
            poser(a, f'LaveBrule_{x}_{y}', 'Lave')
            if (x + 2 * y) % 3 == 0:                                       # lueur : une case sur trois
                l = EAS.spawn_actor_from_class(unreal.PointLight, unreal.Vector(cx, cy, 80), unreal.Rotator(0, 0, 0))
                l.point_light_component.set_light_color(unreal.LinearColor(1, .35, .05, 1))
                l.point_light_component.set_intensity(LUMIERE['intensite'] * .6)
                l.point_light_component.set_attenuation_radius(CASE * 1.6)
                l.point_light_component.set_cast_shadows(False)
                poser(l, f'Lueur_lave_{x}_{y}', 'Lave')
            nlave += 1
    if nlave:
        print(f'{nlave} case(s) de lave')

# ---------- décor : objet du pack (visuel seul) + boîte de collision invisible qui arrête joueur, balles et monstres ----------
ndecor = 0
for y in range(H):
    for x in range(W):
        spec = DECOR.get(ROWS[y][x])
        if not spec:
            continue
        m = unreal.load_asset(spec['maillage'])
        b = m.get_bounding_box()
        dim = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z]
        fl, fp, h = spec['taille']                     # largeur et profondeur (fractions de case), hauteur (cm)
        if spec.get('etirer'):
            # cloison, rambarde : dans le sens des murs ou des voisins pareils, sur toute la case
            bloque = lambda c: c in '#%$E!' or c == ROWS[y][x]
            sens_x = bloque(case(x - 1, y)) or bloque(case(x + 1, y)) or not (bloque(case(x, y - 1)) or bloque(case(x, y + 1)))
            long_x = dim[0] >= dim[1]
            yaw = 0 if long_x == sens_x else 90
            s = [CASE / max(dim[0], dim[1])] * 2 + [1.0]
            s = [s[0], 1.0, 1.0] if long_x else [1.0, s[1], 1.0]
            boite = (CASE, fp * CASE, h) if sens_x else (fp * CASE, CASE, h)
        else:
            yaw = 90 * ((x * 7 + y * 3) % 2)               # un peu de variété, toujours dans l'axe des murs
            if spec.get('echelle'):                       # taille imposée sans déformer (arbre, rocher)
                s = [spec['echelle']] * 3
                yaw = (x * 37 + y * 61) % 360                # orientation variée : rien à aligner sur les murs
            elif spec.get('ajuste'):
                s = [fl * CASE / dim[0], fp * CASE / dim[1], h / dim[2]]
            else:
                k = min(1.0, .9 * CASE / max(dim[0], dim[1]))
                s = [k, k, k]
            boite = (fl * CASE, fp * CASE, h) if yaw == 0 else (fp * CASE, fl * CASE, h)
        cx, cy = (x + .5) * CASE, (y + .5) * CASE
        # centre du maillage tourné, ramené au centre de la case, posé sur le sol
        ox, oy = s[0] * (b.min.x + b.max.x) / 2, s[1] * (b.min.y + b.max.y) / 2
        t = math.radians(yaw)
        ox, oy = ox * math.cos(t) - oy * math.sin(t), ox * math.sin(t) + oy * math.cos(t)
        # textures du niveau (rocher, arbre calciné) au lieu des siennes
        mats = [instance(spec['materiau'])] * len(m.get_editor_property('static_materials')) if spec.get('materiau') else None
        inst('Decor', m, (cx - ox, cy - oy, -b.min.z * s[2]), s, yaw, mats)
        inst('DecorBlocs', CUBE, (cx, cy, boite[2] / 2), (boite[0] / 100, boite[1] / 100, boite[2] / 100),
             materiaux=[MI['#']], collision=True, visible=False)
        ndecor += 1
if ndecor:
    print(f'{ndecor} objet(s) de décor')

# ---------- touche E : passages secrets ($) et interrupteurs de sortie (E), comme useAction() du jeu HTML ----------
# Passage secret : un BP_DoomActionnable (Type 0) au centre de la case ; le cube de collision et les panneaux du mur
# lui sont attachés (rendus mobiles) et s'enfoncent avec lui. Sortie : Type 1, mène à la carte suivante (Suivant).
BP_ACTION = unreal.load_asset(BPS['actionnable']).generated_class()
suivant = {'name': globals()['SUIVANT']} if globals().get('SUIVANT') else D['niveaux'][(NIVEAU + 1) % len(D['niveaux'])]
SUIVANT = f'{RACINE}/Cartes/{nom_carte(suivant)}'          # SUIVANT=<nom affiché> : niveau suivant imposé (enchaîneur)
nsecrets = nsorties = 0
NSECRETS = sum(1 for y in range(H) for x in range(W) if ROWS[y][x] == '$'
               and any(sol(case(x + dx, y + dy)) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))))
# arrivée (Type 5) sur le départ : fondu depuis le noir, PV et armes rendus d'après la mémoire de partie
for y in range(H):
    for x in range(W):
        if ROWS[y][x] == 'P':
            a = EAS.spawn_actor_from_class(BP_ACTION, unreal.Vector((x + .5) * CASE, (y + .5) * CASE, 0), unreal.Rotator(0, 0, 0))
            a.set_editor_property('Type', 5)
            a.set_editor_property('Libelle', N['name'])            # affiché dans les emplacements de sauvegarde
            a.set_editor_property('Exterieur', bool(EXT))          # le saut n'existe qu'en extérieur
            poser(a, 'Arrivee', 'Joueur')
acteurs = {a.get_actor_label(): a for a in EAS.get_all_level_actors()}
for y in range(H):
    for x in range(W):
        c = ROWS[y][x]
        if c not in '$E!':
            continue
        if not any(sol(case(x + dx, y + dy)) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            continue
        a = EAS.spawn_actor_from_class(BP_ACTION, unreal.Vector((x + .5) * CASE, (y + .5) * CASE, 0), unreal.Rotator(0, 0, 0))
        a.set_editor_property('Type', {'$': 0, 'E': 1, '!': 3}[c])
        # mur d'embuscade (!) : s'ouvre seul quand le joueur passe à 2 cases et demie
        a.set_editor_property('Portee', CASE * 2.5 if c == '!' else CASE * .5 + 140)
        if c in '$!':
            for nom, enfant in acteurs.items():
                if nom == f'Mur_{x}_{y}' or nom.startswith(f'Paroi_{x}_{y}_'):
                    enfant.root_component.set_mobility(unreal.ComponentMobility.MOVABLE)
                    if c == '!' and nom.startswith('Mur_'):
                        # le maillage passe sous le mur d'embuscade : une fois ouvert, les monstres cachés sortent
                        enfant.static_mesh_component.set_editor_property('can_ever_affect_navigation', False)
                    enfant.attach_to_actor(a, '', unreal.AttachmentRule.KEEP_WORLD, unreal.AttachmentRule.KEEP_WORLD,
                                           unreal.AttachmentRule.KEEP_WORLD, False)
            poser(a, f'{"Secret" if c == "$" else "Embuscade"}_{x}_{y}', 'Secrets'); nsecrets += 1
        else:
            a.set_editor_property('Suivant', SUIVANT)
            a.set_editor_property('SecretsTotal', NSECRETS)        # pour le bilan de fin de niveau
            poser(a, f'Sortie_{x}_{y}', 'Joueur'); nsorties += 1
print(f'{nsecrets} passage(s) secret(s), {nsorties} interrupteur(s) de sortie -> {SUIVANT}')

# navigation des monstres : tout le niveau ; les portes ne coupent pas le maillage (elles s'ouvrent à l'approche)
for a in EAS.get_all_level_actors():
    if a.get_actor_label().startswith('Porte_'):
        for c in a.get_components_by_class(unreal.PrimitiveComponent):
            c.set_editor_property('can_ever_affect_navigation', False)
nav = EAS.spawn_actor_from_class(unreal.NavMeshBoundsVolume, unreal.Vector(W * CASE / 2, H * CASE / 2, HAUT / 2), unreal.Rotator(0, 0, 0))
nav.set_actor_scale3d(unreal.Vector(W * CASE / 200, H * CASE / 200, HAUT / 200 + .5))
poser(nav, 'Navigation', 'Joueur')
# maillage calculé dans l'éditeur et enregistré avec la carte (STATIC). En DYNAMIC, l'éditeur ne le calcule pas : le
# contrôle trouvait un maillage vide sur tous les niveaux de la nuit du 22/10 (construire.py attend la fin du calcul,
# ce qui évite l'alerte « NAVMESH NEEDS TO BE REBUILT »). Prix : un passage secret ouvert n'est pas praticable par les monstres.
for nm in unreal.GameplayStatics.get_all_actors_of_class(unreal.EditorLevelLibrary.get_editor_world(), unreal.RecastNavMesh):
    nm.set_editor_property('runtime_generation', unreal.RuntimeGenerationType.STATIC)
unreal.SystemLibrary.execute_console_command(unreal.EditorLevelLibrary.get_editor_world(), 'RebuildNavigation')

# mode de jeu Arena Shooter (personnage, armes, interface)
ws = unreal.EditorLevelLibrary.get_editor_world().get_world_settings()
gm = unreal.load_asset(BPS['mode_de_jeu'])
if gm:
    ws.set_editor_property('default_game_mode', gm.generated_class())

LES.save_current_level()
print(f'{N["name"]} -> {CHEMIN} : {nmurs} murs, {nportes} portes, {nl} lampes, {nmonstres} monstres, {nobjets} objets, {W}×{H} cases')
