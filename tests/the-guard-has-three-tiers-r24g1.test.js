// R24G.1 - the guard has three tiers (#37).
//
// Measured before (desktop emulation, the opponent swinging RIGHT, the raise at TTC 0.147s inside
// the gate's 0.18 -> 0.06s window): a hold from before the swing blocked; a raise inside the window
// with the sector wrong or missing was refused ('parry-input-wrong-direction' / 'unaimed') and
// blocked - on touch the shield button never carries a sector, so a perfectly timed tap could never
// parry; a raise aimed at the answering sector parried, staggered the opponent for a second, and
// the follow-up landed. The grade never read perfect: the intent age handed to the resolver is a
// constant 120ms and perfect needs 75.
//
// The three tiers the person driving asked for, on top of what exists:
//   hold            -> block, as it was (omnidirectional, no stagger)
//   timed raise     -> ASSISTED parry: the system answers the direction, the player answered the
//                      time; a stagger short of the follow-up, so the punish is not guaranteed
//   timed + aimed   -> PERFECT parry: the whole second, the punish guaranteed
// A directional press aimed wrong stays a block (R21C.1). The outcome the presentation and the
// ground read stays 'parry' - the tier is a fact on the confirmation that the duel and the log
// read - so the golden grid, the parry gate and the defence matrix keep their records.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { confirmCommittedParryContact, evaluateCommittedParryInput } from '../src/combat/committed-parry-contact-gate.js';
import { ASSISTED_PARRY_STAGGER_SECONDS, PARRY_STAGGER_SECONDS, createFighterCondition, latestFollowupStartSeconds, MEASURED_CONTACT_SECONDS } from '../src/combat/fighter-condition.js';
import { createDuel } from '../src/game/duel.js';
import { createSwingLedger } from '../src/game/swing-ledger.js';
import { createParryAttemptTally } from '../tools/action-studio/shield-parry-r281/parry-attempt-tally.js';

// A RIGHT swing, committed, 0.12s from contact: inside the window. Answered by the LEFT sector.
const snapshot = { sequence: 7, phase: 'attack_active', elapsedSeconds: 0.31, action: { direction: 'right', runtime: { movementStartSeconds: 0.05, contactSeconds: 0.43 } } };
const press = (aimedSector, extra = {}) => evaluateCommittedParryInput({ attackSnapshot: snapshot, manual: true, aimedSector, ...extra });

test('R24G.1 a raise is assisted when it is timed but not aimed; aimed right it is perfect', () => {
  const unaimed = press(null, { assist: true });
  assert.equal(unaimed.accepted, true);
  assert.equal(unaimed.tier, 'assisted');
  assert.equal(unaimed.answeredSector, 'left', 'the system answers with the sector that meets a RIGHT swing');
  assert.equal(unaimed.gates.assisted, true);
  const misaimed = press('right', { assist: true });
  assert.equal(misaimed.tier, 'assisted', 'a raise aimed at the wrong sector is still a timed raise');
  assert.equal(misaimed.answeredSector, 'left');
  const aimed = press('left', { assist: true });
  assert.equal(aimed.tier, 'perfect');
  assert.equal(aimed.answeredSector, 'left');
  assert.equal(aimed.gates.assisted, false);
});

test('R24G.1 a directional press keeps R21C.1: wrong or missing is refused, right is perfect', () => {
  assert.equal(press(null).accepted, false);
  assert.equal(press(null).reason, 'parry-input-unaimed');
  assert.equal(press('right').reason, 'parry-input-wrong-direction');
  assert.equal(press('right').tier, null);
  assert.equal(press('left').tier, 'perfect');
});

test('R24G.1 assistance cannot buy time: outside the window a raise is still refused', () => {
  const early = evaluateCommittedParryInput({ attackSnapshot: { ...snapshot, elapsedSeconds: 0.1 }, manual: true, assist: true, aimedSector: null });
  assert.equal(early.accepted, false);
  assert.equal(early.tier, null);
  const prompt = evaluateCommittedParryInput({ attackSnapshot: snapshot, manual: false, assist: true, aimedSector: null });
  assert.equal(prompt.tier, null, 'the per-frame window question has no tier, it is not a press');
});

