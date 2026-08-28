export const LANE_WALK_CYCLE_STAGE = 'R19C.1';

// R19C.1: where in its walk cycle a fighter's legs should be.
//
// The cycle is driven by distance covered, not by elapsed time. That is the whole difference
// between a walk and a character sliding along with their legs waving: if the feet finish a stride
// in a second regardless of how far the body actually went, they plant and skate. Phase per metre
// is the only relationship that keeps a foot still while it is on the ground.
//
// Stride comes from the rig rather than from the clip. The KayKit locomotion clips animate by bone
// rotation with no root translation at all, so there is no baked stride to read without solving
// forward kinematics through the leg chain. What is directly measurable is the leg itself: in
// kaykit-rig-definition.js the chain is upperleg -> lowerleg 0.227m plus lowerleg -> foot 0.149m,
// so 0.376m of leg. A walking step is conventionally a little under one leg length; 0.8 is the
// figure used here, giving a 0.30m step and a 0.60m two-step cycle.
//
// That 0.8 is the one assumed number in this module and it is worth flagging as such: everything
// else is measured. It is also the right number to change first if the gait reads wrong, because
// it is exactly the foot-slide dial.
export const KAYKIT_LEG_CHAIN_METERS = 0.376;
export const WALK_STEP_PER_LEG_LENGTH = 0.8;

export const LANE_WALK_CYCLE_PROFILE = Object.freeze({
  stepMeters: KAYKIT_LEG_CHAIN_METERS * WALK_STEP_PER_LEG_LENGTH,
  // Two steps to a cycle, because a clip covers both feet.
  get cycleMeters() { return this.stepMeters * 2; },
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

// Wraps into [0,1) without the negative-modulo trap: a fighter walking backwards runs the cycle in
// reverse, and `-0.2 % 1` is `-0.2`, which would sample off the front of the clip.
export function wrapCyclePhase(phase) {
  const value = finite(phase);
  const wrapped = value % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

// Holds one fighter's gait. Fed the distance they actually travelled, so it cannot disagree with
// the ledger about how far anybody went.
export function createLaneWalkCycle(options = {}) {
  const profile = Object.freeze({
    stepMeters: LANE_WALK_CYCLE_PROFILE.stepMeters,
    cycleMeters: LANE_WALK_CYCLE_PROFILE.cycleMeters,
    movingThresholdMetersPerSecond: LANE_WALK_CYCLE_PROFILE.movingThresholdMetersPerSecond,
    authority: LANE_WALK_CYCLE_PROFILE.authority,
    ...(options.profile || {}),
  });
  let phase = 0;
  let lastReport = null;

  function report(travelledMeters, speedMetersPerSecond) {
    const moving = Math.abs(speedMetersPerSecond) >= profile.movingThresholdMetersPerSecond;
    lastReport = Object.freeze({
      stage: LANE_WALK_CYCLE_STAGE,
      phase,
      moving,
      // Backwards walking runs its own clip forwards; the sign says which clip, not which
      // direction to play it.
      direction: !moving ? 0 : Math.sign(speedMetersPerSecond),
      travelledMeters,
      speedMetersPerSecond,
      cycleMeters: profile.cycleMeters,
      profile,
      authority: profile.authority,
    });
    return lastReport;
  }

  function advance({ travelledMeters, deltaSeconds } = {}) {
    const travelled = finite(travelledMeters);
    const seconds = Math.max(0, finite(deltaSeconds));
    const speed = seconds > 1e-9 ? travelled / seconds : 0;
    if (Math.abs(speed) >= profile.movingThresholdMetersPerSecond && profile.cycleMeters > 1e-9) {
      phase = wrapCyclePhase(phase + travelled / profile.cycleMeters);
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
// because which clip is playing is a presentation decision - forwards and backwards walks are
// different clips of different lengths - and the gait should not have to know.
export function walkClipTimeSeconds(phase, clipDurationSeconds) {
  const duration = Math.max(0, finite(clipDurationSeconds));
  return wrapCyclePhase(phase) * duration;
}
