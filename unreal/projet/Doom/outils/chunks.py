"""Découpage du jeu packagé par nature de contenu (« chunks ») : étiquettes posées dans l'éditeur ouvert.

    python ue_py.py chunks.py           (à relancer après avoir ajouté des ressources : les listes sont refaites)

Un paquet par nature de contenu, pour qu'une modification ne change que le paquet concerné :
  0 base       tout ce qui n'est pas étiqueté : moteur, ses shaders globaux (chargés au démarrage, toujours ici),
               matériaux de base du moteur, configuration
  1 musique    /Game/DOOMED/Musique
  2 textures   textures Doom, planches des monstres, textures du pack sci-fi (une image retouchée → ce paquet seul)
  3 matériaux  matériaux DOOMED et du pack, avec leurs shaders (un rendu changé → ce paquet seul)
  4 modèles    maillages du pack (murs, mobilier, rochers, arbres)
  5 logique    Blueprints, écrans, entrées de /Game/DOOMED (gameplay)
  6 niveaux    /Game/DOOMED/Cartes
  7 Epic       modèle de projet Epic (personnage, armes, Arena Shooter) et ciel volumétrique du moteur : ne change
               qu'avec une mise à jour d'Unreal ou du modèle
Une texture ne touche pas aux shaders : ils viennent des matériaux, pas des images. Chaque paquet donne pakchunkN
(.pak .utoc .ucas) ; bGenerateChunks=True dans Config\\DefaultGame.ini, MaxIoStorePartitionSizeMB y garde chaque
fichier sous 90 Mo. Les étiquettes sont dans /Game/DOOMED/Chunks : le pack Fab n'est pas modifié.
"""
import json
import unreal

PROFIL = r'C:\workspace IA\Unreal\Doom\profil\jeu.json'
DOSSIER = '/Game/DOOMED/Chunks'
EAL = unreal.EditorAssetLibrary
AT = unreal.AssetToolsHelpers.get_asset_tools()
AR = unreal.AssetRegistryHelpers.get_asset_registry()
PACKS = ('/Game/StarterBundle/', '/Game/UndergroundSciFi/')
A_PART = ('/Game/DOOMED/Cartes', '/Game/DOOMED/Musique', DOSSIER)      # étiquettes de dossier / les étiquettes
EPIC = ('/Game/Characters/', '/Game/FirstPerson/', '/Game/LevelPrototyping/', '/Game/Variant_Shooter/', '/Game/Weapons/',
        '/Engine/EngineSky/')
SUIVIS = ('/Game/', '/Engine/EngineSky/')                              # où l'on suit les dépendances

TEXTURES = {'Texture2D', 'TextureCube', 'Texture2DArray', 'VolumeTexture', 'TextureRenderTarget2D'}
MATERIAUX = {'Material', 'MaterialInstanceConstant', 'MaterialFunction', 'MaterialParameterCollection',
             'MaterialFunctionMaterialLayer', 'MaterialFunctionMaterialLayerBlend'}
MODELES = {'StaticMesh', 'SkeletalMesh', 'PhysicsAsset', 'Skeleton', 'PhysicalMaterial'}


def etiquette(nom, chunk, explicites=(), dossier=None):
    """Étiquette nom → paquet chunk : liste d'objets, ou tout un dossier (l'étiquette est alors rangée dedans)."""
    lieu = dossier or DOSSIER
    chemin = f'{lieu}/{nom}'
    if EAL.does_asset_exist(chemin):
        e = unreal.load_asset(chemin)
    else:
        f = unreal.DataAssetFactory(); f.set_editor_property('data_asset_class', unreal.PrimaryAssetLabel)
        e = AT.create_asset(nom, lieu, unreal.PrimaryAssetLabel, f)
    r = e.get_editor_property('rules')
    # les champs des règles ne sont pas exposés à Python : on les écrit sous forme texte ; pas de récursion, chaque
    # ressource est rangée explicitement (sinon une texture suivrait le matériau qui l'utilise)
    assert r.import_text(f'(Priority=20,ChunkId={chunk},bApplyRecursively=False,CookRule=Unknown)')
    e.set_editor_property('rules', r)
    e.set_editor_property('label_assets_in_my_directory', bool(dossier))
    e.set_editor_property('explicit_assets', list(explicites))
    EAL.save_loaded_asset(e, False)
    print(f'{nom} → paquet {chunk} : ' + (f'dossier {dossier}' if dossier else f'{len(explicites)} ressource(s)'))


