import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PARRY_UPPER_BODY_CONTINUITY_LIMITS_DEGREES,
  PARRY_UPPER_BODY_CONTINUITY_STAGE,
  parryUpperBodyContinuityLimitDegrees,
  stabilizeProductionParryUpperBodyClip,
} from '../src/animation/parry-upper-body-continuity.js';

class FakeQuaternion {
  constructor(x = 0, y = 0, z = 0, w = 1) { this.set(x, y, z, w); }
  set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
  clone() { return new FakeQuaternion(this.x, this.y, this.z, this.w); }
  normalize() {
    const length = Math.hypot(this.x, this.y, this.z, this.w) || 1;
    this.x /= length; this.y /= length; this.z /= length; this.w /= length;
    return this;
  }
  invert() { this.x *= -1; this.y *= -1; this.z *= -1; return this.normalize(); }
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
  identity() { return this.set(0, 0, 0, 1); }
  slerp(other, alpha) {
    let bx = other.x; let by = other.y; let bz = other.z; let bw = other.w;
    if (this.x * bx + this.y * by + this.z * bz + this.w * bw < 0) {
      bx *= -1; by *= -1; bz *= -1; bw *= -1;
    }
    return this.set(
      this.x + (bx - this.x) * alpha,
      this.y + (by - this.y) * alpha,
      this.z + (bz - this.z) * alpha,
      this.w + (bw - this.w) * alpha,
    ).normalize();
  }
}

class FakeTrack {
  constructor(name, times, values) {
    this.name = name;
    this.times = Float32Array.from(times);
    this.values = Float32Array.from(values.flat());
  }
  getValueSize() { return 4; }
  createInterpolant() {
    return {
      evaluate: (time) => {
        if (time <= this.times[0]) return this.values.slice(0, 4);
        for (let index = 1; index < this.times.length; index += 1) {
          if (time > this.times[index]) continue;
          const start = this.times[index - 1];
          const end = this.times[index];
          const alpha = end > start ? (time - start) / (end - start) : 0;
          const from = new FakeQuaternion(...this.values.slice((index - 1) * 4, index * 4)).normalize();
          const to = new FakeQuaternion(...this.values.slice(index * 4, (index + 1) * 4)).normalize();
          const value = from.slerp(to, alpha);
          return Float32Array.from([value.x, value.y, value.z, value.w]);
        }
        return this.values.slice(this.values.length - 4);
      },
    };
  }
}

const THREE = {
  Quaternion: FakeQuaternion,
  MathUtils: { degToRad: (degrees) => degrees * Math.PI / 180 },
};

function yawQuaternion(degrees) {
  const radians = degrees * Math.PI / 180;
  return [0, Math.sin(radians / 2), 0, Math.cos(radians / 2)];
}

function quaternionAngleDegrees(values) {
  const q = new FakeQuaternion(...values).normalize();
  return 2 * Math.acos(Math.min(1, Math.abs(q.w))) * 180 / Math.PI;
}

test('G3.6 keeps torso safety contact-relative but widens the motion envelope', () => {
  assert.equal(PARRY_UPPER_BODY_CONTINUITY_STAGE, 'G3.6');
  assert.equal(parryUpperBodyContinuityLimitDegrees('spine.quaternion'), 42);
  assert.equal(parryUpperBodyContinuityLimitDegrees('chest.quaternion'), 60);
  assert.equal(parryUpperBodyContinuityLimitDegrees('hips.quaternion'), null);
  assert.equal(parryUpperBodyContinuityLimitDegrees('upperarmr.quaternion'), null);
  assert.equal(parryUpperBodyContinuityLimitDegrees('chest.position'), null);
});

test('G3.6 rebases extreme Power Bash torso turn without flattening it to T3.3 limits', () => {
  const contactChest = new FakeTrack('chest.quaternion', [0, 0.16, 0.8], [
    yawQuaternion(0), yawQuaternion(0), yawQuaternion(0),
  ]);
  const deflectChest = new FakeTrack('chest.quaternion', [0, 0.12, 0.28, 0.7], [
    yawQuaternion(70), yawQuaternion(70), yawQuaternion(150), yawQuaternion(150),
  ]);
  const virtualChest = new FakeTrack('chest.quaternion', [0, 0.16, 0.21, 0.265, 0.38, 0.6], [
    yawQuaternion(0), yawQuaternion(0), yawQuaternion(0), yawQuaternion(80), yawQuaternion(140), yawQuaternion(150),
  ]);
  const clip = {
    duration: 0.6,
    tracks: [virtualChest],
    userData: {
      productionParryDeflect: {
        productionEnabled: true,
        variant: 'parry',
        contactClipId: 'SKYRIM_GUARD/shd_blockhit',
        deflectClipId: 'SKYRIM_GUARD/shd_blockbashpower',
        contactEndSeconds: 0.16,
        deflectWindow: [0.12, 0.28],
        upperBodySafetyLimitsDegrees: { spine: 42, chest: 60 },
      },
    },
  };
  const sources = new Map([
    ['SKYRIM_GUARD/shd_blockhit', { duration: 0.8, tracks: [contactChest] }],
    ['SKYRIM_GUARD/shd_blockbashpower', { duration: 0.7, tracks: [deflectChest] }],
  ]);

  stabilizeProductionParryUpperBodyClip(THREE, clip, sources);

  const final = Array.from(virtualChest.values.slice(-4));
  const finalDegrees = quaternionAngleDegrees(final);
  // FakeQuaternion intentionally uses normalized linear interpolation instead of
  // Three.js' exact slerp, so allow a small numerical envelope around the real
  // 60° production cap. The browser continuity gate measures the real runtime.
  assert.ok(finalDegrees <= PARRY_UPPER_BODY_CONTINUITY_LIMITS_DEGREES.chest + 2.0);
  assert.ok(finalDegrees > 24, 'G3.6 must preserve more torso action than the old T3.3 24° chest cap');
  assert.equal(clip.userData.productionParryDeflect.upperBodyContinuity.stage, 'G3.6');
  assert.equal(clip.userData.productionParryDeflect.upperBodyContinuity.policy, 'contact-relative-wide-torso-safety-cap');
  assert.deepEqual(clip.userData.productionParryDeflect.upperBodyContinuity.stabilizedTracks, ['chest.quaternion']);
});
