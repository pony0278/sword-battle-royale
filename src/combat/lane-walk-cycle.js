import {
  KAYKIT_LEG_CHAIN_METERS,
  WALK_TO_RUN_TRANSITION,
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
  // R20W.2: the run. Where it takes over is measured rather than tied to the sprint key: a gait is
  // a run when the body is going fast enough to be running, which for this rig's 0.3765m leg is
  // 1.36 m/s (Froude 0.5). Sprint at 1.5 is past it and walking at 1.0 is not, so the same rule
  // that reads as "sprint runs" keeps meaning the right thing if either speed ever moves.
  //
  // R21U.1 took the legs back off it, so this names the run for one purpose only: the clip the
  // sprint borrows its upper body from. R22C.1 moved it from Running_A to Running_B, chosen from
  // play after ?runclip= put both on the same build.
  //
  // The cost of ever putting the LEGS back on it is worse for this clip, not better, and is on the
  // record so nobody re-reads this line as an invitation: Running_B is drawn for 7.2 m/s (a second
  // fit says 4.73 - see locomotion-clip-measurements.js), so at the sprint's 1.5 it manages 0.52
  // steps per second against a walking person's two. R22B.1 has the arithmetic. The walk keeps the
  // legs because at 1.5 its cadence is 2.67 steps/s, which is a running cadence.
  run: 'Running_B',
  // Backing away has no run: KayKit ships no backwards run, and a locked retreat is a walk anyway.
});

export const LANE_WALK_CYCLE_PROFILE = Object.freeze({
  forwardClipId: LANE_WALK_CLIPS.forward,
  backwardClipId: LANE_WALK_CLIPS.backward,
  runClipId: LANE_WALK_CLIPS.run,
  forwardCycleMeters: strideMetersFor(LANE_WALK_CLIPS.forward),
  backwardCycleMeters: strideMetersFor(LANE_WALK_CLIPS.backward),
  runCycleMeters: strideMetersFor(LANE_WALK_CLIPS.run),
  runThresholdMetersPerSecond: WALK_TO_RUN_TRANSITION.biomechanicalTransitionMps,
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
    runClipId: clips.run ?? null,
    forwardCycleMeters: strideMetersFor(clips.forward),
    backwardCycleMeters: strideMetersFor(clips.backward),
    runCycleMeters: clips.run ? strideMetersFor(clips.run) : null,
    runThresholdMetersPerSecond: LANE_WALK_CYCLE_PROFILE.runThresholdMetersPerSecond,
    movingThresholdMetersPerSecond: LANE_WALK_CYCLE_PROFILE.movingThresholdMetersPerSecond,
    authority: LANE_WALK_CYCLE_PROFILE.authority,
    ...(options.profile || {}),
  });
  const measured = [profile.forwardCycleMeters, profile.backwardCycleMeters]
    .concat(profile.runClipId ? [profile.runCycleMeters] : []);
  if (measured.some((stride) => !Number.isFinite(stride))) {
    // A clip nobody measured has no stride, and guessing one is exactly what this module stopped
    // doing. Fail where the clip is chosen rather than skate at runtime.
    throw new Error(`createLaneWalkCycle needs measured strides for ${Object.values(clips).join(', ')}`);
  }

  // Which clip a speed belongs to. Backwards has only the one; forwards there is now only one too.
  //
  // R21U.1: the run no longer takes the legs. R20W.2 handed them to Running_A above the measured
  // transition, and the far side of that switch was wrong twice over - Running_A's 2.614m stride
  // gives 1.15 steps per second at the sprint's 1.5 m/s, fewer than a WALKING person's two, and no
  // speed this game may run at fixes it (the ceiling is 1.62, where it manages 1.24). Walking_B at
  // the same speed takes 2.67 steps/second, which is a running cadence. The legs were right all
  // along; it was the POSE that was missing, and sprint-arm-overlay.js borrows that instead.
  //
  // R22C.1 made the borrowed clip Running_B, whose stride is longer still, so the case is stronger
  // rather than weaker: 0.52 steps/s if its legs were ever worn at the sprint's speed.
  //
  // The threshold stays in the profile because the arm overlay begins ramping exactly where this
  // switch used to fire - the gait is still a run at 1.36 m/s, it just no longer changes clip.
  function clipFor(speedMetersPerSecond) {
    if (speedMetersPerSecond < 0) return { clipId: profile.backwardClipId, cycleMeters: profile.backwardCycleMeters };
    return { clipId: profile.forwardClipId, cycleMeters: profile.forwardCycleMeters };
  }
  let phase = 0;
  let lastReport = null;

  function report(travelledMeters, speedMetersPerSecond) {
    const moving = Math.abs(speedMetersPerSecond) >= profile.movingThresholdMetersPerSecond;
    // Backwards walking has its own clip; the sign says which clip, not which way to play it.
    const direction = !moving ? 0 : Math.sign(speedMetersPerSecond);
    const chosen = moving ? clipFor(speedMetersPerSecond) : { clipId: null, cycleMeters: null };
    const clipId = chosen.clipId;
    lastReport = Object.freeze({
      stage: LANE_WALK_CYCLE_STAGE,
      phase,
      moving,
      direction,
      clipId,
      // R20W.2: a run is a whole-body clip, and a guard cannot borrow only its legs without the
      // torso disagreeing. Sprinting already requires the guard down, so this never contradicts
      // the overlay - it is stated so a caller cannot quietly overlay a run onto a guard.
      // R21U.1: nothing the legs wear is whole-body-only any more - the run is not worn at all.
      // Kept as a field rather than removed because planWalkOverlay still asks, and a caller that
      // one day hands the legs a whole-body clip should still be refused.
      wholeBodyOnly: clipId != null && clipId === profile.runClipId,
      cycleMeters: chosen.cycleMeters,
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
      const { cycleMeters } = clipFor(speed);
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
