import test from 'node:test';
import assert from 'node:assert/strict';
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

// R23E.1 - the mount dial, and the reason it is a dial rather than a decision.
//
// Measured off the running lab: the two fighters wear different mounts, [0,0,1,0] on the attacker
// and a Skyrim-calibrated one on the defender, and the difference lands as 24.98 degrees of blade
// axis in EVERY pose. Which one is right depends on which authoring family is posing the hand -
// the Skyrim retarget drives handslot.r and the UAL packs stop at the wrist - so a fighter who both
// guards and swings needs it to change with them. Which of the three settings LOOKS right is a
// judgement, made in motion, by a person; this file only proves the dial does what it says.

const SKYRIM = GUARD_WEAPON_MOUNT_PROFILE_IDS.SKYRIM_GUARD;
const KAYKIT = GUARD_WEAPON_MOUNT_PROFILE_IDS.KAYKIT_DEFAULT;

// R23E.1 shipped SKYRIM as the default and pinned it here as "nothing ships changed". R23K.1
// changed what ships - the reason is measured in src/combat/weapon-mount-policy.js and asserted in
// the-mount-follows-the-swing-r23k1.test.js - so this test keeps only the half that is still
// R23E.1's: absent is not a typo, and the default holds through every guard state.
test('R23E.1 with no ?mount= the sword gets the shipped default, and absent is not a typo', () => {
  assert.ok(Object.values(WEAPON_MOUNT_MODES).includes(WEAPON_MOUNT_MODE_DEFAULT));
  for (const absent of [undefined, null, '', '   ']) {
    assert.equal(resolveWeaponMountMode(absent).mode, WEAPON_MOUNT_MODE_DEFAULT);
    // Absent is not a typo. R21V.1's ?sprint= made exactly this mistake in the other direction -
    // a missing parameter read as a value - and a URL that asked for nothing must not be reported
    // as having asked for something wrong.
    assert.equal(resolveWeaponMountMode(absent).reason, 'not-asked-for', `${JSON.stringify(absent)}`);
  }
  // And whatever the default is, planning under it agrees with planning under its name, so no
  // state can quietly move it somewhere the named mode would not.
  for (const state of Object.values(GUARD_STATES)) {
    assert.equal(planWeaponMount({ guardState: state }).profileId,
      planWeaponMount({ mode: WEAPON_MOUNT_MODE_DEFAULT, guardState: state }).profileId, `${state} under the default`);
  }
});

test('R23E.1 a typo is named rather than silently taken as the default', () => {
  assert.equal(resolveWeaponMountMode('kaykit').reason, 'asked-for');
  assert.equal(resolveWeaponMountMode(WEAPON_MOUNT_MODE_DEFAULT).reason, 'shipped-default');
  const typo = resolveWeaponMountMode('kaykot');
  assert.equal(typo.mode, WEAPON_MOUNT_MODE_DEFAULT, 'an unknown mode falls back');
  assert.equal(typo.reason, 'unknown-mode', 'and says it fell back');
  // Case and spacing are a person typing, not a different request.
  assert.equal(resolveWeaponMountMode(' FOLLOW ').mode, WEAPON_MOUNT_MODES.FOLLOW);
});

test('R23E.1 follow hands the mount to whichever family is posing the hand', () => {
  // NEUTRAL is the one state the guard presentation does not own - the idle a fighter stands in and
  // the swing they will throw both live there, and both are UAL.
  assert.equal(planWeaponMount({ mode: 'follow', guardState: GUARD_STATES.NEUTRAL }).profileId, KAYKIT);
  assert.equal(planWeaponMount({ mode: 'follow', guardState: GUARD_STATES.NEUTRAL }).reason,
    'a-ual-clip-is-posing-the-hand');
  let guarded = 0;
  for (const state of Object.values(GUARD_STATES)) {
    if (state === GUARD_STATES.NEUTRAL) continue;
    guarded += 1;
    assert.equal(planWeaponMount({ mode: 'follow', guardState: state }).profileId, SKYRIM, `${state}`);
  }
  assert.ok(guarded >= 3, `the guard has more than one state to check, found ${guarded}`);
  // A caller that cannot say what the guard is doing gets the UAL answer, because a fighter with no
  // guard state is not guarding.
  assert.equal(planWeaponMount({ mode: 'follow' }).profileId, KAYKIT);
});

test('R23E.1 kaykit holds the attacker\'s mount through every state', () => {
  for (const state of Object.values(GUARD_STATES)) {
    assert.equal(planWeaponMount({ mode: 'kaykit', guardState: state }).profileId, KAYKIT);
  }
});

