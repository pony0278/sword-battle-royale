import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BODY_HIT_DAMAGE,
  DUEL_MAX_HEALTH,
  FIGHTER_CONDITION_STAGE,
  MEASURED_CONTACT_SECONDS,
  PARRY_STAGGER_SECONDS,
  createFighterCondition,
  judgeDuel,
  latestFollowupStartSeconds,
} from '../src/combat/fighter-condition.js';

// R23J.1 - the fight gets a result.
//
// Until this stage nothing in src/ knew the words health, damage or victory, and every measurement
// had to work around it: lock-advantage.js opens by saying "this lab has no second agent and no
// victory condition" and translates its question into a mechanical asymmetry instead. A blade
// landing on a chest produced a flinch and nothing else.

test('R23J.1 five blows end a duel, and the health says so on the way', () => {
  const fighter = createFighterCondition();
  assert.equal(fighter.report.health, DUEL_MAX_HEALTH);
  assert.equal(fighter.report.alive, true);
  const healths = [];
  for (let blow = 1; blow <= 5; blow += 1) healths.push(fighter.takeBodyHit().health);
  assert.deepEqual(healths, [80, 60, 40, 20, 0]);
  assert.equal(fighter.report.alive, false);
  assert.equal(fighter.report.blowsTaken, 5);
  // Five, not four and not six: 100 / 20. Stated as arithmetic so a change to either number has to
  // face this line.
  assert.equal(Math.ceil(DUEL_MAX_HEALTH / BODY_HIT_DAMAGE), 5);
});

test('R23J.1 a dead fighter takes no more damage and cannot be revived by being hit', () => {
  const fighter = createFighterCondition();
  for (let blow = 0; blow < 8; blow += 1) fighter.takeBodyHit();
  assert.equal(fighter.report.health, 0);
  assert.equal(fighter.report.blowsTaken, 5, 'blows after the last one are not counted as landing');
});

test('R23J.1 the stagger is long enough for the follow-up the game already authored', () => {
  // NOT a chosen number. parry-advantage.js has always described the enemy response as an
  // 'authoritative-stagger' whose duration it left to combat balance, and the reaction profiles
  // have always authored WHEN the free follow-up may begin. A blow lands 0.430s after it begins,
  // so the stagger must outlast the latest legal start plus that travel or the reward it promises
  // cannot be taken.
  const required = latestFollowupStartSeconds() + MEASURED_CONTACT_SECONDS;
  assert.ok(PARRY_STAGGER_SECONDS >= required,
    `a ${PARRY_STAGGER_SECONDS}s stagger cannot cover a follow-up that lands at ${required.toFixed(3)}s`);
  // And it is not wildly longer than it needs to be - a stagger with seconds to spare is a free
  // combo rather than a reward for reading one swing.
  assert.ok(PARRY_STAGGER_SECONDS - required < 0.5,
    `${(PARRY_STAGGER_SECONDS - required).toFixed(3)}s of slack turns one parry into more than one blow`);
  assert.equal(MEASURED_CONTACT_SECONDS, 0.43, 'all three directions are warped onto one contact');
});

test('R23J.1 a staggered fighter cannot act, and recovers on the clock rather than on an event', () => {
  const fighter = createFighterCondition();
  assert.equal(fighter.report.canAct, true);
  fighter.stagger();
  assert.equal(fighter.report.staggered, true);
  assert.equal(fighter.report.canAct, false, 'this is what makes the stagger a rule and not an animation');
  fighter.advance(999);
  assert.equal(fighter.report.canAct, false, 'still inside the second');
  fighter.advance(2);
  assert.equal(fighter.report.canAct, true, 'and out of it on the far side');
  assert.equal(fighter.report.staggered, false);
});

test('R23J.1 two parries in a second do not stack into a fighter who never moves again', () => {
  const fighter = createFighterCondition();
  fighter.stagger();
  fighter.advance(500);
  fighter.stagger(); // parried again half a second in
  // The longer of the two, not their sum: stacking would let a lucky pair of parries take somebody
  // out of the fight for two seconds, which is a combo nobody designed.
  assert.ok(Math.abs(fighter.report.staggerRemainingSeconds - PARRY_STAGGER_SECONDS) < 1e-9);
  fighter.advance(1001);
  assert.equal(fighter.report.canAct, true);
});

test('R23J.1 dying ends the stagger, because a fighter at zero is not waiting to recover', () => {
  const fighter = createFighterCondition();
  fighter.stagger();
  for (let blow = 0; blow < 5; blow += 1) fighter.takeBodyHit();
  assert.equal(fighter.report.staggered, false);
  assert.equal(fighter.report.canAct, false, 'still cannot act - being dead outranks being ready');
});

test('R23J.1 the duel is judged from the two fighters and holds no state of its own', () => {
  const player = createFighterCondition();
  const opponent = createFighterCondition();
  assert.deepEqual(
    { over: judgeDuel({ playerCondition: player, opponentCondition: opponent }).over },
    { over: false },
  );
  for (let blow = 0; blow < 5; blow += 1) opponent.takeBodyHit();
  const won = judgeDuel({ playerCondition: player, opponentCondition: opponent });
  assert.equal(won.over, true);
  assert.equal(won.winner, 'player');
  assert.equal(won.stage, FIGHTER_CONDITION_STAGE);

  // Both at zero is a real outcome rather than an impossible one - nothing stops two blows landing
  // on the same frame, and calling it for whoever is checked first would be a lie.
  for (let blow = 0; blow < 5; blow += 1) player.takeBodyHit();
  const drawn = judgeDuel({ playerCondition: player, opponentCondition: opponent });
  assert.equal(drawn.over, true);
  assert.equal(drawn.winner, null);
  assert.equal(drawn.reason, 'both-down');

  // A reset gives them both the fight back.
  player.reset(); opponent.reset();
  assert.equal(judgeDuel({ playerCondition: player, opponentCondition: opponent }).over, false);
  assert.equal(player.report.health, DUEL_MAX_HEALTH);
});

test('R23J.1 a missing fighter is not a victory', () => {
  const alone = createFighterCondition();
  assert.equal(judgeDuel({ playerCondition: alone }).over, false);
  assert.equal(judgeDuel({}).reason, 'no-duel');
});
