import { LANE_LOCOMOTION_PROFILE } from './lane-locomotion.js';
import { DODGE_COOLDOWN_SECONDS, DODGE_DURATION_SECONDS, DODGE_TRAVEL_METERS } from './dodge-state.js';

export const SPRINT_LOCOMOTION_STAGE = 'R20U.1';

// R20U.1 — running, and the hole it fills.
//
// WHY THIS EXISTS, measured rather than assumed: in this combat set nobody can leave. Distance
// belongs entirely to whoever is advancing, and three independent readings say so:
//
//   walking backward       the follower walks 1.0 m/s and the retreat is 0.75, so -0.25 m/s;
//   back dodge + cooldown  0.65m of travel against 1.4s of cycle, so -0.75m per attempt - WORSE
//                          than walking, because the dodge cannot walk and the cooldown is dead
//                          time. Driven against the real ledger, a defender back-dodging
//                          continuously hits the 0.9m contact floor in 4 seconds; walking backward
//                          the whole time still has 1.15m after five;
//   forward dodge          0.25m per 1.4s cycle, so crossing the lock band by dodging takes 11.8
//                          seconds against 2.1 walking - useless as an approach too.
//
// A dash was the obvious answer and is the wrong one. R20F.1's own investigation closed every
// geometric escape inside an exchange - 3 m/s of burst, any direction, any timing, 18/18 blocked -
// which is why the dodge escapes through TIME instead. A burst that adds no i-frames is a worse
// dodge. The thing that does not exist is not evasion; it is LEAVING.
//
// So sprint is a free-mode verb, and that is the whole design: locked buys time, free buys space.
// Running means giving up the lock first, which costs the aimed defence and the framing, and a
// chaser has to pay the same price - so a chase is two people who have both put their guard away.
// Nothing enforces that beyond the gates below; it falls out of where the verb lives.
//
// ON THE SPEED: this one is tuned, not measured, and says so. KayKit's Running clips are all
// in-place - zero net root travel - so there is no authored run speed to read off, exactly as
// there was no authored walk speed. What IS measured is the bracket it has to sit in.
export const SPRINT_SPEED_BRACKET_MPS = Object.freeze({
  // Below the walk it buys nothing.
  floor: LANE_LOCOMOTION_PROFILE.forwardSpeedMps,
  // At or above the dodge's authored burst, the dodge stops being the fastest thing a fighter can
  // do - the same judgement lane-locomotion already made about walking.
  ceiling: LANE_LOCOMOTION_PROFILE.authoredBurstCeilingMps,
});
export const SPRINT_SPEED_MPS = 1.5;
export const SPRINT_SPEED_PROVENANCE = 'seed-inside-a-measured-bracket-awaiting-play';

// R21V.1 - the play that provenance was waiting for, and a dial to answer it with.
//
// The seed was called too slow by hand, and the diagnosis is that nothing is in slow motion any
// more: after R21U.1 the arms play at 1.07x and the legs at 1.42x. What reads as slow is the GROUND
// speed - 1.5 m/s is 5.4 km/h, a brisk walk.
//
// Both ways out are blocked by something measured, which is why this is a dial rather than a new
// number. Staying inside the bracket buys 8% - 1.5 to the 1.62 ceiling - which nobody will feel.
// Going past it drives Walking_B at 1.90x by 2.0 m/s, and a gait cycling twice as fast as it was
// drawn reads as comedy.
//
// The ceiling itself deserves the scrutiny this makes possible. 1.62 is measured - Dodge_Backward
// covers 0.65m in 0.4s - but the RULE around it, "a walk that matched its own dodge would make the
// dodge pointless", compares a sustained speed against a 0.4-second burst. With the 1.0s cooldown
// a dodge sustains 0.65m / 1.4s = 0.46 m/s, slower than walking, and MEASURED_DISENGAGE_DEFICIT
// already computes exactly that. What a dodge is for is escaping a blow now, from standing, in a
// direction running cannot give you - and top speed is not that property.
//
// So: an override, allowed to leave the bracket, and honest about it when it does. Nothing ships
// outside the seed - the lab reads ?sprint= and the default is SPRINT_SPEED_MPS.
export const SPRINT_SPEED_OVERRIDE_RANGE_MPS = Object.freeze({ minimum: 1, maximum: 3 });

