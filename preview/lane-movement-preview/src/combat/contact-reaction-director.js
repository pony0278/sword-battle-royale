import { createParryRootDisplacementRuntime } from './parry-root-displacement.js';
import { createParryArmFlingRuntime } from './parry-arm-fling.js';
import { createParriedTorsoWorldLeanRuntime } from './parried-torso-world-lean.js';

export const CONTACT_REACTION_DIRECTOR_STAGE = 'R18S.1';

// R18S.1: The contact reaction is five runtimes, and the parts were never the hard bit - the
// orchestration was, and it lived in the lab file. What this owns is the knowledge that could not
// be moved by moving the modules:
//
//   * which excitation the release impulse is built from, and that it is the *peak* of the shield
//     sweep and the attacker's hand, not the last frame's value;
//   * that all five arm together off one outcome and one backward axis;
//   * the order the writers run in after the presentation has rebuilt the pose, which is a
//     dependency order and not a preference;
//   * that the defender's half runs after its own guard rebuild, not with the attacker's;
//   * that the line avatar has to be repainted once the last writer has moved a bone.
//
// It owns no contact authority. Real swept Sword x Shield contact still decides what happened;
// this only stages what that outcome looks like.

// Velocities are read off world positions frame to frame, so a presentation rebuild or a teleport
// can produce a number that is arithmetically real and physically nonsense. These caps are what
// separates "the shield swept through the blade" from "a bone jumped".
const EXCITATION_LIMITS = Object.freeze({
  minimumSpeedMps: 0.05,
  maximumTrackedSpeedMps: 20,
  maximumIncomingSpeedMps: 12,
  maximumSweepSpeedMps: 6,
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function speedOf(velocity) {
  return velocity ? Math.hypot(finite(velocity.x), finite(velocity.y), finite(velocity.z)) : 0;
}

function saneVelocity(velocity, capMetersPerSecond) {
  if (!velocity) return null;
  const speed = speedOf(velocity);
  return speed > EXCITATION_LIMITS.minimumSpeedMps && speed <= capMetersPerSecond ? velocity : null;
}

function worldPositionOf(THREE, bone) {
  if (!THREE?.Vector3 || !bone?.getWorldPosition) return null;
  const world = bone.getWorldPosition(new THREE.Vector3());
  return { x: world.x, y: world.y, z: world.z };
}

function velocityBetween(current, previous, deltaSeconds) {
  return {
    x: (current.x - previous.x) / deltaSeconds,
    y: (current.y - previous.y) / deltaSeconds,
    z: (current.z - previous.z) / deltaSeconds,
  };
}

function peakOf(candidate, standing) {
  const speed = speedOf(candidate);
  if (!(speed > speedOf(standing)) || speed >= EXCITATION_LIMITS.maximumTrackedSpeedMps) return standing;
  return candidate;
}

function mirror(direction) {
  return direction ? { x: -direction.x, y: 0, z: -direction.z } : null;
}

// Exposed because the caller has to make the same judgement before it decides whether to fall
// back to a canonical direction velocity: an incoming velocity that fails this test is not a
// slower impact, it is a reading the caller should replace rather than pass on as nothing.
export function sanitizeIncomingVelocity(velocity) {
  return saneVelocity(velocity, EXCITATION_LIMITS.maximumIncomingSpeedMps);
}

export function createContactReactionDirector(THREE, {
  attackerRig,
  defenderRig,
  // R18V.2: only supplied by a caller that moves the fighters itself. Left out, each displacement
  // captures the root where the hit landed and re-derives from there, which is what a fight
  // between two planted actors wants. Supplied, the recoil rides on top of the caller's position
  // instead of overwriting it for the length of the reaction.
  readAttackerBasePosition,
  readDefenderBasePosition,
} = {}) {
  const attackerRootDisplacement = createParryRootDisplacementRuntime({
    rig: attackerRig, readBasePosition: readAttackerBasePosition,
  });
  const defenderRootDisplacement = createParryRootDisplacementRuntime({
    rig: defenderRig, readBasePosition: readDefenderBasePosition,
  });
  const attackerArmFling = createParryArmFlingRuntime(THREE, { rig: attackerRig });
  const attackerTorsoLean = createParriedTorsoWorldLeanRuntime(THREE, { rig: attackerRig });
  // Blocking is absorption, so the defender leans too.
  const defenderTorsoLean = createParriedTorsoWorldLeanRuntime(THREE, { rig: defenderRig });

  let previousShieldSurfaceCenter = null;
  let peakShieldSweepVelocity = null;
  let previousHandWorld = null;
  let peakHandVelocity = null;

  // The excitation the release impulse is built from: the defender's own parry sweep, and the
  // attacker's hand riding it. Peak rather than latest on both counts - by the release frame the
  // grip constraint has parked the hand against the shield, so the last frame is noise.
  function trackExcitation({ bucklerSurface, deltaSeconds } = {}) {
    const center = bucklerSurface?.center || null;
    if (!center || !(deltaSeconds > 1e-6)) {
      previousShieldSurfaceCenter = center;
      return;
    }
    if (previousShieldSurfaceCenter) {
      peakShieldSweepVelocity = peakOf(
        velocityBetween(center, previousShieldSurfaceCenter, deltaSeconds),
        peakShieldSweepVelocity,
      );
    }
    previousShieldSurfaceCenter = center;

    const handWorld = worldPositionOf(THREE, attackerRig?.bones?.['hand.r']);
    if (!handWorld) return;
    if (previousHandWorld) {
      peakHandVelocity = peakOf(
        velocityBetween(handWorld, previousHandWorld, deltaSeconds),
        peakHandVelocity,
      );
    }
    previousHandWorld = handWorld;
  }

  // The actor axis both reactions push along: hips to hips, so it survives either actor turning.
  function backwardDirection({ fallbackDirection = null } = {}) {
    const attackerHips = worldPositionOf(THREE, attackerRig?.bones?.hips);
    const defenderHips = worldPositionOf(THREE, defenderRig?.bones?.hips);
    if (attackerHips && defenderHips) {
      const x = attackerHips.x - defenderHips.x;
      const z = attackerHips.z - defenderHips.z;
      const magnitude = Math.hypot(x, z);
      if (magnitude > 1e-6) return { x: x / magnitude, y: 0, z: z / magnitude };
    }
    return fallbackDirection;
  }

  // Arms all five runtimes for one outcome. Parry calls this at DEFLECT_IMPULSE, once the swept
  // probe has finished owning the geometry; block calls it at impact, because a held shield never
  // takes the blade hostage and there is no release marker to wait for.
  function arm({ outcome, backwardDirection: axis, contactPoint, surfaceNormal, incomingVelocity } = {}) {
    // The hand pair travels together: both are read off the live contact, so a block - which never
    // has one - arms without either rather than with half of it.
    const handReleaseVelocity = saneVelocity(peakHandVelocity, EXCITATION_LIMITS.maximumSweepSpeedMps);
    const armFlingPlan = attackerArmFling.start({
      outcome,
      contactPoint,
      surfaceNormal,
      normalSideHint: axis,
      incomingVelocity: saneVelocity(incomingVelocity, EXCITATION_LIMITS.maximumIncomingSpeedMps),
      shieldSweepVelocity: saneVelocity(peakShieldSweepVelocity, EXCITATION_LIMITS.maximumSweepSpeedMps),
      handOrigin: handReleaseVelocity ? worldPositionOf(THREE, attackerRig?.bones?.['hand.r']) : null,
      handReleaseVelocity,
      momentum: 1,
    });
    const torsoLeanPlan = axis
      ? attackerTorsoLean.start({ outcome, role: 'attacker', backwardDirection: axis })
      : null;
    const defenderTorsoLeanPlan = axis
      ? defenderTorsoLean.start({ outcome, role: 'defender', backwardDirection: mirror(axis) })
      : null;
    const attackerDisplacement = attackerRootDisplacement.start({
      role: 'attacker', outcome, backwardDirection: axis, momentum: 1,
    });
    const defenderDisplacement = axis
      ? defenderRootDisplacement.start({
          role: 'defender', outcome, backwardDirection: mirror(axis), momentum: 1,
        })
      : null;

    return Object.freeze({
      stage: CONTACT_REACTION_DIRECTOR_STAGE,
      armFlingPlan,
      attackerDisplacement,
      reports: Object.freeze({
        armFling: armFlingPlan?.accepted === true
          ? Object.freeze({
              outcome,
              impulseMagnitudeNs: armFlingPlan.impulseMagnitudeNs,
              impulse: armFlingPlan.impulse,
              carryDirection: armFlingPlan.carryDirection,
              shoulderAxis: armFlingPlan.joints.shoulder.axis,
              shoulderInitialVelocityRadPerSecond: armFlingPlan.joints.shoulder.initialVelocityRadPerSecond,
              startsAfterDeflectImpulse: outcome !== 'block',
            })
          : Object.freeze({ accepted: false, reason: armFlingPlan?.reason || 'not-planned' }),
        torsoLean: torsoLeanPlan?.accepted === true
          ? Object.freeze({
              outcome,
              baseLeanDegrees: torsoLeanPlan.baseLeanDegrees,
              targetBackwardLeanDegrees: torsoLeanPlan.targetBackwardLeanDegrees,
              defenderArmed: defenderTorsoLeanPlan?.accepted === true,
            })
          : Object.freeze({ accepted: false, reason: torsoLeanPlan?.reason || 'not-planned' }),
        rootDisplacement: Object.freeze({
          outcome,
          attacker: attackerDisplacement?.accepted === true
            ? Object.freeze({
                peakMeters: attackerDisplacement.peakMeters,
                durationMs: attackerDisplacement.durationMs,
              })
            : null,
          defender: defenderDisplacement?.accepted === true
            ? Object.freeze({
                peakMeters: defenderDisplacement.peakMeters,
                durationMs: defenderDisplacement.durationMs,
              })
            : null,
          startsAfterDeflectImpulse: outcome !== 'block',
          reason: attackerDisplacement?.accepted === true
            ? null
            : attackerDisplacement?.reason || 'not-planned',
        }),
      }),
    });
  }

  // Writers after the presentation, in dependency order: the world-lean servo re-measures and
  // corrects the torso (moving the shoulder), the arm fling then rewrites the arm bones from its
  // own release-time base (replacing, not stacking on, the presentation's arm aim), and the root
  // displacement translates last. Both roots advance on this one clock; only the attacker's is
  // applied here, because the defender's pose has not been rebuilt yet this frame.
  function advanceAttacker(deltaMs, { torsoWeight = 1 } = {}) {
    attackerTorsoLean.advance(deltaMs);
    const torsoLeanReport = attackerTorsoLean.apply({ torsoWeight });
    attackerArmFling.advance(deltaMs);
    const armFlingReport = attackerArmFling.apply();
    attackerRootDisplacement.advance(deltaMs);
    defenderRootDisplacement.advance(deltaMs);
    const rootDisplacementReport = attackerRootDisplacement.apply();
    return Object.freeze({
      torsoLeanReport,
      armFlingReport,
      rootDisplacementReport,
      // The v3 line avatar is only rebuilt inside the character's appearance update, which ran
      // before these last writers rotated the bones. Without a repaint the joint nodes follow the
      // corrected pose while the lines stay one authority behind, on every frame.
      repaintRequired: attackerTorsoLean.active || attackerArmFling.active || attackerRootDisplacement.active,
    });
  }

  // The defender's guard presentation rebuilds its pose from the clip every frame, so the
  // defender's lean and root have to land after that rebuild, not with the attacker's.
  function advanceDefender(deltaMs, { torsoWeight = 1 } = {}) {
    let torsoLeanReport = null;
    if (defenderTorsoLean.active) {
      defenderTorsoLean.advance(deltaMs);
      torsoLeanReport = defenderTorsoLean.apply({ torsoWeight });
    }
    const rootDisplacementReport = defenderRootDisplacement.apply();
    return Object.freeze({
      torsoLeanReport,
      rootDisplacementReport,
      repaintRequired: defenderRootDisplacement.active || defenderTorsoLean.active,
    });
  }

  // The exchange clock stops with the exchange, so settle both roots back onto their base rather
  // than leaving a residual offset standing. The arm and torso are different: the recovery blend
  // captures the rig as its source pose, so they release ownership without rewinding and the
  // recovery stands the attacker up from the flung silhouette.
  function settle() {
    attackerArmFling.releaseOwnership();
    attackerTorsoLean.releaseOwnership();
    defenderTorsoLean.releaseOwnership();
    attackerRootDisplacement.reset();
    defenderRootDisplacement.reset();
  }

  function reset() {
    settle();
    previousShieldSurfaceCenter = null;
    peakShieldSweepVelocity = null;
    previousHandWorld = null;
    peakHandVelocity = null;
  }

  return Object.freeze({
    stage: CONTACT_REACTION_DIRECTOR_STAGE,
    trackExcitation,
    backwardDirection,
    arm,
    advanceAttacker,
    advanceDefender,
    settle,
    reset,
    get excitation() {
      return Object.freeze({
        shieldSweepVelocity: peakShieldSweepVelocity,
        handVelocity: peakHandVelocity,
      });
    },
    get attackerActive() {
      return attackerTorsoLean.active || attackerArmFling.active || attackerRootDisplacement.active;
    },
    get defenderActive() {
      return defenderTorsoLean.active || defenderRootDisplacement.active;
    },
    authority: 'stages-the-reaction-a-real-swept-contact-already-decided',
  });
}
