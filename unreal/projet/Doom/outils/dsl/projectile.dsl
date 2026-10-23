; BP_DoomProjectile — boule de feu d'un monstre (EventGraph).
; Le monstre la fait apparaître, règle Couleur (0 feu, 1 bleue, 2 verte) et Degats, puis appelle Lancer.

(event EventTick (DeltaSeconds)
  (Variables|Default|SetT (+ (Variables|Default|GetT) DeltaSeconds))
  (bind cam (Camera|GetCameraLocation :self (Game|GetPlayerCameraManager 0)))
  (bind regard (Math|Rotator|FindLookatRotation (Transformation|GetActorLocation) cam))
  (Transformation|SetWorldRotation :self (Variables|Default|GetPivot) :NewRotation (Math|Rotator|MakeRotator 0 0 (+ (.yaw regard) 90)))
  (Rendering|Material|SetScalarParameterValueonMaterials :self (Variables|Default|GetSprite) :ParameterName "Ligne"
    :ParameterValue (Math|Integer|%(Integer) (Math|Float|Floor (* (Variables|Default|GetT) 8)) 2)))

(event Custom|Lancer
  (bind c (Variables|Default|GetCouleur))
  (bind spr (Variables|Default|GetSprite))
  (if (== c 1)
    (Rendering|Material|SetMaterial :self spr :ElementIndex 0 :Material "/Game/DOOMED/Sprites/MI_Sprite_fireballBlue.MI_Sprite_fireballBlue")
    (elif (== c 2)
      (Rendering|Material|SetMaterial :self spr :ElementIndex 0 :Material "/Game/DOOMED/Sprites/MI_Sprite_fireballGreen.MI_Sprite_fireballGreen")
      (else
        (Rendering|Material|SetMaterial :self spr :ElementIndex 0 :Material "/Game/DOOMED/Sprites/MI_Sprite_fireball.MI_Sprite_fireball"))))
  (Collision|IgnoreActorwhenMoving :self (Variables|Default|GetBoule) :Actor (Actor|GetOwner) :bShouldIgnore true)
  (Game|Components|ProjectileMovement|SetVelocityinLocalSpace :self (Variables|Default|GetMouvement)
    :NewVelocity (Math|Vector|MakeVector (select (== c 1) 1600.0 (select (== c 2) 2400.0 2000.0)) 0.0 0.0)))

(event Collision|EventHit (MyComp Other OtherComp bSelfMoved HitLocation HitNormal NormalImpulse Hit)
  (Utilities|IsValid Other
    (:"Is Valid"
      (Game|Damage|ApplyDamage :DamagedActor Other :BaseDamage (Variables|Default|GetDegats) :DamageCauser self)
      (Actor|DestroyActor))
    (:"Is Not Valid"
      (Actor|DestroyActor))))
