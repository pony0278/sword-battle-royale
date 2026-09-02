import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FIGHTER_STAGE, createFighter } from '../src/game/fighter.js';

// R23A.1 - one fighter as a unit, so there can be two.
//
// The mirror duel was never blocked by the runtimes. Measured before writing this: five of the
// guard runtimes already take only { rig, buckler }, one takes { character }, five more hold pure
// state and touch no actor at all, and two merely NAME their parameter `defender`. Not one reaches
// for a global. What was missing is the assembly - twelve consts in an entry that has room for one
// set and sits at its 699-line budget.
//
// This stage moves that assembly and must move nothing else. The proof is not in this file: it is
// the golden grid's eleven cells, the parry gate and the defence matrix all reproducing byte for
// byte afterwards. What IS here is the shape - that a fighter carries everything a body needs to
// defend, and nothing that belongs to the exchange between two bodies.

// The smallest things that satisfy each runtime's constructor checks. Deliberately not mocks of
// behaviour - this asserts what a fighter is MADE of, and the parts are tested in their own files.
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
  return {
    rig: stubRig(),
    sampleAnimation() {},
    getAnimationDuration: () => 1,
    update() {},
  };
}

function stubBuckler() {
  return {
    getWorldParrySurface: () => ({ center: { x: 0, y: 1, z: 0 }, normal: { x: 0, y: 0, z: 1 }, radius: 0.2 }),
    setParrySurfaceVisible() {},
  };
}


test('R23A.1 a fighter refuses to be built without a body or a shield', () => {
  assert.throws(() => createFighter(THREE, { buckler: stubBuckler() }), /animation-capable character/);
  assert.throws(() => createFighter(THREE, { character: stubCharacter() }), /parry surface/);
  assert.equal(FIGHTER_STAGE, 'R23A.1');
});

test('R23A.1 a fighter carries what a BODY needs, and nothing the exchange owns', () => {
  // Built for real, with the project's own Three.js, rather than asserted against the module text -
  // R22J.1's rule applied to its own stage, and the reason this needed no new source-text
  // assertions at all.
  const fighter = createFighter(THREE, { character: stubCharacter(), buckler: stubBuckler() });
  for (const part of [
    'guardMachine', 'guardRuntime', 'bracingRuntime', 'fineTrackingRuntime',
    'residualBodyReachRuntime', 'residualStanceReachRuntime', 'predictivePresentation',
    'activeParryInterceptIntent', 'parryGate', 'stance', 'guardSector',
    'neutralStance', 'bodyStrikeReaction',
  ]) {
    assert.ok(fighter[part], `a fighter must carry ${part}`);
  }
  // The things deliberately left out, each because it spans BOTH fighters. If one ever appears
  // here, a mirror duel gets two of something there can only be one of.
  for (const shared of ['attackRuntime', 'laneController', 'lifecycleDirector', 'playerController', 'combat']) {
    assert.equal(fighter[shared], undefined, `${shared} belongs to the exchange, not to a fighter`);
  }
  assert.match(fighter.authority, /no-contact-authority/);
  assert.ok(Object.isFrozen(fighter));
});

test('R23A.1 two fighters are genuinely separate, which is the whole point', () => {
  // The state that would betray a shared singleton: a guard raised on one must not raise the other.
  const a = createFighter(THREE, { character: stubCharacter(), buckler: stubBuckler() });
  const b = createFighter(THREE, { character: stubCharacter(), buckler: stubBuckler() });
  for (const part of ['guardMachine', 'parryGate', 'stance', 'guardSector', 'bodyStrikeReaction']) {
    assert.notEqual(a[part], b[part], `${part} must not be shared between two fighters`);
  }
  a.stance.update({ guardKeyHeld: true });
  assert.equal(a.stance.report.guardActive, true);
  assert.equal(b.stance.report.guardActive, false, "one fighter's guard is not the other's");
});
