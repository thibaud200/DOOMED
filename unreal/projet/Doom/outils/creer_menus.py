"""Menus et sauvegarde de DOOMED : menu de démarrage (carte Menu), menu pause (Échap ou P), 5 emplacements de sauvegarde.

    python creer_menus.py          (éditeur ouvert ; relancer met à jour sans doublon)

Une sauvegarde garde le niveau, son nom affiché, les PV et les armes : charger relance ce niveau depuis son début avec
cet équipement (comme le passage d'un niveau au suivant). Pièces :
  BP_DoomSauvegarde (SaveGame)  · BP_DoomPartie (instance de jeu : Sauvegarder, Charger, NouvellePartie)
  WBP_Menu (démarrage) · WBP_Pause · BP_DoomMenuDemarrage (posé dans la carte Menu) · IA_Pause (Échap, P)
"""
import sys
from pathlib import Path
ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI))
import bp
import ecrans as E
from ue_py import executer

DOOM = '/Game/DOOMED'
UI = f'{DOOM}/UI'
SAUVE, PARTIE = f'{DOOM}/BP_DoomSauvegarde', f'{DOOM}/BP_DoomPartie'
MENU, PAUSE, MESSAGE = f'{UI}/WBP_Menu', f'{UI}/WBP_Pause', f'{UI}/WBP_Message'
DEMARRAGE = f'{UI}/BP_DoomMenuDemarrage'
CARTE_MENU = f'{DOOM}/Cartes/Menu'
PREMIER = 'E1_Hangar'
N = 5
EMP = lambda i: f'(Utilities|String|Append "emplacement_" (Utilities|String|ToString(Integer) {i}))'


def blueprint(chemin, parent):
    assert executer(f'''import unreal
p = "{chemin}"
b = unreal.load_asset(p) if unreal.EditorAssetLibrary.does_asset_exist(p) else \\
    unreal.BlueprintEditorLibrary.create_blueprint_asset_with_parent(p, {parent})
unreal.BlueprintEditorLibrary.compile_blueprint(b); unreal.EditorAssetLibrary.save_asset(p)
''') == 0


def variables(chemin, spec):
    deja = set(bp.variables(chemin))
    for type_, noms in spec.items():
        for n in noms:
            if n not in deja:
                bp.var(chemin, n, type_)


