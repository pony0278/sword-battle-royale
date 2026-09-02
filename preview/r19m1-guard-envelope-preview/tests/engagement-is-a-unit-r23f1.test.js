import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createFighter } from '../src/game/fighter.js';
import { ENGAGEMENT_STAGE, createEngagement } from '../src/game/engagement.js';
import { createLongswordDirectionalAttackRuntime } from '../src/combat/longsword-directional-attack-runtime.js';
import { SHIELD_PARRY_EXCHANGE_STATE_KEYS } from '../src/game/exchange-state.js';

// R23F.1 - one direction of a fight as a unit, and the only claim worth testing here.
//
// The proof that this stage moved no BEHAVIOUR is not in this file: it is the golden grid's eleven
// cells, the parry gate and the defence matrix reproducing byte for byte afterwards, exactly as it
// was for R23A.1. What is here is the claim those gates cannot make, because there is only one
// engagement on the page for them to measure - that a SECOND one can exist, that it is one call,
// and that the two share nothing they must not share.
//
// The contact stack needs THREE and a rig, so the parts below are the smallest things that satisfy
// each constructor. They are not mocks of behaviour; every runtime here is tested in its own file.

globalThis.THREE = THREE;

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
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      scale: new THREE.Vector3(1, 1, 1),
      getWorldPosition: (t) => t.set(0, 1, 0),
      getWorldQuaternion: (t) => t.identity(),
      parent: null,
    };
  }
  return { bones, root: { updateMatrixWorld() {}, getObjectByName: (id) => bones[id] || null } };
}
const character = () => ({ rig: stubRig(), sampleAnimation() {}, getAnimationDuration: () => 1, update() {} });
const buckler = () => ({
  getWorldParrySurface: () => ({ center: { x: 0, y: 1, z: 0 }, normal: { x: 0, y: 0, z: 1 }, radius: 0.2 }),
  setParrySurfaceVisible() {},
});
const sword = () => ({
  update() {}, object3d: new THREE.Object3D(), bladeBase: new THREE.Object3D(),
  tip: new THREE.Object3D(), trailTip: new THREE.Object3D(),
});

function build(overrides = {}) {
  const camera = new THREE.PerspectiveCamera();
  const swinger = overrides.swinger || character();
  const receiver = overrides.receiver || character();
  const receiverFighter = createFighter(THREE, { character: receiver, buckler: buckler(), camera });
  const context = overrides.context || (() => ({ selectedMode: 'parry' }));
  return createEngagement(THREE, {
    swinger,
    swingerSword: sword(),
    receiver,
    receiverBuckler: buckler(),
    receiverFighter,
    camera,
    attackRuntime: createLongswordDirectionalAttackRuntime({}),
    createOwnershipTaps: () => ({}),
    longswordAttackPhases: { WINDUP: 'attack_windup', ACTIVE: 'attack_active' },
    promptHoldMs: 1500,
    presentationServices: {
      captureRigPose: () => ({}), applyRigPose: () => {}, blendRecoveryPose: () => ({}),
      sampleLongswordAttackRecovery: () => ({}), sampleLiveParryOldB3ReleaseBlend: () => ({}),
    },
    preContactServices: {},
    contactServices: { measureAttackerRecoilWorldSilhouette: () => ({}) },
    readContext: context,
    callbacks: {
      publishStatus() {}, onBodyStruck() {}, readDodgeReport: () => ({}), readGuardActive: () => true,
      updateLiveContactMarkers() {}, formatInspectionFailureSummary: () => '',
    },
    ...overrides.args,
  });
}

test('R23F.1 an engagement is the whole of one direction, assembled at once', () => {
  const engagement = build();
  assert.equal(engagement.stage, ENGAGEMENT_STAGE);
  // The nine things a second exchange would have needed its own of.
  for (const part of [
    'exchangeState', 'attackRuntime', 'combat', 'presentation',
    'gripConstraint', 'preContact', 'contactHandoff', 'captureBlade', 'readBladeForMeasurement',
  ]) {
    assert.ok(engagement[part], `an engagement without ${part} is not one`);
  }
  assert.equal(engagement.authority, 'composition-only-no-contact-authority');
});

test('R23F.1 it refuses to be built without both bodies and a swing', () => {
  assert.throws(() => build({ args: { swinger: null } }), /swinger and a receiver/);
  assert.throws(() => build({ args: { receiver: { } } }), /swinger and a receiver/);
  assert.throws(() => build({ args: { attackRuntime: null } }), /attack runtime/);
  assert.throws(() => build({ args: { receiverFighter: {} } }), /receiver assembled/);
});

test('R23F.1 two engagements share no blackboard, which is the whole point', () => {
  const a = build();
  const b = build();
  assert.notEqual(a.exchangeState, b.exchangeState);
  a.exchangeState.latestBodyHit = { contact: true };
  assert.equal(b.exchangeState.latestBodyHit, null, 'one exchange must not read the other\'s outcome');
  // And a reset clears its own and leaves the other alone.
  b.exchangeState.firstContact = { at: 1 };
  a.resetExchangeState({ previousShieldLeadSurface: null });
  assert.equal(a.exchangeState.latestBodyHit, null);
  assert.deepEqual(b.exchangeState.firstContact, { at: 1 });
  // Every key the blackboard carries is per-engagement, not one shared object under two names.
  assert.ok(SHIELD_PARRY_EXCHANGE_STATE_KEYS.length > 40, 'the blackboard is the big shared thing');
});

test('R23F.1 the recovery, the idle clock and the blade memory are per-engagement', () => {
  const a = build();
  const b = build();
  assert.equal(a.hasRecovery, false);
  a.beginRecovery('top');
  assert.equal(a.hasRecovery, true, 'the one that swung has a recovery');
  assert.equal(b.hasRecovery, false, 'and the other one does not');
  a.clearRecovery();
  assert.equal(a.hasRecovery, false);

  const blade = [{ x: 1, y: 2, z: 3 }];
  a.rememberBlade(blade);
  assert.equal(a.previousBlade, blade);
  assert.equal(b.previousBlade, null, 'one engagement\'s last frame is not another\'s');
});

// NOT TESTED HERE, and said rather than faked: that the engagement folds previousBlade into the
// context its pre-contact controller reads. The wrapper is internal and only runs inside a live
// update, so nothing at this level can observe it - a first draft of this file asserted it through
// an optional accessor that does not exist, which meant it asserted nothing and passed. The claim
// is covered where it is actually exercised: the golden grid drives that path eleven times.

test('R23F.1 the idle duration is told, not guessed, and a bad one does not become zero', () => {
  const engagement = build();
  assert.equal(engagement.setIdleDuration(2.5), 2.5);
  // A clip that failed to load reports 0 or NaN, and a zero duration would divide the idle clock
  // by nothing. Doubt resolves to one second, which is what the entry's `|| 1` always meant.
  assert.equal(engagement.setIdleDuration(0), 1);
  assert.equal(engagement.setIdleDuration(Number.NaN), 1);
  assert.equal(engagement.setIdleDuration(undefined), 1);
  assert.equal(engagement.setIdleDuration(-3), 1);
});
