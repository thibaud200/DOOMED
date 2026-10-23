"""Enchaîneur : construit des niveaux sans intervention, en alternant les phases matérielles (jamais LM Studio et
l'éditeur Unreal en même temps). Commun à tous les jeux : ce qui est propre au jeu est dans profil.chaine.

    python enchainer.py --niveaux 2                  2 nouveaux niveaux écrits par le modèle (à partir du premier libre)
    python enchainer.py --niveaux 3 --monstre-tous 3 + un nouveau monstre tous les 3 niveaux (ComfyUI « thibaud »)
    python enchainer.py --export 2-20                niveaux déjà dessinés (jeu HTML), construits et contrôlés
    python enchainer.py --reprendre                  ne fait que ce qui reste (constructions, corrections)
    options : --profil <jeu.json> --theme "…" --fermer-editeur --sans-unreal --modele <id>

Déroulé (chaque niveau a son dossier <fiches>\\E<n> : plan.json, carte.json, rapport.json, etat.json, echanges\\) :
  A. phase MODÈLE (LM Studio [+ ComfyUI]) : fiche monstre → images ; plan → contrôle → carte → réparation → contrôle ;
     chaque fiche refusée repart au modèle avec le rapport d'erreurs (profil.chaine.essais_fiche fois au plus).
  B. phase UNREAL (modèle déchargé, éditeur lancé au besoin) : import des nouveaux monstres, construction, contrôle en jeu.
  C. corrections (LM Studio) : un niveau dont le contrôle a échoué reçoit le rapport, le modèle écrit des ordres,
     appliqués sur la fiche, puis retour en B (profil.chaine.tours_correction fois au plus).
Bilan : <fiches>\\bilan.txt. Ce qui échoue est noté (statut « echec » + raison) et l'enchaîneur passe au niveau suivant.
"""
import argparse, hashlib, json, re, subprocess, sys, time, traceback
from pathlib import Path

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI / 'outils'))
import apercu
import fiches as F
import modele as M

PY = sys.executable


# ---------------------------------------------------------------- journal et état
class Chantier:
    def __init__(self, profil_chemin):
        self.profil_chemin = Path(profil_chemin).resolve()      # chemins du profil (et empreinte) indépendants du dossier courant
        self.recharger()
        ch = self.p['chaine']
        self.racine = Path(ch['racine'])
        self.dossier = self.racine / ch['fiches']
        self.dossier.mkdir(parents=True, exist_ok=True)
        self.bilan = self.dossier / 'bilan.txt'

    def recharger(self):
        self.p = F.charger_profil(self.profil_chemin)

    def note(self, msg):
        ligne = time.strftime('%d/%m %H:%M ') + msg
        print(ligne, flush=True)
        with open(self.bilan, 'a', encoding='utf-8') as f:
            f.write(ligne + '\n')

    def niv(self, n):
        return self.dossier / (n if isinstance(n, str) else f'E{n}')       # « monstre_essaim » : dossier hors niveaux

    def etat(self, n):
        f = self.niv(n) / 'etat.json'
        return F.lire(f) if f.exists() else {'numero': n, 'statut': 'a_faire', 'historique': [], 'corrections': 0}

    def poser_etat(self, n, statut, raison=''):
        e = self.etat(n)
        e['statut'] = statut
        e['historique'].append(f'{time.strftime("%d/%m %H:%M")} {statut}' + (f' : {raison}' if raison else ''))
        F.ecrire(self.niv(n) / 'etat.json', e)
        self.note(f'E{n} → {statut}' + (f' ({raison})' if raison else ''))
        try:
            apercu.ecrire(self.profil_chemin)       # <fiches>\apercu.html toujours à jour
        except Exception as ex:
            self.note(f'aperçu non régénéré : {ex}')

    def niveaux(self, statuts):
        return sorted(int(d.name[1:]) for d in self.dossier.glob('E*') if d.name[1:].isdigit()
                      and (d / 'etat.json').exists() and self.etat(int(d.name[1:]))['statut'] in statuts)

    def commande(self, nom, **v):
        v['python'] = PY
        args = [a.format(**v) for a in self.p['chaine']['commandes'][nom]]
        args = [str(self.racine / a) if a.endswith('.py') and not Path(a).is_absolute() else a for a in args]
        r = subprocess.run(args, cwd=str(self.racine), capture_output=True, text=True, encoding='utf-8', errors='replace')
        sortie = (r.stdout or '') + (r.stderr or '')
        sortie = '\n'.join(l for l in sortie.splitlines() if 'DeprecationWarning' not in l and not l.startswith('  '))
        return r.returncode, sortie


