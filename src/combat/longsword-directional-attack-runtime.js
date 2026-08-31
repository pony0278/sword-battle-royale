import {
  SWEPT_CONTACT_TEMPORAL_ELIGIBILITY_AUTHORITY,
} from './swept-contact-temporal-eligibility.js';
import { createActionDefinition } from './action-definition.js';
import {
  LONGSWORD_ATTACK_DIRECTIONS,
  LONGSWORD_DIRECTIONAL_ATTACKS,
} from './longsword-directional-metadata.js';
import { getAttackTimeWarp, warpSourceToRuntime, warpRuntimeToSource } from './attack-time-warp.js';

export const LONGSWORD_ATTACK_RUNTIME_STAGE = 'G4.1';
export const LONGSWORD_ATTACK_INTERRUPTION_STAGE = 'G4.3B.1';
export const LONGSWORD_ATTACK_FPS = 30;

export const LONGSWORD_ATTACK_PHASES = Object.freeze({
  IDLE: 'idle',
  WINDUP: 'attack_windup',
  ACTIVE: 'attack_active',
  RECOVERY: 'attack_recovery',
  INTERRUPTED: 'attack_interrupted',
});

const NATURAL_DURATIONS = Object.freeze({
  top: 1.533,
  right: 0.433,
  left: 0.533,
});

// R21J.1 - where the presentation stops sampling the clip, when its authored tail is unusable.
//
// Reported from play: RIGHT does not settle after the swing, it looks like a dropped frame.
// Measured, the blade axis turned per 60fps frame through the tail of each attack:
//
//   top     7.6  6.2  5.0  4.0  8.7  8.6  9.1  9.2 ...   never stops moving
//   left   11.7  2.3  2.3  2.3  2.7  0.7  1.0  1.6 ...   decelerates, then eases out
//   right  12.3  7.7  0.7  0.7  0.6  1.5  2.2  2.2 ...   stops dead for three frames, then resumes
//
// RIGHT is the only one that halts and restarts, and that halt is what reads as a skipped frame.
// It is NOT the time warp: moving the warp's end from source 0.30 through 0.34, 0.38 and 0.42 left
// the halt at exactly the same runtime moment, and it is present at the old 1.6 stretch too, which
// puts it in the clip rather than in anything R21B.1 or R21I.1 did. Converting back through each
// stretch lands both readings on source 0.306-0.307, so UAL2/Sword_Regular_A simply has a dead
// interval between its 30fps keys 9 and 10.
//
// So the presentation stops sampling this clip where its real motion stops, at source 0.31 - the
// last frame still turning (7.7 deg) sits at source 0.303, the first dead one at 0.312 - and the
// existing attack-recovery blend covers the rest, easing to Sword_Idle over 155ms instead of
// playing 123ms of authored stall and slow drift.
//
// The trim is in SOURCE seconds and the clip's own length is still reported unchanged as
// sourceDurationSeconds: this says when we stop looking at the clip, not how long the clip is.
export const PRESENTATION_END_SOURCE_SECONDS = Object.freeze({
  right: 0.31,
});

const ACTIVE_LEAD_SECONDS = Object.freeze({ top: 0.055, right: 0.04, left: 0.045 });
const ACTIVE_TRAIL_SECONDS = Object.freeze({ top: 0.065, right: 0.05, left: 0.055 });
const TRAIL_LEAD_SECONDS = Object.freeze({ top: 0.16, right: 0.11, left: 0.12 });
const TRAIL_TAIL_SECONDS = Object.freeze({ top: 0.12, right: 0.09, left: 0.10 });

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

function directionEntry(direction) {
  const key = String(direction || '').toLowerCase();
  const entry = LONGSWORD_DIRECTIONAL_ATTACKS[key];
  if (!entry) throw new Error(`Unknown longsword attack direction: ${direction}`);
  return { key, entry };
}

function frameFloor(seconds, fps) {
  return Math.max(0, Math.floor(seconds * fps + 1e-9));
}

function frameCeil(seconds, fps) {
  return Math.max(0, Math.ceil(seconds * fps - 1e-9));
}

