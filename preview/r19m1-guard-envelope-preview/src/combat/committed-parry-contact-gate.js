import {
  SWEPT_CONTACT_TEMPORAL_ELIGIBILITY_AUTHORITY,
} from './swept-contact-temporal-eligibility.js';
import { PARRY_LUNGE_TRAVEL_BUDGET_METERS } from './parry-lunge-reach.js';
import { defendedSectorFor } from './attack-direction-as-defended.js'; // R21Q.1

export const COMMITTED_PARRY_CONTACT_GATE_STAGE = 'G4.3B.5R.3';

export const COMMITTED_PARRY_CONTACT_GATE_PROFILE = Object.freeze({
  earliestInputTtcSeconds: 0.18,
  latestInputTtcSeconds: 0.06,
  // R19F.1: the clamp follows the lunge-reach envelope - the attack advance made the parry's
  // journey longer than the old 0.18m hand correction, while the input window above is untouched.
  maxShieldTravelMeters: PARRY_LUNGE_TRAVEL_BUDGET_METERS,
  planeCaptureMeters: 0.055,
  commitmentMarker: 'movementStartSeconds',
  authority: 'manual-input-after-authored-commitment-and-ttc-plus-real-swept-contact; predictive-geometry-guides-clamped-motion-only',
});

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function freeze(value) {
  return Object.freeze(value);
}

function profileWith(overrides = {}) {
  return freeze({ ...COMMITTED_PARRY_CONTACT_GATE_PROFILE, ...overrides });
}

export function inspectCommittedAttackTiming(attackSnapshot = {}) {
  const runtime = attackSnapshot?.action?.runtime || null;
  const elapsedSeconds = finite(attackSnapshot?.elapsedSeconds);
  const movementStartSeconds = finite(runtime?.movementStartSeconds);
  const contactSeconds = finite(runtime?.contactSeconds ?? attackSnapshot?.contactSeconds);
  const hasTimeline = Boolean(runtime)
    && elapsedSeconds != null
    && movementStartSeconds != null
    && contactSeconds != null;
  const timeToContactSeconds = hasTimeline ? contactSeconds - elapsedSeconds : null;
  const committed = hasTimeline
    && elapsedSeconds >= movementStartSeconds
    && elapsedSeconds < contactSeconds
    && attackSnapshot?.interrupted !== true;

  return freeze({
    available: hasTimeline,
    sequence: finite(attackSnapshot?.sequence, 0),
    phase: attackSnapshot?.phase || null,
    elapsedSeconds,
    movementStartSeconds,
    contactSeconds,
    timeToContactSeconds,
    committed,
    marker: COMMITTED_PARRY_CONTACT_GATE_PROFILE.commitmentMarker,
  });
}

