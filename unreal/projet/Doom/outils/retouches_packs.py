"""Retouches faites aux packs Fab (dans l'éditeur ouvert) : à relancer après avoir ajouté les packs à un projet neuf.

    python ue_py.py retouches_packs.py

Les deux rochers du pack StarterBundle portent par défaut un matériau de glace (NatureMaterials_Ice) : jamais affiché
(les niveaux leur mettent la roche), mais il faisait embarquer 31 Mo de textures de glace dans le jeu (23/10). Leur
matériau par défaut devient MI_hd_roche. (Les autres retouches : materiaux_instances.py, utiliser.py, creer_acteurs.py.)
"""
import unreal

ROCHE = '/Game/DOOMED/Materiaux/MI_hd_roche'
ROCHERS = ['/Game/StarterBundle/UE4_Assets/Environment_A/Meshes/SM_Cave_Rock_Large_01a',
           '/Game/StarterBundle/UE4_Assets/Environment_A/Meshes/SM_Cave_Rock_Med_01a']

mi = unreal.load_asset(ROCHE)
assert mi, f'{ROCHE} introuvable'
for p in ROCHERS:
    m = unreal.load_asset(p)
    if not m:
        print('rocher introuvable (pack StarterBundle absent ?) :', p); continue
    for i in range(len(m.get_editor_property('static_materials'))):
        m.set_material(i, mi)
    unreal.EditorAssetLibrary.save_loaded_asset(m, False)
    print(p.rsplit('/', 1)[1], '->', mi.get_name())