export function getLongswordDirectionalAttackProfile(direction, options = {}) {
  const { key, entry } = directionEntry(direction);
  const sourceDurationSeconds = Math.max(0.001, Number(options.durationSeconds) || NATURAL_DURATIONS[key]);
  // R20M.1 (B6h): every window below is authored against the clip, so it is derived in SOURCE time
  // and then restated in the clock the exchange counts in. Where a direction has no warp - TOP and
  // RIGHT - the two clocks are the same and this is the identity, byte for byte.
  const timeWarp = options.timeWarp === null ? null : (options.timeWarp || getAttackTimeWarp(key));
  const toRuntime = (seconds) => warpSourceToRuntime(seconds, timeWarp);
  // R21J.1: the clip may be abandoned before it ends, but never extended past it, and never
  // trimmed back over anything the exchange is calibrated against - the trim is refused if it
  // would land at or before contact.
  const presentationEnd = PRESENTATION_END_SOURCE_SECONDS[key];
  const usableSourceSeconds = presentationEnd != null
    && presentationEnd > entry.contactSeconds
    && presentationEnd < sourceDurationSeconds
    ? presentationEnd
    : sourceDurationSeconds;
  const durationSeconds = toRuntime(usableSourceSeconds);
  const contactSeconds = toRuntime(clamp(entry.contactSeconds, 0, sourceDurationSeconds));
  const activeStartSeconds = toRuntime(clamp(entry.contactSeconds - ACTIVE_LEAD_SECONDS[key], 0, sourceDurationSeconds));
  const activeEndSeconds = Math.max(activeStartSeconds, toRuntime(clamp(entry.contactSeconds + ACTIVE_TRAIL_SECONDS[key], 0, sourceDurationSeconds)));
  const trailStartSeconds = toRuntime(clamp(entry.contactSeconds - TRAIL_LEAD_SECONDS[key], 0, sourceDurationSeconds));
  const trailEndSeconds = Math.max(trailStartSeconds, toRuntime(clamp(entry.contactSeconds + TRAIL_TAIL_SECONDS[key], 0, sourceDurationSeconds)));
  const movementStartSeconds = toRuntime(clamp(entry.contactSeconds - Math.max(0.11, TRAIL_LEAD_SECONDS[key]), 0, sourceDurationSeconds));
  const movementEndSeconds = Math.max(movementStartSeconds, toRuntime(clamp(entry.contactSeconds + 0.04, 0, sourceDurationSeconds)));
  const cancelStartSeconds = clamp(Math.max(activeEndSeconds, durationSeconds - Math.min(0.16, durationSeconds * 0.28)), 0, durationSeconds);
  return Object.freeze({
    timeWarp,
    sourceDurationSeconds,
    stage: LONGSWORD_ATTACK_RUNTIME_STAGE,
    weapon: 'longsword',
    category: 'attack',
    direction: key,
    clipId: entry.clipId,
    source: entry.clipId.startsWith('UAL1/') ? 'ual1' : 'ual2',
    durationSeconds,
    contactSeconds,
    activeStartSeconds,
    activeEndSeconds,
    trailStartSeconds,
    trailEndSeconds,
    movementStartSeconds,
    movementEndSeconds,
    cancelStartSeconds,
    inPlace: true,
    rootRotationPolicy: 'lock',
  });
}

export function createLongswordDirectionalAttackDefinition(direction, options = {}) {
  const fps = Math.max(1, Number(options.fps) || LONGSWORD_ATTACK_FPS);
  const profile = getLongswordDirectionalAttackProfile(direction, options);
  const maxFrame = frameCeil(profile.durationSeconds, fps);
  const action = createActionDefinition({
    id: `longsword_light_${profile.direction}`,
    clipId: profile.clipId,
    category: 'attack',
    animationBinding: {
      source: profile.source,
      clipId: profile.clipId,
      speed: 1,
      inPlace: true,
      loop: false,
      blendInSeconds: 0.04,
      blendOutSeconds: 0.08,
    },
    windows: {
      active: [{
        startFrame: frameFloor(profile.activeStartSeconds, fps),
        endFrame: frameCeil(profile.activeEndSeconds, fps),
        label: `${profile.direction} sword contact`,
      }],
      movement: [{
        startFrame: frameFloor(profile.movementStartSeconds, fps),
        endFrame: frameCeil(profile.movementEndSeconds, fps),
        label: `${profile.direction} attack commitment`,
      }],
      weaponTrail: [{
        startFrame: frameFloor(profile.trailStartSeconds, fps),
        endFrame: frameCeil(profile.trailEndSeconds, fps),
        label: `${profile.direction} sword trail`,
      }],
      cancel: [{
        startFrame: frameFloor(profile.cancelStartSeconds, fps),
        endFrame: maxFrame,
        label: `${profile.direction} recovery cancel`,
      }],
    },
  }, maxFrame);
  return Object.freeze({
    ...action,
    direction: profile.direction,
    runtime: profile,
    fps,
    durationFrames: maxFrame,
  });
}

export const LONGSWORD_DIRECTIONAL_ATTACK_DEFINITIONS = Object.freeze(Object.fromEntries(
  LONGSWORD_ATTACK_DIRECTIONS.map((direction) => [direction, createLongswordDirectionalAttackDefinition(direction)]),
));

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
        ?? (profile ? warpRuntimeToSource(elapsedSeconds, profile.timeWarp) : null),
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
    const sourceTimeSeconds = warpRuntimeToSource(runtimeSeconds, profile.timeWarp);
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
