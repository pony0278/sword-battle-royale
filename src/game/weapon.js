// @ts-check
import { LONGSWORD_ATTACK_TIMINGS } from '../combat/longsword-attack-timings.js';
import { LONGSWORD_GUARD_PRESENTATION } from '../combat/longsword-guard-presentation.js';
import { MOVE_CATEGORIES, isMoveCategory, moveCategoryMayCombo } from '../combat/move-categories.js';

// W1 — a weapon, as a fighter carries it.
// W3 — and the moves it can make, which is more than one kind of thing.
//
// S1 and G1 made a weapon's numbers into data. W1 gave a fighter one. W3 is the part where a weapon
// stops being "three directional swings" and becomes a set of moves, each of a kind: handoff/05 has
// specified LMB for a Light Attack and Hold LMB for a Heavy one since before any of this was built,
// and until now the second half had nowhere to live.
//
// TWO THINGS, deliberately kept apart:
//
//   the DEFINITION   what a longsword is - its moves and its guard presentation. One per weapon in
//                    the game, shared by everyone carrying one, and pure data.
//   the INSTANCE     this fighter's actual sword - an Object3D in the scene and the mount
//                    calibrations measured for the rig holding it. One per fighter, and it cannot
//                    exist until there is a scene and a loaded clip to read the calibration from.
//
// Keeping them apart is what lets the definition be a module-level constant while the instance is
// built at boot: bootstrap.js composes the Skyrim mount out of a calibration read from the loaded
// guard clip, and that is not something a constant can hold.

/**
 * One move a weapon can make.
 * @param {object} move
 * @param {string} move.id
 * @param {string} move.category one of MOVE_CATEGORIES
 * @param {any} move.timings from createDirectionalAttackTimings
 * @param {string|null} [move.comboInto] the move this one may chain into, by id
 */
export function defineMove({ id, category, timings, comboInto = null }) {
  if (!id) throw new Error('W3 a move needs an id');
  if (!isMoveCategory(category)) {
    throw new Error(`W3 ${id} has an unknown move category: ${category}. Known: ${Object.values(MOVE_CATEGORIES).join(', ')}`);
  }
  if (!timings?.getProfile) throw new Error(`W3 ${id} needs timings with a getProfile`);
  // handoff/05 gives combo to Light and withholds it from Heavy. Enforced rather than documented,
  // because a heavy that chains is a balance decision and should be a deliberate change to the
  // vocabulary rather than a typo in a weapon file.
  if (comboInto && !moveCategoryMayCombo(category)) {
    throw new Error(`W3 ${id} is ${category} and may not combo`);
  }
  return Object.freeze({ id, category, timings, comboInto });
}

function validateMoves(weaponId, moves) {
  const entries = Object.entries(moves || {});
  if (entries.length === 0) throw new Error(`W1 ${weaponId} needs at least one move`);
  for (const [key, move] of entries) {
    if (!move?.id) throw new Error(`W3 ${weaponId} move ${key} is not a move`);
    if (move.comboInto && !moves[move.comboInto]) {
      throw new Error(`W3 ${weaponId} move ${move.id} combos into ${move.comboInto}, which it does not have`);
    }
  }
  const lights = entries.filter(([, move]) => move.category === MOVE_CATEGORIES.LIGHT);
  if (lights.length === 0) throw new Error(`W1 ${weaponId} needs a light attack`);
  return Object.freeze(Object.fromEntries(entries));
}

/**
 * @param {object} definition
 * @param {string} definition.id
 * @param {Record<string, ReturnType<typeof defineMove>>} definition.moves
 * @param {any} definition.guardPresentation from createGuardPresentationTable
 */
export function defineWeapon({ id, moves, guardPresentation }) {
  if (!id) throw new Error('W1 a weapon needs an id');
  if (!guardPresentation) throw new Error(`W1 ${id} needs a guard presentation table`);
  const validated = validateMoves(id, moves);
  const light = Object.values(validated).find((move) => move.category === MOVE_CATEGORIES.LIGHT);
  return Object.freeze({
    id,
    moves: validated,
    // The move a bare press makes. Named rather than found at every call site, and it is what the
    // exchange drives today: two-actor-combat-integration takes one attack runtime, and the runtime
    // it takes is this move's.
    light,
    // The light move's timings, under the name everything called them before there was more than
    // one move. Kept because "this weapon's attack timings" is what most callers actually mean.
    attackTimings: light.timings,
    guardPresentation,
  });
}

/**
 * The chain a move starts, in order, following comboInto until it ends.
 * Data only - nothing drives a combo yet, and handoff/05 section 17 says the cancel rules that
 * would govern one must start conservative. This is what a weapon DECLARES, so that when a chain is
 * driven the declaration is already the source of truth rather than a second one being invented.
 */
export function comboChain(weapon, moveId) {
  const chain = [];
  let current = weapon.moves[moveId];
  while (current && !chain.includes(current.id)) {
    chain.push(current.id);
    current = current.comboInto ? weapon.moves[current.comboInto] : null;
  }
  return Object.freeze(chain);
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

// The longsword makes ONE move, and that is a statement about what has been measured rather than
// about what a longsword is. handoff/06 gives it a Light Combo of three - Slash, Reverse Slash,
// Thrust - and a Heavy Overhead Strike. What exists is the light attack, in three directions, every
// landmark of it measured; the combo and the heavy have no numbers.
//
// The heavy's candidate clip is already in the repository and unused: UAL2/Sword_Heavy_Combo. It is
// not declared here, because a move whose timings were guessed would be indistinguishable from one
// that was measured - the same reason greatsword-attack-timings.js ships nulls and throws.
export const LONGSWORD = defineWeapon({
  id: 'longsword',
  moves: {
    light: defineMove({
      id: 'light',
      category: MOVE_CATEGORIES.LIGHT,
      timings: LONGSWORD_ATTACK_TIMINGS,
    }),
  },
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
