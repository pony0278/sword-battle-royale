// The line weapon, for any weapon.
//
// This was procedural-v3-longsword.js, and the name was only half a lie: the rig hierarchy, the
// edge outline and the skeleton overlay were always generic, but two things reached past the
// definition it was handed and read the longsword's geometry module directly - the outline, and the
// validator that rejected any definition not built from it. So `createProceduralV3Longsword({
// definition })` accepted a second weapon's definition and then drew the first weapon's blade.
//
// Both now come from the definition. A weapon rig carries its own source geometry, and the outline
// is built from that - which is what makes a greatsword look like a greatsword and, more to the
// point, what makes the contact sampler read a blade twice as long instead of the same one.
import { WEAPON_SOCKET_ID } from './character-sockets.js';
import { V3_SWORD_GEOMETRY_DEFINITION } from './v3-sword-geometry-definition.js';

export const V3_WEAPON_REQUIRED_NODE_IDS = Object.freeze([
  'weapon.root',
  'pommel',
  'grip',
  'secondary_grip',
  'guard',
  'guard.l',
  'guard.r',
  'blade.root',
  'blade.mid',
  'parry.point',
  'blade.tip',
]);

function defineV3Weapon({ id, weaponType, sourceGeometry }) {
  return Object.freeze({
    format: 'procedural-weapon-rig',
    version: 2,
    id,
    weaponType,
    sourceGeometryId: sourceGeometry.id,
    // Carried, not looked up. This is the field the outline and the validator used to reach around
    // the definition to find.
    sourceGeometry,
    nodes: sourceGeometry.rigNodes,
  });
}

export const V3_LONGSWORD_DEFINITION = defineV3Weapon({
  id: 'v3_procedural_longsword',
  weaponType: 'longsword',
  sourceGeometry: V3_SWORD_GEOMETRY_DEFINITION,
});

// The greatsword is NOT imported here, and that is deliberate. Its geometry is 82 KB of source -
// 10.8 KB gzipped - and this module is reached by every page that draws a sword. Eagerly importing
// a weapon nobody has equipped yet would undo, in one line, the work that took the published page
// from ~180 requests to 14: see v3-greatsword-weapon.js, which a page opts into.
export { defineV3Weapon };

export const DEFAULT_V3_WEAPON_STYLE = Object.freeze({
  outlineColor: 0xf7fbff,
  skeletonColor: 0x96e8ff,
  glowColor: 0x39c7ff,
  jointColor: 0xffdd7d,
  outlineOpacity: 0.98,
  skeletonOpacity: 0.95,
  glowOpacity: 0.22,
  jointOpacity: 0.88,
  jointRadius: 0.026,
});

const SKELETON_LINKS = Object.freeze([
  ['pommel', 'weapon.root'],
  ['weapon.root', 'grip'],
  ['grip', 'secondary_grip'],
  ['grip', 'guard'],
  ['guard', 'guard.l'],
  ['guard', 'guard.r'],
  ['guard', 'blade.root'],
  ['blade.root', 'blade.mid'],
  ['blade.mid', 'parry.point'],
  ['blade.mid', 'blade.tip'],
]);

const JOINT_NODE_IDS = Object.freeze([
  'pommel', 'grip', 'secondary_grip', 'guard', 'guard.l', 'guard.r',
  'blade.root', 'blade.mid', 'parry.point', 'blade.tip',
]);

function finitePositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function finiteOpacity(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
}

export function createV3WeaponStyle(input = {}) {
  return {
    ...DEFAULT_V3_WEAPON_STYLE,
    ...input,
    outlineOpacity: finiteOpacity(input.outlineOpacity, DEFAULT_V3_WEAPON_STYLE.outlineOpacity),
    skeletonOpacity: finiteOpacity(input.skeletonOpacity, DEFAULT_V3_WEAPON_STYLE.skeletonOpacity),
    glowOpacity: finiteOpacity(input.glowOpacity, DEFAULT_V3_WEAPON_STYLE.glowOpacity),
    jointOpacity: finiteOpacity(input.jointOpacity, DEFAULT_V3_WEAPON_STYLE.jointOpacity),
    jointRadius: finitePositive(input.jointRadius, DEFAULT_V3_WEAPON_STYLE.jointRadius),
  };
}

