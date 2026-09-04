import { createGuardStateMachine } from '../combat/guard-state-machine.js';
import { createGuardPresentationRuntime } from '../combat/guard-presentation-runtime.js';
import { createArticulatedImpactBracingRuntime } from '../combat/articulated-impact-bracing.js';
import { createGuardThreatTrackingRuntime } from '../combat/guard-threat-tracking.js';
import { createGuardResidualBodyReachRuntime } from '../combat/guard-residual-body-reach.js';
import { createGuardResidualStanceReachRuntime } from '../combat/guard-residual-stance-reach.js';
import { createPredictiveInterceptParryPresentationRuntime } from '../combat/predictive-intercept-parry.js';
import { createActiveParryInterceptIntent } from '../combat/active-parry-intercept-intent.js';
import { createCommittedParryContactGate } from '../combat/committed-parry-contact-gate.js';
import { createDefenderStanceRuntime } from '../combat/defender-stance.js';
import { createGuardSectorRuntime } from './guard-sector-runtime.js';
import { createNeutralStanceController } from './neutral-stance.js';
import { createBodyStrikeReactionController } from './body-strike-reaction-controller.js';
import { createFighterCondition } from '../combat/fighter-condition.js';
import { createWeaponMountController } from './weapon-mount-controller.js';
import { LONGSWORD, equipWeapon } from './weapon.js';

export const FIGHTER_STAGE = 'R23A.1';

// R23A.1 - everything one fighter needs to defend, as a unit.
//
// This is the composition step before a mirror duel. The lab has always built exactly one of these,
// twelve `const`s at a time in the entry, every one of them handed `defender` - and that is the only
// reason the opponent cannot guard. The runtimes were never the obstacle:
//
//   FIVE of them already take only { rig, buckler } and one takes { character }. Not one reaches
//   for a global defender. They have been actor-agnostic the whole time.
//   FIVE more hold pure state and touch no actor at all - the guard machine, the stance, the parry
//   gate, the intercept intent, the sector.
//   TWO name their parameter `defender`, which is a word, not a dependency.
//
// So the work was never "make these symmetric". It was that the ASSEMBLY lived in the entry, where
// there is only one of it and no room for a second: the entry sits at its 699-line budget, and
// duplicating twelve construction lines would break the ceiling R20Z.1 set and R21E.1 raised once.
// Pulled out here, the entry builds fighters instead of runtimes and gets SHORTER, and the second
// fighter costs one line rather than twelve.
//
// R22I.1 found that src/game is the composition layer - the top of the stack, importing combat 35
// times and imported by nothing in src/. A fighter is the unit that layer was missing: until now
// its modules were all of the PARTS of a fighter and none of the whole.
//
// Deliberately NOT included, because they are not one fighter's:
//   the attack runtime      - a swing is an exchange between two, and the lab drives it as one
//   the lane controller     - one ledger holds both fighters and the ground between them
//   the contact stack       - handoff, lifecycle and combat integration each span both
//   the player controller   - input, lock-on and the camera belong to whoever is playing, not to a
//                             body; a mirror duel gives one fighter a human and one an opponent
//                             drive, and both wear the same fighter underneath.
export function createFighter(THREE, {
  character,
  buckler,
  camera = null,
  // W1 - what this fighter is carrying. The longsword unless told otherwise, which is every caller
  // that existed before this parameter: two lab pages and five tests, none of which changed.
  weapon = LONGSWORD,
  // The mount follows whichever animation family is posing the hand, and a swing is a UAL window
  // the guard machine cannot see - R23K.1 measured that and it is why this is asked for separately
  // rather than read off the guard state. A fighter who never swings answers false forever.
  readSwinging = () => false,
} = {}) {
  if (!character?.sampleAnimation) throw new Error(`${FIGHTER_STAGE} requires an animation-capable character`);
  if (!buckler?.getWorldParrySurface) throw new Error(`${FIGHTER_STAGE} requires a buckler with a parry surface`);
  if (!weapon?.id) throw new Error(`${FIGHTER_STAGE} requires a weapon`);
  const carried = weapon.object3d || weapon.mounts ? weapon : equipWeapon(weapon);

  // Order matters exactly once: the presentation runtime and the neutral stance both read the guard
  // machine, so it is built first. Everything else is independent.
  // W1: this fighter's guard presents THIS fighter's weapon. Until now the machine read one fixed
  // table, which was correct while the scene had one sword and wrong the moment two fighters could
  // carry different ones.
  const guardMachine = createGuardStateMachine({ presentation: carried.guardPresentation });
  const guardRuntime = createGuardPresentationRuntime(THREE, { machine: guardMachine, character });
  const bracingRuntime = createArticulatedImpactBracingRuntime(THREE, { rig: character.rig, buckler });
  const fineTrackingRuntime = createGuardThreatTrackingRuntime(THREE, { rig: character.rig, buckler });
  const residualBodyReachRuntime = createGuardResidualBodyReachRuntime(THREE, { rig: character.rig, buckler });
  const residualStanceReachRuntime = createGuardResidualStanceReachRuntime(THREE, { rig: character.rig, buckler });
  const predictivePresentation = createPredictiveInterceptParryPresentationRuntime(THREE, { character });
  const activeParryInterceptIntent = createActiveParryInterceptIntent();
  const parryGate = createCommittedParryContactGate();
  const stance = createDefenderStanceRuntime();
  const guardSector = createGuardSectorRuntime();
  const neutralStance = createNeutralStanceController({
    defender: character, camera, readGuardState: () => guardMachine.state,
  });
  const bodyStrikeReaction = createBodyStrikeReactionController({ defender: character, camera });
  // R23J.1: what this body has left and whether it may act. Per fighter because it is a property of
  // a body, not of an exchange - a fighter carries their wounds between exchanges, which is the
  // whole difference between a lab and a duel.
  const condition = createFighterCondition();
  // W1: built here only when the weapon is a real one in a scene. A headless fighter carries the
  // longsword's definition and no Object3D, and has nothing to mount.
  const weaponMount = carried.object3d && carried.mounts
    ? createWeaponMountController({
      weapon: carried,
      mounts: carried.mounts,
      readGuardState: () => guardMachine.state,
      readSwinging,
    })
    : null;

  return Object.freeze({
    stage: FIGHTER_STAGE,
    character,
    buckler,
    guardMachine,
    guardRuntime,
    bracingRuntime,
    fineTrackingRuntime,
    residualBodyReachRuntime,
    residualStanceReachRuntime,
    predictivePresentation,
    activeParryInterceptIntent,
    parryGate,
    stance,
    guardSector,
    neutralStance,
    bodyStrikeReaction,
    condition,
    weapon: carried,
    weaponMount,
    authority: 'composition-only-no-contact-authority',
  });
}
