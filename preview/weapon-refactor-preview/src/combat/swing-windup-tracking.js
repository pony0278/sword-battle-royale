import { ATTACK_PHASES } from './attack-phases.js';

export const SWING_WINDUP_TRACKING_STAGE = 'R20B.1';

// R20B.1: the committed swing tracks during its windup and releases at the active window.
// Stage B4a - the freeze (R19T) becomes track-then-freeze, and the freeze point becomes the
// release point every future dodge verb will be timed against.
//
// Why this exists is R20A.1's finding, not the premise B4 was scoped under: today's sidestep
// was never a dodge. What the freeze actually produced was illegible randomness at the
// delivery cone's cliffs - the same walk punished at one stance and rewarded at another,
// with nothing visible to the player. Windup tracking closes what is closable; the
// active-window freeze keeps commitment real and gives a future dash a line to beat.
//
// Measured with a full-speed sidestep held from the commitment frame, fresh page per trial -
// and re-measured after the first pass was caught flattering itself: the premise probe
// dispatched its strafe key through a timer, starting the walk one frame late, and one frame
// of displacement flips every knife-edge cell. The numbers below are the synchronous-start
// protocol, the same one every R20A baseline used.
//
//   TOP met by a right step at 1.8m:  frozen 2/4 body hits (the -25 cliff's edge) ->
//     tracked 6/6 blocked, at 20, 45, and 90 deg/s alike.
//   Every TOP and RIGHT cell at 2.4m and 1.8m: blocked 4/4.
//
// At ship time LEFT met by a left step still read as body hits at every stance and rate, and
// this stage recorded it as "the honest limit of attacker-side tracking - a defender flank an
// attacker rule cannot repair". R20C's autopsy corrected the record: what failed was not a
// flank but the R19Z cone gate enforcing LEFT's unsampled zero band edge - a left step puts a
// fraction of a degree of negative chase lag on the defender, and the gate stood the entire
// guard down on that noise. With the edge re-measured to -20 (R20C.1), a tracked left step
// blocks 4/4 at every stance, like every other cell in the grid.
//
// The rate: outcomes were rate-insensitive from 20 deg/s up on every measured cell, because
// the ledger re-aims the swing's advance along the tracked facing every frame and the lunge
// bends toward the walker before the torso has turned far. 45 ships as the midpoint of
// nothing-changes: small enough to read as a torso adjustment (at most ~17 degrees across
// TOP's 0.375s windup), far under the free body's 180 and the guard turn's 280 - a committed
// body visibly turns worse than a free one - and under the ~95 deg/s of bearing a dash-grade
// burst would generate at 1.8m, so the day the dodge verb exists it out-runs the windup and
// the release point becomes the timing game.
export const SWING_WINDUP_TRACKING_RATE_RADIANS_PER_SECOND = (45 * Math.PI) / 180;

// What the attacker's base facing may do right now. Free when no swing is committed (the
// runtime's own chase rate applies); tracking at the measured rate through the windup; frozen
// from the active window until the exchange resolves. Doubt resolves to the freeze: a live
// swing in a phase this rule cannot name keeps the measured legacy behaviour.
export function planSwingFacingPolicy(input = {}) {
  const swingLive = input.swingLive === true;
  if (!swingLive) {
    return Object.freeze({
      stage: SWING_WINDUP_TRACKING_STAGE,
      mode: 'free',
      rateRadiansPerSecond: null,
      authority: 'attacker-facing-policy-no-contact-authority',
    });
  }
  const windup = input.phase === ATTACK_PHASES.WINDUP;
  return Object.freeze({
    stage: SWING_WINDUP_TRACKING_STAGE,
    mode: windup ? 'track' : 'frozen',
    rateRadiansPerSecond: windup ? SWING_WINDUP_TRACKING_RATE_RADIANS_PER_SECOND : null,
    authority: 'attacker-facing-policy-no-contact-authority',
  });
}
