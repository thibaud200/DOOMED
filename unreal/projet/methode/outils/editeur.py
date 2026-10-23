"""Éditeur de niveaux à la main (comme l'éditeur du jeu HTML), pour les niveaux construits dans Unreal.

    python editeur.py [--profil jeu.json] [--port 8770]       (ou Doom\\Editeur_niveaux.bat) → ouvre le navigateur

Une page locale : choisir un niveau, peindre sa grille, la contrôler (et réparer), l'enregistrer, puis la faire
construire dans Unreal (construction, contrôle en jeu, photos). Commun à tous les jeux : légende, couleurs et commandes
viennent du profil. L'ancienne grille est gardée dans <fiches>\\E<n>\\historique\\ à chaque enregistrement.
"""
import json, re, sys, threading, time, traceback, webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI)); sys.path.insert(0, str(ICI.parent))
import fiches as F

ARGS = sys.argv[1:]
PROFIL_CHEMIN = ARGS[ARGS.index('--profil') + 1] if '--profil' in ARGS else None
PORT = int(ARGS[ARGS.index('--port') + 1]) if '--port' in ARGS else 8770
TACHE = {'etat': 'libre', 'journal': [], 'debut': None}
VERROU = threading.Lock()


def profil():
    return F.charger_profil(PROFIL_CHEMIN)


def dossier(p):
    return Path(p['chaine']['racine']) / p['chaine']['fiches']


def export(p):
    src = p.get('construction', {}).get('source_cartes')
    return json.loads(Path(src).read_text(encoding='utf-8'))['niveaux'] if src else []


def lire_niveau(p, n):
    d = dossier(p) / f'E{n}'
    if (d / 'carte.json').exists():
        return F.lire(d / 'carte.json')
    ex = export(p)
    if 1 <= n <= len(ex):
        return {'niveau': n, 'nom': ex[n - 1]['name'], 'style': 'scifi', 'sky': bool(ex[n - 1].get('sky')),
                'angle': ex[n - 1].get('angle', 0), 'rows': ex[n - 1]['rows']}
    return None


def liste(p):
    d = dossier(p)
    nums = sorted({int(x.name[1:]) for x in d.glob('E*') if x.name[1:].isdigit() and (x / 'carte.json').exists()}
                  | set(range(1, len(export(p)) + 1)))
    out = []
    for n in nums:
        c = lire_niveau(p, n)
        e = F.lire(d / f'E{n}' / 'etat.json') if (d / f'E{n}' / 'etat.json').exists() else {}
        if c:
            out.append({'n': n, 'nom': c['nom'], 'statut': e.get('statut', '—'),
                        'couloirs': round(100 * F.part_couloirs(F.Grille(c['rows'], p)))})
    return out


def construire_en_fond(n):
    """Construit dans Unreal les niveaux enregistrés (dont n) : enchaîneur, phase Unreal seule."""
    import enchainer as E
    TACHE.update(etat='en cours', journal=[f'E{n} : construction demandée'], debut=time.time())
    try:
        ch = E.Chantier(PROFIL_CHEMIN or (ICI.parent.parent / 'Doom' / 'profil' / 'jeu.json'))
        note0 = ch.note
        ch.note = lambda m: (TACHE['journal'].append(m), note0(m))
        hw = E.Materiel(ch, fermer_editeur=False)
        hw.phase_unreal()
        E.construire_tout(ch, [])
        r = F.lire(ch.niv(n) / 'rapport.json') if (ch.niv(n) / 'rapport.json').exists() else {}
        TACHE['journal'].append('terminé : ' + ('niveau jouable ✔' if r.get('ok') else 'à revoir — ' + '; '.join(r.get('erreurs', []))))
        TACHE['etat'] = 'fini'
    except Exception as e:
        TACHE['journal'].append(f'échec : {type(e).__name__} : {e}')
        TACHE['etat'] = 'échec'
        traceback.print_exc()


