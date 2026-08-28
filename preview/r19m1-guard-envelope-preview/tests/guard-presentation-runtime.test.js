import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuardPresentationRuntime } from '../src/combat/guard-presentation-runtime.js';
import {
  GUARD_EVENTS,
  GUARD_STATES,
  createGuardStateMachine,
} from '../src/combat/guard-state-machine.js';
import {
  GUARD_COUNTER_PROFILE_IDS,
  GUARD_WEAPON_MOUNT_PROFILE_IDS,
} from '../src/combat/guard-counter-presentation.js';
import {
  PRODUCTION_PARRY_DEFLECT_CLIP_IDS,
  PRODUCTION_PARRY_DEFLECT_VARIANTS,
  getProductionParryDeflectProfile,
} from '../src/animation/parry-contact-deflect-runtime-clip.js';

const PRODUCTION_PARRY_DURATION = getProductionParryDeflectProfile(PRODUCTION_PARRY_DEFLECT_VARIANTS.PARRY).reactionDurationSeconds;
const PRODUCTION_PERFECT_DURATION = getProductionParryDeflectProfile(PRODUCTION_PARRY_DEFLECT_VARIANTS.PERFECT_PARRY).reactionDurationSeconds;

function createCharacterStub(options = {}) {
  const samples = [];
  const stops = [];
  const updates = [];
  const durations = new Map([
    ['SKYRIM_GUARD/shd_blockidle', 2],
    ['SKYRIM_GUARD/shd_blockhit', 0.8],
    ['SKYRIM_GUARD/shd_blockbash', 1 / 3],
    ['SKYRIM_GUARD/shd_blockbashpower', 0.7],
    [PRODUCTION_PARRY_DEFLECT_CLIP_IDS.PARRY, PRODUCTION_PARRY_DURATION],
    [PRODUCTION_PARRY_DEFLECT_CLIP_IDS.PERFECT_PARRY, PRODUCTION_PERFECT_DURATION],
    ...(!options.omitCounter ? [['Melee_Block_Attack', 0.75]] : []),
  ]);
  return {
    samples,
    stops,
    updates,
    rig: { bones: {} },
    getAnimationDuration(name) { return durations.get(name) || 0; },
    sampleAnimation(name, timeSeconds, sampleOptions) {
      samples.push({ name, timeSeconds, options: { ...sampleOptions } });
      return { name };
    },
    stopAnimation() { stops.push(true); },
    update(deltaSeconds, camera) { updates.push({ deltaSeconds, camera }); },
  };
}

function enterHold(machine, runtime) {
  machine.send(GUARD_EVENTS.GUARD_PRESS);
  runtime.sync();
  const result = runtime.update(180);
  assert.equal(result.snapshot.state, GUARD_STATES.HOLD);
}

function createHarness(options = {}) {
  const machine = createGuardStateMachine();
  const character = createCharacterStub(options);
  const correctionWeights = [];
  const mountProfiles = [];
  const runtime = createGuardPresentationRuntime(null, {
    machine,
    character,
    applyCorrection: (weight) => correctionWeights.push(weight),
    applyWeaponMountProfile: (profileId, snapshot) => mountProfiles.push({ profileId, state: snapshot.state }),
  });
  return { machine, character, correctionWeights, mountProfiles, runtime };
}

test('G3.4.2R completes Block Hit at 0.60s and requests locked root rotation', () => {
  const { machine, character, runtime } = createHarness();
  enterHold(machine, runtime);
  const holdSample = character.samples.filter((entry) => entry.name === 'SKYRIM_GUARD/shd_blockidle').at(-1);
  assert.equal(holdSample.options.inPlace, true);
  assert.equal(holdSample.options.rootRotationPolicy, 'lock');
  machine.send(GUARD_EVENTS.BLOCK_CONFIRMED, { attackId: 'attack-block' });
  let result = runtime.update(599);
  assert.equal(result.snapshot.state, GUARD_STATES.BLOCK_HIT);
  assert.equal(result.report.clipId, 'SKYRIM_GUARD/shd_blockhit');
  assert.equal(result.report.counterWindowOpen, true);
  assert.ok(result.report.sourceTimeSeconds < 0.6);
  result = runtime.update(1);
  assert.equal(result.snapshot.state, GUARD_STATES.RECOVER);
  assert.equal(result.snapshot.lastTransition.payload.sourceTimeSeconds, 0.6);
  const blockSamples = character.samples.filter((entry) => entry.name === 'SKYRIM_GUARD/shd_blockhit');
  assert.equal(blockSamples.at(-1).timeSeconds, 0.6);
  result = runtime.update(140);
  assert.equal(result.snapshot.state, GUARD_STATES.HOLD);
});

