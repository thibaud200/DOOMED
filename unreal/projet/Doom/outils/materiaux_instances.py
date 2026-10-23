"""Coche « Used with Instanced Static Meshes » sur les matériaux que les niveaux posent en instances (dans l'éditeur ouvert).

    python ue_py.py materiaux_instances.py

construire_niveau.py pose murs, panneaux, dalles, caissons, rochers, lave et décor en instances (ISM). Un matériau sans
ce drapeau s'affiche en gris dans l'éditeur le temps qu'il se recompile, et le jeu packagé le remplace par le matériau
par défaut (pans gris à côté des murs de terre, constaté le 22/10). Matériaux visés : M_DoomHD (textures du profil) et
ceux des maillages du profil (habillages, rochers, décor), en remontant au matériau parent.
"""
import json
import unreal

PROFIL = r'C:\workspace IA\Unreal\Doom\profil\jeu.json'
PC = json.load(open(PROFIL, encoding='utf-8'))['construction']

maillages = set()
for h in PC.get('habillages', {}).values():
    maillages.update(v for v in h.values() if isinstance(v, str) and v.startswith('/'))
maillages.update(PC.get('exterieur', {}).get('rochers', []))
maillages.update(v['maillage'] for k, v in PC.get('decor', {}).items() if not k.startswith('_'))
maillages.add('/Engine/BasicShapes/Cube')

materiaux = {unreal.load_asset('/Game/DOOMED/Materiaux/M_DoomHD')}
for chemin in sorted(maillages):
    m = unreal.load_asset(chemin)
    if not m:
        print('maillage introuvable :', chemin); continue
    for s in m.get_editor_property('static_materials'):
        mi = s.get_editor_property('material_interface')
        if mi:
            materiaux.add(mi.get_base_material())

faits = 0
for m in sorted((m for m in materiaux if m), key=lambda m: m.get_path_name()):
    if m.get_path_name().startswith('/Engine/'):
        continue                                         # matériaux du moteur : déjà prévus pour les instances
    if not m.get_editor_property('used_with_instanced_static_meshes'):
        m.set_editor_property('used_with_instanced_static_meshes', True)
        unreal.MaterialEditingLibrary.recompile_material(m)
        unreal.EditorAssetLibrary.save_loaded_asset(m, False)
        faits += 1
        print('coché :', m.get_path_name())
print(f'{len(materiaux)} matériau(x) vérifié(s), {faits} coché(s)')
