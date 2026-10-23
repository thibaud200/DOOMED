"""Importe les planches de sprites agrandies ×4 (DOOMED_import\\hd\\planches, voir agrandir.py) et crée le matériau qui en affiche une case.

    python ue_py.py creer_sprites.py

M_DoomSprite : matériau masqué, double face. Paramètres : Planche (texture), Col (0..7 = rotation 1..8),
Ligne (image Doom), NbLignes, NbCols (8). Une instance MI_Sprite_<type> par planche.
"""
import json
import unreal

IMPORT = r'C:\workspace IA\Unreal\DOOMED_import'
DOSSIER = '/Game/DOOMED/Sprites'
AT = unreal.AssetToolsHelpers.get_asset_tools()
EAL, MEL = unreal.EditorAssetLibrary, unreal.MaterialEditingLibrary
META = json.load(open(IMPORT + r'\planches\planches.json', encoding='utf-8'))


def importer(nom):
    dest = f'{DOSSIER}/T_{nom}'
    t = unreal.AssetImportTask()
    for k, v in {'filename': f'{IMPORT}\\hd\\planches\\{nom}.png', 'destination_path': DOSSIER, 'destination_name': f'T_{nom}',
                 'automated': True, 'replace_existing': True, 'save': False}.items():
        t.set_editor_property(k, v)
    AT.import_asset_tasks([t])
    tx = unreal.load_asset(dest)
    tx.set_editor_property('filter', unreal.TextureFilter.TF_BILINEAR)                # images agrandies ×4 (agrandir.py) : lissées
    tx.set_editor_property('mip_gen_settings', unreal.TextureMipGenSettings.TMGS_NO_MIPMAPS)   # pas de bavure entre cases
    tx.set_editor_property('compression_settings', unreal.TextureCompressionSettings.TC_EDITOR_ICON)
    tx.set_editor_property('never_stream', True)
    EAL.save_asset(dest)
    return tx


def scalaire(m, nom, val, x, y):
    e = MEL.create_material_expression(m, unreal.MaterialExpressionScalarParameter, x, y)
    e.set_editor_property('parameter_name', nom); e.set_editor_property('default_value', val)
    return e


