import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CHARACTER_SOCKET_IDS,
  attachEquipment,
  createCharacterSockets,
} from '../src/character/character-sockets.js';
import { POSE_KEYS } from '../src/animation/pose-schema.js';
import { interpolatePose, normalizePose } from '../src/animation/pose-utils.js';
import {
  createAnimationClip,
  evaluateClip,
  normalizeTimeline,
} from '../src/animation/animation-clip.js';
import { createActionDefinition, isFrameInWindow } from '../src/combat/action-definition.js';

test('pose normalization derives its full shape from POSE_KEYS', () => {
  const pose = normalizePose({ root_y: '30', body_scale: Number.NaN, aR_stretch: undefined, carry_tilt: 90 });
  assert.deepEqual(Object.keys(pose), [...POSE_KEYS]);
  assert.equal(pose.root_y, 30);
  assert.equal(pose.body_scale, 1);
  assert.equal(pose.aR_stretch, 1);
  assert.equal('carry_tilt' in pose, false);
});

test('pose interpolation respects defaults and per-limb lag', () => {
  const halfway = interpolatePose(
    { root_y: 0, aR_sx: 0 },
    { root_y: 80, aR_sx: 100, body_scale: 0.5 },
    0.5,
    { lags: { aR: 0.25 } },
  );
  assert.equal(halfway.root_y, 40);
  assert.ok(Math.abs(halfway.aR_sx - (100 / 3)) < 1e-10);
  assert.equal(halfway.body_scale, 0.75);
  assert.equal(halfway.lL_stretch, 1);
});

test('timeline normalization supports arbitrary key and tag names', () => {
  const timeline = normalizeTimeline([
    { name: 'guard_enter', frame: 0, tag: 'guard_enter' },
    { name: 'parry contact', frames: 4, tag: 'perfect-parry:contact', impact: true },
    { name: 'counter_recover', frame: 12, cancel: true },
  ]);
  assert.deepEqual(timeline.map((key) => key.name), ['guard_enter', 'parry contact', 'counter_recover']);
  assert.deepEqual(timeline.map((key) => key.frame), [0, 4, 12]);
  assert.equal(timeline[1].tag, 'perfect-parry:contact');
  assert.equal(timeline[2].cancel, true);
});

test('clip evaluation interpolates the incoming key segment', () => {
  const clip = createAnimationClip({
    id: 'test_slash',
    timeline: [
      { name: 'windup', frame: 0, ease: 'lin' },
      { name: 'slash_active', frame: 10, ease: 'lin', impact: true },
    ],
    poses: {
      windup: { root_y: -20, aR_sy: -40 },
      slash_active: { root_y: 40, aR_sy: 80 },
    },
  });
  const result = evaluateClip(clip, 5);
  assert.equal(result.from, 'windup');
  assert.equal(result.to, 'slash_active');
  assert.equal(result.pose.root_y, 10);
  assert.equal(result.pose.aR_sy, 20);
  assert.equal(result.isImpact, true);
});

test('action windows are authoring metadata and normalize to clip bounds', () => {
  const action = createActionDefinition({
    id: 'parry',
    windows: { parry: [{ startFrame: 3, endFrame: 8 }] },
  }, 6);
  assert.equal(action.windows.parry[0].endFrame, 6);
  assert.equal(isFrameInWindow(action, 'parry', 5), true);
  assert.equal(action.version, 2);
  assert.equal(action.animationBinding.source, 'authored');
  assert.equal(action.animationBinding.clipId, 'parry');
  assert.match(action.authority, /Authoritative combat simulation/);
});

class FakeTransform {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; }
}

class FakeGroup {
  constructor() {
    this.name = '';
    this.parent = null;
    this.children = [];
    this.userData = {};
    this.position = new FakeTransform();
    this.rotation = new FakeTransform();
    this.scale = new FakeTransform(1, 1, 1);
  }
  add(child) {
    child.parent = this;
    this.children.push(child);
  }
}

test('all required character sockets exist', () => {
  const wristL = new FakeGroup();
  const wristR = new FakeGroup();
  const rig = {
    spec: { fist: 0.71, headSize: 0.84, bodyH: 0.78, bodyD: 0.56, legSpread: 0.22 },
    measurements: { hipY: 0.79 },
    arms: { L: { wrist: wristL }, R: { wrist: wristR } },
    headPivot: new FakeGroup(),
    spine: new FakeGroup(),
    pelvis: new FakeGroup(),
  };
  const sockets = createCharacterSockets({ Group: FakeGroup }, rig);
  assert.deepEqual(Object.keys(sockets), [...CHARACTER_SOCKET_IDS]);
  assert.equal(sockets.HAND_R.parent, wristR);
  assert.equal(sockets.HAND_L.parent, wristL);
});

test('HAND_R weapon attachment contract parents and calibrates the weapon locally', () => {
  const handRight = new FakeGroup();
  const weapon = new FakeGroup();
  attachEquipment({ HAND_R: handRight }, 'HAND_R', weapon, {
    position: { x: 0.1, y: -0.2, z: 0.3 },
    rotation: { x: 0.4, y: 0.5, z: 0.6 },
    scale: 1.25,
  });
  assert.equal(weapon.parent, handRight);
  assert.deepEqual([weapon.position.x, weapon.position.y, weapon.position.z], [0.1, -0.2, 0.3]);
  assert.deepEqual([weapon.rotation.x, weapon.rotation.y, weapon.rotation.z], [0.4, 0.5, 0.6]);
  assert.deepEqual([weapon.scale.x, weapon.scale.y, weapon.scale.z], [1.25, 1.25, 1.25]);
  assert.equal(weapon.userData.attachedSocket, 'HAND_R');
});

