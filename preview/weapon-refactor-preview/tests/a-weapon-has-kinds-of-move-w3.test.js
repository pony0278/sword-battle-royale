import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LONGSWORD, comboChain, defineMove, defineWeapon,
} from '../src/game/weapon.js';
import {
  MOVE_CATEGORIES, MOVE_CATEGORY_SHAPE, isMoveCategory, moveCategoryMayCombo,
} from '../src/combat/move-categories.js';

// W3 - a weapon makes more than one kind of move.
//
// handoff/05 has specified LMB for a Light Attack and Hold LMB for a Heavy one since before any of
// this was built. Until W3 the code had one kind: `category` was the string 'attack' in both places
// it appeared, and the only axis a weapon varied along was direction.

const stubTimings = (contactSeconds) => ({ getProfile: () => Object.freeze({ contactSeconds }) });

function threeHitLightAndAHeavy(id) {
  return defineWeapon({
    id,
    moves: {
      // handoff/06's Longsword: Light Combo of Slash, Reverse Slash, Thrust.
      slash: defineMove({ id: 'slash', category: MOVE_CATEGORIES.LIGHT, timings: stubTimings(0.4), comboInto: 'reverse' }),
      reverse: defineMove({ id: 'reverse', category: MOVE_CATEGORIES.LIGHT, timings: stubTimings(0.38), comboInto: 'thrust' }),
      thrust: defineMove({ id: 'thrust', category: MOVE_CATEGORIES.LIGHT, timings: stubTimings(0.36) }),
      overhead: defineMove({ id: 'overhead', category: MOVE_CATEGORIES.HEAVY, timings: stubTimings(0.9) }),
    },
    guardPresentation: LONGSWORD.guardPresentation,
  });
}

test('W3 a weapon may declare a light chain and a heavy, and they are told apart', () => {
  const weapon = threeHitLightAndAHeavy('test-longsword');
  assert.equal(weapon.moves.slash.category, MOVE_CATEGORIES.LIGHT);
  assert.equal(weapon.moves.overhead.category, MOVE_CATEGORIES.HEAVY);
  // The light is what a bare press makes, and the heavy is reachable but is not it.
  assert.equal(weapon.light.category, MOVE_CATEGORIES.LIGHT);
  assert.equal(weapon.attackTimings, weapon.light.timings);
  assert.notEqual(weapon.light.id, 'overhead');
  // Their timings are their own, which is the point of a category having a shape.
  assert.equal(weapon.moves.slash.timings.getProfile().contactSeconds, 0.4);
  assert.equal(weapon.moves.overhead.timings.getProfile().contactSeconds, 0.9);
});

test('W3 the chain a move starts is readable from what the weapon declared', () => {
  const weapon = threeHitLightAndAHeavy('test-longsword');
  assert.deepEqual(comboChain(weapon, 'slash'), ['slash', 'reverse', 'thrust']);
  assert.deepEqual(comboChain(weapon, 'reverse'), ['reverse', 'thrust']);
  assert.deepEqual(comboChain(weapon, 'thrust'), ['thrust']);
  assert.deepEqual(comboChain(weapon, 'overhead'), ['overhead']);
  assert.deepEqual(comboChain(weapon, 'nothing'), []);
});

test('W3 a chain that loops terminates rather than hanging', () => {
  const looped = defineWeapon({
    id: 'looped',
    moves: {
      a: defineMove({ id: 'a', category: MOVE_CATEGORIES.LIGHT, timings: stubTimings(0.4), comboInto: 'b' }),
      b: defineMove({ id: 'b', category: MOVE_CATEGORIES.LIGHT, timings: stubTimings(0.4), comboInto: 'a' }),
    },
    guardPresentation: LONGSWORD.guardPresentation,
  });
  assert.deepEqual(comboChain(looped, 'a'), ['a', 'b']);
});

test('W3 a heavy may not combo, because handoff/05 gives the chain to light alone', () => {
  assert.equal(moveCategoryMayCombo(MOVE_CATEGORIES.LIGHT), true);
  assert.equal(moveCategoryMayCombo(MOVE_CATEGORIES.HEAVY), false);
  assert.throws(
    () => defineMove({ id: 'x', category: MOVE_CATEGORIES.HEAVY, timings: stubTimings(0.9), comboInto: 'y' }),
    /is heavy and may not combo/,
  );
});

test('W3 a move refuses a category nobody has defined, and a combo to a move that is not there', () => {
  assert.equal(isMoveCategory('light'), true);
  assert.equal(isMoveCategory('unstoppable'), false);
  assert.throws(
    () => defineMove({ id: 'x', category: 'unstoppable', timings: stubTimings(0.4) }),
    /unknown move category: unstoppable.*Known: light, heavy/,
  );
  assert.throws(() => defineWeapon({
    id: 'dangling',
    moves: { a: defineMove({ id: 'a', category: MOVE_CATEGORIES.LIGHT, timings: stubTimings(0.4), comboInto: 'nowhere' }) },
    guardPresentation: LONGSWORD.guardPresentation,
  }), /combos into nowhere, which it does not have/);
});

test('W3 a weapon must have a light attack, whatever else it has', () => {
  assert.throws(() => defineWeapon({
    id: 'heavy-only',
    moves: { h: defineMove({ id: 'h', category: MOVE_CATEGORIES.HEAVY, timings: stubTimings(0.9) }) },
    guardPresentation: LONGSWORD.guardPresentation,
  }), /needs a light attack/);
});

// The honest state of the shipped weapon, asserted so that it changes deliberately.
test('W3 the longsword declares only what has been measured: one light, no heavy, no combo', () => {
  assert.deepEqual(Object.keys(LONGSWORD.moves), ['light']);
  assert.equal(LONGSWORD.light.category, MOVE_CATEGORIES.LIGHT);
  assert.equal(LONGSWORD.light.comboInto, null);
  assert.deepEqual(comboChain(LONGSWORD, 'light'), ['light']);
  // handoff/06 gives it a three-hit light combo and a heavy overhead. Neither has numbers, and
  // UAL2/Sword_Heavy_Combo sits unused in the repository as the heavy's candidate clip. When this
  // assertion fails, it should be because someone measured one of them.
  assert.equal(LONGSWORD.moves.overhead, undefined);
});

test('W3 each category says what it means, without pretending to know a weapon\'s milliseconds', () => {
  const light = MOVE_CATEGORY_SHAPE[MOVE_CATEGORIES.LIGHT];
  const heavy = MOVE_CATEGORY_SHAPE[MOVE_CATEGORIES.HEAVY];
  assert.equal(light.windup, 'short');
  assert.equal(heavy.windup, 'long');
  assert.equal(heavy.guardDamage, 'high');
  // Relative words, never numbers: the same category means different milliseconds for a longsword
  // and a greatsword, and those live in each weapon's measured timings.
  for (const shape of [light, heavy]) {
    for (const [field, value] of Object.entries(shape)) {
      if (field === 'purpose' || field === 'mayCombo' || field === 'category') continue;
      assert.equal(typeof value, 'string', `${shape.category}.${field} should be a word, not a number`);
      assert.ok(Number.isNaN(Number(value)), `${shape.category}.${field} looks like a number`);
    }
  }
});
