// R24B.1 — step 6c: the opponent circles (#30).
//
// Measured before this existed: the player's sidestep at 0.75 m/s orbits the opponent at 18 deg/s
// at 2.4m, both base facings track the bearing at 180 deg/s with 0.0 deg of error, and from 1.29m
// off the axis all three of the opponent's directions still land. The geometry is symmetric, so
// the opponent's sidestep is the same ledger verb mirrored, driven by a seeded draw in the rest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEngagementGround } from '../src/combat/engagement-ground.js';
import { OPPONENT_DRIVE_PROFILE, drawCircle, planOpponentDrive } from '../src/combat/opponent-drive.js';
import { createOpponentDriveRuntime } from '../src/game/opponent-drive-runtime.js';
import { createOpponentGuardRuntime } from '../src/game/opponent-guard-runtime.js';
import { createOpponentDriveController } from '../tools/action-studio/shield-parry-r281/opponent-drive-controller.js';

test('R24B.1 the attacker\'s sidestep mirrors the defender\'s: their own right is -x (the defender\'s is +x), and it orbits', () => {
  const theirs = createEngagementGround({ startSeparationMeters: 2.4 });
  const ours = createEngagementGround({ startSeparationMeters: 2.4 });
  for (let i = 0; i < 60; i += 1) { theirs.moveAttackerLateral(0.0125); ours.moveDefenderLateral(0.0125); }
  assert.ok(Math.abs(theirs.report.attackerLateralMeters + 0.738) < 0.01, `${theirs.report.attackerLateralMeters}`);
  assert.ok(Math.abs(ours.report.defenderLateralMeters - 0.738) < 0.01, 'the mirror image of the same arc');
  assert.ok(Math.abs(theirs.report.separationMeters - 2.4) < 0.01, 'circling, not sliding away: the range is kept');
  assert.ok(Math.abs(theirs.report.separationMeters - ours.report.separationMeters) < 1e-9);
  assert.equal(theirs.report.defenderLateralMeters, 0, 'the other one did not move');
  assert.equal(createEngagementGround({ startSeparationMeters: 2.4 }).moveAttackerLateral(0).attackerLateralMeters, 0);
});

test('R24B.1 the sidestep lives in the rest only: never while correcting spacing, under a swing, mid-exchange, or attacking', () => {
  const resting = { separationMeters: 2.4, attackAvailable: true, restedMs: 0, restTargetMs: 9999, nextDirection: 'top', circleSide: -1 };
  assert.deepEqual([planOpponentDrive(resting).lateralIntent, planOpponentDrive(resting).reason], [-1, 'circling-left']);
  assert.deepEqual([planOpponentDrive({ ...resting, circleSide: 1 }).lateralIntent, planOpponentDrive({ ...resting, circleSide: 1 }).reason], [1, 'circling-right']);
  assert.equal(planOpponentDrive({ ...resting, circleSide: 0 }).reason, 'resting');
  assert.equal(planOpponentDrive({ ...resting, separationMeters: 1.9, repositioning: true }).lateralIntent, 0, 'the walk-back has the feet');
  assert.equal(planOpponentDrive({ ...resting, underSwing: true }).lateralIntent, 0, 'R24A.1 holds the ground');
  assert.equal(planOpponentDrive({ ...resting, attackAvailable: false }).lateralIntent, 0, 'their own exchange');
  const rested = { ...resting, restedMs: 9999, restTargetMs: 0 };
  assert.equal(planOpponentDrive(rested).attack, null, 'a running circle holds the blade: the walk finishes first');
  assert.equal(planOpponentDrive({ ...rested, circleSide: 0 }).attack, 'top');
  assert.equal(planOpponentDrive({ ...rested, circleSide: 0 }).lateralIntent, 0, 'no sidestep on the frame of the swing');
});

