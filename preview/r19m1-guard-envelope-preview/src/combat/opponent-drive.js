import { LONGSWORD_ATTACK_DIRECTIONS } from './longsword-directional-metadata.js';

export const OPPONENT_DRIVE_STAGE = 'R21E.1';

// R21E.1 - the opponent drives themselves.
//
// Until now a tester held Shift+arrows to place the attacker and clicked TOP/RIGHT/LEFT to make
// them swing. That is not merely inconvenient: it means every playtest happened at a different,
// unrecorded distance, and the per-direction parry tally R21C.2 collects cannot be read against a
// distance nobody wrote down. This module decides the two things the tester was deciding by hand -
// where the attacker stands, and what they swing next - and decides them from measurements.
//
// It is an INPUT SOURCE and nothing else. Everything here comes back as an intent and a direction
// for the caller to feed through the same two public verbs a human uses (setAttackerIntent and
// startAttack). Nothing in this file may touch contact, poses or outcomes, which is what lets the
// golden grid and the parry gate - both of which drive attacks by hand at fixed separations - stay
// untouched with the drive switched off.

// R21E.1, measured: guard DOWN, every direction swept over start separations 1.40-3.90m in 0.10m
// steps, asking the only question that decides whether a swing is worth answering - does the blade
// reach the BODY when nothing is raised against it. Both edges re-run and identical.
//
//   top     lands from 2.90m and short of it, misses from 3.00m   (contact separation 2.04m)
//   right   lands from 2.60m and short of it, misses from 2.70m   (contact separation 1.94m)
//   left    lands from 2.60m and short of it, misses from 2.70m   (contact separation 2.15m)
//
// The start-to-contact drop matched ATTACK_ADVANCE_PROFILES to the millimetre in all three
// (0.862 / 0.663 / 0.448), so the advance model was already right; what was stale was the reach.
// See MEASURED_UNDEFENDED_BODY_REACH_METERS for why the old numbers read so much shorter.
export const MEASURED_OPPONENT_THREAT_CEILING_METERS = Object.freeze({
  top: 2.9,
  right: 2.6,
  left: 2.6,
  method: 'guard-down-sweep-1.40-3.90m-step-0.10m-body-hit-or-not',
  testedRange: Object.freeze({ minimum: 1.4, maximum: 3.9 }),
});

// Where the drive stands. The ceiling above sets the top of it: past 2.60m two of the three
// directions are theatre, so an opponent who stood at 2.70m would be teaching the player to answer
// blows that could not land. The floor is not a measurement of this module's own - below roughly
// 1.80m TOP and RIGHT close all the way onto the 0.90m body pushbox and contact at it, and
// close-range-engagement (R19J.2) already recorded that below 1.55m neither side has a working
// answer.
//
// The preferred distance is the calibrated engagement separation, kept because it is the one every
// other measurement in this codebase was taken at, and because it earns its place here: at 2.40m
// all three directions contact at 1.54 / 1.74 / 1.95m and all three were measured to strike the
// body unopposed, while the golden grid holds all three being blocked from it. Real stakes and a
// reproducible defence, at the distance the rest of the set already speaks.
export const OPPONENT_ENGAGEMENT_BAND_METERS = Object.freeze({
  minimum: 1.8,
  preferred: 2.4,
  maximum: 2.6,
  limitedBy: Object.freeze({ maximum: 'right-and-left-threat-ceiling', minimum: 'close-range-degeneracy' }),
});

// R21E.1, measured: frames from restartAttack() until startAttack() is accepted again, at 2.40m.
// Nothing reads these to decide anything - the runtime asks the lab whether an attack is available
// and believes the answer. They are here because they explain the rhythm the drive produces, and
// because they are why the old fixed 700ms "Auto repeat attack" was not a cadence at all: it is
// under TOP's floor, so a TOP loop simply waited on the gate every time.
export const MEASURED_ATTACK_CADENCE_FLOOR_MS = Object.freeze({
  top: 1517,
  right: 600,
  left: 783,
  method: 'restartAttack-to-next-accepted-startAttack-at-2.40m-fixed-60fps-step',
});

