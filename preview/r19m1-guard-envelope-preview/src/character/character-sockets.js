export const CHARACTER_SOCKET_IDS = Object.freeze([
  'HAND_L',
  'HAND_R',
  'HEAD',
  'BACK',
  'HIP_L',
  'HIP_R',
]);

export const WEAPON_SOCKET_ID = 'HAND_R';

export const IDENTITY_MOUNT_CALIBRATION = Object.freeze({
  position: Object.freeze({ x: 0, y: 0, z: 0 }),
  rotation: Object.freeze({ x: 0, y: 0, z: 0 }),
  scale: Object.freeze({ x: 1, y: 1, z: 1 }),
});

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeMountCalibration(input = {}) {
  const position = input.position || {};
  const rotation = input.rotation || {};
  const sourceScale = input.scale;
  const scale = typeof sourceScale === 'number'
    ? { x: sourceScale, y: sourceScale, z: sourceScale }
    : (sourceScale || {});
  return {
    position: {
      x: finiteOr(position.x, 0),
      y: finiteOr(position.y, 0),
      z: finiteOr(position.z, 0),
    },
    rotation: {
      x: finiteOr(rotation.x, 0),
      y: finiteOr(rotation.y, 0),
      z: finiteOr(rotation.z, 0),
    },
    scale: {
      x: Math.max(0.001, finiteOr(scale.x, 1)),
      y: Math.max(0.001, finiteOr(scale.y, 1)),
      z: Math.max(0.001, finiteOr(scale.z, 1)),
    },
  };
}

function createSocket(THREE, name, parent, position) {
  if (!parent || typeof parent.add !== 'function') throw new Error(`Cannot create ${name}: missing rig parent`);
  const socket = new THREE.Group();
  socket.name = name;
  socket.userData.socketId = name;
  socket.position.set(position.x, position.y, position.z);
  parent.add(socket);
  return socket;
}

export function createCharacterSockets(THREE, rig) {
  const spec = rig.spec;
  const sockets = {
    HAND_L: createSocket(THREE, 'HAND_L', rig.arms.L.wrist, { x: 0, y: -0.22 * spec.fist, z: 0 }),
    HAND_R: createSocket(THREE, 'HAND_R', rig.arms.R.wrist, { x: 0, y: -0.22 * spec.fist, z: 0 }),
    HEAD: createSocket(THREE, 'HEAD', rig.headPivot, { x: 0, y: spec.headSize * 0.88, z: 0 }),
    BACK: createSocket(THREE, 'BACK', rig.spine, { x: 0, y: spec.bodyH * 0.52, z: -spec.bodyD * 0.54 }),
    HIP_L: createSocket(THREE, 'HIP_L', rig.pelvis, { x: -spec.legSpread, y: rig.measurements.hipY, z: 0 }),
    HIP_R: createSocket(THREE, 'HIP_R', rig.pelvis, { x: spec.legSpread, y: rig.measurements.hipY, z: 0 }),
  };
  return Object.freeze(sockets);
}

export function requireCharacterSocket(sockets, socketId) {
  const socket = sockets?.[socketId];
  if (!socket) throw new Error(`Unknown character socket: ${socketId}`);
  return socket;
}

export function applyMountCalibration(object3d, input = {}) {
  if (!object3d) throw new Error('Cannot calibrate an empty equipment object');
  const calibration = normalizeMountCalibration(input);
  object3d.position.set(calibration.position.x, calibration.position.y, calibration.position.z);
  object3d.rotation.set(calibration.rotation.x, calibration.rotation.y, calibration.rotation.z);
  object3d.scale.set(calibration.scale.x, calibration.scale.y, calibration.scale.z);
  return calibration;
}

export function attachEquipment(sockets, socketId, object3d, calibration = {}) {
  if (!object3d || typeof object3d !== 'object') throw new Error('Equipment must be an Object3D-like value');
  const socket = requireCharacterSocket(sockets, socketId);
  socket.add(object3d);
  applyMountCalibration(object3d, calibration);
  object3d.userData = object3d.userData || {};
  object3d.userData.attachedSocket = socketId;
  return object3d;
}

