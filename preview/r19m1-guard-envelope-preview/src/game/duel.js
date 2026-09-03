import { GUARD_OUTCOMES } from '../combat/guard-outcome-resolution.js';
import { ASSISTED_PARRY_STAGGER_SECONDS, PARRY_STAGGER_SECONDS, judgeDuel } from '../combat/fighter-condition.js';

export const DUEL_STAGE = 'R23J.1';

// R23J.1 — the result layer, as a unit.
//
// The rule itself is in src/combat/fighter-condition.js and knows nothing about who is fighting.
// This is the thin thing above it that knows there are exactly two of them: it spends an exchange
// on the right pair of shoulders, runs their staggers down, and says who won.
//
// It publishes a verdict rather than writing to the page, so the entry keeps the DOM and this keeps
// the fight - the same seam createEngagement already draws.
export function createDuel({ playerCondition, opponentCondition, publishStatus = () => {} }) {
  if (!playerCondition?.report || !opponentCondition?.report) {
    throw new Error('R23J.1 a duel needs two fighters with a condition');
  }

  function verdict() {
    return judgeDuel({ playerCondition, opponentCondition });
  }

  return Object.freeze({
    stage: DUEL_STAGE,
    get verdict() { return verdict(); },
    get report() {
      return Object.freeze({
        stage: DUEL_STAGE,
        player: playerCondition.report,
        opponent: opponentCondition.report,
        verdict: verdict(),
      });
    },
    // A landed blade. The rule module decides what it costs; this only knows whose body it was.
    landBlowOn(condition) {
      const after = condition.takeBodyHit();
      this.announce();
      return after;
    },
    // What an exchange cost the one who threw it. A parried SWINGER is staggered, not the one who
    // answered: parrying is the reward for reading the swing, and the reward is the second the
    // other one loses. Blocking costs neither, which is why a block is still worth a swing.
    // R24G.1 (#37): and by how much depends on the tier the press earned - an assisted parry
    // (timed, not aimed) buys less than the follow-up needs; a perfect one buys the whole second.
    spendExchangeOn(outcome, swingerCondition, { tier = null } = {}) {
      if (outcome === GUARD_OUTCOMES.PARRY || outcome === GUARD_OUTCOMES.PERFECT_PARRY) {
        swingerCondition.stagger(tier === 'assisted' ? ASSISTED_PARRY_STAGGER_SECONDS : PARRY_STAGGER_SECONDS);
      }
      this.announce();
      return outcome ?? null;
    },
    // Run on the WALL clock by its caller, not the review-slowed one: a second taken out of the
    // fight is a second the player waits through, whatever the tempo dial is set to.
    advance(deltaMs) {
      playerCondition.advance(deltaMs);
      opponentCondition.advance(deltaMs);
      return verdict();
    },
    announce() {
      const result = verdict();
      if (!result.over) return result;
      publishStatus(result.winner === 'player'
        ? { text: 'YOU WIN · the opponent is down · RETRY ATTACK starts a new duel', className: 'good' }
        : result.winner === 'opponent'
          ? { text: 'YOU ARE DOWN · RETRY ATTACK starts a new duel', className: 'bad' }
          : { text: 'BOTH DOWN · RETRY ATTACK starts a new duel', className: 'bad' });
      return result;
    },
    reset() {
      playerCondition.reset();
      opponentCondition.reset();
      return verdict();
    },
  });
}
