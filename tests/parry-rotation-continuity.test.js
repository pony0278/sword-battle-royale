import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PARRY_ROTATION_CONTINUITY_CONTACT_LOCK_TARGETS,
  PARRY_ROTATION_CONTINUITY_STAGE,
  isParryRotationContinuityContactLockedTrack,
  stabilizeProductionParryDeflectClip,
} from '../src/animation/parry-rotation-continuity.js';

class FakeTrack {
  constructor(name, times, values, size) {
    this.name = name;
    this.times = Float32Array.from(times);
    this.values = Float32Array.from(values);
    this.size = size;
  }
  getValueSize() { return this.size; }
  createInterpolant() {
    return {
      evaluate: (time) => {
        if (time <= this.times[0]) return this.values.slice(0, this.size);
        for (let index = 1; index < this.times.length; index += 1) {
          if (time > this.times[index]) continue;
          const start = this.times[index - 1];
          const end = this.times[index];
          const alpha = end > start ? (time - start) / (end - start) : 0;
          const value = new Float32Array(this.size);
          for (let component = 0; component < this.size; component += 1) {
            const from = this.values[(index - 1) * this.size + component];
            const to = this.values[index * this.size + component];
            value[component] = from + (to - from) * alpha;
          }
          return value;
        }
        return this.values.slice(this.values.length - this.size);
      },
    };
  }
}

function quaternionTrack(name, samples) {
  return new FakeTrack(name, [0, 0.16, 0.30, 0.60], samples.flat(), 4);
}

test('G3.5.1P-T3.2 classifies only root/pelvis/lower-body transform tracks as contact locked', () => {
  assert.ok(PARRY_ROTATION_CONTINUITY_CONTACT_LOCK_TARGETS.includes('hips'));
  assert.equal(isParryRotationContinuityContactLockedTrack('root.quaternion'), true);
  assert.equal(isParryRotationContinuityContactLockedTrack('hips.quaternion'), true);
  assert.equal(isParryRotationContinuityContactLockedTrack('upperlegl.quaternion'), true);
  assert.equal(isParryRotationContinuityContactLockedTrack('footr.position'), true);
  assert.equal(isParryRotationContinuityContactLockedTrack('spine.quaternion'), false);
  assert.equal(isParryRotationContinuityContactLockedTrack('chest.quaternion'), false);
  assert.equal(isParryRotationContinuityContactLockedTrack('upperarmr.quaternion'), false);
});

test('G3.5.1P-T3.2 freezes hips after contact while preserving upper-body deflect tracks', () => {
  const contactHips = quaternionTrack('hips.quaternion', [
    [0, 0, 0, 1],
    [0, 0.2, 0, 0.98],
    [0, 0.3, 0, 0.95],
    [0, 0.4, 0, 0.92],
  ]);
  const virtualHips = quaternionTrack('hips.quaternion', [
    [0, 0, 0, 1],
    [0, 0.2, 0, 0.98],
    [0, 0.8, 0, 0.6],
    [0, 1, 0, 0],
  ]);
  const virtualSpine = quaternionTrack('spine.quaternion', [
    [0, 0, 0, 1],
    [0.1, 0, 0, 0.99],
    [0.4, 0, 0, 0.91],
    [0.6, 0, 0, 0.8],
  ]);
  const originalSpineTail = Array.from(virtualSpine.values.slice(8));
  const clip = {
    duration: 0.6,
    tracks: [virtualHips, virtualSpine],
    userData: {
      productionParryDeflect: {
        productionEnabled: true,
        contactClipId: 'SKYRIM_GUARD/shd_blockhit',
        contactEndSeconds: 0.16,
      },
    },
  };
  const contactClip = { duration: 0.8, tracks: [contactHips] };
  const sourceClipMap = new Map([['SKYRIM_GUARD/shd_blockhit', contactClip]]);

  stabilizeProductionParryDeflectClip(clip, sourceClipMap);

  const expected = Array.from(contactHips.values.slice(4, 8));
  assert.deepEqual(Array.from(virtualHips.values.slice(4, 8)), expected);
  assert.deepEqual(Array.from(virtualHips.values.slice(8, 12)), expected);
  assert.deepEqual(Array.from(virtualHips.values.slice(12, 16)), expected);
  assert.deepEqual(Array.from(virtualSpine.values.slice(8)), originalSpineTail);
  assert.equal(clip.userData.productionParryDeflect.rotationContinuity.stage, PARRY_ROTATION_CONTINUITY_STAGE);
  assert.equal(clip.userData.productionParryDeflect.rotationContinuity.policy, 'contact-lock-lower-body-after-contact');
  assert.deepEqual(clip.userData.productionParryDeflect.rotationContinuity.stabilizedTracks, ['hips.quaternion']);
});
