export const GUARD_WALK_OVERLAY_STAGE = 'R19E.1';

// R19E.1: which bones a walk may borrow from a guarding fighter, and when it must give them back.
//
// The defender's base clip is the Skyrim guard idle and cannot simply be swapped for a walk the
// way the attacker's idle was - the guard IS the upper body. But sampling a clip and applying a
// pose are separate steps in this codebase, and applyRigPose only touches the bones a pose
// carries. So the walk is an overlay: sample the walk clip, keep only the leg chain, let the guard
// sample the whole rig as it always has, then lay the walk's legs back on top. Upper body guard,
// lower body walk, no blending machinery invented.
//
// The bone list is the leg chain guard-residual-stance-reach.js declares it needs for the planted
// crouch - the crouch that took LEFT from 0/8 to 10/10 - minus one, and the missing one is the
// finding. The crouch's list includes hips, and the first version of this overlay took it too.
// Screenshotted result: the entire guard torso pitched over mid-walk, because the spine chain is
// parented to hips, so overlaying the walk's hips reorients everything above it - the walk clip
// and the retargeted Skyrim guard disagree about the pelvis, and whichever wins takes the torso
// with it. Legs only, then: the pelvis bob of a real walk is sacrificed, and the guard keeps its
// spine. These are the bones with two would-be owners, and naming them once keeps that visible.
export const WALK_OVERLAY_BONES = Object.freeze([
  'upperleg.l', 'lowerleg.l', 'foot.l',
  'upperleg.r', 'lowerleg.r', 'foot.r',
]);

// When the walk must yield the legs entirely. Deliberately coarse: the walk owns the legs only
// between exchanges. The moment an attack is in flight or an impact is resolving, the guard owns
// the whole fighter again - the planted crouch, the impact absorption and the recoil all write
// legs, all of them are load-bearing for measured coverage, and every coverage band was taken
// with the defender planted. Yielding for the whole exchange rather than only while the crouch is
// engaged costs a few tenths of a second of walk animation and buys not having to re-measure any
// of it.
export function canWalkOverlayLegs(input = {}) {
  const attackInFlight = Boolean(input.attackInFlight);
  const combatResolving = Boolean(input.combatResolving);
  const allowed = !attackInFlight && !combatResolving;
  return Object.freeze({
    stage: GUARD_WALK_OVERLAY_STAGE,
    allowed,
    reason: allowed
      ? 'between-exchanges-walk-owns-the-legs'
      : (attackInFlight ? 'attack-in-flight-guard-owns-the-fighter' : 'impact-resolving-guard-owns-the-fighter'),
    authority: 'walk-presentation-only-no-contact-authority',
  });
}

// Reduces a whole-rig pose capture to the overlay's bones. Bones the capture does not carry are
// simply absent, which applyRigPose treats as "leave that bone alone".
export function filterPoseToWalkOverlay(pose) {
  const source = pose || {};
  const subset = {};
  for (const bone of WALK_OVERLAY_BONES) {
    if (source[bone]) subset[bone] = source[bone];
  }
  return Object.freeze(subset);
}
