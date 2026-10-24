"""Crée (ou met à jour) les Blueprints de DOOMED : monstre, projectiles, objets à ramasser.

    python creer_acteurs.py            (l'éditeur doit être lancé en anglais : UnrealEditor.exe Doom.uproject -culture=en,
                                        sinon les identifiants de nœuds du DSL ne correspondent pas)

Deux voies : Python dans l'éditeur (ue_py : création des assets, composants, réglages par défaut) et serveur MCP
(bp : variables et logique écrite en DSL, dossier dsl\\). Les réglages propres à chaque monstre (planche, PV, attaques…)
sont posés sur chaque acteur par construire_niveau.py, d'après doomed.json.
"""
import sys
from pathlib import Path
import bp
from ue_py import executer

ICI = Path(__file__).parent
MON = '/Game/DOOMED/Monstres'
MONSTRE, PROJ, OBJET = f'{MON}/BP_DoomMonstre', f'{MON}/BP_DoomProjectile', f'{MON}/BP_DoomObjet'
BALLE = '/Game/DOOMED/Armes/BP_DoomBalle'
PROJECTILES = {'Feu': ('fireball', 2000), 'Bleu': ('fireballBlue', 1600), 'Vert': ('fireballGreen', 2400)}

PY_COMMUN = r'''
import unreal
B = unreal.BlueprintEditorLibrary
S = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem)
L = unreal.SubobjectDataBlueprintFunctionLibrary
EAL = unreal.EditorAssetLibrary
PLAN = unreal.load_asset('/Engine/BasicShapes/Plane')

def bp_(chemin, parent):
    return unreal.load_asset(chemin) if EAL.does_asset_exist(chemin) else B.create_blueprint_asset_with_parent(chemin, parent)

def comps(b):
    return {str(L.get_variable_name(L.get_data(h))): h for h in S.k2_gather_subobject_data_for_blueprint(b)}

def ajoute(b, classe, nom, parent):
    c = comps(b)
    if nom in c:
        return c[nom]
    h, err = S.add_new_subobject(unreal.AddNewSubobjectParams(parent_handle=parent, new_class=classe, blueprint_context=b))
    S.rename_subobject(h, unreal.Text(nom))
    return h

def objet(h):
    return L.get_associated_object(L.get_data(h))

def sprite(b, parent):
    piv = ajoute(b, unreal.SceneComponent, 'Pivot', parent)
    spr = ajoute(b, unreal.StaticMeshComponent, 'Sprite', piv)
    o = objet(spr)
    o.set_editor_property('static_mesh', PLAN)
    o.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
    o.set_editor_property('cast_shadow', False)
    o.set_editor_property('relative_rotation', unreal.Rotator(90, 0, 0))
    return o
'''

PY_MONSTRE = PY_COMMUN + r'''
b = bp_('%(MONSTRE)s', unreal.Character)
sprite(b, comps(b)['CapsuleComponent'])
cdo = unreal.get_default_object(b.generated_class())
cdo.set_editor_property('auto_possess_ai', unreal.AutoPossessAI.PLACED_IN_WORLD_OR_SPAWNED)
cdo.set_editor_property('use_controller_rotation_yaw', False)
mv = cdo.get_editor_property('character_movement')
mv.set_editor_property('orient_rotation_to_movement', True)
mv.set_editor_property('rotation_rate', unreal.Rotator(0, 0, 540))
B.compile_blueprint(b); EAL.save_asset('%(MONSTRE)s')
''' % globals()

PY_PROJ = PY_COMMUN + r'''
b = bp_('%(PROJ)s', unreal.Actor)
hs = S.k2_gather_subobject_data_for_blueprint(b)
c = comps(b)
if 'Boule' not in c:                     # la sphère devient la racine : c'est elle que le mouvement de projectile balaie
    h = ajoute(b, unreal.SphereComponent, 'Boule', hs[1])
    S.make_new_scene_root(hs[0], h, b)
c = comps(b)
boule = objet(c['Boule'])
boule.set_editor_property('sphere_radius', 20.0)
boule.set_collision_profile_name('BlockAllDynamic')
# les balles du joueur (canal « Projectile » d'Arena Shooter) traversent les boules de feu, comme dans Doom :
# sinon un tir qui croise une boule les annule toutes les deux
boule.set_collision_response_to_channel(unreal.CollisionChannel.ECC_PROJECTILE, unreal.CollisionResponseType.ECR_IGNORE)
sprite(b, c['Boule'])
mvt = ajoute(b, unreal.ProjectileMovementComponent, 'Mouvement', hs[0])
m = objet(mvt)
m.set_editor_property('projectile_gravity_scale', 0.0)
m.set_editor_property('initial_speed', 2000.0); m.set_editor_property('max_speed', 2400.0)
B.compile_blueprint(b); EAL.save_asset('%(PROJ)s')
print([str(k) for k in comps(b)])
''' % globals()


