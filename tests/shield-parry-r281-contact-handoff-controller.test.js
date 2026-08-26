import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createShieldParryContactHandoffController } from '../tools/action-studio/shield-parry-r281/contact-handoff-controller.js';

const entry = await readFile(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
const controller = await readFile(new URL('../tools/action-studio/shield-parry-r281/contact-handoff-controller.js', import.meta.url), 'utf8');

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
  assert.match(entry, /shield-parry-r281\/contact-handoff-controller\.js/);
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
  indexOrder(controller, [
    'const geometricContact = probeSweptSwordBucklerContact({',
    'exchangeState.latestContact = evaluateSweptContactTemporalEligibility({',
    'if (!exchangeState.latestContact.contact) return;',
    'parryGate.confirm({ attackSnapshot: snapshot, contact: exchangeState.latestContact })',
    'exchangeState.latestCombatResult = combat.resolveContact({',
    'exchangeState.latestGripConstraintReport = swordGripConstraint.start({',
  ]);
  assert.match(controller, /active: true/);
  assert.match(controller, /fallbackEligible: snapshot\.phase === LONGSWORD_ATTACK_PHASES\.ACTIVE/);
  assert.match(controller, /realSweptContact: true/);
});

test('R18M.6 live Sword→Grip ownership holds attacker contact before defender release', () => {
  assert.match(controller, /attackerRecoilChannels: TWO_ACTOR_PARRY_REACTION_CHANNELS\.LIVE_CONTACT_BODY/);
  assert.match(controller, /attackerRecoilPhaseLatch: TWO_ACTOR_PARRY_REACTION_PHASE_LATCHES\.LIVE_CONTACT_IMPULSE_PEAK/);
  assert.match(controller, /holdAttackerInterruption: true/);
  assert.match(controller, /swordGripConstraint\.update\(deltaSeconds/);
  assert.match(controller, /contactConstraintOwnsUntilDeflectImpulse: true/);
  assert.match(controller, /weaponArmContactConstrained: true/);
});

test('R18M.6 DEFLECT_IMPULSE latch gates release and confirmed Parry fail-safe stays intact', () => {
  assert.match(controller, /sourceTimeSeconds \+ 1e-4 >= PARRY_ATTACKER_RELEASE_SOURCE_SECONDS/);
  assert.match(controller, /marker: 'deflect-impulse'/);
  assert.match(controller, /latched-defender-deflect-marker-gates-attacker-release/);
  assert.match(controller, /reason: 'defender-deflect-marker-not-reached'/);
  assert.match(controller, /allowConfirmedParryFallback: true/);
  assert.match(controller, /confirmedParry: exchangeState\.latestParryConfirmation\?\.accepted === true/);
});

test('R18M.6 release preserves 28ms bridge and canonical OLD B3 continuation from zero', () => {
  assert.match(controller, /durationMs: handoff\.releaseBlendMs/);
  assert.match(controller, /continuityBridgeMs: handoff\.releaseBlendMs/);
  assert.match(controller, /targetPose: contactBasePose/);
  assert.match(controller, /handoffConsumedByOldB3: true/);
  assert.match(controller, /bodyRestartedAtRelease: false/);
  assert.match(controller, /continuationPlanIdentityPreserved: appliedHandoff\?\.planIdentityPreserved === true/);
  assert.match(controller, /continuationElapsedPreserved: appliedHandoff\?\.presentationElapsedPreserved === true/);
  assert.match(controller, /deflect-impulse-continuity-bridge-weapon-arm-joins-running-old-b3/);
});

test('R18P.4 arm-chain policy is direction-uniform and release stays delegated to handoff authority', () => {
  assert.doesNotMatch(controller, /selectedDirection === 'top' \|\| selectedDirection === 'right'/);
  assert.match(controller, /buildLiveParryOldB3Handoff\(\{/);
  assert.match(controller, /attackDirection: selectedDirection/);
  assert.doesNotMatch(controller, /selectedDirection === 'left'.*releasedToOldB3/s);
  assert.doesNotMatch(controller, /attackDirection: 'left'/);
});

test('R18M.6 contact controller excludes manual input and predictive pre-contact authority', () => {
  assert.doesNotMatch(controller, /parryGate\.arm\(/);
  assert.doesNotMatch(controller, /analyzePredictiveInterceptParry\(/);
  assert.doesNotMatch(controller, /selectReachableParryInterceptTarget\(/);
  assert.doesNotMatch(controller, /residualStanceReachRuntime\.update\(/);
});
