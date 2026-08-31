import { LONGSWORD_ATTACK_DIRECTIONS, LONGSWORD_DIRECTIONAL_ATTACKS } from './longsword-directional-metadata.js';

export const ATTACK_TELEGRAPH_STAGE = 'R21F.1';

// R21F.1 - the stance before the swing.
//
// R21C.1 made a parry answer the direction. Nothing was added to let a player READ the direction,
// and measuring the swings says they cannot: sampled from a common 2.396m stance, the three blade
// tips converge to 0.279m apart at 119ms into the windup (TOP against LEFT), and the parry windows
// run 148-410ms. The player is asked for the direction during exactly the stretch in which the
// three attacks look the same. R21A.2 had already recorded the static half of this - all three
// travel on the defender's right through the windup, and only the tip's VERTICAL VELOCITY tells
// them apart, which is a derivative and not something a person reads in 200ms.
//
// So the opponent takes a stance first. It is not new animation: each attack's own windup already
// passes through a pose that is unmistakable, and the telegraph holds that pose.

// R21F.1, measured: every windup frame of all three attacks, sampled from a common 2.396m stance,
// blade tip in the plane the camera looks across (world x reads as screen-horizontal, y as
// vertical). Two runs, identical to the millimetre. Idle tip sits at (-1.433, 0.813).
//
// A telegraph pose has three jobs, and the third is what picks these:
//
//   1. unmistakable against the OTHER two directions   (or the player cannot read which)
//   2. unmistakable against IDLE                       (or the player cannot read that one is coming)
//   3. close to the pose its own attack STARTS from    (or releasing it snaps the sword across the
//                                                       screen before the swing)
//
// Scored on the weakest of 1 and 2 while capping 3, the frontier has a clear knee:
//
//   cap on 3    best score   holds chosen
//   0.40m       0.468m       top@83   right@17  left@17
//   0.60m       0.794m       top@150  right@17  left@17
//   0.90m       0.840m       top@217  right@17  left@17     <- taken
//   no cap      0.926m       top@350  right@50  left@67     (a 2.126m snap into the swing)
//
// Past 0.90m the readability barely moves (0.840 -> 0.926, 9%) while the snap triples. Under it
// the readability falls off a cliff. So RIGHT and LEFT hold their own first frame - the attack
// then continues from exactly the pose being held, with NO discontinuity at all - and only TOP
// holds a later one, 0.687m from where its swing begins.
//
// TOP is the direction that needed this. Its first frame is 0.199m from idle: holding it would
// have told the player nothing, which is the same as having no telegraph for one direction in
// three. At 217ms the sword is up (tip y 1.558 against idle's 0.813), which is the raised guard a
// player expects an overhead chop to come from, and it is 0.886m clear of idle.
export const MEASURED_TELEGRAPH_HOLDS = Object.freeze({
  top: Object.freeze({
    direction: 'top',
    runtimeSeconds: 0.217,
    sourceSeconds: 0.217, // TOP carries no time warp, so the two agree
    tip: Object.freeze({ x: -0.953, y: 1.558 }),
    metersFromIdle: 0.886,
    metersToAttackEntry: 0.687,
  }),
  right: Object.freeze({
    direction: 'right',
    runtimeSeconds: 0.017,
    // R21B.1 stretches RIGHT's first 0.30s by 1.6, so its runtime hold is an earlier clip frame.
    sourceSeconds: 0.0106,
    tip: Object.freeze({ x: -0.268, y: 1.073 }),
    metersFromIdle: 1.193,
    metersToAttackEntry: 0,
  }),
  left: Object.freeze({
    direction: 'left',
    runtimeSeconds: 0.017,
    sourceSeconds: 0.017, // before LEFT's warp begins at source 0.2
    tip: Object.freeze({ x: -0.387, y: 2.192 }),
    metersFromIdle: 1.731,
    metersToAttackEntry: 0,
  }),
  idleTip: Object.freeze({ x: -1.433, y: 0.813 }),
  // Lower bounds on the tips as stored above, which are rounded to the millimetre - the
  // full-precision sweep reads 0.840 and 0.886, and the rounding can only move them down.
  worstPairMeters: 0.839,
  worstVersusIdleMeters: 0.886,
  worstSnapIntoSwingMeters: 0.687,
  method: 'windup-frame-sweep-at-2.396m-tip-in-camera-plane-two-runs',
});

