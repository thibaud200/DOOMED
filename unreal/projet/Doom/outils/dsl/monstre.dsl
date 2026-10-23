; BP_DoomMonstre — monstre de DOOMED (EventGraph), d'après 06_game.js du jeu HTML.
; Etat : 0 dormant · 1 chasse · 2 attaque · 3 douleur · 4 mort.  Mode d'attaque : 0 corps à corps · 1 tir · 2 charge en cours.
; TirType : 0 aucun · 1 boule (Projectile = couleur) · 2 balle (instantané) · 3 charge (âme perdue, vautour).
; Le sprite est une planche 8 colonnes (rotations Doom 1..8) × NbLignes (images) : paramètres Col et Ligne.
; Une condition par état (etat est lu une fois par image : un changement d'état prend effet à l'image suivante).
; Special : 0 aucun · 1 explose à la mort (Puissance = dégâts, rayon 3 m) · 2 se régénère (Puissance PV/s)
;           · 3 tir en rafale (3 coups par attaque). Aveugle : heure de jeu jusqu'à laquelle le joueur est invisible
;           (objet invisibilité) : pas de réveil ni de tir à distance.

(event EventBeginPlay
  (Variables|Default|SetPVMax (Variables|Default|GetPV))
  (Variables|Default|SetRecharge 1.0)
  (Variables|Default|SetRepath 0.0))

