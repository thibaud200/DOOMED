; BP_DoomBalle — balle du joueur façon Doom (EventGraph), enfant de la balle d'Arena Shooter.
; Les composants appartiennent au parent commun avec la grenade : on ne les modifie pas dans les assets, on règle
; CETTE balle à sa première image de vol (le BeginPlay du parent, qui garde dégâts et impact, n'est pas remplacé :
; l'appel au parent ne s'écrit pas en DSL). Pret évite de refaire les réglages.

(event EventTick (DeltaSeconds)
  (if (not (Variables|Default|GetPret))
  (Variables|Default|SetPret true)
  (bind pm (Variables|Components|GetProjectileMovement))
  (Class|ProjectileMovementComponent|SetProjectileGravityScale :self pm :ProjectileGravityScale 0.0)
  (Class|ProjectileMovementComponent|SetShouldBounce :self pm :bShouldBounce false)
  (Class|ProjectileMovementComponent|SetRotationFollowsVelocity :self pm :bRotationFollowsVelocity true)
  (Class|ProjectileMovementComponent|SetMaxSpeed :self pm :MaxSpeed 15000.0)
  (Game|Components|ProjectileMovement|SetVelocityinLocalSpace :self pm :NewVelocity (Math|Vector|MakeVector 15000.0 0.0 0.0))
  (Components|Sphere|SetSphereRadius :self (Variables|Components|GetCollisionComponent) :InSphereRadius 5.0 :bUpdateOverlaps true)
  ; traçant : trait fin et lumineux à la place de la bille en mousse
  (bind trait (Variables|Components|GetSphere))
  (Transformation|SetRelativeScale3D :self trait :NewScale3D (Math|Vector|MakeVector 0.9 0.04 0.04))
  (Rendering|Material|SetMaterial :self trait :ElementIndex 0 :Material "/Game/DOOMED/Materiaux/M_Traceuse.M_Traceuse")
  (Rendering|SetCastShadow :self trait :NewCastShadow false)))
