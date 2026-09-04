import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createProceduralV3Weapon,
  createV3WeaponStyle,
  validateV3WeaponDefinition,
  V3_LONGSWORD_DEFINITION,
} from '../src/character/procedural-v3-weapon.js';
import { V3_SWORD_GEOMETRY_DEFINITION } from '../src/character/v3-sword-geometry-definition.js';
import { createDebugSword, mountDebugSword } from '../src/character/debug-sword.js';

class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  fromArray(value) { return this.set(value[0], value[1], value[2]); }
  copy(value) { return this.set(value.x, value.y, value.z); }
  clone() { return new Vector3(this.x, this.y, this.z); }
  add(value) { return this.set(this.x + value.x, this.y + value.y, this.z + value.z); }
  lerp(value, alpha) { return this.set(this.x + (value.x - this.x) * alpha, this.y + (value.y - this.y) * alpha, this.z + (value.z - this.z) * alpha); }
}

class Object3D {
  constructor() {
    this.name = '';
    this.children = [];
    this.parent = null;
    this.position = new Vector3();
    this.rotation = new Vector3();
    this.scale = new Vector3(1, 1, 1);
    this.userData = {};
    this.visible = true;
  }
  add(...children) { children.forEach((child) => { child.parent = this; this.children.push(child); }); }
  getWorldPosition(target) {
    target.set(0, 0, 0);
    let current = this;
    while (current) { target.add(current.position); current = current.parent; }
    return target;
  }
  worldToLocal(target) {
    const world = new Vector3();
    this.getWorldPosition(world);
    return target.set(target.x - world.x, target.y - world.y, target.z - world.z);
  }
  updateMatrixWorld() {}
}

class BufferGeometry {
  constructor() { this.attributes = {}; this.index = null; this.disposed = false; }
  setAttribute(name, attribute) { this.attributes[name] = attribute; return this; }
  setIndex(index) { this.index = index; return this; }
  dispose() { this.disposed = true; }
}

class BufferAttribute {
  constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.count = array.length / itemSize; }
  setXYZ(index, x, y, z) { this.array.set([x, y, z], index * 3); }
}

class EdgesGeometry extends BufferGeometry {
  constructor(source, thresholdAngle) {
    super();
    this.source = source;
    this.thresholdAngle = thresholdAngle;
    this.setAttribute('position', source.attributes.position);
  }
}

class LineSegments extends Object3D {
  constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; }
}

class Mesh extends Object3D {
  constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; }
}

const THREE = {
  Vector3,
  Group: class extends Object3D {},
  Bone: class extends Object3D {},
  LineSegments,
  BufferGeometry,
  BufferAttribute,
  EdgesGeometry,
  LineBasicMaterial: class { constructor(options) { Object.assign(this, options); } },
  Mesh,
  MeshBasicMaterial: class { constructor(options) { Object.assign(this, options); } },
  SphereGeometry: class {},
  AdditiveBlending: 2,
};

test('v3 longsword definition is a complete topological weapon rig', () => {
  const definition = validateV3WeaponDefinition(V3_LONGSWORD_DEFINITION);
  assert.equal(definition.nodes.length, 11);
  assert.equal(definition.nodes.at(-1).id, 'blade.tip');
  assert.equal(definition.nodes.find((node) => node.id === 'secondary_grip').parent, 'grip');
  assert.equal(definition.sourceGeometryId, V3_SWORD_GEOMETRY_DEFINITION.id);
  assert.equal(V3_SWORD_GEOMETRY_DEFINITION.vertexCount, 358);
  assert.equal(V3_SWORD_GEOMETRY_DEFINITION.triangleCount, 300);
});

test('procedural v3 longsword builds bones, wire outline, nodes and combat points without box meshes', () => {
  const sword = createProceduralV3Weapon(THREE);
  assert.equal(Object.keys(sword.bones).length, 11);
  assert.equal(sword.jointNodes.length, 10);
  assert.equal(sword.lines.skeleton.geometry.attributes.position.array.length, 10 * 2 * 3);
  assert.equal(sword.lines.outline.userData.exactV3Source, true);
  assert.equal(sword.lines.outline.userData.sourceVertexCount, 358);
  assert.equal(sword.lines.outline.userData.sourceTriangleCount, 300);
  assert.equal(sword.lines.outline.geometry.source.attributes.position.array.length, 358 * 3);
  assert.equal(sword.lines.outline.geometry.source.index.array.length, 900);
  assert.equal(sword.object3d.userData.renderStyle, 'v3-rig-line');
  assert.equal(sword.sockets.TRAIL_TIP, sword.tip);
  assert.equal(sword.sockets.SECONDARY_GRIP, sword.secondaryGrip);
  assert.equal(sword.trailBase, sword.bladeBase);
  assert.equal(sword.trailTip, sword.tip);
  const sweep = sword.getSweepSegment();
  assert.ok(Math.abs(sweep.start.y + 0.3) < 1e-9);
  assert.ok(Math.abs(sweep.end.y - V3_SWORD_GEOMETRY_DEFINITION.bounds.min[1]) < 1e-9);
});

test('debug sword compatibility factory mounts the v3 weapon rig on HAND_R', () => {
  const sword = createDebugSword(THREE);
  let attachment = null;
  const character = {
    attach(socketId, object3d, calibration) { attachment = { socketId, object3d, calibration }; },
  };
  mountDebugSword(character, sword, { rotation: { z: Math.PI } });
  assert.equal(sword.id, 'v3_procedural_longsword');
  assert.equal(attachment.socketId, 'HAND_R');
  assert.equal(attachment.object3d, sword.object3d);
});

test('v3 weapon nodes and glow are presentation toggles only', () => {
  const sword = createProceduralV3Weapon(THREE, { style: { outlineOpacity: 2 } });
  sword.setNodesVisible(false);
  sword.setGlowVisible(false);
  assert.ok(sword.jointNodes.every((node) => node.visible === false));
  assert.equal(sword.lines.glow.visible, false);
  assert.equal(createV3WeaponStyle({ outlineOpacity: 2 }).outlineOpacity, 1);
});
