import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { KAYKIT_RIG_MEDIUM_DEFINITION } from '../src/character/kaykit-rig-definition.js';
import {
  KAYKIT_REQUIRED_BONE_IDS,
  createKayKitAppearance,
  createProceduralKayKitRig,
  validateKayKitRigDefinition,
} from '../src/character/procedural-kaykit-rig.js';
import { createDefaultCharacter, DEFAULT_CHARACTER_RIG_ID } from '../src/character/default-character.js';
import { createAnimationPlaybackSignature } from '../src/character/procedural-kaykit-character.js';
import {
  KAYKIT_ANIMATION_PACKS,
  validateKayKitClipBindings,
} from '../src/animation/kaykit-animation-library.js';

class FakeVector3 {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  setScalar(value) { return this.set(value, value, value); }
  fromArray(value) { return this.set(value[0], value[1], value[2]); }
  toArray() { return [this.x, this.y, this.z]; }
  clone() { return new FakeVector3(this.x, this.y, this.z); }
  copy(value) { return this.set(value.x, value.y, value.z); }
  multiplyScalar(value) { return this.set(this.x * value, this.y * value, this.z * value); }
  length() { return Math.hypot(this.x, this.y, this.z); }
  normalize() { const length = this.length() || 1; return this.multiplyScalar(1 / length); }
}

class FakeQuaternion {
  constructor(x = 0, y = 0, z = 0, w = 1) { this.fromArray([x, y, z, w]); }
  fromArray(value) { [this.x, this.y, this.z, this.w] = value; return this; }
  toArray() { return [this.x, this.y, this.z, this.w]; }
  setFromUnitVectors() { return this; }
}

class FakeRotation {
  set() {}
}

class FakeObject3D {
  constructor() {
    this.name = '';
    this.parent = null;
    this.children = [];
    this.userData = {};
    this.position = new FakeVector3();
    this.quaternion = new FakeQuaternion();
    this.rotation = new FakeRotation();
    this.scale = new FakeVector3(1, 1, 1);
  }
  add(child) { child.parent = this; this.children.push(child); }
  updateMatrixWorld() {}
}

class FakeGroup extends FakeObject3D {}
class FakeBone extends FakeObject3D {}
class FakeMesh extends FakeObject3D {
  constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; this.isMesh = true; }
}
class FakeBox3 { makeEmpty() { this.min = { y: Number.POSITIVE_INFINITY }; } }
class FakeMatrix4 {
  fromArray(value) { this.value = value; return this; }
  decompose(position, quaternion, scale) {
    position.set(0, 0, 0); quaternion.fromArray([0, 0, 0, 1]); scale.set(1, 1, 1);
  }
}

const FAKE_THREE = {
  Group: FakeGroup,
  Bone: FakeBone,
  Mesh: FakeMesh,
  Vector3: FakeVector3,
  Box3: FakeBox3,
  Matrix4: FakeMatrix4,
  BoxGeometry: class {},
  IcosahedronGeometry: class {},
  MeshStandardMaterial: class {},
};

test('generated KayKit rig definition is complete and topologically ordered', () => {
  assert.equal(validateKayKitRigDefinition(), KAYKIT_RIG_MEDIUM_DEFINITION);
  assert.equal(KAYKIT_RIG_MEDIUM_DEFINITION.bones.length, 23);
  const ids = KAYKIT_RIG_MEDIUM_DEFINITION.bones.map((bone) => bone.id);
  KAYKIT_REQUIRED_BONE_IDS.forEach((id) => assert.ok(ids.includes(id), id));
  assert.equal(KAYKIT_RIG_MEDIUM_DEFINITION.sockets.HAND_L.parent, 'handslot.l');
  assert.equal(KAYKIT_RIG_MEDIUM_DEFINITION.sockets.HAND_R.parent, 'handslot.r');
});