# ---------------------------------------------------------------- sauvegarde et mémoire de partie
def partie():
    blueprint(SAUVE, 'unreal.SaveGame')
    variables(SAUVE, {'string': ['Niveau', 'Libelle'], 'float': ['PV'], 'bool': ['Pistolet', 'Fusil', 'Lance']})
    bp.compiler(SAUVE)
    variables(PARTIE, {'int': ['Emplacement'], 'string': ['LibelleNiveau']})
    for ev in ('Sauvegarder', 'Charger', 'NouvellePartie', 'NouvelEcran'):
        bp.evenement(PARTIE, ev)
    # messages à l'écran de tout le jeu (bp.annonces) : la mémoire de partie tient l'écran WBP_Message
    bp.annonceur(PARTIE, relais=False)
    ecran_message()
    if 'MessageEcran' not in set(bp.variables(PARTIE)):
        bp.var_objet(PARTIE, 'MessageEcran', f'{MESSAGE}.WBP_Message_C')
    arme = lambda nom, var: (f'''            (if (Utilities|String|Contains :SearchIn (Utilities|GetDisplayName :Object w) :Substring "{nom}")
              (Class|BPDoomSauvegarde|Set{var} :self sv :{var} true))''')
    bp.dsl(PARTIE, 'EventGraph', bp.annonces(f'''
; sauvegarde dans l'emplacement Emplacement : niveau en cours, son nom affiché, PV et armes du joueur
(event Custom|Sauvegarder
  (bind sv (Utilities|Casting|CastToBP_DoomSauvegarde
             :Object (SaveGame|CreateSaveGameObject :SaveGameClass "{SAUVE}.BP_DoomSauvegarde_C"))
    (:then
      (Class|BPDoomSauvegarde|SetNiveau :self sv :Niveau (Game|GetCurrentLevelName))
      (bind perso (Utilities|Casting|CastToBP_ShooterCharacter :Object (Game|GetPlayerCharacter 0))
        (:then
          (Class|BPDoomSauvegarde|SetPV :self sv :PV (Class|BPShooterCharacter|GetCurrentHP :self perso))
          (for w (Class|BPShooterCharacter|GetOwnedWeapons :self perso)
{arme("Pistol", "Pistolet")}
{arme("Rifle", "Fusil")}
{arme("Grenade", "Lance")})
          (Class|BPDoomSauvegarde|SetLibelle :self sv :Libelle
            (Utilities|String|Append (Variables|Default|GetLibelleNiveau)
              (Utilities|String|Append "  ·  " (Utilities|String|Append
                (Utilities|String|ToString(Integer) (Math|Float|Floor (Class|BPShooterCharacter|GetCurrentHP :self perso))) " PV"))))
          (SaveGame|SaveGametoSlot :SaveGameObject sv :SlotName {EMP('(Variables|Default|GetEmplacement)')} :UserIndex 0)
          (Development|PrintString :InString "Partie sauvegardée" :TextColor (Utilities|Struct|MakeLinearColor 0.4 1.0 0.4 1.0) :Duration 2.0))
        (:CastFailed)))
    (:CastFailed)))

; chargement : l'équipement passe par la mémoire de partie (comme d'un niveau au suivant), puis le niveau sauvegardé
(event Custom|Charger
  (bind sv (Utilities|Casting|CastToBP_DoomSauvegarde
             :Object (SaveGame|LoadGamefromSlot :SlotName {EMP('(Variables|Default|GetEmplacement)')} :UserIndex 0))
    (:then
      (Variables|Default|SetPV (Class|BPDoomSauvegarde|GetPV :self sv))
      (Variables|Default|SetPistolet (Class|BPDoomSauvegarde|GetPistolet :self sv))
      (Variables|Default|SetFusil (Class|BPDoomSauvegarde|GetFusil :self sv))
      (Variables|Default|SetLance (Class|BPDoomSauvegarde|GetLance :self sv))
      (Variables|Default|SetTransmis true)
      (Game|SetGamePaused :bPaused false)
      (Game|OpenLevel(byName) :LevelName (Class|BPDoomSauvegarde|GetNiveau :self sv)))
    (:CastFailed)))

(event Custom|NouvellePartie
  (Variables|Default|SetTransmis false)
  (Variables|Default|SetPistolet false)
  (Variables|Default|SetFusil false)
  (Variables|Default|SetLance false)
  (Game|SetGamePaused :bPaused false)
  (Game|OpenLevel(byName) :LevelName "{PREMIER}"))

; message à l'écran (texte, couleur, durée posés dans les variables Message…) : l'écran est refait après un changement
; de niveau, qui retire les écrans de la vue
(event Custom|Annoncer
  (Utilities|IsValid (Variables|Default|GetMessageEcran)
    (:"Is Valid"
      (if (Appearance|IsinViewport :self (Variables|Default|GetMessageEcran))
        (Class|WBPMessage|Afficher :self (Variables|Default|GetMessageEcran))
        (else (CallFunction|NouvelEcran))))
    (:"Is Not Valid" (CallFunction|NouvelEcran))))

(event Custom|NouvelEcran
  (bind ecran (UserInterface|CreateWidget :Class "{MESSAGE}.WBP_Message_C" :OwningPlayer (Game|GetPlayerController 0)))
  (Variables|Default|SetMessageEcran ecran)
  (UserInterface|Viewport|AddtoViewport :self ecran :ZOrder 5)
  (Class|WBPMessage|Afficher :self ecran))
'''))
    bp.compiler(PARTIE)


