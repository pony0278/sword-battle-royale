// R18M.C4 — Step 1 direct OLD B3 diagnostic-only orchestration.
// Synthetic contact here exists only to exercise the historical OLD B3 handoff.
// Production Parry success remains owned by real swept Sword × Shield contact outside this module.

import { LEGACY_TWO_ACTOR_RECOIL_HANDOFF_MODE } from '../../../src/combat/post-coupling-recoil-stagger-handoff.js';
import { authoredIncomingVelocity } from '../../../src/game/authored-incoming-velocity.js';


export function diagnosticCouplingReport(direction) {
  const lateral = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
  return Object.freeze({
    outcome: 'parry',
    elapsedMs: 96,
    complete: true,
    releaseAttackerRecoil: true,
    recoilHandoffMode: LEGACY_TWO_ACTOR_RECOIL_HANDOFF_MODE,
    shieldOffset: Object.freeze({ x: lateral * 0.105, y: direction === 'top' ? 0.105 : 0.028, z: 0.012 }),
    attackerWeaponOffset: Object.freeze({ x: lateral * 0.092, y: direction === 'top' ? 0.092 : 0.025, z: 0.011 }),
    profile: Object.freeze({ durationMs: 96, recoilHandoffMode: LEGACY_TWO_ACTOR_RECOIL_HANDOFF_MODE }),
    authority: 'step1-direct-old-b3-diagnostic-no-coupling-runtime',
  });
}

export function createDirectOldB3DiagnosticController({
  THREE,
  exchangeState,
  attacker,
  attackerSword,
  attackRuntime,
  combat,
  guardRuntime,
  camera,
  buckler,
  timingAgeMs,
  services,
  readContext,
  callbacks,
}) {
  const { captureRigPose, publishPostCouplingRecoilStaggerHandoff } = services;
  const {
    disableAutoRepeat,
    clearAttackerRecovery,
    enterGuard,
    setSelectedDirection,
    resetExchange,
    sampleAttackerBase,
    captureCanonicalOldB3Base,
    publishStatus,
    buildReport,
  } = callbacks;

  function run(direction) {
    const context = readContext();
    if (!context.ready) return Object.freeze({ accepted: false, reason: 'lab-not-ready' });

    disableAutoRepeat();
    combat.reset();
    clearAttackerRecovery();
    enterGuard();
    setSelectedDirection(direction);
    resetExchange();

    const started = combat.startAttack(direction);
    if (!started.accepted) {
      return Object.freeze({ accepted: false, reason: started.reason || 'diagnostic-attack-start-rejected' });
    }
    const attackProfile = attackRuntime.snapshot.action?.runtime;
    attackRuntime.update((attackProfile?.activeStartSeconds || 0) * 1000 + 1);
    const activeSnapshot = attackRuntime.snapshot;
    sampleAttackerBase(activeSnapshot, 0);
    attackerSword.update();

    const contactPoint = new THREE.Vector3();
    attackerSword.bladeMid.getWorldPosition(contactPoint);
    exchangeState.latestContact = Object.freeze({
      contact: true,
      geometricContact: true,
      eligible: true,
      point: Object.freeze({ x: contactPoint.x, y: contactPoint.y, z: contactPoint.z }),
      incomingVelocity: authoredIncomingVelocity(direction),
      radialDistance: 0.08,
      bladeFraction: 0.5,
      sweepAlpha: 0.5,
      authority: 'step1-synthetic-authoritative-contact-for-old-b3-only',
    });
    exchangeState.firstContact = exchangeState.latestContact;
    exchangeState.frozenAttackerContactPose = captureRigPose(attacker.rig);
    exchangeState.latestCombatResult = combat.resolveContact({
      contact: exchangeState.latestContact,
      guardIntentAgeMs: timingAgeMs,
    });
    if (!exchangeState.latestCombatResult.accepted) {
      exchangeState.frozenAttackerContactPose = null;
      exchangeState.directOldB3Diagnostic = Object.freeze({
        accepted: false,
        reason: exchangeState.latestCombatResult.reason || 'diagnostic-contact-rejected',
      });
      return exchangeState.directOldB3Diagnostic;
    }

    captureCanonicalOldB3Base(attackRuntime.snapshot.interruption);
    guardRuntime.sync(camera);

    const handoffPublished = publishPostCouplingRecoilStaggerHandoff(attacker.rig, {
      couplingReport: diagnosticCouplingReport(direction),
      surfaceAtContact: buckler.getWorldParrySurface(),
    });
    exchangeState.latestCombatUpdate = combat.update(0.021, { camera });
    const handoff = combat.snapshot.attackerRecoil?.postCouplingHandoff || null;
    exchangeState.directOldB3Diagnostic = Object.freeze({
      accepted: handoffPublished && handoff?.accepted === true,
      direction,
      parryTimingBypassed: true,
      predictiveShieldLeadBypassed: true,
      shieldContactBypassed: true,
      couplingRuntimeBypassed: true,
      releaseBridgeBypassed: true,
      handoffPublished,
      handoffStage: handoff?.stage || null,
      handoffAccepted: handoff?.accepted === true,
      reactionDefinitionId: exchangeState.latestCombatResult.attackerReaction?.id || null,
      reactionPlanBackwardPitchDegrees:
        exchangeState.latestCombatResult.attackerReaction?.silhouette?.backwardPitchDegrees ?? null,
      reactionInitialElapsedMs: exchangeState.latestCombatResult.attackerReaction?.initialElapsedMs ?? null,
      authority: 'direct-existing-old-two-actor-b3-diagnostic',
    });
    publishStatus({
      text: exchangeState.directOldB3Diagnostic.accepted
        ? 'STEP 1 ACTIVE · OLD Two-Actor B3 direct · all Parry/collision stages bypassed'
        : `STEP 1 FAIL · ${handoff?.reason || 'legacy handoff was not accepted'}`,
      className: exchangeState.directOldB3Diagnostic.accepted ? 'good' : 'bad',
    });
    attacker.update(0, camera);
    attackerSword.update();
    buildReport();
    return exchangeState.directOldB3Diagnostic;
  }

  return Object.freeze({ run });
}
