import { createContactReactionDirector } from '../combat/contact-reaction-director.js';
import { createContactLifecycleDirector } from '../combat/contact-lifecycle-director.js';
import { buildBodyHurtbox } from '../combat/body-hurtbox.js';
import { authoredIncomingVelocity } from './authored-incoming-velocity.js';

export function createShieldParryContactHandoffController({
  exchangeState,
  buckler,
  attacker,
  defender,
  attackerSword,
  camera,
  combat,
  swordGripConstraint,
  guardRuntime,
  predictivePresentation,
  parryGate,
  preContactController,
  fineTrackingRuntime,
  residualBodyReachRuntime,
  residualStanceReachRuntime,
  services,
  callbacks,
}) {
  const {
    measureAttackerRecoilWorldSilhouette,
  } = services;
  const {
    captureCanonicalAttackerOldB3Base,
    captureAttackerWorldSilhouette,
    updateLiveContactMarkers,
    publishStatus,
    formatInspectionFailureSummary,
  } = callbacks;

  // THREE is the lab page's classic-script global; the reaction runtimes write bone quaternions
  // and need its quaternion math. The whole contact lifecycle - detection, resolution, the
  // outcome branch, the gates, the release, the join - lives in the lifecycle director. This
  // controller feeds it the lab's collaborators and publishes what came back: exchange state,
  // presentation refreshes, markers, and every word of status text.
  const reactionDirector = createContactReactionDirector(globalThis.THREE, {
    attackerRig: attacker?.rig,
    defenderRig: defender?.rig,
  });
  const lifecycleDirector = createContactLifecycleDirector({
    attackerRig: attacker?.rig,
    reactionDirector,
    gripConstraint: swordGripConstraint,
    confirmParry: (input) => parryGate.confirm(input),
    readParryArmed: () => parryGate.armed === true, // R20H.1: a Sekiro raise arms from block mode
    resolveCombat: (input) => combat.resolveContact(input),
    updateCombat: (deltaSeconds, options = {}) => combat.update(deltaSeconds, { camera, ...options }),
    readCombatSnapshot: () => combat.snapshot,
    readShieldSurface: () => buckler.getWorldParrySurface(),
    readGuardReport: () => guardRuntime.report,
    takePredictiveHandoff: () => (predictivePresentation.active ? predictivePresentation.handoff() : null),
    readCanonicalContactPose: () => exchangeState.canonicalAttackerOldB3Pose,
    // Built from the defender's own bones every frame, so a crouched, leaning or displaced
    // fighter is hit where they actually are.
    readDefenderHurtbox: () => buildBodyHurtbox({
      readBonePosition: (boneId) => {
        const bone = defender?.rig?.bones?.[boneId];
        const THREE_ = globalThis.THREE;
        if (!bone?.getWorldPosition || !THREE_?.Vector3) return null;
        const world = bone.getWorldPosition(new THREE_.Vector3());
        return { x: world.x, y: world.y, z: world.z };
      },
      facing: attackerFacingFromDefender(),
    }),
    // R19P.1: the hilt the clang probe sweeps is the attacker's wrist, read live like the
    // hurtbox above so a lunging attacker's hilt is where the animation actually put it.
    readAttackerHiltPoint: () => {
      const bone = attacker?.rig?.bones?.['wrist.r'];
      const THREE_ = globalThis.THREE;
      if (!bone?.getWorldPosition || !THREE_?.Vector3) return null;
      const world = bone.getWorldPosition(new THREE_.Vector3());
      return { x: world.x, y: world.y, z: world.z };
    },
    readCloseRangePosture: () => exchangeState.latestCloseRangePosture,
    // R20F.1: the dodge window, read live from the lane's own state rather than the blackboard
    // copy - the veto must see this frame's window, not last frame's diagnostic.
    readDodgeIFramesActive: () => callbacks.readDodgeReport?.()?.iFramesActive === true,
    readGuardActive: callbacks.readGuardActive, // R20G.1: absent = the legacy always-guarding world
    readAimedSector: callbacks.readAimedSector, // R23T.1: absent = the omnidirectional shield
    guardCoverage: callbacks.guardCoverage, // R23Z.1: and present, whose shield it is
    // R19Y.1: the two points the depth order compares - both read live, like the hurtbox, so a
    // displaced or turned fighter is judged where they actually stand.
    readAttackerRootPoint: () => {
      const bone = attacker?.rig?.bones?.hips;
      const THREE_ = globalThis.THREE;
      if (!bone?.getWorldPosition || !THREE_?.Vector3) return null;
      const world = bone.getWorldPosition(new THREE_.Vector3());
      return { x: world.x, y: world.y, z: world.z };
    },
    readDefenderBodyPoint: () => {
      const bone = defender?.rig?.bones?.chest || defender?.rig?.bones?.hips;
      const THREE_ = globalThis.THREE;
      if (!bone?.getWorldPosition || !THREE_?.Vector3) return null;
      const world = bone.getWorldPosition(new THREE_.Vector3());
      return { x: world.x, y: world.y, z: world.z };
    },
    fallbackIncomingVelocity: (direction) => authoredIncomingVelocity(direction),
    releaseReachOwnership: () => {
      fineTrackingRuntime.reset();
      residualBodyReachRuntime.reset();
      residualStanceReachRuntime.reset();
    },
    observe: {
      // R19P.1 diagnostic: every clang probe is recorded, hit or miss, because a clang that
      // silently never fires is indistinguishable from one that was never attempted.
      hiltClangProbed: (report, attackSnapshot) => {
        exchangeState.latestHiltClang = report
          ? Object.freeze({ ...report, probeElapsedSeconds: attackSnapshot?.elapsedSeconds ?? null })
          : report;
      },
      contactEvaluated: (evaluation, attackSnapshot) => {
        exchangeState.latestContact = evaluation;
        // Recorded here, before the confirmation can consume the gate's armed state.
        preContactController.recordWhiffProbe(attackSnapshot, evaluation);
      },
      // The canonical OLD B3 base and the defender sync are the lab's own captures, taken the
      // instant the impact is resolved and before any outcome writes a bone.
      impactResolved: () => {
        captureCanonicalAttackerOldB3Base();
        guardRuntime.sync(camera);
      },
      attackerPresentationRefreshed: () => attackerSword.update(),
    },
  });

  // The horizontal direction from the defender toward the attacker: the bands face the threat.
  function attackerFacingFromDefender() {
    const THREE_ = globalThis.THREE;
    const attackerHips = attacker?.rig?.bones?.hips;
    const defenderHips = defender?.rig?.bones?.hips;
    if (!THREE_?.Vector3 || !attackerHips?.getWorldPosition || !defenderHips?.getWorldPosition) return null;
    const a = attackerHips.getWorldPosition(new THREE_.Vector3());
    const d = defenderHips.getWorldPosition(new THREE_.Vector3());
    return { x: a.x - d.x, y: 0, z: a.z - d.z };
  }

  function publishArmedReaction(reports) {
    exchangeState.latestArmFling = reports.armFling;
    exchangeState.latestTorsoLean = reports.torsoLean;
    exchangeState.latestRootDisplacement = reports.rootDisplacement;
  }

  function ownsLiveContact() {
    return lifecycleDirector.ownsLiveContact();
  }

  function defenderDeflectReleaseGate() {
    return lifecycleDirector.defenderReleaseGate();
  }

  function updateDefenderDeflectReleaseGate() {
    const { reaction, gate } = lifecycleDirector.advanceDefender();
    if (reaction.torsoLeanReport) {
      exchangeState.latestDefenderTorsoLeanReport = reaction.torsoLeanReport;
    }
    exchangeState.latestDefenderRootDisplacement = reaction.rootDisplacementReport;
    if (reaction.repaintRequired) defender?.update?.(0, camera);
    if (gate.latched) exchangeState.latchedDefenderDeflectReleaseGate = gate;
    return gate;
  }

  function publishReleaseAccepted(release) {
    exchangeState.step3AContactTransfer = lifecycleDirector.transfer;
    exchangeState.step3AReleaseBlend = lifecycleDirector.releaseBlend;
    exchangeState.latchedDefenderDeflectReleaseGate = lifecycleDirector.latchedDefenderGate;
    publishArmedReaction(release.armedReports);
  }

  function releaseLiveContactToOldB3({ selectedDirection }) {
    const release = lifecycleDirector.releaseToOldB3({
      selectedDirection,
      gripReport: exchangeState.latestGripConstraintReport,
    });
    if (release?.accepted) publishReleaseAccepted(release);
    return release;
  }

  function recordVisibleOldB3Sample(combatUpdate) {
    if (lifecycleDirector.transfer?.releasedToOldB3 !== true) return;
    const recoilUpdate = combatUpdate?.recoilUpdate || null;
    const sample = recoilUpdate?.sample
      || recoilUpdate?.snapshot?.sample
      || combatUpdate?.attackerRecoil?.sample
      || null;
    if (!sample?.pose || sample.phase === 'contact-hold') return;
    const requestedLocalChainPitchDegrees = (Number(sample.pose.chestPitchDegrees) || 0)
      + (Number(sample.pose.spinePitchDegrees) || 0)
      + (Number(sample.pose.hipsPitchDegrees) || 0);
    const measurement = measureAttackerRecoilWorldSilhouette({
      baseline: exchangeState.canonicalAttackerOldB3WorldSilhouette,
      current: captureAttackerWorldSilhouette(),
      backwardDirection: exchangeState.latestCombatResult?.attackerReaction?.plan?.body?.direction,
      requestedLocalChainPitchDegrees,
    });
    if (!measurement.accepted) return;
    const readabilityScore = measurement.worldBackwardLeanDegrees
      + Math.max(0, measurement.headBackwardMeters) * 100
      + Math.max(0, measurement.shouldersBackwardMeters) * 100;
    if (
      exchangeState.visibleOldB3Peak
      && exchangeState.visibleOldB3Peak.readabilityScore >= readabilityScore
    ) return;
    const phaseClock = recoilUpdate?.phaseClock || recoilUpdate?.snapshot?.phaseClock || null;
    exchangeState.visibleOldB3Peak = Object.freeze({
      ...measurement,
      phase: sample.phase,
      presentationElapsedMs: phaseClock?.elapsedMs ?? null,
      readabilityScore,
      armWeight: sample.weights?.armWeight ?? null,
      torsoWeight: sample.weights?.torsoWeight ?? null,
      legWeight: sample.weights?.legWeight ?? null,
    });
  }

  function resolveContact(snapshot, currentBlade, deltaSeconds, context = {}) {
    const { previousBlade, selectedMode, selectedDirection } = context;
    const result = lifecycleDirector.resolveContact({
      previousBlade,
      currentBlade,
      deltaSeconds,
      attackSnapshot: snapshot,
      selectedMode,
      selectedDirection,
      shieldLeadMotion: exchangeState.latestShieldLeadMotion,
    });
    if (!result) return;
    if (!result.contacted) {
      exchangeState.latestBodyHit = lifecycleDirector.bodyHit;
      if (result.event?.type !== 'body-struck') return;
      // R19K.1: the one signal that means a blade genuinely landed. Fired here rather than off
      // exchangeState.latestBodyHit, which also holds near-misses and would flinch on blocks.
      callbacks.onBodyStruck?.(result.bodyContact);
      publishStatus({
        text: `HIT · ${selectedDirection.toUpperCase()} reached the ${result.event.band} · the guard was not there`,
        className: 'bad',
      });
      return;
    }

    exchangeState.firstContact = result.contactEvaluation;
    exchangeState.latestLiveSurfaceAtContact = result.surfaceAtContact;
    exchangeState.latestPredictiveHandoff = result.predictiveHandoff;
    exchangeState.latestParryConfirmation = result.confirmation;
    exchangeState.frozenAttackerContactPose = result.frozenContactPose;
    exchangeState.latestCombatResult = result.combatResult;
    if (result.event?.type === 'contact-rejected') return;
    if (result.combatUpdate) exchangeState.latestCombatUpdate = result.combatUpdate;
    if (result.gripReport) exchangeState.latestGripConstraintReport = result.gripReport;

    switch (result.event?.type) {
      case 'parry-live-started':
      case 'parry-live-rejected': {
        exchangeState.latestLeadHandoff = lifecycleDirector.leadHandoff;
        exchangeState.step3AContactTransfer = lifecycleDirector.transfer;
        publishStatus({
          text: result.event.type === 'parry-live-started'
            ? 'STEP 3B ACTIVE · OLD B3 body runs from impact · live shield owns the weapon arm until DEFLECT_IMPULSE · then a 28ms bridge joins the arm to the running OLD B3'
            : `STEP 3A FAIL · ${result.event.reason || 'live grip contact constraint rejected'}`,
          className: result.event.type === 'parry-live-started' ? 'good' : 'bad',
        });
        break;
      }
      case 'block-reacted': {
        publishArmedReaction(result.event.armedReports);
        exchangeState.blockReaction = lifecycleDirector.blockReaction;
        publishStatus({
          text: `BLOCK · ${selectedDirection.toUpperCase()} rebound from impact · no contact constraint · attacker ${((exchangeState.latestRootDisplacement?.attacker?.peakMeters ?? 0) * 100).toFixed(0)}cm back, defender ${((exchangeState.latestRootDisplacement?.defender?.peakMeters ?? 0) * 100).toFixed(0)}cm absorbing`,
          className: 'good',
        });
        break;
      }
      case 'parry-failed-to-block': {
        publishStatus({
          text: `PARRY FAILED → BLOCK · ${result.event.reason}`,
          className: 'warn',
        });
        break;
      }
      default: break;
    }
  }

  function updateCombatBeforeGuard({
    deltaSeconds,
    deltaMs,
    selectedDirection,
    hasAttackerRecovery,
    beginAttackRecovery,
  }) {
    if (!combat.active) return Object.freeze({ handledCombat: false, liveConstraintNeedsUpdate: false });
    const frame = lifecycleDirector.advanceCombat({ deltaSeconds, deltaMs });
    exchangeState.latestCombatUpdate = frame.combatUpdate;
    if (frame.armJoined) {
      exchangeState.step3AContactTransfer = lifecycleDirector.transfer;
      publishStatus({
        text: `OLD B3 ARM JOINED · ${selectedDirection.toUpperCase()} DEFLECT_IMPULSE released the weapon arm · ${frame.armJoined.bridgeMs ?? 28}ms continuity bridge · running OLD B3 continues from ${frame.armJoined.continuedFromPresentationMs?.toFixed(0) ?? '0'}ms`,
        className: 'good',
      });
    }
    if (frame.attackerReaction) {
      exchangeState.latestTorsoLeanReport = frame.attackerReaction.torsoLeanReport;
      exchangeState.latestArmFlingReport = frame.attackerReaction.armFlingReport;
      exchangeState.latestAttackerRootDisplacement = frame.attackerReaction.rootDisplacementReport;
      if (frame.attackerReaction.repaintRequired) attacker.update(0, camera);
    }
    if (frame.justCompleted) {
      exchangeState.latestAttackerRootDisplacement = null;
      exchangeState.latestDefenderRootDisplacement = null;
      if (!hasAttackerRecovery) beginAttackRecovery(selectedDirection);
    }
    return Object.freeze({ handledCombat: true, liveConstraintNeedsUpdate: frame.liveConstraintNeedsUpdate });
  }

  function updateLiveConstraintAfterGuard({ deltaSeconds, selectedDirection, needsUpdate }) {
    if (!needsUpdate) return null;
    const wasHolding = exchangeState.latestGripConstraintReport?.holding === true;
    const advanced = lifecycleDirector.advanceConstraint({
      deltaSeconds,
      selectedDirection,
      previousGripHolding: wasHolding,
    });
    exchangeState.latestGripConstraintReport = advanced.gripReport;
    updateLiveContactMarkers(advanced.gripReport);
    if (!advanced.holding) return null;

    const { passed, release } = advanced;
    if (release?.accepted) publishReleaseAccepted(release);
    if (!wasHolding || release?.accepted) {
      const waitingForDefenderImpulse = release?.reason === 'defender-deflect-marker-not-reached';
      const inspectionFallbackUsed = release?.couplingReport?.inspectionFallbackUsed === true;
      const text = release?.accepted
        ? inspectionFallbackUsed
          ? `PARRY CONFIRMED · ${selectedDirection.toUpperCase()} ${formatInspectionFailureSummary(advanced.gripReport)} · DEFLECT_IMPULSE fail-safe release · weapon arm joins the running OLD B3`
          : `LIVE CONTACT VERIFIED · 7/7 PASS · ${selectedDirection.toUpperCase()} DEFLECT_IMPULSE · releasing the weapon arm through the 28ms bridge into the running OLD B3`
        : waitingForDefenderImpulse
          ? `${passed ? 'LIVE CONTACT VERIFIED · 7/7 PASS' : `PARRY CONFIRMED · ${formatInspectionFailureSummary(advanced.gripReport)}`} · waiting for defender DEFLECT ${release.defenderReleaseGate.sourceTimeSeconds.toFixed(3)}s / ${release.defenderReleaseGate.requiredSourceTimeSeconds.toFixed(3)}s`
          : passed
            ? `LIVE CONTACT VERIFIED · 7/7 PASS · ${selectedDirection.toUpperCase()} weapon-arm handoff deferred while TOP/RIGHT are calibrated first`
            : `STEP 3A HOLD · ${formatInspectionFailureSummary(advanced.gripReport)}`;
      publishStatus({
        text,
        className: release?.accepted || passed ? 'good' : waitingForDefenderImpulse ? 'warn' : 'bad',
      });
    }
    return Object.freeze({ release, passed });
  }

  function resetRootDisplacement() {
    lifecycleDirector.reset();
    return null;
  }

  return Object.freeze({
    ownsLiveContact,
    resetRootDisplacement,
    defenderDeflectReleaseGate,
    updateDefenderDeflectReleaseGate,
    releaseLiveContactToOldB3,
    resolveContact,
    updateCombatBeforeGuard,
    updateLiveConstraintAfterGuard,
    recordVisibleOldB3Sample,
  });
}
