import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BODY_HIT_DAMAGE,
  CANONICAL_CONTACT_DIRECTION,
  DUEL_MAX_HEALTH,
  FIGHTER_CONDITION_STAGE,
  MEASURED_CONTACT_SECONDS,
  PARRY_STAGGER_SECONDS,
  createFighterCondition,
  judgeDuel,
  latestFollowupStartSeconds,
  measuredContactSecondsFor,
} from '../src/combat/fighter-condition.js';
import { ATTACK_DIRECTIONS } from '../src/combat/attack-directions.js';

// R23J.1 - the fight gets a result.
//
// Until this stage nothing in src/ knew the words health, damage or victory, and every measurement
// had to work around it: lock-advantage.js opens by saying "this lab has no second agent and no
// victory condition" and translates its question into a mechanical asymmetry instead. A blade
// landing on a chest produced a flinch and nothing else.

// R23Y.1: the count is derived, not written - the blow was 20 (five to a kill) and is now 10.
const BLOWS_TO_KILL = Math.ceil(DUEL_MAX_HEALTH / BODY_HIT_DAMAGE);

test('R23J.1 the blows to a kill end a duel, and the health says so on the way', () => {
  const fighter = createFighterCondition();
  assert.equal(fighter.report.health, DUEL_MAX_HEALTH);
  assert.equal(fighter.report.alive, true);
  const healths = [];
  for (let blow = 1; blow <= BLOWS_TO_KILL; blow += 1) healths.push(fighter.takeBodyHit().health);
  assert.deepEqual(healths, [90, 80, 70, 60, 50, 40, 30, 20, 10, 0]);
  assert.equal(fighter.report.alive, false);
  assert.equal(fighter.report.blowsTaken, BLOWS_TO_KILL);
  // Ten, not nine and not eleven: 100 / 10. Stated as arithmetic so a change to either number has to
  // face this line.
  assert.equal(BLOWS_TO_KILL, 10);
});

test('R23J.1 a dead fighter takes no more damage and cannot be revived by being hit', () => {
  const fighter = createFighterCondition();
  for (let blow = 0; blow < BLOWS_TO_KILL + 3; blow += 1) fighter.takeBodyHit();
  assert.equal(fighter.report.health, 0);
  assert.equal(fighter.report.blowsTaken, BLOWS_TO_KILL, 'blows after the last one are not counted as landing');
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

// S1.C1 - the assertion above says "all three directions" and reads one of them. It has been true
// the whole time, but nothing measured it, and the whole point of asking a weapon for its contact
// rather than resolving one at import is that the direction asked must not matter.
//
// Not equality: RIGHT lands 0.4301 against TOP's and LEFT's 0.4300. That 0.1ms is the warp's own
// arithmetic - a tenth of a millisecond, against a 33.4ms animation frame - and not the +5e-17 of
// float noise that LEFT carries. A tolerance is the honest assertion; equality would be a lie that
// happened to pass on two directions out of three.
test('S1.C1 every direction is warped onto the same contact, so the direction asked does not matter', () => {
  const contacts = ATTACK_DIRECTIONS.map((direction) => ({
    direction,
    seconds: measuredContactSecondsFor({ direction }),
  }));
  const spread = Math.max(...contacts.map((c) => c.seconds)) - Math.min(...contacts.map((c) => c.seconds));
  assert.ok(spread < 0.0002,
    `directions disagree by ${(spread * 1000).toFixed(2)}ms: ${contacts.map((c) => `${c.direction} ${c.seconds}`).join(', ')}`);
  assert.equal(measuredContactSecondsFor({ direction: CANONICAL_CONTACT_DIRECTION }), MEASURED_CONTACT_SECONDS,
    'the exported constant is the canonical direction asked through the same seam');
});

// S1.C1 - a second weapon answers with its own measurement. Nothing here is the longsword: the
// stand-in returns a contact of its own, and the point is that both rules built on this number -
// the stagger covering the follow-up, and the opponent's guard beating the blade - can be asked
// about a weapon that does not exist yet without touching this module again.
test('S1.C1 a weapon that is not the longsword answers with its own contact', () => {
  const katanaStandIn = () => Object.freeze({ contactSeconds: 0.31 });
  const contact = measuredContactSecondsFor({ getDirectionalAttackProfile: katanaStandIn });
  assert.equal(contact, 0.31, 'the injected weapon decides its own contact');
  assert.notEqual(contact, MEASURED_CONTACT_SECONDS, 'and it is not resolved from the longsword');
  // The rule the constant exists to serve, restated for that weapon rather than for this one.
  assert.ok(PARRY_STAGGER_SECONDS >= latestFollowupStartSeconds() + contact,
    'the authored stagger still covers a follow-up behind a faster blade');
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
  for (let blow = 0; blow < BLOWS_TO_KILL; blow += 1) fighter.takeBodyHit();
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
  for (let blow = 0; blow < BLOWS_TO_KILL; blow += 1) opponent.takeBodyHit();
  const won = judgeDuel({ playerCondition: player, opponentCondition: opponent });
  assert.equal(won.over, true);
  assert.equal(won.winner, 'player');
  assert.equal(won.stage, FIGHTER_CONDITION_STAGE);

  // Both at zero is a real outcome rather than an impossible one - nothing stops two blows landing
  // on the same frame, and calling it for whoever is checked first would be a lie.
  for (let blow = 0; blow < BLOWS_TO_KILL; blow += 1) player.takeBodyHit();
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
