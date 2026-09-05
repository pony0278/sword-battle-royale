// The off hand goes on the hilt.
//
// WHY THIS IS NEEDED, measured rather than assumed (handoff/46): a retargeted Skyrim two-handed
// clip keeps the POSE - wrist to wrist comes out 1.32x the source's - but not the GRIP. This rig
// hangs its equipment sockets 15.1% of head-to-root off the wrist where Skyrim's sit at 6.4% and
// 4.9%, so two grip points 0.12 apart in the clip end up 0.43 apart here, and the retarget cannot
// correct it because handslot.l and handslot.r receive rotation only.
//
// Fixing THAT means moving every weapon and every shield on every clip. This does not do that. It
// closes the gap where it shows, by asking the off arm to reach the weapon's own second grip node,
// and it is deliberately the smaller of the two changes: two bones, no equipment moved, nothing the
// guard gates measure.
//
// OWNERSHIP, which is the part that needs stating rather than discovering. src/combat/
// shield-arm-hold.js already owns this exact chain - upperarm.l, lowerarm.l, wrist.l, hand.l,
// handslot.l - whenever a shield is up. Two writers on one arm is not a merge, it is a bug, so the
// rule here is a refusal: if anything is socketed on HAND_L, the off hand is busy and this does
// nothing. A fighter holds a greatsword with two hands or a sword and a shield. Not both.
import { solveTwoBoneIk } from './two-bone-ik.js';

export const OFF_HAND_GRIP_STAGE = 'the-off-hand-goes-on-the-hilt';

export const OFF_HAND_GRIP_SCOPE = Object.freeze({
  stage: OFF_HAND_GRIP_STAGE,
  // Written. Everything past the elbow rides along rigid, which is what makes it correct to aim the
  // SOCKET rather than a bone.
  bones: Object.freeze(['upperarm.l', 'lowerarm.l']),
  effectorSocket: 'HAND_L',
  targetSocket: 'SECONDARY_GRIP',
  // Never written, and each for its own reason: the right arm and the torso carry the swing, the
  // legs and root carry the stance, and the off hand's own wrist keeps the animator's hand angle -
  // a palm turned by an IK solver reads as a broken wrist long before the position looks wrong.
  forbiddenBones: Object.freeze([
    'root', 'hips', 'spine', 'chest',
    'wrist.l', 'hand.l', 'handslot.l',
    'upperarm.r', 'lowerarm.r', 'wrist.r', 'hand.r', 'handslot.r',
    'upperleg.l', 'upperleg.r', 'lowerleg.l', 'lowerleg.r', 'foot.l', 'foot.r', 'toes.l', 'toes.r',
  ]),
  // The budget, measured rather than guessed - the first value here was 45 and it refused all 31
  // frames of 2hm_idle. That clip needs 47.7 degrees at the shoulder and 20.1 at the elbow, most of
  // which is absorbing the socket offset above rather than anything about the animation. 60 leaves
  // room for a hold carried a little differently without letting an arm be thrown anywhere.
  maxCorrectionDegrees: 60,
  conflictsWith: 'SHIELD_ARM_HOLD_BONES',
  policy: 'refuse when the off hand is holding something; never stretch; never write past the elbow',
});

/**
 * Put the off hand on the mounted weapon's second grip, for one frame.
 *
 * The caller samples the animation and updates world matrices first; this runs after, on the posed
 * rig, and updates the matrices again itself.
 */
export function applyOffHandGripIk(THREE, options = {}) {
  const { character, weapon } = options;
  if (!character?.rig?.bones || !character?.sockets) throw new Error('applyOffHandGripIk requires a procedural character');
  if (!weapon?.sockets?.SECONDARY_GRIP) throw new Error('applyOffHandGripIk requires a weapon with a SECONDARY_GRIP');

  const effector = character.sockets[OFF_HAND_GRIP_SCOPE.effectorSocket];
  // The ownership rule, checked rather than documented: a shield or buckler is socketed here.
  const occupied = (effector.children || []).filter((child) => child !== weapon.object3d);
  if (occupied.length > 0) {
    return { applied: false, reason: 'off-hand-occupied', occupants: occupied.map((child) => child.name || 'unnamed') };
  }

  const target = weapon.sockets[OFF_HAND_GRIP_SCOPE.targetSocket].getWorldPosition(new THREE.Vector3());
  const budget = Number.isFinite(options.maxCorrectionDegrees)
    ? options.maxCorrectionDegrees
    : OFF_HAND_GRIP_SCOPE.maxCorrectionDegrees;

  return solveTwoBoneIk(THREE, {
    root: character.rig.bones['upperarm.l'],
    mid: character.rig.bones['lowerarm.l'],
    effector,
    target,
    maxCorrectionDegrees: budget,
    updateRoot: character.object3d,
  });
}
