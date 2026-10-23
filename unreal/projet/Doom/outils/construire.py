"""Construit un niveau de DOOMED de bout en bout dans l'éditeur ouvert.

    python construire.py 0              (0 = E1 … 19 = E20)
    python construire.py <fiche.json>   (fiche carte écrite par le modèle, methode\\schemas\\carte.schema.json)
    … SUIVANT="E22 — NOM"              (en plus : niveau où mène la sortie ; par défaut le suivant de doomed.json)

construire_niveau.py pose tout et lance le calcul de navigation ; ce calcul ne progresse qu'une fois le script rendu
(il tourne sur le fil de l'éditeur) : on attend donc sa fin avant d'enregistrer, sinon les monstres restent sur place.
"""
import sys, time
from pathlib import Path
from ue_py import executer

ICI = Path(__file__).parent

# Navigation réellement présente : le départ du joueur se projette sur le maillage. « Calcul fini » ne suffit pas : la
# demande peut être rendue finie avant d'avoir commencé (éditeur en arrière-plan), et la carte était alors enregistrée
# avec un maillage vide (nuit du 22/10 : 25 niveaux sur 25) — les monstres ne bougeraient pas en jeu.
SONDE = ('import unreal\n'
         'w = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()\n'
         'N = unreal.NavigationSystemV1\n'
         'assert not N.is_navigation_being_built(w), "navigation en cours"\n'
         'nm = unreal.GameplayStatics.get_all_actors_of_class(w, unreal.RecastNavMesh)\n'
         'ps = unreal.GameplayStatics.get_all_actors_of_class(w, unreal.PlayerStart)\n'
         'assert nm and ps and N.project_point_to_navigation(w, ps[0].get_actor_location(), nm[0], None, '
         'unreal.Vector(100, 100, 400)) is not None, "maillage vide"\n')
RELANCE = ('import unreal\n'
           'w = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()\n'
           'unreal.SystemLibrary.execute_console_command(w, "RebuildNavigation")\n')


def attendre_navigation(essais=4, delai=60):
    """True quand le départ est sur le maillage ; relance le calcul tant qu'il reste vide."""
    for essai in range(essais):
        if essai:
            executer(RELANCE)
        fin = time.time() + delai
        while time.time() < fin:
            time.sleep(3)
            if executer(SONDE, silencieux=True) == 0:
                return True
    return False

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    arg = sys.argv[1] if len(sys.argv) > 1 else '0'
    entete = f'CARTE={str(Path(arg).resolve())!r}\n' if arg.endswith('.json') else f'NIVEAU={int(arg)}\n'
    entete += ''.join(f'{k}={v!r}\n' for k, v in (a.split('=', 1) for a in sys.argv[2:]))     # NOM=valeur en plus
    code = entete + (ICI / 'construire_niveau.py').read_text(encoding='utf-8')
    if executer(code):
        sys.exit(1)
    if not attendre_navigation():
        print('ÉCHEC : navigation vide après plusieurs calculs (niveau NON enregistré)')
        sys.exit(1)
    executer('import unreal\nunreal.get_editor_subsystem(unreal.LevelEditorSubsystem).save_current_level()\n'
             'print("navigation calculée, niveau enregistré")')
