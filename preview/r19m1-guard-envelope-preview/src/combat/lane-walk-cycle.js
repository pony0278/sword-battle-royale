import {
  KAYKIT_LEG_CHAIN_METERS,
  clipPlaybackRate,
  strideMetersFor,
} from './locomotion-clip-measurements.js';

export const LANE_WALK_CYCLE_STAGE = 'R20W.1';

export { KAYKIT_LEG_CHAIN_METERS };

// R19C.1, remeasured in R20W.1: where in its walk cycle a fighter's legs should be.
//
// The cycle is driven by distance covered, not by elapsed time. That is the whole difference
// between a walk and a character sliding along with their legs waving: if the feet finish a stride
// in a second regardless of how far the body actually went, they plant and skate. Phase per metre
// is the only relationship that keeps a foot still while it is on the ground.
//
// R19C.1 took the stride from the rig - 0.8 of a leg length per step - because the clips carry no
// root translation, and flagged that 0.8 as the module's one assumption and the first dial to turn
// if the gait read wrong. It read wrong. locomotion-clip-measurements.js now reads the stride out
// of each clip's own foot contacts instead, and the assumption was short by 12% on the clip we were
// playing and by 46% on the clip we should have been playing.
//
// With a measured stride per clip the foot slide is zero at any speed, and the only thing left that
// varies with speed is how fast the clip runs compared to how it was drawn - which is a matter of
// how the gait reads, not whether the feet lie. That ratio is reported rather than hidden.
export const LANE_WALK_CLIPS = Object.freeze({
  // Walking_A shipped here and is authored for 0.643 m/s. Both fighters walk at 1.0 m/s, and
  // Walking_B is authored at 1.053 - so the clip that matches the game was in the pack all along.
  forward: 'Walking_B',
  backward: 'Walking_Backwards',
});

export const LANE_WALK_CYCLE_PROFILE = Object.freeze({
  forwardClipId: LANE_WALK_CLIPS.forward,
  backwardClipId: LANE_WALK_CLIPS.backward,
  forwardCycleMeters: strideMetersFor(LANE_WALK_CLIPS.forward),
  backwardCycleMeters: strideMetersFor(LANE_WALK_CLIPS.backward),
  // Below this the fighter is standing rather than walking, and the legs should settle rather than
  // creep through a stride one millimetre at a time. Chosen as the distance a walk covers in a
  // single frame at 60Hz, so it is "moved less than one frame's worth", not an arbitrary epsilon.
  movingThresholdMetersPerSecond: 0.05,
  authority: 'walk-presentation-only-no-contact-authority',
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

// Wraps into [0,1) without the negative-modulo trap: `-0.2 % 1` is `-0.2`, which would sample off
// the front of the clip.
export function wrapCyclePhase(phase) {
  const value = finite(phase);
  const wrapped = value % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

// Holds one fighter's gait. Fed the distance they actually travelled, so it cannot disagree with
// the ledger about how far anybody went.
export function createLaneWalkCycle(options = {}) {
  const clips = Object.freeze({ ...LANE_WALK_CLIPS, ...(options.clips || {}) });
  const profile = Object.freeze({
    forwardClipId: clips.forward,
    backwardClipId: clips.backward,
    forwardCycleMeters: strideMetersFor(clips.forward),
    backwardCycleMeters: strideMetersFor(clips.backward),
    movingThresholdMetersPerSecond: LANE_WALK_CYCLE_PROFILE.movingThresholdMetersPerSecond,
    authority: LANE_WALK_CYCLE_PROFILE.authority,
    ...(options.profile || {}),
  });
  if (!Number.isFinite(profile.forwardCycleMeters) || !Number.isFinite(profile.backwardCycleMeters)) {
    // A clip nobody measured has no stride, and guessing one is exactly what this module stopped
    // doing. Fail where the clip is chosen rather than skate at runtime.
    throw new Error(`createLaneWalkCycle needs measured strides for ${clips.forward} and ${clips.backward}`);
  }
  let phase = 0;
  let lastReport = null;

  function report(travelledMeters, speedMetersPerSecond) {
    const moving = Math.abs(speedMetersPerSecond) >= profile.movingThresholdMetersPerSecond;
    // Backwards walking has its own clip; the sign says which clip, not which way to play it.
    const direction = !moving ? 0 : Math.sign(speedMetersPerSecond);
    const clipId = !moving ? null : (direction > 0 ? profile.forwardClipId : profile.backwardClipId);
    lastReport = Object.freeze({
      stage: LANE_WALK_CYCLE_STAGE,
      phase,
      moving,
      direction,
      clipId,
      cycleMeters: !moving ? null : (direction > 0 ? profile.forwardCycleMeters : profile.backwardCycleMeters),
      // 1 is the gait as drawn. Above 1 the legs hurry, below 1 they float. Nothing reads this to
      // decide anything - it is here so the stretch is a number somebody can see.
      playbackRate: clipId ? clipPlaybackRate(clipId, speedMetersPerSecond) : null,
      travelledMeters,
      speedMetersPerSecond,
      profile,
      authority: profile.authority,
    });
    return lastReport;
  }

  function advance({ travelledMeters, deltaSeconds } = {}) {
    const travelled = finite(travelledMeters);
    const seconds = Math.max(0, finite(deltaSeconds));
    const speed = seconds > 1e-9 ? travelled / seconds : 0;
    if (Math.abs(speed) >= profile.movingThresholdMetersPerSecond) {
      // Divided by the SIGNED stride of the clip that is about to play, so both clips run forwards
      // in time: walking backwards at -0.1m against a -0.665m stride advances the phase, exactly
      // as walking forwards does. Dividing by an unsigned stride ran the backwards clip in reverse.
      const cycleMeters = speed > 0 ? profile.forwardCycleMeters : profile.backwardCycleMeters;
      if (Math.abs(cycleMeters) > 1e-9) phase = wrapCyclePhase(phase + travelled / cycleMeters);
    }
    return report(travelled, speed);
  }

  // Standing still does not rewind the gait: a fighter who stops and starts again continues from
  // the foot they were on, which is what stops a stutter-step every time a key is tapped.
  function settle() {
    return report(0, 0);
  }

  function reset() {
    phase = 0;
    lastReport = null;
    return null;
  }

  return Object.freeze({
    advance,
    settle,
    reset,
    get phase() { return phase; },
    get report() { return lastReport; },
    get profile() { return profile; },
  });
}

// The clip time to sample, given a phase and how long the clip is. Separate from the cycle itself
// because forwards and backwards walks are different clips of different lengths, and the gait
// should not have to know how long any of them run for.
export function walkClipTimeSeconds(phase, clipDurationSeconds) {
  const duration = Math.max(0, finite(clipDurationSeconds));
  return wrapCyclePhase(phase) * duration;
}
