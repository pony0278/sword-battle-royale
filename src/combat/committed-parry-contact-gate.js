import {
  SWEPT_CONTACT_TEMPORAL_ELIGIBILITY_AUTHORITY,
} from './swept-contact-temporal-eligibility.js';

export const COMMITTED_PARRY_CONTACT_GATE_STAGE = 'G4.3B.5R.3';

export const COMMITTED_PARRY_CONTACT_GATE_PROFILE = Object.freeze({
  earliestInputTtcSeconds: 0.18,
  latestInputTtcSeconds: 0.06,
  maxShieldTravelMeters: 0.18,
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

  let reason = 'parry-input-armed-awaiting-real-contact';
  if (!attack.available) reason = 'missing-authored-attack-timeline';
  else if (!attack.committed) reason = ttc != null && ttc < profile.latestInputTtcSeconds
    ? 'parry-input-too-late'
    : 'attack-not-committed';
  else if (ttc > profile.earliestInputTtcSeconds) reason = 'parry-input-too-early';
  else if (ttc < profile.latestInputTtcSeconds) reason = 'parry-input-too-late';

  const accepted = attack.available
    && attack.committed
    && timingInsideWindow;

  return freeze({
    stage: COMMITTED_PARRY_CONTACT_GATE_STAGE,
    accepted,
    reason,
    sequence: attack.sequence,
    input: freeze({ manual: input.manual !== false }),
    attack,
    gates: freeze({
      attackCommitted: attack.committed,
      timingInsideWindow,
      shieldReachable,
      planeCapturable,
      geometryGuidanceAvailable,
      geometryGuidanceCanVetoInput: false,
      trackingClamped,
      realSweptContact: false,
    }),
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

  function reset() {
    attempt = null;
    confirmation = null;
  }

  return freeze({
    arm,
    confirm,
    reset,
    get attempt() { return attempt; },
    get confirmation() { return confirmation; },
    get armed() { return attempt?.accepted === true && confirmation?.accepted !== true; },
    get profile() { return profile; },
  });
}