export function resolveSprintSpeed(value) {
  // Absent is not zero. `Number(null)` and `Number('')` are both 0, which is finite and would clamp
  // to the range's floor - so a URL with no ?sprint= at all would have quietly changed the speed.
  const absent = value == null || (typeof value === 'string' && value.trim() === '');
  const requested = absent ? Number.NaN : Number(value);
  if (!Number.isFinite(requested)) {
    return Object.freeze({ speedMps: SPRINT_SPEED_MPS, insideBracket: true, reason: 'seed' });
  }
  const { minimum, maximum } = SPRINT_SPEED_OVERRIDE_RANGE_MPS;
  const speedMps = Math.min(maximum, Math.max(minimum, requested));
  const bracket = SPRINT_SPEED_BRACKET_MPS;
  const insideBracket = speedMps >= bracket.floor && speedMps <= bracket.ceiling;
  return Object.freeze({
    speedMps,
    insideBracket,
    // Named rather than silently allowed: past the ceiling a sprint out-travels the dodge's own
    // burst, which is the thing the bracket exists to prevent.
    reason: insideBracket ? 'inside-the-measured-bracket' : 'past-the-dodge-burst-ceiling',
  });
}

// What the run has to beat, kept beside the speed so a future change can check itself: a chase is
// only winnable if the runner outpaces a walking follower.
export const MEASURED_DISENGAGE_DEFICIT = Object.freeze({
  walkingBackwardMetersPerSecond: LANE_LOCOMOTION_PROFILE.backwardSpeedMps - LANE_LOCOMOTION_PROFILE.forwardSpeedMps,
  backDodgeMetersPerCycle: (DODGE_TRAVEL_METERS.back ?? 0.65)
    - LANE_LOCOMOTION_PROFILE.forwardSpeedMps * (DODGE_DURATION_SECONDS + DODGE_COOLDOWN_SECONDS),
  sprintMetersPerSecond: SPRINT_SPEED_MPS - LANE_LOCOMOTION_PROFILE.forwardSpeedMps,
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

// Any direction, and that is not a relaxation - it is what free mode already is. A fighter with no
// lock faces wherever they are going: press the key that used to mean "back" and the body turns
// through 180 degrees at its own rate and runs that way. So there is no backpedal here to keep
// slow, and a rule that refused it was reading the KEY rather than the motion. In an exchange the
// distinction is real and the lock refusal below is what keeps it - facing is derived from the gap
// there, so backing off really is backing off, and it stays a walk.
export function planSprint(input = {}) {
  const requested = input.requested === true;
  const moving = Math.hypot(finite(input.forwardInput), finite(input.lateralInput)) > 0;
  const refusal = !requested ? 'not-requested'
    : input.locked === true ? 'locked-on-let-go-of-the-lock-to-run'
      : input.guardActive === true ? 'guard-is-up'
        : input.attacking === true ? 'mid-swing'
          : input.dodging === true ? 'mid-dodge'
            : !moving ? 'standing-still'
              : null;
  return Object.freeze({
    stage: SPRINT_LOCOMOTION_STAGE,
    sprinting: refusal == null,
    // R21V.1: the speed may be overridden for a playtest; the refusal path is always the walk.
    speedMps: refusal == null ? resolveSprintSpeed(input.speedMps).speedMps : LANE_LOCOMOTION_PROFILE.forwardSpeedMps,
    reason: refusal ?? 'running',
    authority: 'locomotion-only-no-contact-authority',
  });
}
