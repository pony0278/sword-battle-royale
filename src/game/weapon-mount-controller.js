import { applyMountCalibration } from '../character/character-sockets.js';
import { GUARD_WEAPON_MOUNT_PROFILE_IDS } from '../combat/guard-counter-presentation.js';
import { WEAPON_MOUNT_MODE_DEFAULT, planWeaponMount } from '../combat/weapon-mount-policy.js';

export const WEAPON_MOUNT_CONTROLLER_STAGE = 'R23E.1';

// R23E.1 — the one writer of a sword's mount, and the only place it is written after boot.
//
// Measured before this existed: the mount is a local quaternion on the weapon's own Object3D, set
// once by attachEquipment at mount time and never touched again. The live grip constraint READS the
// sword's world transform all over the place and writes only bones; the guard presentation runtime
// can write a weapon transform but is constructed without a weaponObject3d in the shipping path, so
// its mount-profile machinery has always been inert here. One writer, and this becomes it.
//
// Written on CHANGE rather than every frame. Not for speed - it is four numbers - but because a
// per-frame write would make this a pose writer competing with the chain, and it is not one: the
// mount is a property of how the weapon is held, not of what the body is doing this frame.
export function createWeaponMountController({
  weapon, mounts, mode = WEAPON_MOUNT_MODE_DEFAULT, readGuardState = () => null,
}) {
  const object3d = weapon?.object3d;
  if (!object3d?.quaternion) throw new Error('R23E.1 weapon mount control requires a mounted weapon');
  // The same calibration shape mountDebugSword takes, applied by the same function attachEquipment
  // uses. A mount is not re-derived here - swapping one means putting back a calibration that was
  // already computed at load, which is why the two are handed in rather than built.
  const byProfile = {
    [GUARD_WEAPON_MOUNT_PROFILE_IDS.SKYRIM_GUARD]:
      requireCalibration(mounts?.[GUARD_WEAPON_MOUNT_PROFILE_IDS.SKYRIM_GUARD], 'skyrim-guard-calibrated'),
    [GUARD_WEAPON_MOUNT_PROFILE_IDS.KAYKIT_DEFAULT]:
      requireCalibration(mounts?.[GUARD_WEAPON_MOUNT_PROFILE_IDS.KAYKIT_DEFAULT], 'kaykit-default'),
  };
  let applied = null;
  let plan = null;

  function frame() {
    plan = planWeaponMount({ mode, guardState: readGuardState() });
    if (plan.profileId === applied) return plan;
    applyMountCalibration(object3d, byProfile[plan.profileId]);
    object3d.updateMatrixWorld(true);
    applied = plan.profileId;
    return plan;
  }

  return Object.freeze({
    stage: WEAPON_MOUNT_CONTROLLER_STAGE,
    frame,
    get mode() { return mode; },
    get report() {
      return Object.freeze({
        stage: WEAPON_MOUNT_CONTROLLER_STAGE,
        mode,
        applied,
        reason: plan?.reason ?? null,
        // Which profiles this controller can put back, so a probe can tell "the dial is set to
        // follow" from "the dial is set to follow and only ever had one thing to follow to".
        profiles: Object.freeze(Object.keys(byProfile)),
      });
    },
  });
}

function requireCalibration(value, name) {
  const rotation = value?.rotation;
  const finite = (n) => Number.isFinite(Number(n));
  if (!rotation || !finite(rotation.x) || !finite(rotation.y) || !finite(rotation.z)) {
    throw new Error(`R23E.1 weapon mount control requires a ${name} mount calibration`);
  }
  return value;
}
