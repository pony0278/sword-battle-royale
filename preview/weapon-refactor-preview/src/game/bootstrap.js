// R18M.C5 — startup asset loading and defender weapon-bind initialization only.
// Ready state, Guard entry, initial report, and initial attack ordering stay in the R281 entry.

import { createDebugSword, mountDebugSword } from '../character/debug-sword.js';
import { LONGSWORD } from './weapon.js';
import { DEFAULT_KAYKIT_SWORD_MOUNT } from '../character/default-character-mount.js';
import { loadUal1AnimationLibrary } from '../animation/ual1-animation-library.js';
import { loadUal2AnimationLibrary } from '../animation/ual2-animation-library.js';
import { loadSkyrimConvertedAnimationLibrary } from '../animation/skyrim-converted-animation-library.js';
import { loadKayKitAnimationLibrary } from '../animation/kaykit-animation-library.js';
import { composeSkyrimWeaponMountCalibration } from '../animation/skyrim-weapon-bind-calibration.js';
import { retargetedLibraryMayBeShared } from '../animation/retargeted-library-sharing.js';
import { LANE_WALK_CLIPS } from '../combat/lane-walk-cycle.js';
import { SPRINT_ARM_CLIP_CANDIDATES } from '../combat/sprint-arm-overlay.js';

// R19I.1: the clip both fighters stand in when nobody has chosen anything yet. The attacker
// already idled on it out of combat; the defender now shares it so "no state" is one pose for
// both of them rather than a guard on one side and a rest pose on the other.
export const NEUTRAL_IDLE_CLIP_ID = 'UAL1/Sword_Idle';

// R20W.1: which walk clips play is now a measured decision rather than a local constant, so it
// lives with the measurements. The two directions are different clips rather than one played
// backwards: a reversed walk reads as a moonwalk, because the foot that plants is the wrong one.
export { LANE_WALK_CLIPS };

