// @ts-check
import {
  SWEPT_CONTACT_TEMPORAL_ELIGIBILITY_AUTHORITY,
} from './swept-contact-temporal-eligibility.js';
import { warpRuntimeToSource } from './attack-time-warp.js';
import { LONGSWORD_ATTACK_TIMINGS, LONGSWORD_ATTACK_FPS, LONGSWORD_ATTACK_STAGE, PRESENTATION_END_SOURCE_SECONDS } from './longsword-attack-timings.js';

// G1 — this module used to hold six tables of the longsword's measurements and derive every attack
// landmark from them at import. handoff/39 listed those as category A: the data a second weapon
// re-measures rather than retypes. They are now longsword-attack-timings.js, built through the
// weapon-agnostic createDirectionalAttackTimings, and what remains here is the machine - the phase
// vocabulary, the phase test, and the stateful runtime that drives one swing at a time.
//
// Every export below is kept at this path. Seventeen lab pages, five tests and
// two-actor-combat-integration.js import from here, and none of them should have to move because
// the longsword's numbers did.
export { LONGSWORD_ATTACK_FPS, PRESENTATION_END_SOURCE_SECONDS };

export const LONGSWORD_ATTACK_RUNTIME_STAGE = LONGSWORD_ATTACK_STAGE;
export const LONGSWORD_ATTACK_INTERRUPTION_STAGE = 'G4.3B.1';

export const LONGSWORD_ATTACK_PHASES = Object.freeze({
  IDLE: 'idle',
  WINDUP: 'attack_windup',
  ACTIVE: 'attack_active',
  RECOVERY: 'attack_recovery',
  INTERRUPTED: 'attack_interrupted',
});

// The longsword's answers, as thin wrappers so that every existing caller keeps working. A second
// weapon calls its own timings record instead of these.
export function getLongswordDirectionalAttackProfile(direction, options = {}) {
  return LONGSWORD_ATTACK_TIMINGS.getProfile(direction, options);
}

export function createLongswordDirectionalAttackDefinition(direction, options = {}) {
  return LONGSWORD_ATTACK_TIMINGS.createDefinition(direction, options);
}

