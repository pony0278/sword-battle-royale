// @ts-check
// The off hand on the hilt, as seven authored arm poses.
//
// WHAT THIS IS, because the name does not say it: a two-handed grip in this repository is not a
// clip and not a constraint. It is seven hand-authored left-arm poses - shoulder, elbow, wrist and
// a small upper-arm stretch - blended over whatever the right arm is already doing. The numbers
// live in the pose vocabulary of pose-schema.js, where aL_sx is the left shoulder's X rotation in
// degrees and aL_ex the elbow's bend, and two adapters turn them into bone rotations:
// pose-applier.js for the line rig, kaykit-pose-adapter.js for the KayKit one (upperarm.l,
// lowerarm.l, wrist.l).
//
// WHERE IT CAME FROM: whole-body-motion-solver.js, where it was private to one clip baker - the
// advancing vertical chop that Action Studio's templates use. It is here because the greatsword
// needs it and a second caller should not have to import a clip baker to get an arm.
//
// WHAT IT IS NOT: solved. Nothing in here knows where a hilt is. These angles were tuned by eye
// against ONE weapon in ONE move until the hand looked like it was holding something, and the
// aL_stretch of 1.03-1.05 is the tell - the upper arm is lengthened by three to five percent to
// make the hand reach. An open-loop pose is fine when the target barely moves, and measured, the
// target barely moves: the longsword's secondary_grip sits at +0.1350 above the mount origin and
// the greatsword's at +0.0881, 0.047 apart. It is NOT fine as a general answer, which is why
// two-hand-grip-reach.test.js measures the gap rather than trusting this paragraph.

/**
 * The authored left arm, one entry per phase of a swing.
 * @type {Readonly<Record<string, Readonly<Record<string, number>>>>}
 */
export const TWO_HAND_LEFT_ARM = Object.freeze({
  ready: Object.freeze({ aL_sx: -84, aL_sy: -2, aL_sz: 16, aL_ex: 86, aL_wx: -6, aL_wy: -18, aL_wz: 4, aL_stretch: 1.03 }),
  windup: Object.freeze({ aL_sx: -142, aL_sy: 6, aL_sz: 10, aL_ex: 62, aL_wx: -18, aL_wy: -10, aL_wz: 0, aL_stretch: 1.05 }),
  commit: Object.freeze({ aL_sx: -118, aL_sy: 4, aL_sz: 8, aL_ex: 46, aL_wx: -8, aL_wy: -12, aL_wz: 0, aL_stretch: 1.04 }),
  plant: Object.freeze({ aL_sx: -94, aL_sy: 3, aL_sz: 6, aL_ex: 33, aL_wx: 0, aL_wy: -10, aL_wz: 0, aL_stretch: 1.03 }),
  impact: Object.freeze({ aL_sx: -64, aL_sy: 4, aL_sz: 4, aL_ex: 16, aL_wx: 12, aL_wy: -8, aL_wz: 0, aL_stretch: 1.02 }),
  follow: Object.freeze({ aL_sx: -36, aL_sy: 6, aL_sz: 4, aL_ex: 28, aL_wx: 18, aL_wy: -8, aL_wz: 0, aL_stretch: 1.02 }),
  recover: Object.freeze({ aL_sx: -84, aL_sy: -2, aL_sz: 16, aL_ex: 86, aL_wx: -6, aL_wy: -18, aL_wz: 4, aL_stretch: 1.03 }),
});

export const TWO_HAND_GRIP_PHASES = Object.freeze(['ready', 'windup', 'commit', 'plant', 'impact', 'follow', 'recover']);

// The frames the clip baker places those seven at, under the default motion guide. Data here rather
// than a call, because importing the baker to ask would make this module depend on the thing it was
// taken out of - and two-hand-grip.test.js asserts these against advancingVerticalChopFrames() so
// the copy cannot drift.
export const AUTHORED_PHASE_FRAMES = Object.freeze({
  ready: 0, windup: 8, commit: 13, plant: 16, impact: 19, follow: 25, recover: 36,
});

const LEFT_ARM_KEYS = Object.freeze(Object.keys(TWO_HAND_LEFT_ARM.ready));

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, finite(value)));
}

/**
 * Where the seven phases fall on ONE WEAPON'S measured swing.
 *
 * Four of them are anchored to landmarks the timings record already produces, so they are that
 * weapon's own numbers rather than the chop's: plant is where the blade goes live, impact is the
 * measured contact, follow is where it stops being live, recover is the end. The two that have no
 * landmark - windup and commit - keep their authored share of the run-up, 8/16 and 13/16 of the
 * way from ready to plant, read off AUTHORED_PHASE_FRAMES rather than chosen here.
 *
 * A greatsword swinging slower therefore stretches the whole arm motion rather than desynchronising
 * from its own blade, which is the property that makes this reusable at all.
 *
 * @param {{activeStartSeconds?: number, activeEndSeconds?: number, durationSeconds?: number, contactSeconds?: number}} profile
 */
export function twoHandGripLandmarkSeconds(profile = {}) {
  const plant = Math.max(0, finite(profile.activeStartSeconds));
  const runUp = (frame) => plant * (frame / AUTHORED_PHASE_FRAMES.plant);
  const raw = {
    ready: 0,
    windup: runUp(AUTHORED_PHASE_FRAMES.windup),
    commit: runUp(AUTHORED_PHASE_FRAMES.commit),
    plant,
    impact: finite(profile.contactSeconds, plant),
    follow: finite(profile.activeEndSeconds, plant),
    recover: finite(profile.durationSeconds, plant),
  };
  // Monotonic by construction rather than by assumption. A weapon whose contact was measured
  // outside its own active window would otherwise run the arm backwards, and silently.
  let previous = -Infinity;
  const seconds = {};
  for (const phase of TWO_HAND_GRIP_PHASES) {
    previous = Math.max(previous, raw[phase]);
    seconds[phase] = previous;
  }
  return Object.freeze(seconds);
}

