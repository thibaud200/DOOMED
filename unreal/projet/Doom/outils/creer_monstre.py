"""Nouveau monstre d'après une fiche du modèle (methode\\schemas\\monstre.schema.json), côté images — sans Unreal.

    python creer_monstre.py <fiche.json>

Phase « LM Studio + ComfyUI » (instance « thibaud ») :
  1. 5 poses dessinées par ComfyUI (comfy_doomed.generer_monstre_images, chaîne du jeu HTML) → DOOMED_import\\textures ;
  2. planche 8 angles (planches_sprites.planche_ia) → DOOMED_import\\planches + planches.json ;
  3. version agrandie ×4 (agrandir.rgba_x4) → DOOMED_import\\hd\\planches ;
  4. fiche recopiée dans Doom\\profil\\monstres\\<type>.json : le monstre entre dans la légende (validateur, construction).
Côté Unreal ensuite (phase Unreal) : python ue_py.py creer_sprites.py (importe toutes les planches).
"""
import json, shutil, sys
from pathlib import Path

sys.path.insert(0, r'C:\workspace IA\Doom\outils')
sys.path.insert(0, r'C:\workspace IA\Unreal\methode\outils')
ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI))
import comfy_doomed as comfy
import fiches
import planches_sprites
from PIL import Image

IMPORT = Path(r'C:\workspace IA\Unreal\DOOMED_import')
PROFIL = ICI.parent / 'profil'


def creer(chemin, journal=print):
    f = fiches.lire(chemin)
    prof = fiches.charger_profil(PROFIL / 'jeu.json')
    err, _ = fiches.valider_monstre(f, prof)
    if err:
        raise ValueError('fiche refusée : ' + '; '.join(err))
    ok, raison = comfy.etat()
    if not ok:
        raise RuntimeError(raison)
    t = f['type']
    # pose d'attaque selon la façon d'attaquer (sinon griffes en avant pour tous : la Sentinelle à canon, 22/10)
    a = f['attaque']
    geste = {'balle': 'aiming its weapon or arm cannon straight at the viewer and firing, a bright yellow muzzle flash',
             'boule': f'hurling a glowing {a.get("couleur", "fire").replace("fire", "orange fire")} energy ball toward the '
                      'viewer from its raised hand or open mouth',
             'charge': 'lunging and charging straight at the viewer, body thrust forward'}.get(a['mode'])
    poses = comfy.generer_monstre_images(t, f['prompt_image'], vole=bool(f['stats'].get('fly')), journal=journal,
                                         attaque=geste)
    for nom, e in poses.items():
        comfy.en_image(e).save(IMPORT / 'textures' / f'{nom}.png')
    planche, meta = planches_sprites.planche_ia(t)
    planche.save(IMPORT / 'planches' / f'{t}.png')
    pj = IMPORT / 'planches' / 'planches.json'
    tout = json.loads(pj.read_text(encoding='utf-8'))
    tout[t] = meta
    pj.write_text(json.dumps(tout, indent=1, ensure_ascii=False), encoding='utf-8')
    import agrandir                       # client ComfyUI d'agrandissement (4x-UltraSharp)
    (IMPORT / 'hd' / 'planches').mkdir(parents=True, exist_ok=True)
    agrandir.rgba_x4(planche.convert('RGBA'), 'pl_' + t).save(IMPORT / 'hd' / 'planches' / f'{t}.png')
    shutil.copy(pj, IMPORT / 'hd' / 'planches' / 'planches.json')
    comfy.liberer()
    fiches.ecrire(PROFIL / 'monstres' / f'{t}.json', f)
    journal(f'monstre {t} ({f["car"]}) prêt côté images ; reste l\'import dans Unreal (creer_sprites.py)')
    return t


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    creer(sys.argv[1])
