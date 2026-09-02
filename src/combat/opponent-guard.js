import { createSeededRandom } from './opponent-drive.js';
import { GUARD_SECTORS } from './guard-sector.js';
import { defendedSectorFor } from './attack-direction-as-defended.js';

export const OPPONENT_GUARD_STAGE = 'R23T.1';

// R23T.1 — which sector the opponent's shield is in, and why that is the whole of step 6b.
//
// R23S.1 (6a) raised and lowered the shield: a roll per swing decided whether it came up at all,
// and the opponent stood between swings with the sword down while the player, in parry mode,
// stood in guard. A person noticed the two stances did not match. The For Honor duel this is
// heading for has both fighters in guard the whole time, each shield in ONE of three sectors, a
// swing landing when it arrives where the shield is not - and R23T.1 made the block take
// direction for both fighters (guard-sector-gate.js). So the opponent now HOLDS whenever the drive
// is on and their own swing is not owning the body, and what the roll decides is whether they
// READ this swing and move the shield into its sector in time.
//
// Measured: the player's contact comes 0.43s into every swing (MEASURED_CONTACT_SECONDS), the
// guard sector switches on the frame it is chosen (R21N.1 select is discrete), so a reaction of
// 0.18s puts the shield in the sector with 0.25s to spare - the same margin the parry gate's
// 180ms window gives a person. coverChance is what makes the duel winnable: a shield that reads
// every swing is a wall. Between swings the shield stays where it last was, which is what a
// person's shield does too; a swing into the sector it already holds is blocked without a read.
export const OPPONENT_GUARD_PROFILE = Object.freeze({
  reactionSeconds: 0.18,
  coverChance: 0.6,
  restSector: 'top',
  authority: 'decides-only-whether-the-shield-is-held-and-which-sector-no-contact-authority',
});

export const OPPONENT_GUARD_REASONS = Object.freeze({
  SWINGING: 'own-swing-owns-the-body-shield-stays',
  STANDING: 'in-guard-where-the-shield-last-was',
  UNDECIDED: 'swing-not-yet-seen',
  DECLINED: 'did-not-read-this-one-shield-stays',
  REACTING: 'seen-not-yet-answered',
  COVERING: 'shield-moved-into-the-sector-the-swing-arrives-at',
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
    willCover: roll < finite(profile.coverChance),
    reactionSeconds: Math.max(0, finite(profile.reactionSeconds)),
    roll,
  });
}

// Pure. Given the swing coming at them (or none), what they decided about it, where the shield
// is now and their own state: is the shield held this frame, and in which sector?
export function planOpponentGuard({
  threat = null,
  decision = null,
  currentSector = null,
  ownSwinging = false,
  profile = OPPONENT_GUARD_PROFILE,
} = {}) {
  const held = GUARD_SECTORS.includes(String(currentSector || '').toLowerCase())
    ? String(currentSector).toLowerCase()
    : (GUARD_SECTORS.includes(profile.restSector) ? profile.restSector : GUARD_SECTORS[0]);
  const verdict = (hold, sector, reason) => Object.freeze({ stage: OPPONENT_GUARD_STAGE, hold, sector, reason, authority: profile.authority });
  // R23U.1: held, not dropped. The player's guard machine stays HOLD through their own swing and
  // the swing merely owns the pose; mirroring that is what removed the re-entry snap. What the
  // swing does forbid is moving the shield - a body mid-swing reads nothing.
  if (ownSwinging === true) return verdict(true, held, OPPONENT_GUARD_REASONS.SWINGING);
  if (threat?.active !== true) return verdict(true, held, OPPONENT_GUARD_REASONS.STANDING);
  if (!decision) return verdict(true, held, OPPONENT_GUARD_REASONS.UNDECIDED);
  if (decision.willCover !== true) return verdict(true, held, OPPONENT_GUARD_REASONS.DECLINED);
  if (finite(threat.elapsedSeconds) < decision.reactionSeconds) return verdict(true, held, OPPONENT_GUARD_REASONS.REACTING);
  const target = defendedSectorFor(threat.direction) || held;
  return verdict(true, target, OPPONENT_GUARD_REASONS.COVERING);
}

export { createSeededRandom };