; Tick : la réflexion ne tourne que si le joueur existe (pendant sa mort et sa réapparition, il n'y en a pas)
(event EventTick (DeltaSeconds)
  (Variables|Default|SetDt DeltaSeconds)
  (Utilities|IsValid (Game|GetPlayerCharacter 0)
    (:"Is Valid"
      (CallFunction|Penser))
    (:"Is Not Valid")))

(event Custom|Penser
  (bind DeltaSeconds (Variables|Default|GetDt))
  (Variables|Default|SetT (+ (Variables|Default|GetT) DeltaSeconds))
  (bind t (Variables|Default|GetT))
  (bind etat (Variables|Default|GetEtat))
  (bind spr (Variables|Default|GetSprite))
  (bind joueur (Game|GetPlayerCharacter 0))
  (bind moi (Transformation|GetActorLocation))
  (bind cible (Transformation|GetActorLocation :self joueur))
  (bind ctrl (Pawn|GetController))
  (bind dist (Math|Vector|Distance(Vector) moi cible))
  ; sprite face à la caméra ; colonne = rotation Doom (1 = vu de face)
  (bind regard (Math|Rotator|FindLookatRotation moi (Camera|GetCameraLocation :self (Game|GetPlayerCameraManager 0))))
  (Transformation|SetWorldRotation :self (Variables|Default|GetPivot) :NewRotation (Math|Rotator|MakeRotator 0 0 (+ (.yaw regard) 90)))
  (bind d (- (.yaw regard) (.yaw (Transformation|GetActorRotation))))
  (Rendering|Material|SetScalarParameterValueonMaterials :self spr :ParameterName "Col"
    :ParameterValue (Math|Integer|%(Integer) (Math|Float|Floor (/ (+ d 742.5) 45.0)) 8))
  (bind voit (> (Utilities|Time|GetGameTimeinSeconds) (Variables|Default|GetAveugle)))

  ; régénération
  (if (and (== (Variables|Default|GetSpecial) 2) (!= etat 4))
    (Variables|Default|SetPV (Math|Float|Min(Float) (+ (Variables|Default|GetPV) (* (Variables|Default|GetPuissance) DeltaSeconds))
                                                    (Variables|Default|GetPVMax))))

  ; mort : images de la chute, puis le cadavre reste
  (if (== etat 4)
    (Rendering|Material|SetScalarParameterValueonMaterials :self spr :ParameterName "Ligne"
      :ParameterValue (+ (Variables|Default|GetLigneMort)
                         (Math|Integer|Min(Integer) (Math|Float|Floor (* t 8.0)) (- (Variables|Default|GetNbMort) 1)))))

  ; dormant : se réveille s'il voit le joueur assez près
  (if (== etat 0)
    (Rendering|Material|SetScalarParameterValueonMaterials :self spr :ParameterName "Ligne" :ParameterValue (Variables|Default|GetLigneMarche))
    (if (and voit (and (< dist (Variables|Default|GetDistReveil)) (Controller|LineOfSightTo :self ctrl :Other joueur)))
      (Variables|Default|SetEtat 1)
      (Variables|Default|SetT 0.0)))

  ; chasse : recalcul du chemin deux fois par seconde, attaque quand la recharge est finie
  (if (== etat 1)
    (Variables|Default|SetRepath (- (Variables|Default|GetRepath) DeltaSeconds))
    (if (<= (Variables|Default|GetRepath) 0.0)
      (AI|Navigation|SimpleMovetoActor :Controller ctrl :Goal joueur)
      (Variables|Default|SetRepath 0.5))
    (Variables|Default|SetRecharge (- (Variables|Default|GetRecharge) DeltaSeconds))
    (Rendering|Material|SetScalarParameterValueonMaterials :self spr :ParameterName "Ligne"
      :ParameterValue (+ (Variables|Default|GetLigneMarche)
                         (Math|Integer|%(Integer) (Math|Float|Floor (* t 4.0)) (Variables|Default|GetNbMarche))))
    (if (<= (Variables|Default|GetRecharge) 0.0)
      (if (and (> (Variables|Default|GetMelee) 0.0) (< dist (Variables|Default|GetPorteeMelee)))
        (AI|Navigation|StopMovement :self ctrl)
        (Variables|Default|SetMode 0)
        (Variables|Default|SetFait false)
        (Variables|Default|SetCoups 0.0)
        (Variables|Default|SetT 0.0)
        (Variables|Default|SetEtat 2)
        (elif (and (and voit (> (Variables|Default|GetTirType) 0))
                   (and (and (> dist (Variables|Default|GetTirMin)) (< dist (Variables|Default|GetTirMax)))
                        (Controller|LineOfSightTo :self ctrl :Other joueur)))
          (AI|Navigation|StopMovement :self ctrl)
          (Variables|Default|SetMode 1)
          (Variables|Default|SetFait false)
          (Variables|Default|SetCoups 0.0)
          (Variables|Default|SetT 0.0)
          (Variables|Default|SetEtat 2)))))

  ; attaque : face au joueur, images d'attaque, le coup part à mi-chemin
  (if (== etat 2)
    (Transformation|SetActorRotation :NewRotation (Math|Rotator|MakeRotator 0 0 (.yaw (Math|Rotator|FindLookatRotation moi cible))))
    (bind duree (Variables|Default|GetDureeAttaque))
    (Rendering|Material|SetScalarParameterValueonMaterials :self spr :ParameterName "Ligne"
      :ParameterValue (+ (Variables|Default|GetLigneAttaque)
                         (Math|Integer|Min(Integer) (Math|Float|Floor (* (/ t duree) (Variables|Default|GetNbAttaque)))
                                                    (- (Variables|Default|GetNbAttaque) 1))))
    ; un coup à mi-chemin ; rafale (tir, Special 3) : trois coups à 25, 50 et 75 %
    (if (and (== (Variables|Default|GetSpecial) 3) (== (Variables|Default|GetMode) 1))
      (if (and (< (Variables|Default|GetCoups) 3.0) (> t (* duree (* 0.25 (+ (Variables|Default|GetCoups) 1.0)))))
        (Variables|Default|SetCoups (+ (Variables|Default|GetCoups) 1.0))
        (CallFunction|Frapper))
      (elif (and (> t (* duree 0.5)) (not (Variables|Default|GetFait)))
        (Variables|Default|SetFait true)
        (CallFunction|Frapper)))
    (if (and (== (Variables|Default|GetMode) 2) (< dist (Variables|Default|GetPorteeMelee)))
      (Game|Damage|ApplyDamage :DamagedActor joueur :BaseDamage (Variables|Default|GetTirDegatsMin) :DamageCauser self)
      (Variables|Default|SetMode 3))
    (if (> t duree)
      (Variables|Default|SetEtat 1)
      (Variables|Default|SetT 0.0)
      (Variables|Default|SetRepath 0.0)
      (Variables|Default|SetRecharge (Math|Random|RandomFloatinRange (Variables|Default|GetRechargeMin) (Variables|Default|GetRechargeMax)))))

  ; douleur : une image, un quart de seconde
  (if (== etat 3)
    (Rendering|Material|SetScalarParameterValueonMaterials :self spr :ParameterName "Ligne" :ParameterValue (Variables|Default|GetLigneDouleur))
    (if (> t 0.25)
      (Variables|Default|SetEtat 1)
      (Variables|Default|SetT 0.0))))

; le coup lui-même : morsure, boule de feu, balle ou charge
(event Custom|Frapper
  (bind joueur (Game|GetPlayerCharacter 0))
  (bind moi (Transformation|GetActorLocation))
  (bind cible (Transformation|GetActorLocation :self joueur))
  (bind type (Variables|Default|GetTirType))
  (if (== (Variables|Default|GetMode) 0)
    (if (< (Math|Vector|Distance(Vector) moi cible) (* (Variables|Default|GetPorteeMelee) 1.5))
      (Game|Damage|ApplyDamage :DamagedActor joueur :BaseDamage (Variables|Default|GetMelee) :DamageCauser self))
    (elif (== type 1)
      (bind depart (+ moi (Math|Vector|MakeVector 0.0 0.0 (* (Variables|Default|GetHauteur) 0.25))))
      (bind proj (Game|SpawnActorfromClass :Class "/Game/DOOMED/Monstres/BP_DoomProjectile.BP_DoomProjectile_C"
        :SpawnTransform (Math|Transform|MakeTransform :Location depart :Rotation (Math|Rotator|FindLookatRotation depart cible))
        :CollisionHandlingOverride "AlwaysSpawn" :Owner self))
      (bind boule (Utilities|Casting|CastToBP_DoomProjectile :Object proj)
        (:then
          (Class|BPDoomProjectile|SetCouleur :self boule :Couleur (Variables|Default|GetProjectile))
          (Class|BPDoomProjectile|SetDegats :self boule :Degats
            (Math|Random|RandomFloatinRange (Variables|Default|GetTirDegatsMin) (Variables|Default|GetTirDegatsMax)))
          (Class|BPDoomProjectile|Lancer :self boule))
        (:CastFailed))
      (elif (== type 2)
        (if (Controller|LineOfSightTo :self (Pawn|GetController) :Other joueur)
          (Game|Damage|ApplyDamage :DamagedActor joueur :DamageCauser self
            :BaseDamage (Math|Random|RandomFloatinRange (Variables|Default|GetTirDegatsMin) (Variables|Default|GetTirDegatsMax))))
        (elif (== type 3)
          ; charge : élan vers le joueur ; le choc blesse s'il arrive au contact (voir l'état 2)
          (Character|LaunchCharacter :LaunchVelocity (* (Math|Vector|GetUnitDirection(Vector) moi cible) (Variables|Default|GetTirVitesse))
            :bXYOverride true :bZOverride false)
          (Variables|Default|SetMode 2))))))

