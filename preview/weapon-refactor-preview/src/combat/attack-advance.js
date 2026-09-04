export const ATTACK_ADVANCE_STAGE = 'R18Y.1';

// R18Y.1: how far the attacker travels into their own swing.
//
// Until now nobody moved. The attack clips are loaded from the libraries' No_Root_Motion variants,
// so a swing was played entirely in place and the distance between the fighters was whatever the
// scene set at startup. That is why the engagement distance had to sit at the one separation where
// a standing attacker could still reach a standing defender.
//
// The authored clips do carry a step. Measured off the Root_Motion variants, forward travel on the
// root node by each direction's contact frame:
//
//   top    UAL1/Sword_Attack     contact 0.43s   +0.862m   (+1.501m by clip end)
//   right  UAL2/Sword_Regular_A  contact 0.23s   +0.663m   (+0.825m by clip end)
//   left   UAL2/Sword_Regular_B  contact 0.26s   -0.043m   (-0.053m by clip end)
//
// So two of the three were authored as a step-in and one as a planted sweep - LEFT's root only
// rocks +-4cm through the swing, which is a weight shift, not a step. Switching the libraries over
// to Root_Motion would inherit that asymmetry wholesale: two attacks that close distance and one
// that does not, with no way to tune any of them short of re-authoring the animation.
//
// So the displacement is owned here instead, and the clips stay No_Root_Motion. The numbers are
// seeded from the measurements above because they are what the animation was drawn against and the
// footwork will read wrong against anything wildly different - but they are numbers now, not
// baked curves, and LEFT can be given a step it was never authored with.
export const ATTACK_ADVANCE_PROFILES = Object.freeze({
  top: Object.freeze({ direction: 'top', metersByContact: 0.862, source: 'authored-root-motion' }),
  right: Object.freeze({ direction: 'right', metersByContact: 0.663, source: 'authored-root-motion' }),
  // LEFT was authored planted. Its low sweep already reaches the body from 2.05m where TOP and
  // RIGHT reach 1.55m, so it needs far less of a step than they do to threaten from the same
  // distance - this is the difference between those two, and it is a starting value to be measured
  // rather than a derived truth.
  left: Object.freeze({ direction: 'left', metersByContact: 0.45, source: 'code-driven-target' }),
});

// The advance is spent getting to the blow and then stops. The authored clips keep drifting
// forward through their follow-through - TOP travels another 0.64m after contact - but that
// travel is the animator moving a lone character across a room, not something a fighter does
// while their sword is buried in someone's shield. Carrying it would walk the attacker into the
// defender after every exchange.
export const ATTACK_ADVANCE_HOLDS_AFTER_CONTACT = true;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, finite(value)));
}

// Smoothstep rather than linear: the authored root tracks both start and finish their travel
// gently, and a linear ramp reads as the character being dragged.
function smoothstep(t) {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
}

function rejection(reason, direction = null) {
  return Object.freeze({ stage: ATTACK_ADVANCE_STAGE, accepted: false, reason, direction });
}

export function planAttackAdvance(input = {}) {
  const direction = String(input.direction || '').toLowerCase();
  const base = ATTACK_ADVANCE_PROFILES[direction];
  if (!base) return rejection('unsupported-attack-direction', direction || null);

  const profile = Object.freeze({ ...base, ...(input.profile || {}) });
  const contactSeconds = finite(input.contactSeconds, 0);
  if (!(contactSeconds > 0)) return rejection('missing-contact-timeline', direction);

  // Travel starts when the attack commits, which the runtime already publishes as the frame the
  // swing becomes readable. Before that the attacker is winding up and has not decided to close.
  const startSeconds = Math.max(0, Math.min(contactSeconds, finite(input.startSeconds, 0)));

  return Object.freeze({
    stage: ATTACK_ADVANCE_STAGE,
    accepted: true,
    direction,
    profile,
    startSeconds,
    contactSeconds,
    metersByContact: finite(profile.metersByContact),
    authority: 'attacker-locomotion-only-no-contact-authority',
  });
}

// Returns the distance travelled along the attacker's facing at this point in the swing. Absolute,
// not incremental: the caller re-derives position from its own base every frame, so a dropped or
// repeated frame cannot accumulate.
export function sampleAttackAdvance(plan, elapsedSeconds) {
  if (!plan?.accepted) return null;
  const elapsed = finite(elapsedSeconds);
  const span = plan.contactSeconds - plan.startSeconds;
  const progress = span > 1e-6 ? (elapsed - plan.startSeconds) / span : (elapsed >= plan.contactSeconds ? 1 : 0);
  const eased = smoothstep(progress);
  const advanceMeters = plan.metersByContact * eased;
  return Object.freeze({
    stage: ATTACK_ADVANCE_STAGE,
    direction: plan.direction,
    elapsedSeconds: elapsed,
    progress: clamp01(progress),
    advanceMeters,
    // True once the attacker has spent the whole step, which is also when it stops growing.
    complete: progress >= 1,
    authority: plan.authority,
  });
}

// Owns one attacker's advance clock and reports the offset. It deliberately does not write any
// transform: the caller owns where its fighter stands, and this only ever says how far along their
// own facing the swing should have carried them by now.
export function createAttackAdvanceRuntime() {
  let plan = null;
  let lastSample = null;

  function reset() {
    plan = null;
    lastSample = null;
    return null;
  }

  function start(input = {}) {
    const planned = planAttackAdvance(input);
    if (!planned.accepted) {
      lastSample = null;
      plan = null;
      return planned;
    }
    plan = planned;
    lastSample = sampleAttackAdvance(plan, 0);
    return planned;
  }

  function update(elapsedSeconds) {
    if (!plan) return null;
    lastSample = sampleAttackAdvance(plan, elapsedSeconds);
    return lastSample;
  }

  return Object.freeze({
    start,
    update,
    reset,
    get plan() { return plan; },
    get report() { return lastSample; },
    get advanceMeters() { return lastSample?.advanceMeters ?? 0; },
    get active() { return Boolean(plan); },
  });
}
