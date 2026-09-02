import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createShieldParryPreContactController } from '../src/game/pre-contact-controller.js';

const entry = await readFile(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
const controller = await readFile(new URL('../src/game/pre-contact-controller.js', import.meta.url), 'utf8');
const lifecycleDirector = await readFile(new URL('../src/combat/contact-lifecycle-director.js', import.meta.url), 'utf8');
const parryInterceptDirectorSource = await readFile(new URL('../src/combat/parry-intercept-director.js', import.meta.url), 'utf8');
const contactHandoffController = await readFile(new URL('../src/game/contact-handoff-controller.js', import.meta.url), 'utf8');
const engagementSource = await readFile(new URL('../src/game/engagement.js', import.meta.url), 'utf8');

test('R18M.5 entry delegates pre-contact orchestration to one controller', () => {
  assert.equal(typeof createShieldParryPreContactController, 'function');
  // R23F.1: built in the engagement, driven from the entry's frame - one controller either way.
  assert.match(engagementSource, /from '\.\/pre-contact-controller\.js'/);
  assert.match(engagementSource, /createShieldParryPreContactController\(\{/);
  assert.match(entry, /preContactController\.update\(snapshot, currentBlade, deltaSeconds\);/);
  assert.match(contactHandoffController, /preContactController\.recordWhiffProbe\(attackSnapshot, evaluation\)/);
  assert.doesNotMatch(entry, /function updateBlockPreContact\(/);
  assert.doesNotMatch(entry, /function updateParryPreContact\(/);
  assert.doesNotMatch(entry, /function recordWhiffProbe\(/);
});

test('R18M.5 controller owns the Block bracing and hands coverage to its director', () => {
  // R18S.2: the brace is still the controller's - it is authored against the lab's own surface
  // read. Which coverage pass runs when is the director's, and the controller only publishes
  // what came back.
  assert.match(controller, /function updateBlockPreContact\(/);
  assert.match(controller, /planArticulatedImpactBracing\(\{/);
  assert.match(controller, /bracingRuntime\.update\(bracePlan, deltaSeconds\)/);
  assert.match(controller, /createGuardCoverageDirector\(\{/);
  assert.match(controller, /readShieldSurface: \(\) => buckler\.getWorldParrySurface\(\)/);
  assert.match(controller, /guardCoverageDirector\.update\(\{/);
  assert.match(controller, /exchangeState\.latestFineTracking = coverage\.tracking/);
  assert.match(controller, /exchangeState\.previousShieldLeadSurface = cloneSurface\(buckler\.getWorldParrySurface\(\)\)/);
});

test('R18M.5 controller owns the Parry analysis and gate, and its director owns the reach', () => {
  // R18S.3: what the lab decides - is there an opportunity, was it taken, what does the shield
  // look like on the way out - stays here. Where the shield reaches for the blade does not.
  for (const contract of [
    /analyzePredictiveInterceptParry\(\{/,
    /evaluateCommittedParryInput\(\{/,
    /parryInterceptDirector\.reach\(\{/,
    /parryInterceptDirector\.finalClosure\(\{/,
    /parryInterceptDirector\.measureOutcome\(\{/,
    /sampleActiveShieldLeadMotion\(\{/,
    /compactInterceptDriveTraceFrame\(exchangeState\.latestInterceptDriveReport\)/,
  ]) assert.match(controller, contract);
  for (const moved of [
    /selectReachableParryInterceptTarget\(\{/,
    /planGuardThreatCorrection\(\{/,
    /trackingRuntime\.refineMeasuredContact\(/,
    /bodyReachRuntime\.update\(\{/,
    /stanceRuntime\.update\(\{/,
  ]) assert.match(parryInterceptDirectorSource, moved);
});

test('R18M.5 whiff probing remains diagnostic and real swept contact stays authoritative outside pre-contact', () => {
  assert.match(controller, /function recordWhiffProbe\(snapshot, probe\)/);
  assert.match(controller, /compactInterceptDriveTelemetry\(exchangeState\.latestInterceptDriveReport\)/);
  assert.doesNotMatch(controller, /probeSweptSwordBucklerContact\(/);
  assert.doesNotMatch(controller, /parryGate\.confirm\(/);
  assert.doesNotMatch(controller, /combat\.resolveContact\(/);
  assert.doesNotMatch(controller, /swordGripConstraint\./);
  assert.doesNotMatch(controller, /buildLiveParryOldB3Handoff\(/);

  // R18S.4: the sequence lives in the lifecycle director; the whiff record is a hook it fires
  // after eligibility and before the confirmation can consume the gate's armed state.
  const probeIndex = lifecycleDirector.indexOf('const geometricContact = probeSweptSwordBucklerContact({');
  const temporalEligibilityIndex = lifecycleDirector.indexOf('let contactEvaluation = evaluateSweptContactTemporalEligibility({', probeIndex);
  const whiffIndex = lifecycleDirector.indexOf('observe.contactEvaluated?.(contactEvaluation, attackSnapshot);', temporalEligibilityIndex);
  const rejectIndex = lifecycleDirector.indexOf('if (!contactEvaluation.contact) {', whiffIndex);
  const confirmIndex = lifecycleDirector.indexOf('confirmParry({ attackSnapshot, contact: contactEvaluation })', rejectIndex);
  const resolveIndex = lifecycleDirector.indexOf('combatResult = resolveCombat({', confirmIndex);
  assert.ok(
    probeIndex >= 0
      && temporalEligibilityIndex > probeIndex
      && whiffIndex > temporalEligibilityIndex
      && rejectIndex > whiffIndex
      && confirmIndex > rejectIndex
      && resolveIndex > confirmIndex,
  );
  assert.match(contactHandoffController, /preContactController\.recordWhiffProbe\(attackSnapshot, evaluation\)/);
});

test('R18M.5 manual timing gate and post-contact handoff authority remain outside the controller', () => {
  assert.match(entry, /exchangeState\.latestParryInput = parryGate\.arm\(\{/);
  assert.match(lifecycleDirector, /gripConstraint\.start\(\{/);
  assert.match(lifecycleDirector, /buildLiveParryOldB3Handoff\(\{/);
  assert.match(lifecycleDirector, /continuityBridgeMs: handoff\.releaseBlendMs/);
  assert.doesNotMatch(controller, /parryGate\.arm\(/);
  assert.doesNotMatch(controller, /DEFLECT_IMPULSE|old-b3-handoff|continuityBridgeMs/);
});
