import {
  OPPONENT_DRIVE_PROFILE,
  OPPONENT_ENGAGEMENT_BAND_METERS,
  createOpponentDirectionSequence,
  drawRestIntervalMs,
  planOpponentDrive,
} from '../combat/opponent-drive.js';

export const OPPONENT_DRIVE_RUNTIME_STAGE = 'R21E.1';

export const DEFAULT_OPPONENT_SEED = 20250831;

// R21E.1: the clocks and the bag, held between frames.
//
// The planner is pure and the verbs belong to the lab, so this is the only piece that remembers
// anything: how long the attack gate has been open, what this cycle's seeded rest is, and which
// direction the bag serves next. It calls nothing - frame() returns a plan and the caller decides
// whether to act on it, which is what keeps a switched-off drive genuinely inert rather than
// merely ignored.
export function createOpponentDriveRuntime(options = {}) {
  const profile = Object.freeze({ ...OPPONENT_DRIVE_PROFILE, ...(options.profile || {}) });
  const band = Object.freeze({ ...OPPONENT_ENGAGEMENT_BAND_METERS, ...(options.band || {}) });
  let seed = Number.isFinite(Number(options.seed)) ? Number(options.seed) : DEFAULT_OPPONENT_SEED;
  let sequence = createOpponentDirectionSequence(seed);
  let restedMs = 0;
  let restTargetMs = drawRestIntervalMs(sequence.random, profile);
  let gateWasOpen = false;
  let repositioning = false;
  let lastPlan = null;
  let attacksServed = 0;
  let lastDirection = null;

  function report() {
    return Object.freeze({
      stage: OPPONENT_DRIVE_RUNTIME_STAGE,
      seed,
      upcoming: sequence.upcoming,
      lastDirection,
      attacksServed,
      restedMs,
      restTargetMs,
      intent: lastPlan?.intent ?? 0,
      reason: lastPlan?.reason ?? 'never-driven',
      inBand: lastPlan?.inBand ?? null,
      underSwing: lastPlan?.underSwing ?? false, // R24A.1
      repositioning,
      offsetMeters: lastPlan?.offsetMeters ?? null,
      band,
      authority: profile.authority,
    });
  }

  return Object.freeze({
    // deltaMs is real time, not the review-scaled clock: a tester slowing the review down is
    // slowing the fight they are watching, not asking the opponent to think more slowly.
    frame({ deltaMs = 0, separationMeters = null, attackAvailable = false, underSwing = false } = {}) { // R24A.1
      const open = attackAvailable === true;
      // The rest is measured from the moment the gate opens, and re-drawn each time it does, so a
      // long exchange never banks credit toward the next swing.
      if (open && !gateWasOpen) { restedMs = 0; restTargetMs = drawRestIntervalMs(sequence.random, profile); }
      gateWasOpen = open;
      restedMs = open ? restedMs + Math.max(0, Number(deltaMs) || 0) : 0;

      lastPlan = planOpponentDrive({
        separationMeters, attackAvailable: open, restedMs, restTargetMs,
        nextDirection: sequence.upcoming, repositioning, profile, band, underSwing: underSwing === true,
      });
      repositioning = lastPlan.repositioning;
      return lastPlan;
    },
    // Spends the direction the plan just chose. Separate from frame() because the caller may find
    // the lab refuses the attack after all, and a direction spent on a refused swing would skew
    // the very distribution the bag exists to guarantee.
    commit(direction) {
      // The swing spends its advance, which puts the attacker inside the band by more than the
      // arrival tolerance; saying so here rather than waiting for the next frame to notice keeps
      // the walk-back starting on the same frame the swing does.
      repositioning = true;
      const served = sequence.next();
      lastDirection = direction || served;
      attacksServed += 1;
      restedMs = 0;
      restTargetMs = drawRestIntervalMs(sequence.random, profile);
      return lastDirection;
    },
    // R21L.1: a fresh run zeroes the swing count without touching the bag or the seed. The tally
    // resets on the same edge, and the two were reading from different clocks - a report could say
    // "已出 48" beside a table totalling 34, which is one number too many for anyone to trust.
    resetRun() {
      attacksServed = 0;
      lastDirection = null;
      return report();
    },
    reseed(value) {
      seed = Number.isFinite(Number(value)) ? Number(value) : DEFAULT_OPPONENT_SEED;
      sequence = createOpponentDirectionSequence(seed);
      restedMs = 0;
      restTargetMs = drawRestIntervalMs(sequence.random, profile);
      gateWasOpen = false;
      repositioning = false;
      lastPlan = null;
      attacksServed = 0;
      lastDirection = null;
      return report();
    },
    get seed() { return seed; },
    get plan() { return lastPlan; },
    get report() { return report(); },
  });
}
