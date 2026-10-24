"""Musiques de Freedoom dans Unreal (dans l'éditeur ouvert) : importe les WAV et les range dans l'ordre des niveaux.

    node ..\\..\\Doom_dev\\outils\\musique_wav.js DOOMED_import\\musique 32000      (calcule les WAV, voir CREDITS)
    python ue_py.py importer_musique.py

Chaque WAV (D_RUNNIN.wav…) devient un son /Game/DOOMED/Musique/D_RUNNIN, qui boucle, compressé en qualité moyenne
(le jeu packagé reste léger). La liste ordonnée des morceaux de niveau est donnée au Blueprint de l'arrivée
(BP_DoomActionnable, variable Musiques) et le morceau de titre au menu (BP_DoomMenuDemarrage, variable Musique) :
creer_acteurs.py / creer_menus.py les jouent. Le niveau E<n> joue le morceau n° n (en boucle sur la liste).
"""
import json
from pathlib import Path
import unreal

SOURCE = Path(r'C:\workspace IA\Unreal\DOOMED_import\musique')
DEST = '/Game/DOOMED/Musique'
ORDRE = Path(r'C:\workspace IA\Unreal\DOOMED_import\musique\ordre.json')     # écrit par ce script
QUALITE = 10                    # compression Bink (1–100) : la musique FM supporte bien une qualité basse
A_PART = {'D_DM2TTL', 'D_DM2INT', 'D_READ_M'}
EAL = unreal.EditorAssetLibrary

# ordre des morceaux de niveau : celui de freedoom2.wad (= js/01d_musiques_freedoom.js), noté dans ordre.json
fd = Path(r'C:\workspace IA\Doom_dev\js\01d_musiques_freedoom.js')
if fd.exists():
    t = fd.read_text(encoding='utf-8')
    donnees = json.loads(t[t.index('{'):t.rindex('}') + 1])
    noms = [p['nom'] for p in donnees['pistes']]
    ORDRE.write_text(json.dumps(noms), encoding='utf-8')
noms = json.loads(ORDRE.read_text(encoding='utf-8'))

taches = []
for wav in sorted(SOURCE.glob('D_*.wav')):            # toujours réimporté : les WAV peuvent avoir été recalculés
    t = unreal.AssetImportTask()
    t.set_editor_property('filename', str(wav)); t.set_editor_property('destination_path', DEST)
    t.set_editor_property('automated', True); t.set_editor_property('save', False); t.set_editor_property('replace_existing', True)
    taches.append(t)
if taches:
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks(taches)

sons = {}
for wav in sorted(SOURCE.glob('D_*.wav')):
    s = unreal.load_asset(f'{DEST}/{wav.stem}')
    assert s, f'import raté : {wav.name}'
    s.set_editor_property('looping', True)
    # Bink Audio : le format par défaut du projet (ADPCM, ~124 kbit/s) faisait peser la musique 91 Mo dans le jeu
    s.set_editor_property('sound_asset_compression_type', unreal.SoundAssetCompressionType.BINK_AUDIO)
    s.set_editor_property('compression_quality', QUALITE)
    EAL.save_loaded_asset(s, False)
    sons[wav.stem] = s
print(f'{len(sons)} musiques dans {DEST} (boucle, qualité {QUALITE})')


def regler(chemin_bp, nom, valeur):
    bp = unreal.load_asset(chemin_bp)
    cdo = unreal.get_default_object(bp.generated_class())
    cdo.set_editor_property(nom, valeur)
    EAL.save_loaded_asset(bp, False)


regler('/Game/DOOMED/Monstres/BP_DoomActionnable', 'Musiques', [sons[n] for n in noms if n in sons])
regler('/Game/DOOMED/UI/BP_DoomMenuDemarrage', 'Musique', sons['D_DM2TTL'])
print('morceaux de niveau :', len(noms), '· titre : D_DM2TTL')
