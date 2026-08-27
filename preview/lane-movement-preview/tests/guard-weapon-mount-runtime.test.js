import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuardWeaponMountRuntime } from '../src/combat/guard-weapon-mount-runtime.js';

function vectorStub() {
  return {
    value: null,
    set(x, y, z) { this.value = [x, y, z]; },
  };
}

function weaponStub() {
  return {
    position: vectorStub(),
    rotation: vectorStub(),
    scale: vectorStub(),
  };
}

test('G3.4 Guard weapon mount runtime switches profiles once per state family', () => {
  const weaponObject3d = weaponStub();
  const runtime = createGuardWeaponMountRuntime({
    weaponObject3d,
    profiles: {
      'skyrim-guard-calibrated': {
        position: { x: 1, y: 2, z: 3 },
        rotation: { x: 0.1, y: 0.2, z: 0.3 },
        scale: { x: 1, y: 1, z: 1 },
      },
      'kaykit-default': {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: Math.PI },
        scale: { x: 1, y: 1, z: 1 },
      },
    },
  });

  const guard = runtime.apply('skyrim-guard-calibrated');
  assert.equal(guard.applied, true);
  assert.equal(runtime.currentProfileId, 'skyrim-guard-calibrated');
  assert.deepEqual(weaponObject3d.position.value, [1, 2, 3]);

  const duplicate = runtime.apply('skyrim-guard-calibrated');
  assert.equal(duplicate.applied, false);
  assert.equal(duplicate.reason, 'already-active');
  assert.equal(runtime.applicationCount, 1);

  const counter = runtime.apply('kaykit-default');
  assert.equal(counter.applied, true);
  assert.equal(runtime.currentProfileId, 'kaykit-default');
  assert.deepEqual(weaponObject3d.rotation.value, [0, 0, Math.PI]);
  assert.equal(runtime.applicationCount, 2);
});

test('G3.4 Guard weapon mount runtime rejects unknown profiles', () => {
  const runtime = createGuardWeaponMountRuntime({
    weaponObject3d: weaponStub(),
    profiles: { 'kaykit-default': {} },
  });
  assert.throws(() => runtime.apply('missing'), /Unknown Guard weapon mount profile/);
});
