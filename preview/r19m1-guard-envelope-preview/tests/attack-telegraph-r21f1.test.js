import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ATTACK_TELEGRAPH_PROFILE,
  MEASURED_TELEGRAPH_HOLDS,
  MEASURED_WINDUP_CONVERGENCE,
  planAttackTelegraph,
  telegraphDurationMs,
  telegraphHoldFor,
} from '../src/combat/attack-telegraph.js';
import { OPPONENT_DRIVE_PROFILE } from '../src/combat/opponent-drive.js';
import { LONGSWORD_ATTACK_DIRECTIONS, LONGSWORD_DIRECTIONAL_ATTACKS } from '../src/combat/longsword-directional-metadata.js';
import { getAttackTimeWarp, warpRuntimeToSource } from '../src/combat/attack-time-warp.js';

const DIRS = ['top', 'right', 'left'];
const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('R21F.1 records why a stance is needed: the swings converge inside the parry window', () => {
  const c = MEASURED_WINDUP_CONVERGENCE;
  // 0.279m apart at their worst, which lands just BEFORE the earliest window opens - and they are
  // still only 0.401m apart on the first frame inside it. Either way the player is asked for a
  // direction while there is nothing to read.
  assert.ok(c.worstPairMeters < 0.3);
  assert.ok(c.worstMomentMs < c.parryWindowMs.earliest, 'the blur is already there when the window opens');
  assert.ok(c.pairAtEarliestWindowMeters < 0.5, 'and has barely cleared by then');
  assert.ok(c.worstMomentMs < c.parryWindowMs.latest);
});

test('R21F.1 every held pose is unmistakable against the other two and against idle', () => {
  const holds = MEASURED_TELEGRAPH_HOLDS;
  for (const a of DIRS) {
    assert.ok(gap(holds[a].tip, holds.idleTip) >= holds.worstVersusIdleMeters - 1e-9, `${a} vs idle`);
    for (const b of DIRS) {
      if (a === b) continue;
      assert.ok(gap(holds[a].tip, holds[b].tip) >= holds.worstPairMeters - 1e-9, `${a} vs ${b}`);
    }
  }
  // Comfortably clearer than the blur the stance exists to replace, and than the window's own.
  assert.ok(holds.worstPairMeters > MEASURED_WINDUP_CONVERGENCE.worstPairMeters * 2.5);
  assert.ok(holds.worstPairMeters > MEASURED_WINDUP_CONVERGENCE.pairAtEarliestWindowMeters * 2);
});

test('R21F.1 TOP is the direction that needed a later frame', () => {
  const holds = MEASURED_TELEGRAPH_HOLDS;
  // RIGHT and LEFT hold their own first frame, so their swing continues from exactly the pose
  // being held - no snap at all. Only TOP pays a settle, because its first frame is 0.199m from
  // idle and holding it would have announced nothing.
  assert.equal(holds.right.metersToAttackEntry, 0);
  assert.equal(holds.left.metersToAttackEntry, 0);
  assert.ok(holds.top.metersToAttackEntry > 0);
  assert.equal(holds.top.metersToAttackEntry, holds.worstSnapIntoSwingMeters);
  assert.ok(holds.top.runtimeSeconds > holds.right.runtimeSeconds);
  assert.ok(holds.top.runtimeSeconds > holds.left.runtimeSeconds);
});

test('R21F.1 the held source times are the runtime holds converted through the time warp', () => {
  for (const direction of DIRS) {
    const hold = MEASURED_TELEGRAPH_HOLDS[direction];
    const expected = warpRuntimeToSource(hold.runtimeSeconds, getAttackTimeWarp(direction));
    assert.ok(Math.abs(hold.sourceSeconds - expected) < 0.002, `${direction}: ${hold.sourceSeconds} vs ${expected}`);
  }
  // RIGHT is the one where the two differ, because R21B.1 stretches its opening.
  assert.notEqual(MEASURED_TELEGRAPH_HOLDS.right.sourceSeconds, MEASURED_TELEGRAPH_HOLDS.right.runtimeSeconds);
  assert.equal(MEASURED_TELEGRAPH_HOLDS.top.sourceSeconds, MEASURED_TELEGRAPH_HOLDS.top.runtimeSeconds);
});

