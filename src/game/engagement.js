import { createShieldParryExchangeState, resetShieldParryExchangeState } from './exchange-state.js';
import { createAttackerPresentationAdapter } from './attacker-presentation.js';
import { createShieldParryPreContactController } from './pre-contact-controller.js';
import { createShieldParryContactHandoffController } from './contact-handoff-controller.js';
import { createBladePolylineSampler } from './geometry.js';
import { createTwoActorCombatIntegration } from '../combat/two-actor-combat-integration.js';
import { createLiveShieldSwordGripContactRuntime } from '../combat/live-shield-sword-grip-contact-constraint.js';

export const ENGAGEMENT_STAGE = 'R23F.1';

// R23F.1 — one direction of a fight, as a unit.
//
// R23A.1 made a FIGHTER a unit so there could be two of them. This makes an EXCHANGE one, for the
// same reason and against the same obstacle: the entry sat at 696 of its 700 code lines, and a
// second contact stack is a hundred lines of construction. The shape was not chosen, it was
// measured - nine constructions and four pieces of state in the entry belong to "somebody swinging
// at somebody", and every one of them would have to be duplicated.
//
// WHAT IS IN HERE, and the test that decided it: a thing belongs to the engagement if a second
// exchange running the other way would need its own. The blackboard (reset per exchange), the
// attack runtime, the two-actor integration that holds one activeExchange, the swinger's
// presentation, the grip constraint that binds THEIR sword, the pre-contact and contact-handoff
// controllers, the blade samplers, and the recovery/idle/previous-blade state the presentation
// carries between frames. All nine, all four.
//
// WHAT IS DELIBERATELY NOT, and this is the boundary that shaped the module: the entry's FUNCTIONS.
// startAttack, setMode, restartAttack, resolveContact and the rest read `status.textContent`, call
// `document.querySelectorAll`, and consult the parry tally and the slow-review checkbox. Moving them
// would drag the DOM into src/game, which is the one thing this layer is not allowed to touch. They
// stay in the entry and reach in through readContext and callbacks - the same seam they already
// used, now pointed at a unit instead of at nine loose consts.
//
// The role names are SWINGER and RECEIVER, following R23C.1: the ledger stopped calling them
// attacker and defender when the swing got a subject, and this is the same fact one layer up. The
// sub-controllers still say "attacker" internally and are handed the right actor for the direction
// they are built for; renaming their parameters is a separate change and would move no behaviour.
export function createEngagement(THREE, {
  swinger,
  swingerSword,
  receiver,
  receiverBuckler,
  receiverFighter,
  camera,
  attackRuntime,
  createOwnershipTaps,
  longswordAttackPhases,
  promptHoldMs,
  debugMode = false,
  parrySync = { presentationOffsetSeconds: 0.205, parryAttackerRecoilDelayMs: 0 },
  presentationServices,
  preContactServices,
  contactServices,
  readContext,
  callbacks,
}) {
  if (!swinger?.rig || !receiver?.rig) throw new Error('R23F.1 an engagement needs a swinger and a receiver');
  if (!attackRuntime?.start) throw new Error('R23F.1 an engagement needs an attack runtime');
  if (!receiverFighter?.guardMachine) throw new Error('R23F.1 an engagement needs the receiver assembled');

  const exchangeState = createShieldParryExchangeState();

  // The presentation state that lives BETWEEN frames rather than inside any one runtime: which
  // recovery is playing, where the idle clock is, and what the blade looked like last frame. It was
  // four entry-level `let`s, which is exactly why a second exchange could not exist.
  let recovery = null;
  let idleClockSeconds = 0;
  let idleDuration = 1;
  let previousBlade = null;

  const presentation = createAttackerPresentationAdapter({
    THREE,
    attacker: swinger,
    camera,
    exchangeState,
    services: presentationServices,
  });

  const combat = createTwoActorCombatIntegration({
    THREE,
    attackerCharacter: swinger,
    attackRuntime,
    guardMachine: receiverFighter.guardMachine,
    parrySync,
    // Bound through a closure rather than by reference: this and the contact handoff below need
    // each other, and one of them has to be built first. The arrow is only ever called from inside
    // a running frame, by which time both exist.
    sampleFrozenContactPose(interruption) {
      presentation.sampleFrozenContactPose(interruption, {
        ownsLiveContact: contactHandoff.ownsLiveContact(),
      });
    },
  });

  const gripConstraint = createLiveShieldSwordGripContactRuntime(THREE, {
    attackerRig: swinger.rig,
    attackerSword: swingerSword,
  });

  const preContact = createShieldParryPreContactController({
    createOwnershipTaps,
    exchangeState,
    buckler: receiverBuckler,
    defender: receiver,
    camera,
    bracingRuntime: receiverFighter.bracingRuntime,
    fineTrackingRuntime: receiverFighter.fineTrackingRuntime,
    residualBodyReachRuntime: receiverFighter.residualBodyReachRuntime,
    residualStanceReachRuntime: receiverFighter.residualStanceReachRuntime,
    predictivePresentation: receiverFighter.predictivePresentation,
    activeInterceptIntent: receiverFighter.activeParryInterceptIntent,
    parryGate: receiverFighter.parryGate,
    longswordAttackPhases,
    promptHoldMs,
    debugMode,
    // The caller's context, with this engagement's own blade memory folded in. previousBlade used
    // to be an entry `let` the entry had to remember to put in the bag; it is the engagement's now,
    // so a caller cannot forget it and two engagements cannot share one.
    readContext: () => ({ ...readContext(), previousBlade }),
    services: preContactServices,
  });

  const contactHandoff = createShieldParryContactHandoffController({
    exchangeState,
    buckler: receiverBuckler,
    attacker: swinger,
    defender: receiver,
    attackerSword: swingerSword,
    camera,
    combat,
    swordGripConstraint: gripConstraint,
    guardRuntime: receiverFighter.guardRuntime,
    predictivePresentation: receiverFighter.predictivePresentation,
    parryGate: receiverFighter.parryGate,
    preContactController: preContact,
    fineTrackingRuntime: receiverFighter.fineTrackingRuntime,
    residualBodyReachRuntime: receiverFighter.residualBodyReachRuntime,
    residualStanceReachRuntime: receiverFighter.residualStanceReachRuntime,
    services: contactServices,
    callbacks: {
      ...callbacks,
      // These two asked the entry for something the entry only had because it owned the
      // presentation. It lives here now, so they stop being the caller's problem.
      captureCanonicalAttackerOldB3Base: () => presentation.captureCanonicalOldB3Base(attackRuntime.snapshot.interruption),
      captureAttackerWorldSilhouette: () => presentation.captureWorldSilhouette(),
    },
  });

  // R21A.1: a SECOND sampler for measurement reads. The sampler alternates between two buffers so
  // the frame loop can hold last frame's blade and this frame's at once, and the swept contact probe
  // compares exactly those two - so an extra read from outside the loop does not just return a
  // value, it rotates the buffer the fight is using. Its own instance, its own buffers, nothing
  // shared.
  const captureBlade = createBladePolylineSampler(THREE, swingerSword);
  const readBladeForMeasurement = createBladePolylineSampler(THREE, swingerSword);

  return Object.freeze({
    stage: ENGAGEMENT_STAGE,
    exchangeState,
    attackRuntime,
    combat,
    presentation,
    gripConstraint,
    preContact,
    contactHandoff,
    captureBlade,
    readBladeForMeasurement,
    resetExchangeState(options) { return resetShieldParryExchangeState(exchangeState, options); },
    // The swinger's recovery and idle, which are one clock between them: beginning a recovery
    // restarts the idle, because the idle is what the recovery eases back into.
    beginRecovery(direction) {
      recovery = presentation.createRecovery(direction);
      idleClockSeconds = 0;
      return recovery;
    },
    clearRecovery() { recovery = null; },
    get hasRecovery() { return Boolean(recovery); },
    setIdleDuration(seconds) {
      const value = Number(seconds);
      idleDuration = Number.isFinite(value) && value > 0 ? value : 1;
      return idleDuration;
    },
    sampleBase(snapshot, deltaMs, walkSample) {
      const state = presentation.sampleBase({
        snapshot, deltaMs, recovery, idleClockSeconds, idleDuration, walkSample,
      });
      recovery = state.recovery;
      idleClockSeconds = state.idleClockSeconds;
      return state;
    },
    get previousBlade() { return previousBlade; },
    rememberBlade(blade) { previousBlade = blade; return previousBlade; },
    authority: 'composition-only-no-contact-authority',
  });
}