test('G3.6.3 runtime plays the promoted D virtual clip for normal Parry through 0.96s', () => {
  const { machine, character, runtime } = createHarness();
  enterHold(machine, runtime);
  machine.send(GUARD_EVENTS.PARRY_CONFIRMED, { attackId: 'attack-parry' });
  let result = runtime.update(100);
  assert.equal(result.snapshot.state, GUARD_STATES.PARRY);
  assert.equal(result.report.clipId, PRODUCTION_PARRY_DEFLECT_CLIP_IDS.PARRY);
  assert.equal(result.report.counterWindowOpen, true);

  result = runtime.update(859);
  assert.equal(result.snapshot.state, GUARD_STATES.PARRY);
  assert.equal(result.report.counterWindowOpen, false);
  assert.ok(result.report.sourceTimeSeconds < PRODUCTION_PARRY_DURATION);

  result = runtime.update(1);
  assert.equal(result.snapshot.state, GUARD_STATES.RECOVER);
  const parrySamples = character.samples.filter((entry) => entry.name === PRODUCTION_PARRY_DEFLECT_CLIP_IDS.PARRY);
  assert.equal(parrySamples.at(-1).timeSeconds, PRODUCTION_PARRY_DURATION);
  assert.equal(parrySamples.at(-1).options.rootRotationPolicy, 'lock');
});

test('G3.6.3 runtime plays the shared D Perfect virtual clip while preserving its reward window', () => {
  const { machine, character, runtime } = createHarness();
  enterHold(machine, runtime);
  const parry = machine.send(GUARD_EVENTS.PARRY_CONFIRMED, { perfect: true, authorityTick: 120 });
  assert.equal(parry.snapshot.state, GUARD_STATES.PARRY);
  assert.equal(parry.snapshot.presentation.clipId, PRODUCTION_PARRY_DEFLECT_CLIP_IDS.PERFECT_PARRY);

  let result = runtime.update(480);
  assert.equal(result.snapshot.state, GUARD_STATES.PARRY);
  assert.equal(result.report.clipId, PRODUCTION_PARRY_DEFLECT_CLIP_IDS.PERFECT_PARRY);
  assert.equal(result.report.counterWindowOpen, true);
  assert.equal(result.report.sourceTimeSeconds, 0.48);

  result = runtime.update(479);
  assert.equal(result.snapshot.state, GUARD_STATES.PARRY);
  assert.equal(result.report.counterWindowOpen, false);
  assert.ok(result.report.sourceTimeSeconds < PRODUCTION_PERFECT_DURATION);

  result = runtime.update(1);
  assert.equal(result.snapshot.state, GUARD_STATES.RECOVER);
  assert.equal(result.snapshot.lastTransition.payload.reactionVariant, 'perfect-parry');
  const perfectSamples = character.samples.filter((entry) => entry.name === PRODUCTION_PARRY_DEFLECT_CLIP_IDS.PERFECT_PARRY);
  assert.equal(perfectSamples.at(-1).timeSeconds, PRODUCTION_PERFECT_DURATION);
});

test('G3.4 counter window remains presentation-only until authoritative COUNTER_CONFIRMED', () => {
  const { machine, runtime } = createHarness();
  enterHold(machine, runtime);
  machine.send(GUARD_EVENTS.PARRY_CONFIRMED);
  const result = runtime.update(100);
  assert.equal(result.report.counterWindowOpen, true);
  assert.equal(machine.state, GUARD_STATES.PARRY);
  assert.notEqual(machine.state, GUARD_STATES.COUNTER);
  const counter = machine.send(GUARD_EVENTS.COUNTER_CONFIRMED, { authorityTick: 999 });
  assert.equal(counter.accepted, true);
  assert.equal(counter.snapshot.state, GUARD_STATES.COUNTER);
  const synced = runtime.sync();
  assert.equal(synced.report.clipId, 'Melee_Block_Attack');
  assert.equal(synced.report.counterProfileId, GUARD_COUNTER_PROFILE_IDS.LONGSWORD);
});

