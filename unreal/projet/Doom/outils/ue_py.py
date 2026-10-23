"""Exécute un script Python dans l'éditeur Unreal ouvert (Python Remote Execution, API `unreal` complète).

    python ue_py.py <script.py> [NOM=valeur ...]     les NOM=valeur deviennent des variables du script
    python ue_py.py -c "<code>"

Prérequis (déjà réglés dans le projet Doom) : extension PythonScriptPlugin, bRemoteExecution=True dans DefaultEngine.ini.
"""
import os, sys, tempfile, time
sys.path.insert(0, r'C:\Program Files\Epic Games\UE_5.8\Engine\Plugins\Experimental\PythonScriptPlugin\Content\Python')
import remote_execution as rx


def executer(code, delai=30, silencieux=False):
    """0 si le code a tourné sans erreur ; silencieux : rien n'est affiché (sondes répétées)."""
    cfg = rx.RemoteExecutionConfig()
    cfg.multicast_bind_address = '127.0.0.1'
    r = rx.RemoteExecution(cfg)
    r.start()
    try:
        fin = time.time() + delai
        while not r.remote_nodes:
            if time.time() > fin:
                raise SystemExit('Aucun éditeur Unreal ne répond (éditeur fermé, ou Remote Execution désactivé).')
            time.sleep(0.2)
        r.open_command_connection(r.remote_nodes[0])
        # le code passe par un fichier : « ExecuteFile » prend un texte de plusieurs lignes pour un chemin
        tmp = os.path.join(tempfile.gettempdir(), 'ue_py_commande.py')
        with open(tmp, 'w', encoding='utf-8') as f:
            f.write(code)
        res = r.run_command(tmp, unattended=True, exec_mode=rx.MODE_EXEC_FILE)
        for o in res.get('output', []) if not silencieux else []:
            print(o.get('output', '').rstrip())
        if not res.get('success'):
            if not silencieux:
                print('ÉCHEC :', res.get('result'))
            return 1
        return 0
    finally:
        r.stop()


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    if sys.argv[1] == '-c':
        code = sys.argv[2]
    else:
        params = ''.join(f'{k}={v!r}\n' for k, v in (a.split('=', 1) for a in sys.argv[2:]))
        code = params + open(sys.argv[1], encoding='utf-8').read()
    sys.exit(executer(code))