// R21F.1: where the three attacks stop being distinguishable, which is the whole argument for
// this module existing. Kept as a number so it cannot quietly stop being true.
export const MEASURED_WINDUP_CONVERGENCE = Object.freeze({
  // The three are at their most alike just BEFORE the earliest window opens, and are still barely
  // told apart once it has: 0.453m at 102ms, 0.279m at 119ms, 0.401m at 153ms, 0.481m at 170ms.
  // So the player is asked for a direction while the attacks are at their least readable, and
  // stays there for the first stretch of every window.
  worstMomentMs: 119,
  worstPairMeters: 0.279,
  worstPair: Object.freeze(['top', 'left']),
  pairAtEarliestWindowMeters: 0.401, // sampled at 153ms, the first frame past the 148ms opening
  parryWindowMs: Object.freeze({ earliest: 148, latest: 410 }),
  method: 'same-sweep-minimum-pairwise-tip-distance',
});

// The telegraph's own clock. Total 400ms, which is the number that matters: R21E.1's opponent
// rests 450-1100ms between swings, so the whole stance fits inside even the shortest rest and the
// fight does not slow down - the attacker spends time raising a sword that it used to spend
// standing still.
export const ATTACK_TELEGRAPH_PROFILE = Object.freeze({
  blendInMs: 150,   // idle -> the held pose. The motion is half the signal, especially for TOP.
  holdMs: 150,      // still, so the pose can be read rather than glimpsed
  settleMs: 100,    // the held pose -> the pose the swing starts from; 0 travel for RIGHT and LEFT
  authority: 'attacker-presentation-only-no-contact-authority',
});

export const ATTACK_TELEGRAPH_PHASES = Object.freeze(['blend-in', 'hold', 'settle', 'done']);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, finite(value)));
}

// Smoothstep, matching attack-advance: a linear ramp on a limb reads as the character being
// dragged rather than moving.
function smoothstep(t) {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
}

export function telegraphHoldFor(direction) {
  return MEASURED_TELEGRAPH_HOLDS[String(direction || '').toLowerCase()] || null;
}

export function telegraphDurationMs(profile = ATTACK_TELEGRAPH_PROFILE) {
  return finite(profile.blendInMs) + finite(profile.holdMs) + finite(profile.settleMs);
}

// One frame of the stance. Pure: the caller owns the clock and the rig.
//
//   weight     how much of the held pose to mix over the attacker's idle pose, 0..1
//   released   true once the stance is finished and the swing may start
export function planAttackTelegraph(input = {}) {
  const profile = Object.freeze({ ...ATTACK_TELEGRAPH_PROFILE, ...(input.profile || {}) });
  const direction = LONGSWORD_ATTACK_DIRECTIONS.includes(input.direction) ? input.direction : null;
  const hold = direction ? MEASURED_TELEGRAPH_HOLDS[direction] : null;
  const elapsedMs = Math.max(0, finite(input.elapsedMs));
  const blendEnd = finite(profile.blendInMs);
  const holdEnd = blendEnd + finite(profile.holdMs);
  const settleEnd = holdEnd + finite(profile.settleMs);

  if (!hold) {
    return Object.freeze({
      stage: ATTACK_TELEGRAPH_STAGE, direction: null, phase: 'done', weight: 0,
      released: true, reason: 'no-direction', clipId: null, sourceSeconds: null,
      elapsedMs, durationMs: settleEnd, profile,
    });
  }

  let phase = 'done';
  let weight = 0;
  if (elapsedMs < blendEnd) { phase = 'blend-in'; weight = smoothstep(elapsedMs / Math.max(1, blendEnd)); }
  else if (elapsedMs < holdEnd) { phase = 'hold'; weight = 1; }
  else if (elapsedMs < settleEnd) {
    phase = 'settle';
    // Back down to zero, which lands the rig on the attacker's own idle pose - and the swing then
    // starts from its authored first frame. For RIGHT and LEFT the held pose IS that first frame,
    // so this stretch is the only place their 1.19m and 1.73m entry snaps used to happen.
    weight = 1 - smoothstep((elapsedMs - holdEnd) / Math.max(1, finite(profile.settleMs)));
  }

  return Object.freeze({
    stage: ATTACK_TELEGRAPH_STAGE,
    direction,
    phase,
    weight,
    released: elapsedMs >= settleEnd,
    reason: phase,
    clipId: LONGSWORD_DIRECTIONAL_ATTACKS[direction].clipId,
    sourceSeconds: hold.sourceSeconds,
    hold,
    elapsedMs,
    durationMs: settleEnd,
    profile,
  });
}
