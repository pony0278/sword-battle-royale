import { wrapAngleRadians } from './base-facing.js';
import { horizontalHalfFovRadians, THIRD_PERSON_CAMERA_PROFILE } from './third-person-camera.js';

export const LOCK_ON_STAGE = 'R20P.1';

// R20P.1 (free movement) - who you have decided to fight.
//
// Locking is a decision, not a proximity accident, so nothing here acquires on its own: a target
// is taken when the player asks and kept until they let go or the distance says otherwise. What
// the lock buys is defensive - the guard aims itself, movement circles, the whole measured
// envelope applies - and what it costs is that everyone else in a battle royale is now behind you.
//
// The ranges are measured rather than chosen. swing-threat-relevance records how far each attack
// still reaches, lunge and lean included: TOP 3.002m, RIGHT 2.782m, LEFT 2.405m, plus a 0.25m
// margin the guard already treats as real. So 3.25m is the furthest anything can touch you, and
// the acquire range sits just past it - you get to be locked BEFORE you can be hit, rather than at
// the same moment.
export const LOCK_ON_ACQUIRE_RANGE_METERS = 3.5;
// Breaking is deliberately not the same number. A single threshold would flicker at the boundary
// and would make walking out of a fight an accident; 1.5m of hysteresis makes disengaging a thing
// you did. That band is also where the dash verb is meant to live - approach and disengage.
export const LOCK_ON_BREAK_RANGE_METERS = 5;
// The frontal cone is derived from the view rather than chosen, because "in front of me" means
// "on my screen" - and a constant cannot mean that. The rendered slice depends on the camera's
// vertical fov AND the viewport's aspect, which is why the earlier 50 degrees was wrong in both
// directions at once: wider than a 4:3 window renders (+-24.7) and far wider than a portrait phone
// (+-11.0), so it promised locks on people who were not on screen.
export const LOCK_ON_VIEW_CONE_FRACTION = 0.9;
// R20R.1: there used to be a floor here, and it was the only exception clause in these rules - a
// portrait phone renders about +-14.6 degrees, too narrow to aim with, so the cone was allowed to
// reach past the screen and a player could lock somebody they could not see. Declaring landscape
// the supported orientation deleted the case rather than the symptom: every viewport this game runs
// in renders more than the cone asks for, so "in front of me" now means "on my screen" with no
// exception at all. A window narrower than the contract is the contract's problem - it stops input
// and says so - not something for this rule to bend around.
// The desktop default, so callers who have no viewport to describe still get a real number.
const DEFAULT_VIEW = Object.freeze({
  fovDegrees: THIRD_PERSON_CAMERA_PROFILE.locked.distanceKeys[0].fovDegrees,
  aspectRatio: 16 / 9,
});

// A fraction of what is rendered: the screen's own edge is not a place anybody aims, so the cone
// stops short of it and a lock stays something you pointed at.
export function lockOnAcquireHalfAngleRadians(view = {}) {
  const fovDegrees = Number.isFinite(Number(view?.fovDegrees)) ? Number(view.fovDegrees) : DEFAULT_VIEW.fovDegrees;
  // A non-positive aspect describes no viewport at all, so it falls back rather than collapsing the
  // cone to nothing - null and 0 are what a half-built layout reports, not a one-pixel-wide screen.
  const statedAspect = Number(view?.aspectRatio);
  const aspectRatio = Number.isFinite(statedAspect) && statedAspect > 0 ? statedAspect : DEFAULT_VIEW.aspectRatio;
  return horizontalHalfFovRadians(fovDegrees, aspectRatio) * LOCK_ON_VIEW_CONE_FRACTION;
}

export const LOCK_ON_ACQUIRE_HALF_ANGLE_RADIANS = lockOnAcquireHalfAngleRadians(DEFAULT_VIEW);