class Appli(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def envoyer(self, code, corps, type_='application/json; charset=utf-8'):
        b = corps if isinstance(corps, bytes) else (json.dumps(corps, ensure_ascii=False) if not isinstance(corps, str) else corps).encode('utf-8')
        self.send_response(code); self.send_header('Content-Type', type_); self.send_header('Cache-Control', 'no-store')
        self.end_headers(); self.wfile.write(b)

    def corps(self):
        return json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))) or b'{}')

    def do_GET(self):
        p = profil()
        u = self.path.split('?')[0]
        if u in ('/', '/index.html'):
            return self.envoyer(200, (ICI / 'editeur.html').read_text(encoding='utf-8'), 'text/html; charset=utf-8')
        if u == '/api/profil':
            return self.envoyer(200, {'jeu': p.get('jeu'), 'legende': p['carte']['legende'], 'categories': p['carte']['categories'],
                                      'taille_max': p['carte']['taille_max']})
        if u == '/api/niveaux':
            return self.envoyer(200, liste(p))
        m = re.match(r'^/api/niveau/(\d+)$', u)
        if m:
            n = int(m.group(1)); c = lire_niveau(p, n)
            if not c:
                return self.envoyer(404, {'erreur': 'niveau inconnu'})
            d = dossier(p) / f'E{n}'
            photos = [f'/photos/{n}/{q}.jpg' for q in ('dessus', 'salle', 'depart', 'sortie') if (d / 'photos' / f'{q}.jpg').exists()]
            plan = F.lire(d / 'plan.json') if (d / 'plan.json').exists() else None
            return self.envoyer(200, {'carte': c, 'photos': photos, 'theme': (plan or {}).get('theme', '')})
        m = re.match(r'^/photos/(\d+)/(\w+)\.jpg$', u)
        if m:
            f = dossier(p) / f'E{m.group(1)}' / 'photos' / f'{m.group(2)}.jpg'
            return self.envoyer(200, f.read_bytes(), 'image/jpeg') if f.exists() else self.envoyer(404, {})
        if u == '/api/tache':
            return self.envoyer(200, TACHE)
        self.envoyer(404, {'erreur': u})

    def do_POST(self):
        p = profil()
        u = self.path
        b = self.corps()
        if u == '/api/valider':
            e, a = F.valider_carte({'niveau': 1, 'nom': 'x', 'rows': b['rows']}, p)
            G = F.Grille(b['rows'], p)
            return self.envoyer(200, {'erreurs': e, 'alertes': a, 'couloirs': round(100 * F.part_couloirs(G))})
        if u == '/api/reparer':
            c, notes = F.reparer_carte({'niveau': 1, 'nom': 'x', 'rows': b['rows']}, p)
            return self.envoyer(200, {'rows': c['rows'], 'notes': notes})
        m = re.match(r'^/api/enregistrer/(\d+)$', u)
        if m:
            n = int(m.group(1)); d = dossier(p) / f'E{n}'
            ancienne = lire_niveau(p, n)
            if not ancienne:
                return self.envoyer(404, {'erreur': 'niveau inconnu'})
            e, _ = F.valider_carte(ancienne | {'rows': b['rows']}, p)
            if e and not b.get('forcer'):
                return self.envoyer(409, {'erreurs': e})
            d.mkdir(parents=True, exist_ok=True)
            if (d / 'carte.json').exists():                      # l'ancienne version est gardée
                F.ecrire(d / 'historique' / time.strftime('carte_%Y%m%d_%H%M%S.json'), F.lire(d / 'carte.json'))
            F.ecrire(d / 'carte.json', ancienne | {'rows': b['rows'], 'sky': bool(b.get('sky', ancienne.get('sky')))})
            etat = F.lire(d / 'etat.json') if (d / 'etat.json').exists() else {'numero': n, 'historique': [], 'corrections': 0}
            etat['statut'] = 'carte_ok'
            etat['historique'].append(time.strftime('%d/%m %H:%M') + ' carte_ok : retouche à la main (éditeur)')
            F.ecrire(d / 'etat.json', etat)
            return self.envoyer(200, {'ok': True})
        m = re.match(r'^/api/construire/(\d+)$', u)
        if m:
            with VERROU:
                if TACHE['etat'] == 'en cours':
                    return self.envoyer(409, {'erreur': 'une construction tourne déjà'})
                threading.Thread(target=construire_en_fond, args=(int(m.group(1)),), daemon=True).start()
            return self.envoyer(200, {'ok': True})
        self.envoyer(404, {'erreur': u})


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    serveur = ThreadingHTTPServer(('127.0.0.1', PORT), Appli)
    url = f'http://127.0.0.1:{PORT}/'
    print(f'Éditeur de niveaux : {url}  (Ctrl+C pour arrêter)')
    if '--sans-navigateur' not in ARGS:
        webbrowser.open(url)
    serveur.serve_forever()
