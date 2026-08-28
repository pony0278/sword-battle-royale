import { createAttackAdvanceRuntime } from '../../../src/combat/attack-advance.js';
import { createGuardFacingTurnRuntime } from '../../../src/combat/guard-facing-turn.js';
import { createBaseFacingRuntime } from '../../../src/combat/base-facing.js';
import { createEngagementGround } from '../../../src/combat/engagement-ground.js';
import { createLaneLocomotionRuntime } from '../../../src/combat/lane-locomotion.js';
import { createLaneWalkCycle, walkClipTimeSeconds } from '../../../src/combat/lane-walk-cycle.js';
import { canWalkOverlayLegs, filterPoseToWalkOverlay } from '../../../src/combat/guard-walk-overlay.js';

// R18Z.1 — where the two fighters are standing, and nothing else.
//
// Two rules and one mechanism, kept together because they are one question. attack-advance says how
// far a swing carries the attacker; engagement-ground keeps the ledger of what each fighter has
// gained or given up; this writes the result onto the scene. Splitting them across the entry meant
// three separate calls all having to remember to re-apply, which is exactly the kind of ordering
// the entry should not be carrying.
//
// It owns no authority over whether anything was hit. It is told an outcome and moves people.
export function createShieldParryLaneController({ labScene, walkClips, services }) {
  // Durations arrive after the assets load, so the clips are described here and measured later.
  let walkDurations = { forward: 1, backward: 1 };
  const advance = createAttackAdvanceRuntime();
  const guardFacingTurn = createGuardFacingTurnRuntime();
  // R19T.1: each body's facing is integrated, not read off the bearing - the ledger keeps
  // reporting the instantaneous bearing as a fact, and these give it inertia. The attacker's
  // freezes for the length of a committed swing (soft tracking at strength zero until B4).
  const attackerBaseFacing = createBaseFacingRuntime();
  const defenderBaseFacing = createBaseFacingRuntime();
  const defenderFeet = createLaneLocomotionRuntime();
  const attackerFeet = createLaneLocomotionRuntime();
  // R19C.2: the attacker's gait, driven by the distance the ledger actually moved them rather than
  // by elapsed time, so the feet cannot disagree with the ground about how far anybody went.
  const attackerGait = createLaneWalkCycle();
  // R19E.1: the defender walks too, but their guard IS their base clip, so their walk is a leg
  // overlay rather than a base swap: sample the walk, keep the leg chain, let the guard sample the
  // whole rig as always, then lay the legs back on top. The captured legs live here between the
  // two steps of that sandwich.
  const defenderGait = createLaneWalkCycle();
  let pendingDefenderLegPose = null;
  const ground = createEngagementGround({
    startSeparationMeters: labScene.engagementStance.separationMeters,
  });

  // Told by the caller rather than inferred. The advance runtime keeps its plan until the next
  // exchange resets it, and re-sampling it at elapsed 0 between attacks makes it look like a swing
  // that has not started yet - so asking it whether a swing is live gave the wrong answer in both
  // directions, and locked the attacker's feet from the first swing of the session onwards.
  let swingLive = false;
  // R19B.2: once a blow has settled, its step is banked and must never be fed back in. The attack
  // animation keeps running past contact, so the frame loop would otherwise re-report the same
  // travel as an unspent swing on top of the ground it had already become - and the next exchange
  // would bank it a second time. Measured before this flag existed: a single blocked TOP attack
  // moved the attacker 1.56m instead of 0.70m, and repeated lunges walked him clean through the
  // defender past the minimum separation.
  let exchangeSettled = false;
  function attackerFeetLocked() {
    return swingLive && advance.report?.complete !== true;
  }

  function walkSampleFor(gait) {
    if (!gait?.moving || !walkClips) return null;
    const forward = gait.direction > 0;
    const clipId = forward ? walkClips.forward : walkClips.backward;
    const duration = forward ? walkDurations.forward : walkDurations.backward;
    return Object.freeze({ clipId, timeSeconds: walkClipTimeSeconds(gait.phase, duration) });
  }

  function apply() {
    const report = ground.report;
    labScene.setLanePositions({
      ...report,
      attackerFacingRadians: attackerBaseFacing.facingRadians,
      defenderFacingRadians: defenderBaseFacing.facingRadians,
    });
    return report;
  }

  return Object.freeze({
    startAttack(direction, contactSeconds) {
      exchangeSettled = false;
      return advance.start({ direction, contactSeconds, startSeconds: 0 });
    },
    // Called every frame of a live swing, before anything reads a world position: the guard tracks
    // the attacker and the swept probe measures the blade, so both must see where the step has
    // actually carried him.
    update(elapsedSeconds, attacking = true) {
      swingLive = Boolean(attacking);
      if (!swingLive || exchangeSettled) return ground.report;
      // R19U.1: the swing spends its metres along the attacker's frozen facing - the same value
      // the R19T freeze holds for the length of the commitment. On the lane that facing is zero
      // and the ledger's exact legacy path runs.
      ground.setAttackerSwing(advance.update(elapsedSeconds)?.advanceMeters ?? 0,
        attackerBaseFacing.facingRadians);
      return apply();
    },
    // Feet run every frame, attack or no attack, which is the point: standing still is a choice
    // somebody is making rather than the only thing available to them.
    setDefenderIntent(intent) {
      return defenderFeet.setIntent(intent);
    },
    setAttackerIntent(intent) {
      return attackerFeet.setIntent(intent);
    },
    // Both are stepped against the live gap, so the clamp that stops them walking through each
    // other is checked against where they actually are this frame rather than where they started,
    // and the second one to move sees the ground the first just took.
    walk(deltaSeconds, guardFacingPlan) {
      // R19Q.1: body orientation is locomotion state, so the facing integrator lives here. Guard
      // logic writes a fresh plan each frame it runs; the runtime treats a repeated plan object as
      // "the exchange is over" and stands the body back down, so nobody has to remember to stop.
      labScene.setDefenderYawOffset(guardFacingTurn.update(guardFacingPlan, deltaSeconds));
      // R19T.1: base facings chase the live bearings, the attacker's frozen while a swing is
      // committed so a sidestep mid-swing is stepped AWAY from, not tracked. On the line the
      // bearings never move and both integrators sit at them - the golden grid holds that case.
      const bearings = ground.report;
      attackerBaseFacing.update(bearings.attackerFacingRadians, deltaSeconds, { frozen: swingLive });
      defenderBaseFacing.update(bearings.defenderFacingRadians, deltaSeconds);
      const defenderStep = defenderFeet.update({ deltaSeconds, separationMeters: ground.separationMeters });
      if (defenderStep.meters !== 0) ground.moveDefender(defenderStep.meters);
      // R19B.1: the attacker's feet stop while a swing is still travelling. The step into the blow
      // owns their movement for those frames, and letting both drive at once would double the
      // distance every measured coverage band was taken against.
      //
      // "Still travelling" rather than "an attack exists": the advance runtime keeps its plan until
      // the next exchange resets it, so gating on that alone locked the attacker's feet from the
      // first swing of the session onwards. The step is spent at contact, and from that frame the
      // attacker owns their own feet again.
      const attackerStep = attackerFeetLocked()
        ? null
        : attackerFeet.update({ deltaSeconds, separationMeters: ground.separationMeters });
      if (attackerStep && attackerStep.meters !== 0) ground.moveAttacker(attackerStep.meters);
      // Closing the gap is walking forward, so the sign flips: the ledger speaks in separation.
      if (attackerStep) attackerGait.advance({ travelledMeters: -attackerStep.meters, deltaSeconds });
      else attackerGait.settle();
      defenderGait.advance({ travelledMeters: -defenderStep.meters, deltaSeconds });
      // Stamped every frame rather than only on movement: a facing can still be turning while
      // both pairs of feet are planted, and the stamp is absolute and idempotent.
      apply();
      return Object.freeze({ defenderStep, attackerStep });
    },
    get defenderIntent() { return defenderFeet.intent; },
    get attackerIntent() { return attackerFeet.intent; },
    get attackerFeetLocked() { return attackerFeetLocked(); },
    get attackerGait() { return attackerGait.report; },
    setWalkDurations(durations) {
      walkDurations = { forward: durations?.forward || 1, backward: durations?.backward || 1 };
      return walkDurations;
    },
    // Null when that fighter is standing, which is the caller's signal to keep the idle.
    get attackerWalkSample() { return walkSampleFor(attackerGait.report); },
    get defenderGait() { return defenderGait.report; },
    // R19E.1, first slice of the sandwich: sample the walk on the defender and keep only the leg
    // chain. Called immediately before the guard runtime samples its own clip over the whole rig.
    // `exchangeIdle` is the caller's word that no attack is in flight and no impact is resolving -
    // the guard owns the entire fighter during an exchange, planted crouch included, and every
    // coverage band was measured on those planted legs.
    sampleDefenderWalk(exchangeIdle) {
      pendingDefenderLegPose = null;
      const defender = labScene.defender;
      const sample = walkSampleFor(defenderGait.report);
      if (!sample || !defender?.sampleAnimation || !services?.captureRigPose) return null;
      const gate = canWalkOverlayLegs({
        attackInFlight: !exchangeIdle,
        combatResolving: !exchangeIdle,
      });
      if (!gate.allowed) return gate;
      defender.sampleAnimation(sample.clipId, sample.timeSeconds, {
        loop: true, inPlace: true, rootRotationPolicy: 'lock',
      });
      defender.update(0, labScene.camera);
      pendingDefenderLegPose = filterPoseToWalkOverlay(services.captureRigPose(defender.rig));
      return gate;
    },
    // Second slice: after the guard has rebuilt the whole rig, lay the walk's legs back on top.
    overlayDefenderWalkLegs() {
      if (!pendingDefenderLegPose) return false;
      services.applyRigPose(labScene.defender.rig, pendingDefenderLegPose);
      pendingDefenderLegPose = null;
      return true;
    },
    // A landed blow is the only thing that banks ground. The outcome decides which way it moves:
    // blocking costs the defender more than the attacker, a parry costs the attacker far more.
    settle(outcome) {
      const settled = ground.settleImpact(outcome);
      if (settled) { exchangeSettled = true; apply(); }
      return settled;
    },
    // Ends the exchange without a landed blow. The step is banked rather than given back, so a
    // whiffed lunge leaves the attacker deep instead of snapping them home. Intent survives -- a
    // held key is still held.
    endExchange() {
      swingLive = false;
      advance.reset();
      // A settled exchange already banked its step; only an unresolved one still has travel to keep.
      if (!exchangeSettled) ground.settleWhiff();
      exchangeSettled = false;
      return apply();
    },
    // R19D.1: back to the scene's calibrated stance, forgetting the ground the fight moved. Two
    // callers need this and nothing else does: the boot sequence, whose demo attack must not spend
    // the player's opening position, and a runtime stance change, after which offsets earned at
    // the old distance describe a fight that no longer exists. Held keys and the gait's phase
    // survive - only the ground is forgotten.
    get defenderFacingYawRadians() { return guardFacingTurn.yawRadians; },
    resetLane() {
      guardFacingTurn.reset();
      labScene.setDefenderYawOffset(0);
      // The lane reset teleports the fighters back to stance; facing teleports with them.
      attackerBaseFacing.snapTo(0);
      defenderBaseFacing.snapTo(Math.PI);
      swingLive = false;
      exchangeSettled = false;
      advance.reset();
      ground.rebase(labScene.engagementStance.separationMeters);
      return apply();
    },
    get report() { return ground.report; },
    get separationMeters() { return ground.separationMeters; },
  });
}
