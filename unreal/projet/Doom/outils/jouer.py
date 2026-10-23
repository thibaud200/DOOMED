"""Lance un niveau en jeu (fenêtre de jeu Unreal, sans l'éditeur) — l'équivalent de « tester un niveau » du jeu HTML.

    python jouer.py 22        (ou Doom\\Tester_niveau.bat 22)

Le niveau doit avoir été construit (carte dans Content\\DOOMED\\Cartes). À éviter pendant qu'une nuit de l'enchaîneur
tourne : la mémoire ne suffit pas pour le jeu et LM Studio ensemble.
"""
import json, subprocess, sys, unicodedata
from pathlib import Path

ICI = Path(__file__).resolve().parent
PROFIL = json.loads((ICI.parent / 'profil' / 'jeu.json').read_text(encoding='utf-8'))


def nom_carte(nom):
    s = unicodedata.normalize('NFKD', nom).encode('ascii', 'ignore').decode()
    code, _, titre = s.partition(' ')
    return code + '_' + ''.join(c for c in titre.title() if c.isalnum())


def carte_du_niveau(n):
    fiche = Path(PROFIL['chaine']['racine']) / PROFIL['chaine']['fiches'] / f'E{n}' / 'carte.json'
    if fiche.exists():
        return json.loads(fiche.read_text(encoding='utf-8'))['nom']
    export = json.loads(Path(PROFIL['construction']['source_cartes']).read_text(encoding='utf-8'))['niveaux']
    if 1 <= n <= len(export):
        return export[n - 1]['name']
    raise SystemExit(f'niveau {n} inconnu')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    n = int(sys.argv[1]) if len(sys.argv) > 1 else int(input('Numéro du niveau : '))
    nom = carte_du_niveau(n)
    chemin = f'{PROFIL["construction"]["racine"]}/Cartes/{nom_carte(nom)}'
    fichier = Path(PROFIL['chaine']['editeur']['projet']).parent / 'Content' / (chemin[len('/Game/'):] + '.umap')
    if not fichier.exists():
        raise SystemExit(f'{nom} n\'est pas encore construit ({fichier.name} absent)')
    ed = PROFIL['chaine']['editeur']
    print(f'{nom} → {chemin} (fenêtre de jeu ; Échap puis fermer pour quitter)')
    subprocess.Popen([ed['exe'], ed['projet'], chemin, '-game', '-windowed', '-ResX=1600', '-ResY=900', *ed['arguments']])
