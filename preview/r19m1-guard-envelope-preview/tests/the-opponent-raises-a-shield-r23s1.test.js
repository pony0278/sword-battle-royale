import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  OPPONENT_GUARD_PROFILE,
  OPPONENT_GUARD_REASONS,
  decideOpponentGuard,
  planOpponentGuard,
} from '../src/combat/opponent-guard.js';
import { createOpponentGuardRuntime } from '../src/game/opponent-guard-runtime.js';
import { createOpponentDriveController } from '../tools/action-studio/shield-parry-r281/opponent-drive-controller.js';
import { MEASURED_CONTACT_SECONDS } from '../src/combat/fighter-condition.js';

// R23S.1 - the opponent raises a shield (step 6a).
//
// Measured before: the attacker fighter owned every guard runtime and nothing pressed its guard;
// the player's engagement had `guardActive: false` written in by hand. A block is geometric and
// gated by one read, so an opponent who blocks is one who HOLDS at the right moment. Measured
// after, on the page with the drive on: every swing the roll decided to block resolved `block`
// and cost no health; every swing it let through landed or missed on reach alone.

const src = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const threatAt = (elapsedSeconds, sequence = 1) => ({ active: true, sequence, elapsedSeconds });

test('R23S.1 the reaction beats the blade: a shield raised at the profile\'s reaction is up before contact', () => {
  // enterGuard advances the presentation 180ms in one frame, so the shield is HOLD the frame the
  // reaction fires; what has to be true is that the reaction itself comes before the contact.
  assert.ok(OPPONENT_GUARD_PROFILE.reactionSeconds < MEASURED_CONTACT_SECONDS,
    `reaction ${OPPONENT_GUARD_PROFILE.reactionSeconds} vs contact ${MEASURED_CONTACT_SECONDS}`);
  assert.ok(OPPONENT_GUARD_PROFILE.blockChance > 0 && OPPONENT_GUARD_PROFILE.blockChance < 1, 'a wall is not an opponent, and neither is a target');
});

test('R23S.1 one roll per swing decides whether this one is blocked', () => {
  let next = 0.1;
  const random = () => next;
  assert.equal(decideOpponentGuard(random, { blockChance: 0.6, reactionSeconds: 0.18 }).willBlock, true);
  next = 0.9;
  assert.equal(decideOpponentGuard(random, { blockChance: 0.6, reactionSeconds: 0.18 }).willBlock, false);
  assert.equal(decideOpponentGuard(null, { blockChance: 0.6, reactionSeconds: 0.18 }).willBlock, false, 'no generator, no block - never a silent wall');
});

test('R23S.1 the plan: seen, then reacting, then shield up, then down after the swing; never while swinging', () => {
  const profile = { reactionSeconds: 0.18, blockChance: 1, holdAfterSwingSeconds: 0.25 };
  const blocks = { willBlock: true, reactionSeconds: 0.18 };
  assert.deepEqual(pick(planOpponentGuard({ threat: threatAt(0.05), decision: null, profile })), [false, OPPONENT_GUARD_REASONS.UNDECIDED]);
  assert.deepEqual(pick(planOpponentGuard({ threat: threatAt(0.05), decision: blocks, profile })), [false, OPPONENT_GUARD_REASONS.REACTING]);
  assert.deepEqual(pick(planOpponentGuard({ threat: threatAt(0.18), decision: blocks, profile })), [true, OPPONENT_GUARD_REASONS.BLOCKING]);
  assert.deepEqual(pick(planOpponentGuard({ threat: threatAt(0.42), decision: blocks, profile })), [true, OPPONENT_GUARD_REASONS.BLOCKING]);
  assert.deepEqual(pick(planOpponentGuard({ threat: null, decision: blocks, sinceThreatEndedSeconds: 0.1, profile })), [true, OPPONENT_GUARD_REASONS.LOWERING]);
  assert.deepEqual(pick(planOpponentGuard({ threat: null, decision: blocks, sinceThreatEndedSeconds: 0.3, profile })), [false, OPPONENT_GUARD_REASONS.NO_THREAT]);
  assert.deepEqual(pick(planOpponentGuard({ threat: threatAt(0.42), decision: { willBlock: false, reactionSeconds: 0.18 }, profile })), [false, OPPONENT_GUARD_REASONS.DECLINED]);
  assert.deepEqual(pick(planOpponentGuard({ threat: threatAt(0.42), decision: blocks, ownSwinging: true, profile })), [false, OPPONENT_GUARD_REASONS.SWINGING]);
  assert.deepEqual(pick(planOpponentGuard({})), [false, OPPONENT_GUARD_REASONS.NO_THREAT]);
  function pick(plan) { return [plan.hold, plan.reason]; }
});

