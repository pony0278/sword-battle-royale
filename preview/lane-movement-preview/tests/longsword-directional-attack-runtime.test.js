import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LONGSWORD_ATTACK_INTERRUPTION_STAGE,
  LONGSWORD_ATTACK_PHASES,
  LONGSWORD_DIRECTIONAL_ATTACK_DEFINITIONS,
  createLongswordDirectionalAttackDefinition,
  createLongswordDirectionalAttackRuntime,
  getLongswordDirectionalAttackProfile,
} from '../src/combat/longsword-directional-attack-runtime.js';

const EXPECTED = Object.freeze({
  top: Object.freeze({ clipId: 'UAL1/Sword_Attack', contactSeconds: 0.43, durationSeconds: 1.533 }),
  right: Object.freeze({ clipId: 'UAL2/Sword_Regular_A', contactSeconds: 0.23, durationSeconds: 0.433 }),
  left: Object.freeze({ clipId: 'UAL2/Sword_Regular_B', contactSeconds: 0.26, durationSeconds: 0.533 }),
});

test('G4.1 canonical directional attacks preserve selected clips and contact timing', () => {
  for (const [direction, expected] of Object.entries(EXPECTED)) {
    const profile = getLongswordDirectionalAttackProfile(direction);
    assert.equal(profile.direction, direction);
    assert.equal(profile.clipId, expected.clipId);
    assert.equal(profile.contactSeconds, expected.contactSeconds);
    assert.equal(profile.durationSeconds, expected.durationSeconds);
    assert.ok(profile.activeStartSeconds < profile.contactSeconds);
    assert.ok(profile.activeEndSeconds > profile.contactSeconds);
    assert.ok(profile.trailStartSeconds <= profile.activeStartSeconds);
    assert.ok(profile.trailEndSeconds >= profile.activeEndSeconds);
  }
});

test('G4.1 attack definition carries direction into ActionDefinition and frame windows', () => {
  for (const direction of Object.keys(EXPECTED)) {
    const action = createLongswordDirectionalAttackDefinition(direction);
    assert.equal(action.direction, direction);
    assert.equal(action.category, 'attack');
    assert.equal(action.animationBinding.clipId, EXPECTED[direction].clipId);
    assert.equal(action.animationBinding.source, direction === 'top' ? 'ual1' : 'ual2');
    assert.equal(action.animationBinding.loop, false);
    assert.equal(action.runtime.rootRotationPolicy, 'lock');
    assert.equal(action.windows.active.length, 1);
    assert.equal(action.windows.weaponTrail.length, 1);
    assert.equal(action.windows.movement.length, 1);
    assert.equal(action.windows.cancel.length, 1);
    const contactFrame = EXPECTED[direction].contactSeconds * action.fps;
    assert.ok(action.windows.active[0].startFrame <= contactFrame);
    assert.ok(action.windows.active[0].endFrame >= contactFrame);
    assert.equal(LONGSWORD_DIRECTIONAL_ATTACK_DEFINITIONS[direction].clipId, action.clipId);
  }
});

test('G4.1 runtime exposes windup, active, recovery and returns to idle', () => {
  const runtime = createLongswordDirectionalAttackRuntime();
  assert.equal(runtime.snapshot.phase, LONGSWORD_ATTACK_PHASES.IDLE);
  const started = runtime.start('right');
  assert.equal(started.accepted, true);
  assert.equal(started.snapshot.phase, LONGSWORD_ATTACK_PHASES.WINDUP);

  const profile = started.snapshot.action.runtime;
  const intoActiveMs = profile.activeStartSeconds * 1000 + 1;
  const active = runtime.update(intoActiveMs);
  assert.equal(active.phase, LONGSWORD_ATTACK_PHASES.ACTIVE);
  assert.equal(active.direction, 'right');

  const pastActiveMs = (profile.activeEndSeconds - active.elapsedSeconds) * 1000 + 1;
  const recovery = runtime.update(pastActiveMs);
  assert.equal(recovery.phase, LONGSWORD_ATTACK_PHASES.RECOVERY);

  const completed = runtime.update(profile.durationSeconds * 1000);
  assert.equal(completed.completed, true);
  assert.equal(completed.direction, 'right');
  assert.equal(runtime.snapshot.phase, LONGSWORD_ATTACK_PHASES.IDLE);
  assert.equal(runtime.snapshot.lastCompleted.direction, 'right');
});

test('G4.1 runtime rejects overlapping attacks', () => {
  const runtime = createLongswordDirectionalAttackRuntime();
  assert.equal(runtime.start('top').accepted, true);
  const rejected = runtime.start('left');
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.reason, 'attack-already-active');
  assert.equal(rejected.snapshot.direction, 'top');
});

