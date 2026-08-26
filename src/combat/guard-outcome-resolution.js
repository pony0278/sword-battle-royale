import { GUARD_EVENTS, GUARD_STATES } from './guard-state-machine.js';
import { GUARD_REACTION_VARIANTS } from './guard-reaction-presentation.js';

export const GUARD_OUTCOME_RESOLUTION_STAGE = 'G4.3A.4';

export const GUARD_OUTCOMES = Object.freeze({
  NONE: 'none',
  BLOCK: 'block',
  PARRY: 'parry',
  PERFECT_PARRY: 'perfect-parry',
});

export const GUARD_TIMING_GRADES = Object.freeze({
  NONE: 'none',
  BLOCK: 'block',
  PARRY: 'parry',
  PERFECT: 'perfect',
});

export const GUARD_OUTCOME_RESOLUTION_PROFILE = Object.freeze({
  perfectParryWindowMs: 75,
  parryWindowMs: 180,
  requiredAttackPhase: 'attack_active',
});

const RESOLVABLE_GUARD_STATES = new Set([
  GUARD_STATES.ENTER,
  GUARD_STATES.HOLD,
]);

function finite(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nonNegative(value, fallback = null) {
  const number = finite(value, fallback);
  return number == null ? null : Math.max(0, number);
}

function vec(input = {}) {
  return Object.freeze({
    x: finite(input?.x, 0),
    y: finite(input?.y, 0),
    z: finite(input?.z, 0),
  });
}

function length(vector) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function normalize(vector) {
  const magnitude = length(vector);
  if (magnitude <= 1e-9) return Object.freeze({ x: 0, y: 0, z: 0 });
  return Object.freeze({
    x: vector.x / magnitude,
    y: vector.y / magnitude,
    z: vector.z / magnitude,
  });
}

function freezeContact(input = {}) {
  const incomingVelocity = vec(input.incomingVelocity);
  return Object.freeze({
    point: vec(input.point),
    incomingVelocity,
    incomingDirection: normalize(incomingVelocity),
    speed: length(incomingVelocity),
    radialDistance: nonNegative(input.radialDistance, null),
    bladeFraction: nonNegative(input.bladeFraction, null),
    sweepAlpha: nonNegative(input.sweepAlpha, null),
  });
}

function normalizeDirection(value) {
  const direction = String(value || '').toLowerCase();
  return ['top', 'left', 'right'].includes(direction) ? direction : null;
}

function normalizeGuardSnapshot(input = {}) {
  const snapshot = input.guardSnapshot || input.guard || {};
  return Object.freeze({
    state: String(snapshot.state || ''),
    guardHeld: snapshot.guardHeld === true,
    elapsedMs: nonNegative(snapshot.elapsedMs, 0),
  });
}

function hasAuthoritativeContact(contact = {}) {
  return contact?.contact === true
    && contact?.eligible !== false
    && contact?.geometricContact !== false;
}

function timingGrade(intentAgeMs, profile) {
  if (intentAgeMs == null) return GUARD_TIMING_GRADES.BLOCK;
  if (intentAgeMs <= profile.perfectParryWindowMs) return GUARD_TIMING_GRADES.PERFECT;
  if (intentAgeMs <= profile.parryWindowMs) return GUARD_TIMING_GRADES.PARRY;
  return GUARD_TIMING_GRADES.BLOCK;
}

function emptyResolution(reason, context = {}) {
  return Object.freeze({
    stage: GUARD_OUTCOME_RESOLUTION_STAGE,
    resolved: false,
    outcome: GUARD_OUTCOMES.NONE,
    reason,
    attackSequence: context.attackSequence ?? null,
    attackDirection: context.attackDirection ?? null,
    contact: context.contact ?? null,
    guard: context.guard ?? null,
    defender: Object.freeze({ event: null, reactionVariant: null, payload: null }),
    attacker: Object.freeze({ interruptAttack: false, responseClass: 'none' }),
    advantage: Object.freeze({ granted: false, grade: null }),
    authority: 'authoritative-combat-resolution-contract',
  });
}

function resolvedContract({ outcome, attackSequence, attackDirection, contact, guard, intentAgeMs, timing }) {
  const perfect = outcome === GUARD_OUTCOMES.PERFECT_PARRY;
  const parry = outcome === GUARD_OUTCOMES.PARRY || perfect;
  const defenderEvent = parry ? GUARD_EVENTS.PARRY_CONFIRMED : GUARD_EVENTS.BLOCK_CONFIRMED;
  const reactionVariant = perfect
    ? GUARD_REACTION_VARIANTS.PERFECT_PARRY
    : parry
      ? GUARD_REACTION_VARIANTS.PARRY
      : GUARD_REACTION_VARIANTS.BLOCK_HIT;
  const grade = perfect ? 'perfect-parry' : parry ? 'parry' : 'block';
  const responseClass = perfect
    ? 'perfect-parry-directional-recoil'
    : parry
      ? 'parry-directional-recoil'
      : 'blocked-weapon-bounce';

  const payload = Object.freeze({
    stage: GUARD_OUTCOME_RESOLUTION_STAGE,
    outcome,
    grade,
    perfect,
    attackSequence,
    attackDirection,
    guardIntentAgeMs: intentAgeMs,
    timingGrade: timing,
    contactPoint: contact.point,
    incomingVelocity: contact.incomingVelocity,
    incomingDirection: contact.incomingDirection,
    incomingSpeed: contact.speed,
  });

  return Object.freeze({
    stage: GUARD_OUTCOME_RESOLUTION_STAGE,
    resolved: true,
    outcome,
    reason: `${grade}-resolved`,
    attackSequence,
    attackDirection,
    contact,
    guard: Object.freeze({ ...guard, intentAgeMs, timingGrade: timing }),
    defender: Object.freeze({ event: defenderEvent, reactionVariant, payload }),
    attacker: Object.freeze({ interruptAttack: true, responseClass }),
    advantage: Object.freeze({ granted: parry, grade: parry ? grade : null }),
    authority: 'authoritative-combat-resolution-contract',
  });
}

export function resolveGuardOutcome(input = {}, overrides = {}) {
  const profile = Object.freeze({ ...GUARD_OUTCOME_RESOLUTION_PROFILE, ...overrides });
  const contactInput = input.contact || {};
  const guard = normalizeGuardSnapshot(input);
  const attackSequence = finite(input.attackSequence, null);
  const attackDirection = normalizeDirection(input.attackDirection);
  const contact = hasAuthoritativeContact(contactInput) ? freezeContact(contactInput) : null;
  const attackPhase = String(input.attackPhase || '');
  const context = { attackSequence, attackDirection, contact, guard };

  if (!contact) return emptyResolution('no-authoritative-contact', context);
  if (attackPhase && attackPhase !== profile.requiredAttackPhase) return emptyResolution('attack-not-active', context);
  if (!guard.guardHeld) return emptyResolution('guard-not-held', context);
  if (!RESOLVABLE_GUARD_STATES.has(guard.state)) return emptyResolution('guard-state-not-resolvable', context);

  const intentAgeMs = nonNegative(
    input.guardIntentAgeMs,
    guard.state === GUARD_STATES.ENTER ? guard.elapsedMs : null,
  );
  const timing = timingGrade(intentAgeMs, profile);
  const outcome = timing === GUARD_TIMING_GRADES.PERFECT
    ? GUARD_OUTCOMES.PERFECT_PARRY
    : timing === GUARD_TIMING_GRADES.PARRY
      ? GUARD_OUTCOMES.PARRY
      : GUARD_OUTCOMES.BLOCK;

  return resolvedContract({ outcome, attackSequence, attackDirection, contact, guard, intentAgeMs, timing });
}

export function createGuardOutcomeResolutionGate(options = {}) {
  const resolvedSequences = new Map();

  function resolve(input = {}) {
    const sequence = finite(input.attackSequence, null);
    if (sequence != null && resolvedSequences.has(sequence)) {
      const original = resolvedSequences.get(sequence);
      return Object.freeze({
        ...original,
        duplicate: true,
        emitGuardEvent: false,
        reason: 'attack-sequence-already-resolved',
      });
    }

    const result = resolveGuardOutcome(input, options.profile);
    if (!result.resolved) {
      return Object.freeze({ ...result, duplicate: false, emitGuardEvent: false });
    }

    if (sequence != null) resolvedSequences.set(sequence, result);
    return Object.freeze({ ...result, duplicate: false, emitGuardEvent: true });
  }

  function reset(sequence = null) {
    const normalized = finite(sequence, null);
    if (normalized == null) resolvedSequences.clear();
    else resolvedSequences.delete(normalized);
  }

  return Object.freeze({
    resolve,
    reset,
    hasResolved(sequence) {
      const normalized = finite(sequence, null);
      return normalized != null && resolvedSequences.has(normalized);
    },
  });
}
