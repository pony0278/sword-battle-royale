import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createFighter } from '../src/game/fighter.js';
import { LONGSWORD, WEAPONS, defineWeapon, equipWeapon, getWeapon } from '../src/game/weapon.js';
import { createGuardPresentationTable } from '../src/combat/guard-presentation-table.js';
import { GUARD_REACTION_VARIANTS } from '../src/combat/guard-reaction-presentation.js';
import { GUARD_STATES } from '../src/combat/guard-states.js';
import { LONGSWORD_ATTACK_TIMINGS } from '../src/combat/longsword-attack-timings.js';

// W1 - a fighter carries a weapon, and two fighters may carry different ones.
//
// Everything S1 and G1 built made a weapon's numbers into data. None of it gave a FIGHTER one: the
// sword was built at the composition layer by scene.js and bootstrap.js calling createDebugSword,
// and nothing held the idea that a fighter has a weapon. This is the test that says it does.

// The same stubs R23A.1 uses, for the same reason it gives: this asserts what a fighter is MADE
// of, and each part is tested in its own file.
function stubRig() {
  const bones = {};
  for (const id of [
    'hips', 'spine', 'chest', 'head',
    'upperarm.l', 'lowerarm.l', 'wrist.l', 'hand.l',
    'upperarm.r', 'lowerarm.r', 'wrist.r', 'hand.r',
    'upperleg.l', 'lowerleg.l', 'foot.l', 'toes.l',
    'upperleg.r', 'lowerleg.r', 'foot.r', 'toes.r',
  ]) {
    bones[id] = {
      name: id,
      position: { x: 0, y: 0, z: 0, set() {}, copy() {}, clone() { return this; } },
      quaternion: { x: 0, y: 0, z: 0, w: 1, copy() {}, clone() { return this; }, set() {} },
      scale: { x: 1, y: 1, z: 1 },
      getWorldPosition: (target) => target,
      getWorldQuaternion: (target) => target,
      parent: null,
    };
  }
  return { bones, root: { updateMatrixWorld() {}, getObjectByName: (id) => bones[id] || null } };
}

function stubCharacter() {
  return { rig: stubRig(), sampleAnimation() {}, getAnimationDuration: () => 1, update() {} };
}

function stubBuckler() {
  return {
    getWorldParrySurface: () => ({ center: { x: 0, y: 1, z: 0 }, normal: { x: 0, y: 0, z: 1 }, radius: 0.2 }),
    setParrySurfaceVisible() {},
  };
}

// A weapon that is not the longsword, built through the same seams a real one would be.
function stubWeapon(id) {
  const reactionProfile = (name) => ({
    clipId: `${id}/${name}`, id: `${id}_${name}`, variant: name,
    sourceWindow: { startSeconds: 0, endSeconds: 0.5 },
    counterWindowSeconds: [0.1, 0.4], completionEvent: 'reaction_complete',
  });
  return defineWeapon({
    id,
    // The attack side only has to answer getProfile for a fighter to carry it; the full timings
    // record is G1's business and is measured, not stubbed.
    attackTimings: { getProfile: () => Object.freeze({ weapon: id, contactSeconds: 0.61 }) },
    guardPresentation: createGuardPresentationTable({
      base: { clipId: `${id}/hold`, correctionLayerId: `${id}_v1` },
      authoringState: { authored: true, authoredStage: 'W1-test' },
      transitionProfileIds: { ENTER: `${id}_enter`, RECOVER: `${id}_recover`, EXIT: `${id}_exit` },
      reactionVariants: GUARD_REACTION_VARIANTS,
      reactionProfiles: {
        [GUARD_REACTION_VARIANTS.BLOCK_HIT]: reactionProfile('block-hit'),
        [GUARD_REACTION_VARIANTS.PARRY]: reactionProfile('parry'),
        [GUARD_REACTION_VARIANTS.PERFECT_PARRY]: reactionProfile('perfect-parry'),
      },
      counterProfile: {
        clipId: `${id}/counter`, id: `${id}_counter`, sourceFamily: 'kaykit-melee',
        completionEvent: 'counter_complete', correctionWeight: 0,
        weaponMountProfileId: 'kaykit-default', authoredStage: 'W1-test', inPlace: true, loop: false,
      },
      guardMountProfileId: `${id}-calibrated`,
      transitionAuthoredStage: 'W1-test',
      reactionAuthoredStage: 'W1-test',
    }),
  });
}

