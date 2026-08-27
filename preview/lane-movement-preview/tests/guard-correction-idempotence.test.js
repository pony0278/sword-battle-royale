import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyGuardQuaternionOffsetsWeighted,
  quaternionFromEulerDegrees,
  resetGuardQuaternionOffsetRuntime,
} from '../src/combat/longsword-guard-correction.js';

class FakeQuaternion {
  constructor(x = 0, y = 0, z = 0, w = 1) { this.set(x, y, z, w); }
  set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
  fromArray(value) { return this.set(value[0], value[1], value[2], value[3]); }
  clone() { return new FakeQuaternion(this.x, this.y, this.z, this.w); }
  copy(value) { return this.set(value.x, value.y, value.z, value.w); }
  normalize() {
    const length = Math.hypot(this.x, this.y, this.z, this.w) || 1;
    this.x /= length; this.y /= length; this.z /= length; this.w /= length;
    return this;
  }
  multiply(other) {
    const ax = this.x; const ay = this.y; const az = this.z; const aw = this.w;
    const bx = other.x; const by = other.y; const bz = other.z; const bw = other.w;
    return this.set(
      aw * bx + ax * bw + ay * bz - az * by,
      aw * by - ax * bz + ay * bw + az * bx,
      aw * bz + ax * by - ay * bx + az * bw,
      aw * bw - ax * bx - ay * by - az * bz,
    ).normalize();
  }
}

const THREE = { Quaternion: FakeQuaternion };

function angleDegrees(a, b) {
  const dot = Math.min(1, Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w));
  return 2 * Math.acos(dot) * 180 / Math.PI;
}

function rigWithChest() {
  return { bones: { chest: { quaternion: new FakeQuaternion() } } };
}

test('Guard correction is idempotent when the animation mixer leaves a stationary bone untouched', () => {
  const rig = rigWithChest();
  const offsets = { chest: quaternionFromEulerDegrees({ z: -8 }) };
  resetGuardQuaternionOffsetRuntime(rig, offsets);

  applyGuardQuaternionOffsetsWeighted(THREE, rig, offsets, 1);
  const once = rig.bones.chest.quaternion.clone();

  // Simulate a stationary animation key: the mixer does not rewrite the bone.
  applyGuardQuaternionOffsetsWeighted(THREE, rig, offsets, 1);
  const twice = rig.bones.chest.quaternion.clone();
  applyGuardQuaternionOffsetsWeighted(THREE, rig, offsets, 1);
  const threeTimes = rig.bones.chest.quaternion.clone();

  assert.ok(angleDegrees(once, twice) < 1e-6);
  assert.ok(angleDegrees(once, threeTimes) < 1e-6);
});

test('Guard correction adopts a newly sampled raw animation pose before applying the offset once', () => {
  const rig = rigWithChest();
  const offsets = { chest: quaternionFromEulerDegrees({ z: -8 }) };
  resetGuardQuaternionOffsetRuntime(rig, offsets);

  applyGuardQuaternionOffsetsWeighted(THREE, rig, offsets, 1);
  const firstCorrected = rig.bones.chest.quaternion.clone();

  // Simulate the mixer writing a new raw pose when the clip starts moving again.
  rig.bones.chest.quaternion.fromArray(quaternionFromEulerDegrees({ y: 12 }));
  const rawMoved = rig.bones.chest.quaternion.clone();
  applyGuardQuaternionOffsetsWeighted(THREE, rig, offsets, 1);
  const movedCorrected = rig.bones.chest.quaternion.clone();

  assert.ok(angleDegrees(firstCorrected, movedCorrected) > 5);
  assert.ok(angleDegrees(rawMoved, movedCorrected) > 7.9);
  assert.ok(angleDegrees(rawMoved, movedCorrected) < 8.1);
});
