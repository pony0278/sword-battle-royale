// R18M.3 — presentation-only Parry cue/HUD rendering and DOM event binding.
// Callers provide snapshots/callbacks. This module never decides combat success.

import {
  describeContactGeometry,
  formatAllInspectionGates,
  formatInspectionFailureSummary,
  formatTerminalState,
  formatWhiffDiagnostic,
} from './diagnostic-formatters.js';

export function createShieldParryLabUi(elements) {
  const {
    hudAttack, hudInput, parryCue, parryCueMain, parryCueDetail, hudContact, hudCoupling,
    hudShield, hudWeapon, hudSeparation, hudLineClearance, hudRecoil, hudDiagnostic,
    parryNow, retryAttack,
  } = elements;

  let parryCueState = null;
  let parryCueMainText = null;
  let parryCueDetailText = null;
  function showParryCue(state, main, detail) {
    if (
      state === parryCueState
      && main === parryCueMainText
      && detail === parryCueDetailText
    ) return;
    parryCueState = state;
    parryCueMainText = main;
    parryCueDetailText = detail;
    parryCue.className = `parry-cue ${state}`;
    parryCueMain.textContent = main;
    parryCueDetail.textContent = detail;
    retryAttack.classList.toggle('retry-attention', state === 'used');
  }

  function updateParryCue(model) {
    const {
      snapshot, ready, selectedMode, step3AContactTransfer, latestGripConstraintReport,
      selectedDirection, latestParryConfirmation, latestParryWhiff, parryAttempt,
      firstContact, latestParryOpportunity, parryReviewActive, parryReviewRate, debugMode,
    } = model;
    if (!ready) {
      showParryCue('wait', 'LOADING…', '等待 Lab 與動作資料完成');
      return;
    }
    if (selectedMode !== 'parry') {
      showParryCue('idle', 'BLOCK MODE', '切換到 PARRY 才會顯示按鍵窗口');
      return;
    }
    if (step3AContactTransfer && !step3AContactTransfer.accepted) {
      showParryCue('used', 'STEP 3A TRANSFER FAILED', `接觸幀已鎖住；原因：${step3AContactTransfer.reason}`);
      return;
    }
    if (step3AContactTransfer?.accepted) {
      if (latestGripConstraintReport?.holding) {
        if (latestGripConstraintReport.inspectionPassed) {
          showParryCue(
            'confirmed',
            'STEP 3A HOLD · LIVE CONTACT VERIFIED',
            `7/7 gates PASS · 接觸終止：${formatTerminalState(latestGripConstraintReport.terminalReason)}`,
          );
        } else {
          const assessment = latestGripConstraintReport.inspectionAssessment;
          showParryCue(
            'used',
            `STEP 3A HOLD · ${assessment?.failedGateCount ?? '?'} GATES FAILED`,
            formatInspectionFailureSummary(latestGripConstraintReport),
          );
        }
      } else {
        showParryCue(
          'confirmed',
          'LIVE SHIELD × SWORD CONSTRAINT',
          selectedDirection === 'left'
            ? '每幀由盾面接觸錨點解算 wrist.r；LEFT 手臂交棒仍待校準'
            : '每幀由盾面接觸錨點解算 lowerarm.r → wrist.r；7/7 後交棒 OLD B3',
        );
      }
      return;
    }
    if (latestParryConfirmation?.accepted) {
      showParryCue('confirmed', 'PARRY CONFIRMED', '真實 Sword × Shield 接觸已成立，正在建立 live wrist-grip 接觸約束');
      return;
    }
    if (latestParryWhiff) {
      const whiff = formatWhiffDiagnostic(latestParryWhiff, { debugMode: debugMode });
      showParryCue('late', `PARRY WHIFF · ${whiff.label}`, whiff.detail);
      return;
    }

    const attempt = parryAttempt;
    if (attempt) {
      if (attempt.accepted) {
        showParryCue('armed', 'ARMED · WAIT FOR CONTACT', 'F 已收到；現在只等待真實 Sword × Shield swept contact');
        return;
      }
      const timing = attempt.reason === 'attack-not-committed' || attempt.reason === 'parry-input-too-early'
        ? 'TOO EARLY'
        : attempt.reason === 'parry-input-too-late'
          ? 'TOO LATE'
          : 'INPUT REJECTED';
      showParryCue('used', `${timing} · ATTEMPT USED`, `原因：${attempt.reason} · 這一刀不再接受 F，按 RETRY ATTACK`);
      return;
    }

    if (!snapshot?.action) {
      showParryCue('idle', 'START AN ATTACK', '選一個攻擊方向，或按 RETRY ATTACK');
      return;
    }
    if (firstContact) {
      showParryCue('late', 'CONTACT PASSED', '這一刀沒有在有效窗口武裝 Parry');
      return;
    }

    const opportunity = latestParryOpportunity;
    if (!opportunity) {
      showParryCue('wait', 'WAIT · READING ATTACK', '正在取得即時攻擊路徑與盾牌可達資訊');
      return;
    }
    if (opportunity.accepted) {
      const ttcMs = Math.max(0, opportunity.timeToContactSeconds * 1000).toFixed(0);
      const reachCm = opportunity.requiredShieldTravelMeters == null
        ? '—'
        : (opportunity.requiredShieldTravelMeters * 100).toFixed(1);
      const tracking = opportunity.gates.trackingClamped ? `tracking ${reachCm}cm → clamp 18cm` : `shield travel ${reachCm}cm`;
      showParryCue('ready', 'PARRY NOW! · PRESS F', `commitment + TTC gate 已開 · ${tracking} · review hold 最多 1.5s`);
      return;
    }

    if (opportunity.reason === 'attack-not-committed' || opportunity.reason === 'parry-input-too-early') {
      const attack = opportunity.attack;
      const untilCommitMs = attack?.movementStartSeconds == null || attack?.elapsedSeconds == null
        ? null
        : Math.max(0, (attack.movementStartSeconds - attack.elapsedSeconds) * 1000);
      const reviewMs = untilCommitMs == null
        ? null
        : untilCommitMs / (parryReviewActive ? parryReviewRate : 1);
      showParryCue(
        'wait',
        untilCommitMs == null ? 'WAIT · ATTACK NOT COMMITTED' : `WAIT · WINDOW IN ${untilCommitMs.toFixed(0)}ms`,
        reviewMs == null ? '不要按 F；等待 PARRY NOW' : `game-time · 約 ${reviewMs.toFixed(0)}ms review-time · 不要先按 F`,
      );
      return;
    }
    if (opportunity.reason === 'parry-input-too-late') {
      showParryCue('late', 'TOO LATE', '等待下一刀，或按 RETRY ATTACK');
      return;
    }

    showParryCue('geometry', 'WAIT · GATE CLOSED', `即時原因：${opportunity.reason} · 尚未接受 F`);
  }
  function updateHud(model) {
    const {
      snapshot, combatSnapshot, latestCombatResult, latestParryWhiff, latestParryConfirmation,
      latestParryInput, selectedMode, requestedOutcome, parryReviewActive, parryReviewRate,
      parryPromptHeld, firstContact, latestFinePlan, latestReachableInterceptTarget,
      latestGripConstraintReport, step3AContactTransfer, defenderReleaseGate,
      step3AOwnsLiveContact, directOldB3Diagnostic, debugMode,
    } = model;
    const outcome = latestCombatResult?.resolution?.outcome || '—';
    const recoil = combatSnapshot.attackerRecoil?.sample;
    const attackProfile = snapshot.action?.runtime || null;
    const ttcSeconds = attackProfile ? attackProfile.contactSeconds - snapshot.elapsedSeconds : null;
    const committed = Boolean(attackProfile)
      && snapshot.elapsedSeconds >= attackProfile.movementStartSeconds
      && snapshot.elapsedSeconds < attackProfile.contactSeconds;
    const inputStatus = latestParryWhiff
      ? `WHIFF · ${latestParryWhiff.category}`
      : latestParryConfirmation?.accepted
      ? 'CONFIRMED'
      : latestParryInput?.accepted
        ? 'ARMED · awaiting real contact'
        : latestParryInput
          ? `REJECTED · ${latestParryInput.reason}`
          : selectedMode === 'parry'
            ? 'not pressed'
            : 'Block mode';

    const reviewRate = parryReviewActive ? parryReviewRate : 1;
    hudAttack.textContent = `Requested: ${requestedOutcome.toUpperCase()} · Actual: ${String(outcome).toUpperCase()} · ${snapshot.phase} · committed ${committed ? 'YES' : 'NO'} · TTC ${ttcSeconds == null ? '—' : `${Math.max(0, ttcSeconds) * 1000 | 0}ms`} · review ${reviewRate.toFixed(2)}×${parryPromptHeld ? ' · VALID WINDOW HELD' : ''}`;
    const contactGeometry = describeContactGeometry(firstContact);
    const whiffGeometry = formatWhiffDiagnostic(latestParryWhiff, { debugMode: debugMode });
    hudContact.textContent = contactGeometry
      ? `REAL Sword × Shield: YES · swept ${firstContact.mode || 'contact'} · ${contactGeometry.text}`
      : whiffGeometry
        ? `REAL Sword × Shield: NO · ${whiffGeometry.detail}`
        : 'REAL Sword × Shield: waiting';
    hudCoupling.textContent = `Parry gate: ${inputStatus}`;
    const interceptRequired = latestFinePlan?.requiredDistance;
    const interceptApplied = latestFinePlan?.appliedDistance;
    const originalPrediction = latestReachableInterceptTarget?.predictedRequiredDistanceMeters;
    hudShield.textContent = latestParryInput
      ? latestReachableInterceptTarget?.fallbackApplied && interceptRequired != null
        ? `Shield intercept: MEASURED SWEEP ${(interceptRequired * 100).toFixed(1)}→${(interceptApplied * 100).toFixed(1)}cm · bad linear prediction ${originalPrediction == null ? '—' : `${(originalPrediction * 100).toFixed(1)}cm`} rejected · real contact still required`
        : `Shield tracking: ${latestParryInput.requiredShieldTravelMeters == null ? 'path pending' : `${(latestParryInput.requiredShieldTravelMeters * 100).toFixed(1)}cm → ${latestParryInput.gates.trackingClamped ? 'CLAMP 18cm' : 'within 18cm'}`} · geometry cannot veto input · plane ${latestParryInput.predictedPlaneDistanceMeters == null ? '—' : `${(latestParryInput.predictedPlaneDistanceMeters * 100).toFixed(1)}cm`}`
      : 'Shield tracking: geometry guides a clamped 18cm response; it cannot veto valid timing input';
    const centimeters = (value) => value == null ? '—' : (value * 100).toFixed(1);
    const agreement = latestGripConstraintReport?.directionAgreement == null
      ? '—'
      : latestGripConstraintReport.directionAgreement.toFixed(2);
    const inspection = latestGripConstraintReport?.holding
      ? latestGripConstraintReport.inspectionPassed ? 'PASS' : 'FAIL'
      : 'LIVE';
    hudWeapon.textContent = step3AContactTransfer?.accepted
      ? `LIVE Shield → Sword → Arm: forearm ${latestGripConstraintReport?.appliedForearmDegrees?.toFixed(1) ?? '0.0'}° · wrist ${latestGripConstraintReport?.appliedWristDegrees?.toFixed(1) ?? '0.0'}° · offline target ${centimeters(latestGripConstraintReport?.peakOfflineTravelMeters)}cm · sword ${centimeters(latestGripConstraintReport?.actualContactTravelMeters)}cm · hand ${centimeters(latestGripConstraintReport?.actualHandTravelMeters)}cm · hilt ${centimeters(latestGripConstraintReport?.actualGripTravelMeters)}cm`
      : 'LIVE Shield → Sword → Grip: locked until valid manual timing and real contact pass';
    hudSeparation.textContent = step3AContactTransfer?.accepted
      ? `Step 3A: ${inspection} · contact error ${centimeters(latestGripConstraintReport?.liveContactErrorMeters)}cm · direction ${agreement} · hold ${formatTerminalState(latestGripConstraintReport?.terminalReason)} · ${latestGripConstraintReport?.elbowPropagationActive ? 'lowerarm.r assist → ' : ''}wrist.r → hand.r + handslot.r · shoulder OFF`
      : 'Step 3A: waiting · TOP/RIGHT lowerarm assist + wrist/grip; LEFT remains wrist-only';
    const lineClearance = latestGripConstraintReport?.attackLineClearance || null;
    const lineGate = (passed) => passed ? 'PASS' : 'FAIL';
    hudLineClearance.textContent = lineClearance
      ? `LINE CLEAR ${lineGate(lineClearance.pass)} · sword axis ${lineGate(lineClearance.swordAxisPassed)} ${lineClearance.swordAxisClearanceDegrees.toFixed(1)}° / ${lineClearance.minimumSwordAxisClearanceDegrees.toFixed(1)}° · hilt ${lineGate(lineClearance.hiltOfflinePassed)} ${(lineClearance.hiltOfflineTravelMeters * 100).toFixed(1)}cm / ${(lineClearance.minimumHiltOfflineTravelMeters * 100).toFixed(1)}cm · wrist→grip ${lineGate(lineClearance.wristGripLinePassed)} ${lineClearance.wristGripClearanceDegrees.toFixed(1)}° / ${lineClearance.minimumWristGripClearanceDegrees.toFixed(1)}°`
      : 'LINE CLEAR: waiting for live contact · red original axis / green current axis / purple wrist→grip';
    const reactionClockMs = combatSnapshot.parryReactionClock?.elapsedMs;
    const recoilPhaseClock = combatSnapshot.attackerRecoil?.phaseClock || null;
    const reactionPlanPitchDegrees = latestCombatResult?.attackerReaction
      ?.silhouette?.backwardPitchDegrees;
    const appliedChainPitchDegrees = recoil?.pose
      ? (Number(recoil.pose.chestPitchDegrees) || 0)
        + (Number(recoil.pose.spinePitchDegrees) || 0)
        + (Number(recoil.pose.hipsPitchDegrees) || 0)
      : null;
    hudRecoil.textContent = step3AOwnsLiveContact
      ? `OLD B3 selected at impact ${reactionClockMs == null ? '—' : `${reactionClockMs.toFixed(0)}ms`} · strong plan ${reactionPlanPitchDegrees?.toFixed(1) ?? '—'}° · presentation ${recoilPhaseClock?.elapsedMs?.toFixed(0) ?? '0'}ms ${recoilPhaseClock?.latched ? 'PARKED AT CONTACT ORIGIN' : 'WAITING'} · CONTACT OWNS FINAL POSE · ${defenderReleaseGate.passed ? 'DEFLECT_IMPULSE READY' : `waiting DEFLECT ${defenderReleaseGate.sourceTimeSeconds.toFixed(3)}s / ${defenderReleaseGate.requiredSourceTimeSeconds.toFixed(3)}s`}`
      : recoil
        ? `OLD B3 recoil: ${recoil.phase} · presentation ${recoilPhaseClock?.elapsedMs?.toFixed(0) ?? '—'}ms · arm ${recoil.weights?.armWeight?.toFixed(2) ?? '—'} · torso ${recoil.weights?.torsoWeight?.toFixed(2) ?? '—'} · legs ${recoil.weights?.legWeight?.toFixed(2) ?? '—'}`
        : 'OLD B3 recoil: —';
    const inspectionAssessment = latestGripConstraintReport?.inspectionAssessment;
    hudDiagnostic.textContent = directOldB3Diagnostic
      ? `STEP 1 DIRECT B3: ${directOldB3Diagnostic.accepted ? 'ACTIVE' : 'FAIL'} · all later gates bypassed`
      : inspectionAssessment?.holding
        ? formatAllInspectionGates(latestGripConstraintReport)
        : whiffGeometry
          ? `WHIFF DIAGNOSTIC · ${whiffGeometry.label} · ${whiffGeometry.detail}`
          : `STEP 3A: ${inputStatus} · shield → sword → hand only · Perfect removed`;
    hudDiagnostic.className = latestParryWhiff
      ? 'bad'
      : inspectionAssessment?.holding
        ? inspectionAssessment.pass ? 'good' : 'bad'
        : '';
  }

  function flashParryInput() {
    parryNow.classList.add('input-flash');
    globalThis.setTimeout(() => parryNow.classList.remove('input-flash'), 180);
  }

  function setInputReceipt(source, result) {
    hudInput.textContent = `INPUT RECEIVED: ${source.toUpperCase()} · ${result.accepted ? 'ARMED' : `REJECTED · ${result.reason}`}`;
  }

  return Object.freeze({
    updateParryCue,
    updateHud,
    flashParryInput,
    setInputReceipt,
  });
}