test('W1 a fighter carries the longsword unless told otherwise', () => {
  const fighter = createFighter(THREE, { character: stubCharacter(), buckler: stubBuckler() });
  assert.equal(fighter.weapon.id, 'longsword');
  assert.equal(fighter.weapon.attackTimings, LONGSWORD_ATTACK_TIMINGS);
  // Nothing to mount without a scene, and that is not an error.
  assert.equal(fighter.weaponMount, null);
});

test('W1 two fighters carry different weapons, and each guard presents its own', () => {
  const mine = createFighter(THREE, { character: stubCharacter(), buckler: stubBuckler() });
  const theirs = createFighter(THREE, {
    character: stubCharacter(), buckler: stubBuckler(), weapon: stubWeapon('warhammer'),
  });

  assert.equal(mine.weapon.id, 'longsword');
  assert.equal(theirs.weapon.id, 'warhammer');

  // The thing W1 exists for: the guard machine presents the weapon the fighter is holding. Before
  // this, both of these read the same fixed table no matter what either fighter carried.
  const mineHold = mine.guardMachine.snapshot.presentation;
  const theirsHold = theirs.guardMachine.snapshot.presentation;
  assert.notEqual(mineHold, theirsHold);
  assert.equal(mine.weapon.guardPresentation[GUARD_STATES.HOLD].clipId, 'SKYRIM_GUARD/shd_blockidle');
  assert.equal(theirs.weapon.guardPresentation[GUARD_STATES.HOLD].clipId, 'warhammer/hold');
  assert.equal(theirs.weapon.guardPresentation[GUARD_STATES.HOLD].weaponMountProfileId, 'warhammer-calibrated');

  // And their attack sides answer differently, which is what "武器速度差異" will be measured through.
  assert.equal(mine.weapon.attackTimings.getProfile('top').contactSeconds, 0.43);
  assert.equal(theirs.weapon.attackTimings.getProfile('top').contactSeconds, 0.61);
});

test('W1 a fighter refuses a weapon that is not one', () => {
  assert.throws(
    () => createFighter(THREE, { character: stubCharacter(), buckler: stubBuckler(), weapon: {} }),
    /requires a weapon/,
  );
  assert.throws(() => defineWeapon({ id: 'x', guardPresentation: {} }), /attack timings/);
  assert.throws(() => defineWeapon({ id: 'x', attackTimings: { getProfile() {} } }), /guard presentation/);
  assert.throws(() => defineWeapon({ attackTimings: { getProfile() {} }, guardPresentation: {} }), /needs an id/);
});

test('W1 equipping adds this fighter\'s instance without touching the definition', () => {
  const object3d = { quaternion: {} };
  const mounts = { 'skyrim-guard-calibrated': {}, 'kaykit-default': {} };
  const equipped = equipWeapon(LONGSWORD, { object3d, mounts });
  assert.equal(equipped.id, LONGSWORD.id);
  assert.equal(equipped.attackTimings, LONGSWORD.attackTimings);
  assert.equal(equipped.object3d, object3d);
  // The shared definition is not mutated by one fighter picking up a sword.
  assert.equal(LONGSWORD.object3d, undefined);
  assert.equal(Object.isFrozen(LONGSWORD), true);
});

test('W1 the registry names what exists, and says so when asked for what does not', () => {
  assert.deepEqual(Object.keys(WEAPONS), ['longsword']);
  assert.equal(getWeapon('longsword'), LONGSWORD);
  assert.throws(() => getWeapon('greatsword'), /unknown weapon: greatsword.*Known: longsword/);
});
