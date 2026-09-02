import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GUARD_STATES } from '../src/combat/guard-state-machine.js';
import { GUARD_WEAPON_MOUNT_PROFILE_IDS } from '../src/combat/guard-counter-presentation.js';
import {
  WEAPON_MOUNT_MODES,
  WEAPON_MOUNT_MODE_DEFAULT,
  planWeaponMount,
  resolveWeaponMountMode,
} from '../src/combat/weapon-mount-policy.js';
import { createWeaponMountController } from '../src/game/weapon-mount-controller.js';
import { readLabExperimentParameters } from '../tools/action-studio/shield-parry-r281/lab-experiment-parameters.js';

// R23K.1 - the mount follows the swing, and follow is what ships.
//
// The bug this answers, as a person found it: "my LEFT does no damage, TOP and RIGHT do". Measured
// in the running lab, pinned at 1/60: under the Skyrim mount the player's LEFT reaches the body
// from 2.4m and misses 2.5m by seven centimetres, while TOP and RIGHT reach 2.6m and the opponent's
// LEFT - on the KayKit mount - reaches 2.6m. The stance is 2.38-2.40m. In a real session with the
// automated opponent LEFT landed 3 swings in 7; following the hand, 6 in 7. Under the KayKit mount
// the player's envelope is the opponent's, which is what a mirror duel means.
//
// The mechanism R23E.1 built could not fix it on its own: `follow` reads the guard machine, and in
// parry mode the machine reads HOLD for every frame of a player's swing. The swing is a second
// UAL window the machine cannot see, so it is a second input.

const SKYRIM = GUARD_WEAPON_MOUNT_PROFILE_IDS.SKYRIM_GUARD;
const KAYKIT = GUARD_WEAPON_MOUNT_PROFILE_IDS.KAYKIT_DEFAULT;

test('R23K.1 follow is what ships: a URL that asks for nothing gets the mount that follows the hand', () => {
  assert.equal(WEAPON_MOUNT_MODE_DEFAULT, WEAPON_MOUNT_MODES.FOLLOW);
  assert.equal(resolveWeaponMountMode(undefined).mode, WEAPON_MOUNT_MODES.FOLLOW);
  assert.equal(resolveWeaponMountMode(undefined).reason, 'not-asked-for');
  assert.equal(resolveWeaponMountMode('follow').reason, 'shipped-default');
  // What shipped before is still reachable, and is now the thing one has to ask for.
  assert.equal(resolveWeaponMountMode('skyrim').mode, WEAPON_MOUNT_MODES.SKYRIM);
  assert.equal(resolveWeaponMountMode('skyrim').reason, 'asked-for');
  const params = readLabExperimentParameters(new URLSearchParams(''));
  assert.equal(params.weaponMountMode, WEAPON_MOUNT_MODES.FOLLOW);
});

test('R23K.1 a swing is a UAL clip posing the hand, whatever the guard machine says', () => {
  for (const state of [...Object.values(GUARD_STATES), null]) {
    const plan = planWeaponMount({ mode: 'follow', guardState: state, swinging: true });
    assert.equal(plan.profileId, KAYKIT, `swinging under ${state}`);
    assert.equal(plan.reason, 'a-ual-swing-is-posing-the-hand');
  }
  // Not swinging, the R23E.1 answer stands: a raised guard is a Skyrim clip posing the hand.
  assert.equal(planWeaponMount({ mode: 'follow', guardState: GUARD_STATES.HOLD, swinging: false }).profileId, SKYRIM);
  assert.equal(planWeaponMount({ mode: 'follow', guardState: GUARD_STATES.HOLD }).profileId, SKYRIM);
  // Strictly true. A caller that hands over the swing runtime itself, or a frame count, has not
  // said "swinging", and must not move the mount by accident.
  for (const notASwing of [1, 'true', {}, { active: true }]) {
    assert.equal(planWeaponMount({ mode: 'follow', guardState: GUARD_STATES.HOLD, swinging: notASwing }).profileId, SKYRIM);
  }
});

test('R23K.1 the fixed modes do not care about the swing either', () => {
  assert.equal(planWeaponMount({ mode: 'skyrim', guardState: GUARD_STATES.NEUTRAL, swinging: true }).profileId, SKYRIM);
  assert.equal(planWeaponMount({ mode: 'kaykit', guardState: GUARD_STATES.HOLD, swinging: true }).profileId, KAYKIT);
});

function harness(mode) {
  const writes = [];
  const object3d = {
    position: { set: () => {} },
    rotation: { set: (...a) => writes.push(a) },
    scale: { set: () => {} },
    quaternion: {},
    updateMatrixWorld() {},
  };
  let guardState = GUARD_STATES.HOLD;
  let swinging = false;
  const controller = createWeaponMountController({
    weapon: { object3d },
    mounts: {
      [SKYRIM]: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0.1, y: 0.2, z: 0.3 }, scale: { x: 1, y: 1, z: 1 } },
      [KAYKIT]: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: Math.PI }, scale: { x: 1, y: 1, z: 1 } },
    },
    mode,
    readGuardState: () => guardState,
    readSwinging: () => swinging,
  });
  return { controller, writes, setGuard: (s) => { guardState = s; }, setSwinging: (s) => { swinging = s; } };
}

test('R23K.1 the controller moves the mount for the swing and puts it back when the swing ends', () => {
  const { controller, writes, setSwinging } = harness('follow');
  // Parry mode as measured: the guard is HOLD before, during and after the swing.
  controller.frame();
  assert.equal(controller.report.applied, SKYRIM, 'a held guard wears the Skyrim mount');
  setSwinging(true);
  controller.frame(); controller.frame();
  assert.equal(controller.report.applied, KAYKIT, 'the swing wears the KayKit mount with the guard still HOLD');
  assert.equal(controller.report.reason, 'a-ual-swing-is-posing-the-hand');
  assert.deepEqual(writes.at(-1), [0, 0, Math.PI]);
  assert.equal(writes.length, 2, 'and the swing writes once, not once per frame');
  setSwinging(false);
  controller.frame();
  assert.equal(controller.report.applied, SKYRIM, 'and it goes back when the swing ends');
  assert.equal(writes.length, 3);
});

test('R23K.1 a controller built without a swing reader behaves exactly as R23E.1 built it', () => {
  const object3d = { position: { set: () => {} }, rotation: { set: () => {} }, scale: { set: () => {} }, quaternion: {}, updateMatrixWorld() {} };
  const controller = createWeaponMountController({
    weapon: { object3d },
    mounts: {
      [SKYRIM]: { rotation: { x: 0.1, y: 0.2, z: 0.3 } },
      [KAYKIT]: { rotation: { x: 0, y: 0, z: Math.PI } },
    },
    mode: 'follow',
    readGuardState: () => GUARD_STATES.HOLD,
  });
  controller.frame();
  assert.equal(controller.report.applied, SKYRIM);
});

test('R23K.1 the lab hands the player\'s swing to the dial', () => {
  // A composition claim about a browser entry, so it is read rather than run. What is asserted is
  // the wiring: the swing reader is the player's own attack runtime and nothing the guard machine
  // knows, because the guard machine is exactly the witness that measured wrong.
  const entry = readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
  assert.match(entry, /readSwinging: \(\) => playerEngagement\?\.attackRuntime\.active === true/);
});
