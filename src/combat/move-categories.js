// @ts-check

// W3 — what kind of thing a move is, and what that kind means.
//
// Until now every attack in this repository was one thing. `category` on an action definition was
// the string 'attack' in both places it appeared, and the only axis a weapon varied along was
// direction: top, right, left. handoff/05 has always described two, and the controls say so on the
// first page - LMB is a Light Attack and holding LMB is a Heavy one.
//
// This module is the vocabulary and nothing else. It has no imports, holds no weapon's numbers, and
// deliberately holds no numbers at all: what a light attack's windup IS for a given weapon is a
// measurement in that weapon's timings record, and the same word means different milliseconds for a
// longsword and a greatsword. What is written down here is the SHAPE the doc specifies, so that a
// weapon author can tell whether the numbers they measured belong under the name they gave them.

export const MOVE_CATEGORIES = Object.freeze({
  LIGHT: 'light',
  HEAVY: 'heavy',
});

// handoff/05 sections 7 and 8, as data rather than prose, because the difference between the two
// categories is the whole reason there are two. No milliseconds: every one of these is a direction
// relative to the same weapon's other category, not an absolute.
export const MOVE_CATEGORY_SHAPE = Object.freeze({
  [MOVE_CATEGORIES.LIGHT]: Object.freeze({
    category: MOVE_CATEGORIES.LIGHT,
    windup: 'short',
    recovery: 'short',
    damage: 'mid-low',
    guardDamage: 'low',
    staminaCost: 'low',
    // The one structural difference, and the reason combo lives on a move rather than on a weapon:
    // handoff/05 gives 可形成 Combo to Light and withholds it from Heavy.
    mayCombo: true,
    purpose: Object.freeze(['punish', 'pressure', 'finish']),
  }),
  [MOVE_CATEGORIES.HEAVY]: Object.freeze({
    category: MOVE_CATEGORIES.HEAVY,
    windup: 'long',
    recovery: 'long',
    damage: 'high',
    guardDamage: 'high',
    staminaCost: 'high',
    mayCombo: false,
    purpose: Object.freeze(['read-guard', 'punish-passive', 'zone-control']),
  }),
});

export function isMoveCategory(value) {
  return Object.values(MOVE_CATEGORIES).includes(value);
}

export function moveCategoryMayCombo(category) {
  return MOVE_CATEGORY_SHAPE[category]?.mayCombo === true;
}

// NOT here, and each for a reason worth writing down rather than leaving as an absence:
//
//   Stamina costs        handoff/05 section 13 gives stamina a cost per action and this repository
//                        has no stamina at all. A number here would be the first half of a system.
//   Hit stop             section 18 measures Light at 20-40ms and Heavy at 40-70ms. Those are real
//                        numbers from the design, but hit stop is a contact-stack behaviour and
//                        putting its numbers in the vocabulary would put them out of reach of the
//                        gates that measure contact.
//   Cancel rules         section 17 says Light Recovery may not be Dodge-cancelled and some early
//                        Heavy windup frames may be. Cancel windows are already authored per
//                        direction in the attack timings, so this belongs there, per weapon, and
//                        as a measurement.
//   The unique skill     Guard Counter, Execution Slash, Iai Counter. Every one of them is its own
//                        mechanic rather than a third category - handoff/40 section 4 measured what
//                        each would cost.