# ---------------------------------------------------------------- matériel : un seul gros logiciel à la fois
def editeur_ouvert(ch):
    nom = ch.p['chaine']['editeur']['processus']
    r = subprocess.run(['tasklist', '/FI', f'IMAGENAME eq {nom}', '/NH'], capture_output=True, text=True,
                       encoding='oem', errors='replace')
    return nom.lower() in (r.stdout or '').lower()


class Materiel:
    def __init__(self, ch, fermer_editeur):
        self.ch, self.fermer = ch, fermer_editeur
        self.lance_par_nous = False

    def phase_modele(self, modele):
        if editeur_ouvert(self.ch):
            if not (self.lance_par_nous or self.fermer):
                raise RuntimeError('éditeur Unreal ouvert : la phase modèle ne peut pas tourner en même temps '
                                   '(relancez avec --fermer-editeur, ou fermez-le)')
            self.quitter_editeur()
        M.charger(modele, self.ch.p['chaine']['contexte'])

    def phase_unreal(self):
        M.decharger()
        if not editeur_ouvert(self.ch):
            ed = self.ch.p['chaine']['editeur']
            self.ch.note('lancement de l\'éditeur Unreal')
            subprocess.Popen([ed['exe'], ed['projet'], *ed['arguments']], creationflags=0x00000008)   # DETACHED_PROCESS
            self.lance_par_nous = True
        fin = time.time() + self.ch.p['chaine']['editeur']['attente_s']
        while time.time() < fin:
            if self.ch.commande('editeur_repond')[0] == 0:
                return
            time.sleep(15)
        raise RuntimeError('l\'éditeur ne répond pas (Python Remote Execution)')

    def quitter_editeur(self):
        if not editeur_ouvert(self.ch):
            return
        self.ch.note('fermeture de l\'éditeur Unreal')
        self.ch.commande('editeur_quitter')
        for _ in range(60):
            if not editeur_ouvert(self.ch):
                break
            time.sleep(5)
        self.lance_par_nous = False

    def fin(self):
        if self.lance_par_nous:
            self.quitter_editeur()


# ---------------------------------------------------------------- dialogue avec le modèle
def vue_profil(p):
    """Ce que le modèle doit savoir du jeu (sans la mécanique de construction)."""
    return {k: v for k, v in p.items() if k not in ('construction', 'chaine', 'outils_construction') and not k.startswith('_')}


def systeme(ch, type_):
    ex = {'plan_niveau': 'plan_E1.json', 'carte': 'carte_E1.json', 'salles': 'salles_E1.json', 'monstre': 'monstre_goule.json',
          'ordres': 'ordres_E1.json'}[type_]
    exemple = (Path(ch.p['_dossier']) / 'exemples' / ex)
    return '\n\n'.join([
        (ICI / 'README_MODELE.md').read_text(encoding='utf-8'),
        '# PROFIL DU JEU\n' + json.dumps(vue_profil(ch.p), ensure_ascii=False),
        f'# FORMAT À RENDRE ({type_})\n' + (ICI / 'schemas' / f'{type_}.schema.json').read_text(encoding='utf-8'),
        '# EXEMPLE (imiter la forme, pas le contenu)\n' + (exemple.read_text(encoding='utf-8') if exemple.exists() else '')])


def schema_carte_exact(ch, w, h):
    """Schéma de carte aux dimensions exactes et aux seuls caractères de la légende : la grammaire de LM Studio
    empêche le modèle d'écrire une ligne trop courte ou un caractère inconnu."""
    s = F.schema('carte')
    car = ''.join(sorted(ch.p['carte']['legende']))
    classe = ''.join('\\' + c if c in '\\]^-[' else c for c in car)
    s['properties']['rows'] = {'type': 'array', 'minItems': h, 'maxItems': h,
                               'items': {'type': 'string', 'minLength': w, 'maxLength': w, 'pattern': f'^[{classe}]+$'}}
    s['required'] = ['niveau', 'nom', 'rows', 'zones']
    return s


