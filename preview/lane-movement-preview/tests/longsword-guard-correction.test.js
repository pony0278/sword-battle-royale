import test from 'node:test';
import assert from 'node:assert/strict';
import { LONGSWORD_GUARD_AUTHORING_STATE } from '../src/combat/longsword-guard-metadata.js';
import {
  buildGuardQuaternionOffsets,
  createGuardAuthoringExport,
  normalizeQuaternionArray,
  quaternionAngleDegrees,
  quaternionFromEulerDegrees,
  validateGuardQuaternionOffsets,
} from '../src/combat/longsword-guard-correction.js';

test('G2.5.1 quaternion helpers preserve identity and XYZ authoring semantics', () => {
  assert.deepEqual(normalizeQuaternionArray([0, 0, 0, 0]), [0, 0, 0, 1]);
  assert.ok(quaternionAngleDegrees(quaternionFromEulerDegrees({ x: 10, y: 0, z: 0 })) > 9.999);
  assert.ok(quaternionAngleDegrees(quaternionFromEulerDegrees({ x: 10, y: 0, z: 0 })) < 10.001);
});

test('G2.5.1 accepts in-budget right-arm correction offsets', () => {
  const offsets = buildGuardQuaternionOffsets({
    'upperarm.r': { x: 20, y: 0, z: 0 },
    'lowerarm.r': { x: 0, y: -30, z: 0 },
    'wrist.r': { x: 0, y: 0, z: 45 },
    'handslot.r': { x: 0, y: 10, z: 0 },
  });
  const result = validateGuardQuaternionOffsets(offsets);
  assert.equal(result.valid, true);
  assert.deepEqual(result.overBudget, []);
});

test('G2.5.1 rejects over-budget or forbidden corrections', () => {
  const overBudget = validateGuardQuaternionOffsets(buildGuardQuaternionOffsets({
    'handslot.r': { x: 30, y: 0, z: 0 },
  }));
  assert.equal(overBudget.valid, false);
  assert.deepEqual(overBudget.overBudget, ['handslot.r']);

  const forbidden = validateGuardQuaternionOffsets({
    hips: quaternionFromEulerDegrees({ x: 5 }),
  });
  assert.equal(forbidden.valid, false);
  assert.deepEqual(forbidden.invalidBones, ['hips']);
});

test('G2.5.1 canonical metadata offsets are within every correction budget', () => {
  const result = validateGuardQuaternionOffsets(LONGSWORD_GUARD_AUTHORING_STATE.offsets);
  assert.equal(result.valid, true);
  assert.deepEqual(result.invalidBones, []);
  assert.deepEqual(result.overBudget, []);
  const byBone = Object.fromEntries(result.entries.map((entry) => [entry.bone, entry]));
  assert.ok(byBone.chest.angleDegrees <= 8 + 1e-6);
  assert.ok(byBone['upperarm.r'].angleDegrees <= 40 + 1e-6);
  assert.ok(byBone['lowerarm.r'].angleDegrees <= 50 + 1e-6);
  assert.ok(byBone['wrist.r'].angleDegrees <= 65 + 1e-6);
  assert.ok(byBone['handslot.r'].angleDegrees <= 15 + 1e-6);
});

test('G2.5.1 exported Euler provenance reproduces canonical quaternion offsets', () => {
  const rebuilt = buildGuardQuaternionOffsets(LONGSWORD_GUARD_AUTHORING_STATE.eulerDegrees);
  for (const [bone, expected] of Object.entries(LONGSWORD_GUARD_AUTHORING_STATE.offsets)) {
    const actual = rebuilt[bone];
    assert.equal(actual.length, 4);
    for (let index = 0; index < 4; index += 1) {
      assert.ok(Math.abs(actual[index] - expected[index]) < 1e-10, `${bone}[${index}] must reproduce canonical quaternion`);
    }
  }
});

test('G2.5.1 export remains explicitly local-quaternion based', () => {
  const output = createGuardAuthoringExport({
    'upperarm.r': { x: 10, y: -5, z: 3 },
  }, { source: 'authoring-lab' });
  assert.equal(output.authored, true);
  assert.equal(output.baseSample, 0.5);
  assert.equal(output.offsets['upperarm.r'].length, 4);
  assert.equal(output.diagnostics.source, 'authoring-lab');
});