export function validateV3WeaponDefinition(definition = V3_LONGSWORD_DEFINITION) {
  if (definition?.format !== 'procedural-weapon-rig') throw new Error('Invalid procedural weapon rig format');
  const sourceGeometry = definition.sourceGeometry;
  if (!sourceGeometry?.positions?.length || !sourceGeometry?.indices?.length) {
    throw new Error('V3 weapon rig ' + definition.id + ' carries no source geometry to draw');
  }
  if (definition.sourceGeometryId !== sourceGeometry.id) {
    throw new Error('V3 weapon rig ' + definition.id + ' names ' + definition.sourceGeometryId + ' but carries ' + sourceGeometry.id);
  }
  const ids = new Set();
  for (const node of definition.nodes || []) {
    if (!node?.id || ids.has(node.id)) throw new Error('Invalid or duplicate weapon node: ' + node?.id);
    if (node.parent && !ids.has(node.parent)) throw new Error('Weapon node ' + node.id + ' appears before ' + node.parent);
    ids.add(node.id);
  }
  const missing = V3_WEAPON_REQUIRED_NODE_IDS.filter((id) => !ids.has(id));
  if (missing.length) throw new Error('V3 weapon rig ' + definition.id + ' is missing nodes: ' + missing.join(', '));
  return definition;
}

function createWeaponHierarchy(THREE, definition) {
  const object3d = new THREE.Group();
  // weapon-mount-policy.js documents the scene chain as handr -> handslotr -> HAND_R ->
  // V3_PROCEDURAL_LONGSWORD, which stays true: the longsword's weaponType is 'longsword'.
  object3d.name = 'V3_PROCEDURAL_' + String(definition.weaponType || 'weapon').toUpperCase();
  object3d.userData.weaponType = definition.weaponType;
  object3d.userData.weaponRigId = definition.id;
  object3d.userData.sourceGeometryId = definition.sourceGeometryId;
  object3d.userData.procedural = true;
  object3d.userData.renderStyle = 'v3-rig-line';
  const bones = {};
  for (const node of definition.nodes) {
    const bone = new THREE.Bone();
    bone.name = node.id;
    bone.position.fromArray(node.position);
    bone.userData.weaponNodeId = node.id;
    (node.parent ? bones[node.parent] : object3d).add(bone);
    bones[node.id] = bone;
  }
  return { object3d, bones: Object.freeze(bones) };
}

function lineMaterial(THREE, color, opacity, glow = false) {
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  if (glow && THREE.AdditiveBlending != null) material.blending = THREE.AdditiveBlending;
  return material;
}

function makeSegments(THREE, segmentCount, color, opacity, name, glow = false) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segmentCount * 2 * 3), 3));
  const line = new THREE.LineSegments(geometry, lineMaterial(THREE, color, opacity, glow));
  line.name = name;
  line.frustumCulled = false;
  line.userData.appearanceRole = glow ? 'weapon-glow' : 'weapon-line';
  return line;
}

function createExactV3Outline(THREE, style, source) {
  const sourceGeometry = new THREE.BufferGeometry();
  sourceGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(source.positions), 3),
  );
  // Uint16 tops out at 65535 vertices and the longsword has 358, so the narrower array was never
  // wrong - but it is a ceiling a second mesh can reach, and a silently truncated index draws a
  // blade with holes in it rather than throwing.
  const IndexArray = source.vertexCount > 65535 ? Uint32Array : Uint16Array;
  sourceGeometry.setIndex(
    new THREE.BufferAttribute(new IndexArray(source.indices), 1),
  );
  const edgeGeometry = new THREE.EdgesGeometry(sourceGeometry, 1);
  sourceGeometry.dispose();
  const line = new THREE.LineSegments(
    edgeGeometry,
    lineMaterial(THREE, style.outlineColor, style.outlineOpacity),
  );
  line.name = 'V3_WEAPON_OUTLINE';
  line.frustumCulled = false;
  line.userData.appearanceRole = 'weapon-line';
  line.userData.exactV3Source = true;
  line.userData.sourceGeometryId = source.id;
  line.userData.sourceVertexCount = source.vertexCount;
  line.userData.sourceTriangleCount = source.triangleCount;
  return line;
}

function setPoint(attribute, index, point) {
  attribute.setXYZ(index, point.x, point.y, point.z);
}

function writeSegments(line, segments) {
  const attribute = line.geometry.attributes.position;
  if (segments.length * 2 !== attribute.count) {
    throw new Error(line.name + ' expected ' + attribute.count / 2 + ' segments, received ' + segments.length);
  }
  segments.forEach(([start, end], index) => {
    setPoint(attribute, index * 2, start);
    setPoint(attribute, index * 2 + 1, end);
  });
  attribute.needsUpdate = true;
}

