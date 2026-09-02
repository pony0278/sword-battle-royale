import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { codeOnly } from './support/source-text.js';
import { createAttackerPresentationAdapter } from '../src/game/attacker-presentation.js';

const entrySource = readFileSync(
  new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url),
  'utf8',
);
const presentationSource = readFileSync(
  new URL('../src/game/attacker-presentation.js', import.meta.url),
  'utf8',
);
const engagementSource = readFileSync(new URL('../src/game/engagement.js', import.meta.url), 'utf8');

function createHarness(exchangeStateOverrides = {}) {
  const calls = [];
  class Vector3 {
    constructor() { this.x = 0; this.y = 0; this.z = 0; }
  }
  const bones = Object.fromEntries([
    ['hips', [0, 1, 0]],
    ['chest', [0, 2, 0]],
    ['head', [0, 3, 0]],
    ['upperarm.l', [-1, 2, 0]],
    ['upperarm.r', [1, 2, 0]],
  ].map(([name, value]) => [name, {
    getWorldPosition(out) { [out.x, out.y, out.z] = value; },
  }]));
  const attacker = {
    rig: { root: { updateMatrixWorld() { calls.push(['updateMatrixWorld']); } }, bones },
    sampleAnimation(...args) { calls.push(['sampleAnimation', ...args]); },
    update(...args) { calls.push(['update', ...args]); },
  };
  const exchangeState = {
    frozenAttackerContactPose: null,
    step3AReleaseBlend: null,
    canonicalAttackerOldB3Pose: null,
    canonicalAttackerOldB3WorldSilhouette: null,
    ...exchangeStateOverrides,
  };
  let poseIndex = 0;
  const services = {
    captureRigPose() { const pose = { id: `pose-${poseIndex}` }; poseIndex += 1; calls.push(['captureRigPose', pose]); return pose; },
    applyRigPose(_rig, pose) { calls.push(['applyRigPose', pose]); },
    blendRecoveryPose(sourceA, sourceB, target, progress, options) {
      calls.push(['blendRecoveryPose', sourceA, sourceB, target, progress, options]);
      return { blended: true, progress };
    },
    sampleLongswordAttackRecovery(direction, elapsedMs) {
      calls.push(['sampleLongswordAttackRecovery', direction, elapsedMs]);
      return { progress: 0.5, complete: false, profile: { attackRecoveryDurationMs: 180 } };
    },
    sampleLiveParryOldB3ReleaseBlend(elapsedMs, durationMs) {
      calls.push(['sampleLiveParryOldB3ReleaseBlend', elapsedMs, durationMs]);
      return { progress: 0.25 };
    },
  };
  const adapter = createAttackerPresentationAdapter({
    THREE: { Vector3 },
    attacker,
    camera: { id: 'camera' },
    exchangeState,
    services,
  });
  return { adapter, attacker, exchangeState, calls };
}

