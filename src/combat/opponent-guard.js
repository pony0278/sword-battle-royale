import { createSeededRandom } from './opponent-drive.js';

export const OPPONENT_GUARD_STAGE = 'R23S.1';

// R23S.1 — whether the opponent holds their shield up, and why that is the whole of step 6a.
//
// Measured before this existed (R23A.1 through R23R.1): the attacker fighter already owns every
// guard runtime the player has - the machine, the presentation, the bracing, the parry gate, the
// stance - because createFighter builds one of each for both bodies. Nothing ever pressed their
// guard, and the player's engagement was built with `stanceReport: { guardActive: false }` written
// in by hand, so every swing the player threw met a body and never a shield. A block is geometric -
// the swept blade against the buckler where the guard pose put it - gated by one read, "is the
// guard up", and it does not care which sector (R21O: block does not take direction; only the
// parry gate does). So an opponent who blocks is an opponent who HOLDS, at the right moment, and
// this module decides that and nothing else.
//
// The numbers are dials with a measured floor under them. The player's contact comes 0.43s into
// every swing (MEASURED_CONTACT_SECONDS); the guard's enter takes 0.18s of presentation to reach
// HOLD (enterGuard advances it 180ms in one frame); so a reaction later than 0.25s puts the shield
// up after the blade has arrived, and a reaction of 0.18s puts it up with 0.07s to spare - which is
// what a person parrying at 180ms TTC in the defence matrix also has. blockChance is what makes the
// duel winnable at all: a shield that answers every swing is a wall, not an opponent.
export const OPPONENT_GUARD_PROFILE = Object.freeze({
  reactionSeconds: 0.18,
  blockChance: 0.6,
  holdAfterSwingSeconds: 0.25,
  authority: 'decides-only-whether-the-shield-is-held-no-contact-authority',
});

export const OPPONENT_GUARD_REASONS = Object.freeze({
  SWINGING: 'own-swing-owns-the-body',
  NO_THREAT: 'no-swing-to-answer',
  UNDECIDED: 'swing-not-yet-seen',
  DECLINED: 'chose-not-to-block-this-one',
  REACTING: 'seen-not-yet-answered',
  BLOCKING: 'shield-up-for-the-swing',
  LOWERING: 'shield-still-up-after-the-swing',
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

// One roll per swing the player throws. Rolled when the swing is first seen, never re-rolled, so
// the same seed answers the same fight the same way - the R21E.1 property, kept.
export function decideOpponentGuard(random, profile = OPPONENT_GUARD_PROFILE) {
  const roll = typeof random === 'function' ? finite(random()) : 1;
  return Object.freeze({
    willBlock: roll < finite(profile.blockChance),
    reactionSeconds: Math.max(0, finite(profile.reactionSeconds)),
    roll,
  });
}

// Pure. Given the swing coming at them (or none), what they decided about it, and their own
// state, is the shield held this frame?
export function planOpponentGuard({
  threat = null,
  decision = null,
  sinceThreatEndedSeconds = Infinity,
  ownSwinging = false,
  profile = OPPONENT_GUARD_PROFILE,
} = {}) {
  const verdict = (hold, reason) => Object.freeze({ stage: OPPONENT_GUARD_STAGE, hold, reason, authority: profile.authority });
  if (ownSwinging === true) return verdict(false, OPPONENT_GUARD_REASONS.SWINGING);
  if (threat?.active === true) {
    if (!decision) return verdict(false, OPPONENT_GUARD_REASONS.UNDECIDED);
    if (decision.willBlock !== true) return verdict(false, OPPONENT_GUARD_REASONS.DECLINED);
    if (finite(threat.elapsedSeconds) < decision.reactionSeconds) return verdict(false, OPPONENT_GUARD_REASONS.REACTING);
    return verdict(true, OPPONENT_GUARD_REASONS.BLOCKING);
  }
  if (decision?.willBlock === true && finite(sinceThreatEndedSeconds, Infinity) < finite(profile.holdAfterSwingSeconds)) {
    return verdict(true, OPPONENT_GUARD_REASONS.LOWERING);
  }
  return verdict(false, OPPONENT_GUARD_REASONS.NO_THREAT);
}

export { createSeededRandom };
