import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRODUCTION_GUARD_HOLD_STAGE,
  STABLE_GUARD_HOLD_STAGE,
  canonicalGuardSourceTime,
  createGuardPresentationRuntime,
} from '../src/combat/guard-presentation-runtime.js';
import {
  GUARD_EVENTS,
  GUARD_STATES,
  createGuardStateMachine,
} from '../src/combat/guard-state-machine.js';
import {
  PRODUCTION_PARRY_DEFLECT_CLIP_IDS,
  PRODUCTION_PARRY_DEFLECT_VARIANTS,
  getProductionParryDeflectProfile,
} from '../src/animation/parry-contact-deflect-runtime-clip.js';

const PARRY_DURATION = getProductionParryDeflectProfile(PRODUCTION_PARRY_DEFLECT_VARIANTS.PARRY).reactionDurationSeconds;
const PERFECT_DURATION = getProductionParryDeflectProfile(PRODUCTION_PARRY_DEFLECT_VARIANTS.PERFECT_PARRY).reactionDurationSeconds;

function transformComponent(values) {
  return { ...values, set(...args) {
    const keys = Object.keys(values);
    keys.forEach((key, index) => { this[key] = args[index]; });
  } };
}

function createBone() {
  return {
    position: transformComponent({ x: 0, y: 0, z: 0 }),
    quaternion: transformComponent({ x: 0, y: 0, z: 0, w: 1 }),
    scale: transformComponent({ x: 1, y: 1, z: 1 }),
  };
}

function createCharacter() {
  const samples = [];
  const durations = new Map([
    ['SKYRIM_GUARD/shd_blockidle', 2],
    [PRODUCTION_PARRY_DEFLECT_CLIP_IDS.PARRY, PARRY_DURATION],
    [PRODUCTION_PARRY_DEFLECT_CLIP_IDS.PERFECT_PARRY, PERFECT_DURATION],
    ['SKYRIM_GUARD/shd_blockhit', 0.8],
    ['Melee_Block_Attack', 0.75],
  ]);
  return {
    samples,
    rig: {
      bones: { chest: createBone() },
      root: { updateMatrixWorld() {} },
    },
    getAnimationDuration(name) { return durations.get(name) || 0; },
    sampleAnimation(name, timeSeconds, options) {
      samples.push({ name, timeSeconds, options: { ...options } });
      return { name };
    },
    stopAnimation() {},
    update() {},
  };
}

function enterHold(machine, runtime) {
  machine.send(GUARD_EVENTS.GUARD_PRESS);
  runtime.sync();
  return runtime.update(180);
}

test('G3.5.2 canonical Guard source time remains the authored 50 percent recovery anchor', () => {
  assert.equal(STABLE_GUARD_HOLD_STAGE, 'G3.5.2');
  assert.equal(canonicalGuardSourceTime(2), 1);
  assert.equal(canonicalGuardSourceTime(0.8), 0.4);
});

test('G3.6.5 Guard HOLD starts at canonical pose then plays the full Skyrim source at 1.00x', () => {
  assert.equal(PRODUCTION_GUARD_HOLD_STAGE, 'G3.6.5');
  const machine = createGuardStateMachine();
  const character = createCharacter();
  const runtime = createGuardPresentationRuntime(null, {
    machine,
    character,
    applyCorrection: () => {},
  });

  let result = enterHold(machine, runtime);
  assert.equal(result.snapshot.state, GUARD_STATES.HOLD);
  assert.equal(result.report.sourceTimeSeconds, 1);
  assert.equal(result.report.stableGuardStage, STABLE_GUARD_HOLD_STAGE);
  assert.equal(result.report.livingGuardStage, PRODUCTION_GUARD_HOLD_STAGE);
  assert.equal(result.report.livingGuardSourceRate, 1);
  assert.equal(result.report.canonicalGuardSample, 0.5);

  let holdSample = character.samples.filter((entry) => entry.name === 'SKYRIM_GUARD/shd_blockidle').at(-1);
  assert.equal(holdSample.timeSeconds, 1);
  assert.equal(holdSample.options.loop, false);
  assert.equal(holdSample.options.inPlace, true);
  assert.equal(holdSample.options.rootRotationPolicy, 'lock');

  result = runtime.update(375);
  assert.equal(result.snapshot.state, GUARD_STATES.HOLD);
  assert.equal(result.report.sourceTimeSeconds, 1.375);
  holdSample = character.samples.filter((entry) => entry.name === 'SKYRIM_GUARD/shd_blockidle').at(-1);
  assert.equal(holdSample.timeSeconds, 1.375);

  result = runtime.update(1000);
  assert.equal(result.snapshot.state, GUARD_STATES.HOLD);
  assert.equal(result.report.sourceTimeSeconds, 0.375);
  assert.equal(result.report.livingGuardCompletedLoops, 1);
});

test('G3.6.3 D Parry Recover still targets canonical Guard before G3.6.5 Living Hold resumes', () => {
  const machine = createGuardStateMachine();
  const character = createCharacter();
  const runtime = createGuardPresentationRuntime(null, {
    machine,
    character,
    applyCorrection: () => {},
  });

  enterHold(machine, runtime);
  runtime.update(420);
  machine.send(GUARD_EVENTS.PARRY_CONFIRMED, { attackId: 'living-hold-parry' });
  let result = runtime.update(PARRY_DURATION * 1000);
  assert.equal(result.snapshot.state, GUARD_STATES.RECOVER);
  assert.equal(result.report.sourceTimeSeconds, 1);
  assert.equal(result.report.stableGuardStage, STABLE_GUARD_HOLD_STAGE);
  assert.equal(result.report.canonicalGuardSample, 0.5);
  assert.equal(result.report.livingGuardStage, null);

  const recoverTarget = character.samples.filter((entry) => entry.name === 'SKYRIM_GUARD/shd_blockidle').at(-1);
  assert.equal(recoverTarget.timeSeconds, 1);
  assert.equal(recoverTarget.options.loop, false);

  result = runtime.update(result.report.recoveryDurationMs);
  assert.equal(result.snapshot.state, GUARD_STATES.HOLD);
  assert.equal(result.report.sourceTimeSeconds, 1);
  assert.equal(result.report.livingGuardStage, PRODUCTION_GUARD_HOLD_STAGE);
  assert.equal(result.report.livingGuardSourceRate, 1);
});
