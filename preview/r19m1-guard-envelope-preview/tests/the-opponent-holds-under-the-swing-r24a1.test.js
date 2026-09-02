// R24A.1 — the opponent holds their ground under a swing (#29).
//
// Measured before this existed (whiff-walk probe, block mode, drive on): in 21 of 21 player swings
// the opponent backed away 0.26-0.48m (mean 0.35m) inside the 0.43s before contact. The swing's
// own advance had pushed the separation inside the band and the drive read that as spacing to
// correct. TOP's 0.86m of advance netted 0.38m, and a swing the shield had not read fell 0.39-0.62m
// short of the body. With the feet held for the swing the retreat measured 0.09m at most.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planOpponentDrive } from '../src/combat/opponent-drive.js';
import { createOpponentDriveRuntime } from '../src/game/opponent-drive-runtime.js';
import { createOpponentGuardRuntime } from '../src/game/opponent-guard-runtime.js';
import { createOpponentDriveController } from '../tools/action-studio/shield-parry-r281/opponent-drive-controller.js';

const tooClose = { separationMeters: 1.9, attackAvailable: true, restedMs: 9999, restTargetMs: 0, nextDirection: 'top', repositioning: true };

test('R24A.1 under a swing the feet stop and the blade waits, whatever the spacing says', () => {
  const walking = planOpponentDrive(tooClose);
  assert.equal(walking.intent, 1, 'the R21E.1 walk-back, still there when nothing is coming');
  assert.equal(walking.reason, 'backing-off-to-band');
  const held = planOpponentDrive({ ...tooClose, underSwing: true });
  assert.equal(held.intent, 0);
  assert.equal(held.attack, null, 'no swing into a swing');
  assert.equal(held.reason, 'holding-under-the-swing');
  assert.equal(held.repositioning, true, 'the spacing error is remembered, not forgotten - the walk resumes after');
  assert.equal(held.underSwing, true);
  // And a rested, in-band opponent with a direction served does not swing under a swing either.
  const ready = { separationMeters: 2.4, attackAvailable: true, restedMs: 9999, restTargetMs: 0, nextDirection: 'left' };
  assert.equal(planOpponentDrive(ready).attack, 'left');
  assert.equal(planOpponentDrive({ ...ready, underSwing: true }).attack, null);
  assert.equal(planOpponentDrive({ ...ready, underSwing: 'yes' }).attack, 'left', 'only the boolean holds');
});

test('R24A.1 the runtime carries the word to the planner and back out in its report', () => {
  const runtime = createOpponentDriveRuntime({ seed: 7 });
  const held = runtime.frame({ deltaMs: 16, separationMeters: 1.9, attackAvailable: true, underSwing: true });
  assert.equal(held.intent, 0);
  assert.equal(runtime.report.reason, 'holding-under-the-swing');
  assert.equal(runtime.report.underSwing, true);
  const free = runtime.frame({ deltaMs: 16, separationMeters: 1.9, attackAvailable: true });
  assert.equal(free.intent, 1, 'the swing over, the walk-back resumes on the next frame');
  assert.equal(runtime.report.underSwing, false);
});

test('R24A.1 the drive reads the threat once and hands the lane a zero step while it is live', () => {
  const intents = [];
  let threat = null;
  const controller = createOpponentDriveController({
    toggle: { checked: true },
    laneController: { report: { separationMeters: 1.9 }, setAttackerIntent: (intent) => intents.push(intent) },
    startAttack: () => false,
    readAttackAvailable: () => false,
    guardRuntime: createOpponentGuardRuntime({ seed: 3, profile: { coverChance: 0, parryChance: 0, reactionSeconds: 0.18, parryArmTtcSeconds: 0.12, restSector: 'top' } }),
    readThreat: () => threat,
    readOwnSwinging: () => false,
    applyGuard: () => {},
    applyParry: () => {},
  });
  controller.frame(16);
  threat = { active: true, sequence: 1, elapsedSeconds: 0.1, direction: 'top', timeToContactSeconds: 0.33 }; controller.frame(16); controller.frame(16);
  assert.equal(controller.report.reason, 'holding-under-the-swing');
  threat = null; controller.frame(16);
  assert.deepEqual(intents, [1, 0, 0, 1], 'walking back, held for the two frames of the swing, walking back again');
  assert.equal(controller.report.underSwing, false);
});