def ecran_message():
    """Message en haut de l'écran (clés, secrets, bonus, bilan, sauvegarde), effacé après sa durée ; ne capte pas la souris."""
    wbp = E.ecran(UI, 'WBP_Message', recreer=True)
    racine = E.ajouter(wbp, 'Border', 'Fond')
    E.regler(racine, '''w.set_editor_property("brush_color", unreal.LinearColor(0, 0, 0, 0))
w.set_editor_property("horizontal_alignment", unreal.HorizontalAlignment.H_ALIGN_CENTER)
w.set_editor_property("vertical_alignment", unreal.VerticalAlignment.V_ALIGN_TOP)
w.set_editor_property("padding", unreal.Margin(0, 140, 0, 0))
w.set_editor_property("visibility", unreal.SlateVisibility.HIT_TEST_INVISIBLE)''')
    t = texte(wbp, racine, 'Texte', '', 30)
    E.regler(t, 'w.set_editor_property("shadow_offset", unreal.Vector2D(2, 2))\n'
                'w.set_editor_property("shadow_color_and_opacity", unreal.LinearColor(0, 0, 0, 0.9))')
    E.variable(wbp, t)
    E.compiler(wbp)
    bp.evenement(MESSAGE, 'Afficher')
    texte_vide = '(Widget|SetText(Text) :self (Variables|WBP_Message|GetTexte) :InText (Utilities|Text|ToText(String) ""))'
    bp.dsl(MESSAGE, 'EventGraph', f'''
; affiche le message posé dans la mémoire de partie ; un nouveau message relance le délai (RetriggerableDelay)
(event Custom|Afficher
  (bind partie (Utilities|Casting|CastToBP_DoomPartie :Object (Game|GetGameInstance))
    (:then
      (Widget|SetText(Text) :self (Variables|WBP_Message|GetTexte)
        :InText (Utilities|Text|ToText(String) (Class|BPDoomPartie|GetMessageTexte :self partie)))
      (Class|Text|SetColorandOpacity :self (Variables|WBP_Message|GetTexte)
        :ColorAndOpacity (Utilities|Struct|MakeSlateColor :SpecifiedColor (Utilities|Struct|MakeLinearColor
          (Class|BPDoomPartie|GetMessageR :self partie) (Class|BPDoomPartie|GetMessageV :self partie)
          (Class|BPDoomPartie|GetMessageB :self partie) 1.0)))
      (Utilities|FlowControl|RetriggerableDelay :Duration (Class|BPDoomPartie|GetMessageDuree :self partie))
      {texte_vide})
    (:CastFailed)))
''')


# ---------------------------------------------------------------- écrans
ROUGE, OR, GRIS = (0.85, 0.12, 0.08, 1), (1.0, 0.8, 0.3, 1), (0.7, 0.7, 0.7, 1)


def texte(wbp, parent, nom, mot, taille, couleur=(1, 1, 1, 1)):
    t = E.ajouter(wbp, 'TextBlock', nom, parent)
    E.regler(t, f'''w.set_editor_property("text", unreal.Text("{mot}"))
f = w.get_editor_property("font"); f.size = {taille}; w.set_editor_property("font", f)
w.set_editor_property("color_and_opacity", unreal.SlateColor(unreal.LinearColor({couleur[0]}, {couleur[1]}, {couleur[2]}, {couleur[3]})))
w.set_editor_property("justification", unreal.TextJustify.CENTER)''')
    return t


def bouton(wbp, parent, nom, mot, taille=24, nom_texte=None):
    b = E.ajouter(wbp, 'Button', nom, parent)
    E.regler(b, '''w.set_editor_property("background_color", unreal.LinearColor(0.35, 0.05, 0.03, 0.9))
s = w.slot
s.set_padding(unreal.Margin(0, 5, 0, 5))''')
    t = texte(wbp, b, nom_texte or f'Texte{nom}', mot, taille)
    E.variable(wbp, b)
    if nom_texte:
        E.variable(wbp, t)
    E.sur_clic(wbp, nom)
    return b


def colonne(wbp, parent, nom):
    v = E.ajouter(wbp, 'VerticalBox', nom, parent)
    return v


def fond(wbp, opacite):
    """Fond plein écran, contenu centré."""
    racine = E.ajouter(wbp, 'Border', 'Fond')
    E.regler(racine, f'''w.set_editor_property("brush_color", unreal.LinearColor(0.02, 0.0, 0.0, {opacite}))
w.set_editor_property("horizontal_alignment", unreal.HorizontalAlignment.H_ALIGN_CENTER)
w.set_editor_property("vertical_alignment", unreal.VerticalAlignment.V_ALIGN_CENTER)''')
    return racine


def maj_emplacements(prefixes, ecran_nom):
    """Un événement MajN par emplacement (le texte de ses boutons : nom du niveau et PV, ou « vide ») : un par événement,
    car rien ne peut suivre une conversion de type dans une même suite d'actions."""
    blocs = []
    for i in range(1, N + 1):
        poser = '\n'.join(f'''        (Widget|SetText(Text) :self (Variables|{ecran_nom}|Get{p}{i}) :InText
          (Utilities|Text|ToText(String) (Utilities|String|Append "{i} — " (Class|BPDoomSauvegarde|GetLibelle :self sv))))''' for p in prefixes)
        vide = '\n'.join(f'''      (Widget|SetText(Text) :self (Variables|{ecran_nom}|Get{p}{i}) :InText (Utilities|Text|ToText(String) "{i} — vide"))''' for p in prefixes)
        blocs.append(f'''(event Custom|Maj{i}
  (if (SaveGame|DoesSaveGameExist :SlotName {EMP(i)} :UserIndex 0)
    (bind sv (Utilities|Casting|CastToBP_DoomSauvegarde :Object (SaveGame|LoadGamefromSlot :SlotName {EMP(i)} :UserIndex 0))
      (:then
{poser})
      (:CastFailed))
    (else
{vide})))''')
    return '\n\n'.join(blocs)


