"""Dialogue avec le modèle local (LM Studio) : chargement/déchargement, demande d'une fiche JSON conforme à un schéma,
relance avec le rapport d'erreurs. Commun à tous les jeux.

    python modele.py etat                 (serveur joignable ? modèle chargé ?)
    python modele.py charger [modele]     (lms load ; modèle par défaut : profil.chaine.modele)
    python modele.py decharger            (lms unload --all : libère la mémoire avant Unreal)

La sortie est contrainte par le schéma (response_format json_schema de LM Studio) : le modèle ne peut pas écrire autre
chose qu'un JSON de la bonne forme. Si le serveur refuse le schéma, on retombe sur une demande libre + extraction.
"""
import json, os, re, shutil, subprocess, sys, time, urllib.error, urllib.request
from pathlib import Path

API = os.environ.get('LMSTUDIO_API', 'http://localhost:1234')
LMS = shutil.which('lms') or str(Path.home() / '.lmstudio' / 'bin' / 'lms.exe')
METHODE = Path(__file__).resolve().parent.parent
INACTIVITE, DELAI_TOTAL = 180, 20 * 60


def _http(url, corps=None, delai=30):
    req = urllib.request.Request(url, data=json.dumps(corps).encode() if corps is not None else None,
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=delai) as r:
        return json.loads(r.read().decode('utf-8'))


def lms(*args, delai=600):
    r = subprocess.run([LMS, *args], capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=delai)
    return r.returncode, (r.stdout or '') + (r.stderr or '')


def serveur_pret():
    try:
        _http(API + '/v1/models', delai=5)
        return True
    except Exception:
        return False


def modele_charge():
    try:
        for m in _http(API + '/api/v0/models', delai=10).get('data', []):
            if m.get('state') == 'loaded' and m.get('type', 'llm') in ('llm', 'vlm'):
                return m['id']
    except Exception:
        pass
    return None


def charger(modele, contexte=16384):
    """Démarre le serveur au besoin et charge le modèle (seul : les autres sont déchargés)."""
    if not serveur_pret():
        lms('server', 'start', delai=120)
        for _ in range(30):
            if serveur_pret():
                break
            time.sleep(2)
    if modele_charge() == modele:
        return modele
    lms('unload', '--all')
    # --identifier : l'API connaît le modèle sous la même clé que lms (sinon « qwen3.8-27b » au lieu de « …@q3_k_xl »)
    code, sortie = lms('load', modele, '--identifier', modele, '--context-length', str(contexte), '-y')
    if code:
        raise RuntimeError(f'lms load {modele} a échoué : {sortie.strip()[-400:]}')
    return modele


def decharger():
    if serveur_pret():
        lms('unload', '--all')


def _flux(corps):
    req = urllib.request.Request(API + '/v1/chat/completions', data=json.dumps(corps).encode(),
                                 headers={'Content-Type': 'application/json'})
    t0, morceaux, fin = time.time(), [], None
    with urllib.request.urlopen(req, timeout=INACTIVITE) as r:
        for ligne in r:
            ligne = ligne.decode('utf-8', 'replace').strip()
            if not ligne.startswith('data:'):
                continue
            d = ligne[5:].strip()
            if d == '[DONE]':
                break
            ch = json.loads(d)['choices'][0]
            if (ch.get('delta') or {}).get('content'):
                morceaux.append(ch['delta']['content'])
            fin = ch.get('finish_reason') or fin
            if time.time() - t0 > DELAI_TOTAL:
                raise TimeoutError(f'plus de {DELAI_TOTAL // 60} min')
    return ''.join(morceaux), fin, time.time() - t0


def _pour_grammaire(s):
    """Schéma accepté par la grammaire de LM Studio : on retire les mots-clés d'annotation."""
    if isinstance(s, dict):
        return {k: ({n: _pour_grammaire(x) for n, x in v.items()} if k == 'properties' else _pour_grammaire(v))
                for k, v in s.items() if k not in ('$schema', '$id', 'title', 'description', 'default')}
    if isinstance(s, list):
        return [_pour_grammaire(x) for x in s]
    return s


def extraire_json(texte):
    texte = re.sub(r'<think>.*?</think>', '', texte, flags=re.S)
    a, b = texte.find('{'), texte.rfind('}')
    if a < 0 or b < a:
        raise ValueError('aucun objet JSON dans la réponse')
    return json.loads(texte[a:b + 1])


def demander_json(modele, messages, schema=None, temperature=0.5, max_tokens=8000, journal=print):
    corps = {'model': modele, 'messages': messages, 'stream': True, 'temperature': temperature, 'top_p': 0.8,
             'max_tokens': max_tokens, 'chat_template_kwargs': {'enable_thinking': False}}
    if schema:
        corps['response_format'] = {'type': 'json_schema',
                                    'json_schema': {'name': 'fiche', 'strict': True, 'schema': _pour_grammaire(schema)}}
    texte, fin, duree = '', None, 0
    for _ in range(3):
        try:
            texte, fin, duree = _flux(corps)
            break
        except urllib.error.HTTPError as e:
            msg = e.read().decode('utf-8', 'replace')[:300]
            if e.code == 400 and 'chat_template_kwargs' in corps:
                corps.pop('chat_template_kwargs'); continue
            if e.code == 400 and 'response_format' in corps:
                journal(f'  schéma refusé par le serveur ({msg}) : demande libre')
                corps.pop('response_format'); continue
            raise
    journal(f'  réponse en {duree:.0f} s ({len(texte)} car.)' + (' — COUPÉE (longueur)' if fin == 'length' else ''))
    return extraire_json(texte), texte


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'etat'
    if cmd == 'etat':
        print('serveur', 'joignable' if serveur_pret() else 'absent', '— modèle chargé :', modele_charge())
    elif cmd == 'charger':
        m = sys.argv[2] if len(sys.argv) > 2 else json.loads((METHODE.parent / 'Doom' / 'profil' / 'jeu.json').read_text(encoding='utf-8'))['chaine']['modele']
        print('chargé :', charger(m))
    elif cmd == 'decharger':
        decharger(); print('modèles déchargés')
