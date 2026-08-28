import { PARRY_ROOT_DISPLACEMENT_PROFILES, BLOCK_ROOT_DISPLACEMENT_PROFILES } from './parry-root-displacement.js';
import { MINIMUM_ENGAGEMENT_SEPARATION_METERS } from './lane-locomotion.js';

export const ENGAGEMENT_GROUND_STAGE = 'R18Z.1';

// R18Z.1: who is standing where, after everything that has happened to them.
//
// Both fighters already moved, and neither of them kept any of it. The attacker's step into a
// swing was applied straight onto the scene stance and wiped by the next exchange reset; the
// impact recoil re-derived from a position captured at contact and returned to it exactly, so a
// blow that visibly shoved someone half a pace back left them standing precisely where they were.
// Ground was borrowed for the length of an animation and always handed back.
//
// This owns it instead. One lane, one offset per fighter, and every source of movement writes into
// the same ledger so that separation is the arithmetic of what both of them did rather than a
// constant somebody has to keep correcting.
//
// The lane runs along +z. The attacker starts on the negative side facing the defender, so a
// positive attacker offset is ground gained and a positive defender offset is ground given up.
//
// On the recoil peaks being kept in full rather than a fraction of them: the peak is where the
// blow actually put them, and the settle that follows is a fighter recovering their posture, not
// recovering their ground. Splitting that into a retention ratio would mean inventing a number
// nothing has measured. The animation still overshoots and gathers back - it just gathers back to
// the new ground instead of the old.
export const ENGAGEMENT_GROUND_TRANSFERS = Object.freeze({
  block: Object.freeze({
    outcome: 'block',
    attackerMeters: -BLOCK_ROOT_DISPLACEMENT_PROFILES.attacker.peakMeters,
    defenderMeters: BLOCK_ROOT_DISPLACEMENT_PROFILES.defender.peakMeters,
    authority: 'a-held-shield-gives-ground-and-rebounds-the-blade',
  }),
  parry: Object.freeze({
    outcome: 'parry',
    attackerMeters: -PARRY_ROOT_DISPLACEMENT_PROFILES.attacker.peakMeters,
    defenderMeters: PARRY_ROOT_DISPLACEMENT_PROFILES.defender.peakMeters,
    authority: 'a-parry-throws-the-attacker-and-costs-the-defender-little',
  }),
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function resolveGroundTransfer(outcome) {
  const key = String(outcome || '').toLowerCase();
  if (key === 'perfect-parry') return ENGAGEMENT_GROUND_TRANSFERS.parry;
  return ENGAGEMENT_GROUND_TRANSFERS[key] || null;
}

// Holds the ledger for one exchange lane. Offsets are metres along +z from whatever stance the
// scene put the fighters at, so the stance stays the base and this only ever says how far the
// fight has carried them off it.
export function createEngagementGround(options = {}) {
  let startSeparationMeters = Math.max(0, finite(options.startSeparationMeters, 0));
  // R19B.2: walking already refuses to carry anyone through their opponent, but a swing's step is
  // not a walk and was never checked against anything. Now that a whiffed lunge banks its step
  // rather than giving it back, repeated whiffs are a path straight through the defender, so the
  // floor belongs on the ledger where every source of movement has to pass it.
  const minimumSeparationMeters = Math.max(0, finite(
    options.minimumSeparationMeters,
    MINIMUM_ENGAGEMENT_SEPARATION_METERS,
  ));
  let attackerGroundMeters = 0;
  let defenderGroundMeters = 0;
  // The attacker's step is separate from their ground because it is still being spent: it grows
  // through the swing and is only banked once the exchange resolves. Keeping it apart is what lets
  // a whiffed attack be undone without unwinding the ground a previous blow moved.
  let attackerSwingMeters = 0;

  function report() {
    const attackerMeters = attackerGroundMeters + attackerSwingMeters;
    return Object.freeze({
      stage: ENGAGEMENT_GROUND_STAGE,
      attackerMeters,
      defenderMeters: defenderGroundMeters,
      attackerGroundMeters,
      attackerSwingMeters,
      // Positive is still apart. The defender retreating opens the gap, the attacker advancing
      // closes it, and this is the number every coverage band is a fact about.
      separationMeters: startSeparationMeters + defenderGroundMeters - attackerMeters,
      startSeparationMeters,
      minimumSeparationMeters,
      authority: 'lane-position-ledger-no-contact-authority',
    });
  }

  // R19A.1 / R19B.1: a fighter's own feet. Incremental rather than absolute, because unlike a swing
  // this has no timeline to re-derive from - it is just distance covered since the last frame, and
  // it is banked immediately: ground taken by walking is not contingent on anything landing.
  //
  // Both take a change in separation rather than a direction along the lane, which is the one place
  // the two fighters differ and therefore the one place to say it out loud. The defender opens the
  // gap by moving away from the origin and the attacker opens it by moving toward it, so the same
  // "back off half a metre" is +z for one of them and -z for the other. Callers pass what they mean
  // - how the gap should change - and the sign lives here.
  function moveDefender(separationDeltaMeters) {
    defenderGroundMeters += finite(separationDeltaMeters);
    return report();
  }

  function moveAttacker(separationDeltaMeters) {
    attackerGroundMeters -= finite(separationDeltaMeters);
    return report();
  }

  // Absolute for the swing in progress, so a repeated frame cannot walk the attacker forward. The
  // floor applies here too and not only once the step is banked: a lunge is the one movement that
  // can carry someone inside their opponent, and clamping it only at settle left the attacker
  // visibly standing in the defender for the length of every over-committed swing.
  function setAttackerSwing(meters) {
    const requested = finite(meters);
    const roomToClose = Math.max(0, startSeparationMeters + defenderGroundMeters
      - attackerGroundMeters - minimumSeparationMeters);
    attackerSwingMeters = Math.min(requested, roomToClose);
    return report();
  }

  // Nobody ends a step standing inside anybody. Applied to the attacker because they are the one
  // whose movement can overrun: the defender's own feet are clamped before they travel.
  function holdMinimumSeparation() {
    const overrun = minimumSeparationMeters - report().separationMeters;
    if (overrun > 0) attackerGroundMeters -= overrun;
  }

  // Banks the step that has been spent and applies what the blow did to both fighters.
  function settleImpact(outcome) {
    const transfer = resolveGroundTransfer(outcome);
    if (!transfer) return null;
    attackerGroundMeters += attackerSwingMeters + transfer.attackerMeters;
    defenderGroundMeters += transfer.defenderMeters;
    attackerSwingMeters = 0;
    holdMinimumSeparation();
    return Object.freeze({ ...report(), transfer });
  }

  // R19B.2: a swing that hit nothing. The step is banked all the same, so a fighter who lunges at
  // empty air is left standing where their own momentum carried them - deep, close, and with none
  // of the impact rebound a landed blow would have given them back. Returning them to where they
  // started would be the system undoing a commitment the player made, and being caught out of
  // position is the price of a whiff rather than something to be spared.
  function settleWhiff() {
    attackerGroundMeters += attackerSwingMeters;
    attackerSwingMeters = 0;
    holdMinimumSeparation();
    return report();
  }

  function reset() {
    attackerGroundMeters = 0;
    defenderGroundMeters = 0;
    attackerSwingMeters = 0;
    return report();
  }

  // R19D.1: return to a stance, forgetting the fight that happened on the old one. This exists
  // because the ledger's base was captured once at construction while the scene's stance could be
  // changed at runtime, after which the two described different worlds: the scene placed fighters
  // from the new stance plus old offsets while the ledger kept computing separation from the old
  // base. Rebasing is the only honest response to the stance changing - carrying offsets earned at
  // one distance onto another would mean ground won in a different fight.
  function rebase(newStartSeparationMeters) {
    startSeparationMeters = Math.max(0, finite(newStartSeparationMeters, startSeparationMeters));
    return reset();
  }

  return Object.freeze({
    moveAttacker,
    moveDefender,
    setAttackerSwing,
    settleImpact,
    settleWhiff,
    reset,
    rebase,
    get report() { return report(); },
    get attackerMeters() { return attackerGroundMeters + attackerSwingMeters; },
    get defenderMeters() { return defenderGroundMeters; },
    get separationMeters() { return report().separationMeters; },
    get minimumSeparationMeters() { return minimumSeparationMeters; },
  });
}
