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

// Forward only. In free mode a fighter faces where they are going, so running away is turning
// round and running - and a sprint that also carried a backpedal would make retreating faster than
// advancing, which is the one thing the walk profile deliberately refuses.
export function planSprint(input = {}) {
  const requested = input.requested === true;
  const forwardInput = Math.sign(finite(input.forwardInput));
  const refusal = !requested ? 'not-requested'
    : input.locked === true ? 'locked-on-let-go-of-the-lock-to-run'
      : input.guardActive === true ? 'guard-is-up'
        : input.attacking === true ? 'mid-swing'
          : input.dodging === true ? 'mid-dodge'
            : forwardInput <= 0 ? 'sprint-is-forward-only'
              : null;
  return Object.freeze({
    stage: SPRINT_LOCOMOTION_STAGE,
    sprinting: refusal == null,
    speedMps: refusal == null ? SPRINT_SPEED_MPS : LANE_LOCOMOTION_PROFILE.forwardSpeedMps,
    reason: refusal ?? 'running',
    authority: 'locomotion-only-no-contact-authority',
  });
}