export function evaluateCommittedParryInput(input = {}) {
  const profile = profileWith(input.profile);
  const attack = inspectCommittedAttackTiming(input.attackSnapshot);
  const predictive = input.predictiveAnalysis || null;
  const threat = predictive?.threat || null;
  const trackingPlan = predictive?.trackingPlan || null;
  const ttc = attack.timeToContactSeconds;
  const requiredShieldTravelMeters = finite(trackingPlan?.requiredDistance);
  const predictedPlaneDistanceMeters = threat
    ? Math.abs(finite(threat.signedDistance, Infinity))
    : null;

  const timingInsideWindow = ttc != null
    && ttc >= profile.latestInputTtcSeconds
    && ttc <= profile.earliestInputTtcSeconds;
  const shieldReachable = requiredShieldTravelMeters != null
    && trackingPlan?.reachable === true
    && requiredShieldTravelMeters <= profile.maxShieldTravelMeters + 1e-6;
  const planeCapturable = predictedPlaneDistanceMeters != null
    && predictedPlaneDistanceMeters <= profile.planeCaptureMeters + 1e-6;
  const geometryGuidanceAvailable = Boolean(threat && trackingPlan);
  const trackingClamped = geometryGuidanceAvailable && !shieldReachable;

  // R21C.1: and where the player was pointing when they pressed.
  //
  // Judged HERE, at the press, and never at contact. Both stages can see the attack's direction, so
  // either was buildable - but the arm report is the only one where the cost of a wrong guess does
  // not depend on when you pressed. Deciding it at contact would hand an early press up to 220ms to
  // fix its aim and a late one 20ms, which rewards pressing early - the worse grade - with more
  // time to think. Point, then press.
  //
  // No aim is a mismatch rather than a pass. A player who never chose a direction did not answer
  // the question, and the indicator shows all three cells dark so that state is visible rather than
  // discovered. Nothing here touches the block: the shield is omnidirectional and still catches the
  // blow, which is the whole reason directional PARRY could be added without re-measuring defence.
  // And it applies to a PRESS, not to the prompt. The same evaluation runs every frame with
  // manual:false to answer "is the window open" - that is what lights the parry cue and what a
  // driver waits for - and it is a question about time. Gating it on aim made it permanently false
  // and nothing could ever be pressed: found by the browser gate, which is exactly the kind of
  // thing no amount of unit testing this function would have shown.
  const attackDirection = String(input.attackSnapshot?.action?.direction || '').toLowerCase() || null;
  const aimedSector = String(input.aimedSector || '').toLowerCase() || null;
  const directionRequired = input.manual !== false;
  // R21Q.1: compare against the attack RESTATED IN THE DEFENDER'S FRAME. The clips are named for
  // the hand the cut is thrown with; the sector is named from a pointer offset in screen pixels,
  // and two fighters facing each other mirror every lateral word between them. Measured: a RIGHT
  // attack spends the entire parry window on the LEFT of the screen and never crosses the centre.
  // Comparing the raw names told a player who read the fight correctly that they were wrong -
  // 35 times out of 35 across three playtests, and only ever on the lateral pair.
  const defendedSector = defendedSectorFor(attackDirection);
  const directionMatched = Boolean(defendedSector) && aimedSector === defendedSector;
  // R24G.1 (#37): three tiers of guard. A RAISE (F, the shield button) that is timed but not aimed
  // at the answering sector is an ASSISTED parry - the system answers the direction, the player
  // answered the time - and is accepted as such; the same raise aimed right, or a DIRECTIONAL press
  // (the sector cells, I/J/L) aimed right, is PERFECT. A directional press aimed wrong stays what
  // R21C.1 made it: refused, so the swing is merely blocked. Measured before: on touch the shield
  // button never carries a sector, so a perfectly timed tap was always 'parry-input-unaimed'.
  const assist = input.assist === true && directionRequired && Boolean(defendedSector);
  const directionAnswered = !directionRequired || directionMatched || assist;
  const tier = !directionRequired ? null : directionMatched ? 'perfect' : assist ? 'assisted' : null;

  let reason = 'parry-input-armed-awaiting-real-contact';
  if (!attack.available) reason = 'missing-authored-attack-timeline';
  else if (!attack.committed) reason = ttc != null && ttc < profile.latestInputTtcSeconds
    ? 'parry-input-too-late'
    : 'attack-not-committed';
  else if (ttc > profile.earliestInputTtcSeconds) reason = 'parry-input-too-early';
  else if (ttc < profile.latestInputTtcSeconds) reason = 'parry-input-too-late';
  else if (!directionAnswered) {
    reason = aimedSector == null ? 'parry-input-unaimed' : 'parry-input-wrong-direction';
  }

  const accepted = attack.available
    && attack.committed
    && timingInsideWindow
    && directionAnswered;

  return freeze({
    stage: COMMITTED_PARRY_CONTACT_GATE_STAGE,
    accepted,
    reason,
    tier: accepted ? tier : null, // R24G.1: 'perfect' | 'assisted'
    answeredSector: accepted ? (directionMatched ? aimedSector : defendedSector) : null, // R24G.1: the sector the parry actually answers with
    sequence: attack.sequence,
    input: freeze({ manual: input.manual !== false, assist: input.assist === true }),
    attack,
    gates: freeze({
      attackCommitted: attack.committed,
      timingInsideWindow,
      shieldReachable,
      planeCapturable,
      geometryGuidanceAvailable,
      geometryGuidanceCanVetoInput: false,
      trackingClamped,
      directionMatched,
      directionRequired,
      assisted: accepted && tier === 'assisted', // R24G.1
      realSweptContact: false,
    }),
    aimedSector,
    attackDirection,
    defendedSector,
    timeToContactSeconds: ttc,
    requiredShieldTravelMeters,
    predictedPlaneDistanceMeters,
    profile,
    authority: profile.authority,
  });
}

