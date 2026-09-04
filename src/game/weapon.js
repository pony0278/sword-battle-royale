// @ts-check
import { LONGSWORD_ATTACK_TIMINGS } from '../combat/longsword-attack-timings.js';
import { LONGSWORD_GUARD_PRESENTATION } from '../combat/longsword-guard-presentation.js';

// W1 — a weapon, as a fighter carries it.
//
// S1 and G1 made a weapon's numbers into data: createDirectionalAttackTimings takes six tables and
// createGuardPresentationTable takes a guard's metadata, and each returns a record. What neither
// did was give a FIGHTER one. createFighter took a character and a buckler; the sword was built at
// the composition layer by calling createDebugSword directly, in scene.js and in bootstrap.js, and
// nothing anywhere held the idea that a fighter has a weapon rather than the scene having one.
// That is why there was no weapon registry, no equip, and no switch: there was nowhere to put them.
//
// TWO THINGS, deliberately kept apart:
//
//   the DEFINITION   what a longsword is - its attack timings and its guard presentation. One per
//                    weapon in the game, shared by everyone carrying one, and pure data.
//   the INSTANCE     this fighter's actual sword - an Object3D in the scene and the mount
//                    calibrations measured for the rig holding it. One per fighter, and it cannot
//                    exist until there is a scene and a loaded clip to read the calibration from.
//
// Keeping them apart is what lets the definition be a module-level constant while the instance is
// built at boot: bootstrap.js composes the Skyrim mount out of a calibration read from the loaded
// guard clip, and that is not something a constant can hold.

/**
 * @param {object} definition
 * @param {string} definition.id
 * @param {any} definition.attackTimings from createDirectionalAttackTimings
 * @param {any} definition.guardPresentation from createGuardPresentationTable
 */
export function defineWeapon({ id, attackTimings, guardPresentation }) {
  if (!id) throw new Error('W1 a weapon needs an id');
  if (!attackTimings?.getProfile) throw new Error(`W1 ${id} needs attack timings with a getProfile`);
  if (!guardPresentation) throw new Error(`W1 ${id} needs a guard presentation table`);
  return Object.freeze({ id, attackTimings, guardPresentation });
}

/**
 * This fighter's instance of a weapon. The object3d and mounts are optional because a headless
 * test has neither and still wants a fighter that carries a longsword rather than nothing.
 * @param {ReturnType<typeof defineWeapon>} definition
 * @param {{ object3d?: any, mounts?: any }} [instance]
 */
export function equipWeapon(definition, { object3d = null, mounts = null } = {}) {
  if (!definition?.id) throw new Error('W1 equipping requires a weapon definition');
  return Object.freeze({ ...definition, object3d, mounts });
}

export const LONGSWORD = defineWeapon({
  id: 'longsword',
  attackTimings: LONGSWORD_ATTACK_TIMINGS,
  guardPresentation: LONGSWORD_GUARD_PRESENTATION,
});

// The weapons that exist. One entry today, and the point of the list is that adding the second is
// an entry rather than a search: handoff/40 says what a greatsword needs before it can join, and
// greatsword-attack-timings.js throws until it has it.
export const WEAPONS = Object.freeze({
  [LONGSWORD.id]: LONGSWORD,
});

export function getWeapon(id) {
  const weapon = WEAPONS[String(id || '')];
  if (!weapon) throw new Error(`W1 unknown weapon: ${id}. Known: ${Object.keys(WEAPONS).join(', ')}`);
  return weapon;
}