test('R24G.1 the confirmation carries the tier the press earned', () => {
  const armed = press(null, { assist: true });
  const contact = { contact: true, geometricContact: true, eligible: true };
  const confirmed = confirmCommittedParryContact({ armedReport: armed, attackSnapshot: snapshot, contact });
  assert.equal(confirmed.accepted, true);
  assert.equal(confirmed.tier, 'assisted');
  const refused = confirmCommittedParryContact({ armedReport: press('right'), attackSnapshot: snapshot, contact });
  assert.equal(refused.tier, null);
});

test('R24G.1 an assisted parry staggers short of the follow-up; a perfect one covers it', () => {
  const required = latestFollowupStartSeconds() + MEASURED_CONTACT_SECONDS;
  assert.ok(ASSISTED_PARRY_STAGGER_SECONDS < required, `${ASSISTED_PARRY_STAGGER_SECONDS}s must not cover a follow-up landing at ${required.toFixed(3)}s`);
  assert.ok(PARRY_STAGGER_SECONDS >= required);
  const duel = createDuel({ playerCondition: createFighterCondition(), opponentCondition: createFighterCondition() });
  const swinger = createFighterCondition();
  duel.spendExchangeOn('parry', swinger, { tier: 'assisted' });
  assert.ok(Math.abs(swinger.report.staggerRemainingSeconds - ASSISTED_PARRY_STAGGER_SECONDS) < 1e-9);
  const other = createFighterCondition();
  duel.spendExchangeOn('parry', other, { tier: 'perfect' });
  assert.ok(Math.abs(other.report.staggerRemainingSeconds - PARRY_STAGGER_SECONDS) < 1e-9);
  const untiered = createFighterCondition();
  duel.spendExchangeOn('parry', untiered);
  assert.ok(Math.abs(untiered.report.staggerRemainingSeconds - PARRY_STAGGER_SECONDS) < 1e-9, 'no tier reads as it always did');
});

test('R24G.1 the log names the tier', () => {
  const lines = (tier) => {
    const ledger = createSwingLedger();
    ledger.recordSwing({ who: 'opponent', direction: 'right', separationMeters: 2.4 });
    ledger.settle({ outcome: 'parry', tier, separationMeters: 1.95, receiverStaggered: true });
    return ledger.report.lines[0];
  };
  assert.match(lines('assisted'), /你 parry（自動瞄準）（對手暈眩）/);
  assert.match(lines('perfect'), /你完美 parry（對手暈眩）/);
  assert.match(lines(null), /你 parry（對手暈眩）/);
});

test('R24G.1 the tally counts assisted parries inside the successes, so the split survives', () => {
  const tally = createParryAttemptTally();
  tally.recordAttack('right');
  tally.record({ attackDirection: 'right', aimedSector: null, sequence: 1, accepted: true, tier: 'assisted', reason: 'parry-input-armed-awaiting-real-contact', timeToContactSeconds: 0.12 });
  tally.recordAttack('right');
  tally.record({ attackDirection: 'right', aimedSector: 'left', sequence: 2, accepted: true, tier: 'perfect', reason: 'parry-input-armed-awaiting-real-contact', timeToContactSeconds: 0.12 });
  assert.equal(tally.rows.right.armed, 2);
  assert.equal(tally.rows.right.assisted, 1);
  assert.match(tally.summary, /right 2\/2 \(1 自動瞄準\)/);
  assert.match(tally.reportText, /自動瞄準/);
});

test('R24G.1 the entry tells the gate which door the press came through', () => {
  const entry = readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
  assert.match(entry, /return setGuardHeld\(pressed, \{ directional: true \}\)/, 'the sector cells and I/J/L are directional');
  assert.match(entry, /assist: !directional,/, 'a plain raise is assisted');
});
