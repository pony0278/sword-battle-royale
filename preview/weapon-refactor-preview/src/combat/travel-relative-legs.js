export const TRAVEL_RELATIVE_LEGS_STAGE = 'R20X.1';

// R20X.1: pointing the legs where the body is actually going.
//
// The problem this exists for is an asset one. Across all eight KayKit packs there are exactly two
// lateral locomotion cycles, Running_Strafe_Left and Running_Strafe_Right, and they are authored
// for 3.04 m/s with 80% of the cycle airborne. The lab sidesteps at 0.75, which would play them at
// 0.247x - a 3.24s cycle holding an airborne pose for over two and a half seconds. Raising the
// sidestep to make them honest is not an animation decision either: orbit-steering-budget derives
// the radius where circling out-turns a windup's aim as lateralSpeed / 45 deg/s, so 0.75 puts it at
// 0.955m, inside the 0.9m contact floor and therefore unreachable. At 1.52 m/s - still only 0.5x -
// it moves to 1.94m, which is ordinary fighting range. That would make circling a way to beat the
// attacker's aim, which R20T.1 measured is currently impossible. So the speed stays.
//
// What is left is to stop asking a forward clip to describe sideways travel. A walk clip driven by
// lateral distance has the feet striding front-to-back while the body slides sideways: every metre
// of travel is foot slide, which is the exact failure R19C.1 built the distance-driven gait to
// remove. Instead the stride is turned to face the travel: the leg chain hangs off upperleg.l and
// upperleg.r, so yawing those two about the vertical carries knee and foot with them and leaves the
// pelvis, spine and guard untouched. That last part is the constraint - R19E.1 measured by
// screenshot that overlaying the walk's hips pitches the entire guard torso, because the spine is
// parented to them - so this deliberately stops one bone short of hips.
//
// The cost is stated rather than hidden: a pure sidestep needs 90 degrees of yaw at the hip, and
// the knees point outward while it holds. Nothing measured says whether that reads as a side-step
// or as a broken hip; that is a question for eyes, which is why this ships behind a playtest.
export const SIDESTEP_HIP_YAW_RADIANS = Math.PI / 2;

// Which clip a body-frame travel direction belongs to. A sidestep is not a backpedal, and the
// deadband is measured rather than picked: walking a straight line while the facing keeps tracking
// the opponent puts a small NEGATIVE forward component in the body frame - the line and the arc
// disagree by a little more every frame - so a sidestep classified by the sign of that component
// alone flips to the backwards clip immediately. Measured in the lab at 0.75 m/s and 2.4m: enough
// negative forward to flip it within the first frame of the press. 108 degrees puts the boundary
// clear of that drift while still calling a genuine backpedal a backpedal.
export const BACKWARD_CLIP_THRESHOLD_RADIANS = Math.PI * 0.6;

// And the worst case is not the sidestep. The deadband below hands the forward clip to travel up to
// 108 degrees off the nose, so that is the most the hip is ever asked for - 18 degrees past the
// sidestep, in the band where a fighter is walking backwards-and-sideways but not enough of either
// to earn the backwards clip. Stated because it is the number a screenshot has to survive, not the
// right angle everybody thinks of first.
export const MAXIMUM_HIP_YAW_RADIANS = Math.PI * 0.6;

export const MEASURED_SIDESTEP_DRIFT = Object.freeze({
  observation: 'a-straight-sidestep-reads-as-slightly-backwards-in-the-body-frame',
  cause: 'the-facing-tracks-the-bearing-so-the-line-and-the-arc-part-company',
  consequenceIfIgnored: 'the-backwards-walk-clip-plays-during-a-sidestep',
  deadbandRadians: BACKWARD_CLIP_THRESHOLD_RADIANS,
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function wrapAngle(radians) {
  const value = finite(radians);
  return Math.atan2(Math.sin(value), Math.cos(value));
}

// Pure: this frame's travel in the body's own frame, turned into what the gait and the legs need.
// The gait gets the WHOLE distance travelled rather than its forward projection, because once the
// legs point along travel that distance is what the feet actually cover - which is also what makes
// the foot lock exact again for a sidestep instead of merely absent.
export function planTravelRelativeLegs(input = {}) {
  const forwardMeters = finite(input.forwardMeters);
  const lateralMeters = finite(input.lateralMeters);
  const magnitudeMeters = Math.hypot(forwardMeters, lateralMeters);
  if (magnitudeMeters <= 1e-9) {
    return Object.freeze({
      stage: TRAVEL_RELATIVE_LEGS_STAGE,
      magnitudeMeters: 0,
      signedTravelMeters: 0,
      bodyAngleRadians: 0,
      legYawRadians: 0,
      backwards: false,
      authority: 'walk-presentation-only-no-contact-authority',
    });
  }
  const bodyAngleRadians = Math.atan2(lateralMeters, forwardMeters);
  const backwards = Math.abs(bodyAngleRadians) > BACKWARD_CLIP_THRESHOLD_RADIANS;
  // The backwards clip already carries the body backwards, so the yaw it needs is measured from
  // ITS direction, not from forward - which keeps every yaw this returns inside a right angle.
  const legYawRadians = backwards ? wrapAngle(bodyAngleRadians - Math.PI) : bodyAngleRadians;
  return Object.freeze({
    stage: TRAVEL_RELATIVE_LEGS_STAGE,
    magnitudeMeters,
    signedTravelMeters: backwards ? -magnitudeMeters : magnitudeMeters,
    bodyAngleRadians,
    legYawRadians,
    backwards,
    authority: 'walk-presentation-only-no-contact-authority',
  });
}

function quaternionMultiply(a, b) {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

function quaternionConjugate(q) {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

// The rotation to premultiply onto a hip-parented bone's LOCAL quaternion so that the bone turns
// about the world vertical. A bone's local rotation is expressed in its parent's frame, so a world
// axis has to be carried into that frame first - conjugating by the parent's world rotation is what
// does it. Kept here as plain numbers so it can be tested without a scene.
export function hipYawDeltaQuaternion(legYawRadians, parentWorldQuaternion) {
  const half = finite(legYawRadians) / 2;
  const yaw = { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
  const parent = parentWorldQuaternion || { x: 0, y: 0, z: 0, w: 1 };
  const normalised = {
    x: finite(parent.x), y: finite(parent.y), z: finite(parent.z), w: finite(parent.w, 1),
  };
  return quaternionMultiply(quaternionMultiply(quaternionConjugate(normalised), yaw), normalised);
}

// The two bones this may touch, and the one it must not. Named here so the constraint travels with
// the code that would break it.
export const TRAVEL_YAW_BONES = Object.freeze(['upperleg.l', 'upperleg.r']);
export const TRAVEL_YAW_FORBIDDEN_BONE = 'hips';
