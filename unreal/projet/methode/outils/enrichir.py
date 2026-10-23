"""Enrichit les niveaux existants avec les nouveautés du jeu, sans en créer de nouveaux. Commun à tous les jeux.

    python enrichir.py [--niveaux 1-96] [--profil jeu.json] [--essai]

Pour chaque niveau (fiche de l'enchaîneur, ou grille d'origine du jeu : elle devient alors une fiche) :
  1. monstres : à partir de son niveau d'apparition (champ « intro » de profil\\monstres\\<type>.json), un monstre créé
     remplace une part des monstres de base ; au niveau qui le présente, il est là au moins 3 fois ;
  2. embuscades : 1 ou 2 réduits cachés qui s'ouvrent sur le joueur (fiches.ajouter_embuscades) ;
  3. bonus : berserk ou invisibilité de temps en temps (fiches.ajouter_bonus) ;
  4. réparation et contrôle ; si la carte ne passe plus le contrôle, l'ancienne est gardée.
Le niveau repasse en « carte_ok » : l'enchaîneur le reconstruira (python enchainer.py --reprendre).
Une seule passe par niveau (etat.json : « enrichi ») ; --essai n'écrit rien.
"""
import json, random, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fiches as F

BASE = '124'          # monstres de base remplaçables : diablotin, démon rose, soldat
PART = 0.25           # part des monstres de base remplacés dans un niveau où des monstres créés sont permis


def nouveaux_monstres(profil):
    return sorted((F.lire(f) for f in (Path(profil['_dossier']) / 'monstres').glob('*.json')), key=lambda m: m['intro'])


def diversifier(carte, profil, n, rnd):
    G = F.Grille(carte['rows'], profil)
    permis = [m for m in nouveaux_monstres(profil) if m['intro'] <= n]
    if not permis:
        return carte, []
    base = [q for q in G.cases(BASE)]
    rnd.shuffle(base)
    notes = []
    presente = [m for m in permis if m['intro'] == n]
    for m in presente:                      # niveau qui le présente : au moins 3 fois
        manque = 3 - len(G.cases(m['car']))
        for x, y in base[:max(0, manque)]:
            G.g[y][x] = m['car']
        if manque > 0:
            notes.append(f'{m["nom"]} présenté ({min(manque, len(base))} remplacements)')
        base = base[max(0, manque):]
    nb = round(len(base) * PART)
    for x, y in base[:nb]:
        # les plus récents un peu plus souvent : le joueur découvre les nouveaux monstres sans oublier les anciens
        m = rnd.choices(permis, weights=[1 + i for i in range(len(permis))])[0]
        G.g[y][x] = m['car']
    if nb:
        notes.append(f'{nb} monstre(s) de base remplacé(s) par des monstres créés')
    return carte | {'rows': G.rows}, notes


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    a = sys.argv[1:]
    profil = F.charger_profil(a[a.index('--profil') + 1] if '--profil' in a else None)
    ch = profil['chaine']
    dossier = Path(ch['racine']) / ch['fiches']
    export = json.loads(Path(profil['construction']['source_cartes']).read_text(encoding='utf-8'))['niveaux']
    if '--niveaux' in a:
        d, _, f = a[a.index('--niveaux') + 1].partition('-')
        numeros = range(int(d), int(f or d) + 1)
    else:
        numeros = sorted({int(x.name[1:]) for x in dossier.glob('E*') if x.name[1:].isdigit()} | set(range(1, len(export) + 1)))
    essai = '--essai' in a
    bilan = {'enrichis': 0, 'inchangés': 0, 'déjà faits': 0, 'refusés': 0}
    for n in numeros:
        d = dossier / f'E{n}'
        etat = F.lire(d / 'etat.json') if (d / 'etat.json').exists() else {'numero': n, 'statut': 'a_faire', 'historique': [],
                                                                            'corrections': 0}
        if etat.get('enrichi'):
            bilan['déjà faits'] += 1; continue
        if (d / 'carte.json').exists():
            carte = F.lire(d / 'carte.json')
        elif n <= len(export):
            carte = {'niveau': n, 'nom': export[n - 1]['name'], 'style': 'scifi', 'sky': bool(export[n - 1].get('sky')),
                     'angle': export[n - 1].get('angle', 0), 'rows': export[n - 1]['rows']}
            etat['source'] = 'jeu HTML (enrichi)'
        else:
            continue
        if etat['statut'] == 'echec':
            continue
        rnd = random.Random(n * 7919 + 17)
        nouvelle, notes = diversifier(carte, profil, n, rnd)
        nouvelle, n2 = F.ajouter_embuscades(nouvelle, profil, 1 if n < 20 else 2, graine=n)
        nouvelle, n3 = F.ajouter_bonus(nouvelle, profil, n, graine=n)
        nouvelle, n4 = F.reparer_carte(nouvelle, profil)
        err, _ = F.valider_carte(nouvelle, profil)
        if err:
            bilan['refusés'] += 1
            print(f'E{n} : gardé tel quel ({"; ".join(err[:2])})'); continue
        changes = notes + n2 + n3 + n4
        if not changes:
            bilan['inchangés'] += 1; continue
        bilan['enrichis'] += 1
        print(f'E{n} : ' + ' | '.join(changes))
        if essai:
            continue
        F.ecrire(d / 'carte.json', nouvelle)
        etat.update(statut='carte_ok', enrichi=True)
        etat['historique'].append(time.strftime('%d/%m %H:%M') + ' carte_ok : enrichi — ' + ' | '.join(changes)[:300])
        F.ecrire(d / 'etat.json', etat)
    print(bilan)


if __name__ == '__main__':
    main()
