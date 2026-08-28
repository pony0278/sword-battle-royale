import { KAYKIT_RIG_MEDIUM_DEFINITION } from './kaykit-rig-definition.js';
import { sanitizeAnimationTargetName } from '../animation/animation-target-name.js';
import {
  canCreateKayKitV3LineAppearance,
  createKayKitV3LineAppearance,
} from './kaykit-v3-line-appearance.js';

export const KAYKIT_REQUIRED_BONE_IDS = Object.freeze([
  'root', 'hips', 'spine', 'chest', 'head',
  'upperarm.l', 'lowerarm.l', 'wrist.l', 'hand.l', 'handslot.l',
  'upperarm.r', 'lowerarm.r', 'wrist.r', 'hand.r', 'handslot.r',
  'upperleg.l', 'lowerleg.l', 'foot.l', 'toes.l',
  'upperleg.r', 'lowerleg.r', 'foot.r', 'toes.r',
]);

export const DEFAULT_KAYKIT_APPEARANCE = Object.freeze({
  scale: 1,
  headScale: 1,
  shoulderScale: 1,
  limbThickness: 1,
  jointScale: 1,
  colors: Object.freeze({
    skin: 0xe2b986,
    cloth: 0x3763d8,
    clothDark: 0x253463,
    joint: 0x244aa8,
    accent: 0x55e6c1,
    shoe: 0x121622,
  }),
});

function finitePositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function createKayKitAppearance(input = {}) {
  return {
    scale: finitePositive(input.scale, DEFAULT_KAYKIT_APPEARANCE.scale),
    headScale: finitePositive(input.headScale, DEFAULT_KAYKIT_APPEARANCE.headScale),
    shoulderScale: finitePositive(input.shoulderScale, DEFAULT_KAYKIT_APPEARANCE.shoulderScale),
    limbThickness: finitePositive(input.limbThickness, DEFAULT_KAYKIT_APPEARANCE.limbThickness),
    jointScale: finitePositive(input.jointScale, DEFAULT_KAYKIT_APPEARANCE.jointScale),
    colors: { ...DEFAULT_KAYKIT_APPEARANCE.colors, ...(input.colors || {}) },
  };
}

export function validateKayKitRigDefinition(definition = KAYKIT_RIG_MEDIUM_DEFINITION) {
  if (definition?.format !== 'procedural-humanoid-rig') throw new Error('Invalid procedural rig format');
  const boneIds = new Set();
  for (const bone of definition.bones || []) {
    if (!bone?.id || boneIds.has(bone.id)) throw new Error(`Invalid or duplicate bone id: ${bone?.id}`);
    if (bone.parent && !boneIds.has(bone.parent)) {
      throw new Error(`Bone ${bone.id} appears before missing parent ${bone.parent}`);
    }
    boneIds.add(bone.id);
  }
  const missingBones = KAYKIT_REQUIRED_BONE_IDS.filter((id) => !boneIds.has(id));
  if (missingBones.length) throw new Error(`KayKit rig is missing bones: ${missingBones.join(', ')}`);
  for (const [socketId, socket] of Object.entries(definition.sockets || {})) {
    if (!boneIds.has(socket.parent)) throw new Error(`Socket ${socketId} has missing parent ${socket.parent}`);
  }
  return definition;
}

function applyDefinitionTransform(THREE, object3d, definition) {
  if (definition.matrix) {
    const matrix = new THREE.Matrix4().fromArray(definition.matrix);
    matrix.decompose(object3d.position, object3d.quaternion, object3d.scale);
    return;
  }
  object3d.position.fromArray(definition.position || [0, 0, 0]);
  object3d.quaternion.fromArray(definition.quaternion || [0, 0, 0, 1]);
  object3d.scale.fromArray(definition.scale || [1, 1, 1]);
}

function snapshotTransform(object3d) {
  return Object.freeze({
    position: Object.freeze(object3d.position.toArray()),
    quaternion: Object.freeze(object3d.quaternion.toArray()),
    scale: Object.freeze(object3d.scale.toArray()),
  });
}

