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
// R23C.1: named for the ROLE in the blow, not for the fighter. `attackerMeters` was true while one
// fighter did all the swinging; in a duel where either may swing it would name the wrong body every
// other exchange. The measured PROFILES keep their names - they are recordings of specific
// animations, and the animation was recorded on the attacker - so the reference below reads
// "the swinger moves by what was measured on the attacker", which is exactly what it means.
export const ENGAGEMENT_GROUND_TRANSFERS = Object.freeze({
  block: Object.freeze({
    outcome: 'block',
    swingerMeters: -BLOCK_ROOT_DISPLACEMENT_PROFILES.attacker.peakMeters,
    receiverMeters: BLOCK_ROOT_DISPLACEMENT_PROFILES.defender.peakMeters,
    authority: 'a-held-shield-gives-ground-and-rebounds-the-blade',
  }),
  parry: Object.freeze({
    outcome: 'parry',
    swingerMeters: -PARRY_ROOT_DISPLACEMENT_PROFILES.attacker.peakMeters,
    receiverMeters: PARRY_ROOT_DISPLACEMENT_PROFILES.defender.peakMeters,
    authority: 'a-parry-throws-the-swinger-and-costs-the-one-who-answered-little',
  }),
  // R23P.1 - a landed blow gives ground. Measured before this existed, from the swing ledger a
  // person pasted back and again in the lab: a blow that reached the body banked the swinger's
  // step (TOP 0.86m, RIGHT 0.66m, LEFT 0.45m) and moved the one it struck by nothing - the Hit_B
  // reaction shifts the hips 5cm in place - so two landed blows took a 2.40m stance to the 0.90m
  // floor and every swing after that was thrown from the floor. A parry, by comparison, throws
  // the swinger back 0.16m; a block 0.07m.
  //
  // The one who was struck gives back the ground the step took, so the exchange ends where it
  // began: the fight stays in the 2.4m band every gate is measured in, and the next swing has to
  // earn its step again. At the floor a step has nowhere to go and would give back nothing, so
  // the blow always pushes at least the smallest step any swing takes - a fight that has reached
  // the floor comes off it. Given over the reaction rather than at once: 0.86m in a frame is a
  // teleport, and the parry's 0.16m only got away with it by being small.
  hit: Object.freeze({
    outcome: 'hit',
    swingerMeters: 0,
    receiverMeters: null,
    receiverGivesBackTheStep: true,
    minimumReceiverMeters: 0.45,
    yieldSeconds: 0.35,
    authority: 'a-landed-blow-gives-back-the-ground-the-step-took',
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
  // R23C.1: two slots rather than six scalars, so the arithmetic below can be written ONCE and told
  // which fighter is swinging, instead of twice with a mirrored copy that has to be kept in step
  // forever.
  //
  // Indexing is NOT the vectorising the note below forbids. That note protects the exact float-op
  // SEQUENCE every calibration was measured against; `a += b + c * d` and `g[i] += s[i] + c * d`
  // issue the same operations in the same order, while folding x and z into one vector op would
  // not. The golden grid is the oracle either way - eleven cells, 1e-6 on the stance and 5cm on the
  // settle - and it reproduced them after this change.
  const groundMeters = { attacker: 0, defender: 0 };
  // R19U.1 (stage B2): the lateral axis. Kept as separate x scalars beside the z scalars rather
  // than folding both into vectors, for a reason the golden replay enforces at zero tolerance:
  // the z arithmetic below is the exact float-op sequence every calibration was measured against,
  // and a vector refactor would reorder additions and drift last bits. Off-axis operations
  // decompose into (z, x) components; on the axis the components are m*1 and m*0 and the z math
  // is bit-identical to the day it was measured.
  const lateralMeters = { attacker: 0, defender: 0 };
  // The attacker's step is separate from their ground because it is still being spent: it grows
  // through the swing and is only banked once the exchange resolves. Keeping it apart is what lets
  // a whiffed attack be undone without unwinding the ground a previous blow moved.
  const swingMeters = { attacker: 0, defender: 0 };
  // The swing's lateral component, alongside its z component above: a swing along a frozen
  // off-axis facing spends its metres in both. On the axis this stays exactly zero.
  const swingLateralMeters = { attacker: 0, defender: 0 };
  // R23P.1: ground still owed to a blow, given over time. One per slot; a new one replaces it.
  const yields = { attacker: null, defender: null };
  // Which fighter a blow's other half lands on. The two slots are POSITIONS - who stands where -
  // and they never change hands; what changes hands is the ROLE, one exchange at a time.
  const otherSlot = (slot) => (slot === 'defender' ? 'attacker' : 'defender');
  // R20N.1 (free movement): who each fighter is facing, when it is no longer simply each other.
  //
  // Everything above derives facing from the gap: the two of them are pointed at one another
  // because geometry says so, and for a locked duel that is exactly right. Free movement breaks
  // the premise - an unlocked fighter faces where they are going, or where their camera looks, and
  // may have their back to the person they were fighting a moment ago. So facing becomes state a
  // caller may own, and null means "derive it, as always". Nothing sets these by default, so the
  // locked path reports the same numbers it always did, to the last bit.
  let attackerOwnedFacingRadians = null;
  let defenderOwnedFacingRadians = null;

  // The gap decomposed into the fixed frame. Longitudinal is the legacy scalar formula, exact;
  // lateral is the x gap; separation prefers the legacy path whenever the fight is on the axis.
  function gapParts() {
    // R23C.1: both slots may be mid-swing now. Adding a slot's own zero is exact in IEEE754, so
    // the one-swinger case this was measured under is bit-for-bit what it always was - which the
    // golden grid confirmed rather than this comment asserting it.
    const longitudinal = startSeparationMeters + (groundMeters.defender + swingMeters.defender)
      - (groundMeters.attacker + swingMeters.attacker);
    const lateral = (lateralMeters.defender + swingLateralMeters.defender)
      - (lateralMeters.attacker + swingLateralMeters.attacker);
    return {
      longitudinal,
      lateral,
      separation: lateral === 0 ? longitudinal : Math.hypot(longitudinal, lateral),
    };
  }

  function report() {
    const attackerMeters = groundMeters.attacker + swingMeters.attacker;
    // R23C.1: the defender's total is now formed the same way the attacker's always has been.
    // While only the attacker swings this adds their own zero, which IEEE754 leaves untouched -
    // so every number below is bit-for-bit what it was, and a defender-thrown blow now shows up
    // in the report instead of being silently dropped between the swing and the position.
    const defenderMeters = groundMeters.defender + swingMeters.defender;
    // Symmetric about the origin, matching the stance planner's geometry: the attacker's ground
    // gained carries them toward +z, the defender's ground given carries them the same way, and
    // the lateral scalars are their x outright.
    const gap = gapParts();
    const attackerPosition = Object.freeze({
      x: lateralMeters.attacker + swingLateralMeters.attacker,
      z: -startSeparationMeters / 2 + attackerMeters,
    });
    const defenderPosition = Object.freeze({
      x: lateralMeters.defender + swingLateralMeters.defender,
      z: startSeparationMeters / 2 + defenderMeters,
    });
    // Bearing from each fighter to the other, from the same exact gap parts separation uses; at
    // zero range the last honest answer is the lane's.
    const facingDefined = gap.separation > 1e-9;
    const yieldMeters = Object.freeze({
      attacker: yields.attacker ? yields.attacker.totalMeters - yields.attacker.appliedMeters : 0,
      defender: yields.defender ? yields.defender.totalMeters - yields.defender.appliedMeters : 0,
    }); // R23P.1: ground a blow is still owed, by the slot that owes it
    return Object.freeze({
      yieldMeters,
      stage: ENGAGEMENT_GROUND_STAGE,
      attackerMeters,
      defenderMeters,
      attackerGroundMeters: groundMeters.attacker,
      attackerSwingMeters: swingMeters.attacker,
      defenderGroundMeters: groundMeters.defender,
      defenderSwingMeters: swingMeters.defender,
      attackerLateralMeters: attackerPosition.x,
      defenderLateralMeters: defenderPosition.x,
      lateralGapMeters: gap.lateral,
      // Positive is still apart. The defender retreating opens the gap, the attacker advancing
      // closes it, and this is the number every coverage band is a fact about - now the euclidean
      // distance, which on the axis is the same number it always was.
      separationMeters: gap.separation,
      startSeparationMeters,
      minimumSeparationMeters,
      attackerPosition,
      defenderPosition,
      // The bearing is the geometric fact - where the other one actually is - and stays available
      // whatever a fighter has turned to look at. A lock-on needs it to judge who is in front.
      attackerBearingRadians: facingDefined ? Math.atan2(gap.lateral, gap.longitudinal) : 0,
      defenderBearingRadians: facingDefined ? Math.atan2(-gap.lateral, -gap.longitudinal) : Math.PI,
      // Facing is what the fighter is pointed at, which is the bearing until somebody owns it.
      attackerFacingRadians: attackerOwnedFacingRadians
        ?? (facingDefined ? Math.atan2(gap.lateral, gap.longitudinal) : 0),
      defenderFacingRadians: defenderOwnedFacingRadians
        ?? (facingDefined ? Math.atan2(-gap.lateral, -gap.longitudinal) : Math.PI),
      attackerFacingSource: attackerOwnedFacingRadians == null ? 'derived-from-bearing' : 'owned',
      defenderFacingSource: defenderOwnedFacingRadians == null ? 'derived-from-bearing' : 'owned',
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
      groundMeters.defender += delta;
    } else {
      // Off the axis, opening the gap means walking along the line between them, wherever it
      // currently points - the same "change in separation" the caller always meant.
      groundMeters.defender += delta * (gap.longitudinal / gap.separation);
      lateralMeters.defender += delta * (gap.lateral / gap.separation);
    }
    // R20T.4: and the floor holds here too. It used to hold only because the walk PLANNER refused
    // to close past it - which covered walking and nothing else, so a forward dodge went straight
    // through and left the fighters 25cm inside the contact floor. This is where R19B.2 said the
    // floor belongs: on the ledger, where every source of movement has to pass it.
    pushMoverOutOfContact((backX, backZ) => {
      lateralMeters.defender -= backX;
      groundMeters.defender -= backZ;
    });
    return report();
  }

  function moveAttacker(separationDeltaMeters) {
    const delta = finite(separationDeltaMeters);
    const gap = gapParts();
    if (gap.lateral === 0 || !(gap.separation > 1e-9)) {
      groundMeters.attacker -= delta;
    } else {
      groundMeters.attacker -= delta * (gap.longitudinal / gap.separation);
      lateralMeters.attacker -= delta * (gap.lateral / gap.separation);
    }
    // The same floor, for the same reason - the attacker has a dash coming, and it will arrive
    // through a verb rather than through the walk planner that used to be the only guard.
    pushMoverOutOfContact((backX, backZ) => {
      lateralMeters.attacker += backX;
      groundMeters.attacker += backZ;
    });
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
      lateralMeters.defender += step;
    } else {
      // Perpendicular of the current axis, so strafing CIRCLES the opponent rather than sliding
      // along the world's x forever.
      lateralMeters.defender += step * (gap.longitudinal / gap.separation);
      groundMeters.defender += step * (-gap.lateral / gap.separation);
    }
    return report();
  }

  // R20N.1: the world verb. Everything above is spoken relative to the opponent - close the gap,
  // circle them - which is the language of a locked duel and the reason a sidestep orbits instead
  // of sliding away down the world's x. Free movement has no such reference: the player walks
  // north-east because they pushed north-east, and whether that closes on anybody is a
  // consequence rather than the instruction.
  //
  // So this is the same ledger addressed in the world frame. It does not replace the relative
  // verbs and must not: those carry the exact float-op sequence the whole calibration was
  // measured against, and the golden replay holds it to zero tolerance. A caller uses one
  // vocabulary or the other, and the locked path never touches this one.
  //
  // The clamp differs too, and the difference is the point. holdMinimumSeparation pushes the
  // ATTACKER out, because in a lane fight they are the only one whose lunge can overrun. Here
  // whoever is walking is the one who has to stop: you may not walk through someone by holding a
  // direction, and it must not shove the person standing still.
  function pushMoverOutOfContact(applyBack) {
    const gap = gapParts();
    const overrun = minimumSeparationMeters - gap.separation;
    if (overrun <= 0) return;
    if (!(gap.separation > 1e-9)) {
      // Standing exactly on top of each other has no direction to be pushed along; the lane's own
      // axis is the last honest answer, the same fallback the bearings use.
      applyBack(0, -overrun);
      return;
    }
    applyBack(-overrun * (gap.lateral / gap.separation), -overrun * (gap.longitudinal / gap.separation));
  }

  function moveDefenderWorld(deltaX, deltaZ) {
    const dx = finite(deltaX);
    const dz = finite(deltaZ);
    if (dx === 0 && dz === 0) return report();
    lateralMeters.defender += dx;
    groundMeters.defender += dz;
    // The defender's z offset carries them toward +z, the same sign their position formula uses,
    // so the pushback is applied in the same frame it was requested in.
    pushMoverOutOfContact((backX, backZ) => {
      lateralMeters.defender -= backX;
      groundMeters.defender -= backZ;
    });
    return report();
  }

  function moveAttackerWorld(deltaX, deltaZ) {
    const dx = finite(deltaX);
    const dz = finite(deltaZ);
    if (dx === 0 && dz === 0) return report();
    lateralMeters.attacker += dx;
    groundMeters.attacker += dz;
    // The gap shrinks as the attacker gains +z, so the push that opens it again runs the other
    // way - the sign the bearings already describe, applied to the mover.
    pushMoverOutOfContact((backX, backZ) => {
      lateralMeters.attacker += backX;
      groundMeters.attacker += backZ;
    });
    return report();
  }

  // Absolute for the swing in progress, so a repeated frame cannot walk the attacker forward. The
  // floor applies here too and not only once the step is banked: a lunge is the one movement that
  // can carry someone inside their opponent, and clamping it only at settle left the attacker
  // visibly standing in the defender for the length of every over-committed swing.
  // R23C.1: the swing gets a subject. The geometry below is untouched - it was the last thing this
  // ledger's own note warns about, and it is a ray-versus-disc solve with a real front and back, so
  // it is POINTED at the other fighter rather than rewritten. `toTarget` is the vector from whoever
  // is swinging to whoever is being swung at, and for the attacker it is the same subtraction it
  // always was.
  //
  // The one thing that took a correction: the facing this is handed is a WORLD bearing, not an
  // offset from the swinger's own axis - zero is +z for both fighters, which is why the defender's
  // straight-ahead is pi. So the swing's direction is already carried by cos and sin, and the first
  // attempt at this multiplied it by the axis a second time, sending a defender's lunge backwards.
  // Every gate reproduced to the last bit through that bug, because no gate ever swings the
  // defender; the mirror test is what found it.
  function setSwing(meters, facingRadians, { swinger = 'attacker' } = {}) {
    const requested = finite(meters);
    const facing = finite(facingRadians, 0);
    const target = otherSlot(swinger);
    // Which way down the lane this fighter's opponent lies: +z from the attacker, -z from the
    // defender. Used to point the reach, and to ask whether a facing is aimed along the lane.
    const axis = swinger === 'defender' ? -1 : 1;
    // Along the axis (the only case before stage B2, and the exact-math case after it) the clamp
    // is the legacy linear one, bit-for-bit. cos(0) and sin(0) are exact, so a caller passing a
    // frozen facing of zero still lands here.
    const ux = Math.sin(facing);
    const uz = Math.cos(facing);
    // `uz === axis` is "pointed straight at the other one", which for the attacker at facing zero
    // is exactly the condition this branch has always tested and nothing else. It is not loosened
    // to catch the defender's mirror of it: Math.sin(Math.PI) is 1.22e-16 rather than 0, so a
    // defender aimed down the lane misses this branch by a hair and takes the general solve below.
    // Loosening `ux === 0` to an epsilon would change which branch the ATTACKER takes near the
    // axis, and that branch is the one every calibration in this project was measured against.
    if (ux === 0 && uz === axis && lateralMeters[target] === lateralMeters[swinger]) {
      const roomToClose = Math.max(0, (startSeparationMeters + groundMeters.defender
        - groundMeters.attacker) - minimumSeparationMeters);
      swingMeters[swinger] = Math.min(requested, roomToClose) * axis;
      swingLateralMeters[swinger] = 0;
      return report();
    }
    // Off the axis the swing is a ray from the swinger's banked position along their frozen
    // facing, and the pushbox is a disc around the other fighter: the swing is clamped where the
    // ray would enter the disc, and NOT clamped at all when it passes wide - lunging past somebody
    // is stage B's whole point.
    const toDefZ = axis * ((startSeparationMeters + groundMeters.defender) - groundMeters.attacker);
    const toDefX = axis * (lateralMeters.defender - lateralMeters.attacker);
    const along = toDefZ * uz + toDefX * ux;
    const perpendicular = Math.hypot(toDefZ - along * uz, toDefX - along * ux);
    let allowed = Math.max(0, requested);
    if (perpendicular < minimumSeparationMeters && along > 0) {
      const entry = along - Math.sqrt(
        minimumSeparationMeters * minimumSeparationMeters - perpendicular * perpendicular,
      );
      allowed = Math.min(allowed, Math.max(0, entry));
    }
    // World frame, both slots: cos and sin already point this where the swinger is looking.
    swingMeters[swinger] = allowed * uz;
    swingLateralMeters[swinger] = allowed * ux;
    return report();
  }

  // The name this had while only one fighter ever swung. Kept so twenty call sites and the golden
  // ledger replay do not have to change in the same commit that changes the maths underneath them.
  const setAttackerSwing = (meters, facingRadians) => setSwing(meters, facingRadians);

  // Nobody ends a step standing inside anybody, and the one who swung is the one pushed out.
  // That was never a fact about which fighter it was: a swing is the movement being refused, so
  // its owner pays for it, and the other one keeps the ground they were standing on. R23C.1 keeps
  // that rule exactly and gives it a subject instead of assuming the attacker is always the one.
  function holdMinimumSeparation(swinger = 'attacker') {
    const gap = gapParts();
    const overrun = minimumSeparationMeters - gap.separation;
    if (overrun <= 0) return;
    // The gap is measured defender-minus-attacker, so pushing the DEFENDER out of contact moves
    // them the other way down the same line.
    const sign = swinger === 'defender' ? -1 : 1;
    if (gap.lateral === 0 || !(gap.separation > 1e-9)) {
      groundMeters[swinger] -= overrun * sign;
    } else {
      groundMeters[swinger] -= overrun * sign * (gap.longitudinal / gap.separation);
      lateralMeters[swinger] -= overrun * sign * (gap.lateral / gap.separation);
    }
  }

  // Banks the step that has been spent and applies what the blow did to both fighters.
  function settleImpact(outcome, { swinger = 'attacker' } = {}) {
    const transfer = resolveGroundTransfer(outcome);
    if (!transfer) return null;
    const receiver = otherSlot(swinger);
    // The gap runs defender-minus-attacker. A blow thrown the other way is thrown up that line
    // instead of down it, so both halves of the transfer flip together - one sign, not a mirrored
    // copy of the arithmetic.
    const sign = swinger === 'defender' ? -1 : 1;
    const gap = gapParts();
    // R23P.1: what the receiver gives is either the transfer's own number or the step that was
    // just taken at them, floored so a blow from the floor still moves somebody.
    const receiverMeters = transfer.receiverGivesBackTheStep
      ? Math.max(Math.hypot(swingMeters[swinger], swingLateralMeters[swinger]), finite(transfer.minimumReceiverMeters))
      : finite(transfer.receiverMeters);
    if (gap.lateral === 0 || !(gap.separation > 1e-9)) {
      groundMeters[swinger] += swingMeters[swinger] + transfer.swingerMeters * sign;
    } else {
      // The blow's throw is along the line between them at the moment it lands, wherever that
      // line points: the swinger is thrown back down it, the one who answered gives ground up it.
      groundMeters[swinger] += swingMeters[swinger]
        + transfer.swingerMeters * sign * (gap.longitudinal / gap.separation);
      lateralMeters[swinger] += swingLateralMeters[swinger]
        + transfer.swingerMeters * sign * (gap.lateral / gap.separation);
    }
    if (gap.lateral === 0) lateralMeters[swinger] += swingLateralMeters[swinger];
    const along = gap.lateral === 0 || !(gap.separation > 1e-9)
      ? { longitudinal: 1, lateral: 0 }
      : { longitudinal: gap.longitudinal / gap.separation, lateral: gap.lateral / gap.separation };
    if (finite(transfer.yieldSeconds) > 0) {
      yields[receiver] = { totalMeters: receiverMeters, appliedMeters: 0, seconds: finite(transfer.yieldSeconds), elapsed: 0, sign, along };
    } else {
      groundMeters[receiver] += receiverMeters * sign * along.longitudinal;
      lateralMeters[receiver] += receiverMeters * sign * along.lateral;
    }
    swingMeters[swinger] = 0;
    swingLateralMeters[swinger] = 0;
    holdMinimumSeparation(swinger);
    return Object.freeze({ ...report(), transfer });
  }

  // R23P.1: pays out what a blow is still owed. Eased out - the shove is hardest at the moment of
  // the blow - and finished exactly, so the total given is the total owed and not a sum of steps.
  function advanceYield(deltaSeconds = 0) {
    const dt = Math.max(0, finite(deltaSeconds));
    for (const slot of ['attacker', 'defender']) {
      const owed = yields[slot];
      if (!owed) continue;
      owed.elapsed = Math.min(owed.seconds, owed.elapsed + dt);
      const t = owed.seconds > 0 ? owed.elapsed / owed.seconds : 1;
      const eased = owed.totalMeters * (1 - (1 - t) * (1 - t));
      const delta = eased - owed.appliedMeters;
      owed.appliedMeters = eased;
      groundMeters[slot] += delta * owed.sign * owed.along.longitudinal;
      lateralMeters[slot] += delta * owed.sign * owed.along.lateral;
      if (owed.elapsed >= owed.seconds) yields[slot] = null;
    }
    return report();
  }

  // R19B.2: a swing that hit nothing. The step is banked all the same, so a fighter who lunges at
  // empty air is left standing where their own momentum carried them - deep, close, and with none
  // of the impact rebound a landed blow would have given them back. Returning them to where they
  // started would be the system undoing a commitment the player made, and being caught out of
  // position is the price of a whiff rather than something to be spared.
  function settleWhiff({ swinger = 'attacker' } = {}) {
    groundMeters[swinger] += swingMeters[swinger];
    lateralMeters[swinger] += swingLateralMeters[swinger];
    swingMeters[swinger] = 0;
    swingLateralMeters[swinger] = 0;
    holdMinimumSeparation(swinger);
    return report();
  }

  function reset() {
    groundMeters.attacker = 0;
    groundMeters.defender = 0;
    yields.attacker = null; // R23P.1: ground still owed to a blow is forgotten with the fight
    yields.defender = null;
    swingMeters.attacker = 0;
    swingLateralMeters.attacker = 0;
    // R23C.1: the defender has a swing of their own to forget now. Nothing wrote these before
    // this stage, so clearing them changes no reading the ledger has ever produced - but leaving
    // them out would have made a reset mean "forget the fight, unless the defender was mid-swing".
    swingMeters.defender = 0;
    swingLateralMeters.defender = 0;
    lateralMeters.attacker = 0;
    lateralMeters.defender = 0;
    // Facing ownership survives a reset: it is a stance the player is holding, not ground the
    // exchange won. Unlocking is what gives it back, and that is a caller's decision.
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
    moveAttackerWorld,
    moveDefenderWorld,
    // null restores the derived bearing, which is what unlocking is: nobody is pointed at anybody
    // by arrangement any more.
    setAttackerFacing(radians) { attackerOwnedFacingRadians = radians == null ? null : finite(radians); return report(); },
    setDefenderFacing(radians) { defenderOwnedFacingRadians = radians == null ? null : finite(radians); return report(); },
    setAttackerSwing,
    setSwing,
    settleImpact,
    settleWhiff,
    advanceYield, // R23P.1
    reset,
    rebase,
    get report() { return report(); },
    get attackerMeters() { return groundMeters.attacker + swingMeters.attacker; },
    get defenderMeters() { return groundMeters.defender + swingMeters.defender; },
    get separationMeters() { return report().separationMeters; },
    get minimumSeparationMeters() { return minimumSeparationMeters; },
  });
}
