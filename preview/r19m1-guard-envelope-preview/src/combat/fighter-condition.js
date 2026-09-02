import { getLongswordDirectionalAttackProfile } from './longsword-directional-attack-runtime.js';
import {
  GUARD_REACTION_VARIANTS,
  LONGSWORD_GUARD_REACTION_PROFILES,
} from './guard-reaction-presentation.js';

export const FIGHTER_CONDITION_STAGE = 'R23J.1';

// R23J.1 — how much a fighter can take, and how long a parry takes them out.
//
// Until this stage the fight had no result. Every measurement in this project had to work around
// that: lock-advantage.js opens by saying "this lab has no second agent and no victory condition"
// and translates its question into a mechanical asymmetry instead. A blade landing on a chest
// produced a flinch animation and nothing else, so a demo could be played forever and never won.
//
// Two numbers and a rule, and only one of the numbers is a preference.
export const DUEL_MAX_HEALTH = 100;

// CHOSEN, and the reasoning is about the fight rather than about the number: 20 makes it five
// blows, and one parry is worth exactly one of them, so a parry costs 20% of a health bar. Three
// blows would end a duel before the thing this game is actually about - reading which way the
// other one is swinging, measured at 23/25 legible in R21C.2 - had happened three times. Ten blows
// runs past half a minute. Five is where a duel is long enough to be read and short enough to lose.
export const BODY_HIT_DAMAGE = 20;

// NOT chosen, derived - and this is the one number in the stage that the project had already
// decided without noticing. parry-advantage.js has always described the enemy response as an
// 'authoritative-stagger' whose duration it deliberately left to "authoritative-combat-balance",
// and guard-reaction-presentation.js has always authored the window in which the free follow-up
// may BEGIN:
//
//   PARRY          may begin 0.080 - 0.333s after the parry
//   PERFECT PARRY  may begin 0.100 - 0.480s
//
// Every attack lands 0.430s after it begins - the runtime warps all three directions onto the same
// contact, which is why the source clips' 0.23s and 0.26s are not the numbers that matter here. So
// for the LAST legal follow-up to actually connect, the stagger has to outlast 0.333 + 0.430 =
// 0.763s, or 0.910s to honour a perfect parry. One second is the smallest round number that covers
// both, and the assertion that it still does lives in this stage's test rather than in this comment.
export const PARRY_STAGGER_SECONDS = 1;

// The blow every fighter's swing lands at, kept here because the stagger above is derived from it.
export const MEASURED_CONTACT_SECONDS = getLongswordDirectionalAttackProfile('top').contactSeconds;

export function followupWindowSecondsFor(variant) {
  const profile = LONGSWORD_GUARD_REACTION_PROFILES[variant];
  return profile?.followupWindowSeconds ?? null;
}

// The latest moment a free follow-up may begin, across every parry grade that grants one. What the
// stagger has to outlast, once the blade's own 0.430s of travel is added.
export function latestFollowupStartSeconds() {
  return [GUARD_REACTION_VARIANTS.PARRY, GUARD_REACTION_VARIANTS.PERFECT_PARRY]
    .map((variant) => followupWindowSecondsFor(variant))
    .filter((window) => Array.isArray(window))
    .reduce((latest, window) => Math.max(latest, Number(window[1]) || 0), 0);
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

// One fighter's condition: what they have left, and whether they may act at all.
//
// Deliberately knows nothing about who hit them or why. It is told "you took a blow" and "you were
// parried"; deciding that a blade landed is the contact stack's job and has been for twenty stages.
export function createFighterCondition({ maxHealth = DUEL_MAX_HEALTH } = {}) {
  const ceiling = Math.max(1, finite(maxHealth, DUEL_MAX_HEALTH));
  let health = ceiling;
  let staggerRemainingMs = 0;
  let blowsTaken = 0;

  function report() {
    const alive = health > 0;
    return Object.freeze({
      stage: FIGHTER_CONDITION_STAGE,
      health,
      maxHealth: ceiling,
      fraction: health / ceiling,
      alive,
      blowsTaken,
      staggered: staggerRemainingMs > 0,
      staggerRemainingSeconds: staggerRemainingMs / 1000,
      // The one question every caller actually asks. A dead fighter and a staggered one both
      // cannot swing, and a caller should not have to remember both reasons.
      canAct: alive && staggerRemainingMs <= 0,
      authority: 'fighter-condition-only-no-contact-authority',
    });
  }

  return Object.freeze({
    stage: FIGHTER_CONDITION_STAGE,
    get report() { return report(); },
    // A landed blade. Returns the report AFTER the blow, so a caller can tell a killing blow from
    // an ordinary one without asking twice.
    takeBodyHit(damage = BODY_HIT_DAMAGE) {
      if (health <= 0) return report();
      health = Math.max(0, health - Math.max(0, finite(damage, BODY_HIT_DAMAGE)));
      blowsTaken += 1;
      // Dying ends the stagger with everything else: a fighter at zero is not waiting to recover.
      if (health <= 0) staggerRemainingMs = 0;
      return report();
    },
    // Being parried. Longer is kept rather than added, so two parries in the same second do not
    // stack into a fighter who can never move again.
    stagger(seconds = PARRY_STAGGER_SECONDS) {
      if (health <= 0) return report();
      staggerRemainingMs = Math.max(staggerRemainingMs, Math.max(0, finite(seconds)) * 1000);
      return report();
    },
    advance(deltaMs) {
      if (staggerRemainingMs > 0) staggerRemainingMs = Math.max(0, staggerRemainingMs - Math.max(0, finite(deltaMs)));
      return report();
    },
    reset() {
      health = ceiling;
      staggerRemainingMs = 0;
      blowsTaken = 0;
      return report();
    },
  });
}

// Who won, if anybody has. Kept as a function of two conditions rather than as state of its own:
// there is exactly one duel and its result is entirely implied by the two fighters in it.
export function judgeDuel({ playerCondition, opponentCondition } = {}) {
  const player = playerCondition?.report ?? null;
  const opponent = opponentCondition?.report ?? null;
  if (!player || !opponent) return Object.freeze({ stage: FIGHTER_CONDITION_STAGE, over: false, winner: null, reason: 'no-duel' });
  const playerDown = player.alive === false;
  const opponentDown = opponent.alive === false;
  if (!playerDown && !opponentDown) {
    return Object.freeze({ stage: FIGHTER_CONDITION_STAGE, over: false, winner: null, reason: 'both-standing' });
  }
  // Both at zero is a real outcome rather than an impossible one: nothing here stops two blows
  // landing on the same frame, and calling it for whoever happens to be checked first would be a
  // lie the fight cannot see.
  if (playerDown && opponentDown) {
    return Object.freeze({ stage: FIGHTER_CONDITION_STAGE, over: true, winner: null, reason: 'both-down' });
  }
  return Object.freeze({
    stage: FIGHTER_CONDITION_STAGE,
    over: true,
    winner: playerDown ? 'opponent' : 'player',
    reason: 'one-standing',
  });
}
