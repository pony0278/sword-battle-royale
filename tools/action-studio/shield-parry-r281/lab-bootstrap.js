// R18M.C5 — startup asset loading and defender weapon-bind initialization only.
// Ready state, Guard entry, initial report, and initial attack ordering stay in the R281 entry.

import { createDebugSword, mountDebugSword } from '../../../src/character/debug-sword.js';
import { DEFAULT_KAYKIT_SWORD_MOUNT } from '../../../src/character/default-character-mount.js';
import { loadUal1AnimationLibrary } from '../../../src/animation/ual1-animation-library.js';
import { loadUal2AnimationLibrary } from '../../../src/animation/ual2-animation-library.js';
import { loadSkyrimConvertedAnimationLibrary } from '../../../src/animation/skyrim-converted-animation-library.js';
import { composeSkyrimWeaponMountCalibration } from '../../../src/animation/skyrim-weapon-bind-calibration.js';

export async function bootstrapShieldParryLabAssets({ THREE, attacker, defender, labStage }) {
  const [ual1, ual2, skyrim] = await Promise.all([
    loadUal1AnimationLibrary(new THREE.GLTFLoader(), { THREE, rig: attacker.rig, fps: 30 }),
    loadUal2AnimationLibrary(new THREE.GLTFLoader(), { THREE, rig: attacker.rig, fps: 30 }),
    loadSkyrimConvertedAnimationLibrary(new THREE.GLTFLoader(), { THREE, rig: defender.rig, fps: 30 }),
  ]);
  attacker.registerAnimations(ual1);
  attacker.registerAnimations(ual2);
  defender.registerAnimations(skyrim);

  const attackerIdleDuration = attacker.getAnimationDuration('UAL1/Sword_Idle') || 1;
  const idle = skyrim.clips.get('SKYRIM_GUARD/shd_blockidle');
  const bind = idle?.userData?.weaponBindCalibration;
  if (!bind?.correctionQuaternion) throw new Error(`${labStage} requires Skyrim Guard weapon bind calibration`);

  const defenderSword = createDebugSword(THREE);
  mountDebugSword(
    defender,
    defenderSword,
    composeSkyrimWeaponMountCalibration(THREE, DEFAULT_KAYKIT_SWORD_MOUNT, bind),
  );

  return Object.freeze({ attackerIdleDuration, defenderSword });
}
