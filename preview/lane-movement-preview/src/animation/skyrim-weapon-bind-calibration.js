import { resolveSkyrimSourceNodes } from './skyrim-animation-retarget.js';

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeQuaternionArray(input = [0, 0, 0, 1]) {
  const q = [
    finite(input[0]), finite(input[1]), finite(input[2]), finite(input[3], 1),
  ];
  const length = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return q.map((value) => value / length);
}

export function multiplyQuaternionArrays(aInput, bInput) {
  const a = normalizeQuaternionArray(aInput);
  const b = normalizeQuaternionArray(bInput);
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return normalizeQuaternionArray([
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]);
}

export function invertQuaternionArray(input) {
  const [x, y, z, w] = normalizeQuaternionArray(input);
  return [-x, -y, -z, w];
}

export function quaternionAngularErrorDegrees(aInput, bInput) {
  const a = normalizeQuaternionArray(aInput);
  const b = normalizeQuaternionArray(bInput);
  const relative = multiplyQuaternionArrays(invertQuaternionArray(a), b);
  const w = Math.min(1, Math.max(-1, Math.abs(relative[3])));
  return (2 * Math.acos(w) * 180) / Math.PI;
}

export function deriveSkyrimWeaponBindCorrection(sourceFrame, targetRestFrame) {
  return multiplyQuaternionArrays(invertQuaternionArray(targetRestFrame), sourceFrame);
}

function snapshotWorldQuaternion(object3d, THREE) {
  return object3d.getWorldQuaternion(new THREE.Quaternion()).normalize().toArray();
}

function applyDefinitionTransform(THREE, object3d, transform) {
  object3d.position.fromArray(transform.position || [0, 0, 0]);
  object3d.quaternion.fromArray(transform.quaternion || [0, 0, 0, 1]);
  object3d.scale.fromArray(transform.scale || [1, 1, 1]);
}

function createTargetRestProxy(THREE, rig) {
  const root = new THREE.Object3D();
  const bones = {};
  for (const definition of rig.definition.bones) {
    const bone = new THREE.Object3D();
    applyDefinitionTransform(THREE, bone, rig.restTransforms[definition.id]);
    (definition.parent ? bones[definition.parent] : root).add(bone);
    bones[definition.id] = bone;
  }
  root.updateMatrixWorld(true);
  return { root, bones };
}

export function computeSkyrimWeaponBindCalibration(THREE, sourceRoot, rig, retargetedClip) {
  if (!THREE?.Quaternion || !THREE?.Object3D || !THREE?.Euler) {
    throw new Error('G2.4.5 weapon bind calibration requires THREE quaternion/object runtime');
  }
  if (!sourceRoot || !rig?.definition || !rig?.restTransforms) {
    throw new Error('G2.4.5 weapon bind calibration requires source hierarchy and target rig');
  }

  sourceRoot.updateMatrixWorld(true);
  const sourceReport = resolveSkyrimSourceNodes(sourceRoot);
  const sourceWeapon = sourceReport.nodes?.['handslot.r'];
  if (!sourceWeapon) throw new Error('G2.4.5 cannot find Skyrim Weapon helper');

  const basisArray = retargetedClip?.userData?.basisCalibration?.quaternion;
  if (!Array.isArray(basisArray) || basisArray.length !== 4) {
    throw new Error('G2.4.5 requires accepted G2.4.2 basis calibration metadata');
  }

  const sourceWorld = snapshotWorldQuaternion(sourceWeapon, THREE);
  // Absolute source helper frame: C * Q_source. Unlike a rotation delta, this is
  // intentionally not conjugated by C^-1 because only the world basis changes.
  const convertedSourceFrame = multiplyQuaternionArrays(basisArray, sourceWorld);

  const targetProxy = createTargetRestProxy(THREE, rig);
  const targetRestFrame = snapshotWorldQuaternion(targetProxy.bones['handslot.r'], THREE);
  const correction = deriveSkyrimWeaponBindCorrection(convertedSourceFrame, targetRestFrame);

  const angleDegrees = quaternionAngularErrorDegrees([0, 0, 0, 1], correction);
  return Object.freeze({
    method: 'inverse-target-rest-times-converted-source-weapon-rest',
    sourceNode: sourceWeapon.name || 'Weapon',
    targetBone: 'handslot.r',
    sourceConvertedRestFrame: Object.freeze(convertedSourceFrame.map((value) => Number(value.toFixed(8)))),
    targetRestFrame: Object.freeze(targetRestFrame.map((value) => Number(value.toFixed(8)))),
    correctionQuaternion: Object.freeze(correction.map((value) => Number(value.toFixed(8)))),
    correctionAngleDegrees: Number(angleDegrees.toFixed(6)),
  });
}

export function composeSkyrimWeaponMountCalibration(THREE, baseMount = {}, bindCalibration = {}) {
  if (!THREE?.Quaternion || !THREE?.Euler) throw new Error('Skyrim weapon mount composition requires THREE Quaternion/Euler');
  const correction = bindCalibration?.correctionQuaternion;
  if (!Array.isArray(correction) || correction.length !== 4) {
    throw new Error('Skyrim weapon mount composition requires a G2.4.5 correction quaternion');
  }

  const baseRotation = baseMount.rotation || {};
  const baseQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    finite(baseRotation.x), finite(baseRotation.y), finite(baseRotation.z), 'XYZ',
  ));
  const correctionQuaternion = new THREE.Quaternion().fromArray(correction).normalize();
  const combined = correctionQuaternion.multiply(baseQuaternion).normalize();
  const euler = new THREE.Euler().setFromQuaternion(combined, 'XYZ');
  const position = baseMount.position || {};
  const scale = baseMount.scale || {};

  return Object.freeze({
    position: Object.freeze({
      x: finite(position.x), y: finite(position.y), z: finite(position.z),
    }),
    rotation: Object.freeze({ x: euler.x, y: euler.y, z: euler.z }),
    scale: Object.freeze({
      x: finite(scale.x, 1), y: finite(scale.y, 1), z: finite(scale.z, 1),
    }),
  });
}

export function measureSkyrimWeaponFrameErrorDegrees(THREE, sourceWeapon, targetSocket, basisArray, bindCalibration) {
  if (!sourceWeapon || !targetSocket) return 180;
  const correction = bindCalibration?.correctionQuaternion;
  if (!Array.isArray(basisArray) || !Array.isArray(correction)) return 180;

  const sourceWorld = snapshotWorldQuaternion(sourceWeapon, THREE);
  const convertedSourceFrame = multiplyQuaternionArrays(basisArray, sourceWorld);
  const targetSocketFrame = snapshotWorldQuaternion(targetSocket, THREE);
  const correctedTargetFrame = multiplyQuaternionArrays(targetSocketFrame, correction);
  return quaternionAngularErrorDegrees(convertedSourceFrame, correctedTargetFrame);
}