// --- the controller: one writer, and it writes only when the answer changes -------------------

function harness(mode) {
  const writes = [];
  const object3d = {
    position: { set: (...a) => writes.push(['position', ...a]) },
    rotation: { set: (...a) => writes.push(['rotation', ...a]) },
    scale: { set: (...a) => writes.push(['scale', ...a]) },
    quaternion: {},
    updateMatrixWorld() {},
  };
  let guardState = GUARD_STATES.NEUTRAL;
  const controller = createWeaponMountController({
    weapon: { object3d },
    mounts: {
      [SKYRIM]: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0.1, y: 0.2, z: 0.3 }, scale: { x: 1, y: 1, z: 1 } },
      [KAYKIT]: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: Math.PI }, scale: { x: 1, y: 1, z: 1 } },
    },
    mode,
    readGuardState: () => guardState,
  });
  return { controller, writes, setGuard: (s) => { guardState = s; } };
}
const rotations = (writes) => writes.filter((w) => w[0] === 'rotation').map((w) => w.slice(1));

test('R23E.1 the mount is written on change, not every frame', () => {
  const { controller, writes } = harness('skyrim');
  for (let i = 0; i < 30; i += 1) controller.frame();
  assert.equal(rotations(writes).length, 1, 'thirty frames, one write');
  assert.deepEqual(rotations(writes)[0], [0.1, 0.2, 0.3]);
});

test('R23E.1 follow really swaps the mount when the guard goes up and back down', () => {
  const { controller, writes, setGuard } = harness('follow');
  controller.frame();
  assert.equal(controller.report.applied, KAYKIT, 'neutral wears the UAL mount');
  assert.deepEqual(rotations(writes).at(-1), [0, 0, Math.PI]);

  setGuard(GUARD_STATES.HOLD);
  controller.frame(); controller.frame(); controller.frame();
  assert.equal(controller.report.applied, SKYRIM, 'a raised guard wears the Skyrim mount');
  assert.deepEqual(rotations(writes).at(-1), [0.1, 0.2, 0.3]);
  assert.equal(rotations(writes).length, 2, 'and holding it writes once, not once per frame');

  setGuard(GUARD_STATES.NEUTRAL);
  controller.frame();
  assert.equal(controller.report.applied, KAYKIT, 'and back down again');
  assert.equal(rotations(writes).length, 3);
  assert.equal(controller.report.reason, 'a-ual-clip-is-posing-the-hand');
});

test('R23E.1 a fixed mode never swaps, whatever the guard does', () => {
  for (const mode of ['skyrim', 'kaykit']) {
    const { controller, writes, setGuard } = harness(mode);
    controller.frame();
    for (const state of Object.values(GUARD_STATES)) { setGuard(state); controller.frame(); }
    assert.equal(rotations(writes).length, 1, `${mode} wrote more than once`);
  }
});

test('R23E.1 a controller with only one mount to reach for refuses to be built', () => {
  assert.throws(() => createWeaponMountController({
    weapon: { object3d: { position: {}, rotation: {}, scale: {}, quaternion: {} } },
    mounts: { [SKYRIM]: { rotation: { x: 0, y: 0, z: 0 } } },
  }), /kaykit-default/);
  assert.throws(() => createWeaponMountController({ weapon: null, mounts: {} }), /mounted weapon/);
});

test('R23E.1 the dial reaches the lab through the same reader as every other one', () => {
  const params = (search) => readLabExperimentParameters(new URLSearchParams(search));
  assert.equal(params('').weaponMountMode, WEAPON_MOUNT_MODE_DEFAULT);
  assert.equal(params('').weaponMountReason, 'not-asked-for');
  assert.equal(params(`mount=${WEAPON_MOUNT_MODE_DEFAULT}`).weaponMountReason, 'shipped-default',
    'asking for the default explicitly is a different fact from not asking');
  assert.equal(params('mount=skyrim').weaponMountMode, WEAPON_MOUNT_MODES.SKYRIM);
  assert.equal(params('mount=follow').weaponMountMode, WEAPON_MOUNT_MODES.FOLLOW);
  assert.equal(params('mount=kaykit').weaponMountMode, WEAPON_MOUNT_MODES.KAYKIT);
  assert.equal(params('mount=nonsense').weaponMountReason, 'unknown-mode');
  // The other dials are untouched by it - a new parameter that moved an old one would be the
  // worst kind of quiet.
  assert.equal(params('mount=follow').tempoScale, params('').tempoScale);
  assert.equal(params('mount=follow').sprintSpeedMps, params('').sprintSpeedMps);
  assert.equal(params('mount=follow').wholeBodyRun, params('').wholeBodyRun);
});