test('R24B.1 a rest draws its circle from the seed, bounded by the profile, and the swing ends it', () => {
  const drawn = [];
  for (let seed = 1; seed <= 200; seed += 1) {
    let calls = 0; const random = () => { calls += 1; return ((seed * 9301 + calls * 49297) % 233280) / 233280; };
    const circle = drawCircle(random, OPPONENT_DRIVE_PROFILE);
    assert.equal(calls, 3, 'three draws whatever the coin says - a seed replays the same walk');
    if (circle) drawn.push(circle);
  }
  assert.ok(drawn.length > 60 && drawn.length < 140, `${drawn.length} of 200 walked (chance 0.5)`);
  assert.ok(drawn.some((c) => c.side === -1) && drawn.some((c) => c.side === 1));
  assert.ok(drawn.every((c) => c.durationMs >= 400 && c.durationMs <= 1000));
  assert.equal(drawCircle(null), null, 'no generator, no walk - never a silent drift');
  assert.equal(drawCircle(() => 0.1, { circle: { chance: 0 } }), null);

  const runtime = createOpponentDriveRuntime({ seed: 5, profile: { circle: { chance: 1, durationMs: { minimum: 300, maximum: 300 } } } });
  const step = (extra = {}) => runtime.frame({ deltaMs: 100, separationMeters: 2.4, attackAvailable: true, ...extra });
  const intents = [step().lateralIntent, step().lateralIntent, step().lateralIntent, step().lateralIntent];
  assert.ok(Math.abs(intents[0]) === 1 && intents[0] === intents[1] && intents[1] === intents[2], `${intents}`);
  assert.equal(intents[3], 0, '300ms of walk in three 100ms frames, then the rest is a rest');
  const again = createOpponentDriveRuntime({ seed: 5, profile: { circle: { chance: 1, durationMs: { minimum: 300, maximum: 300 } } } });
  again.frame({ deltaMs: 100, separationMeters: 2.4, attackAvailable: true, underSwing: true });
  assert.equal(again.report.lateralIntent, 0, 'held under the swing');
  assert.equal(again.report.circle.remainingMs, 300, 'and the circle waits rather than being eaten');
  again.commit('top');
  assert.equal(again.report.circle, null, 'the swing ends the walk');
  // Arriving back in the band draws one too - measured: without this, one circle in 12 seconds.
  // The gate's own draw is spent first (300ms in three frames, in band), so what follows can only
  // come from the arrival: walk out of band, walk back, and the circle is there again.
  const arriving = createOpponentDriveRuntime({ seed: 5, profile: { circle: { chance: 1, durationMs: { minimum: 300, maximum: 300 } } } });
  for (let i = 0; i < 4; i += 1) arriving.frame({ deltaMs: 100, separationMeters: 2.4, attackAvailable: true });
  assert.equal(arriving.report.circle, null, 'the gate\'s circle is spent');
  arriving.frame({ deltaMs: 100, separationMeters: 1.9, attackAvailable: true });
  assert.equal(arriving.report.reason, 'backing-off-to-band');
  arriving.frame({ deltaMs: 100, separationMeters: 2.4, attackAvailable: true }); // arrives; the draw lands after this frame's plan
  assert.ok(arriving.report.circle, 'a circle was drawn on arrival');
  arriving.frame({ deltaMs: 100, separationMeters: 2.4, attackAvailable: true });
  assert.ok(Math.abs(arriving.report.lateralIntent) === 1, `arrived, and circling: ${arriving.report.reason}`);
});

test('R24B.1 the drive hands the lane the sidestep through the same verb shape as the walk', () => {
  const laterals = [];
  const controller = createOpponentDriveController({
    toggle: { checked: true },
    laneController: { report: { separationMeters: 2.4 }, setAttackerIntent() {}, setAttackerLateralIntent: (v) => laterals.push(v) },
    startAttack: () => false,
    readAttackAvailable: () => true,
    runtime: createOpponentDriveRuntime({ seed: 5, profile: { circle: { chance: 1, durationMs: { minimum: 300, maximum: 300 } }, restIntervalMs: { minimum: 5000, maximum: 5000 } } }),
    guardRuntime: createOpponentGuardRuntime({ seed: 3, profile: { coverChance: 0, parryChance: 0, reactionSeconds: 0.18, parryArmTtcSeconds: 0.12, restSector: 'top' } }),
    readThreat: () => null, readOwnSwinging: () => false, applyGuard: () => {}, applyParry: () => {},
  });
  controller.frame(100); controller.frame(100); controller.frame(100); controller.frame(100);
  assert.equal(laterals.length, 4);
  assert.ok(Math.abs(laterals[0]) === 1 && laterals[3] === 0, `${laterals}`);
  // The lane's side of the verb, read rather than run (the walk needs a scene): the sidestep is on
  // the swing lock and the attacker's stride is turned along the whole travel, as the defender's is.
  const lane = readFileSync(new URL('../src/game/lane-controller.js', import.meta.url), 'utf8');
  assert.match(lane, /intent: feetLockedFor\('attacker'\) \? 0 : attackerLateralIntent, deltaSeconds,\n\s*\}\);\n\s*if \(attackerLateral\.meters !== 0\) ground\.moveAttackerLateral\(attackerLateral\.meters\);/);
  assert.match(lane, /applyTravelYawToLegs\(labScene\.attacker, lastAttackerTravelPlan\);/);
});