def schema_salles_exact(plan):
    """Schéma des salles réduit aux zones du plan : la grammaire impose les id et leur nombre."""
    s = F.schema('salles')
    ids = [z['id'] for z in plan['zones']]
    s['properties']['salles']['minItems'] = s['properties']['salles']['maxItems'] = len(ids)
    s['properties']['salles']['items']['properties']['id'] = {'enum': ids}
    s['properties']['salles']['items']['required'] = ['id', 'x', 'y', 'l', 'h', 'piliers']
    return s


def obtenir(ch, n, type_, demande, verifier, modele, schema=None, nom=None):
    """Demande une fiche, la contrôle (verifier → (fiche, erreurs, alertes)), relance avec le rapport. None si échec."""
    nom = nom or type_
    messages = [{'role': 'system', 'content': systeme(ch, type_)}, {'role': 'user', 'content': demande}]
    dossier = ch.niv(n) / 'echanges'
    for essai in range(1, ch.p['chaine']['essais_fiche'] + 1):
        ch.note(f'E{n} : {nom}, essai {essai}')
        try:
            fiche, brut = M.demander_json(modele, messages, schema or F.schema(type_), journal=ch.note)
        except Exception as e:
            brut, fiche = str(e), None
            erreurs, alertes = [f'réponse illisible ({e})'], []
        F.ecrire(dossier / f'{nom}_{essai}.json', {'demande': messages[-1]['content'], 'reponse': brut})
        if fiche is not None:
            if 'refus' in fiche:
                ch.note(f'E{n} : le modèle refuse ({fiche["refus"]})')
                return None
            try:
                fiche, erreurs, alertes = verifier(fiche)
            except Exception as e:       # réponse de forme inattendue : refusée, jamais de plantage de la nuit
                erreurs, alertes = [f'fiche inutilisable ({type(e).__name__} : {e}) — respecte exactement le format'], []
        if not erreurs:
            for a in alertes:
                ch.note(f'E{n} : alerte {nom} — {a}')
            return fiche
        ch.note(f'E{n} : {nom} refusé — ' + ' ; '.join(erreurs[:5]))
        # seulement la dernière réponse et son rapport : l'historique complet dépasserait le contexte sur les grandes cartes
        messages = messages[:2] + [{'role': 'assistant', 'content': brut if isinstance(brut, str) else json.dumps(brut)},
                     {'role': 'user', 'content': 'Rapport de l\'outil — corrige SEULEMENT ces erreurs et renvoie la fiche '
                      'complète :\n- ' + '\n- '.join(erreurs) +
                      (f'\nCarte actuelle (déjà réparée par l\'outil), avec coordonnées :\n{F.Grille(fiche["rows"], ch.p).texte()}'
                       if fiche and 'rows' in fiche else '')}]
    return None


def nouveau_monstre(ch, n, modele, idee, role=None, intro=None):
    """n : numéro du niveau qui le présente, ou nom de dossier (« monstre_essaim ») ; role : rôle imposé (profil)."""
    existants = ', '.join(f'{k} = {v["nom"]} ({v["role"]})' for k, v in ch.p['monstres_existants'].items())
    libres = [c for c in 'abcdefghilnopqstuvwxyz' if c not in ch.p['carte']['legende']]
    roles = ch.p['gabarits']['monstre'].get('roles', {})
    intro = intro or n
    consigne_role = (f'RÔLE IMPOSÉ : role = "{role}" — {json.dumps(roles[role], ensure_ascii=False)}. '
                     f'Les chiffres restent dans ces fourchettes ; attaque et special conformes.\n' if role else
                     'Choisis un rôle de gabarits.monstre.roles que les monstres existants n\'ont pas.\n')
    demande = (f'Crée un NOUVEAU monstre, présenté au niveau {intro}. Monstres existants : {existants}.\n'
               f'Caractères libres pour « car » : {" ".join(libres)}.\n' + consigne_role
               + (f'Idée : {idee}\n' if idee else
                  'Apparence et nom TRÈS différents des monstres existants : autre matière (chair, os, insecte, spectre, '
                  'machine…), autre silhouette, autre couleur ; pas encore un humanoïde en armure de cuivre (22/10 : '
                  '4 monstres « de cuivre » sur 6).\n') + f'intro = {intro}.')

    def verifier(f):
        f['intro'] = intro
        if role:
            f['role'] = role
        e, a = F.valider_monstre(f, ch.p)
        return f, e, a
    fiche = obtenir(ch, n, 'monstre', demande, verifier, modele)
    if not fiche:
        return None
    chemin = ch.niv(n) / 'monstre.json'
    F.ecrire(chemin, fiche)
    ch.note(f'E{n} : images du monstre {fiche["type"]} (ComfyUI)')
    # le modèle de langue (14 Go) et ceux d'image ne tiennent pas ensemble en mémoire graphique : déchargé le temps du dessin
    M.decharger()
    code, sortie = ch.commande('images_monstre', fiche=str(chemin))
    M.charger(modele, ch.p['chaine']['contexte'])
    if code:
        ch.note(f'E{n} : images du monstre impossibles — {sortie.strip().splitlines()[-1] if sortie.strip() else code}')
        return None
    ch.recharger()
    return fiche['car']


