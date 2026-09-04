import { createAttackAdvanceRuntime } from '../combat/attack-advance.js';
import { createGuardFacingTurnRuntime } from '../combat/guard-facing-turn.js';
import { createBaseFacingRuntime, wrapAngleRadians } from '../combat/base-facing.js';
import { planSwingFacingPolicy } from '../combat/swing-windup-tracking.js';
import { createEngagementGround } from '../combat/engagement-ground.js';
import { createLaneLocomotionRuntime, planLateralStep } from '../combat/lane-locomotion.js';
import { createDodgeStateRuntime, DODGE_DURATION_SECONDS } from '../combat/dodge-state.js';
import { createLaneWalkCycle, walkClipTimeSeconds } from '../combat/lane-walk-cycle.js';
import { filterPoseToWalkOverlay, planWalkOverlay } from '../combat/guard-walk-overlay.js';
import { blendSprintUpperBody, resolveSprintArmClip, sprintArmSamplePhase, sprintArmWeight } from '../combat/sprint-arm-overlay.js';
import { TRAVEL_YAW_BONES, hipYawDeltaQuaternion, planTravelRelativeLegs } from '../combat/travel-relative-legs.js';

// R18Z.1 — where the two fighters are standing, and nothing else.
//
// Two rules and one mechanism, kept together because they are one question. attack-advance says how
// far a swing carries the attacker; engagement-ground keeps the ledger of what each fighter has
// gained or given up; this writes the result onto the scene. Splitting them across the entry meant
// three separate calls all having to remember to re-apply, which is exactly the kind of ordering
// the entry should not be carrying.
//
// It owns no authority over whether anything was hit. It is told an outcome and moves people.
export function createShieldParryLaneController({
  labScene, walkClips, services, sprintArmClipId, wholeBodyRun = true, runPlaybackAuthored = true,
}) {
  // R21Y.1: which run the arms are borrowed from. Resolved once, here, so an unmeasured name can
  // never reach the sampler - an overlay with no phase offset swings the arms against the feet.
  const sprintArmClip = resolveSprintArmClip(sprintArmClipId);
  // Durations arrive after the assets load, so the clips are described here and measured later.
  // R20W.2: keyed by clip id rather than by direction, because the gait now picks between three.
  let clipDurations = {};
  const advance = createAttackAdvanceRuntime();
  const guardFacingTurn = createGuardFacingTurnRuntime();
  // R19T.1: each body's facing is integrated, not read off the bearing - the ledger keeps
  // reporting the instantaneous bearing as a fact, and these give it inertia. The attacker's
  // freezes for the length of a committed swing (soft tracking at strength zero until B4).
  const attackerBaseFacing = createBaseFacingRuntime();
  const defenderBaseFacing = createBaseFacingRuntime();
  const defenderFeet = createLaneLocomotionRuntime();
  let defenderLateralIntent = 0; // R19V.1: A/D, the defender's own left/right
  let attackerLateralIntent = 0; // R24B.1: the drive's circling, the attacker's own left/right
  let lastAttackerTravelPlan = null; // R24B.1: the attacker's stride, turned along their travel like the defender's
  // R20F.1: the dodge state. A committed 0.4s burst that owns the defender's feet while it
  // runs; its i-frames are read by the contact lifecycle, its guard cost by the pre-contact
  // commitment chain - this controller only moves the body and plays the clip.
  const dodge = createDodgeStateRuntime();
  const attackerFeet = createLaneLocomotionRuntime();
  // R19C.2: the attacker's gait, driven by the distance the ledger actually moved them rather than
  // by elapsed time, so the feet cannot disagree with the ground about how far anybody went.
  const attackerGait = createLaneWalkCycle();
  // R19E.1: the defender walks too, but their guard IS their base clip, so their walk is a leg
  // overlay rather than a base swap: sample the walk, keep the leg chain, let the guard sample the
  // whole rig as always, then lay the legs back on top. The captured legs live here between the
  // two steps of that sandwich.
  // R22E.1: the defender's gait alone takes the experiment switch - the attacker is not the thing
  // being looked at, and leaving it on the walk keeps a side-by-side in one frame.
  const defenderGait = createLaneWalkCycle({ wholeBodyRun, runPlaybackAuthored });
  let pendingDefenderLegPose = null;
  let pendingAttackerLegPose = null; // R23T.1: the opponent's walk, read off the rig before their guard rebuilds it
  // R20W.2: the last overlay decision, kept for the HUD and for probes - which of the fighter the
  // walk got this frame, and why it did not get any of them when it did not.
  let lastWalkOverlayPlan = null;
  let lastSprintArmWeight = 0;
  // R20X.1: how far the stride has to be turned at the hip to point along this frame's travel.
  // Zero for anything going straight ahead, a right angle for a pure sidestep.
  let lastTravelPlan = null;
  // R20W.1: ground the player took this frame through the world-frame verbs, waiting to be spent
  // on the gait. Free movement writes straight to the ledger, so before this the defender's legs
  // were fed a lane step that is always zero for the player - measured in the lab as 1.04 m/s of
  // travel against a gait reporting 0.00 m/s, which is a body gliding with its legs held still.
  // Accumulated here and consumed once in walk(), so the gait keeps exactly one writer per frame.
  let pendingWorldTravel = { x: 0, z: 0 };
  const ground = createEngagementGround({
    startSeparationMeters: labScene.engagementStance.separationMeters,
  });

  // Told by the caller rather than inferred. The advance runtime keeps its plan until the next
  // exchange resets it, and re-sampling it at elapsed 0 between attacks makes it look like a swing
  // that has not started yet - so asking it whether a swing is live gave the wrong answer in both
  // directions, and locked the attacker's feet from the first swing of the session onwards.
  let swingLive = false;
  let swingPhase = null; // R20B.1: the runtime's word on windup vs active, told alongside swingLive
  // R19B.2: once a blow has settled, its step is banked and must never be fed back in. The attack
  // animation keeps running past contact, so the frame loop would otherwise re-report the same
  // travel as an unspent swing on top of the ground it had already become - and the next exchange
  // would bank it a second time. Measured before this flag existed: a single blocked TOP attack
  // moved the attacker 1.56m instead of 0.70m, and repeated lunges walked him clean through the
  // defender past the minimum separation.
  let exchangeSettled = false;
  // R23C.1: which of the two is swinging. One exchange runs at a time - there is still exactly one
  // advance runtime, one live flag and one settled flag - but the exchange is no longer assumed to
  // belong to the attacker slot. Everything below that used to say "the attacker" because that was
  // the only fighter who could swing now says "the swinger" and looks this up. Nothing passes
  // 'defender' yet, so every path the golden grid measures resolves to 'attacker' and runs the
  // arithmetic it always ran.
  let swingingSlot = 'attacker';
  const baseFacingFor = (slot) => (slot === 'defender' ? defenderBaseFacing : attackerBaseFacing);
  // R19B.1 generalised: the step into the blow owns its owner's movement for those frames, and
  // letting the feet drive as well would double the distance every measured coverage band was
  // taken against. That rule was never a fact about the attacker - it is a fact about the swing -
  // so it asks whose swing this is before it locks anybody.
  function feetLockedFor(slot) {
    return swingLive && swingingSlot === slot && advance.report?.complete !== true;
  }
  function attackerFeetLocked() {
    return feetLockedFor('attacker');
  }

  function walkSampleFor(gait) {
    // R20W.1: the gait names its own clip now, because the phase it holds was advanced against
    // that clip's measured stride. Choosing the clip out here a second time could disagree.
    if (!gait?.moving || !gait.clipId || !walkClips) return null;
    const duration = clipDurations[gait.clipId] || 1;
    return Object.freeze({ clipId: gait.clipId, timeSeconds: walkClipTimeSeconds(gait.phase, duration) });
  }

  // R20X.1: swing the stride to point along travel. Only the two upper legs are touched, so the
  // knees and feet follow and the pelvis - and with it the spine, the guard and the shield - does
  // not. The quaternion maths is in travel-relative-legs.js; this is the part that needs a scene.
  function applyTravelYawToLegs(fighter = labScene.defender, plan = lastTravelPlan) { // R24B.1: for either fighter
    const yaw = plan?.legYawRadians || 0;
    if (Math.abs(yaw) < 1e-3) return false;
    const bones = fighter?.rig?.bones;
    const hips = bones?.hips;
    if (!hips?.getWorldQuaternion) return false;
    const parentWorld = hips.quaternion.clone();
    hips.getWorldQuaternion(parentWorld);
    const delta = hipYawDeltaQuaternion(yaw, parentWorld);
    const applied = hips.quaternion.clone();
    applied.set(delta.x, delta.y, delta.z, delta.w);
    for (const id of TRAVEL_YAW_BONES) bones[id]?.quaternion.premultiply(applied);
    fighter.rig.root.updateMatrixWorld(true);
    return true;
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
    // R23C.1: the swinger is told, not assumed. Omitting it keeps the attacker, which is what
    // every caller in the lab does today and what the golden replay is measured against.
    startAttack(direction, contactSeconds, { swinger = 'attacker' } = {}) {
      swingingSlot = swinger;
      exchangeSettled = false;
      return advance.start({ direction, contactSeconds, startSeconds: 0 });
    },
    // Called every frame of a live swing, before anything reads a world position: the guard tracks
    // the attacker and the swept probe measures the blade, so both must see where the step has
    // actually carried him.
    update(elapsedSeconds, attacking = true, phase = null) {
      swingLive = Boolean(attacking);
      swingPhase = swingLive ? phase : null;
      if (!swingLive || exchangeSettled) return ground.report;
      // R19U.1: the swing spends its metres along the attacker's frozen facing - the same value
      // the R19T freeze holds for the length of the commitment. On the lane that facing is zero
      // and the ledger's exact legacy path runs.
      ground.setSwing(advance.update(elapsedSeconds)?.advanceMeters ?? 0,
        baseFacingFor(swingingSlot).facingRadians, { swinger: swingingSlot });
      return apply();
    },
    // Feet run every frame, attack or no attack, which is the point: standing still is a choice
    // somebody is making rather than the only thing available to them.
    // R20S.3: the world-frame verbs, for free movement. Pass-throughs rather than new mechanism -
    // the ledger already clamps a world move exactly as it clamps a lane step, and routing them
    // here keeps the ledger's ownership intact (nothing outside this file holds `ground`).
    moveDefenderWorld(deltaX, deltaZ) {
      // R20W.1: measured rather than requested. The ledger can refuse part of a move - walking into
      // the opponent stops at the contact floor - and feet that count the request keep striding
      // against a wall. Read the position either side and bank what actually happened, which is the
      // same rule the lane step follows.
      const before = ground.report.defenderPosition;
      const result = ground.moveDefenderWorld(deltaX, deltaZ);
      const after = ground.report.defenderPosition;
      pendingWorldTravel = {
        x: pendingWorldTravel.x + (after.x - before.x),
        z: pendingWorldTravel.z + (after.z - before.z),
      };
      return result;
    },
    // null hands facing back to the gap, which is what a lock does. Anything else is owned facing,
    // and the base-facing integrator gives it the same inertia every other turn in this lab has.
    setDefenderFacing(radians) { return ground.setDefenderFacing(radians); },
    setDefenderIntent(intent) {
      return defenderFeet.setIntent(intent);
    },
    setDefenderLateralIntent(intent) {
      defenderLateralIntent = Math.sign(Number(intent) || 0);
      return defenderLateralIntent;
    },
    // R24B.1: the attacker's sidestep, the drive's verb. Same normalisation, same lock under a swing.
    setAttackerLateralIntent(intent) {
      attackerLateralIntent = Math.sign(Number(intent) || 0);
      return attackerLateralIntent;
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
      // R20B.1: track-then-freeze. The windup chases the bearing at the measured 45 deg/s, the
      // active window and everything after stay frozen - the release point a future dodge verb
      // will be timed against. On the line the bearing never moves and tracking is inert.
      // R23C.1: the freeze belongs to whoever committed the swing. The other one keeps chasing
      // the bearing, which is what an uncommitted fighter does and what the defender has always
      // done here - so with the attacker swinging these two lines are the two that were here.
      const facingPolicy = planSwingFacingPolicy({ swingLive, phase: swingPhase });
      const swingerFrozen = {
        frozen: facingPolicy.mode === 'frozen',
        rateRadiansPerSecond: facingPolicy.rateRadiansPerSecond,
      };
      attackerBaseFacing.update(bearings.attackerFacingRadians, deltaSeconds,
        swingingSlot === 'attacker' ? swingerFrozen : undefined);
      defenderBaseFacing.update(bearings.defenderFacingRadians, deltaSeconds,
        swingingSlot === 'defender' ? swingerFrozen : undefined);
      // R20F.1: a running dodge owns the defender's movement outright - held walk keys wait.
      // The authored travel goes into the ledger through the same verbs the feet use, so every
      // clamp the ground enforces on walking holds for dodging too.
      ground.advanceYield(deltaSeconds); // R23P.1: ground owed to a blow is paid before anybody's feet read the gap
      const dodgeStep = dodge.advance(deltaSeconds);
      if (dodgeStep.direction === 'back') ground.moveDefender(dodgeStep.displacementMeters);
      else if (dodgeStep.direction === 'forward') ground.moveDefender(-dodgeStep.displacementMeters);
      else if (dodgeStep.direction === 'right') ground.moveDefenderLateral(dodgeStep.displacementMeters);
      else if (dodgeStep.direction === 'left') ground.moveDefenderLateral(-dodgeStep.displacementMeters);
      const dodging = Boolean(dodgeStep.direction);
      // R23C.1: and the swinger's feet are held, whichever fighter that is. A dodge already owned
      // these frames; a swing of their own now does too, on the same rule the attacker has always
      // been held by. Nothing swings from this slot yet, so this reads `dodging` alone today.
      const defenderStep = dodging || feetLockedFor('defender')
        ? Object.freeze({ meters: 0 })
        : defenderFeet.update({ deltaSeconds, separationMeters: ground.separationMeters });
      if (defenderStep.meters !== 0) ground.moveDefender(defenderStep.meters);
      // R19V.1: the sidestep, body-relative - positive intent is the defender's own right.
      // R20T.3 corrected the sign: the old note reasoned that a defender facing -z has their right
      // at world -x, and that is backwards - facing -z is how the default camera faces, and its
      // right is +x. Measured through the real keys with the game camera behind the player, the
      // arrow keys walked the wrong way exactly like WASD did.
      // Presentation debt accepted knowingly: KayKit ships no strafe clip, so a sidestep slides on
      // planted legs in the lab.
      const lateralStep = planLateralStep({
        intent: dodging || feetLockedFor('defender') ? 0 : defenderLateralIntent, deltaSeconds,
      });
      if (lateralStep.meters !== 0) ground.moveDefenderLateral(lateralStep.meters);
      // R19B.1: the attacker's feet stop while a swing is still travelling. The step into the blow
      // owns their movement for those frames, and letting both drive at once would double the
      // distance every measured coverage band was taken against.
      //
      // "Still travelling" rather than "an attack exists": the advance runtime keeps its plan until
      // the next exchange resets it, so gating on that alone locked the attacker's feet from the
      // first swing of the session onwards. The step is spent at contact, and from that frame the
      // attacker owns their own feet again.
      const attackerStep = feetLockedFor('attacker')
        ? null
        : attackerFeet.update({ deltaSeconds, separationMeters: ground.separationMeters });
      if (attackerStep && attackerStep.meters !== 0) ground.moveAttacker(attackerStep.meters);
      // R24B.1: and their sidestep, on the same lock - a swinging attacker's feet are the swing's.
      const attackerLateral = planLateralStep({
        intent: feetLockedFor('attacker') ? 0 : attackerLateralIntent, deltaSeconds,
      });
      if (attackerLateral.meters !== 0) ground.moveAttackerLateral(attackerLateral.meters);
      // Closing the gap is walking forward, so the sign flips: the ledger speaks in separation.
      // R24B.1: the whole travel on one gait, the stride turned along it (R20X.1's plan, in the
      // attacker's own frame: their left is the plan's negative lateral, as the defender's is).
      lastAttackerTravelPlan = planTravelRelativeLegs({
        forwardMeters: attackerStep ? -attackerStep.meters : 0,
        lateralMeters: -attackerLateral.meters,
      });
      if (attackerStep || attackerLateral.meters !== 0) attackerGait.advance({ travelledMeters: lastAttackerTravelPlan.signedTravelMeters, deltaSeconds });
      else attackerGait.settle();
      // R20W.1: both ways the defender can move, spent on one gait. The lane step speaks in
      // separation, so closing the gap is forward and the sign flips; the world travel is turned
      // into the body's own forward axis, which is what the legs are attached to. A pure sidestep
      // therefore contributes nothing and the legs stay planted - the strafe debt KayKit's missing
      // walking strafe leaves us with, unchanged by this and now visible in the gait's own numbers.
      const facing = defenderBaseFacing.facingRadians;
      const worldForwardMeters = pendingWorldTravel.x * Math.sin(facing) + pendingWorldTravel.z * Math.cos(facing);
      // R20X.1: and the other half of the same vector. The lane step has no lateral component - it
      // speaks in separation - so the sidestep only ever arrives through the world verbs.
      const worldLateralMeters = pendingWorldTravel.x * Math.cos(facing) - pendingWorldTravel.z * Math.sin(facing);
      pendingWorldTravel = { x: 0, z: 0 };
      lastTravelPlan = planTravelRelativeLegs({
        forwardMeters: -defenderStep.meters + worldForwardMeters,
        lateralMeters: worldLateralMeters,
      });
      // The whole distance, not its forward projection: once the legs turn to face the travel, the
      // distance the feet cover IS the distance the body covered, whichever way it went.
      defenderGait.advance({ travelledMeters: lastTravelPlan.signedTravelMeters, deltaSeconds });
      // Stamped every frame rather than only on movement: a facing can still be turning while
      // both pairs of feet are planted, and the stamp is absolute and idempotent.
      apply();
      return Object.freeze({ defenderStep, attackerStep });
    },
    get defenderIntent() { return defenderFeet.intent; },
    get defenderLateralIntent() { return defenderLateralIntent; },
    get attackerLateralIntent() { return attackerLateralIntent; }, // R24B.1
    get attackerTravelPlan() { return lastAttackerTravelPlan; }, // R24B.1
    get attackerIntent() { return attackerFeet.intent; },
    get attackerFeetLocked() { return attackerFeetLocked(); },
    get defenderFeetLocked() { return feetLockedFor('defender'); },
    // Who the live exchange belongs to. Readable so a HUD or a probe can say whose swing it is
    // rather than inferring it from an animation.
    get swingingSlot() { return swingingSlot; },
    get attackerGait() { return attackerGait.report; },
    setWalkDurations(durations) {
      clipDurations = { ...(durations || {}) };
      return clipDurations;
    },
    // Null when that fighter is standing, which is the caller's signal to keep the idle.
    get attackerWalkSample() { return walkSampleFor(attackerGait.report); },
    get defenderGait() { return defenderGait.report; },
    get defenderWalkOverlay() { return lastWalkOverlayPlan; },
    // R21U.1: how much of the run's arms the walk is wearing, 0 at a walk and 1 at a sprint. A
    // number rather than a boolean because the whole point is that there is no longer a switch.
    get defenderSprintArmWeight() { return lastSprintArmWeight; },
    // R21Y.1: which clip those arms came from, and why - read by the HUD and stamped into a tally.
    get defenderSprintArmClip() { return sprintArmClip; },
    get defenderTravelPlan() { return lastTravelPlan; },
    // R19E.1, first slice of the sandwich: sample the walk on the defender and keep only the leg
    // chain. Called immediately before the guard runtime samples its own clip over the whole rig.
    // `exchangeIdle` is the caller's word that no attack is in flight and no impact is resolving -
    // the guard owns the entire fighter during an exchange, planted crouch included, and every
    // coverage band was measured on those planted legs.
    sampleDefenderWalk(exchangeIdle, guardOwnsUpperBody = true) {
      pendingDefenderLegPose = null;
      const defender = labScene.defender;
      const gaitReport = defenderGait.report;
      const sample = walkSampleFor(gaitReport);
      if (!sample || !defender?.sampleAnimation || !services?.captureRigPose) return null;
      // R21U.1: the run's arms, if the body is going fast enough to be running.
      //
      // R21X.1 moved this ABOVE the gate, because it answers the gate's own question. The lab was
      // telling this call that the guard owns the upper body whenever the mode is not 'block' -
      // written in R20W.2, when the only thing that wanted the torso was a whole-body RUN clip -
      // so in parry mode the run's arms were sampled, blended, and then dropped by the filter on
      // the way out. Measured in the lab: parry scope 'legs', block scope 'whole-body', arm weight
      // 1.0 in both. The arms were borrowed and thrown away.
      //
      // A speed above the ramp's floor is itself proof the guard is not using the arms, and that is
      // measured rather than assumed: the ramp begins at 1.359 m/s (Froude 0.5 on this rig) and the
      // fastest a guarding fighter can travel is the walk's 1.0. Sprinting is refused outright
      // while the guard is up, so the two facts cannot disagree - and until now they did, with
      // planSprint reading the guard as down and this call being told it was up.
      //
      // R22G.1: zero when the legs are already WEARING the run. The overlay samples the run at the
      // walk's phase minus the alignment offset, which is correct when the body underneath is the
      // walk - and wrong by exactly that offset when the body underneath is already the run. The
      // arms would be borrowed from 12.7% earlier in the same clip they are being laid on.
      const armWeight = gaitReport.wholeBodyOnly === true
        ? 0
        : sprintArmWeight(gaitReport.speedMetersPerSecond);
      // R22G.1: whether the BODY is running, which is the question the gate below actually needs.
      // Keying that off the arm weight alone was right only while the overlay was the sole way to
      // run: once the legs wear the run themselves the weight is zero, the demotion below stopped
      // firing, and in parry mode planWalkOverlay refused a whole-body clip outright - scope
      // 'none', the sprint invisible again, exactly the R21X.1 bug from the other direction.
      // Caught by the browser probe, not by any test, which is why that probe exists.
      const bodyIsRunning = gaitReport.wholeBodyOnly === true || armWeight > 0;
      // R20W.2: how much of the fighter the walk gets. A run has no legs-only reading, and the
      // gait says so itself, so a run clip can never be handed to a guarding fighter's legs.
      const gate = planWalkOverlay({
        attackInFlight: !exchangeIdle,
        combatResolving: !exchangeIdle,
        guardOwnsUpperBody: guardOwnsUpperBody && !bodyIsRunning,
        wholeBodyClip: gaitReport.wholeBodyOnly === true,
      });
      lastWalkOverlayPlan = gate;
      if (!gate.allowed) { lastSprintArmWeight = 0; return gate; }
      // Sampled FIRST so the rig is left holding the walk - the pose below is what the caller
      // applies, but a reader stepping through this should not find the fighter mid-run at the end
      // of a walk sample.
      //
      // The run is sampled at the phase where it strikes with the walk (R21T.1 measured +20.7% of
      // a cycle), because arm swing is coupled to the opposite leg: unaligned, the arms would swing
      // against the feet, which reads worse than not borrowing them at all.
      let runArmPose = null;
      if (armWeight > 0 && sprintArmClip.clipId) {
        const runDuration = clipDurations[sprintArmClip.clipId] || 1;
        defender.sampleAnimation(sprintArmClip.clipId,
          sprintArmSamplePhase(gaitReport.phase, sprintArmClip.clipId) * runDuration,
          { loop: true, inPlace: true, rootRotationPolicy: 'lock' });
        defender.update(0, labScene.camera);
        runArmPose = services.captureRigPose(defender.rig);
      }
      defender.sampleAnimation(sample.clipId, sample.timeSeconds, {
        loop: true, inPlace: true, rootRotationPolicy: 'lock',
      });
      defender.update(0, labScene.camera);
      // Blended before the filter, not after. At LEGS scope the upper-body entries are dropped,
      // which is still the right answer for a guarding fighter walking - but a fighter at running
      // speed can no longer BE at LEGS scope, because the arm weight above decides the scope.
      // R21X.1: before that, this comment was describing a case the sprint fell into every time in
      // parry mode. R22A.1: the entries now include the torso, and the same reasoning covers it -
      // sprinting is refused with the guard up, so the guard is never the one losing those bones.
      const walkPose = services.captureRigPose(defender.rig);
      lastSprintArmWeight = armWeight;
      pendingDefenderLegPose = filterPoseToWalkOverlay(
        blendSprintUpperBody(walkPose, runArmPose, armWeight), gate.scope,
      );
      return gate;
    },
    // R20F.1: the dodge is a full-body clip and the last pre-strike writer: it overrides the
    // guard sample outright, and only a landed blade (the strike reaction, sampled after this)
    // outranks it. In-place with a locked root - the ledger already moved the body.
    overlayDefenderDodge() {
      const running = dodge.report;
      if (!running.dodging || !labScene.defender?.sampleAnimation) return false;
      labScene.defender.sampleAnimation(running.clipId,
        Math.min(running.elapsedSeconds, DODGE_DURATION_SECONDS - 1e-3),
        { loop: false, inPlace: true, rootRotationPolicy: 'lock' });
      labScene.defender.update(0, labScene.camera);
      return true;
    },
    // R20F.1: input asks, the state decides - mid-dodge and cooldown refusals live in the rule.
    tryDodge(direction) {
      return dodge.tryStart({ direction });
    },
    get dodgeReport() { return dodge.report; },
    // Second slice: after the guard has rebuilt the whole rig, lay the walk's legs back on top.
    // R23T.1: the opponent walks in guard now, the way the player has since R19E. Their walk is
    // already on the rig - the engagement's sampleBase wrote it - so the legs are read off the rig
    // after that write and laid back after the guard's, rather than sampled a second time.
    captureAttackerWalkLegs() {
      pendingAttackerLegPose = null;
      const attacker = labScene.attacker;
      if (!walkSampleFor(attackerGait.report) || !attacker?.rig || !services?.captureRigPose) return false;
      pendingAttackerLegPose = filterPoseToWalkOverlay(services.captureRigPose(attacker.rig));
      return true;
    },
    overlayAttackerWalkLegs() {
      if (!pendingAttackerLegPose) return false;
      services.applyRigPose(labScene.attacker.rig, pendingAttackerLegPose);
      pendingAttackerLegPose = null;
      applyTravelYawToLegs(labScene.attacker, lastAttackerTravelPlan); // R24B.1
      return true;
    },
    overlayDefenderWalkLegs() {
      if (!pendingDefenderLegPose) return false;
      services.applyRigPose(labScene.defender.rig, pendingDefenderLegPose);
      pendingDefenderLegPose = null;
      applyTravelYawToLegs();
      return true;
    },
    // A landed blow is the only thing that banks ground. The outcome decides which way it moves:
    // blocking costs the defender more than the attacker, a parry costs the attacker far more.
    settle(outcome) {
      const settled = ground.settleImpact(outcome, { swinger: swingingSlot });
      if (settled) { exchangeSettled = true; apply(); }
      return settled;
    },
    // Ends the exchange without a landed blow. The step is banked rather than given back, so a
    // whiffed lunge leaves the attacker deep instead of snapping them home. Intent survives -- a
    // held key is still held.
    endExchange() {
      swingLive = false;
      swingPhase = null;
      advance.reset();
      // A settled exchange already banked its step; only an unresolved one still has travel to keep.
      if (!exchangeSettled) ground.settleWhiff({ swinger: swingingSlot });
      exchangeSettled = false;
      swingingSlot = 'attacker';
      return apply();
    },
    // R19D.1: back to the scene's calibrated stance, forgetting the ground the fight moved. Two
    // callers need this and nothing else does: the boot sequence, whose demo attack must not spend
    // the player's opening position, and a runtime stance change, after which offsets earned at
    // the old distance describe a fight that no longer exists. Held keys and the gait's phase
    // survive - only the ground is forgotten.
    get defenderFacingYawRadians() { return guardFacingTurn.yawRadians; },
    // R20T.1: the facings actually stamped on the scene, after the integrators. The ledger's
    // report carries the instantaneous bearing (a fact about the gap); these are where the bodies
    // are pointed, which is what an aim error is measured against.
    get attackerBaseFacingRadians() { return attackerBaseFacing.facingRadians; },
    get defenderBaseFacingRadians() { return defenderBaseFacing.facingRadians; },
    // R19Z.1: how far the defender's body still deviates from square to the attacker - the
    // integrated base facing against the ledger's instantaneous bearing. Same sign convention
    // the cone was measured in (base facing and probe yaw add in the same rotation space, so
    // positive rotates the shield side toward the attacker), and the R19Q guard turn is
    // excluded because the sweep measured the cone with that turn running on top of exactly
    // this error. On the line the bearing never moves and this reads zero.
    get defenderFacingErrorRadians() {
      // R20V.1: against the BEARING - where the opponent actually is - not against the report's
      // facing. Those were the same number when this was written, because facing was always
      // derived from the gap. Free movement made facing something a fighter can own, and then this
      // compared the integrator against its own target and reported zero exactly when the error
      // mattered: a defender turned 90 degrees away read as perfectly square, so the cone gate
      // committed the whole coverage choreography to a blow it could not reach. Locked, owned
      // facing is null and the two are identical to the bit, which is what keeps the goldens
      // honest.
      return wrapAngleRadians(defenderBaseFacing.facingRadians - ground.report.defenderBearingRadians);
    },
    resetLane() {
      defenderLateralIntent = 0;
      attackerLateralIntent = 0; // R24B.1
      dodge.reset();
      guardFacingTurn.reset();
      labScene.setDefenderYawOffset(0);
      // The lane reset teleports the fighters back to stance; facing teleports with them.
      attackerBaseFacing.snapTo(0);
      defenderBaseFacing.snapTo(Math.PI);
      swingLive = false;
      swingPhase = null;
      exchangeSettled = false;
      swingingSlot = 'attacker';
      advance.reset();
      ground.rebase(labScene.engagementStance.separationMeters);
      return apply();
    },
    get report() { return ground.report; },
    get separationMeters() { return ground.separationMeters; },
    get settledSeparationMeters() { return ground.report.settledSeparationMeters; }, // R24E.2: once the ground a blow owes is paid
  });
}
