export const LOCOMOTION_CLIP_MEASUREMENT_STAGE = 'R20W.1';

// R20W.1: how fast each locomotion clip was authored to travel.
//
// Every gait number in this lab used to come from one assumption in lane-walk-cycle.js - a step is
// 0.8 of a leg length - because the KayKit locomotion clips animate by bone rotation with no root
// translation, so there is no baked stride to read off the file. That reasoning was sound and the
// number was still wrong, because a stride is a thing the animator drew, not a thing the skeleton
// implies: two clips on the same rig here differ by a factor of 1.6.
//
// The stride IS readable, just not from the root. While a foot is on the ground it is fixed in the
// world, so the body slides past it at exactly the speed the clip was authored for. Solve forward
// kinematics through the leg chain, find the frames where the toe sits on the floor, and fit a line
// to the ankle's travel across that contact: the slope is the authored speed. Both feet are fitted
// independently and they agree to within a few percent on every clip below, which is the check that
// says the method is reading the animation rather than reading noise.
//
// Measured at 480 samples per cycle against assets/kaykit/animations/{basic,advanced}.glb with the
// rest pose from kaykit-rig-definition.js. Reproduce by re-running that fit; do not hand-edit.
//
// The sign is the direction the clip carries the body along its own travel axis, and it matters:
// phase is advanced by travelled / strideMeters, so a backwards clip with a negative stride runs
// FORWARDS in time while the body moves backwards. That is what stops a backwards walk from being
// a moonwalk, and it is what the previous unsigned arithmetic got wrong - it ran Walking_Backwards
// in reverse, sliding the feet at twice the body's speed in the wrong direction.
export const MEASURED_LOCOMOTION_CLIPS = Object.freeze({
  // The walk this lab shipped with. Authored for a stroll - at our 1.0 m/s it was played 1.6x fast.
  Walking_A: Object.freeze({
    durationSeconds: 1.0667, authoredSpeedMps: 0.643, strideMeters: 0.686,
    axis: 'forward', airborneFraction: 0.20, footFitSpreadMps: 0.049,
  }),
  // Authored at 1.053 m/s, which is our walk speed to within 5%. This is the walk.
  Walking_B: Object.freeze({
    durationSeconds: 1.0667, authoredSpeedMps: 1.053, strideMeters: 1.123,
    axis: 'forward', airborneFraction: 0.21, footFitSpreadMps: 0.010,
  }),
  Walking_C: Object.freeze({
    durationSeconds: 1.6, authoredSpeedMps: 0.478, strideMeters: 0.765,
    axis: 'forward', airborneFraction: 0.24, footFitSpreadMps: 0.017,
  }),
  Walking_Backwards: Object.freeze({
    durationSeconds: 1.0667, authoredSpeedMps: -0.623, strideMeters: -0.665,
    axis: 'forward', airborneFraction: 0.11, footFitSpreadMps: 0.028,
  }),
  // The run. 63% of its cycle is airborne and its step is 1.31m - 3.5 leg lengths - so it is
  // authored for a gait more than twice as fast as anything this game currently moves at.
  Running_A: Object.freeze({
    durationSeconds: 0.8, authoredSpeedMps: 3.268, strideMeters: 2.614,
    axis: 'forward', airborneFraction: 0.63, footFitSpreadMps: 0.001,
  }),
  // Faster still, and barely touching the ground: 5% contact per foot is too little to fit a
  // confident slope against, which is itself the reason not to use it.
  Running_B: Object.freeze({
    durationSeconds: 0.8, authoredSpeedMps: 7.2, strideMeters: 5.76,
    axis: 'forward', airborneFraction: 0.83, footFitSpreadMps: 0.133,
  }),
  // Recorded, unused. KayKit ships a running strafe and no walking one, so the sidestep this lab
  // actually performs - 0.75 m/s while locked - has no clip at any speed: these would play at a
  // quarter rate. This is the strafe debt, written down with the number that makes it a debt.
  // R20X.1 re-measured these along their own axis - the first pass fitted them down z like the
  // forward clips, which is the wrong axis for a sidestep, and carried a guessed airborne fraction.
  // They are more airborne than the forward run, not less: 80% of the cycle, 8% contact per foot.
  Running_Strafe_Left: Object.freeze({
    durationSeconds: 0.8, authoredSpeedMps: 3.040, strideMeters: 2.432,
    axis: 'lateral', airborneFraction: 0.80, footFitSpreadMps: 0.013, crossAxisFootSwingMeters: 0.302,
  }),
  Running_Strafe_Right: Object.freeze({
    durationSeconds: 0.8, authoredSpeedMps: -3.015, strideMeters: -2.412,
    axis: 'lateral', airborneFraction: 0.80, footFitSpreadMps: 0.006, crossAxisFootSwingMeters: 0.302,
  }),
});