export async function bootstrapShieldParryLabAssets({ THREE, attacker, defender, labStage }) {
  const [ual1, ual2, skyrim, kaykit, defenderUal1] = await Promise.all([
    loadUal1AnimationLibrary(new THREE.GLTFLoader(), { THREE, rig: attacker.rig, fps: 30 }),
    // Cold start: only the clips a weapon actually names. UAL2 ships eight and the game plays two -
    // measured, the other six (Regular_C, Regular_Combo, Heavy_Combo, Dash, Block, Hit_Knockback)
    // have no consumer anywhere but comments, and cost 1.35MB on every first visit. The list is
    // DERIVED from the weapon rather than written here, so adding a move loads its clip and nothing
    // has to be kept in step by hand.
    loadUal2AnimationLibrary(new THREE.GLTFLoader(), { THREE, rig: attacker.rig, fps: 30, clipIds: LONGSWORD.attackTimings.clipIds }),
    loadSkyrimConvertedAnimationLibrary(new THREE.GLTFLoader(), { THREE, rig: defender.rig, fps: 30 }),
    // R19C.2: locomotion. These are KayKit's own clips on KayKit's own rig, so they need no
    // retarget - which is why they are loaded straight rather than through one of the fitted
    // libraries above.
    // R19K.1 adds 'general', which is where the Hit_A / Hit_B / Melee_Block_Hit reactions live.
    loadKayKitAnimationLibrary(new THREE.GLTFLoader(), { packIds: ['basic', 'advanced', 'general'] }),
    // R19I.1: the defender's out-of-combat idle, loaded on their own rig. R23D.1 measured that
    // this second copy is not required - a retargeted pack registers cleanly on either fighter -
    // but it is what ships and works, and this stage ADDS reach rather than re-sourcing what
    // already has it. Dropping the duplicate load is a separate change with its own gate run:
    // nothing here would catch a neutral idle that started looking wrong.
    loadUal1AnimationLibrary(new THREE.GLTFLoader(), { THREE, rig: defender.rig, fps: 30 }),
  ]);

  // R23D.1 - both fighters get both families, because a duel is not one-directional.
  //
  // Before this the packs were split by ROLE: the attacker got the swing clips and the defender
  // got the guard clips, which is exactly right for a lab where one fighter attacks and the other
  // defends, and exactly wrong for a mirror duel. Measured on the shipping page: the attacker's rig
  // carried no guard clip at all, so R23B.1's attackerFighter had every guard runtime and nothing
  // to play; the defender could swing TOP (their own UAL1 copy carries Sword_Attack) but RIGHT and
  // LEFT live in UAL2 and would have thrown `Unknown KayKit animation` on the first frame.
  //
  // The sharing is free rather than cheap: no extra bytes, no second retarget. See
  // retargeted-library-sharing.js for the measurement and the reason, and for the refusal below,
  // which is the point - the day the two fighters stop being the same body, this throws on load
  // instead of playing one fighter's proportions on the other.
  const sharing = retargetedLibraryMayBeShared(attacker.rig, defender.rig);
  if (!sharing.shareable) {
    throw new Error(`${labStage} cannot share retargeted clips between the fighters: ${sharing.reason}`);
  }

  attacker.registerAnimations(ual1);
  attacker.registerAnimations(ual2);
  attacker.registerAnimations(kaykit);
  // The guard, on the fighter who has never defended. Nothing plays it yet: no caller asks the
  // attacker to guard until step 6, and the golden grid, the parry gate and the defence matrix all
  // reproducing byte for byte is what says so.
  attacker.registerAnimations(skyrim);
  defender.registerAnimations(skyrim);
  // R19E.1: the defender walks too - their legs borrow the same locomotion clips the attacker
  // uses, overlaid under the Skyrim guard rather than replacing it.
  defender.registerAnimations(kaykit);
  defender.registerAnimations(defenderUal1);
  // And the two lateral swings, on the fighter who has never attacked. Same silence, same proof.
  defender.registerAnimations(ual2);

  const attackerIdleDuration = attacker.getAnimationDuration('UAL1/Sword_Idle') || 1;
  const idle = skyrim.clips.get('SKYRIM_GUARD/shd_blockidle');
  const bind = idle?.userData?.weaponBindCalibration;
  if (!bind?.correctionQuaternion) throw new Error(`${labStage} requires Skyrim Guard weapon bind calibration`);

  const defenderSword = createDebugSword(THREE);
  // R23E.1: both mounts, named and kept. The Skyrim one is what the defender is mounted with and
  // what ships; the KayKit one is the attacker's, and the only reason to hold on to it is that a
  // fighter who both guards and swings needs to be able to change between them. Composed once here
  // because the correction is read out of the loaded clip and this is the only place that has it.
  const defenderMounts = Object.freeze({
    'skyrim-guard-calibrated': composeSkyrimWeaponMountCalibration(THREE, DEFAULT_KAYKIT_SWORD_MOUNT, bind),
    'kaykit-default': DEFAULT_KAYKIT_SWORD_MOUNT,
  });
  mountDebugSword(defender, defenderSword, defenderMounts['skyrim-guard-calibrated']);

  const defenderIdleDuration = defender.getAnimationDuration(NEUTRAL_IDLE_CLIP_ID) || 1;
  // R20W.2: measured off the registered clips rather than restated, and keyed by clip id because
  // the gait picks between three of them now - walk, backwards walk and run.
  // R21Y.1: and every clip the sprint's arms may be borrowed from, not just the one LANE_WALK_CLIPS
  // names. Missing, a candidate falls back to a 1-second duration here and is then sampled 25% off
  // its own 0.8s cycle - the arms would swing against the feet, which is the exact failure the
  // phase alignment exists to prevent, arriving through a lookup rather than through the maths.
  const locomotionClipDurations = Object.freeze(Object.fromEntries(
    [...new Set([...Object.values(LANE_WALK_CLIPS), ...SPRINT_ARM_CLIP_CANDIDATES])]
      .map((clipId) => [clipId, attacker.getAnimationDuration(clipId) || 1]),
  ));
  return Object.freeze({
    attackerIdleDuration, defenderIdleDuration, locomotionClipDurations, defenderSword, defenderMounts,
    // R23D.1: what was shared and on whose say-so, so the page can report it rather than the
    // reader having to trust this file.
    librarySharing: sharing,
  });
}
