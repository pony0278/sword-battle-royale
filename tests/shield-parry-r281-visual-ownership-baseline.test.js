import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  R18N_VISUAL_OWNERSHIP_BASELINE_STAGE,
  R18N_VISUAL_OWNERSHIP_ORDER,
  R18N_VISUAL_OWNERSHIP_WRITERS,
  captureVisualOwnershipPose,
  createVisualOwnershipBaselineRecorder,
  diffVisualOwnershipPose,
  quaternionAngularDistanceDegrees,
} from '../tools/action-studio/shield-parry-r281/visual-ownership-baseline.js';

function yaw(degrees) {
  const radians = degrees * Math.PI / 180;
  return { x: 0, y: Math.sin(radians / 2), z: 0, w: Math.cos(radians / 2) };
}

function fakeRig() {
  return {
    bones: {
      root: { quaternion: yaw(0) },
      chest: { quaternion: yaw(0) },
      'upperarm.l': { quaternion: yaw(0) },
      'lowerarm.l': { quaternion: yaw(0) },
      head: { quaternion: yaw(0) },
    },
  };
}

test('R18N.4.1 quaternion diff treats q and -q as the same rotation', () => {
  const q = yaw(42);
  const negated = { x: -q.x, y: -q.y, z: -q.z, w: -q.w };
  assert.ok(quaternionAngularDistanceDegrees(q, negated) < 1e-6);
});

test('R18N.4.1 capture is observer-only and returns detached quaternion values', () => {
  const rig = fakeRig();
  const pose = captureVisualOwnershipPose(rig, ['chest']);
  assert.deepEqual(pose.chest, yaw(0));
  rig.bones.chest.quaternion = yaw(30);
  assert.deepEqual(pose.chest, yaw(0));
  assert.ok(Object.isFrozen(pose));
  assert.ok(Object.isFrozen(pose.chest));
});

test('R18N.4.1 diff reports only rotations above the telemetry epsilon', () => {
  const before = { chest: yaw(0), 'upperarm.l': yaw(0) };
  const after = { chest: yaw(0.01), 'upperarm.l': yaw(3) };
  const diff = diffVisualOwnershipPose(before, after, { epsilonDegrees: 0.05 });
  assert.deepEqual(diff.changedBones, ['upperarm.l']);
  assert.ok(diff.deltasDegrees['upperarm.l'] > 2.9);
});

test('R18N.4.1 recorder identifies the final writer per bone without writing the rig', () => {
  const rig = fakeRig();
  const recorder = createVisualOwnershipBaselineRecorder({
    boneIds: ['root', 'chest', 'upperarm.l', 'lowerarm.l', 'head'],
  });
  recorder.beginFrame({ sequence: 7, attackPhase: 'attack_active', elapsedSeconds: 0.21, rig });

  rig.bones.head.quaternion = yaw(4);
  recorder.record(R18N_VISUAL_OWNERSHIP_WRITERS.GUARD_RUNTIME, { rig });

  rig.bones.chest.quaternion = yaw(6);
  rig.bones['upperarm.l'].quaternion = yaw(8);
  recorder.record(R18N_VISUAL_OWNERSHIP_WRITERS.PREDICTIVE_PRESENTATION, { rig });

  rig.bones['upperarm.l'].quaternion = yaw(12);
  rig.bones['lowerarm.l'].quaternion = yaw(9);
  recorder.record(R18N_VISUAL_OWNERSHIP_WRITERS.ACTIVE_INTERCEPT_PRIMARY, { rig });

  rig.bones.chest.quaternion = yaw(7);
  recorder.record(R18N_VISUAL_OWNERSHIP_WRITERS.RESIDUAL_BODY_REACH, { rig });

  recorder.record(R18N_VISUAL_OWNERSHIP_WRITERS.PRE_CONTACT_FINAL, { rig });
  const report = recorder.finish({ contact: false });

  assert.equal(report.stage, R18N_VISUAL_OWNERSHIP_BASELINE_STAGE);
  assert.equal(report.orderValid, true);
  assert.equal(report.authority, 'observer-only-no-rig-write-no-contact-authority');
  assert.equal(report.lastWriterByBone.head, R18N_VISUAL_OWNERSHIP_WRITERS.GUARD_RUNTIME);
  assert.equal(report.lastWriterByBone['upperarm.l'], R18N_VISUAL_OWNERSHIP_WRITERS.ACTIVE_INTERCEPT_PRIMARY);
  assert.equal(report.lastWriterByBone['lowerarm.l'], R18N_VISUAL_OWNERSHIP_WRITERS.ACTIVE_INTERCEPT_PRIMARY);
  assert.equal(report.lastWriterByBone.chest, R18N_VISUAL_OWNERSHIP_WRITERS.RESIDUAL_BODY_REACH);
  assert.equal(recorder.active, false);
});

