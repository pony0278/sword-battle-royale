import { GUARD_STATES } from './guard-state-machine.js';
import { GUARD_WEAPON_MOUNT_PROFILE_IDS } from './guard-counter-presentation.js';

export const WEAPON_MOUNT_POLICY_STAGE = 'R23E.1';

// R23E.1 — which way the sword sits in the hand, and why one answer cannot be right for both
// things a fighter does.
//
// MEASURED, in the running lab, off the real scene graph. The chain under a fighter's right hand is
// handr -> handslotr -> HAND_R -> V3_PROCEDURAL_LONGSWORD, and the last of those carries the mount:
//
//   attacker   [0, 0, 1, 0]                          the KayKit default, a flat 180 about z
//   defender   [0.8009, 0.186, -0.5584, -0.1103]     that, composed with a correction read out of
//                                                    the Skyrim source at load
//
// The correction is 112.1 degrees as a quaternion and lands as 24.98 degrees of BLADE AXIS - the
// same 24.98 in every pose, because a mount is a constant rotation inside the hand.
//
// WHY there are two, which is the part that decides the rule: the two authoring families do not
// pose the same bones. SKYRIM_BONE_RETARGETS drives 23 targets INCLUDING handslot.l and handslot.r
// - the weapon sockets - so a Skyrim clip animates where the weapon hangs, and the mount has to
// undo the difference between Skyrim's weapon frame and this rig's. QUATERNIUS_BONE_RETARGETS (the
// UAL packs) drives 19 and stops at the wrist: no handslot, no hand. Measured across a whole clip,
// the socket travels 0.7 degrees under the Skyrim guard hold and 1.2 degrees across an entire UAL
// swing - which is to say the UAL packs never touch it.
//
// So the mount is not a preference. It belongs to whichever family is posing the hand this frame,
// and a fighter who both guards and swings needs it to change with them. Until R23D.1 no fighter
// did both, which is why one static mount was enough and why this is a stage of the mirror duel
// rather than a bug fix.
//
// WHAT THIS DELIBERATELY DOES NOT DO: touch the attacker. Their blade is the measured contact
// surface - createBladePolylineSampler reads it and measureSweptSwordBucklerClosestApproach decides
// outcomes from it - and swapping their mount mid-swing moves the polyline's far point 0.608m,
// against a buckler of 27.5cm radius. That is not a look change, it is a different fight. The
// defender's sword is only ever .update()d for its own line geometry and is measured by nothing,
// which is why it is the one that may be experimented on.
export const WEAPON_MOUNT_MODES = Object.freeze({
  // What ships: the Skyrim-calibrated mount, all the time, on a fighter who only ever guards.
  SKYRIM: 'skyrim',
  KAYKIT: 'kaykit',
  // The rule this stage exists to put in front of a person: the mount follows the family.
  FOLLOW: 'follow',
});

export const WEAPON_MOUNT_MODE_DEFAULT = WEAPON_MOUNT_MODES.SKYRIM;

export function resolveWeaponMountMode(value) {
  // Absent is not a typo, and this distinction has bitten this project before: R21V.1's ?sprint=
  // treated a missing parameter as the number zero, so every plain URL would have quietly changed
  // the sprint speed. A URL with no ?mount= has not asked for anything and must not be reported as
  // having asked for something wrong - the difference is the whole value of the reason field.
  const absent = value == null || (typeof value === 'string' && value.trim() === '');
  const requested = absent ? '' : String(value).trim().toLowerCase();
  const known = !absent && Object.values(WEAPON_MOUNT_MODES).includes(requested);
  return Object.freeze({
    stage: WEAPON_MOUNT_POLICY_STAGE,
    mode: known ? requested : WEAPON_MOUNT_MODE_DEFAULT,
    // Named rather than silently corrected: a typo'd ?mount= is a playtest that did not run the
    // thing it thought it ran, and a dial that quietly ignores one cannot be trusted to have been on.
    reason: absent ? 'not-asked-for'
      : known ? (requested === WEAPON_MOUNT_MODE_DEFAULT ? 'shipped-default' : 'asked-for')
        : 'unknown-mode',
  });
}

// Which family is posing this hand right now. The guard presentation owns the rig in every state
// but NEUTRAL - that is what GUARD_STATES.NEUTRAL carrying clipId: null means - so neutral is
// exactly the window in which a UAL clip is what a fighter is wearing: the idle they stand in, and
// the swing they will throw once one exists.
export function planWeaponMount(input = {}) {
  const { mode = WEAPON_MOUNT_MODE_DEFAULT, guardState = null } = input;
  if (mode === WEAPON_MOUNT_MODES.KAYKIT) {
    return frozen(GUARD_WEAPON_MOUNT_PROFILE_IDS.KAYKIT_DEFAULT, mode, 'held-at-kaykit');
  }
  if (mode !== WEAPON_MOUNT_MODES.FOLLOW) {
    return frozen(GUARD_WEAPON_MOUNT_PROFILE_IDS.SKYRIM_GUARD, mode, 'held-at-skyrim');
  }
  const guardOwnsTheHand = guardState != null && guardState !== GUARD_STATES.NEUTRAL;
  return frozen(
    guardOwnsTheHand
      ? GUARD_WEAPON_MOUNT_PROFILE_IDS.SKYRIM_GUARD
      : GUARD_WEAPON_MOUNT_PROFILE_IDS.KAYKIT_DEFAULT,
    mode,
    guardOwnsTheHand ? 'a-skyrim-clip-is-posing-the-hand' : 'a-ual-clip-is-posing-the-hand',
  );
}

function frozen(profileId, mode, reason) {
  return Object.freeze({
    stage: WEAPON_MOUNT_POLICY_STAGE,
    profileId,
    mode,
    reason,
    authority: 'weapon-presentation-only-no-contact-authority',
  });
}
