"""Action « Utiliser » (touche E, comme dans le jeu HTML) : passage secret, interrupteur de sortie.

    python ue_py.py utiliser.py        (relancer ne crée pas de doublon)

Crée /Game/DOOMED/Entrees/IA_Utiliser (action booléenne) et l'ajoute à IMC_Default sur E. Les Blueprints qui y réagissent
(BP_DoomActivable) activent l'entrée au début de la partie et reçoivent l'événement « IA_Utiliser ».
"""
import unreal

IA = '/Game/DOOMED/Entrees/IA_Utiliser'
IMC = '/Game/Input/IMC_Default'
EAL = unreal.EditorAssetLibrary

ia = unreal.load_asset(IA)
if not ia:
    ia = unreal.AssetToolsHelpers.get_asset_tools().create_asset('IA_Utiliser', '/Game/DOOMED/Entrees', unreal.InputAction, unreal.InputAction_Factory())
    ia.set_editor_property('value_type', unreal.InputActionValueType.BOOLEAN)
    EAL.save_asset(IA)
imc = unreal.load_asset(IMC)
deja = [(m.action, str(m.key.get_editor_property('key_name'))) for m in imc.get_editor_property('default_key_mappings').get_editor_property('mappings')]
if (ia, 'E') not in deja:
    cle = unreal.Key(); cle.set_editor_property('key_name', 'E')
    imc.map_key(ia, cle)
# toujours enregistrer : une touche ajoutée en mémoire mais jamais enregistrée s'est perdue (E absent du jeu, 23/10)
EAL.save_asset(IMC, only_if_is_dirty=False)
print('IA_Utiliser sur E :', [k for a, k in [(m.action, str(m.key.get_editor_property('key_name'))) for m in imc.get_editor_property('default_key_mappings').get_editor_property('mappings')] if a == ia])