/**
 * The authored left arm at one moment of a swing, interpolated between the two phases it falls
 * between. Before ready and after recover it holds the end pose rather than extrapolating.
 * @param {number} elapsedSeconds
 * @param {Readonly<Record<string, number>>} landmarks from twoHandGripLandmarkSeconds
 */
export function twoHandLeftArmAtSeconds(elapsedSeconds, landmarks) {
  const elapsed = Math.max(0, finite(elapsedSeconds));
  let lower = TWO_HAND_GRIP_PHASES[0];
  let upper = TWO_HAND_GRIP_PHASES[0];
  for (const phase of TWO_HAND_GRIP_PHASES) {
    if (landmarks[phase] <= elapsed) { lower = phase; upper = phase; } else { upper = phase; break; }
  }
  if (lower === upper) return TWO_HAND_LEFT_ARM[lower];
  const span = landmarks[upper] - landmarks[lower];
  const alpha = span > 0 ? clamp01((elapsed - landmarks[lower]) / span) : 0;
  const from = TWO_HAND_LEFT_ARM[lower];
  const to = TWO_HAND_LEFT_ARM[upper];
  return Object.freeze(Object.fromEntries(LEFT_ARM_KEYS.map((key) => [key, from[key] + (to[key] - from[key]) * alpha])));
}

/**
 * Blend an authored left arm into a pose. Weight 0 leaves the pose one-handed, 1 takes the authored
 * arm outright, and anything between is a partial commitment to the hilt.
 * @param {Record<string, number>} pose
 * @param {Readonly<Record<string, number>>} leftArm
 * @param {number} weight
 */
export function applyTwoHandGrip(pose, leftArm, weight = 1) {
  const blend = clamp01(weight);
  if (blend === 0 || !leftArm) return pose;
  return Object.fromEntries(Object.entries(pose).map(([key, value]) => [
    key,
    key in leftArm ? value + (leftArm[key] - value) * blend : value,
  ]));
}

const DEG_TO_RAD = Math.PI / 180;
// The left arm's three bones, and the side sign kaykit-pose-adapter.js applies to the Z rotations.
// Mirrored here rather than shared, because that adapter resets the rig to its rest pose first and
// this one must not: it composes onto whatever a clip has just written.
const LEFT_ARM_BONES = Object.freeze({ upper: 'upperarm.l', lower: 'lowerarm.l', wrist: 'wrist.l' });
const LEFT_SIDE_SIGN = -1;

/**
 * Write an authored left arm onto a KayKit rig, on top of whatever pose it is already in.
 *
 * PRECONDITION, and it is not optional: the rig must have been posed this frame - by a clip sample
 * or by the pose adapter - because these are RELATIVE rotations. Called twice against the same
 * sampled frame it applies twice. That is the same contract guard-quaternion-correction.js works
 * under, and the same reason it exists: an overlay is how this rig adds an arm to a clip that does
 * not animate one.
 *
 * Returns what it actually wrote, so a caller can report it rather than assume it.
 *
 * @param {{bones: Record<string, {rotateX: Function, rotateY: Function, rotateZ: Function, scale: {y: number}}>}} rig
 * @param {Readonly<Record<string, number>>} leftArm
 * @param {number} weight
 */
export function applyTwoHandGripToKayKitRig(rig, leftArm, weight = 1) {
  const blend = clamp01(weight);
  if (blend === 0 || !leftArm) return Object.freeze({ applied: false, weight: 0, degrees: null });
  const bones = rig?.bones || {};
  for (const name of Object.values(LEFT_ARM_BONES)) {
    if (!bones[name]) throw new Error(`two-hand grip needs ${name}; this rig does not have it`);
  }
  const shoulder = {
    x: finite(leftArm.aL_sx) * blend,
    y: finite(leftArm.aL_sy) * blend,
    z: finite(leftArm.aL_sz) * blend * LEFT_SIDE_SIGN,
  };
  const elbowX = -finite(leftArm.aL_ex) * blend;
  const wrist = {
    x: finite(leftArm.aL_wx) * blend,
    y: finite(leftArm.aL_wy) * blend,
    z: finite(leftArm.aL_wz) * blend * LEFT_SIDE_SIGN,
  };
  const upper = bones[LEFT_ARM_BONES.upper];
  upper.rotateX(shoulder.x * DEG_TO_RAD);
  upper.rotateY(shoulder.y * DEG_TO_RAD);
  upper.rotateZ(shoulder.z * DEG_TO_RAD);
  bones[LEFT_ARM_BONES.lower].rotateX(elbowX * DEG_TO_RAD);
  const wristBone = bones[LEFT_ARM_BONES.wrist];
  wristBone.rotateX(wrist.x * DEG_TO_RAD);
  wristBone.rotateY(wrist.y * DEG_TO_RAD);
  wristBone.rotateZ(wrist.z * DEG_TO_RAD);
  // The stretch is a scale, so it interpolates from 1 rather than from 0.
  const stretch = 1 + (finite(leftArm.aL_stretch, 1) - 1) * blend;
  upper.scale.y *= Math.max(0.2, stretch);
  return Object.freeze({ applied: true, weight: blend, degrees: Object.freeze({ shoulder, elbowX, wrist, stretch }) });
}
