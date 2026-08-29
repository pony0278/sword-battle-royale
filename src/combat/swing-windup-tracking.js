import { LONGSWORD_ATTACK_PHASES } from './longsword-directional-attack-runtime.js';

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
//   LEFT met by a left step: body hits at EVERY stance and EVERY rate tried - 1.6m, 1.8m,
//     and 2.4m, where the freeze used to whiff 3/4.
//
// The LEFT row is the honest limit of attacker-side tracking, and it is kept, not hidden:
// the residual 6-8 degrees at outcome is bearing, not aim - the tracker has the attacker
// pointed true, and what fails is the DEFENDER's left flank, the same zero-margin edge every
// instrument has found (guard cone from-degrees 0, delivery band from-degrees 0, the -2
// degree collapse). An attacker rule cannot repair a defender flank. What tracking buys
// there is consistency: the freeze split the same left step into a reward far and a
// punishment near, decided by stance; tracked, a step into the low sweep's flank is punished
// at every range - one learnable rule where a coin used to sit. Widening that flank's
// margin, if it should be widened, is a defender-side stage with its own measurements.
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
  const windup = input.phase === LONGSWORD_ATTACK_PHASES.WINDUP;
  return Object.freeze({
    stage: SWING_WINDUP_TRACKING_STAGE,
    mode: windup ? 'track' : 'frozen',
    rateRadiansPerSecond: windup ? SWING_WINDUP_TRACKING_RATE_RADIANS_PER_SECOND : null,
    authority: 'attacker-facing-policy-no-contact-authority',
  });
}