export const LONGSWORD_DIRECTIONAL_ATTACK_DEFINITIONS = LONGSWORD_ATTACK_TIMINGS.definitions;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function finite(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function vec(input = {}) {
  return Object.freeze({
    x: finite(input?.x, 0),
    y: finite(input?.y, 0),
    z: finite(input?.z, 0),
  });
}

function normalizeDirectionVector(input = {}) {
  const value = vec(input);
  const magnitude = Math.hypot(value.x, value.y, value.z);
  if (magnitude <= 1e-9) return Object.freeze({ x: 0, y: 0, z: 0 });
  return Object.freeze({
    x: value.x / magnitude,
    y: value.y / magnitude,
    z: value.z / magnitude,
  });
}

export function getLongswordAttackPhase(profile, elapsedSeconds) {
  if (!profile) return LONGSWORD_ATTACK_PHASES.IDLE;
  const elapsed = Math.max(0, Number(elapsedSeconds) || 0);
  if (elapsed < profile.activeStartSeconds) return LONGSWORD_ATTACK_PHASES.WINDUP;
  if (elapsed <= profile.activeEndSeconds) return LONGSWORD_ATTACK_PHASES.ACTIVE;
  if (elapsed < profile.durationSeconds) return LONGSWORD_ATTACK_PHASES.RECOVERY;
  return LONGSWORD_ATTACK_PHASES.IDLE;
}

function freezeInterruptionRequest(input = {}) {
  const resolution = input.resolution || null;
  const contact = resolution?.contact || input.contact || {};
  const incomingVelocity = vec(contact.incomingVelocity || input.incomingVelocity);
  const incomingDirection = normalizeDirectionVector(
    contact.incomingDirection || input.incomingDirection || incomingVelocity,
  );
  return Object.freeze({
    reason: String(input.reason || resolution?.outcome || 'combat-interrupt'),
    outcome: resolution?.outcome || input.outcome || null,
    responseClass: resolution?.attacker?.responseClass || input.responseClass || null,
    resolutionStage: resolution?.stage || input.resolutionStage || null,
    attackSequence: finite(resolution?.attackSequence ?? input.attackSequence, null),
    contactPoint: vec(contact.point || input.contactPoint),
    incomingVelocity,
    incomingDirection,
  });
}

export function createLongswordDirectionalAttackRuntime(options = {}) {
  let active = null;
  let elapsedMs = 0;
  let sequence = 0;
  let lastCompleted = null;
  let interruption = null;
  let lastInterrupted = null;

  function snapshot(extra = {}) {
    const profile = active?.runtime || null;
    const elapsedSeconds = elapsedMs / 1000;
    return Object.freeze({
      stage: LONGSWORD_ATTACK_RUNTIME_STAGE,
      interruptionStage: LONGSWORD_ATTACK_INTERRUPTION_STAGE,
      sequence,
      phase: interruption
        ? LONGSWORD_ATTACK_PHASES.INTERRUPTED
        : getLongswordAttackPhase(profile, elapsedSeconds),
      phaseBeforeInterruption: interruption?.phaseAtInterrupt || null,
      elapsedMs,
      elapsedSeconds,
      // R20M.1: the exchange counts in runtime; the clip is sampled in source. Everything else on
      // this snapshot is runtime - this one field is the sampler's, and says so by its name.
      sourceTimeSeconds: interruption?.sourceTimeSeconds
        ?? (profile ? warpRuntimeToSource(elapsedSeconds, profile.timeWarp, profile.tempoScale) : null),
      direction: profile?.direction || interruption?.direction || null,
      clipId: profile?.clipId || interruption?.clipId || null,
      contactSeconds: profile?.contactSeconds ?? null,
      contactReached: Boolean(profile && elapsedSeconds >= profile.contactSeconds),
      action: active,
      interrupted: Boolean(interruption),
      interruption,
      lastInterrupted,
      lastCompleted,
      ...extra,
    });
  }

  function start(direction, startOptions = {}) {
    if (interruption) {
      return Object.freeze({
        accepted: false,
        reason: 'attack-interruption-pending-handoff',
        snapshot: snapshot(),
      });
    }
    if (active) return Object.freeze({ accepted: false, reason: 'attack-already-active', snapshot: snapshot() });
    active = createLongswordDirectionalAttackDefinition(direction, { ...options, ...startOptions });
    elapsedMs = 0;
    interruption = null;
    sequence += 1;
    return Object.freeze({ accepted: true, snapshot: snapshot() });
  }

  function interrupt(input = {}) {
    if (!active) {
      return Object.freeze({ accepted: false, reason: 'no-active-attack', snapshot: snapshot() });
    }
    if (interruption) {
      return Object.freeze({ accepted: false, reason: 'attack-already-interrupted', snapshot: snapshot() });
    }

    const request = freezeInterruptionRequest(input);
    const resolution = input.resolution || null;
    if (resolution && (resolution.resolved !== true || resolution.attacker?.interruptAttack !== true)) {
      return Object.freeze({ accepted: false, reason: 'resolution-does-not-interrupt', snapshot: snapshot() });
    }
    if (request.attackSequence != null && request.attackSequence !== sequence) {
      return Object.freeze({ accepted: false, reason: 'attack-sequence-mismatch', snapshot: snapshot() });
    }

    const profile = active.runtime;
    const contactTemporalEligibility = input.contactTemporalEligibility || null;
    const sweptTemporalAuthority = contactTemporalEligibility?.authority === SWEPT_CONTACT_TEMPORAL_ELIGIBILITY_AUTHORITY
      && contactTemporalEligibility.eligible === true
      && Number.isFinite(Number(contactTemporalEligibility.contactElapsedSeconds));
    // The instant the interruption happened, on the exchange's clock...
    const runtimeSeconds = clamp(
      sweptTemporalAuthority
        ? Number(contactTemporalEligibility.contactElapsedSeconds)
        : elapsedMs / 1000,
      0,
      profile.durationSeconds,
    );
    // ...and the same instant as a place in the clip, which is what the pose sampler needs.
    const sourceTimeSeconds = warpRuntimeToSource(runtimeSeconds, profile.timeWarp, profile.tempoScale);
    const phaseAtInterrupt = getLongswordAttackPhase(profile, runtimeSeconds);
    if (phaseAtInterrupt !== LONGSWORD_ATTACK_PHASES.ACTIVE && input.allowOutsideActive !== true) {
      return Object.freeze({ accepted: false, reason: 'attack-not-active', snapshot: snapshot() });
    }

    interruption = Object.freeze({
      stage: LONGSWORD_ATTACK_INTERRUPTION_STAGE,
      sequence,
      direction: profile.direction,
      clipId: profile.clipId,
      sourceTimeSeconds,
      runtimeSeconds,
      elapsedMs: sourceTimeSeconds * 1000,
      frameEndElapsedMs: elapsedMs,
      contactTemporalAuthority: sweptTemporalAuthority
        ? SWEPT_CONTACT_TEMPORAL_ELIGIBILITY_AUTHORITY
        : 'legacy-frame-end-source-time',
      phaseAtInterrupt,
      reason: request.reason,
      outcome: request.outcome,
      responseClass: request.responseClass,
      resolutionStage: request.resolutionStage,
      contactPoint: request.contactPoint,
      incomingVelocity: request.incomingVelocity,
      incomingDirection: request.incomingDirection,
      rootRotationPolicy: profile.rootRotationPolicy,
      inPlace: profile.inPlace,
      poseAuthority: 'freeze-source-animation-at-contact-until-recoil-handoff',
    });
    lastInterrupted = interruption;
    return Object.freeze({ accepted: true, snapshot: snapshot({ justInterrupted: true }) });
  }

  function releaseInterruption() {
    if (!interruption) {
      return Object.freeze({ accepted: false, reason: 'no-pending-interruption', snapshot: snapshot() });
    }
    const released = interruption;
    active = null;
    elapsedMs = 0;
    interruption = null;
    return Object.freeze({
      accepted: true,
      released,
      snapshot: snapshot({ interruptionReleased: true }),
    });
  }

  function reset() {
    active = null;
    elapsedMs = 0;
    interruption = null;
    return snapshot();
  }

  function update(deltaMs) {
    if (interruption) return snapshot({ frozenByInterruption: true });
    if (!active) return snapshot();
    const definition = active;
    const profile = definition.runtime;
    const previousElapsedMs = elapsedMs;
    elapsedMs += Math.max(0, Number(deltaMs) || 0);
    if (elapsedMs + 1e-6 < profile.durationSeconds * 1000) return snapshot({ previousElapsedMs });
    elapsedMs = profile.durationSeconds * 1000;
    const completedSnapshot = snapshot({ previousElapsedMs, completed: true });
    lastCompleted = Object.freeze({
      sequence,
      direction: profile.direction,
      clipId: profile.clipId,
      durationSeconds: profile.durationSeconds,
    });
    active = null;
    elapsedMs = 0;
    return completedSnapshot;
  }

  return Object.freeze({
    get snapshot() { return snapshot(); },
    get active() { return Boolean(active) && !interruption; },
    get interrupted() { return Boolean(interruption); },
    start,
    interrupt,
    releaseInterruption,
    update,
    reset,
  });
}
