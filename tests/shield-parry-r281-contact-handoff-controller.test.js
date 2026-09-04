import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createShieldParryContactHandoffController } from '../src/game/contact-handoff-controller.js';

const entry = await readFile(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
const controller = await readFile(new URL('../src/game/contact-handoff-controller.js', import.meta.url), 'utf8');
// R18S.4: the lifecycle state machine lives in src; the controller is its lab shell.
const director = await readFile(new URL('../src/combat/contact-lifecycle-director.js', import.meta.url), 'utf8');
const engagementSource = await readFile(new URL('../src/game/engagement.js', import.meta.url), 'utf8');

function indexOrder(source, markers) {
  let cursor = -1;
  for (const marker of markers) {
    const next = source.indexOf(marker, cursor + 1);
    assert.ok(next > cursor, `expected ${marker} after previous authority marker`);
    cursor = next;
  }
}

test('R18M.6 entry delegates contact/release ownership while preserving frame order', () => {
  assert.equal(typeof createShieldParryContactHandoffController, 'function');
  // R23F.1: constructed in the engagement now; the frame order below is still the entry's.
  assert.match(engagementSource, /createShieldParryContactHandoffController\(\{/);
  assert.match(entry, /contactHandoffController\.updateCombatBeforeGuard\(/);
  assert.match(entry, /guardRuntime\.update\(deltaMs, camera\);/);
  assert.match(entry, /contactHandoffController\.updateDefenderDeflectReleaseGate\(\);/);
  assert.match(entry, /contactHandoffController\.updateLiveConstraintAfterGuard\(/);
  indexOrder(entry, [
    'contactHandoffController.updateCombatBeforeGuard({',
    'guardRuntime.update(deltaMs, camera);',
    'contactHandoffController.updateDefenderDeflectReleaseGate();',
    'contactHandoffController.updateLiveConstraintAfterGuard({',
  ]);
});

test('R18M.6 real swept Sword × Shield contact remains the only Parry success authority', () => {
  indexOrder(director, [
    'const geometricContact = probeSweptSwordBucklerContact({',
    'let contactEvaluation = evaluateSweptContactTemporalEligibility({',
    'if (!contactEvaluation.contact) {',
    'confirmParry({ attackSnapshot, contact: contactEvaluation })',
    'combatResult = resolveCombat({',
    'gripReport = gripConstraint.start({',
  ]);
  assert.match(director, /active: true/);
  assert.match(director, /fallbackEligible: attackSnapshot\.phase === ATTACK_PHASES\.ACTIVE/);
  assert.match(director, /realSweptContact: true/);
});

test('R18M.6 live Sword→Grip ownership holds attacker contact before defender release', () => {
  assert.match(director, /attackerRecoilChannels: TWO_ACTOR_PARRY_REACTION_CHANNELS\.LIVE_CONTACT_BODY/);
  assert.match(director, /attackerRecoilPhaseLatch: TWO_ACTOR_PARRY_REACTION_PHASE_LATCHES\.LIVE_CONTACT_IMPULSE_PEAK/);
  assert.match(director, /holdAttackerInterruption: true/);
  assert.match(director, /gripConstraint\.update\(deltaSeconds/);
  assert.match(director, /contactConstraintOwnsUntilDeflectImpulse: true/);
  assert.match(director, /weaponArmContactConstrained: true/);
});

test('R18M.6 DEFLECT_IMPULSE latch gates release and confirmed Parry fail-safe stays intact', () => {
  assert.match(director, /sourceTimeSeconds \+ 1e-4 >= PARRY_ATTACKER_RELEASE_SOURCE_SECONDS/);
  assert.match(director, /marker: 'deflect-impulse'/);
  assert.match(director, /latched-defender-deflect-marker-gates-attacker-release/);
  assert.match(director, /reason: 'defender-deflect-marker-not-reached'/);
  assert.match(director, /allowConfirmedParryFallback: true/);
  assert.match(director, /confirmedParry: confirmation\?\.accepted === true/);
});

test('R18M.6 release preserves 28ms bridge and canonical OLD B3 continuation from zero', () => {
  assert.match(director, /durationMs: handoff\.releaseBlendMs/);
  assert.match(director, /continuityBridgeMs: handoff\.releaseBlendMs/);
  assert.match(director, /targetPose: contactBasePose/);
  assert.match(director, /handoffConsumedByOldB3: true/);
  assert.match(director, /bodyRestartedAtRelease: false/);
  assert.match(director, /continuationPlanIdentityPreserved: appliedHandoff\?\.planIdentityPreserved === true/);
  assert.match(director, /continuationElapsedPreserved: appliedHandoff\?\.presentationElapsedPreserved === true/);
  assert.match(director, /deflect-impulse-continuity-bridge-weapon-arm-joins-running-old-b3/);
});

test('R18P.4 arm-chain policy is direction-uniform and release stays delegated to handoff authority', () => {
  for (const source of [controller, director]) {
    assert.doesNotMatch(source, /selectedDirection === 'top' \|\| selectedDirection === 'right'/);
    assert.doesNotMatch(source, /selectedDirection === 'left'.*releasedToOldB3/s);
    assert.doesNotMatch(source, /attackDirection: 'left'/);
  }
  assert.match(director, /buildLiveParryOldB3Handoff\(\{/);
  assert.match(director, /attackDirection: selectedDirection/);
});

test('R18M.6 contact controller excludes manual input and predictive pre-contact authority', () => {
  assert.doesNotMatch(controller, /parryGate\.arm\(/);
  assert.doesNotMatch(controller, /analyzePredictiveInterceptParry\(/);
  assert.doesNotMatch(controller, /selectReachableParryInterceptTarget\(/);
  assert.doesNotMatch(controller, /residualStanceReachRuntime\.update\(/);
});
