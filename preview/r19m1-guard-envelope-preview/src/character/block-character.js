import { createBlockRig } from './block-rig.js';
import { createCharacterSockets, attachEquipment } from './character-sockets.js';
import { applyPoseToBlockRig } from '../animation/pose-applier.js';

export function createBlockCharacter(THREE, options = {}) {
  const rig = createBlockRig(THREE, options);
  const sockets = createCharacterSockets(THREE, rig);
  return {
    object3d: rig.root,
    rig,
    sockets,
    applyPose(pose) {
      return applyPoseToBlockRig(rig, pose);
    },
    attach(socketId, object3d, calibration) {
      return attachEquipment(sockets, socketId, object3d, calibration);
    },
  };
}

