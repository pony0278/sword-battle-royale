import {
  OPPONENT_GUARD_PROFILE,
  createSeededRandom,
  decideOpponentGuard,
  planOpponentGuard,
} from '../combat/opponent-guard.js';

export const OPPONENT_GUARD_RUNTIME_STAGE = 'R23S.1';

// R23S.1 — the clock and the memory around planOpponentGuard: which swing is being answered, what
// was decided about it, and how long ago it ended. Seeded like the drive, and reseeded with it.
export function createOpponentGuardRuntime(options = {}) {
  const profile = Object.freeze({ ...OPPONENT_GUARD_PROFILE, ...(options.profile || {}) });
  let seed = Number.isFinite(Number(options.seed)) ? Number(options.seed) : 1;
  let random = createSeededRandom(seed);
  let answeredSequence = null;
  let decision = null;
  let sinceThreatEndedSeconds = Infinity;
  let lastPlan = null;
  let swingsSeen = 0;
  let swingsBlocked = 0;

  return Object.freeze({
    frame({ deltaMs = 0, threat = null, ownSwinging = false } = {}) {
      const dt = Math.max(0, Number(deltaMs) || 0) / 1000;
      if (threat?.active === true) {
        if (threat.sequence !== answeredSequence) {
          answeredSequence = threat.sequence;
          decision = decideOpponentGuard(random, profile);
          swingsSeen += 1;
          if (decision.willBlock) swingsBlocked += 1;
        }
        sinceThreatEndedSeconds = 0;
      } else {
        sinceThreatEndedSeconds += dt;
      }
      lastPlan = planOpponentGuard({ threat, decision, sinceThreatEndedSeconds, ownSwinging, profile });
      return lastPlan;
    },
    reseed(value) {
      seed = Number.isFinite(Number(value)) ? Number(value) : 1;
      random = createSeededRandom(seed);
      answeredSequence = null; decision = null; sinceThreatEndedSeconds = Infinity; lastPlan = null;
      swingsSeen = 0; swingsBlocked = 0;
    },
    get seed() { return seed; },
    get plan() { return lastPlan; },
    get report() {
      return Object.freeze({
        stage: OPPONENT_GUARD_RUNTIME_STAGE, seed, hold: lastPlan?.hold === true, reason: lastPlan?.reason ?? 'never-driven',
        decision, swingsSeen, swingsBlocked, profile,
      });
    },
  });
}
