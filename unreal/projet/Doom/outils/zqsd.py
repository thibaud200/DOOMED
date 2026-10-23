"""Ajoute ZQSD (clavier AZERTY) aux déplacements d'Arena Shooter, sans retirer WASD ni les flèches.

    python ue_py.py zqsd.py

Z reprend la correspondance de W (avancer), Q celle de A (pas de côté gauche), modificateurs compris.
S et D sont déjà à la même place sur les deux claviers. Relancer ne crée pas de doublon.
"""
import unreal

IMC = '/Game/Input/IMC_Default'
imc = unreal.load_asset(IMC)
liste = imc.get_editor_property('default_key_mappings').get_editor_property('mappings')
noms = lambda: [str(m.key.get_editor_property('key_name')) for m in imc.get_editor_property('default_key_mappings').get_editor_property('mappings')]
for nouvelle, modele in (('Z', 'W'), ('Q', 'A')):
    if nouvelle not in noms():
        m = next(x for x in liste if str(x.key.get_editor_property('key_name')) == modele)
        cle = unreal.Key(); cle.set_editor_property('key_name', nouvelle)
        imc.map_key(m.action, cle)
# map_key renvoie une copie : les modificateurs se posent dans le tableau, recopiés (nouveaux objets) depuis le modèle
dkm = imc.get_editor_property('default_key_mappings')
tab = list(dkm.get_editor_property('mappings'))
par_nom = {str(x.key.get_editor_property('key_name')): x for x in tab}
for nouvelle, modele in (('Z', 'W'), ('Q', 'A')):
    mods = []
    for mo in par_nom[modele].get_editor_property('modifiers'):
        copie = unreal.new_object(type(mo), imc)
        if isinstance(mo, unreal.InputModifierSwizzleAxis):
            copie.set_editor_property('order', mo.get_editor_property('order'))
        mods.append(copie)
    par_nom[nouvelle].set_editor_property('modifiers', mods)
dkm.set_editor_property('mappings', tab)
imc.set_editor_property('default_key_mappings', dkm)
unreal.EditorAssetLibrary.save_asset(IMC)
for x in imc.get_editor_property('default_key_mappings').get_editor_property('mappings'):
    if str(x.action.get_name()) == 'IA_Move':
        print(x.key.get_editor_property('key_name'), [type(mo).__name__ + (str(mo.get_editor_property('order')) if hasattr(mo, 'order') else '') for mo in x.get_editor_property('modifiers')])
