import { WEAPON_SOCKET_ID } from './character-sockets.js';
import { createProceduralV3Longsword } from './procedural-v3-longsword.js';

export const DEFAULT_SWORD_MOUNT = Object.freeze({
  position: Object.freeze({ x: 0, y: 0, z: 0 }),
  rotation: Object.freeze({ x: 0, y: 0, z: 0 }),
  scale: Object.freeze({ x: 1, y: 1, z: 1 }),
});

export function createDebugSword(THREE, options = {}) {
  return createProceduralV3Longsword(THREE, {
    definition: options.definition,
    style: options.style,
  });
}

export function mountDebugSword(character, weapon, calibration = DEFAULT_SWORD_MOUNT) {
  character.attach(WEAPON_SOCKET_ID, weapon.object3d, calibration);
  return weapon;
}