test('G3.4 runtime plays full Melee_Block_Attack then presentation-completes into G3.2 Recover', () => {
  const { machine, character, correctionWeights, mountProfiles, runtime } = createHarness();
  enterHold(machine, runtime);
  machine.send(GUARD_EVENTS.PARRY_CONFIRMED, { perfect: true });
  runtime.update(120);
  const confirmed = machine.send(GUARD_EVENTS.COUNTER_CONFIRMED, { authorityTick: 1001 });
  assert.equal(confirmed.snapshot.state, GUARD_STATES.COUNTER);
  let result = runtime.update(749);
  assert.equal(result.snapshot.state, GUARD_STATES.COUNTER);
  assert.equal(result.report.clipId, 'Melee_Block_Attack');
  assert.equal(result.report.weaponMountProfileId, GUARD_WEAPON_MOUNT_PROFILE_IDS.KAYKIT_DEFAULT);
  assert.equal(correctionWeights.at(-1), 0);
  result = runtime.update(1);
  assert.equal(result.snapshot.state, GUARD_STATES.RECOVER);
  assert.equal(result.snapshot.lastTransition.payload.sourceTimeSeconds, 0.75);
  assert.equal(result.report.weaponMountProfileId, GUARD_WEAPON_MOUNT_PROFILE_IDS.SKYRIM_GUARD);
  const counterSamples = character.samples.filter((entry) => entry.name === 'Melee_Block_Attack');
  assert.equal(counterSamples.at(-1).timeSeconds, 0.75);
  assert.ok(mountProfiles.some((entry) => entry.state === GUARD_STATES.COUNTER
    && entry.profileId === GUARD_WEAPON_MOUNT_PROFILE_IDS.KAYKIT_DEFAULT));
  result = runtime.update(140);
  assert.equal(result.snapshot.state, GUARD_STATES.HOLD);
});

test('G3.4 delayed authoritative Counter from Recover still gets the authored Counter presentation', () => {
  const { machine, runtime } = createHarness();
  enterHold(machine, runtime);
  machine.send(GUARD_EVENTS.BLOCK_CONFIRMED);
  let result = runtime.update(600);
  assert.equal(result.snapshot.state, GUARD_STATES.RECOVER);
  const counter = machine.send(GUARD_EVENTS.COUNTER_CONFIRMED, { authorityTick: 1200 });
  assert.equal(counter.accepted, true);
  result = runtime.sync();
  assert.equal(result.report.clipId, 'Melee_Block_Attack');
  assert.equal(result.report.sourceTimeSeconds, 0);
});

test('G3.4 fails loudly if the Counter animation was not registered', () => {
  const { machine, runtime } = createHarness({ omitCounter: true });
  enterHold(machine, runtime);
  machine.send(GUARD_EVENTS.PARRY_CONFIRMED);
  machine.send(GUARD_EVENTS.COUNTER_CONFIRMED);
  assert.throws(() => runtime.sync(), /requires registered animation Melee_Block_Attack/);
});

test('G3.4 keeps Guard release latched through reaction, Counter and Recover', () => {
  const { machine, runtime } = createHarness();
  enterHold(machine, runtime);
  machine.send(GUARD_EVENTS.BLOCK_CONFIRMED);
  machine.send(GUARD_EVENTS.GUARD_RELEASE);
  machine.send(GUARD_EVENTS.COUNTER_CONFIRMED);
  let result = runtime.update(750);
  assert.equal(result.snapshot.state, GUARD_STATES.RECOVER);
  assert.equal(result.snapshot.guardHeld, false);
  result = runtime.update(140);
  assert.equal(result.snapshot.state, GUARD_STATES.EXIT);
  result = runtime.update(160);
  assert.equal(result.snapshot.state, GUARD_STATES.NEUTRAL);
});