test('R18M.C2 the engagement owns the swinger\'s presentation, the entry keeps the lifecycle', () => {
  // R23F.1: the adapter and the recovery/idle clock it carries between frames moved into the
  // engagement, which is what made a second exchange possible. The entry still decides WHEN a
  // recovery begins and when a base pose is sampled, which is the authority half of this claim.
  assert.match(engagementSource, /createAttackerPresentationAdapter/);
  assert.doesNotMatch(entrySource, /function captureAttackerWorldSilhouette\(/);
  assert.doesNotMatch(entrySource, /function sampleCanonicalInterruptionPose\(/);
  assert.doesNotMatch(entrySource, /function sampleOriginalContactPose\(/);
  assert.match(engagementSource, /let recovery = null/);
  assert.match(engagementSource, /let idleClockSeconds = 0/);
  assert.doesNotMatch(codeOnly(entrySource), /let attackerRecovery/, 'the entry no longer holds it loose');
  assert.match(entrySource, /function beginAttackRecovery\(direction\)/);
  assert.match(entrySource, /function sampleAttackerBase\(snapshot, deltaMs\)/);
  assert.match(entrySource, /function frame\(timestamp\)/);
  assert.match(entrySource, /function startAttack\(direction = selectedDirection\)/);
  assert.match(entrySource, /function restartAttack\(direction = selectedDirection\)/);
});

test('R18M.C2 presentation module contains no Parry/contact success or release authority', () => {
  for (const forbidden of [
    'parryGate.arm',
    'parryGate.confirm',
    'combat.resolveContact',
    'probeSweptSwordBucklerContact',
    'releaseLiveContactToOldB3',
    'buildLiveParryOldB3Handoff',
    'publishPostCouplingRecoilStaggerHandoff',
    'DEFLECT_IMPULSE',
  ]) assert.ok(!presentationSource.includes(forbidden), forbidden);
  assert.ok(!presentationSource.includes("from '../../src/combat"));
  assert.ok(!presentationSource.includes("from '../../../src/combat"));
  assert.match(presentationSource, /sampleFrozenContactPose/);
  assert.match(presentationSource, /captureCanonicalOldB3Base/);
  assert.match(presentationSource, /sampleBase/);
});

test('R18M.C2 sampleFrozenContactPose preserves live-contact, release-blend, canonical, and interruption branches', () => {
  {
    const { adapter, calls } = createHarness({ frozenAttackerContactPose: { id: 'frozen' } });
    adapter.sampleFrozenContactPose({ clipId: 'clip' }, { ownsLiveContact: true });
    assert.deepEqual(calls.find((call) => call[0] === 'applyRigPose')?.[1], { id: 'frozen' });
    assert.equal(calls.some((call) => call[0] === 'sampleLiveParryOldB3ReleaseBlend'), false);
  }
  {
    const release = { sourcePose: { id: 'source' }, targetPose: { id: 'target' }, elapsedMs: 7, durationMs: 28 };
    const { adapter, exchangeState, calls } = createHarness({ step3AReleaseBlend: release });
    adapter.sampleFrozenContactPose({ clipId: 'clip' });
    assert.deepEqual(calls.find((call) => call[0] === 'sampleLiveParryOldB3ReleaseBlend'), ['sampleLiveParryOldB3ReleaseBlend', 7, 28]);
    const blendCall = calls.find((call) => call[0] === 'blendRecoveryPose');
    assert.equal(blendCall[1], release.sourcePose);
    assert.equal(blendCall[2], release.sourcePose);
    assert.equal(blendCall[3], release.targetPose);
    assert.equal(blendCall[4], 0.25);
    assert.deepEqual(blendCall[5], { durationMs: 28, sampleDeltaMs: 0, momentumScale: 0 });
    assert.deepEqual(exchangeState.step3AReleaseBlend.sample, { progress: 0.25 });
  }
  {
    const { adapter, calls } = createHarness({ canonicalAttackerOldB3Pose: { id: 'canonical' } });
    adapter.sampleFrozenContactPose({ clipId: 'clip' });
    assert.deepEqual(calls.find((call) => call[0] === 'applyRigPose')?.[1], { id: 'canonical' });
  }
  {
    const { adapter, calls } = createHarness();
    adapter.sampleFrozenContactPose({ clipId: 'clip', sourceTimeSeconds: 0.42, inPlace: false, rootRotationPolicy: 'keep' });
    const sample = calls.find((call) => call[0] === 'sampleAnimation');
    assert.equal(sample[1], 'clip');
    assert.equal(sample[2], 0.42);
    assert.deepEqual(sample[3], { loop: false, inPlace: false, rootRotationPolicy: 'keep' });
  }
});

test('R18M.C2 canonical capture restores visible pose and records the same world silhouette shape', () => {
  const { adapter, exchangeState, calls } = createHarness();
  assert.equal(adapter.captureCanonicalOldB3Base({ clipId: 'old-b3', sourceTimeSeconds: 0.25, inPlace: true }), true);
  assert.deepEqual(exchangeState.canonicalAttackerOldB3Pose, { id: 'pose-1' });
  assert.deepEqual(exchangeState.canonicalAttackerOldB3WorldSilhouette, {
    hips: { x: 0, y: 1, z: 0 },
    chest: { x: 0, y: 2, z: 0 },
    head: { x: 0, y: 3, z: 0 },
    shoulders: { x: 0, y: 2, z: 0 },
  });
  assert.deepEqual(calls.find((call) => call[0] === 'applyRigPose')?.[1], { id: 'pose-0' });
});

test('R18M.C2 recovery and idle sampling keep timing math in presentation only while state ownership stays external', () => {
  const { adapter, calls } = createHarness();
  const recovery = adapter.createRecovery('right');
  assert.equal(recovery.direction, 'right');
  assert.equal(recovery.elapsedMs, 0);
  const next = adapter.sampleBase({
    snapshot: { action: null },
    deltaMs: 20,
    recovery,
    idleClockSeconds: 0,
    idleDuration: 1,
  });
  assert.equal(recovery.elapsedMs, 20);
  assert.equal(next.recovery, recovery);
  assert.deepEqual(calls.find((call) => call[0] === 'sampleLongswordAttackRecovery'), ['sampleLongswordAttackRecovery', 'right', 20]);

  const idleHarness = createHarness();
  const idleNext = idleHarness.adapter.sampleBase({
    snapshot: { action: null },
    deltaMs: 20,
    recovery: null,
    idleClockSeconds: 0.5,
    idleDuration: 1,
  });
  assert.equal(idleNext.idleClockSeconds, 0.52);
  const sample = idleHarness.calls.find((call) => call[0] === 'sampleAnimation');
  assert.equal(sample[1], 'UAL1/Sword_Idle');
  assert.ok(Math.abs(sample[2] - 0.52) < 1e-9);
});