function isParryKey(event) {
  return event?.code === 'KeyF'
    || String(event?.key || '').toLowerCase() === 'f'
    || event?.keyCode === 70;
}

export function bindShieldParryLabUiEvents({
  documentRef,
  windowRef,
  canvas,
  elements,
  handlers,
}) {
  let parryKeyDownObserved = false;
  documentRef.querySelectorAll('[data-attack]').forEach((button) =>
    button.addEventListener('click', () => handlers.onAttack(button.dataset.attack)));
  documentRef.querySelectorAll('[data-mode]').forEach((button) =>
    button.addEventListener('click', () => handlers.onMode(button.dataset.mode)));
  documentRef.querySelectorAll('[data-view]').forEach((button) =>
    button.addEventListener('click', () => handlers.onView(button.dataset.view)));
  elements.forceOldB3.addEventListener('click', handlers.onForceOldB3);
  elements.parryNow.addEventListener('click', () => handlers.onParryInput('button'));
  elements.retryAttack.addEventListener('click', handlers.onRetryAttack);
  elements.debugApplyRetry.addEventListener('click', handlers.onDebugApplyRetry);
  elements.debugResetDefaults.addEventListener('click', handlers.onDebugResetDefaults);

  documentRef.addEventListener('keydown', (event) => {
    if (!isParryKey(event) || event.repeat) return;
    parryKeyDownObserved = true;
    event.preventDefault();
    event.stopPropagation();
    handlers.onParryInput('keyboard-f', event);
  }, true);
  documentRef.addEventListener('keyup', (event) => {
    if (!isParryKey(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!parryKeyDownObserved) handlers.onParryInput('keyboard-f-keyup-fallback', event);
    parryKeyDownObserved = false;
  }, true);
  windowRef.addEventListener('blur', () => { parryKeyDownObserved = false; });
  canvas.addEventListener('pointerdown', () => canvas.focus({ preventScroll: true }));
  elements.showSurface.addEventListener('change', () => handlers.onShowSurface(elements.showSurface.checked));
  windowRef.addEventListener('resize', handlers.onResize);
  handlers.onView('three');
  handlers.onResize();
}