export const LOCOMOTION_CLIP_MEASUREMENT_METHOD = Object.freeze({
  method: 'forward-kinematics-then-least-squares-slope-across-each-foot-contact',
  samplesPerCycle: 480,
  contactTest: 'toe-height-within-10-percent-of-its-own-range-above-the-floor',
  agreementCheck: 'left-and-right-feet-fitted-independently',
  sources: ['assets/kaykit/animations/basic.glb', 'assets/kaykit/animations/advanced.glb'],
  rig: 'src/character/kaykit-rig-definition.js',
});

// R20W.1: the leg this rig actually has, kept because it is what the old assumption was built on
// and because it is the length every gait ratio below is dimensionless against.
export const KAYKIT_LEG_CHAIN_METERS = 0.3765;

// What the assumption cost, stated rather than deleted. 0.8 leg lengths per step gave a 0.6016m
// cycle; Walking_A really covers 0.686m, so the shipped walk slid 12% of every step - and the walk
// that matches our speed covers 1.123m, which the assumption was never going to reach.
export const REPLACED_STRIDE_ASSUMPTION = Object.freeze({
  assumedStepPerLegLength: 0.8,
  assumedCycleMeters: 0.3765 * 0.8 * 2,
  measuredCycleMetersWalkingA: 0.686,
  measuredStepPerLegLengthWalkingA: 0.686 / 2 / 0.3765,
  measuredStepPerLegLengthWalkingB: 1.123 / 2 / 0.3765,
  verdict: 'a-stride-is-drawn-not-implied-by-the-skeleton',
});

// R20W.1: where a walk stops being a walk, for this body. Not a taste call - the walk-to-run
// transition sits at a Froude number of about 0.5, which for a 0.3765m leg is 1.36 m/s. Sprint at
// 1.5 m/s is past it, so this body IS running; the problem is that the only run clip we own was
// drawn for 3.27 m/s. Playing it at our speed would stretch its 0.8s cycle to 1.74s, holding a
// 63%-airborne pose for over a second. So sprint keeps the walk clip and reads as a hurried walk,
// and the honest way to make sprint LOOK like a run is to raise its speed, not to swap its clip.
export const WALK_TO_RUN_TRANSITION = Object.freeze({
  froudeNumber: 0.5,
  gravityMps2: 9.81,
  legLengthMeters: 0.3765,
  biomechanicalTransitionMps: Math.sqrt(0.5 * 9.81 * 0.3765),
  // The speed at which the walk and run clips are stretched by equally much - the geometric mean of
  // what they were authored for. Below it the walk is the better-behaved clip, above it the run is.
  leastStretchCrossoverMps: Math.sqrt(1.053 * 3.268),
  sprintSpeedMps: 1.5,
  decision: 'sprint-below-the-crossover-keeps-the-walk-clip',
});

export function locomotionClipMeasurement(clipId) {
  return MEASURED_LOCOMOTION_CLIPS[clipId] || null;
}

// Signed: the distance the body travels in one full cycle of the clip, in the direction the clip
// carries it. Null for a clip nobody measured, so a caller cannot silently invent a stride.
export function strideMetersFor(clipId) {
  return locomotionClipMeasurement(clipId)?.strideMeters ?? null;
}

// How far from its authored gait a clip is being driven. 1 is as drawn; above 1 the legs hurry,
// below 1 they float. Reported rather than clamped, because the number is the debt.
export function clipPlaybackRate(clipId, speedMetersPerSecond) {
  const measured = locomotionClipMeasurement(clipId);
  if (!measured || !Number.isFinite(Number(speedMetersPerSecond))) return null;
  const authored = Math.abs(measured.authoredSpeedMps);
  if (!(authored > 1e-9)) return null;
  return Math.abs(Number(speedMetersPerSecond)) / authored;
}