test('R23S.1 the runtime rolls once per swing sequence, remembers it, and the same seed replays the same answers', () => {
  const run = (seed) => {
    const runtime = createOpponentGuardRuntime({ seed, profile: { blockChance: 0.5, reactionSeconds: 0, holdAfterSwingSeconds: 0.2 } });
    const answers = [];
    for (let sequence = 1; sequence <= 12; sequence += 1) {
      runtime.frame({ deltaMs: 16, threat: threatAt(0.1, sequence) });
      const first = runtime.plan.hold;
      runtime.frame({ deltaMs: 16, threat: threatAt(0.3, sequence) });
      assert.equal(runtime.plan.hold, first, 'a swing is not re-rolled mid-swing');
      answers.push(first);
      runtime.frame({ deltaMs: 400, threat: null });
    }
    return { answers, report: runtime.report };
  };
  const a = run(7); const b = run(7); const c = run(8);
  assert.deepEqual(a.answers, b.answers);
  assert.notDeepEqual(a.answers, c.answers);
  assert.equal(a.report.swingsSeen, 12);
  assert.equal(a.report.swingsBlocked, a.answers.filter(Boolean).length);
  assert.ok(a.report.swingsBlocked > 0 && a.report.swingsBlocked < 12, `${a.report.swingsBlocked} of 12`);
});

test('R23S.1 the drive hands the lab one verb - hold or not - and reseeds the shield with the walk', () => {
  const held = [];
  let threat = null;
  const controller = createOpponentDriveController({
    toggle: { checked: true },
    laneController: { report: { separationMeters: 2.4 }, setAttackerIntent() {} },
    startAttack: () => false,
    readAttackAvailable: () => false,
    guardRuntime: createOpponentGuardRuntime({ seed: 3, profile: { blockChance: 1, reactionSeconds: 0, holdAfterSwingSeconds: 0 } }),
    readThreat: () => threat,
    readOwnSwinging: () => false,
    applyGuardHeld: (h) => held.push(h),
  });
  controller.frame(16);
  threat = threatAt(0.2, 1); controller.frame(16);
  threat = null; controller.frame(16);
  assert.deepEqual(held, [false, true, false]);
  assert.equal(controller.guardReport.swingsSeen, 1);
  controller.reseed(9);
  assert.equal(controller.guardReport.seed, 9);
  assert.equal(controller.guardReport.swingsSeen, 0);
  assert.match(controller.summary, /盾[↑↓] 擋 0\/0/);
});

test('R23S.1 the lab reads the opponent\'s stance instead of writing it in, and drops the shield to swing', () => {
  // Composition of the browser entry, read rather than run.
  const entry = src('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js');
  assert.match(entry, /stanceReport: attackerFighter\.stance\.report, lateGuardRaise: false,/);
  assert.match(entry, /readGuardActive: \(\) => attackerFighter\.stance\.report\.guardActive === true,/);
  assert.match(entry, /selectedDirection = direction;\n\s*syncOpponentGuard\(false\);/);
  assert.doesNotMatch(entry, /stanceReport: \{ guardActive: false \}/);
});