export const LOCK_ON_PROFILE = Object.freeze({
  acquireRangeMeters: LOCK_ON_ACQUIRE_RANGE_METERS,
  breakRangeMeters: LOCK_ON_BREAK_RANGE_METERS,
  acquireHalfAngleRadians: LOCK_ON_ACQUIRE_HALF_ANGLE_RADIANS,
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function measure(self, candidate, viewForwardRadians) {
  const dx = finite(candidate?.position?.x) - finite(self?.x);
  const dz = finite(candidate?.position?.z) - finite(self?.z);
  const distanceMeters = Math.hypot(dx, dz);
  // Bearing in the same convention the ground ledger uses: atan2(lateral, longitudinal).
  const bearingRadians = distanceMeters > 1e-9 ? Math.atan2(dx, dz) : null;
  return {
    id: candidate?.id ?? null,
    distanceMeters,
    bearingRadians,
    angleOffsetRadians: bearingRadians == null
      ? null
      : wrapAngleRadians(bearingRadians - finite(viewForwardRadians)),
  };
}

// Pure: given what is on screen right now, which candidate would a request take? Distance filters
// (the threat circle), the view centre chooses. Nearest-to-centre rather than nearest outright is
// the point of aiming with the camera - but only among those close enough to matter, so a distant
// figure dead centre never outranks the person actually swinging at you.
export function selectLockOnCandidate(input = {}) {
  // Precedence: a cone the caller states outright, else the one this frame's viewport implies,
  // else the desktop default. The lab needs the first, the game gives the second.
  const derived = input.view ? { acquireHalfAngleRadians: lockOnAcquireHalfAngleRadians(input.view) } : {};
  const profile = Object.freeze({ ...LOCK_ON_PROFILE, ...derived, ...(input.profile || {}) });
  const self = input.self || { x: 0, z: 0 };
  const viewForwardRadians = finite(input.viewForwardRadians, 0);
  const candidates = Array.isArray(input.candidates) ? input.candidates : [];
  let best = null;
  let inRangeCount = 0;
  for (const candidate of candidates) {
    if (candidate?.id == null) continue;
    const measured = measure(self, candidate, viewForwardRadians);
    if (measured.distanceMeters > profile.acquireRangeMeters) continue;
    inRangeCount += 1;
    // Standing inside someone has no bearing to judge; they are certainly in front of you.
    const offset = measured.angleOffsetRadians == null ? 0 : Math.abs(measured.angleOffsetRadians);
    if (offset > profile.acquireHalfAngleRadians) continue;
    if (!best || offset < best.offset) best = { offset, measured };
  }
  if (!best) {
    return Object.freeze({
      stage: LOCK_ON_STAGE,
      accepted: false,
      targetId: null,
      reason: inRangeCount === 0 ? 'nobody-within-lock-range' : 'nobody-inside-the-frontal-view',
      profile,
    });
  }
  return Object.freeze({
    stage: LOCK_ON_STAGE,
    accepted: true,
    targetId: best.measured.id,
    distanceMeters: best.measured.distanceMeters,
    angleOffsetRadians: best.measured.angleOffsetRadians,
    bearingRadians: best.measured.bearingRadians,
    reason: 'nearest-to-the-view-centre-within-range',
    profile,
  });
}

export function createLockOnRuntime(options = {}) {
  // Two readings of the same thing: what the caller actually stated (which is all that may override
  // a viewport-derived cone) and the merged profile this runtime reports and measures ranges with.
  const stated = Object.freeze({ ...(options.profile || {}) });
  const profile = Object.freeze({ ...LOCK_ON_PROFILE, ...stated });
  let targetId = null;
  let lastReason = 'never-locked';
  let lastMeasured = null;

  function report() {
    return Object.freeze({
      stage: LOCK_ON_STAGE,
      state: targetId == null ? 'free' : 'locked',
      targetId,
      locked: targetId != null,
      reason: lastReason,
      distanceMeters: lastMeasured?.distanceMeters ?? null,
      bearingRadians: lastMeasured?.bearingRadians ?? null,
      profile,
      authority: 'lock-on-target-selection-no-contact-authority',
    });
  }

  function release(reason) {
    targetId = null;
    lastMeasured = null;
    lastReason = reason;
    return report();
  }

  return Object.freeze({
    // The key press. Locked, it lets go - switching targets is deliberately not folded in here,
    // because a toggle that sometimes releases and sometimes re-aims is a toggle you cannot trust.
    requestToggle(input = {}) {
      if (targetId != null) return release('released-by-request');
      const selection = selectLockOnCandidate({ ...input, profile: stated });
      if (!selection.accepted) {
        lastReason = selection.reason;
        return report();
      }
      targetId = selection.targetId;
      lastMeasured = selection;
      lastReason = 'locked-by-request';
      return report();
    },
    // Per frame. A lock is kept through anything except distance and disappearance: once taken,
    // the target does not have to stay in front of you - the camera is following them, and the
    // whole point of the state is that you no longer aim it by hand.
    update(input = {}) {
      if (targetId == null) return report();
      const candidates = Array.isArray(input.candidates) ? input.candidates : [];
      const current = candidates.find((candidate) => candidate?.id === targetId);
      if (!current) return release('target-gone');
      const measured = measure(input.self || { x: 0, z: 0 }, current, input.viewForwardRadians);
      if (measured.distanceMeters > profile.breakRangeMeters) return release('broke-by-distance');
      lastMeasured = measured;
      lastReason = 'held';
      return report();
    },
    release: () => release('released'),
    get report() { return report(); },
  });
}