test('G4.3B.1 interrupt freezes the active source pose instead of resetting to idle', () => {
  const runtime = createLongswordDirectionalAttackRuntime();
  const started = runtime.start('left');
  const profile = started.snapshot.action.runtime;
  runtime.update(profile.contactSeconds * 1000);

  const interrupted = runtime.interrupt({
    attackSequence: started.snapshot.sequence,
    reason: 'parry',
    outcome: 'parry',
    responseClass: 'parry-directional-recoil',
    contactPoint: { x: 0.1, y: 1.0, z: 0 },
    incomingVelocity: { x: 3, y: -1, z: 2 },
  });

  assert.equal(interrupted.accepted, true);
  assert.equal(interrupted.snapshot.phase, LONGSWORD_ATTACK_PHASES.INTERRUPTED);
  assert.equal(interrupted.snapshot.interruption.stage, LONGSWORD_ATTACK_INTERRUPTION_STAGE);
  assert.equal(interrupted.snapshot.interruption.phaseAtInterrupt, LONGSWORD_ATTACK_PHASES.ACTIVE);
  assert.equal(interrupted.snapshot.interruption.clipId, EXPECTED.left.clipId);
  assert.equal(interrupted.snapshot.interruption.direction, 'left');
  assert.ok(Math.abs(interrupted.snapshot.sourceTimeSeconds - profile.contactSeconds) < 1e-9);
  assert.equal(runtime.active, false);
  assert.equal(runtime.interrupted, true);
});

test('G4.3B.1 update does not advance the frozen source time after interruption', () => {
  const runtime = createLongswordDirectionalAttackRuntime();
  const started = runtime.start('right');
  const profile = started.snapshot.action.runtime;
  runtime.update(profile.contactSeconds * 1000);
  runtime.interrupt({
    attackSequence: started.snapshot.sequence,
    contactPoint: { x: 0, y: 1, z: 0 },
    incomingVelocity: { x: 2, y: 0, z: 1 },
  });

  const before = runtime.snapshot.sourceTimeSeconds;
  const frozen = runtime.update(500);
  assert.equal(frozen.phase, LONGSWORD_ATTACK_PHASES.INTERRUPTED);
  assert.equal(frozen.frozenByInterruption, true);
  assert.equal(frozen.sourceTimeSeconds, before);
  assert.equal(frozen.elapsedSeconds, before);
});

test('G4.3B.1 consumes G4.3A.4 resolution metadata and preserves recoil inputs', () => {
  const runtime = createLongswordDirectionalAttackRuntime();
  const started = runtime.start('top');
  const profile = started.snapshot.action.runtime;
  runtime.update(profile.contactSeconds * 1000);

  const resolution = {
    stage: 'G4.3A.4',
    resolved: true,
    outcome: 'perfect-parry',
    attackSequence: started.snapshot.sequence,
    attacker: {
      interruptAttack: true,
      responseClass: 'perfect-parry-directional-recoil',
    },
    contact: {
      point: { x: 0.12, y: 1.2, z: -0.04 },
      incomingVelocity: { x: 1, y: -5, z: 2 },
      incomingDirection: { x: 1, y: -5, z: 2 },
    },
  };

  const result = runtime.interrupt({ resolution });
  assert.equal(result.accepted, true);
  assert.equal(result.snapshot.interruption.outcome, 'perfect-parry');
  assert.equal(result.snapshot.interruption.responseClass, 'perfect-parry-directional-recoil');
  assert.equal(result.snapshot.interruption.resolutionStage, 'G4.3A.4');
  assert.deepEqual(result.snapshot.interruption.contactPoint, resolution.contact.point);
  assert.deepEqual(result.snapshot.interruption.incomingVelocity, resolution.contact.incomingVelocity);
  assert.ok(Math.abs(Math.hypot(
    result.snapshot.interruption.incomingDirection.x,
    result.snapshot.interruption.incomingDirection.y,
    result.snapshot.interruption.incomingDirection.z,
  ) - 1) < 1e-9);
});

test('G4.3B.1 rejects non-interrupting resolutions, stale sequences and non-active phases', () => {
  const runtime = createLongswordDirectionalAttackRuntime();
  const started = runtime.start('top');

  const noInterrupt = runtime.interrupt({
    resolution: {
      resolved: false,
      attackSequence: started.snapshot.sequence,
      attacker: { interruptAttack: false },
    },
  });
  assert.equal(noInterrupt.accepted, false);
  assert.equal(noInterrupt.reason, 'resolution-does-not-interrupt');

  const stale = runtime.interrupt({
    attackSequence: started.snapshot.sequence + 1,
  });
  assert.equal(stale.accepted, false);
  assert.equal(stale.reason, 'attack-sequence-mismatch');

  const windup = runtime.interrupt({
    attackSequence: started.snapshot.sequence,
  });
  assert.equal(windup.accepted, false);
  assert.equal(windup.reason, 'attack-not-active');
});

test('G4.3B.1 interruption can be handed off explicitly and preserves lastInterrupted', () => {
  const runtime = createLongswordDirectionalAttackRuntime();
  const started = runtime.start('right');
  const profile = started.snapshot.action.runtime;
  runtime.update(profile.contactSeconds * 1000);
  runtime.interrupt({
    attackSequence: started.snapshot.sequence,
    outcome: 'block',
    responseClass: 'blocked-weapon-bounce',
  });

  const rejectedStart = runtime.start('left');
  assert.equal(rejectedStart.accepted, false);
  assert.equal(rejectedStart.reason, 'attack-interruption-pending-handoff');

  const handoff = runtime.releaseInterruption();
  assert.equal(handoff.accepted, true);
  assert.equal(handoff.released.outcome, 'block');
  assert.equal(runtime.snapshot.phase, LONGSWORD_ATTACK_PHASES.IDLE);
  assert.equal(runtime.snapshot.lastInterrupted.outcome, 'block');

  const next = runtime.start('left');
  assert.equal(next.accepted, true);
  assert.equal(next.snapshot.sequence, started.snapshot.sequence + 1);
});