def dependances(paquets):
    """Paquets du projet (/Game, et le ciel du moteur) dont dépendent ces paquets, récursivement."""
    vus, pile = set(), list(paquets)
    opt = unreal.AssetRegistryDependencyOptions(include_soft_package_references=True, include_hard_package_references=True)
    while pile:
        p = pile.pop()
        if p in vus:
            continue
        vus.add(p)
        for d in AR.get_dependencies(p, opt) or []:
            d = str(d)
            if d.startswith(SUIVIS) and d not in vus:
                pile.append(d)
    return vus


# ressources concernées : tout ce qu'utilisent /Game/DOOMED et ses cartes (packs, modèle Epic, ciel), plus les maillages
# du profil ; on part des cartes elles-mêmes pour ne rien oublier (le garde-corps du décor était resté dans la base)
pc = json.load(open(PROFIL, encoding='utf-8'))['construction']
racines = {p.split('.')[0] for p in EAL.list_assets('/Game/DOOMED', recursive=True)}
# le ciel volumétrique n'est référencé par aucune carte (le composant de nuages du moteur le charge par défaut) : on
# l'ajoute d'office ; une étiquette ne fait pas cuire une ressource, seulement choisir son paquet si elle est cuite
racines |= {p.split('.')[0] for p in EAL.list_assets('/Engine/EngineSky', recursive=True)}
for h in pc.get('habillages', {}).values():
    racines.update(v for v in h.values() if isinstance(v, str) and v.startswith('/'))
racines.update(pc.get('exterieur', {}).get('rochers', []))
racines.update(v['maillage'] for k, v in pc.get('decor', {}).items() if not k.startswith('_'))
paquets = {p for p in dependances(racines) if p.startswith(('/Game/DOOMED/', '/Game/Input/') + PACKS + EPIC)}

lots = {2: [], 3: [], 4: [], 5: [], 7: []}
for p in sorted(paquets):
    if p.startswith(A_PART):
        continue
    for d in AR.get_assets_by_package_name(p) or []:
        classe = str(d.asset_class_path.asset_name)
        if p.startswith(EPIC):
            n = 7
        elif p.startswith('/Game/Input/'):
            n = 5                                          # touches du jeu (E, Échap, P ajoutées par nos scripts)
        elif classe in TEXTURES:
            n = 2
        elif classe in MATERIAUX:
            n = 3
        elif classe in MODELES or p.startswith(PACKS):
            n = 4                                          # le reste des packs suit leurs maillages
        else:
            n = 5                                          # Blueprints, écrans, entrées, données de DOOMED
        lots[n].append(d.get_asset())
        break

etiquette('PAL_Musique', 1, dossier='/Game/DOOMED/Musique')
etiquette('PAL_Textures', 2, lots[2])
etiquette('PAL_Materiaux', 3, lots[3])
etiquette('PAL_Modeles', 4, lots[4])
etiquette('PAL_Logique', 5, lots[5])
etiquette('PAL_Niveaux', 6, dossier='/Game/DOOMED/Cartes')
etiquette('PAL_Epic', 7, lots[7])
if EAL.does_asset_exist(f'{DOSSIER}/PAL_Essai'):
    EAL.delete_asset(f'{DOSSIER}/PAL_Essai')                # étiquette d'essai du 23/10
