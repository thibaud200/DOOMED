"""Captures de la vue de l'éditeur (serveur MCP natif, outil CaptureViewport) pour vérifier un niveau à l'œil.

    python capture.py <sortie.png> x y z yaw [pitch]     (cm, degrés)
    python capture.py <sortie.png> dessus                vue de dessus, plafond masqué le temps de la capture
"""
import json, subprocess, sys
from pathlib import Path
sys.path.insert(0, r'C:\workspace IA\Unreal\outils')
import ue

ICI = Path(__file__).parent


def editeur(code):
    subprocess.run([sys.executable, str(ICI / 'ue_py.py'), '-c', code], check=True, capture_output=True)


def xf(x, y, z, yaw, pitch=0.0):
    return {'location': {'x': x, 'y': y, 'z': z}, 'rotation': {'pitch': pitch, 'yaw': yaw, 'roll': 0}, 'scale': {'x': 1, 'y': 1, 'z': 1}}


def plafond(cache):
    editeur("import unreal\n"
            "for a in unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors():\n"
            f"    if a.get_actor_label()=='Plafond': a.set_is_temporarily_hidden_in_editor({cache})")


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    ue.init()
    sortie = sys.argv[1]
    if sys.argv[2] == 'dessus':
        plafond(True)
        try:
            print(ue.capture(sortie, xf(4800, 4800, 9000, 0, -89.9)))
        finally:
            plafond(False)
    else:
        print(ue.capture(sortie, xf(*map(float, sys.argv[2:]))))