def ecrire_niveau(ch, n, modele, theme=None, monstre=None):
    precedent = ch.niv(n - 1) / 'plan.json'
    resume = ''
    if precedent.exists():
        pp = F.lire(precedent)
        resume = f'Niveau précédent : « {pp["nom"]} » — {pp["theme"]}\n'
    ref = min(ch.p['difficulte']['reperes'], key=lambda r: abs(r['niveau'] - n))
    # la nuit du 22/10, sans cette liste : 3 « Forge des cendres », 5 « Cathédrale… », des noms en anglais
    pris = [F.lire(d / 'plan.json')['nom'].split('—')[-1].strip() for d in sorted(ch.dossier.glob('E*'))
            if (d / 'plan.json').exists() and d.name != f'E{n}']
    resume += (f'Noms déjà pris (ne réutilise ni ces noms ni leurs mots principaux, change de lieu et d\'ambiance) : '
               f'{", ".join(pris)}.\nLe nom et le thème sont EN FRANÇAIS.\n' if pris else '')
    demande = (f'Écris le PLAN GÉNÉRAL du niveau {n} (étape 1).\n{resume}'
               + (f'Thème voulu : {theme}\n' if theme else 'Thème : libre, différent du précédent.\n')
               + f'Repère de difficulté le plus proche : {json.dumps(ref, ensure_ascii=False)}.\n'
               + (f'Ce niveau présente le nouveau monstre « {monstre} » (nouveau_monstre = "{monstre}", au moins 3 fois).\n'
                  if monstre else 'nouveau_monstre = null.\n'))

    def v_plan(f):
        f['niveau'] = n
        # le nom donne celui de la carte Unreal : « E<n> — … » obligatoire, sinon un autre niveau serait écrasé
        f['nom'] = f'E{n} — ' + re.sub(r'^\s*E\d+\s*[—–-]?\s*', '', f.get('nom', '')).strip().upper()
        if monstre and not F.erreurs_schema(f, F.schema('plan_niveau')):
            f['progression']['nouveau_monstre'] = monstre
        f, notes = F.reparer_plan(f, ch.p)
        for x in notes:
            ch.note(f'E{n} : plan réparé — {x}')
        e, a = F.valider_plan(f, ch.p)
        # nom déjà pris (22/10 : « Le Ventre du Rifleur » 6 fois malgré la liste) : refusé, le modèle en change
        if f['nom'].split('—')[-1].strip().upper() in {x.upper() for x in pris}:
            e.append(f'le nom « {f["nom"].split("—")[-1].strip()} » est déjà pris : choisis un autre nom et un autre lieu')
        if monstre and f['progression'].get('nouveau_monstre') != monstre:
            e.append(f'progression.nouveau_monstre doit valoir « {monstre} »')
        return f, e, a
    plan = obtenir(ch, n, 'plan_niveau', demande, v_plan, modele, nom='plan')
    if not plan:
        ch.poser_etat(n, 'echec', 'plan refusé après tous les essais'); return
    F.ecrire(ch.niv(n) / 'plan.json', plan)
    w, h = plan['taille']
    # étape 2 : le modèle place les zones en rectangles ; l'outil dessine la carte (couloirs, portes, contenu…)
    demande = (f'Place les SALLES du niveau {n} (étape 2) d\'après ce plan validé :\n' + json.dumps(plan, ensure_ascii=False)
               + f'\nLa carte fait {w} colonnes (x de 0 à {w - 1}) sur {h} lignes (y de 0 à {h - 1}) ; le bord (x = 0, '
               f'x = {w - 1}, y = 0, y = {h - 1}) reste en mur. Une salle par zone du plan ({len(plan["zones"])} salles), '
               f'aux id du plan. Suis le croquis pour la position relative des zones.')
    garde = {}

    def v_salles(f):
        f['niveau'] = n
        f, e, a = F.valider_salles(f, plan)
        if e:
            return f, e, a
        garde['salles'] = f
        carte = F.dessiner_salles(f, plan, ch.p)
        carte, notes = F.reparer_carte(carte, ch.p, plan)
        for x in a + notes:
            ch.note(f'E{n} : réparé — {x}')
        e, a2 = F.valider_carte(carte, ch.p, plan)
        return carte, e, a2
    carte = obtenir(ch, n, 'salles', demande, v_salles, modele, schema=schema_salles_exact(plan))
    if not carte:
        ch.poser_etat(n, 'echec', 'salles refusées après tous les essais'); return
    F.ecrire(ch.niv(n) / 'salles.json', garde['salles'])
    F.ecrire(ch.niv(n) / 'carte.json', carte)
    ch.poser_etat(n, 'carte_ok')