function createJointNode(THREE, bone, style) {
  const node = new THREE.Mesh(
    new THREE.SphereGeometry(style.jointRadius, 8, 6),
    new THREE.MeshBasicMaterial({
      color: style.jointColor,
      transparent: true,
      opacity: style.jointOpacity,
      depthWrite: false,
    }),
  );
  node.name = 'WEAPON_NODE_' + bone.name;
  node.userData.appearanceRole = 'weapon-node';
  node.renderOrder = 3;
  bone.add(node);
  return node;
}

export function canCreateProceduralV3Weapon(THREE) {
  return Boolean(
    THREE?.Group
    && THREE?.Bone
    && THREE?.Vector3
    && THREE?.LineSegments
    && THREE?.BufferGeometry
    && THREE?.BufferAttribute
    && THREE?.EdgesGeometry
    && THREE?.LineBasicMaterial
    && THREE?.Mesh
    && THREE?.MeshBasicMaterial
    && THREE?.SphereGeometry,
  );
}

export function createProceduralV3Weapon(THREE, options = {}) {
  if (!canCreateProceduralV3Weapon(THREE)) {
    throw new Error('Procedural v3 weapon requires a Three.js-compatible namespace');
  }
  const definition = validateV3WeaponDefinition(options.definition || V3_LONGSWORD_DEFINITION);
  const sourceGeometry = definition.sourceGeometry;
  const style = createV3WeaponStyle(options.style);
  const { object3d, bones } = createWeaponHierarchy(THREE, definition);
  const skeletonLine = makeSegments(THREE, SKELETON_LINKS.length, style.skeletonColor, style.skeletonOpacity, 'V3_WEAPON_SKELETON');
  const glowLine = makeSegments(THREE, SKELETON_LINKS.length, style.glowColor, style.glowOpacity, 'V3_WEAPON_GLOW', true);
  const outlineLine = createExactV3Outline(THREE, style, sourceGeometry);
  object3d.add(outlineLine, skeletonLine, glowLine);
  const jointNodes = JOINT_NODE_IDS.map((nodeId) => createJointNode(THREE, bones[nodeId], style));
  const localPoints = Object.fromEntries(V3_WEAPON_REQUIRED_NODE_IDS.map((nodeId) => [nodeId, new THREE.Vector3()]));
  const skeletonSegments = SKELETON_LINKS.map(([startId, endId]) => [localPoints[startId], localPoints[endId]]);
  let nodesVisible = true;
  let glowVisible = true;

  function updateLocalPoints() {
    object3d.updateMatrixWorld(true);
    Object.entries(localPoints).forEach(([nodeId, point]) => {
      bones[nodeId].getWorldPosition(point);
      object3d.worldToLocal(point);
    });
  }

  function updateSkeleton() {
    writeSegments(skeletonLine, skeletonSegments);
    writeSegments(glowLine, skeletonSegments);
  }

  function update() {
    updateLocalPoints();
    updateSkeleton();
  }

  update();
  const sockets = Object.freeze({
    PRIMARY_GRIP: bones['weapon.root'],
    SECONDARY_GRIP: bones.secondary_grip,
    PARRY_POINT: bones['parry.point'],
    TRAIL_BASE: bones['blade.root'],
    TRAIL_TIP: bones['blade.tip'],
  });
  return {
    id: definition.id,
    definition,
    sourceGeometry,
    style,
    object3d,
    bones,
    sockets,
    jointNodes: Object.freeze(jointNodes),
    lines: Object.freeze({ outline: outlineLine, skeleton: skeletonLine, glow: glowLine }),
    blade: outlineLine,
    bladeBase: bones['blade.root'],
    bladeMid: bones['blade.mid'],
    parryPoint: bones['parry.point'],
    tip: bones['blade.tip'],
    trailBase: bones['blade.root'],
    trailTip: bones['blade.tip'],
    secondaryGrip: bones.secondary_grip,
    socketId: WEAPON_SOCKET_ID,
    get nodesVisible() { return nodesVisible; },
    get glowVisible() { return glowVisible; },
    setNodesVisible(value) {
      nodesVisible = value !== false;
      jointNodes.forEach((node) => { node.visible = nodesVisible; });
    },
    setGlowVisible(value) {
      glowVisible = value !== false;
      glowLine.visible = glowVisible;
    },
    getSweepSegment(startTarget = new THREE.Vector3(), endTarget = new THREE.Vector3()) {
      bones['blade.root'].getWorldPosition(startTarget);
      bones['blade.tip'].getWorldPosition(endTarget);
      return { start: startTarget, end: endTarget };
    },
    update,
  };
}