PY_OBJET = PY_COMMUN + r'''
b = bp_('%(OBJET)s', unreal.Actor)
hs = S.k2_gather_subobject_data_for_blueprint(b)
c = comps(b)
if 'Zone' not in c:                      # sphère de ramassage en racine
    h = ajoute(b, unreal.SphereComponent, 'Zone', hs[1])
    S.make_new_scene_root(hs[0], h, b)
c = comps(b)
z = objet(c['Zone'])
z.set_editor_property('sphere_radius', 60.0)
z.set_collision_profile_name('OverlapAllDynamic')
z.set_editor_property('generate_overlap_events', True)
sprite(b, c['Zone'])
B.compile_blueprint(b); EAL.save_asset('%(OBJET)s')
''' % globals()


# Balle du joueur : la balle d'Arena Shooter est une fléchette en mousse (30 m/s, gravité, rebonds). Ses composants
# appartiennent au parent commun avec la grenade (les modifier change aussi la grenade, vu le 21/10) : BP_DoomBalle est
# un enfant de leur balle, réglé à sa première image de vol (dsl/balle.dsl), et le pistolet et le fusil tirent celle-ci.
PY_BALLE = r'''
import unreal
EAL, MEL = unreal.EditorAssetLibrary, unreal.MaterialEditingLibrary
MAT = '/Game/DOOMED/Materiaux/M_Traceuse'
if not EAL.does_asset_exist(MAT):                 # traçant : jaune-orangé très lumineux, sans éclairage
    m = unreal.AssetToolsHelpers.get_asset_tools().create_asset('M_Traceuse', '/Game/DOOMED/Materiaux', unreal.Material, unreal.MaterialFactoryNew())
    m.set_editor_property('shading_model', unreal.MaterialShadingModel.MSM_UNLIT)
    c = MEL.create_material_expression(m, unreal.MaterialExpressionConstant3Vector, -400, 0)
    c.set_editor_property('constant', unreal.LinearColor(40.0, 18.0, 3.0, 1.0))
    MEL.connect_material_property(c, '', unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    MEL.recompile_material(m); EAL.save_asset(MAT)
b = unreal.load_asset('%(BALLE)s') if EAL.does_asset_exist('%(BALLE)s') else unreal.BlueprintEditorLibrary.create_blueprint_asset_with_parent(
    '%(BALLE)s', unreal.load_asset('/Game/Variant_Shooter/Blueprints/Pickups/Projectiles/BP_ShooterProjectile_Bullet').generated_class())
unreal.BlueprintEditorLibrary.compile_blueprint(b); EAL.save_asset('%(BALLE)s')
''' % globals()

PY_ARMES = r'''
import unreal
for a in ['Pistol', 'Rifle']:
    p = '/Game/Variant_Shooter/Blueprints/Pickups/Weapons/BP_ShooterWeapon_' + a
    w = unreal.get_default_object(unreal.load_asset(p).generated_class())
    w.set_editor_property('Bullet Class', unreal.load_asset('%(BALLE)s').generated_class())
    unreal.EditorAssetLibrary.save_asset(p)
    print(a, '->', w.get_editor_property('Bullet Class').get_name())
''' % globals()


ACTION = f'{MON}/BP_DoomActionnable'
PY_ACTION = r'''
import unreal
p = '%(ACTION)s'
b = unreal.load_asset(p) if unreal.EditorAssetLibrary.does_asset_exist(p) else \
    unreal.BlueprintEditorLibrary.create_blueprint_asset_with_parent(p, unreal.Actor)
unreal.BlueprintEditorLibrary.compile_blueprint(b); unreal.EditorAssetLibrary.save_asset(p)
''' % globals()


def relier_utiliser(chemin, action='IA_Utiliser', evenement='Utiliser', y=600):
    """Nœud d'entrée d'une action (« Started ») → événement personnalisé : le DSL ne sait pas déclarer l'événement d'entrée."""
    g = bp.ref(chemin, 'EventGraph')
    ev = bp.outil('find_nodes', {'graph': g, 'title': action})
    ev = ev[0] if ev else bp.outil('create_node', {'graph': g, 'type_id': f'Input|EnhancedActionEvents|{action}', 'pos': {'x': 0, 'y': y}})
    sortie = next(p for p in bp.outil('get_node_infos', {'nodes': [ev]})[0]['output_pins'] if p['name'] == 'Started')
    if sortie['connected_pins']:
        return
    appel = bp.outil('create_node', {'graph': g, 'type_id': f'CallFunction|{evenement}', 'pos': {'x': 400, 'y': y}})
    entree = next(p for p in bp.outil('get_node_infos', {'nodes': [appel]})[0]['input_pins'] if p['type_id'] == 'Exec')
    bp.outil('connect_pins', {'output_pin': sortie['pin_id'], 'input_pin': entree['pin_id']})
    bp.compiler(chemin)