def corriger_niveau(ch, n, modele):
    e = ch.etat(n)
    carte = F.lire(ch.niv(n) / 'carte.json')
    rapport = F.lire(ch.niv(n) / 'rapport.json')
    demande = (f'Le niveau {n} a été construit dans Unreal puis contrôlé. Rapport :\n{json.dumps(rapport, ensure_ascii=False)}\n'
               f'Ce qui est posé (coordonnées x = colonne, y = ligne) :\n{F.Grille(carte["rows"], ch.p).inventaire()}\n'
               f'Carte actuelle :\n{F.Grille(carte["rows"], ch.p).texte()}\n'
               f'Écris la liste d\'ORDRES (étape 4) qui corrige les erreurs, terminée par {{"faire": "essayer", "test": "tout"}}.')
    resultat = {}

    def v_ordres(f):
        f['niveau'] = n
        er = F.erreurs_schema(f, F.schema('ordres'), 'ordres')
        if er:
            return f, er, []
        nouvelle, rap = F.appliquer_ordres(carte, f, ch.p)
        nouvelle, notes = F.reparer_carte(nouvelle, ch.p, F.lire(ch.niv(n) / 'plan.json'))
        er2, al = F.valider_carte(nouvelle, ch.p)
        refus = [r for r in rap if 'refusé' in r]
        resultat.update(carte=nouvelle, rapport=rap + notes)
        return f, er2 + refus, al
    ordres = obtenir(ch, n, 'ordres', demande, v_ordres, modele, nom=f'ordres_{e["corrections"] + 1}')
    e = ch.etat(n); e['corrections'] += 1; F.ecrire(ch.niv(n) / 'etat.json', e)
    if not ordres:
        ch.poser_etat(n, 'echec', 'correction impossible'); return
    F.ecrire(ch.niv(n) / f'ordres_{e["corrections"]}.json', ordres)
    F.ecrire(ch.niv(n) / 'carte.json', resultat['carte'])
    faits = [r.split('\n')[0] for r in resultat['rapport'] if ' regarder : ' not in r]
    ch.poser_etat(n, 'carte_ok', 'corrigée : ' + ' | '.join(faits)[:300])


# ---------------------------------------------------------------- phase Unreal
def empreinte(ch, n):
    """Ce qui fait le niveau construit : sa fiche, le profil (hors chaîne) et les fichiers du constructeur listés dans
    chaine.empreinte (dossier = tous ses fichiers). Même empreinte qu'à la dernière construction = rien à refaire.
    La sortie (niveau suivant) n'y est pas : construire_tout rechaîne déjà un niveau dont la sortie a changé."""
    h = hashlib.sha1()
    f = ch.niv(n) / 'carte.json'
    h.update(f.read_bytes() if f.exists() else str(n).encode())
    h.update(json.dumps({k: v for k, v in ch.p.items() if k != 'chaine'}, sort_keys=True, ensure_ascii=False).encode())
    for rel in ch.p['chaine'].get('empreinte', []):
        p = ch.racine / rel
        for g in sorted(p.rglob('*') if p.is_dir() else [p]):
            if g.is_file():
                h.update(g.name.encode()); h.update(g.read_bytes())
    return h.hexdigest()[:16]


