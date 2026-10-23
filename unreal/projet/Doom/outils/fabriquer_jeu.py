"""Fabrique le jeu complet : reconstruit les niveaux qui ont changé, ferme l'éditeur, puis package Windows (Shipping).

    python fabriquer_jeu.py                     niveaux dont l'empreinte a changé (fiche, profil, constructeur) + package
    python fabriquer_jeu.py --niveaux 5,18-20   ces niveaux en plus
    python fabriquer_jeu.py --tout              tous les niveaux (après un changement qui échappe à l'empreinte)
    python fabriquer_jeu.py --sceller           note l'empreinte actuelle de tous les niveaux construits, sans rien refaire
    python fabriquer_jeu.py --sans-reconstruire package seulement
    python fabriquer_jeu.py --cook-complet      cook complet au lieu du cook incrémental
                                                → C:\\workspace IA\\Unreal\\DOOMED_jeu\\Windows\\Doom.exe

Empreinte : methode\\enchainer.py (empreinte, a_reconstruire) ; fichiers du constructeur : profil, chaine.empreinte.
Cook incrémental (-cookincremental) : ne recuit que ce qui a changé et ce qui en dépend ; s'il échoue, cook complet.
Shipping : les messages à l'écran passent par WBP_Message (bp.annonces), PrintString n'existant pas dans cette version.
Compilation (-build) : le jeu a sa propre cible, car des plugins sont limités à l'éditeur dans Doom.uproject (débruiteur
NNE, outils) ; il faut Visual Studio 2022 avec MSVC 14.44 et le SDK Windows 10.0.22621 (installés le 23/10).
Les cartes à embarquer et la carte de démarrage (Menu) sont dans Config\\DefaultGame.ini / DefaultEngine.ini.
"""
import argparse, subprocess, sys, time
from pathlib import Path

RACINE = Path(r'C:\workspace IA\Unreal')
sys.path.insert(0, str(RACINE / 'methode')); sys.path.insert(0, str(RACINE / 'methode' / 'outils'))
import enchainer as E

UAT = r'C:\Program Files\Epic Games\UE_5.8\Engine\Build\BatchFiles\RunUAT.bat'
PROJET = RACINE / 'Doom' / 'Doom.uproject'
SORTIE = RACINE / 'DOOMED_jeu'


def packager(ch, incremental, sortie=SORTIE):
    mode = 'incrémental' if incremental else 'complet'
    ch.note(f'packaging Windows (Shipping, cook {mode}) → {sortie}')
    t0 = time.time()
    # un journal par passe : le repli en cook complet ne doit pas effacer la cause de l'échec incrémental
    with open(RACINE / f'DOOMED_packaging{"_incremental" if incremental else ""}.log', 'w', encoding='utf-8', errors='replace') as log:
        args = [UAT, 'BuildCookRun', f'-project={PROJET}', '-noP4', '-platform=Win64',
                '-clientconfig=Shipping', '-build', '-cook', '-stage', '-pak', '-archive',
                # -nodebuginfo : pas de symboles de débogage (.pdb, 280 Mo) dans le jeu livré
                f'-archivedirectory={sortie}', '-nodebuginfo', '-utf8output', '-unattended'] + (['-cookincremental'] if incremental else [])
        # cmd /c retire les premiers guillemets de la ligne : sans la paire extérieure, « C:\Program » n'est pas reconnu
        r = subprocess.run(f'cmd /c "{subprocess.list2cmdline(args)}"', stdout=log, stderr=subprocess.STDOUT)
    ch.note(f'packaging ({mode}) : code {r.returncode} en {round((time.time() - t0) / 60)} min '
            f'({"réussi" if r.returncode == 0 else "ÉCHEC, voir " + log.name})')
    return r.returncode


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser()
    ap.add_argument('--niveaux', default='', help='niveaux à refaire en plus, ex. 5,18-20')
    ap.add_argument('--tout', action='store_true')
    ap.add_argument('--sceller', action='store_true')
    ap.add_argument('--sans-reconstruire', action='store_true')
    ap.add_argument('--cook-complet', action='store_true')
    ap.add_argument('--sortie', default=str(SORTIE), help='dossier du jeu (par défaut DOOMED_jeu)')
    a = ap.parse_args()
    ch = E.Chantier(RACINE / 'Doom' / 'profil' / 'jeu.json')
    if a.sceller:
        for n in ch.niveaux({'controle_ok'}):
            e = ch.etat(n); e['empreinte'] = E.empreinte(ch, n); E.F.ecrire(ch.niv(n) / 'etat.json', e)
        ch.note(f'empreinte notée sur {len(ch.niveaux({"controle_ok"}))} niveau(x)')
        sys.exit(0)
    forces = [n for p in a.niveaux.split(',') if p for n in E.plage(p)]
    refaire = [] if a.sans_reconstruire else ch.niveaux({'controle_ok'}) if a.tout else E.a_reconstruire(ch, forces)
    hw = E.Materiel(ch, fermer_editeur=True)
    if refaire or not a.sans_reconstruire:
        hw.phase_unreal()
    if refaire:
        for n in refaire:
            e = ch.etat(n); e['statut'] = 'carte_ok'; E.F.ecrire(ch.niv(n) / 'etat.json', e)
        if a.tout:
            ch.p['chaine']['commandes'].pop('photos', None)      # tout refaire : l'apparence n'a pas changé, pas de photos
        E.construire_tout(ch, [])
        ch.note(f'reconstruction pour le jeu ({len(refaire)} niveau(x) : {", ".join(f"E{n}" for n in refaire[:20])}'
                f'{"…" if len(refaire) > 20 else ""}) : '
                + ', '.join(f'{s} {len(ch.niveaux({s}))}' for s in ('controle_ok', 'controle_ko', 'echec')))
    else:
        ch.note('reconstruction pour le jeu : aucun niveau n\'a changé')
    if not a.sans_reconstruire:
        # matériaux posés en instances : sans le drapeau, le jeu packagé les remplace par le matériau gris par défaut
        code, sortie = ch.commande('materiaux_instances')
        ch.note('matériaux en instances : ' + (sortie.strip().splitlines() or ['?'])[-1] if code == 0 else 'ÉCHEC ' + sortie[-300:])
    hw.quitter_editeur()
    if E.editeur_ouvert(ch):
        raise SystemExit("l'éditeur est encore ouvert : packaging annulé")
    code = packager(ch, not a.cook_complet, Path(a.sortie))
    if code and not a.cook_complet:
        code = packager(ch, False, Path(a.sortie))                       # le cook incrémental est encore jeune en 5.8 : repli complet
    sys.exit(code)
