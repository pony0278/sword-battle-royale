import { applyMountCalibration } from '../character/character-sockets.js';

export function createGuardWeaponMountRuntime(options = {}) {
  const weaponObject3d = options.weaponObject3d || options.weapon?.object3d || null;
  const profiles = options.profiles || {};
  if (!weaponObject3d) throw new Error('Guard weapon mount runtime requires a weapon Object3D');

  let currentProfileId = null;
  let applicationCount = 0;

  function apply(profileId) {
    const id = String(profileId || '');
    if (!id) return Object.freeze({ applied: false, reason: 'no-profile', profileId: currentProfileId });
    if (id === currentProfileId) {
      return Object.freeze({ applied: false, reason: 'already-active', profileId: currentProfileId });
    }
    const calibration = profiles[id];
    if (!calibration) throw new Error(`Unknown Guard weapon mount profile: ${id}`);
    const normalized = applyMountCalibration(weaponObject3d, calibration);
    currentProfileId = id;
    applicationCount += 1;
    return Object.freeze({
      applied: true,
      profileId: id,
      calibration: normalized,
      applicationCount,
    });
  }

  return Object.freeze({
    apply,
    get currentProfileId() { return currentProfileId; },
    get applicationCount() { return applicationCount; },
  });
}