def a_reconstruire(ch, forces=()):
    """Niveaux construits (controle_ok) dont l'empreinte a changé, plus ceux demandés ; sans liste « empreinte » dans le
    profil, tous."""
    if not ch.p['chaine'].get('empreinte'):
        return ch.niveaux({'controle_ok'})
    return [n for n in ch.niveaux({'controle_ok'}) if n in forces or ch.etat(n).get('empreinte') != empreinte(ch, n)]


def construire_tout(ch, niveaux_export):
    if (ch.dossier / 'monstres_a_importer').exists():
        code, sortie = ch.commande('importer_monstres')
        ch.note('import des planches de monstres : ' + ('fait' if code == 0 else 'ÉCHEC ' + sortie[-300:]))
        if code == 0:
            (ch.dossier / 'monstres_a_importer').unlink()
    def suivant(n):
        """Sortie : prochain niveau qui a une carte valide (un niveau en échec est sauté), sinon retour au premier."""
        # niveaux d'origine sans fiche compris (E2, oublié le 22/10 : E1 menait à E3)
        export = json.loads(Path(ch.p['construction']['source_cartes']).read_text(encoding='utf-8'))['niveaux'] \
            if ch.p.get('construction', {}).get('source_cartes') else []
        noms = {i + 1: e['name'] for i, e in enumerate(export)}
        noms.update({int(d.name[1:]): F.lire(d / 'carte.json')['nom'] for d in ch.dossier.glob('E*')
                     if d.name[1:].isdigit() and (d / 'carte.json').exists()})
        s = sorted(k for k in noms if k > n and ch.etat(k)['statut'] != 'echec')
        return noms[s[0]] if s else ch.p['chaine']['niveau_retour']

    def construire(n):
        carte = ch.niv(n) / 'carte.json'
        cible = suivant(n)
        code, sortie = ch.commande('construire', carte=str(carte), suivant=cible)
        if code:
            ch.poser_etat(n, 'echec', 'construction : ' + sortie.strip()[-300:]); return
        e = ch.etat(n); e['suivant'] = cible; e['empreinte'] = empreinte(ch, n); F.ecrire(ch.niv(n) / 'etat.json', e)
        controler(ch, n, ch.commande('controler', carte=str(carte), rapport=str(ch.niv(n) / 'rapport.json')))
        if 'photos' in ch.p['chaine']['commandes']:
            ch.commande('photos', numero=n)            # à quoi il ressemble : <fiches>\E<n>\photos, montrées par l'aperçu

    for n in ch.niveaux({'carte_ok'}):
        construire(n)
    # un niveau ajouté dans un trou (E23 entre E22 et E24) : le niveau d'avant doit maintenant y mener
    for n in ch.niveaux({'controle_ok'}):
        e = ch.etat(n)
        if e.get('source') != 'export' and (ch.niv(n) / 'carte.json').exists() and e.get('suivant') != suivant(n):
            ch.note(f'E{n} : sortie rechaînée vers {suivant(n)}')
            construire(n)
    for n in niveaux_export:
        ch.niv(n).mkdir(parents=True, exist_ok=True)
        code, sortie = ch.commande('construire_export', index=n - 1)
        if code:
            ch.poser_etat(n, 'echec', 'construction : ' + sortie.strip()[-300:]); continue
        e = ch.etat(n); e['source'] = 'export'; e['empreinte'] = empreinte(ch, n); F.ecrire(ch.niv(n) / 'etat.json', e)
        controler(ch, n, ch.commande('controler_export', index=n - 1, rapport=str(ch.niv(n) / 'rapport.json')))


def controler(ch, n, resultat):
    code, sortie = resultat
    f = ch.niv(n) / 'rapport.json'
    if not f.exists():
        ch.poser_etat(n, 'echec', 'contrôle impossible : ' + sortie.strip()[-300:]); return
    r = F.lire(f)
    for a in r['alertes']:
        ch.note(f'E{n} : alerte en jeu — {a}')
    ch.poser_etat(n, 'controle_ok' if r['ok'] else 'controle_ko', '; '.join(r['erreurs'])[:300])