def charger_bouton(nom, i):
    return f'''(event OnClicked({nom}{i})
  (if (SaveGame|DoesSaveGameExist :SlotName {EMP(i)} :UserIndex 0)
    (bind partie (Utilities|Casting|CastToBP_DoomPartie :Object (Game|GetGameInstance))
      (:then
        (Class|BPDoomPartie|SetEmplacement :self partie :Emplacement {i})
        (Class|BPDoomPartie|Charger :self partie))
      (:CastFailed))))'''


def ecran_menu():
    wbp = E.ecran(UI, 'WBP_Menu', recreer=True)
    racine = fond(wbp, 0.92)
    col = colonne(wbp, racine, 'Colonne')
    texte(wbp, col, 'Titre', 'DOOMED', 96, ROUGE)
    texte(wbp, col, 'SousTitre', 'Campagne en 95 niveaux', 20, GRIS)
    bouton(wbp, col, 'BtnNouvelle', 'NOUVELLE PARTIE', 30)
    texte(wbp, col, 'TitreCharger', 'Charger une partie', 22, OR)
    for i in range(1, N + 1):
        bouton(wbp, col, f'BtnCharger{i}', f'{i} — vide', 20, nom_texte=f'TexteCharger{i}')
    bouton(wbp, col, 'BtnQuitter', 'QUITTER', 24)
    for i in range(1, N + 1):
        bp.evenement(wbp.split('.')[0], f'Maj{i}')
    graphe = f'''
(event UserInterface|EventConstruct
  {" ".join(f"(CallFunction|Maj{i})" for i in range(1, N + 1))})

(event OnClicked(BtnNouvelle)
  (bind partie (Utilities|Casting|CastToBP_DoomPartie :Object (Game|GetGameInstance))
    (:then (Class|BPDoomPartie|NouvellePartie :self partie))
    (:CastFailed)))

(event OnClicked(BtnQuitter)
  (Game|QuitGame))

{chr(10).join(charger_bouton("BtnCharger", i) for i in range(1, N + 1))}

{maj_emplacements(["TexteCharger"], "WBP_Menu")}
'''
    E.compiler(wbp)                               # les widgets marqués « variable » n'existent qu'après compilation
    bp.dsl(wbp.split('.')[0], 'EventGraph', graphe)
    E.compiler(wbp)


def ecran_pause():
    wbp = E.ecran(UI, 'WBP_Pause', recreer=True)
    racine = fond(wbp, 0.75)
    col = colonne(wbp, racine, 'Colonne')
    texte(wbp, col, 'Titre', 'PAUSE', 64, ROUGE)
    bouton(wbp, col, 'BtnReprendre', 'REPRENDRE', 28)
    lignes = E.ajouter(wbp, 'HorizontalBox', 'Colonnes', col)
    gauche, droite = colonne(wbp, lignes, 'Sauver'), colonne(wbp, lignes, 'Charger')
    E.regler(gauche, 'w.slot.set_padding(unreal.Margin(0, 10, 20, 10))')
    texte(wbp, gauche, 'TitreSauver', 'Sauvegarder', 22, OR)
    texte(wbp, droite, 'TitreCharger', 'Charger', 22, OR)
    for i in range(1, N + 1):
        bouton(wbp, gauche, f'BtnSauver{i}', f'{i} — vide', 18, nom_texte=f'TexteSauver{i}')
        bouton(wbp, droite, f'BtnCharger{i}', f'{i} — vide', 18, nom_texte=f'TexteCharger{i}')
    bouton(wbp, col, 'BtnMenu', 'MENU PRINCIPAL', 22)
    bouton(wbp, col, 'BtnQuitter', 'QUITTER', 22)
    for i in range(1, N + 1):
        bp.evenement(wbp.split('.')[0], f'Maj{i}')
    sauver = '\n'.join(f'''(event OnClicked(BtnSauver{i})
  (bind partie (Utilities|Casting|CastToBP_DoomPartie :Object (Game|GetGameInstance))
    (:then
      (Class|BPDoomPartie|SetEmplacement :self partie :Emplacement {i})
      (Class|BPDoomPartie|Sauvegarder :self partie)
      (CallFunction|Maj{i}))
    (:CastFailed)))''' for i in range(1, N + 1))
    graphe = f'''
(event UserInterface|EventConstruct
  {" ".join(f"(CallFunction|Maj{i})" for i in range(1, N + 1))})

(event OnClicked(BtnReprendre)
  (Game|SetGamePaused :bPaused false)
  (Input|SetInputModeGameOnly :PlayerController (Game|GetPlayerController 0))
  (Class|PlayerController|SetShowMouseCursor :self (Game|GetPlayerController 0) :bShowMouseCursor false)
  (Widget|RemovefromParent))

(event OnClicked(BtnMenu)
  (Game|SetGamePaused :bPaused false)
  (Game|OpenLevel(byName) :LevelName "Menu"))

(event OnClicked(BtnQuitter)
  (Game|QuitGame))

{sauver}

{chr(10).join(charger_bouton("BtnCharger", i) for i in range(1, N + 1))}

{maj_emplacements(["TexteSauver", "TexteCharger"], "WBP_Pause")}
'''
    E.compiler(wbp)                               # les widgets marqués « variable » n'existent qu'après compilation
    bp.dsl(wbp.split('.')[0], 'EventGraph', graphe)
    E.compiler(wbp)