export const OPPONENT_DRIVE_PROFILE = Object.freeze({
  // Hysteresis, not one threshold, and the difference is worth the extra number. Attacks spend
  // their advance and keep it (ATTACK_ADVANCE_HOLDS_AFTER_CONTACT), so every swing leaves the
  // attacker 0.45-0.86m too close and walking back out is most of what this does. With a single
  // threshold the walk stops the instant it re-enters tolerance, so every swing launches from the
  // NEAR edge rather than the stated distance - measured over 35 attacks, every one of them went
  // from 2.288m while the profile said 2.40m. A 0.11m bias nothing reports is worse than a loose
  // one: the point of driving the opponent was to make the distance a number we can quote.
  //
  //   holdToleranceMeters     how far off before it starts walking
  //   arrivalToleranceMeters  how close before it stops - one frame's step at walking speed
  holdToleranceMeters: 0.12,
  arrivalToleranceMeters: 0.02,
  // The pause after the lab will accept another attack, before the drive takes it. Without it the
  // opponent swings the instant each gate opens, which is not a rhythm a person can read. Seeded
  // jitter across this range so the timing is not metronomic and is still reproducible.
  restIntervalMs: Object.freeze({ minimum: 450, maximum: 1100 }),
  authority: 'opponent-input-only-no-contact-authority',
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

// mulberry32. A seeded generator rather than Math.random for one reason: a bug the tester hits has
// to be reproducible, and "the opponent did something and now the pose is stuck" is only a report
// if the same seed replays the same fight.
export function createSeededRandom(seed = 1) {
  let state = (finite(seed, 1) >>> 0) || 1;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A bag, not a die. The point of the drive is to make the per-direction tally readable, and an
// independent 1-in-3 roll can hand out six TOPs in a row - which is a fine fight and a useless
// sample. Every three attacks contain each direction exactly once; only the order is seeded.
export function createOpponentDirectionSequence(seed = 1, directions = LONGSWORD_ATTACK_DIRECTIONS) {
  const pool = Object.freeze([...directions]);
  const random = createSeededRandom(seed);
  let bag = [];
  let served = 0;

  function refill() {
    bag = [...pool];
    for (let i = bag.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }

  return Object.freeze({
    next() {
      if (bag.length === 0) refill();
      served += 1;
      return bag.shift();
    },
    // What the drive is about to throw, without spending it - the HUD shows this so a tester can
    // see the next swing coming the way they would see a real opponent wind up.
    get upcoming() {
      if (bag.length === 0) refill();
      return bag[0];
    },
    get served() { return served; },
    get random() { return random; },
  });
}

// One frame of opponent intent. Pure: the caller owns the clocks and the verbs.
//
//   separationMeters  where the two of them are now
//   attackAvailable   whether the lab would accept startAttack() this frame (the authority; the
//                     cadence floors above only explain what it costs per direction)
//   restedMs          how long the attack gate has been open
//   restTargetMs      this cycle's seeded rest, drawn once when the gate opened
//   nextDirection     what the bag is about to serve
export function planOpponentDrive(input = {}) {
  const profile = Object.freeze({ ...OPPONENT_DRIVE_PROFILE, ...(input.profile || {}) });
  const band = Object.freeze({ ...OPPONENT_ENGAGEMENT_BAND_METERS, ...(input.band || {}) });
  const separationMeters = finite(input.separationMeters, band.preferred);
  const offsetMeters = separationMeters - band.preferred;
  const drift = Math.abs(offsetMeters);
  // Once walking, keep walking to the stated distance; once there, tolerate drift until it is
  // large enough to be worth crossing the floor for. `repositioning` is the caller's to carry -
  // this stays pure, the same way planGuardSector takes the sector it is deciding against.
  const wasRepositioning = input.repositioning === true;
  const repositioning = wasRepositioning
    ? drift > profile.arrivalToleranceMeters
    : drift > profile.holdToleranceMeters;
  const inBand = drift <= profile.holdToleranceMeters;
  // -1 closes the distance and +1 opens it (normalizeLaneIntent), so the sign of the offset is
  // already the intent: too far apart is a negative step, too close is a positive one.
  const intent = repositioning ? Math.sign(offsetMeters) * -1 : 0;

  const attackAvailable = input.attackAvailable === true;
  const restedMs = finite(input.restedMs);
  const restTargetMs = finite(input.restTargetMs, profile.restIntervalMs.minimum);
  const rested = restedMs >= restTargetMs;
  const direction = LONGSWORD_ATTACK_DIRECTIONS.includes(input.nextDirection) ? input.nextDirection : null;
  // Spacing is a precondition of the swing, not a race against it: a drive that swung on the clock
  // alone would throw RIGHT from wherever the last attack left it, because RIGHT's gate reopens
  // (600ms) sooner than the 0.663m it just spent takes to walk back out at 0.75 m/s (884ms).
  const attack = attackAvailable && rested && !repositioning && inBand && direction ? direction : null;

  let reason = 'attacking';
  if (attack == null) {
    if (!attackAvailable) reason = 'exchange-still-running';
    else if (!direction) reason = 'no-direction-served';
    else if (repositioning) reason = offsetMeters > 0 ? 'closing-to-band' : 'backing-off-to-band';
    else reason = 'resting';
  }

  return Object.freeze({
    stage: OPPONENT_DRIVE_STAGE,
    intent,
    attack,
    reason,
    inBand,
    repositioning,
    attackAvailableNow: attackAvailable,
    separationMeters,
    offsetMeters,
    restedMs,
    restTargetMs,
    band,
    profile,
    authority: profile.authority,
  });
}

// Draws this cycle's pause. Kept beside the plan so the range and the draw cannot drift apart.
export function drawRestIntervalMs(random, profile = OPPONENT_DRIVE_PROFILE) {
  const { minimum, maximum } = profile.restIntervalMs;
  const roll = typeof random === 'function' ? random() : 0;
  return minimum + (maximum - minimum) * Math.max(0, Math.min(1, roll));
}
