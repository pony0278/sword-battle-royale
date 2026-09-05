// Two-bone IK: put the end of a limb on a point, by rotating two joints.
//
// Analytic, not iterative. A two-bone chain has one degree of freedom left once the effector's
// position is fixed - the limb can spin about the line from shoulder to target - and that freedom
// is spent HERE by keeping the plane the arm is already in. That is deliberate: the plane comes
// from the retargeted animation, so the elbow keeps pointing where the animator put it, and this
// solver never has to invent a pole vector it would have no evidence for.
//
// The chain is (root, mid, effector). Only root and mid are written. Everything from mid outward -
// the wrist, the hand, the socket the weapon or shield hangs on - is treated as rigid and rides
// along, which is what makes it correct to aim a SOCKET rather than a bone: the second segment's
// length is measured to the effector, wherever it is.
//
// TWO REFUSALS, both of which return applied:false and restore the pose rather than doing their
// best. A solver that quietly does its best is how a limb ends up somewhere nobody chose:
//
//   out of reach     the target is further than the two segments can span. Reaching for it would
//                    lock the arm straight and point it at something it cannot hold.
//   over budget      the correction exceeds maxCorrectionDegrees at either joint. The budget is
//                    the caller's statement of how much of the animation it is willing to overwrite.

function rotateBoneInWorld(THREE, bone, deltaWorldQuaternion) {
  const parentWorld = bone.parent
    ? bone.parent.getWorldQuaternion(new THREE.Quaternion())
    : new THREE.Quaternion();
  const boneWorld = bone.getWorldQuaternion(new THREE.Quaternion());
  const desired = deltaWorldQuaternion.clone().multiply(boneWorld);
  bone.quaternion.copy(parentWorld.invert().multiply(desired)).normalize();
}

function worldPosition(THREE, object3d) {
  return object3d.getWorldPosition(new THREE.Vector3());
}

// The plane the arm bends in. Normally the one it is already in; when the arm is straight there is
// no such plane, so the target picks one - bending toward what we are reaching for is the only
// choice with a reason behind it.
function bendAxis(THREE, fromMid, toMid, target, mid) {
  const axis = new THREE.Vector3().crossVectors(fromMid, toMid);
  if (axis.lengthSq() > 1e-10) return axis.normalize();
  const fallback = new THREE.Vector3().crossVectors(fromMid, target.clone().sub(mid));
  if (fallback.lengthSq() > 1e-10) return fallback.normalize();
  // Fully degenerate: shoulder, effector and target are collinear. Any perpendicular will do.
  const arbitrary = Math.abs(fromMid.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3().crossVectors(fromMid, arbitrary).normalize();
}

/**
 * Rotate `root` and `mid` so that `effector` lands on `target`.
 *
 * @param {object} THREE Three.js namespace (Quaternion, Vector3, MathUtils).
 * @param {object} options
 * @param {object} options.root   the shoulder-side bone, rotated second
 * @param {object} options.mid    the elbow-side bone, rotated first
 * @param {object} options.effector the object whose world position must reach the target
 * @param {object} options.target THREE.Vector3, in world space
 * @param {number} [options.maxCorrectionDegrees] per-joint budget; over it, nothing is written
 * @param {object} [options.updateRoot] what to updateMatrixWorld on between steps; defaults to root
 */
export function solveTwoBoneIk(THREE, options = {}) {
  const { root, mid, effector, target } = options;
  if (!root || !mid || !effector || !target) throw new Error('solveTwoBoneIk needs root, mid, effector and target');
  const budget = Number.isFinite(options.maxCorrectionDegrees) ? options.maxCorrectionDegrees : Infinity;
  const updateRoot = options.updateRoot || root;

  const before = { root: root.quaternion.clone(), mid: mid.quaternion.clone() };
  const restore = () => {
    root.quaternion.copy(before.root);
    mid.quaternion.copy(before.mid);
    updateRoot.updateMatrixWorld(true);
  };

  const shoulder = worldPosition(THREE, root);
  const elbow = worldPosition(THREE, mid);
  const handStart = worldPosition(THREE, effector);
  const upper = shoulder.distanceTo(elbow);
  const fore = elbow.distanceTo(handStart);
  const gapBefore = handStart.distanceTo(target);
  const report = { applied: false, gapBefore, gapAfter: gapBefore, upper, fore, rootDegrees: 0, midDegrees: 0 };

  if (upper < 1e-6 || fore < 1e-6) return { ...report, reason: 'degenerate-chain' };

  const span = upper + fore;
  const distance = shoulder.distanceTo(target);
  if (distance > span) return { ...report, reason: 'out-of-reach', reach: span, distance };

  // 1. The elbow, by the law of cosines: the interior angle that makes the chain span `distance`.
  const toShoulder = shoulder.clone().sub(elbow);
  const toHand = handStart.clone().sub(elbow);
  const axis = bendAxis(THREE, toShoulder, toHand, target, elbow);
  const currentAngle = toShoulder.angleTo(toHand);
  const clampedDistance = Math.max(Math.abs(upper - fore) + 1e-6, Math.min(span - 1e-6, distance));
  const cosine = (upper * upper + fore * fore - clampedDistance * clampedDistance) / (2 * upper * fore);
  const desiredAngle = Math.acos(Math.max(-1, Math.min(1, cosine)));
  const midDelta = desiredAngle - currentAngle;

  // 2. The shoulder, swinging the now-correctly-bent arm onto the target.
  rotateBoneInWorld(THREE, mid, new THREE.Quaternion().setFromAxisAngle(axis, midDelta));
  updateRoot.updateMatrixWorld(true);
  const handBent = worldPosition(THREE, effector);
  const from = handBent.clone().sub(shoulder);
  const to = target.clone().sub(shoulder);
  if (from.lengthSq() < 1e-12 || to.lengthSq() < 1e-12) {
    restore();
    return { ...report, reason: 'degenerate-target' };
  }
  const swing = new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), to.clone().normalize());
  const rootDegrees = THREE.MathUtils.radToDeg(2 * Math.acos(Math.min(1, Math.abs(swing.w))));
  const midDegrees = Math.abs(THREE.MathUtils.radToDeg(midDelta));

  if (midDegrees > budget || rootDegrees > budget) {
    restore();
    return { ...report, reason: 'over-budget', rootDegrees, midDegrees, budget };
  }

  rotateBoneInWorld(THREE, root, swing);
  updateRoot.updateMatrixWorld(true);
  const gapAfter = worldPosition(THREE, effector).distanceTo(target);
  return { applied: true, gapBefore, gapAfter, upper, fore, rootDegrees, midDegrees, reason: null };
}
