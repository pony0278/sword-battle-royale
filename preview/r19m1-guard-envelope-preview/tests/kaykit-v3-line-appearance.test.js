import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createKayKitV3LineAppearance,
  createKayKitV3LineStyle,
} from '../src/character/kaykit-v3-line-appearance.js';

let vectorCloneCount = 0;
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(value) { return this.set(value.x, value.y, value.z); }
  clone() { vectorCloneCount += 1; return new Vector3(this.x, this.y, this.z); }
  add(value) { return this.set(this.x + value.x, this.y + value.y, this.z + value.z); }
  sub(value) { return this.set(this.x - value.x, this.y - value.y, this.z - value.z); }
  multiplyScalar(value) { return this.set(this.x * value, this.y * value, this.z * value); }
  addScaledVector(value, scale) { return this.set(this.x + value.x * scale, this.y + value.y * scale, this.z + value.z * scale); }
  lerp(value, alpha) { return this.set(this.x + (value.x - this.x) * alpha, this.y + (value.y - this.y) * alpha, this.z + (value.z - this.z) * alpha); }
  applyQuaternion() { return this; }
}
class Object3D {
  constructor() { this.name = ''; this.children = []; this.userData = {}; this.position = new Vector3(); this.scale = new Vector3(1, 1, 1); this.visible = true; }
  add(child) { child.parent = this; this.children.push(child); }
  getWorldPosition(target) { return target.copy(this.position); }
  worldToLocal(value) { return value; }
  updateMatrixWorld() {}
}
class Geometry {
  constructor() { this.attributes = {}; this.drawRange = null; }
  setAttribute(name, value) { this.attributes[name] = value; }
  setDrawRange(start, count) { this.drawRange = { start, count }; }
}
class BufferAttribute {
  constructor(array) { this.array = array; this.needsUpdate = false; }
  setXYZ(index, x, y, z) { this.array.set([x, y, z], index * 3); }
}
class LineSegments extends Object3D { constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; } }
class Mesh extends Object3D { constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; } }

const THREE = {
  Vector3,
  LineSegments,
  BufferGeometry: Geometry,
  BufferAttribute,
  LineBasicMaterial: class { constructor(options) { Object.assign(this, options); } },
  MeshBasicMaterial: class { constructor(options) { Object.assign(this, options); } },
  SphereGeometry: class {},
  Mesh,
  AdditiveBlending: 2,
};

function fakeRig() {
  const ids = [
    'root', 'hips', 'spine', 'chest', 'head',
    'upperarm.l', 'lowerarm.l', 'wrist.l', 'hand.l',
    'upperarm.r', 'lowerarm.r', 'wrist.r', 'hand.r',
    'upperleg.l', 'lowerleg.l', 'foot.l', 'toes.l',
    'upperleg.r', 'lowerleg.r', 'foot.r', 'toes.r',
  ];
  const bones = Object.fromEntries(ids.map((id) => [id, Object.assign(new Object3D(), { name: id })]));
  bones.hips.position.set(0, 0.4, 0);
  bones.spine.position.set(0, 0.6, 0);
  bones.chest.position.set(0, 0.95, 0);
  bones.head.position.set(0, 1.2, 0);
  for (const side of ['l', 'r']) {
    const sign = side === 'l' ? 1 : -1;
    bones[`upperarm.${side}`].position.set(sign * 0.25, 1.05, 0);
    bones[`lowerarm.${side}`].position.set(sign * 0.45, 0.95, 0);
    bones[`wrist.${side}`].position.set(sign * 0.60, 0.85, 0);
    bones[`hand.${side}`].position.set(sign * 0.68, 0.82, 0);
    bones[`upperleg.${side}`].position.set(sign * 0.17, 0.45, 0);
    bones[`lowerleg.${side}`].position.set(sign * 0.17, 0.23, 0);
    bones[`foot.${side}`].position.set(sign * 0.17, 0.08, 0);
    bones[`toes.${side}`].position.set(sign * 0.17, 0.02, 0.12);
  }
  return {
    root: new Object3D(),
    motionRoot: new Object3D(),
    bones,
    appearance: { headScale: 1, shoulderScale: 1, jointScale: 1 },
  };
}

test('v3 appearance contains pure rig lines, glow, gold nodes and polygon contours', () => {
  const appearance = createKayKitV3LineAppearance(THREE, fakeRig());
  assert.equal(appearance.renderStyle, 'v3-rig-line');
  assert.equal(appearance.jointNodes.length, 18);
  assert.equal(appearance.lines.limbs.geometry.attributes.position.array.length, 15 * 2 * 3);
  assert.equal(appearance.lines.contour.geometry.attributes.position.array.length, 9 * 2 * 3);
  assert.deepEqual(appearance.lines.head.geometry.drawRange, { start: 0, count: 16 });
  assert.equal(appearance.lines.head.material.opacity, 0.98);
  assert.equal(appearance.jointNodes[0].material.opacity, 0.88);
  assert.equal(appearance.lines.glow.visible, true);
});

test('v3 appearance only toggles nodes and glow; no Block or Hybrid render style exists', () => {
  const appearance = createKayKitV3LineAppearance(THREE, fakeRig());
  appearance.setNodesVisible(false);
  appearance.setGlowVisible(false);
  assert.ok(appearance.jointNodes.every((node) => node.visible === false));
  assert.equal(appearance.lines.glow.visible, false);
  assert.equal('headGlow' in appearance.lines, false);
  assert.equal(createKayKitV3LineStyle({ renderStyle: 'block' }).renderStyle, 'v3-rig-line');
});

test('v3 appearance reuses scratch vectors during repeated frame updates', () => {
  const appearance = createKayKitV3LineAppearance(THREE, fakeRig());
  vectorCloneCount = 0;
  appearance.update();
  appearance.update();
  assert.equal(vectorCloneCount, 0);
});