# ---------------------------------------------------------------- carte Menu et touche pause
def demarrage():
    blueprint(DEMARRAGE, 'unreal.Actor')
    bp.dsl(DEMARRAGE, 'EventGraph', f'''
(event EventBeginPlay
  (bind ecran (UserInterface|CreateWidget :Class "{MENU}.WBP_Menu_C" :OwningPlayer (Game|GetPlayerController 0)))
  (UserInterface|Viewport|AddtoViewport :self ecran)
  (Input|SetInputModeUIOnly :PlayerController (Game|GetPlayerController 0))
  (Class|PlayerController|SetShowMouseCursor :self (Game|GetPlayerController 0) :bShowMouseCursor true))
''')
    bp.compiler(DEMARRAGE)
    assert executer(f'''import unreal
LES = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
EAS = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
if unreal.EditorAssetLibrary.does_asset_exist("{CARTE_MENU}"):
    LES.load_level("{CARTE_MENU}")
else:
    LES.new_level("{CARTE_MENU}")
for a in EAS.get_all_level_actors():
    if a.get_actor_label() == "MenuDemarrage":
        EAS.destroy_actor(a)
a = EAS.spawn_actor_from_class(unreal.load_asset("{DEMARRAGE}").generated_class(), unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0))
a.set_actor_label("MenuDemarrage")
ws = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world().get_world_settings()
ws.set_editor_property("default_game_mode", unreal.GameModeBase)
LES.save_current_level()
print("carte Menu prête")
''') == 0


def touche_pause():
    """IA_Pause sur Échap et P (déclenchée même en pause) ; reliée à l'événement Pause de l'arrivée (BP_DoomActionnable)."""
    assert executer('''import unreal
IA, IMC = "/Game/DOOMED/Entrees/IA_Pause", "/Game/Input/IMC_Default"
EAL = unreal.EditorAssetLibrary
ia = unreal.load_asset(IA)
if not ia:
    ia = unreal.AssetToolsHelpers.get_asset_tools().create_asset("IA_Pause", "/Game/DOOMED/Entrees", unreal.InputAction, unreal.InputAction_Factory())
ia.set_editor_property("value_type", unreal.InputActionValueType.BOOLEAN)
ia.set_editor_property("trigger_when_paused", True)
EAL.save_asset(IA)
imc = unreal.load_asset(IMC)
deja = [(m.action, str(m.key.get_editor_property("key_name"))) for m in imc.get_editor_property("default_key_mappings").get_editor_property("mappings")]
for k in ("Escape", "P"):
    if (ia, k) not in deja:
        cle = unreal.Key(); cle.set_editor_property("key_name", k); imc.map_key(ia, cle)
EAL.save_asset(IMC, only_if_is_dirty=False)                 # toujours : voir utiliser.py
print("IA_Pause : Échap, P")
''') == 0


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    partie()
    print('sauvegarde et mémoire de partie : ok')
    ecran_menu(); print('menu de démarrage : ok')
    ecran_pause(); print('menu pause : ok')
    touche_pause()
    demarrage()