export function confirmCommittedParryContact(input = {}) {
  const armed = input.armedReport || null;
  const contact = input.contact || null;
  const attack = inspectCommittedAttackTiming(input.attackSnapshot);
  const sameSequence = armed?.sequence === attack.sequence;
  const realSweptContact = contact?.contact === true
    && contact?.geometricContact === true
    && contact?.eligible === true;
  const temporalEligibility = contact?.temporalEligibility || null;
  const sweptTemporalAuthority = temporalEligibility?.authority === SWEPT_CONTACT_TEMPORAL_ELIGIBILITY_AUTHORITY;
  const activeContact = sweptTemporalAuthority
    ? temporalEligibility.eligible === true
    : attack.phase === 'attack_active';
  const accepted = armed?.accepted === true && sameSequence && realSweptContact && activeContact;

  let reason = 'parry-confirmed-by-real-swept-contact';
  if (armed?.accepted !== true) reason = 'parry-input-not-armed';
  else if (!sameSequence) reason = 'parry-attack-sequence-mismatch';
  else if (!realSweptContact) reason = 'waiting-for-real-swept-contact';
  else if (!activeContact) reason = 'contact-outside-authored-active-window';

  return freeze({
    stage: COMMITTED_PARRY_CONTACT_GATE_STAGE,
    accepted,
    reason,
    tier: accepted ? (armed?.tier ?? null) : null, // R24G.1: the tier the press earned, confirmed by the blade
    sequence: attack.sequence,
    armedReport: armed,
    contact,
    attack,
    gates: freeze({
      ...(armed?.gates || {}),
      realSweptContact,
      activeContact,
      activeContactAuthority: sweptTemporalAuthority
        ? SWEPT_CONTACT_TEMPORAL_ELIGIBILITY_AUTHORITY
        : 'legacy-frame-end-attack-phase',
      contactElapsedSeconds: sweptTemporalAuthority
        ? temporalEligibility.contactElapsedSeconds ?? null
        : null,
      sameAttackSequence: sameSequence,
    }),
    authority: COMMITTED_PARRY_CONTACT_GATE_PROFILE.authority,
  });
}

export function createCommittedParryContactGate(options = {}) {
  const profile = profileWith(options.profile || options);
  let attempt = null;
  let confirmation = null;

  function arm(input = {}) {
    const sequence = finite(input.attackSnapshot?.sequence, 0);
    if (attempt?.sequence === sequence) {
      return freeze({
        ...attempt,
        accepted: false,
        reason: 'parry-input-already-used-for-attack',
        originalAttempt: attempt,
      });
    }
    attempt = evaluateCommittedParryInput({ ...input, profile });
    confirmation = null;
    return attempt;
  }

  function confirm(input = {}) {
    if (confirmation?.accepted) return confirmation;
    confirmation = confirmCommittedParryContact({ ...input, armedReport: attempt });
    return confirmation;
  }

  // R21D.1 - an accepted attempt is a promise about ONE attack, and it has to expire with it.
  //
  // `armed` is read outside this module as "the defence is committed": the defender stance holds
  // a raised guard through a released key while it is true (R20H.2), because yanking the shield
  // out of its own parry mid-flight wrecks both fighters' poses. That was written assuming an
  // armed attempt always ends on its own - confirmed by contact, or replaced by the next attack's
  // arm(). It does not. An accepted press whose contact never arrives (the swing whiffs, the
  // fighters are out of reach, the attack is interrupted) leaves `attempt.accepted` true and
  // `confirmation` null forever, so the guard can never come down: the fighter stands frozen in
  // the block pose with nothing attacking and no key held, until some later attack resets us.
  //
  // Confirmation is provably impossible once the attack is gone - confirmCommittedParryContact
  // needs the SAME sequence and a live active-window contact - so the moment its attack stops
  // being the live one, the promise has lapsed. The attempt stays on the books (same sequence,
  // now refused) so the player still cannot re-arm the swing they already answered.
  function lapse(input = {}) {
    if (attempt?.accepted !== true || confirmation?.accepted === true) return null;
    const snapshot = input.attackSnapshot || null;
    // The runtime clears its action object and its `active` flag together, so these two agree
    // except on an interruption - action still present, active already false - and an interrupted
    // attack is exactly one that can never confirm. Callers that have no separate flag can hand
    // us the snapshot alone.
    const attackActive = input.attackActive === undefined
      ? Boolean(snapshot?.action)
      : input.attackActive === true && Boolean(snapshot?.action);
    if (attackActive && finite(snapshot?.sequence, 0) === attempt.sequence) return null;
    attempt = freeze({
      ...attempt,
      accepted: false,
      reason: 'parry-attempt-lapsed-without-contact',
      lapsed: true,
      originalAttempt: attempt,
    });
    return attempt;
  }

  function reset() {
    attempt = null;
    confirmation = null;
  }

  return freeze({
    arm,
    confirm,
    lapse,
    reset,
    get attempt() { return attempt; },
    get confirmation() { return confirmation; },
    get armed() { return attempt?.accepted === true && confirmation?.accepted !== true; },
    get profile() { return profile; },
  });
}