test('procedural rig creates bones, pure v3 line appearance and stable sockets without a source GLB scene', () => {
  const rig = createProceduralKayKitRig(FAKE_THREE);
  assert.equal(rig.root.userData.rigId, 'kaykit_rig_medium');
  assert.equal(rig.root.userData.procedural, true);
  assert.equal(Object.keys(rig.bones).length, 23);
  assert.equal(rig.meshes.length, 0);
  assert.equal(rig.renderStyle, 'v3-rig-line');
  assert.equal(rig.bones['handslot.r'].name, 'handslotr');
  assert.equal(rig.sockets.HAND_R.parent, rig.bones['handslot.r']);
  assert.equal(rig.sockets.HAND_L.parent, rig.bones['handslot.l']);
  assert.equal(rig.sockets.BACK.parent, rig.bones.chest);
});

test('appearance presets normalize dimensions without changing the rig contract', () => {
  const appearance = createKayKitAppearance({ headScale: 1.2, limbThickness: 0, colors: { cloth: 0xff0000 } });
  assert.equal(appearance.headScale, 1.2);
  assert.equal(appearance.limbThickness, 1);
  assert.equal(appearance.colors.cloth, 0xff0000);
  assert.equal(DEFAULT_CHARACTER_RIG_ID, 'kaykit_rig_medium');
  assert.equal(typeof createDefaultCharacter, 'function');
});

test('KayKit animation binding validation rejects targets outside the procedural skeleton', () => {
  const known = KAYKIT_RIG_MEDIUM_DEFINITION.bones.map((bone) => bone.id);
  const valid = validateKayKitClipBindings([
    { name: 'Idle_A', tracks: [{ name: 'hips.position' }, { name: 'handslotr.quaternion' }] },
  ], known);
  const invalid = validateKayKitClipBindings([
    { name: 'Broken', tracks: [{ name: 'missing.rotation' }] },
  ], known);
  assert.equal(valid.valid, true);
  assert.equal(invalid.valid, false);
  assert.deepEqual(invalid.missing.get('Broken'), ['missing']);
});

test('G3.4.2R playback signatures isolate preserve and locked root-rotation actions', () => {
  const preserved = createAnimationPlaybackSignature('SKYRIM_GUARD/shd_blockhit', { inPlace: true });
  const locked = createAnimationPlaybackSignature('SKYRIM_GUARD/shd_blockhit', {
    inPlace: true,
    rootRotationPolicy: 'lock',
  });
  const rootMotion = createAnimationPlaybackSignature('SKYRIM_GUARD/shd_blockhit', {
    inPlace: false,
    rootRotationPolicy: 'lock',
  });

  assert.notEqual(preserved, locked);
  assert.match(preserved, /root-rotation-preserve$/);
  assert.match(locked, /root-rotation-lock$/);
  assert.match(rootMotion, /root-motion\|root-rotation-preserve$/);
});

test('extracted animation manifest contains valid GLB packs and expected combat clips', async () => {
  const manifestUrl = new URL('../assets/kaykit/manifest.json', import.meta.url);
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
  assert.equal(manifest.rigId, 'kaykit_rig_medium');
  assert.equal(manifest.packs.length, 8);
  assert.deepEqual(manifest.packs.map((pack) => pack.id), KAYKIT_ANIMATION_PACKS.map((pack) => pack.id));
  assert.equal(manifest.packs.reduce((sum, pack) => sum + pack.clips.length, 0), 139);
  assert.ok(manifest.packs.find((pack) => pack.id === 'melee').clips.includes('Melee_Blocking'));
  assert.ok(manifest.packs.find((pack) => pack.id === 'advanced').clips.includes('Dodge_Left'));
  assert.ok(manifest.packs.find((pack) => pack.id === 'ranged').clips.includes('Ranged_Bow_Release'));
  assert.ok(manifest.packs.find((pack) => pack.id === 'tools').clips.includes('Chopping'));
  for (const pack of manifest.packs) {
    const bytes = await readFile(new URL(`../assets/kaykit/${pack.file}`, import.meta.url));
    assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
    assert.equal(bytes.length, pack.byteLength);
  }
});