test('R18N.4.1 recorder makes writer-order regressions explicit instead of silently accepting them', () => {
  const rig = fakeRig();
  const recorder = createVisualOwnershipBaselineRecorder({ boneIds: ['chest'] });
  recorder.beginFrame({ rig });
  recorder.record(R18N_VISUAL_OWNERSHIP_WRITERS.PREDICTIVE_PRESENTATION, { rig });
  recorder.record(R18N_VISUAL_OWNERSHIP_WRITERS.GUARD_RUNTIME, { rig });
  const report = recorder.finish();
  assert.equal(report.orderValid, false);
  assert.equal(report.orderViolations.length, 1);
  assert.equal(report.orderViolations[0].writer, R18N_VISUAL_OWNERSHIP_WRITERS.GUARD_RUNTIME);
});

test('R18N.4.1 telemetry module has no production mutation or contact authority', async () => {
  const source = await readFile(
    new URL('../tools/action-studio/shield-parry-r281/visual-ownership-baseline.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /\.quaternion\.(?:copy|set|premultiply|multiply|slerp)/);
  assert.doesNotMatch(source, /combat\.resolveContact|parryGate\.(?:arm|confirm)|probeSweptSwordBucklerContact/);
  assert.match(source, /observer-only-no-rig-write-no-contact-authority/);
});


test('R18N.4.1-B reconstructs the cross-frame Guard writer delta and ordered pre-contact taps', async () => {
  const { createVisualOwnershipRuntimeTaps } = await import('../tools/action-studio/shield-parry-r281/visual-ownership-runtime-taps.js');
  const rig = fakeRig();
  const exchangeState = { latestVisualOwnershipBaseline: null, visualOwnershipTrace: [] };
  const taps = createVisualOwnershipRuntimeTaps({ rig, exchangeState, traceLimit: 4 });

  taps.beginFrame({ sequence: 1, phase: 'attack_active', elapsedSeconds: 0.20 });
  rig.bones.chest.quaternion = yaw(4);
  taps.afterPredictive({ active: true, shieldArmOwnership: 'external-active-intercept-tracking' });
  rig.bones['upperarm.l'].quaternion = yaw(7);
  taps.afterPrimaryArm({ active: true, achievedDistance: 0.01 });
  rig.bones['lowerarm.l'].quaternion = yaw(5);
  taps.afterResidualArm({ achievedDistance: 0.002 });
  rig.bones.chest.quaternion = yaw(6);
  taps.afterBody({ active: true, authority: 'fixed-world-target-support-chain-no-contact-authority' });
  taps.afterStance({ activeCandidate: false, authority: 'pre-contact-guidance-only-real-swept-contact-required' });
  taps.afterShieldArmAdditive({
    stage: 'R18N.4.3-B.1',
    active: true,
    applied: false,
    appliedBones: [],
    finalPoseOwner: 'active-intercept-final-arm-closure',
    authority: 'bounded-authored-increment-before-active-intercept-final-solve-no-contact-authority',
  });
  taps.afterTopPrepReadabilityHold({
    stage: 'R18N.4.3-B.1.3',
    active: true,
    applied: false,
    envelopeWeight: 1,
    appliedBones: [],
    finalPoseOwner: 'active-intercept-final-arm-closure',
    authority: 'presentation-readability-local-pose-before-final-closure-no-contact-authority',
  });
  rig.bones['upperarm.l'].quaternion = yaw(8);
  taps.afterFinalClosure({ achievedDistance: 0.001 });
  const first = taps.finishFrame();
  assert.equal(first.orderValid, true);
  assert.deepEqual(first.observedOrder, R18N_VISUAL_OWNERSHIP_ORDER);
  assert.equal(exchangeState.visualOwnershipTrace.length, 1);

  rig.bones.head.quaternion = yaw(3);
  taps.beginFrame({ sequence: 1, phase: 'attack_active', elapsedSeconds: 0.216 });
  const second = taps.finishFrame();
  assert.equal(second.orderValid, true);
  assert.ok(second.changedByWriter[R18N_VISUAL_OWNERSHIP_WRITERS.GUARD_RUNTIME].includes('head'));
  assert.equal(second.lastWriterByBone.head, R18N_VISUAL_OWNERSHIP_WRITERS.GUARD_RUNTIME);
  assert.equal(second.samples[0].metadata.baselineQualified, true);
  assert.equal(exchangeState.visualOwnershipTrace.length, 2);
  assert.equal(taps.authority, 'observer-only-cross-frame-guard-baseline-no-rig-write-no-contact-authority');
});

test('R18N.4.1-B runtime tap adapter remains observer-only', async () => {
  const source = await readFile(new URL('../tools/action-studio/shield-parry-r281/visual-ownership-runtime-taps.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\.quaternion\.(?:copy|set|premultiply|multiply|slerp)/);
  assert.doesNotMatch(source, /combat\.resolveContact|parryGate\.(?:arm|confirm)|probeSweptSwordBucklerContact/);
  assert.match(source, /observer-only-cross-frame-guard-baseline-no-rig-write-no-contact-authority/);
});

test('R18N.4.1-B wires taps after existing writers and exposes diagnostics without changing contact authority', async () => {
  const preContact = await readFile(new URL('../src/game/pre-contact-controller.js', import.meta.url), 'utf8');
  const exchangeStateSource = await readFile(new URL('../src/game/exchange-state.js', import.meta.url), 'utf8');
  const debugApi = await readFile(new URL('../tools/action-studio/shield-parry-r281/debug-api.js', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
  function assertBefore(sourceText, earlier, later, label) {
    const earlierIndex = sourceText.indexOf(earlier);
    const laterIndex = sourceText.indexOf(later);
    assert.ok(earlierIndex >= 0, 'missing writer anchor: ' + earlier);
    assert.ok(laterIndex > earlierIndex, 'tap must follow writer: ' + label);
  }
  const director = await readFile(new URL('../src/combat/parry-intercept-director.js', import.meta.url), 'utf8');
  const parryStart = preContact.indexOf('function updateParryPreContact');
  const parryEnd = preContact.indexOf('function armActiveIntercept', parryStart);
  const parrySource = preContact.slice(parryStart, parryEnd);
  assertBefore(parrySource, 'predictivePresentation.update({', 'visualOwnership.afterPredictive(exchangeState.latestPredictiveReport)', 'predictive presentation');
  // R18S.3: the ladder's own writers moved into the director, and each one announces itself the
  // instant it has written, because these taps snapshot the rig at exactly that point. The lab
  // wires each announcement to its tap; the director guarantees the announcement follows the write.
  for (const [stage, tap] of [
    ['primaryArm', 'visualOwnership.afterPrimaryArm(report)'],
    ['residualArm', 'visualOwnership.afterResidualArm(report)'],
    ['body', 'visualOwnership.afterBody(report)'],
    ['stance', 'visualOwnership.afterStance(report)'],
  ]) {
    assert.ok(preContact.includes(`${stage}: (report) => ${tap}`), 'tap must stay wired to writer: ' + stage);
  }
  assert.match(director, /announce\('primaryArm', trackingRuntime\.update\(plan, deltaSeconds\)\)/);
  assert.match(director, /announce\(\s*\n?\s*'residualArm',/);
  // The lab's own authored-arm writers still sit between the ladder's stance and its final
  // closure, and each is still observed the instant it has written.
  assertBefore(parrySource, 'parryInterceptDirector.reach({', 'shieldArmAdditiveRuntime.update({', 'bounded authored arm additive after the reach ladder');
  assertBefore(parrySource, 'shieldArmAdditiveRuntime.update({', 'visualOwnership.afterShieldArmAdditive(shieldArmBoundedAdditive)', 'bounded authored arm additive tap');
  assertBefore(parrySource, 'visualOwnership.afterShieldArmAdditive(shieldArmBoundedAdditive)', 'topPrepReadabilityHoldRuntime.update({', 'TOP readability hold after bounded additive');
  assertBefore(parrySource, 'topPrepReadabilityHoldRuntime.update({', 'visualOwnership.afterTopPrepReadabilityHold(topPrepReadabilityHold)', 'TOP readability hold telemetry');
  assertBefore(parrySource, 'visualOwnership.afterTopPrepReadabilityHold(topPrepReadabilityHold)', 'parryInterceptDirector.finalClosure({', 'actual-target final closure remains after readability hold');
  assertBefore(parrySource, 'parryInterceptDirector.finalClosure({', 'topPrepReadabilityHoldRuntime.arm({', 'first final-closure TOP prep anchor capture');
  assertBefore(parrySource, 'topPrepReadabilityHoldRuntime.arm({', 'visualOwnership.afterFinalClosure(activeInterceptArmClosure)', 'final closure telemetry follows read-only anchor capture');

  const updateStart = preContact.indexOf('function updatePreContact');
  const updateEnd = preContact.indexOf('function recordWhiffProbe', updateStart);
  const updateSource = preContact.slice(updateStart, updateEnd);
  assertBefore(updateSource, 'visualOwnership.beginFrame(snapshot)', 'updateParryPreContact(snapshot, currentBlade, deltaSeconds, context)', 'frame begin before parry writers');
  assertBefore(updateSource, 'updateParryPreContact(snapshot, currentBlade, deltaSeconds, context)', 'visualOwnership.finishFrame()', 'frame finish after parry writers');
  assert.match(exchangeStateSource, /latestVisualOwnershipBaseline/);
  assert.match(exchangeStateSource, /visualOwnershipTrace/);
  assert.match(debugApi, /get latestVisualOwnershipBaseline\(\)/);
  assert.match(debugApi, /get visualOwnershipTrace\(\)/);
  assert.doesNotMatch(preContact, /parryGate\.confirm\(|combat\.resolveContact\(|probeSweptSwordBucklerContact\(/);
  // R20Z.1: the entry's size budget has one owner, shield-parry-r281-thin-entry-audit.test.js.
  // A copy here meant one added line failed three unrelated suites and told you nothing extra.
});
