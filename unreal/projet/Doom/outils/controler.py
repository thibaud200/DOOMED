"""Contrôle du niveau ouvert dans l'éditeur : recalcule la navigation, attend sa fin, puis lance controler_niveau.py.

    python controler.py <fiche.json | numéro> [rapport.json]

Code de sortie 0 si le niveau est jouable (aucune erreur), 1 sinon ; le rapport JSON est écrit si un chemin est donné.
"""
import sys, time
from pathlib import Path
from ue_py import executer
from construire import RELANCE, attendre_navigation

ICI = Path(__file__).parent


def controler(arg, sortie=None):
    # navigation recalculée jusqu'à être réellement présente (voir construire.attendre_navigation) ; si elle reste
    # vide, controler_niveau.py le signale comme erreur
    if executer(RELANCE):
        return 1
    attendre_navigation()
    entete = f'CARTE={str(Path(arg).resolve())!r}\n' if str(arg).endswith('.json') else f'NIVEAU={int(arg)}\n'
    if sortie:
        entete += f'SORTIE={str(Path(sortie).resolve())!r}\n'
    code = executer(entete + (ICI / 'controler_niveau.py').read_text(encoding='utf-8'))
    if code or not sortie:
        return code
    import json
    return 0 if json.loads(Path(sortie).read_text(encoding='utf-8'))['ok'] else 1


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.exit(controler(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None))
