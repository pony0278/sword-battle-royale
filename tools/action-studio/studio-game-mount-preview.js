// Show the blade at the angle the GAME holds it, without letting that angle become the author's.
//
// MEASURED, on 2hm_idle, against the haft direction the clip itself carries (both hands are on the
// haft in the source, so R hand -> L hand IS the haft; ours is the weapon's own +Y; both read in an
// anatomical frame so neither file's axis convention is trusted):
//
//   studio's own mount     40.8 deg off the clip's haft
//   game's mount           22.9 deg off
//
// src/game/bootstrap.js mounts a Skyrim-driven fighter with DEFAULT_KAYKIT_SWORD_MOUNT composed
// with that clip's G2.4.5 weapon bind; the studio mounts once at startup with the author's dialled
// calibration and never composes. The two differ by 112.1 degrees.
//
// WHY THIS IS AN OVERLAY AND NOT A SWAP. `mountCalibration` in the entry is the AUTHOR'S base: the
// Weapon Mount dial renders it, Save writes it, project JSON carries it, and setProject writes it
// back on every project load, autosave restore and combo build. Worse, Bake Pose Keys solves poses
// against the sword's world grip and writes the result into clip.poses - authored data that ships.
// A composed mount living in that variable would make the dial lie, compose a second time on the
// first nudge of any axis, and silently bake poses against a blade the author never chose.
//
// So: the base stays in the entry, this writes only the Object3D, it is idempotent, and it hands
// the base back on demand (withBaseMount) for anything that reads real geometry.
import { applyMountCalibration } from '../../src/character/character-sockets.js';
import { composeSkyrimWeaponMountCalibration } from '../../src/animation/skyrim-weapon-bind-calibration.js';

export const GAME_MOUNT_PREVIEW_STAGE = 'the-blade-at-the-angle-the-game-holds-it';

// composeSkyrimWeaponMountCalibration throws without a correction quaternion, and most clips have
// none - every authored template, every KayKit and UAL clip, and the virtual production-parry clips
// the Skyrim library derives. Asked rather than assumed, following the Guard Runtime's own guard.
export function readWeaponBind(clip) {
  const bind = clip?.userData?.weaponBindCalibration;
  return Array.isArray(bind?.correctionQuaternion) ? bind : null;
}

export function createStudioGameMountPreview(THREE, { getWeapon, getBaseMount, getBoundClip }) {
  const toggle = document.getElementById('gameMount');
  const status = document.getElementById('gameMountStatus');
  // What is on the blade right now, so update() can stay idempotent without re-writing a transform
  // sixty times a second.
  let applied = null;

  function write(calibration, label) {
    const weapon = getWeapon();
    if (!weapon?.object3d) return;
    applyMountCalibration(weapon.object3d, calibration);
    weapon.object3d.updateMatrixWorld?.(true);
    applied = label;
  }

  function baseMount() {
    return getBaseMount();
  }

  return {
    get applied() { return applied; },

    // Called each frame, after the weapon has followed the hand and before anything reads its
    // sockets - the off-hand grip IK aims at SECONDARY_GRIP, so the blade has to be where it will
    // be drawn before the arm is solved.
    update() {
      const bind = toggle?.checked ? readWeaponBind(getBoundClip()) : null;
      if (!bind) {
        if (applied !== 'author') write(baseMount(), 'author');
        if (status && toggle) {
          status.textContent = toggle.checked
            ? 'game mount · not applied · this clip carries no Skyrim weapon bind'
            : 'game mount · off · the blade wears the mount dial';
        }
        return;
      }
      write(composeSkyrimWeaponMountCalibration(THREE, baseMount(), bind), 'game');
      if (status) {
        status.textContent = `game mount · on · ${bind.correctionAngleDegrees.toFixed(1)}° `
          + 'composed onto the dial, as src/game/bootstrap.js mounts it';
      }
    },

    // Anything that reads the blade as GEOMETRY rather than as a picture runs in here. Bake Pose
    // Keys is the one that matters: it solves against the sword's world grip and writes the answer
    // into clip.poses, so a pose baked under a preview mount would be permanently wrong.
    withBaseMount(run) {
      const previous = applied;
      write(baseMount(), 'author');
      try {
        return run();
      } finally {
        if (previous === 'game') this.update();
      }
    },

    // The stage weapon selector builds a new sword; whatever was on the old one is not on this one.
    invalidate() {
      applied = null;
    },
  };
}
