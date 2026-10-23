"""Aides pour fabriquer des Blueprints par le serveur MCP (BlueprintTools : variables, événements, logique en DSL).

    import bp
    bp.var(chemin, 'PV', 'float') ; bp.dsl(chemin, 'EventGraph', code) ; bp.types(chemin, 'Atan2')
"""
import json, sys
sys.path.insert(0, r'C:\workspace IA\Unreal\outils')
import ue

BT = 'editor_toolset.toolsets.blueprint.BlueprintTools'
_pret = False


def _init():
    global _pret
    if not _pret:
        ue.init(); _pret = True


def ref(chemin, graphe=None):
    nom = chemin.rsplit('/', 1)[1]
    return {'refPath': f'{chemin}.{nom}' + (f':{graphe}' if graphe else '')}


def outil(nom, args):
    _init()
    return ue.rv(ue.tool(BT, nom, args))


def var(chemin, nom, type_, conteneur=None):
    a = {'blueprint': ref(chemin), 'name': nom, 'type_name': type_}
    if conteneur:
        a['container_type'] = conteneur
    return outil('add_variable', a)


def var_objet(chemin, nom, classe):
    return outil('add_object_variable', {'blueprint': ref(chemin), 'name': nom, 'object_class': {'refPath': classe}})


def variables(chemin):
    return outil('list_variables', {'blueprint': ref(chemin)})


def evenement(chemin, nom):
    return outil('add_event', {'blueprint': ref(chemin), 'event_name': nom})


def fonction(chemin, nom):
    return outil('add_function_graph', {'blueprint': ref(chemin), 'graph_name': nom})


def dsl(chemin, graphe, code):
    """Écrit la logique d'un graphe (le Blueprint est compilé par l'outil). Lève l'erreur du compilateur DSL."""
    _init()
    r = ue.tool(BT, 'write_graph_dsl', {'graph': ref(chemin, graphe), 'code': code})
    if r.startswith('ERREUR'):
        raise RuntimeError(r[:4000])
    return r


def lire(chemin, graphe):
    return outil('read_graph_dsl', {'graph': ref(chemin, graphe)})


def types(chemin, filtre, graphe='EventGraph'):
    return [x['type_id'] if isinstance(x, dict) else x
            for x in outil('find_node_types', {'graph': ref(chemin, graphe), 'type_id_filter': filtre, 'context_pins': []})]


def broches(chemin, type_id, graphe='EventGraph'):
    return outil('get_node_type_pins', {'graph': ref(chemin, graphe), 'type_id': type_id})


def compiler(chemin):
    _init()
    return ue.tool(BT, 'compile_blueprint', {'blueprint': ref(chemin)})


# ---------- messages à l'écran : PrintString disparaît d'une version Shipping. Les .dsl gardent l'écriture PrintString
# (lisible) ; annonces() la remplace au chargement par un appel à l'événement Annoncer du Blueprint, qui passe le message à
# la mémoire de partie (BP_DoomPartie), laquelle l'affiche dans WBP_Message (creer_menus.py).
MESSAGE_VARS = {'string': ['MessageTexte'], 'float': ['MessageR', 'MessageV', 'MessageB', 'MessageDuree']}


def _forme(code, debut):
    """Fin (exclue) de la forme parenthésée qui commence à `debut`, chaînes comprises."""
    prof, i, chaine = 0, debut, False
    while i < len(code):
        c = code[i]
        if chaine:
            chaine = c != '"' or code[i - 1] == '\\'
        elif c == '"':
            chaine = True
        elif c == '(':
            prof += 1
        elif c == ')':
            prof -= 1
            if prof == 0:
                return i + 1
        i += 1
    raise ValueError('parenthèse non fermée')


def _argument(forme, cle):
    """Valeur de `:cle` dans une forme (atome, chaîne ou forme parenthésée)."""
    i = forme.index(f':{cle}') + len(cle) + 1
    while forme[i] in ' \n\t':
        i += 1
    if forme[i] == '(':
        return forme[i:_forme(forme, i)]
    if forme[i] == '"':
        j = i + 1
        while forme[j] != '"' or forme[j - 1] == '\\':
            j += 1
        return forme[i:j + 1]
    j = i
    while forme[j] not in ' \n\t)':
        j += 1
    return forme[i:j]


def annonces(code):
    """Remplace chaque (Development|PrintString :InString … :TextColor (…MakeLinearColor r v b a) :Duration d)."""
    sortie, i = [], 0
    while True:
        j = code.find('(Development|PrintString', i)
        if j < 0:
            return ''.join(sortie) + code[i:]
        fin = _forme(code, j)
        forme = code[j:fin]
        r, v, b = _argument(forme, 'TextColor').split()[1:4]
        sortie.append(code[i:j] + (f'(Variables|Default|SetMessageTexte {_argument(forme, "InString")}) '
                                   f'(Variables|Default|SetMessageR {r}) (Variables|Default|SetMessageV {v}) '
                                   f'(Variables|Default|SetMessageB {b}) '
                                   f'(Variables|Default|SetMessageDuree {_argument(forme, "Duration")}) (CallFunction|Annoncer)'))
        i = fin


def annonceur(chemin, relais=True):
    """Variables et événement Annoncer d'un Blueprint qui affiche des messages ; renvoie le DSL du relais vers la
    mémoire de partie (à ajouter au graphe), sauf pour la mémoire de partie elle-même (relais=False)."""
    deja = set(variables(chemin))
    for type_, noms in MESSAGE_VARS.items():
        for n in noms:
            if n not in deja:
                var(chemin, n, type_)
    evenement(chemin, 'Annoncer')
    if not relais:
        return ''
    pose = '\n'.join(f'      (Class|BPDoomPartie|Set{n} :self partie :{n} (Variables|Default|Get{n}))'
                     for noms in MESSAGE_VARS.values() for n in noms)
    return f'''

; message à l'écran : passé à la mémoire de partie, qui l'affiche (WBP_Message ; PrintString n'existe pas en Shipping)
(event Custom|Annoncer
  (bind partie (Utilities|Casting|CastToBP_DoomPartie :Object (Game|GetGameInstance))
    (:then
{pose}
      (Class|BPDoomPartie|Annoncer :self partie))
    (:CastFailed)))
'''


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    if sys.argv[1] == 'types':
        print('\n'.join(types(sys.argv[2], sys.argv[3])))
    elif sys.argv[1] == 'broches':
        print(json.dumps(broches(sys.argv[2], sys.argv[3]), ensure_ascii=False, indent=1))