def dsl_fichier(nom):
    return (ICI / 'dsl' / nom).read_text(encoding='utf-8')


def variables(chemin, spec):
    """Ajoute les variables manquantes, toutes réglables sur l'acteur posé (construire_niveau.py les remplit)."""
    deja = set(bp.variables(chemin))
    for type_, noms in spec.items():
        for n in noms:
            if n not in deja:
                bp.var(chemin, n, type_)
            bp.outil('set_variable_instance_editable', {'blueprint': bp.ref(chemin), 'variable_name': n, 'instance_editable': True})


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    # projectile d'abord : le monstre le fait apparaître par son chemin de classe
    assert executer(PY_PROJ) == 0
    variables(PROJ, {'float': ['T', 'Degats'], 'int': ['Couleur']})
    bp.dsl(PROJ, 'EventGraph', dsl_fichier('projectile.dsl'))
    assert executer(PY_MONSTRE) == 0
    variables(MONSTRE, {
        'float': ['PV', 'Vitesse', 'Melee', 'PorteeMelee', 'TirMin', 'TirMax', 'RechargeMin', 'RechargeMax', 'TirDegatsMin',
                  'TirDegatsMax', 'TirVitesse', 'Vol', 'DistReveil', 'T', 'Recharge', 'Repath', 'Hauteur', 'DureeAttaque', 'Dt',
                  'PVMax', 'Puissance', 'Aveugle', 'Coups'],
        'int': ['NbLignes', 'LigneMarche', 'NbMarche', 'LigneAttaque', 'NbAttaque', 'LigneDouleur', 'LigneMort', 'NbMort',
                'TirType', 'Etat', 'Mode', 'Projectile', 'Special'],
        'bool': ['Fait']})
    bp.evenement(MONSTRE, 'Frapper')
    bp.evenement(MONSTRE, 'Penser')
    bp.dsl(MONSTRE, 'EventGraph', dsl_fichier('monstre.dsl'))
    assert executer(PY_BALLE) == 0
    variables(BALLE, {'bool': ['Pret']})
    bp.dsl(BALLE, 'EventGraph', dsl_fichier('balle.dsl'))
    assert executer(PY_ARMES) == 0
    # passage secret et sortie (touche E, action IA_Utiliser créée par utiliser.py)
    assert executer((ICI / 'utiliser.py').read_text(encoding='utf-8')) == 0
    assert executer(PY_ACTION) == 0
    variables(ACTION, {'int': ['Type', 'Morts', 'Total', 'Couleur', 'SecretsTrouves', 'SecretsTotal'], 'bool': ['Ouvert', 'Deverrouille', 'Averti', 'Exterieur'], 'string': ['Libelle'],
                       'float': ['Descente', 'Portee', 'Degats'], 'name': ['Suivant']})
    bp.evenement(ACTION, 'Terminer')
    bp.evenement(ACTION, 'Utiliser')
    bp.evenement(ACTION, 'Pause')
    # musiques des niveaux (liste remplie par importer_musique.py), jouées par l'arrivée (type 5)
    if 'Musiques' not in set(bp.variables(ACTION)):
        bp.outil('add_object_variable', {'blueprint': bp.ref(ACTION), 'name': 'Musiques',
                                         'object_class': {'refPath': '/Script/Engine.SoundBase'}, 'container_type': 'ARRAY'})
    # messages (clés, secrets, bilan) : WBP_Message par la mémoire de partie, PrintString n'existant pas en Shipping
    bp.dsl(ACTION, 'EventGraph', bp.annonces(dsl_fichier('actionnable.dsl')) + bp.annonceur(ACTION))
    relier_utiliser(ACTION)
    relier_utiliser(ACTION, 'IA_Pause', 'Pause', 900)                # Échap ou P : menu pause (creer_menus.py)
    # objet après l'actionnable et le monstre : la clé et l'invisibilité écrivent dans leurs variables
    assert executer(PY_OBJET) == 0
    variables(OBJET, {'int': ['Type'], 'float': ['Valeur']})
    bp.dsl(OBJET, 'EventGraph', bp.annonces(dsl_fichier('objet.dsl')) + bp.annonceur(OBJET))
    print('Blueprints à jour :', PROJ, MONSTRE, OBJET, BALLE, ACTION)


if __name__ == '__main__':
    main()
