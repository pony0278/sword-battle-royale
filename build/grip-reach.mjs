// The one measurement, shared by the report and the test so they cannot disagree.
//
// TOLERANCE, and it is a PROPOSED acceptance threshold rather than a measured fact - said plainly
// because this repository's other numbers are measurements: 0.10 of a rig unit, against a character
// measured at 1.4457 tall whose hands rest 0.3571 apart. Two hands on one haft sit roughly a fist
// apart, and the greatsword's whole grip - crossguard to butt - is 0.8333, so a hand more than 0.10
// from the second grip node is not on the handle at all. Tighten it when a real two-handed clip
// gives something better to calibrate against.
export const TWO_HAND_GRIP_REACH_TOLERANCE = 0.10;

/**
 * Distance from the character's off-hand socket to the weapon's secondary grip, in rig units.
 * Everything is injected so this runs headless and so a caller can point it at any weapon or pose.
 */
export function measureGripReach(THREE, { definition, pose, mount, createDefaultCharacter, createDebugSword, mountDebugSword }) {
  const character = createDefaultCharacter(THREE);
  const weapon = createDebugSword(THREE, { definition });
  mountDebugSword(character, weapon, mount);
  character.applyPose(pose);
  character.object3d.updateMatrixWorld(true);
  weapon.update();
  const hand = new THREE.Vector3();
  const grip = new THREE.Vector3();
  character.sockets.HAND_L.getWorldPosition(hand);
  weapon.sockets.SECONDARY_GRIP.getWorldPosition(grip);
  return hand.distanceTo(grip);
}
