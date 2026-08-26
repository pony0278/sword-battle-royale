import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createShieldParryPreContactController } from '../tools/action-studio/shield-parry-r281/pre-contact-controller.js';

const entry = await readFile(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
const controller = await readFile(new URL('../tools/action-studio/shield-parry-r281/pre-contact-controller.js', import.meta.url), 'utf8');
const contactHandoffController = await readFile(new URL('../tools/action-studio/shield-parry-r281/contact-handoff-controller.js', import.meta.url), 'utf8');

test('R18M.5 entry delegates pre-contact orchestration to one controller', () => {
  assert.equal(typeof createShieldParryPreContactController, 'function');
  assert.match(entry, /shield-parry-r281\/pre-contact-controller\.js/);
  assert.match(entry, /const preContactController = createShieldParryPreContactController\(\{/);
  assert.match(entry, /preContactController\.update\(snapshot, currentBlade, deltaSeconds\);/);
  assert.match(contactHandoffController, /preContactController\.recordWhiffProbe\(snapshot, exchangeState\.latestContact\);/);
  assert.doesNotMatch(entry, /function updateBlockPreContact\(/);
  assert.doesNotMatch(entry, /function updateParryPreContact\(/);
  assert.doesNotMatch(entry, /function recordWhiffProbe\(/);
});

test('R18M.5 controller owns the existing Block bracing and fine-tracking path', () => {
  assert.match(controller, /function updateBlockPreContact\(/);
  assert.match(controller, /planArticulatedImpactBracing\(\{/);
  assert.match(controller, /bracingRuntime\.update\(bracePlan, deltaSeconds\)/);
  assert.match(controller, /planFineGuardTracking\(\{/);
  assert.match(controller, /fineTrackingRuntime\.update\(exchangeState\.latestFinePlan, deltaSeconds\)/);
  assert.match(controller, /exchangeState\.previousShieldLeadSurface = cloneSurface\(buckler\.getWorldParrySurface\(\)\)/);
});

test('R18M.5 controller owns predictive/measured Parry intercept and residual reach', () => {
  for (const contract of [
    /analyzePredictiveInterceptParry\(\{/,
    /evaluateCommittedParryInput\(\{/,
    /selectReachableParryInterceptTarget\(\{/,
    /planGuardThreatCorrection\(\{/,
    /fineTrackingRuntime\.refineMeasuredContact\(/,
    /residualBodyReachRuntime\.update\(\{/,
    /residualStanceReachRuntime\.update\(\{/,
    /sampleActiveShieldLeadMotion\(\{/,
    /compactInterceptDriveTraceFrame\(exchangeState\.latestInterceptDriveReport\)/,
  ]) assert.match(controller, contract);
});

test('R18M.5 whiff probing remains diagnostic and real swept contact stays authoritative outside pre-contact', () => {
  assert.match(controller, /function recordWhiffProbe\(snapshot, probe\)/);
  assert.match(controller, /compactInterceptDriveTelemetry\(exchangeState\.latestInterceptDriveReport\)/);
  assert.doesNotMatch(controller, /probeSweptSwordBucklerContact\(/);
  assert.doesNotMatch(controller, /parryGate\.confirm\(/);
  assert.doesNotMatch(controller, /combat\.resolveContact\(/);
  assert.doesNotMatch(controller, /swordGripConstraint\./);
  assert.doesNotMatch(controller, /buildLiveParryOldB3Handoff\(/);

  const probeIndex = contactHandoffController.indexOf('const geometricContact = probeSweptSwordBucklerContact({');
  const temporalEligibilityIndex = contactHandoffController.indexOf('exchangeState.latestContact = evaluateSweptContactTemporalEligibility({', probeIndex);
  const whiffIndex = contactHandoffController.indexOf('preContactController.recordWhiffProbe(snapshot, exchangeState.latestContact);', temporalEligibilityIndex);
  const rejectIndex = contactHandoffController.indexOf('if (!exchangeState.latestContact.contact) return;', whiffIndex);
  const confirmIndex = contactHandoffController.indexOf('parryGate.confirm({ attackSnapshot: snapshot, contact: exchangeState.latestContact })', rejectIndex);
  const resolveIndex = contactHandoffController.indexOf('exchangeState.latestCombatResult = combat.resolveContact({', confirmIndex);
  assert.ok(
    probeIndex >= 0
      && temporalEligibilityIndex > probeIndex
      && whiffIndex > temporalEligibilityIndex
      && rejectIndex > whiffIndex
      && confirmIndex > rejectIndex
      && resolveIndex > confirmIndex,
  );
});

test('R18M.5 manual timing gate and post-contact handoff authority remain outside the controller', () => {
  assert.match(entry, /exchangeState\.latestParryInput = parryGate\.arm\(\{/);
  assert.match(contactHandoffController, /swordGripConstraint\.start\(\{/);
  assert.match(contactHandoffController, /buildLiveParryOldB3Handoff\(\{/);
  assert.match(contactHandoffController, /continuityBridgeMs: handoff\.releaseBlendMs/);
  assert.doesNotMatch(controller, /parryGate\.arm\(/);
  assert.doesNotMatch(controller, /DEFLECT_IMPULSE|old-b3-handoff|continuityBridgeMs/);
});