test('R21F.1 the stance fits inside the opponent\'s shortest rest, so the fight does not slow down', () => {
  assert.ok(telegraphDurationMs() <= OPPONENT_DRIVE_PROFILE.restIntervalMs.minimum);
});

test('R21F.1 the phases run in order and end released', () => {
  const p = ATTACK_TELEGRAPH_PROFILE;
  const seen = [];
  for (let ms = 0; ms <= telegraphDurationMs(); ms += 10) {
    const plan = planAttackTelegraph({ direction: 'top', elapsedMs: ms });
    if (seen[seen.length - 1] !== plan.phase) seen.push(plan.phase);
    assert.ok(plan.weight >= 0 && plan.weight <= 1);
  }
  assert.deepEqual(seen, ['blend-in', 'hold', 'settle', 'done']);
  assert.equal(planAttackTelegraph({ direction: 'top', elapsedMs: 0 }).weight, 0, 'starts on the idle pose');
  assert.equal(planAttackTelegraph({ direction: 'top', elapsedMs: p.blendInMs }).weight, 1, 'fully held');
  const released = planAttackTelegraph({ direction: 'top', elapsedMs: telegraphDurationMs() });
  assert.equal(released.released, true);
  assert.equal(released.weight, 0, 'and hands the rig back before the swing starts');
});

test('R21F.1 the stance names its own attack\'s clip', () => {
  for (const direction of LONGSWORD_ATTACK_DIRECTIONS) {
    const plan = planAttackTelegraph({ direction, elapsedMs: 0 });
    assert.equal(plan.clipId, LONGSWORD_DIRECTIONAL_ATTACKS[direction].clipId, direction);
    assert.equal(plan.sourceSeconds, MEASURED_TELEGRAPH_HOLDS[direction].sourceSeconds);
  }
});

test('R21F.1 an unknown direction releases immediately rather than freezing the attacker', () => {
  for (const bad of [null, undefined, '', 'up', 'TOP ']) {
    const plan = planAttackTelegraph({ direction: bad, elapsedMs: 0 });
    assert.equal(plan.released, true, String(bad));
    assert.equal(plan.weight, 0);
    assert.equal(plan.direction, null);
  }
  assert.equal(telegraphHoldFor('nope'), null);
});

test('R21F.1 the drive waits for the stance, holds its direction, and abandons it if the swing cannot happen', () => {
  const controller = readFileSync(new URL('../tools/action-studio/shield-parry-r281/opponent-drive-controller.js', import.meta.url), 'utf8');
  // The swing must come from the stance's direction, never from a fresh look at the bag - the pose
  // the player read has to be a promise about the attack that follows it.
  assert.ok(controller.includes('startAttack(telegraph.report.direction)'));
  assert.ok(controller.includes('if (!plan.attackAvailableNow || !plan.inBand) { telegraph.clear(); return plan; }'));
  assert.ok(controller.includes('if (plan.attack) telegraph.begin(plan.attack);'));
  // Switching the opponent off must not leave a stance frozen on screen.
  assert.ok(controller.includes('if (!enabled()) telegraph?.clear();'));
});

test('R21F.1 the stance writes after the attacker\'s base pose, and owns nothing else', () => {
  const entry = readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
  const baseAt = entry.indexOf('sampleAttackerBase(snapshot, deltaMs);');
  const teleAt = entry.indexOf('attackTelegraph.sample(rawDeltaMs);');
  assert.ok(baseAt > 0 && teleAt > baseAt, 'it mixes OVER the idle pose, so it must write later');
  // Comments are prose and may name what the module refuses to touch; only the code is checked.
  const code = readFileSync(new URL('../src/game/attack-telegraph-runtime.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');
  for (const forbidden of ['startAttack', 'parryGate', 'guardMachine', 'Contact', 'resolve', 'exchangeState']) {
    assert.ok(!code.includes(forbidden), `the telegraph must not reach into ${forbidden}`);
  }
  // And it may only import the pure planner: a presentation module that reached for a runtime
  // would stop being one, whatever its identifiers were called.
  const imports = [...code.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(imports, ['../combat/attack-telegraph.js']);
});
