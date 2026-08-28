// R18M.C5 — startup asset loading and defender weapon-bind initialization only.
// Ready state, Guard entry, initial report, and initial attack ordering stay in the R281 entry.

import { createDebugSword, mountDebugSword } from '../../../src/character/debug-sword.js';
import { DEFAULT_KAYKIT_SWORD_MOUNT } from '../../../src/character/default-character-mount.js';
import { loadUal1AnimationLibrary } from '../../../src/animation/ual1-animation-library.js';
import { loadUal2AnimationLibrary } from '../../../src/animation/ual2-animation-library.js';
import { loadSkyrimConvertedAnimationLibrary } from '../../../src/animation/skyrim-converted-animation-library.js';
import { loadKayKitAnimationLibrary } from '../../../src/animation/kaykit-animation-library.js';
import { composeSkyrimWeaponMountCalibration } from '../../../src/animation/skyrim-weapon-bind-calibration.js';

// The two directions are different clips rather than one played backwards: a reversed walk reads
// as a moonwalk, because the foot that plants is the wrong one.
// R19I.1: the clip both fighters stand in when nobody has chosen anything yet. The attacker
// already idled on it out of combat; the defender now shares it so "no state" is one pose for
// both of them rather than a guard on one side and a rest pose on the other.
export const NEUTRAL_IDLE_CLIP_ID = 'UAL1/Sword_Idle';

export const ATTACKER_WALK_CLIPS = Object.freeze({
  forward: 'Walking_A',
  backward: 'Walking_Backwards',
});

export async function bootstrapShieldParryLabAssets({ THREE, attacker, defender, labStage }) {
  const [ual1, ual2, skyrim, kaykit, defenderUal1] = await Promise.all([
    loadUal1AnimationLibrary(new THREE.GLTFLoader(), { THREE, rig: attacker.rig, fps: 30 }),
    loadUal2AnimationLibrary(new THREE.GLTFLoader(), { THREE, rig: attacker.rig, fps: 30 }),
    loadSkyrimConvertedAnimationLibrary(new THREE.GLTFLoader(), { THREE, rig: defender.rig, fps: 30 }),
    // R19C.2: locomotion. These are KayKit's own clips on KayKit's own rig, so they need no
    // retarget - which is why they are loaded straight rather than through one of the fitted
    // libraries above.
    // R19K.1 adds 'general', which is where the Hit_A / Hit_B / Melee_Block_Hit reactions live.
    loadKayKitAnimationLibrary(new THREE.GLTFLoader(), { packIds: ['basic', 'advanced', 'general'] }),
    // R19I.1: the defender's out-of-combat idle. A second fitted copy rather than sharing the
    // attacker's, because the UAL libraries are retargeted onto the rig they are loaded with -
    // that is exactly why KayKit below could be shared and these cannot.
    loadUal1AnimationLibrary(new THREE.GLTFLoader(), { THREE, rig: defender.rig, fps: 30 }),
  ]);
  attacker.registerAnimations(ual1);
  attacker.registerAnimations(ual2);
  attacker.registerAnimations(kaykit);
  defender.registerAnimations(skyrim);
  // R19E.1: the defender walks too - their legs borrow the same locomotion clips the attacker
  // uses, overlaid under the Skyrim guard rather than replacing it.
  defender.registerAnimations(kaykit);
  defender.registerAnimations(defenderUal1);

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

  const defenderIdleDuration = defender.getAnimationDuration(NEUTRAL_IDLE_CLIP_ID) || 1;
  const walkForwardDuration = attacker.getAnimationDuration(ATTACKER_WALK_CLIPS.forward) || 1;
  const walkBackwardDuration = attacker.getAnimationDuration(ATTACKER_WALK_CLIPS.backward) || 1;
  return Object.freeze({
    attackerIdleDuration, defenderIdleDuration, walkForwardDuration, walkBackwardDuration, defenderSword,
  });
}
