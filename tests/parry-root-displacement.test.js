import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PARRY_ROOT_DISPLACEMENT_PROFILES,
  PARRY_ROOT_DISPLACEMENT_STAGE,
  createParryRootDisplacementRuntime,
  planParryRootDisplacement,
  sampleParryRootDisplacement,
} from '../src/combat/parry-root-displacement.js';

const BACKWARD = Object.freeze({ x: 0.1, y: -0.35, z: 0.95 });

function rig() {
  const position = {
    x: 0,
    y: 0,
    z: 0,
    set(x, y, z) { this.x = x; this.y = y; this.z = z; },
  };
  return { bones: { root: { position } }, root: { updateMatrixWorld() {} } };
}

test('R18O.1 keeps the defender reaction smaller than the parried attacker', () => {
  const attacker = PARRY_ROOT_DISPLACEMENT_PROFILES.attacker;
  const defender = PARRY_ROOT_DISPLACEMENT_PROFILES.defender;
  assert.ok(defender.peakMeters < attacker.peakMeters);
  assert.ok(defender.maximumPeakMeters < attacker.maximumPeakMeters);
  assert.ok(defender.verticalDropMeters < attacker.verticalDropMeters);
});

test('R18O.1 plans a horizontal backward displacement and rejects unusable input', () => {
  const plan = planParryRootDisplacement({ role: 'attacker', backwardDirection: BACKWARD });
  assert.equal(plan.accepted, true);
  assert.equal(plan.stage, PARRY_ROOT_DISPLACEMENT_STAGE);
  assert.equal(plan.startsAfterDeflectImpulse, true);
  // The vertical component of the incoming direction must not tilt the travel.
  assert.equal(plan.direction.y, 0);
  assert.ok(Math.abs(Math.hypot(plan.direction.x, plan.direction.z) - 1) < 1e-9);
  assert.equal(plan.durationMs, plan.riseMs + plan.holdMs + plan.recoverMs);

  assert.equal(planParryRootDisplacement({ role: 'nobody', backwardDirection: BACKWARD }).accepted, false);
  assert.equal(
    planParryRootDisplacement({ role: 'attacker', backwardDirection: { x: 0, y: 1, z: 0 } }).reason,
    'missing-horizontal-backward-direction',
  );
});

test('R18O.1 holds the off-balance peak before recovering to zero', () => {
  const plan = planParryRootDisplacement({ role: 'attacker', backwardDirection: BACKWARD });
  const at = (ms) => sampleParryRootDisplacement(plan, ms);

  assert.equal(at(0).distanceMeters, 0);
  assert.equal(at(0).phase, 'losing-footing');
  assert.ok(Math.abs(at(plan.riseMs).distanceMeters - plan.peakMeters) < 1e-9);

  const held = at(plan.riseMs + plan.holdMs / 2);
  assert.equal(held.phase, 'off-balance');
  assert.ok(Math.abs(held.distanceMeters - plan.peakMeters) < 1e-9);
  // The peak must outlast a handful of 60fps frames or it reads as a nod.
  assert.ok(plan.holdMs >= 120);

  assert.equal(at(plan.durationMs).distanceMeters, 0);
  assert.equal(at(plan.durationMs).complete, true);
  assert.equal(at(plan.durationMs + 500).distanceMeters, 0);

  // Travel never exceeds the authored peak anywhere in the envelope.
  for (let ms = 0; ms <= plan.durationMs + 60; ms += 7) {
    assert.ok(at(ms).distanceMeters <= plan.peakMeters + 1e-9);
  }
});

test('R18O.1 sinks the root slightly while off balance', () => {
  const plan = planParryRootDisplacement({ role: 'attacker', backwardDirection: BACKWARD });
  const peak = sampleParryRootDisplacement(plan, plan.riseMs);
  assert.ok(peak.offsetMeters.y < 0);
  assert.ok(Math.abs(peak.offsetMeters.y) <= plan.verticalDropMeters + 1e-9);
});

test('R18O.1 writes the root from a captured base so frames cannot accumulate', () => {
  const defenderRig = rig();
  const runtime = createParryRootDisplacementRuntime({ rig: defenderRig });
  assert.equal(runtime.active, false);

  const started = runtime.start({ role: 'defender', backwardDirection: BACKWARD });
  assert.equal(started.accepted, true);

  for (let i = 0; i < 6; i += 1) { runtime.advance(20); runtime.apply(); }
  const afterSixFrames = { ...defenderRig.bones.root.position };
  const expected = sampleParryRootDisplacement(runtime.plan, 120);
  assert.ok(Math.abs(afterSixFrames.z - expected.offsetMeters.z) < 1e-9);

  // Re-applying without advancing must be idempotent, not additive.
  runtime.apply();
  runtime.apply();
  assert.ok(Math.abs(defenderRig.bones.root.position.z - afterSixFrames.z) < 1e-9);

  runtime.reset();
  assert.equal(defenderRig.bones.root.position.x, 0);
  assert.equal(defenderRig.bones.root.position.y, 0);
  assert.equal(defenderRig.bones.root.position.z, 0);
  assert.equal(runtime.active, false);
});

test('R18O.1 returns the root to its base once the envelope completes', () => {
  const attackerRig = rig();
  attackerRig.bones.root.position.set(0.4, 0.9, -1.2);
  const runtime = createParryRootDisplacementRuntime({ rig: attackerRig });
  runtime.start({ role: 'attacker', backwardDirection: BACKWARD });
  const plan = runtime.plan;

  runtime.advance(plan.riseMs); runtime.apply();
  assert.ok(Math.abs(attackerRig.bones.root.position.z - (-1.2 + plan.direction.z * plan.peakMeters)) < 1e-9);

  runtime.advance(plan.durationMs); runtime.apply();
  assert.ok(Math.abs(attackerRig.bones.root.position.x - 0.4) < 1e-9);
  assert.ok(Math.abs(attackerRig.bones.root.position.y - 0.9) < 1e-9);
  assert.ok(Math.abs(attackerRig.bones.root.position.z - (-1.2)) < 1e-9);
  assert.equal(runtime.active, false);
});

test('R18O.1 refuses to plan without a rig root bone', () => {
  const runtime = createParryRootDisplacementRuntime({ rig: { bones: {} } });
  const started = runtime.start({ role: 'attacker', backwardDirection: BACKWARD });
  assert.equal(started.accepted, false);
  assert.equal(started.reason, 'rig-root-bone-unavailable');
});
