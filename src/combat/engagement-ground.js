import { PARRY_ROOT_DISPLACEMENT_PROFILES, BLOCK_ROOT_DISPLACEMENT_PROFILES } from './parry-root-displacement.js';
import { MINIMUM_ENGAGEMENT_SEPARATION_METERS } from './lane-locomotion.js';

export const ENGAGEMENT_GROUND_STAGE = 'R19U.1';

// R18Z.1: who is standing where, after everything that has happened to them.
//
// Both fighters already moved, and neither of them kept any of it. The attacker's step into a
// swing was applied straight onto the scene stance and wiped by the next exchange reset; the
// impact recoil re-derived from a position captured at contact and returned to it exactly, so a
// blow that visibly shoved someone half a pace back left them standing precisely where they were.
// Ground was borrowed for the length of an animation and always handed back.
//
// This owns it instead. One lane, one offset per fighter, and every source of movement writes into
// the same ledger so that separation is the arithmetic of what both of them did rather than a
// constant somebody has to keep correcting.
//
// The lane runs along +z. The attacker starts on the negative side facing the defender, so a
// positive attacker offset is ground gained and a positive defender offset is ground given up.
//
// R19S.1 (stage B1): the ledger now also SAYS where everybody is, as world positions and facing
// bearings derived from the same scalars - attacker at -start/2 plus ground gained, defender at
// +start/2 plus ground given, both on x = 0, each facing the other. Nothing about the arithmetic
// changed and nothing may: the scalars stay the authority the whole calibration record was
// measured against, the derived fields are how the scene now learns where to put a fighter, and
// the B1 golden replay holds every number to zero tolerance. What this buys is one seam: when
// stage B2 gives movement a lateral verb, position and bearing already have an owner, and the
// bearing-zero case - x at zero, facings at 0 and pi - is exactly this file today.
//
// On the recoil peaks being kept in full rather than a fraction of them: the peak is where the
// blow actually put them, and the settle that follows is a fighter recovering their posture, not
// recovering their ground. Splitting that into a retention ratio would mean inventing a number
// nothing has measured. The animation still overshoots and gathers back - it just gathers back to
// the new ground instead of the old.
export const ENGAGEMENT_GROUND_TRANSFERS = Object.freeze({
  block: Object.freeze({
    outcome: 'block',
    attackerMeters: -BLOCK_ROOT_DISPLACEMENT_PROFILES.attacker.peakMeters,
    defenderMeters: BLOCK_ROOT_DISPLACEMENT_PROFILES.defender.peakMeters,
    authority: 'a-held-shield-gives-ground-and-rebounds-the-blade',
  }),
  parry: Object.freeze({
    outcome: 'parry',
    attackerMeters: -PARRY_ROOT_DISPLACEMENT_PROFILES.attacker.peakMeters,
    defenderMeters: PARRY_ROOT_DISPLACEMENT_PROFILES.defender.peakMeters,
    authority: 'a-parry-throws-the-attacker-and-costs-the-defender-little',
  }),
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function resolveGroundTransfer(outcome) {
  const key = String(outcome || '').toLowerCase();
  if (key === 'perfect-parry') return ENGAGEMENT_GROUND_TRANSFERS.parry;
  return ENGAGEMENT_GROUND_TRANSFERS[key] || null;
}

// Holds the ledger for one exchange lane. Offsets are metres along +z from whatever stance the
// scene put the fighters at, so the stance stays the base and this only ever says how far the
// fight has carried them off it.
export function createEngagementGround(options = {}) {
  let startSeparationMeters = Math.max(0, finite(options.startSeparationMeters, 0));
  // R19B.2: walking already refuses to carry anyone through their opponent, but a swing's step is
  // not a walk and was never checked against anything. Now that a whiffed lunge banks its step
  // rather than giving it back, repeated whiffs are a path straight through the defender, so the
  // floor belongs on the ledger where every source of movement has to pass it.
  const minimumSeparationMeters = Math.max(0, finite(
    options.minimumSeparationMeters,
    MINIMUM_ENGAGEMENT_SEPARATION_METERS,
  ));
  let attackerGroundMeters = 0;
  let defenderGroundMeters = 0;
  // R19U.1 (stage B2): the lateral axis. Kept as separate x scalars beside the z scalars rather
  // than folding both into vectors, for a reason the golden replay enforces at zero tolerance:
  // the z arithmetic below is the exact float-op sequence every calibration was measured against,
  // and a vector refactor would reorder additions and drift last bits. Off-axis operations
  // decompose into (z, x) components; on the axis the components are m*1 and m*0 and the z math
  // is bit-identical to the day it was measured.
  let attackerLateralMeters = 0;
  let defenderLateralMeters = 0;
  // The attacker's step is separate from their ground because it is still being spent: it grows
  // through the swing and is only banked once the exchange resolves. Keeping it apart is what lets
  // a whiffed attack be undone without unwinding the ground a previous blow moved.
  let attackerSwingMeters = 0;
  // The swing's lateral component, alongside its z component above: a swing along a frozen
  // off-axis facing spends its metres in both. On the axis this stays exactly zero.
  let attackerSwingLateralMeters = 0;

  // The gap decomposed into the fixed frame. Longitudinal is the legacy scalar formula, exact;
  // lateral is the x gap; separation prefers the legacy path whenever the fight is on the axis.
  function gapParts() {
    const longitudinal = startSeparationMeters + defenderGroundMeters
      - (attackerGroundMeters + attackerSwingMeters);
    const lateral = (defenderLateralMeters) - (attackerLateralMeters + attackerSwingLateralMeters);
    return {
      longitudinal,
      lateral,
      separation: lateral === 0 ? longitudinal : Math.hypot(longitudinal, lateral),
    };
  }

  function report() {
    const attackerMeters = attackerGroundMeters + attackerSwingMeters;
    // Symmetric about the origin, matching the stance planner's geometry: the attacker's ground
    // gained carries them toward +z, the defender's ground given carries them the same way, and
    // the lateral scalars are their x outright.
    const gap = gapParts();
    const attackerPosition = Object.freeze({
      x: attackerLateralMeters + attackerSwingLateralMeters,
      z: -startSeparationMeters / 2 + attackerMeters,
    });
    const defenderPosition = Object.freeze({
      x: defenderLateralMeters,
      z: startSeparationMeters / 2 + defenderGroundMeters,
    });
    // Bearing from each fighter to the other, from the same exact gap parts separation uses; at
    // zero range the last honest answer is the lane's.
    const facingDefined = gap.separation > 1e-9;
    return Object.freeze({
      stage: ENGAGEMENT_GROUND_STAGE,
      attackerMeters,
      defenderMeters: defenderGroundMeters,
      attackerGroundMeters,
      attackerSwingMeters,
      attackerLateralMeters: attackerPosition.x,
      defenderLateralMeters,
      lateralGapMeters: gap.lateral,
      // Positive is still apart. The defender retreating opens the gap, the attacker advancing
      // closes it, and this is the number every coverage band is a fact about - now the euclidean
      // distance, which on the axis is the same number it always was.
      separationMeters: gap.separation,
      startSeparationMeters,
      minimumSeparationMeters,
      attackerPosition,
      defenderPosition,
      attackerFacingRadians: facingDefined ? Math.atan2(gap.lateral, gap.longitudinal) : 0,
      defenderFacingRadians: facingDefined ? Math.atan2(-gap.lateral, -gap.longitudinal) : Math.PI,
      authority: 'lane-position-ledger-no-contact-authority',
    });
  }

  // R19A.1 / R19B.1: a fighter's own feet. Incremental rather than absolute, because unlike a swing
  // this has no timeline to re-derive from - it is just distance covered since the last frame, and
  // it is banked immediately: ground taken by walking is not contingent on anything landing.
  //
  // Both take a change in separation rather than a direction along the lane, which is the one place
  // the two fighters differ and therefore the one place to say it out loud. The defender opens the
  // gap by moving away from the origin and the attacker opens it by moving toward it, so the same
  // "back off half a metre" is +z for one of them and -z for the other. Callers pass what they mean
  // - how the gap should change - and the sign lives here.
  function moveDefender(separationDeltaMeters) {
    const delta = finite(separationDeltaMeters);
    const gap = gapParts();
    if (gap.lateral === 0 || !(gap.separation > 1e-9)) {
      defenderGroundMeters += delta;
    } else {
      // Off the axis, opening the gap means walking along the line between them, wherever it
      // currently points - the same "change in separation" the caller always meant.
      defenderGroundMeters += delta * (gap.longitudinal / gap.separation);
      defenderLateralMeters += delta * (gap.lateral / gap.separation);
    }
    return report();
  }

  function moveAttacker(separationDeltaMeters) {
    const delta = finite(separationDeltaMeters);
    const gap = gapParts();
    if (gap.lateral === 0 || !(gap.separation > 1e-9)) {
      attackerGroundMeters -= delta;
    } else {
      attackerGroundMeters -= delta * (gap.longitudinal / gap.separation);
      attackerLateralMeters -= delta * (gap.lateral / gap.separation);
    }
    return report();
  }

  // R19U.1: the lateral verb. A sidestep is perpendicular to the line between the fighters, so
  // to first order it never closes the gap - geometrically it always opens it slightly - which
  // is why it needs no pushbox clamp of its own. Positive steps to the defender's own left when
  // facing the attacker (+x while square on the lane).
  function moveDefenderLateral(meters) {
    const step = finite(meters);
    if (step === 0) return report();
    const gap = gapParts();
    if (gap.lateral === 0 || !(gap.separation > 1e-9)) {
      defenderLateralMeters += step;
    } else {
      // Perpendicular of the current axis, so strafing CIRCLES the opponent rather than sliding
      // along the world's x forever.
      defenderLateralMeters += step * (gap.longitudinal / gap.separation);
      defenderGroundMeters += step * (-gap.lateral / gap.separation);
    }
    return report();
  }

  // Absolute for the swing in progress, so a repeated frame cannot walk the attacker forward. The
  // floor applies here too and not only once the step is banked: a lunge is the one movement that
  // can carry someone inside their opponent, and clamping it only at settle left the attacker
  // visibly standing in the defender for the length of every over-committed swing.
  function setAttackerSwing(meters, facingRadians) {
    const requested = finite(meters);
    const facing = finite(facingRadians, 0);
    // Along the axis (the only case before stage B2, and the exact-math case after it) the clamp
    // is the legacy linear one, bit-for-bit. cos(0) and sin(0) are exact, so a caller passing a
    // frozen facing of zero still lands here.
    const ux = Math.sin(facing);
    if (ux === 0 && defenderLateralMeters === attackerLateralMeters) {
      const roomToClose = Math.max(0, startSeparationMeters + defenderGroundMeters
        - attackerGroundMeters - minimumSeparationMeters);
      attackerSwingMeters = Math.min(requested, roomToClose);
      attackerSwingLateralMeters = 0;
      return report();
    }
    // Off the axis the swing is a ray from the attacker's banked position along their frozen
    // facing, and the pushbox is a disc around the defender: the swing is clamped where the ray
    // would enter the disc, and NOT clamped at all when it passes wide - lunging past somebody
    // is stage B's whole point.
    const uz = Math.cos(facing);
    const toDefZ = (startSeparationMeters + defenderGroundMeters) - attackerGroundMeters;
    const toDefX = defenderLateralMeters - attackerLateralMeters;
    const along = toDefZ * uz + toDefX * ux;
    const perpendicular = Math.hypot(toDefZ - along * uz, toDefX - along * ux);
    let allowed = Math.max(0, requested);
    if (perpendicular < minimumSeparationMeters && along > 0) {
      const entry = along - Math.sqrt(
        minimumSeparationMeters * minimumSeparationMeters - perpendicular * perpendicular,
      );
      allowed = Math.min(allowed, Math.max(0, entry));
    }
    attackerSwingMeters = allowed * uz;
    attackerSwingLateralMeters = allowed * ux;
    return report();
  }

  // Nobody ends a step standing inside anybody. Applied to the attacker because they are the one
  // whose movement can overrun: the defender's own feet are clamped before they travel.
  function holdMinimumSeparation() {
    const gap = gapParts();
    const overrun = minimumSeparationMeters - gap.separation;
    if (overrun <= 0) return;
    if (gap.lateral === 0 || !(gap.separation > 1e-9)) {
      attackerGroundMeters -= overrun;
    } else {
      attackerGroundMeters -= overrun * (gap.longitudinal / gap.separation);
      attackerLateralMeters -= overrun * (gap.lateral / gap.separation);
    }
  }

  // Banks the step that has been spent and applies what the blow did to both fighters.
  function settleImpact(outcome) {
    const transfer = resolveGroundTransfer(outcome);
    if (!transfer) return null;
    const gap = gapParts();
    if (gap.lateral === 0 || !(gap.separation > 1e-9)) {
      attackerGroundMeters += attackerSwingMeters + transfer.attackerMeters;
      defenderGroundMeters += transfer.defenderMeters;
    } else {
      // The blow's throw is along the line between them at the moment it lands, wherever that
      // line points: the attacker is thrown back down it, the defender gives ground up it.
      attackerGroundMeters += attackerSwingMeters
        + transfer.attackerMeters * (gap.longitudinal / gap.separation);
      attackerLateralMeters += attackerSwingLateralMeters
        + transfer.attackerMeters * (gap.lateral / gap.separation);
      defenderGroundMeters += transfer.defenderMeters * (gap.longitudinal / gap.separation);
      defenderLateralMeters += transfer.defenderMeters * (gap.lateral / gap.separation);
    }
    if (gap.lateral === 0) attackerLateralMeters += attackerSwingLateralMeters;
    attackerSwingMeters = 0;
    attackerSwingLateralMeters = 0;
    holdMinimumSeparation();
    return Object.freeze({ ...report(), transfer });
  }

  // R19B.2: a swing that hit nothing. The step is banked all the same, so a fighter who lunges at
  // empty air is left standing where their own momentum carried them - deep, close, and with none
  // of the impact rebound a landed blow would have given them back. Returning them to where they
  // started would be the system undoing a commitment the player made, and being caught out of
  // position is the price of a whiff rather than something to be spared.
  function settleWhiff() {
    attackerGroundMeters += attackerSwingMeters;
    attackerLateralMeters += attackerSwingLateralMeters;
    attackerSwingMeters = 0;
    attackerSwingLateralMeters = 0;
    holdMinimumSeparation();
    return report();
  }

  function reset() {
    attackerGroundMeters = 0;
    defenderGroundMeters = 0;
    attackerSwingMeters = 0;
    attackerSwingLateralMeters = 0;
    attackerLateralMeters = 0;
    defenderLateralMeters = 0;
    return report();
  }

  // R19D.1: return to a stance, forgetting the fight that happened on the old one. This exists
  // because the ledger's base was captured once at construction while the scene's stance could be
  // changed at runtime, after which the two described different worlds: the scene placed fighters
  // from the new stance plus old offsets while the ledger kept computing separation from the old
  // base. Rebasing is the only honest response to the stance changing - carrying offsets earned at
  // one distance onto another would mean ground won in a different fight.
  function rebase(newStartSeparationMeters) {
    startSeparationMeters = Math.max(0, finite(newStartSeparationMeters, startSeparationMeters));
    return reset();
  }

  return Object.freeze({
    moveAttacker,
    moveDefender,
    moveDefenderLateral,
    setAttackerSwing,
    settleImpact,
    settleWhiff,
    reset,
    rebase,
    get report() { return report(); },
    get attackerMeters() { return attackerGroundMeters + attackerSwingMeters; },
    get defenderMeters() { return defenderGroundMeters; },
    get separationMeters() { return report().separationMeters; },
    get minimumSeparationMeters() { return minimumSeparationMeters; },
  });
}