# ---------------------------------------------------------------- programme
def plage(texte):
    a, _, b = texte.partition('-')
    return list(range(int(a), int(b or a) + 1))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--profil', default=str(ICI.parent / 'Doom' / 'profil' / 'jeu.json'))
    ap.add_argument('--niveaux', type=int, default=0, help='nombre de nouveaux niveaux à écrire')
    ap.add_argument('--monstre-tous', type=int, default=0, help='un nouveau monstre tous les N nouveaux niveaux')
    ap.add_argument('--idee-monstre', default=None)
    ap.add_argument('--theme', default=None)
    ap.add_argument('--export', default=None, help='niveaux déjà dessinés à construire, ex. 2-20')
    ap.add_argument('--refaire', default=None, help='niveaux à réécrire par le modèle avant les nouveaux, ex. 23,28-30')
    ap.add_argument('--monstres', default=None,
                    help='nouveaux monstres seuls, rôle:niveau d\'apparition, ex. essaim:9,kamikaze:15 (ComfyUI « thibaud »)')
    ap.add_argument('--reprendre', action='store_true')
    ap.add_argument('--fermer-editeur', action='store_true', help='autorise à fermer un éditeur déjà ouvert')
    ap.add_argument('--sans-unreal', action='store_true', help='s\'arrête après les fiches (phase modèle seule)')
    ap.add_argument('--modele', default=None)
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding='utf-8')
    ch = Chantier(a.profil)
    modele = a.modele or ch.p['chaine']['modele']
    hw = Materiel(ch, a.fermer_editeur)
    export = plage(a.export) if a.export else []
    ch.note(f'=== début : {a.niveaux} nouveau(x) niveau(x), export {export or "—"}, modèle {modele}')
    try:
        # B d'abord si l'éditeur est déjà ouvert et qu'il y a à construire : on profite de lui
        if not a.sans_unreal and editeur_ouvert(ch) and (export or ch.niveaux({'carte_ok'})):
            hw.phase_unreal(); construire_tout(ch, export); export = []
        # A : nouvelles fiches
        premier = max([ch.p['chaine']['premier_nouveau_niveau'] - 1] + ch.niveaux({'carte_ok', 'controle_ok', 'controle_ko', 'construit', 'echec'})) + 1
        refaire = [n for morceau in (a.refaire or '').split(',') if morceau for n in plage(morceau)]
        if a.monstres:
            hw.phase_modele(modele)
            for morceau in a.monstres.split(','):
                role, _, intro = morceau.partition(':')
                try:
                    car = nouveau_monstre(ch, f'monstre_{role}', modele, a.idee_monstre, role=role, intro=int(intro or 1))
                    if car:
                        (ch.dossier / 'monstres_a_importer').write_text(car, encoding='utf-8')
                        ch.note(f'monstre {role} : « {car} » prêt (présenté au niveau {intro})')
                except Exception as e:
                    ch.note(f'monstre {role} : échec {type(e).__name__} : {e}'); traceback.print_exc()
        if a.niveaux or refaire:
            hw.phase_modele(modele)
            for k, n in enumerate(refaire + list(range(premier, premier + a.niveaux))):
                try:
                    car = None
                    if a.monstre_tous and k % a.monstre_tous == 0:
                        car = nouveau_monstre(ch, n, modele, a.idee_monstre)
                        if car:
                            (ch.dossier / 'monstres_a_importer').write_text(car, encoding='utf-8')
                    ecrire_niveau(ch, n, modele, a.theme, car)
                except Exception as e:
                    ch.poser_etat(n, 'echec', f'{type(e).__name__} : {e}'); traceback.print_exc()
        # B puis C, autant de tours que permis
        for tour in range(ch.p['chaine']['tours_correction'] + 1):
            if a.sans_unreal or not (export or ch.niveaux({'carte_ok'})):
                break
            hw.phase_unreal(); construire_tout(ch, export); export = []
            ko = [n for n in ch.niveaux({'controle_ko'}) if ch.etat(n)['corrections'] < ch.p['chaine']['tours_correction']
                  and ch.etat(n).get('source') != 'export']
            if not ko:
                break
            hw.phase_modele(modele)
            for n in ko:
                try:
                    corriger_niveau(ch, n, modele)
                except Exception as e:
                    ch.poser_etat(n, 'echec', f'{type(e).__name__} : {e}')
    finally:
        hw.fin()
    bilan = {s: ch.niveaux({s}) for s in ('controle_ok', 'controle_ko', 'carte_ok', 'echec')}
    ch.note('=== fin : ' + ' | '.join(f'{s} : {", ".join(f"E{n}" for n in v) or "—"}' for s, v in bilan.items()))


if __name__ == '__main__':
    main()
