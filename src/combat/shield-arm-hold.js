// R24H.1 (#38) - a held shield stays held through your own swing.
//
// Measured, then seen twice in a person's phone captures: with the guard held, the swing clip
// pulls the shield arm to 68cm behind the body (toward the camera in the locked view), a blocked
// contact freezes it there for 18-41 frames, and the recovery then throws it 0.7m back to the
// guard in 8 frames - a whip on every blocked swing, on both fighters, read by the person watching
// as the shield "hunting". A fighter who is holding a shield up does not put it behind their back
// to throw a cut; the sword arm and the body swing, the shield arm keeps the guard.
//
// This module is only the naming of WHICH bones the shield arm is - the same shape as the walk
// overlay's bone filter (R19E.1), for the same reason: an overlay is defined by the set of bones
// it is allowed to own, and that set is a decision, not a loop.
export const SHIELD_ARM_HOLD_STAGE = 'r24h1-a-held-shield-stays-held';

// The chain from the shoulder out, plus the slot the buckler is socketed on. Deliberately NOT the
// clavicle or any spine bone: the torso is the swing's - the arm rides on it - and taking the
// clavicle measurably stiffens the upper body's wind-up.
export const SHIELD_ARM_HOLD_BONES = Object.freeze([
  'upperarm.l', 'lowerarm.l', 'wrist.l', 'hand.l', 'handslot.l',
]);

export function filterPoseToShieldArm(pose) {
  const output = {};
  for (const bone of SHIELD_ARM_HOLD_BONES) {
    if (pose?.[bone]) output[bone] = pose[bone];
  }
  return Object.freeze(output);
}
