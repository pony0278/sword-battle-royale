import {
  OPPONENT_GUARD_PROFILE,
  createSeededRandom,
  decideOpponentGuard,
  planOpponentGuard,
  planOpponentParry,
} from '../combat/opponent-guard.js';

export const OPPONENT_GUARD_RUNTIME_STAGE = 'R23X.1';

// R23T.1 — the clock and the memory around planOpponentGuard: which swing is being answered, what
// was decided about it, and where the shield is. Seeded like the drive, and reseeded with it.
export function createOpponentGuardRuntime(options = {}) {
  const profile = Object.freeze({ ...OPPONENT_GUARD_PROFILE, ...(options.profile || {}) });
  let seed = Number.isFinite(Number(options.seed)) ? Number(options.seed) : 1;
  let random = createSeededRandom(seed);
  let answeredSequence = null;
  let decision = null;
  let currentSector = profile.restSector;
  let lastPlan = null;
  let swingsSeen = 0;
  let swingsRead = 0;
  let armedSequence = null; // R23X.1: one arm per swing
  let parriesArmed = 0;
  let lastParry = null;

  return Object.freeze({
    frame({ threat = null, ownSwinging = false } = {}) {
      if (threat?.active === true && threat.sequence !== answeredSequence) {
        answeredSequence = threat.sequence;
        decision = decideOpponentGuard(random, profile);
        swingsSeen += 1;
        if (decision.willCover) swingsRead += 1;
      }
      lastPlan = planOpponentGuard({ threat, decision, currentSector, ownSwinging, profile });
      currentSector = lastPlan.sector;
      // R23X.1: the parry rides on the same frame. The shield is "in the sector" once the read has
      // moved it there - which the guard plan reports as COVERING - and it arms once.
      lastParry = planOpponentParry({
        threat, decision, alreadyArmed: threat?.sequence === armedSequence,
        shieldInSector: lastPlan.reason === 'shield-moved-into-the-sector-the-swing-arrives-at',
      });
      if (lastParry.arm) { armedSequence = threat.sequence; parriesArmed += 1; }
      return lastPlan;
    },
    reseed(value) {
      seed = Number.isFinite(Number(value)) ? Number(value) : 1;
      random = createSeededRandom(seed);
      answeredSequence = null; decision = null; currentSector = profile.restSector; lastPlan = null;
      swingsSeen = 0; swingsRead = 0; armedSequence = null; parriesArmed = 0; lastParry = null;
    },
    get seed() { return seed; },
    get plan() { return lastPlan; },
    get parry() { return lastParry; }, // R23X.1: this frame's arming verdict
    get report() {
      return Object.freeze({
        stage: OPPONENT_GUARD_RUNTIME_STAGE, seed, hold: lastPlan?.hold === true, sector: currentSector,
        reason: lastPlan?.reason ?? 'never-driven', decision, swingsSeen, swingsRead, parriesArmed, profile,
      });
    },
  });
}
