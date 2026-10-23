"""Aides pour fabriquer des écrans (Widget Blueprints UMG) par le serveur MCP (UMGToolSet) et Python d'éditeur.

    import ecrans as E
    wbp = E.ecran('/Game/DOOMED/UI', 'WBP_Menu')
    racine = E.ajouter(wbp, 'Border', 'Fond')
    E.regler(racine, {'brush_color': (0, 0, 0, .85)})

L'outil UMG crée les écrans et les widgets, et branche les événements de boutons ; il ne règle pas les propriétés :
textes, polices, couleurs et placements sont réglés en Python sur les objets du widget (regler, placer).
"""
import json, sys
sys.path.insert(0, r'C:\workspace IA\Unreal\outils')
import ue
from ue_py import executer

UMG = 'UMGToolSet.UMGToolSet'
_pret = False


def _init():
    global _pret
    if not _pret:
        ue.init(); _pret = True


def outil(nom, args):
    _init()
    return ue.rv(ue.tool(UMG, nom, args))


def ecran(dossier, nom, parent='/Script/UMG.UserWidget', recreer=False):
    """Crée l'écran s'il n'existe pas (recreer : l'écran fabriqué par script est refait à neuf) ; renvoie son chemin."""
    chemin = f'{dossier}/{nom}.{nom}'
    if recreer:
        executer('import unreal\n'
                 f'if unreal.EditorAssetLibrary.does_asset_exist("{dossier}/{nom}"):\n'
                 f'    unreal.EditorAssetLibrary.delete_asset("{dossier}/{nom}")', silencieux=True)
    existe = executer(f'import unreal\nassert unreal.EditorAssetLibrary.does_asset_exist("{dossier}/{nom}")', silencieux=True) == 0
    if not existe:
        outil('CreateWidgetBlueprint', {'folderPath': dossier, 'assetName': nom, 'parentClass': {'refPath': parent}})
    return chemin


def ajouter(wbp, classe, nom, parent=None):
    """Ajoute un widget (classe UMG courte : 'Button', 'TextBlock', 'VerticalBox'…) ; renvoie son chemin d'objet."""
    args = {'widgetBlueprint': {'refPath': wbp}, 'widgetClass': {'refPath': f'/Script/UMG.{classe}'}, 'widgetDisplayName': nom}
    if parent:
        args['parentWidget'] = {'refPath': parent}
    r = outil('AddWidget', args)
    w = r.get('widget') or r.get('Widget') or r
    return (w.get('refPath') if isinstance(w, dict) else None) or json.dumps(r)


def variable(wbp, widget, oui=True):
    outil('ToggleWidgetAsVariable', {'widgetBlueprint': {'refPath': wbp}, 'widget': {'refPath': widget}, 'bIsVariable': oui})


def sur_clic(wbp, nom_bouton):
    """Nœud d'événement OnClicked du bouton (variable du même nom) dans le graphe de l'écran."""
    return outil('BindToEventProperty', {'widgetBlueprint': {'refPath': wbp}, 'eventName': 'OnClicked',
                                         'propertyName': nom_bouton, 'propertyClass': {'refPath': '/Script/UMG.Button'}})


def regler(objet, code):
    """Exécute `code` dans l'éditeur avec `w` = l'objet widget (chemin d'objet) ; puis marque l'écran modifié."""
    return executer('import unreal\n'
                    f'w = unreal.find_object(None, "{objet}")\n'
                    'assert w, "widget introuvable"\n' + code + '\nw.modify()\n')


def compiler(wbp):
    return outil('CompileWidgetBlueprint', {'widgetBlueprint': {'refPath': wbp}})


def decrire(wbp):
    return outil('GetWidgetDescription', {'widgetBlueprint': {'refPath': wbp}})