(event Game|Damage|EventAnyDamage (Damage DamageType InstigatedBy DamageCauser)
  (if (!= (Variables|Default|GetEtat) 4)
    (Variables|Default|SetPV (- (Variables|Default|GetPV) Damage))
    (if (<= (Variables|Default|GetPV) 0.0)
      ; mort : plus d'obstacle ni de mouvement, le cadavre reste au sol
      (Variables|Default|SetEtat 4)
      (Variables|Default|SetT 0.0)
      (AI|Navigation|StopMovement :self (Pawn|GetController))
      (Components|Tick|SetComponentTickEnabled :self (Variables|Character|GetCharacterMovement) :bEnabled false)
      (Collision|SetCollisionEnabled :self (Variables|Character|GetCapsuleComponent) :NewType "NoCollision")
      ; explose à la mort : dégâts autour de lui (joueur et autres monstres)
      (if (== (Variables|Default|GetSpecial) 1)
        (Game|Damage|ApplyRadialDamage :BaseDamage (Variables|Default|GetPuissance) :Origin (Transformation|GetActorLocation)
          :DamageRadius 300.0 :DamageCauser self :bDoFullDamage false))
      (elif (and (!= (Variables|Default|GetEtat) 2) (Math|Random|RandomBoolwithWeight 0.5))
        (AI|Navigation|StopMovement :self (Pawn|GetController))
        (Variables|Default|SetEtat 3)
        (Variables|Default|SetT 0.0)
        (elif (== (Variables|Default|GetEtat) 0)
          (Variables|Default|SetEtat 1))))))