def materiau(tex_defaut):
    dest = f'{DOSSIER}/M_DoomSprite'
    # jamais supprimer un matériau affiché (plantage du rendu le 21/10) : on vide et on refait son graphe sur place
    if EAL.does_asset_exist(dest):
        m = unreal.load_asset(dest)
        MEL.delete_all_material_expressions(m)
    else:
        m = AT.create_asset('M_DoomSprite', DOSSIER, unreal.Material, unreal.MaterialFactoryNew())
    m.set_editor_property('blend_mode', unreal.BlendMode.BLEND_MASKED)
    m.set_editor_property('two_sided', True)
    uv = MEL.create_material_expression(m, unreal.MaterialExpressionTextureCoordinate, -1200, 0)
    col, lig = scalaire(m, 'Col', 0, -1200, 150), scalaire(m, 'Ligne', 0, -1200, 250)
    nc, nl = scalaire(m, 'NbCols', 8, -1200, 350), scalaire(m, 'NbLignes', 1, -1200, 450)
    case = MEL.create_material_expression(m, unreal.MaterialExpressionAppendVector, -1000, 200)
    MEL.connect_material_expressions(col, '', case, 'A'); MEL.connect_material_expressions(lig, '', case, 'B')
    taille = MEL.create_material_expression(m, unreal.MaterialExpressionAppendVector, -1000, 400)
    MEL.connect_material_expressions(nc, '', taille, 'A'); MEL.connect_material_expressions(nl, '', taille, 'B')
    # plan BasicShapes/Plane tourné de 90° (roulis) : V est déjà dans le bon sens, U est retourné (vu sur capture)
    sens = MEL.create_material_expression(m, unreal.MaterialExpressionConstant2Vector, -1200, -150)
    sens.set_editor_property('r', -1.0); sens.set_editor_property('g', 1.0)
    dec = MEL.create_material_expression(m, unreal.MaterialExpressionConstant2Vector, -1200, -250)
    dec.set_editor_property('r', 1.0); dec.set_editor_property('g', 0.0)
    mul = MEL.create_material_expression(m, unreal.MaterialExpressionMultiply, -1050, -100)
    MEL.connect_material_expressions(uv, '', mul, 'A'); MEL.connect_material_expressions(sens, '', mul, 'B')
    flip = MEL.create_material_expression(m, unreal.MaterialExpressionAdd, -1000, 0)
    MEL.connect_material_expressions(mul, '', flip, 'A'); MEL.connect_material_expressions(dec, '', flip, 'B')
    plus = MEL.create_material_expression(m, unreal.MaterialExpressionAdd, -800, 100)
    MEL.connect_material_expressions(flip, '', plus, 'A'); MEL.connect_material_expressions(case, '', plus, 'B')
    div = MEL.create_material_expression(m, unreal.MaterialExpressionDivide, -650, 150)
    MEL.connect_material_expressions(plus, '', div, 'A'); MEL.connect_material_expressions(taille, '', div, 'B')
    tx = MEL.create_material_expression(m, unreal.MaterialExpressionTextureSampleParameter2D, -450, 100)
    tx.set_editor_property('parameter_name', 'Planche'); tx.set_editor_property('texture', tex_defaut)
    tx.set_editor_property('sampler_type', unreal.MaterialSamplerType.SAMPLERTYPE_COLOR)
    MEL.connect_material_expressions(div, '', tx, 'UVs')
    MEL.connect_material_property(tx, 'RGB', unreal.MaterialProperty.MP_BASE_COLOR)
    MEL.connect_material_property(tx, 'A', unreal.MaterialProperty.MP_OPACITY_MASK)
    ro = MEL.create_material_expression(m, unreal.MaterialExpressionConstant, -450, 350); ro.set_editor_property('r', 1.0)
    MEL.connect_material_property(ro, '', unreal.MaterialProperty.MP_ROUGHNESS)
    # un peu d'éclat propre : les sprites restent lisibles dans les coins sombres, comme dans Doom
    em = MEL.create_material_expression(m, unreal.MaterialExpressionMultiply, -250, 250)
    MEL.connect_material_expressions(tx, 'RGB', em, 'A'); MEL.connect_material_expressions(scalaire(m, 'Eclat', 0.08, -450, 450), '', em, 'B')
    MEL.connect_material_property(em, '', unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    MEL.recompile_material(m)
    EAL.save_asset(dest)
    return m


textures = {k: importer(k) for k, v in META.items() if isinstance(v, dict)}
mat = materiau(textures['imp'])
for k, tx in textures.items():
    dest = f'{DOSSIER}/MI_Sprite_{k}'
    mi = unreal.load_asset(dest) if EAL.does_asset_exist(dest) else \
        AT.create_asset(f'MI_Sprite_{k}', DOSSIER, unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
    MEL.set_material_instance_parent(mi, mat)
    MEL.set_material_instance_texture_parameter_value(mi, 'Planche', tx)
    MEL.set_material_instance_scalar_parameter_value(mi, 'NbLignes', META[k]['nb_lignes'])
    EAL.save_asset(dest)
print('planches importées :', ', '.join(textures))

# objets à ramasser : une seule image Freedoom (vue sans rotation), instance à 1 × 1 case
OBJETS = {'medkit': 'MEDI_A_0', 'ammo': 'SHEL_A_0', 'armor': 'ARM1_A_0', 'bullets': 'CLIP_A_0', 'rockets': 'ROCK_A_0',
          'berserk': 'PSTR_A_0', 'invis': 'PINS_A_0', 'mega': 'MEGA_A_0', 'backpack': 'BPAK_A_0',
          'keyRed': 'RKEY_A_0', 'keyBlue': 'BKEY_A_0', 'keyYellow': 'YKEY_A_0'}
for nom, img in OBJETS.items():
    t = unreal.AssetImportTask()
    for k, v in {'filename': f'{IMPORT}\\hd\\objets\\{nom}.png', 'destination_path': DOSSIER,
                 'destination_name': f'T_obj_{nom}', 'automated': True, 'replace_existing': True, 'save': False}.items():
        t.set_editor_property(k, v)
    AT.import_asset_tasks([t])
    tx = unreal.load_asset(f'{DOSSIER}/T_obj_{nom}')
    tx.set_editor_property('filter', unreal.TextureFilter.TF_BILINEAR)
    tx.set_editor_property('compression_settings', unreal.TextureCompressionSettings.TC_EDITOR_ICON)
    EAL.save_asset(f'{DOSSIER}/T_obj_{nom}')
    dest = f'{DOSSIER}/MI_Obj_{nom}'
    mi = unreal.load_asset(dest) if EAL.does_asset_exist(dest) else \
        AT.create_asset(f'MI_Obj_{nom}', DOSSIER, unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
    MEL.set_material_instance_parent(mi, mat)
    MEL.set_material_instance_texture_parameter_value(mi, 'Planche', tx)
    MEL.set_material_instance_scalar_parameter_value(mi, 'NbCols', 1)
    MEL.set_material_instance_scalar_parameter_value(mi, 'NbLignes', 1)
    EAL.save_asset(dest)
print('objets importés :', ', '.join(OBJETS))
