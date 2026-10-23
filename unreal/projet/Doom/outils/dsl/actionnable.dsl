; BP_DoomActionnable — ce que le joueur déclenche, d'après useAction() du jeu HTML.
; Type 0 : passage secret ($) — avec E ; le mur s'enfonce dans le sol (les panneaux et le cube de collision lui sont attachés).
; Type 1 : interrupteur de sortie (E) — avec E ; « niveau terminé » avec le compte des ennemis, puis la carte Suivant.
; Type 2 : porte verrouillée (R B J, Couleur 1 rouge · 2 bleue · 3 jaune) — s'ouvre seule à l'approche si Deverrouille
;          (clé ramassée, objet.dsl), sinon message (répété après s'être éloigné).
; Type 3 : mur d'embuscade (!) — s'ouvre seul à l'approche, libérant les monstres cachés derrière.
; Type 4 : case de lave (~) — brûle le joueur qui s'y tient (Degats PV par seconde).
; Avec E, le joueur doit être à moins de Portee (cm) et regarder vers l'objet.

; Type 5 : arrivée (posée sur le départ) — fondu depuis le noir, puis le joueur retrouve les PV et les armes qu'il avait
; en quittant le niveau précédent (mémoire de partie BP_DoomPartie, l'instance de jeu, qui survit au changement de carte)
(event EventBeginPlay
  (Input|EnableInput :self self :PlayerController (Game|GetPlayerController 0))
  (if (== (Variables|Default|GetType) 5)
    (CameraFades|StartCameraFade :self (Game|GetPlayerCameraManager 0) :FromAlpha 1.0 :ToAlpha 0.0 :Duration 1.5
      :Color (Utilities|Struct|MakeLinearColor 0.0 0.0 0.0 1.0))
    (Input|SetInputModeGameOnly :PlayerController (Game|GetPlayerController 0))
    (Utilities|FlowControl|Delay :Duration 0.3)
    (bind partie (Utilities|Casting|CastToBP_DoomPartie :Object (Game|GetGameInstance))
      (:then
        (Class|BPDoomPartie|SetSecretsTrouves :self partie :SecretsTrouves 0)
        (Class|BPDoomPartie|SetLibelleNiveau :self partie :LibelleNiveau (Variables|Default|GetLibelle))
        (bind perso (Utilities|Casting|CastToBP_ShooterCharacter :Object (Game|GetPlayerCharacter 0))
          (:then
            ; le saut n'existe qu'en extérieur
            (if (not (Variables|Default|GetExterieur))
              (Class|CharacterMovementComponent|SetJumpZVelocity :self (Class|Character|GetCharacterMovement :self perso) :JumpZVelocity 0.0))
            (if (Class|BPDoomPartie|GetTransmis :self partie)
              (Class|BPShooterCharacter|SetCurrentHP :self perso :"Current HP" (Class|BPDoomPartie|GetPV :self partie))
                (if (Class|BPDoomPartie|GetPistolet :self partie)
                  (Class|BPShooterCharacter|AddWeaponClass :self perso
                    :"Weapon Class" "/Game/Variant_Shooter/Blueprints/Pickups/Weapons/BP_ShooterWeapon_Pistol.BP_ShooterWeapon_Pistol_C"))
                (if (Class|BPDoomPartie|GetFusil :self partie)
                  (Class|BPShooterCharacter|AddWeaponClass :self perso
                    :"Weapon Class" "/Game/Variant_Shooter/Blueprints/Pickups/Weapons/BP_ShooterWeapon_Rifle.BP_ShooterWeapon_Rifle_C"))
                (if (Class|BPDoomPartie|GetLance :self partie)
                  (Class|BPShooterCharacter|AddWeaponClass :self perso
                    :"Weapon Class" "/Game/Variant_Shooter/Blueprints/Pickups/Weapons/BP_ShooterWeapon_GrenadeLauncher.BP_ShooterWeapon_GrenadeLauncher_C"))))
          (:CastFailed)))
      (:CastFailed))))

; menu pause (Échap ou P, action IA_Pause reliée par creer_acteurs.py), sur l'arrivée seulement
(event Custom|Pause
  (if (and (== (Variables|Default|GetType) 5) (not (Game|IsGamePaused)))
    (bind ecran (UserInterface|CreateWidget :Class "/Game/DOOMED/UI/WBP_Pause.WBP_Pause_C" :OwningPlayer (Game|GetPlayerController 0)))
    (UserInterface|Viewport|AddtoViewport :self ecran)
    (Game|SetGamePaused :bPaused true)
    (Input|SetInputModeUIOnly :PlayerController (Game|GetPlayerController 0))
    (Class|PlayerController|SetShowMouseCursor :self (Game|GetPlayerController 0) :bShowMouseCursor true)))

; appelé par le nœud d'entrée IA_Utiliser (relié par creer_acteurs.py : le DSL ne sait pas déclarer cet événement)
(event Custom|Utiliser
  (bind joueur (Game|GetPlayerCharacter 0))
  (Utilities|IsValid joueur
    (:"Is Valid"
      (if (and (and (not (Variables|Default|GetOuvert)) (< (Variables|Default|GetType) 2))
               (and (< (Math|Vector|Distance2D(Vector) (Transformation|GetActorLocation :self joueur) (Transformation|GetActorLocation))
                       (Variables|Default|GetPortee))
                    (> (Transformation|GetDotProductTo :self joueur :OtherActor self) 0.5)))
        (Variables|Default|SetOuvert true)
        (if (== (Variables|Default|GetType) 1)
          (CallFunction|Terminer)
          (else
            (Development|PrintString :InString "Passage secret !" :TextColor (Utilities|Struct|MakeLinearColor 1.0 0.8 0.2 1.0) :Duration 2.5)
            ; compté dans la mémoire de partie pour le bilan de fin de niveau
            (bind partie (Utilities|Casting|CastToBP_DoomPartie :Object (Game|GetGameInstance))
              (:then (Class|BPDoomPartie|SetSecretsTrouves :self partie :SecretsTrouves (+ (Class|BPDoomPartie|GetSecretsTrouves :self partie) 1)))
              (:CastFailed))))))
    (:"Is Not Valid")))

; ouverture automatique (types 2 et 3), puis descente de 250 cm/s jusqu'à disparaître sous le sol (tout sauf la sortie)
(event EventTick (DeltaSeconds)
  (bind type (Variables|Default|GetType))
  ; Type 4 : case de lave — le joueur qui s'y tient perd Degats PV par seconde (Portee = demi-côté de la case)
  (if (== type 4)
    (bind joueur (Game|GetPlayerCharacter 0))
    (Utilities|IsValid joueur
      (:"Is Valid"
        (bind pj (Transformation|GetActorLocation :self joueur))
        (bind pa (Transformation|GetActorLocation))
        (if (and (< (Math|Float|Absolute(Float) (- (.x pj) (.x pa))) (Variables|Default|GetPortee))
                 (< (Math|Float|Absolute(Float) (- (.y pj) (.y pa))) (Variables|Default|GetPortee)))
          (Game|Damage|ApplyDamage :DamagedActor joueur :BaseDamage (* (Variables|Default|GetDegats) DeltaSeconds) :DamageCauser self)))
      (:"Is Not Valid")))
  (if (and (not (Variables|Default|GetOuvert)) (and (>= type 2) (<= type 3)))
    (bind joueur (Game|GetPlayerCharacter 0))
    (Utilities|IsValid joueur
      (:"Is Valid"
        (bind dist (Math|Vector|Distance2D(Vector) (Transformation|GetActorLocation :self joueur) (Transformation|GetActorLocation)))
        (if (< dist (Variables|Default|GetPortee))
          (if (or (== type 3) (Variables|Default|GetDeverrouille))
            (Variables|Default|SetOuvert true)
            (elif (not (Variables|Default|GetAverti))
              (Variables|Default|SetAverti true)
              (if (== (Variables|Default|GetCouleur) 1)
                (Development|PrintString :InString "Il faut la clé ROUGE" :TextColor (Utilities|Struct|MakeLinearColor 1.0 0.2 0.2 1.0) :Duration 2.5)
                (elif (== (Variables|Default|GetCouleur) 2)
                  (Development|PrintString :InString "Il faut la clé BLEUE" :TextColor (Utilities|Struct|MakeLinearColor 0.3 0.5 1.0 1.0) :Duration 2.5)
                  (else
                    (Development|PrintString :InString "Il faut la clé JAUNE" :TextColor (Utilities|Struct|MakeLinearColor 1.0 0.9 0.2 1.0) :Duration 2.5))))))
          (elif (> dist (* (Variables|Default|GetPortee) 2.0))
            (Variables|Default|SetAverti false))))
      (:"Is Not Valid")))
  (if (and (Variables|Default|GetOuvert)
           (and (and (!= type 1) (!= type 4)) (< (Variables|Default|GetDescente) 400.0)))
    (bind pas (* DeltaSeconds 250.0))
    (Transformation|AddActorWorldOffset :DeltaLocation (Math|Vector|MakeVector 0.0 0.0 (- 0.0 pas)))
    (Variables|Default|SetDescente (+ (Variables|Default|GetDescente) pas))))

; fin de niveau : bilan (ennemis tués, secrets trouvés, temps), PV et armes mis en mémoire de partie, fondu au noir,
; puis carte suivante
(event Custom|Terminer
  (Variables|Default|SetMorts 0)
  (Variables|Default|SetTotal 0)
  (bind monstres (Actor|GetAllActorsOfClass :ActorClass "/Game/DOOMED/Monstres/BP_DoomMonstre.BP_DoomMonstre_C"))
  (for m monstres
    (Variables|Default|SetTotal (+ (Variables|Default|GetTotal) 1))
    (bind mo (Utilities|Casting|CastToBP_DoomMonstre :Object m)
      (:then
        (if (== (Class|BPDoomMonstre|GetEtat :self mo) 4)
          (Variables|Default|SetMorts (+ (Variables|Default|GetMorts) 1))))
      (:CastFailed)))
  (bind partie (Utilities|Casting|CastToBP_DoomPartie :Object (Game|GetGameInstance))
    (:then
      (Variables|Default|SetSecretsTrouves (Class|BPDoomPartie|GetSecretsTrouves :self partie))
      ; bilan sur une seule ligne : l'écran de message n'en montre qu'un à la fois
      (Development|PrintString
        :InString (Utilities|String|Append
                    (Utilities|String|Append
                      (Utilities|String|Append "NIVEAU TERMINÉ  —  Ennemis : " (Utilities|String|ToString(Integer) (Variables|Default|GetMorts)))
                      (Utilities|String|Append " / " (Utilities|String|ToString(Integer) (Variables|Default|GetTotal))))
                    (Utilities|String|Append
                      (Utilities|String|Append
                        (Utilities|String|Append "  —  Secrets : " (Utilities|String|ToString(Integer) (Variables|Default|GetSecretsTrouves)))
                        (Utilities|String|Append " / " (Utilities|String|ToString(Integer) (Variables|Default|GetSecretsTotal))))
                      (Utilities|String|Append
                        (Utilities|String|Append "  —  Temps : " (Utilities|String|ToString(Integer) (Math|Float|Floor (Utilities|Time|GetGameTimeinSeconds))))
                        " s")))
        :TextColor (Utilities|Struct|MakeLinearColor 1.0 0.3 0.1 1.0) :Duration 5.0)
      ; mémoire de partie : PV et armes possédées, rendus à l'arrivée dans le niveau suivant (type 5)
      (Class|BPDoomPartie|SetTransmis :self partie :Transmis true)
      (bind perso (Utilities|Casting|CastToBP_ShooterCharacter :Object (Game|GetPlayerCharacter 0))
        (:then
          (for w (Class|BPShooterCharacter|GetOwnedWeapons :self perso)
            (bind nom (Utilities|GetDisplayName :Object w))
            (if (Utilities|String|Contains :SearchIn nom :Substring "Pistol")
              (Class|BPDoomPartie|SetPistolet :self partie :Pistolet true))
            (if (Utilities|String|Contains :SearchIn nom :Substring "Rifle")
              (Class|BPDoomPartie|SetFusil :self partie :Fusil true))
            (if (Utilities|String|Contains :SearchIn nom :Substring "Grenade")
              (Class|BPDoomPartie|SetLance :self partie :Lance true)))
          (Class|BPDoomPartie|SetPV :self partie :PV (Class|BPShooterCharacter|GetCurrentHP :self perso))
          (Utilities|FlowControl|Delay :Duration 3.0)
          (CameraFades|StartCameraFade :self (Game|GetPlayerCameraManager 0) :FromAlpha 0.0 :ToAlpha 1.0 :Duration 1.5
            :Color (Utilities|Struct|MakeLinearColor 0.0 0.0 0.0 1.0) :bHoldWhenFinished true)
          (Utilities|FlowControl|Delay :Duration 1.6)
          (Game|OpenLevel(byName) :LevelName (Variables|Default|GetSuivant)))
        (:CastFailed
          (Utilities|FlowControl|Delay :Duration 3.0)
          (Game|OpenLevel(byName) :LevelName (Variables|Default|GetSuivant)))))
    (:CastFailed
      (Utilities|FlowControl|Delay :Duration 3.0)
      (Game|OpenLevel(byName) :LevelName (Variables|Default|GetSuivant)))))
