import { BASE_FACING_TURN_RATE_RADIANS_PER_SECOND } from './base-facing.js';
import { MEASURED_GUARD_RELIABLE_CONE_DEGREES } from './guard-frontal-cone.js';

export const LOCK_ADVANTAGE_STAGE = 'R20V.1';

// R20V.1 — what locking is worth, measured.
//
// There is no win rate to measure here: this lab has no second agent and no victory condition. So
// the question was translated into the mechanical asymmetry that would produce one - does the guard
// still catch the blade? The defender moves for T seconds, stops, and is attacked, guard held, from
// the calibrated 2.4m stance, n=2 per cell, pinned clock.
//
// LOCKED: facing is derived from the gap, so it follows the opponent for free. Zero facing error at
// every T, and every attack blocked - the fight can travel as far as it likes and nothing decays.
//
// UNLOCKED: facing is OWNED, and in free mode it follows your movement. So moving turns you away
// from the fight, at the base facing's own 180 deg/s, and a quarter second of it is already 75
// degrees. That is not "harder to hit" - it is "you cannot move and defend at the same time".
// Standing still unlocked blocks perfectly (T=0 is clean across all three directions); it is
// movement, not the absence of a lock, that costs the block.
export const MEASURED_UNLOCKED_DEFENCE_DECAY = Object.freeze({
  stanceMeters: 2.4,
  trialsPerCell: 2,
  // seconds of held sidestep -> facing error in degrees, and how each direction resolved
  byMoveSeconds: Object.freeze({
    0: Object.freeze({ facingErrorDegrees: 0, top: 'blocked', right: 'blocked', left: 'blocked' }),
    0.25: Object.freeze({ facingErrorDegrees: 75.3, top: 'body', right: 'blocked', left: 'body' }),
    0.5: Object.freeze({ facingErrorDegrees: 102.1, top: 'body', right: 'body', left: 'body' }),
    0.75: Object.freeze({ facingErrorDegrees: 107.7, top: 'body', right: 'body', left: 'body' }),
    1: Object.freeze({ facingErrorDegrees: 113, top: 'body', right: 'body', left: 'body' }),
    1.5: Object.freeze({ facingErrorDegrees: 122.3, top: 'body', right: 'body', left: 'whiff' }),
  }),
});

// Locked, the same sweep is flat: no error, no failures, at any T.
export const MEASURED_LOCKED_DEFENCE = Object.freeze({
  facingErrorDegrees: 0,
  outcomesAllDirections: 'blocked',
  moveSecondsSampled: Object.freeze([0, 0.25, 0.5, 0.75, 1, 1.5]),
});

// How fast the penalty arrives, from the turn rate rather than from the table: a sidestep asks the
// body for 90 degrees, and the integrator gives it at this rate.
export const UNLOCKED_FACING_DECAY_DEGREES_PER_SECOND = (BASE_FACING_TURN_RATE_RADIANS_PER_SECOND * 180) / Math.PI;

// A caveat that has to travel with the numbers. R19X.1's reliable cones were measured by INJECTING
// a facing error into a defender standing still - rotation only. These cells rotate AND displace,
// because in free mode the two are the same input, so band membership does not predict them: every
// error above is inside all three measured bands and the blocks failed anyway. The cones still
// describe what they were measured on; they simply do not answer this question.
export const CONE_BANDS_DO_NOT_TRANSFER = Object.freeze({
  measuredUnder: 'injected-rotation-at-a-fixed-stance',
  measuredHere: 'rotation-and-displacement-together',
  bands: MEASURED_GUARD_RELIABLE_CONE_DEGREES,
});

// The design question these numbers put, left open on purpose: the stated intent was to ENCOURAGE
// locking, and what is measured is closer to requiring it. Three ways out, if it reads badly in
// play - accept it (unlocked is for travelling, and standing still unlocked still defends), aim the
// guard at the CAMERA rather than the body while unlocked (defend where you look, which is how the
// lock cone is already derived), or stop a pure sidestep from turning the body at all.
export const LOCK_ADVANTAGE_VERDICT = Object.freeze({
  stage: LOCK_ADVANTAGE_STAGE,
  lockedBlocksAtEveryMoveDuration: true,
  unlockedBlocksOnlyWhileStandingStill: true,
  secondsOfMovementBeforeFirstFailure: 0.25,
  status: 'measured-design-decision-open',
});