export function restoreProceduralKayKitRestPose(rig) {
  for (const [boneId, transform] of Object.entries(rig.restTransforms)) {
    const bone = rig.bones[boneId];
    bone.position.fromArray(transform.position);
    bone.quaternion.fromArray(transform.quaternion);
    bone.scale.fromArray(transform.scale);
  }
  return rig;
}

function createBoneHierarchy(THREE, definition) {
  const root = new THREE.Group();
  root.name = 'PROCEDURAL_KAYKIT_RIG';
  const motionRoot = new THREE.Group();
  motionRoot.name = 'MOTION_ROOT';
  root.add(motionRoot);
  const bones = {};
  const restTransforms = {};

  for (const boneDefinition of definition.bones) {
    const bone = new THREE.Bone();
    bone.name = sanitizeAnimationTargetName(boneDefinition.id);
    applyDefinitionTransform(THREE, bone, boneDefinition);
    const parent = boneDefinition.parent ? bones[boneDefinition.parent] : motionRoot;
    if (!parent) throw new Error(`Cannot create ${boneDefinition.id}: missing ${boneDefinition.parent}`);
    parent.add(bone);
    bones[boneDefinition.id] = bone;
    restTransforms[boneDefinition.id] = snapshotTransform(bone);
  }
  return { root, motionRoot, bones, restTransforms };
}

function createSockets(THREE, definitions, bones) {
  const sockets = {};
  for (const [socketId, definition] of Object.entries(definitions)) {
    const socket = new THREE.Group();
    socket.name = socketId;
    socket.userData.socketId = socketId;
    socket.userData.procedural = true;
    applyDefinitionTransform(THREE, socket, definition);
    bones[definition.parent].add(socket);
    sockets[socketId] = socket;
  }
  return Object.freeze(sockets);
}

export function createProceduralKayKitRig(THREE, options = {}) {
  if (!THREE?.Group || !THREE?.Bone || !THREE?.Mesh) {
    throw new Error('createProceduralKayKitRig requires a Three.js-compatible namespace');
  }
  const definition = validateKayKitRigDefinition(options.definition || KAYKIT_RIG_MEDIUM_DEFINITION);
  const appearance = createKayKitAppearance(options.appearance);
  const hierarchy = createBoneHierarchy(THREE, definition);
  const sockets = createSockets(THREE, definition.sockets, hierarchy.bones);
  const meshes = Object.freeze([]);
  hierarchy.root.scale.setScalar(appearance.scale);
  hierarchy.root.userData.rigId = definition.id;
  hierarchy.root.userData.procedural = true;

  const rig = {
    ...hierarchy,
    definition,
    appearance,
    sockets,
    meshes,
    groundBoneIds: Object.freeze(['foot.l', 'toes.l', 'foot.r', 'toes.r']),
    groundPointScratch: Object.freeze([
      new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),
    ]),
    rootPositionScratch: new THREE.Vector3(),
    joints: Object.freeze({
      ROOT: hierarchy.bones.root,
      PELVIS: hierarchy.bones.hips,
      SPINE: hierarchy.bones.spine,
      CHEST: hierarchy.bones.chest,
      HEAD: hierarchy.bones.head,
      SHOULDER_L: hierarchy.bones['upperarm.l'],
      ELBOW_L: hierarchy.bones['lowerarm.l'],
      WRIST_L: hierarchy.bones['wrist.l'],
      SHOULDER_R: hierarchy.bones['upperarm.r'],
      ELBOW_R: hierarchy.bones['lowerarm.r'],
      WRIST_R: hierarchy.bones['wrist.r'],
      HIP_L: hierarchy.bones['upperleg.l'],
      KNEE_L: hierarchy.bones['lowerleg.l'],
      ANKLE_L: hierarchy.bones['foot.l'],
      HIP_R: hierarchy.bones['upperleg.r'],
      KNEE_R: hierarchy.bones['lowerleg.r'],
      ANKLE_R: hierarchy.bones['foot.r'],
    }),
  };
  rig.lineAppearance = canCreateKayKitV3LineAppearance(THREE)
    ? createKayKitV3LineAppearance(THREE, rig, options.lineStyle)
    : null;
  rig.renderStyle = 'v3-rig-line';
  rig.updateAppearance = (camera) => rig.lineAppearance?.update(camera);
  return rig;
}
