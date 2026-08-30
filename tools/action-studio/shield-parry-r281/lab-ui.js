// R18M.3 — presentation-only Parry cue/HUD rendering and DOM event binding.
// Callers provide snapshots/callbacks. This module never decides combat success.

import { PARRY_LUNGE_TRAVEL_BUDGET_METERS } from '../../../src/combat/parry-lunge-reach.js';
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
    // R19I.1: three states, not two - nothing chosen is its own thing, and saying "BLOCK MODE"
    // for it would name a choice the player never made.
    if (!selectedMode) {
      showParryCue('idle', 'NO DEFENCE CHOSEN', '雙方都在待機；選 BLOCK 或 PARRY 才會架防禦');
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
      const tracking = opportunity.gates.trackingClamped ? `tracking ${reachCm}cm → clamp ${(PARRY_LUNGE_TRAVEL_BUDGET_METERS * 100).toFixed(0)}cm` : `shield travel ${reachCm}cm`;
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
      parryPromptHeld, firstContact, latestFinePlan, latestGuardCoverage, latestReachableInterceptTarget,
      anchorCoverage,
      latestGripConstraintReport, step3AContactTransfer, defenderReleaseGate,
      step3AOwnsLiveContact, directOldB3Diagnostic, debugMode, lockReport,
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
    hudAttack.textContent = `Requested: ${requestedOutcome ? requestedOutcome.toUpperCase() : 'NONE'} · Actual: ${String(outcome).toUpperCase()} · ${snapshot.phase} · committed ${committed ? 'YES' : 'NO'} · TTC ${ttcSeconds == null ? '—' : `${Math.max(0, ttcSeconds) * 1000 | 0}ms`} · review ${reviewRate.toFixed(2)}×${parryPromptHeld ? ' · VALID WINDOW HELD' : ''}`;
    const contactGeometry = describeContactGeometry(firstContact);
    const whiffGeometry = formatWhiffDiagnostic(latestParryWhiff, { debugMode: debugMode });
    hudContact.textContent = contactGeometry
      ? `REAL Sword × Shield: YES · swept ${firstContact.mode || 'contact'} · ${contactGeometry.text}`
      : whiffGeometry
        ? `REAL Sword × Shield: NO · ${whiffGeometry.detail}`
        : 'REAL Sword × Shield: waiting';
    // R20S.3: the lock, on the line the parry gate already owns - one glance answers both "am I
    // locked" and "is my timing being read", which are the two things a player is holding in their
    // head at once.
    const lockStatus = lockReport
      ? lockReport.locked
        ? ` · LOCK ON ${lockReport.distanceMeters == null ? '' : `${lockReport.distanceMeters.toFixed(2)}m `}(Tab 解除)`
        : ` · FREE · Tab 鎖定${lockReport.reason === 'nobody-inside-the-frontal-view' ? '(對手不在正面視野)' : lockReport.reason === 'nobody-within-lock-range' ? '(超出 3.5m 鎖定距離)' : ''}`
      : '';
    hudCoupling.textContent = `Parry gate: ${inputStatus}${lockStatus}`;
    const interceptRequired = latestFinePlan?.requiredDistance;
    const interceptApplied = latestFinePlan?.appliedDistance;
    const originalPrediction = latestReachableInterceptTarget?.predictedRequiredDistanceMeters;
    const guardAim = latestFinePlan?.threat?.selection || '—';
    const guardCm = (value) => (value == null ? '—' : `${(value * 100).toFixed(1)}cm`);
    // R18V.1: the anchors and every compensation tuned with them were measured at one separation.
    // Say so on screen the moment the fighters are standing somewhere those numbers were never
    // verified, rather than letting a direction quietly stop reaching the guard.
    const coverageBand = !anchorCoverage
      ? ''
      : anchorCoverage.verified
        ? ` · ${anchorCoverage.direction} verified ${anchorCoverage.band.fromMeters}-${anchorCoverage.band.toMeters}m`
        : ` · UNVERIFIED AT THIS RANGE: ${anchorCoverage.direction} ${anchorCoverage.reason}`
          + (anchorCoverage.band ? ` (measured ${anchorCoverage.band.fromMeters}-${anchorCoverage.band.toMeters}m)` : '');
    hudShield.textContent = selectedMode === 'block'
      ? latestGuardCoverage
        ? `Guard coverage: ${latestGuardCoverage.reason} · aim ${guardAim} · need ${guardCm(latestGuardCoverage.requiredDistance)} · applied ${guardCm(interceptApplied)} · blade gap ${guardCm(latestGuardCoverage.trackedGapMeters)}${coverageBand}`
        : `Guard coverage: omnidirectional · waits out the reaction delay, then covers the committed direction${coverageBand}`
      : latestParryInput
      ? latestReachableInterceptTarget?.fallbackApplied && interceptRequired != null
        ? `Shield intercept: MEASURED SWEEP ${(interceptRequired * 100).toFixed(1)}→${(interceptApplied * 100).toFixed(1)}cm · bad linear prediction ${originalPrediction == null ? '—' : `${(originalPrediction * 100).toFixed(1)}cm`} rejected · real contact still required`
        : `Shield tracking: ${latestParryInput.requiredShieldTravelMeters == null ? 'path pending' : `${(latestParryInput.requiredShieldTravelMeters * 100).toFixed(1)}cm → ${latestParryInput.gates.trackingClamped ? `CLAMP ${(PARRY_LUNGE_TRAVEL_BUDGET_METERS * 100).toFixed(0)}cm` : `within ${(PARRY_LUNGE_TRAVEL_BUDGET_METERS * 100).toFixed(0)}cm`}`} · geometry cannot veto input · plane ${latestParryInput.predictedPlaneDistanceMeters == null ? '—' : `${(latestParryInput.predictedPlaneDistanceMeters * 100).toFixed(1)}cm`}`
      : `Shield tracking: geometry guides a clamped ${(PARRY_LUNGE_TRAVEL_BUDGET_METERS * 100).toFixed(0)}cm response; it cannot veto valid timing input`;
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
      : 'Step 3A: waiting · full arm chain (upperarm + lowerarm + wrist/grip) on every direction';
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

// R19A.1: the defender's feet. Arrows rather than WASD because the free inspection camera already
// owns WASD, and a key that both flies the camera and walks a fighter is a key that does neither
// legibly.
const LANE_KEYS = Object.freeze({ ArrowUp: -1, ArrowDown: 1 });
// R19V.1: the sidestep keys. Left/right arrows rather than A/D, because WASD already belongs to
// the free camera and stealing half of it would leave both crippled. Body-relative - ArrowLeft
// steps to the defender's own left, ArrowRight their right - and defender-only: Shift hands the
// arrows to the attacker, but the attacker has no lateral verb yet, so held Shift zeroes the
// sidestep rather than redirecting it.
const LATERAL_KEYS = Object.freeze({ ArrowLeft: -1, ArrowRight: 1 });
// R20S.3: free movement, in two dimensions. WASD is the movement layout every player already
// knows, and it is free to take because the inspection camera it used to fly is now opt-in
// (?camera=free) rather than the way the lab is looked at. The arrows keep driving the lane
// scalars unchanged - the same ledger underneath, and nothing that depended on them moves.
const MOVE_FORWARD_KEYS = Object.freeze({ KeyW: 1, KeyS: -1 });
const MOVE_LATERAL_KEYS = Object.freeze({ KeyD: 1, KeyA: -1 });
// R20S.3: locking is a decision, so it gets a key of its own rather than happening to you.
const LOCK_KEY = 'Tab';

function laneIntentFrom(held) {
  let intent = 0;
  for (const code of held) intent += LANE_KEYS[code] || 0;
  // Both held at once cancels, which is what pressing two opposite directions should do.
  return Math.sign(intent);
}

// R19B.1: which fighter the arrows are driving. Shift picks the attacker rather than giving them
// their own pair of keys, so there is one thing to learn - up closes, down backs off - and a
// modifier saying who is doing it. Only one of them walks at a time, which is what a single player
// at a single keyboard can honestly do anyway.
function laneIntentsFor(held, attackerModifier) {
  const intent = laneIntentFrom(held);
  return attackerModifier
    ? { defender: 0, attacker: intent }
    : { defender: intent, attacker: 0 };
}

function lateralIntentFrom(held, attackerModifier) {
  if (attackerModifier) return 0;
  let intent = 0;
  for (const code of held) intent += LATERAL_KEYS[code] || 0;
  return Math.sign(intent);
}

function isParryKey(event) {
  return event?.code === 'KeyF'
    || String(event?.key || '').toLowerCase() === 'f'
    || event?.keyCode === 70;
}

// R20S.3: free look. A drag across the canvas turns the camera when nothing is locked; the entry
// hands this to the player controller, which refuses it while a lock is held.
function bindFreeLook(canvas, handlers) {
  if (!canvas || typeof handlers.onLook !== 'function') return;
  let dragging = false;
  let lastX = null;
  canvas.addEventListener('pointerdown', (event) => { dragging = true; lastX = event.clientX; });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging || lastX == null) return;
    handlers.onLook(event.clientX - lastX);
    lastX = event.clientX;
  });
  const end = () => { dragging = false; lastX = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', end);
}

export function bindShieldParryLabUiEvents({
  documentRef,
  windowRef,
  canvas,
  elements,
  handlers,
}) {
  bindFreeLook(canvas, handlers);
  let parryKeyDownObserved = false;
  const heldLaneKeys = new Set();
  let attackerModifierHeld = false;
  const heldLateralKeys = new Set();
  const heldMoveKeys = new Set();
  function publishMoveIntent() {
    let forward = 0; let lateral = 0;
    for (const code of heldMoveKeys) { forward += MOVE_FORWARD_KEYS[code] || 0; lateral += MOVE_LATERAL_KEYS[code] || 0; }
    handlers.onMoveIntent?.({ forward: Math.sign(forward), lateral: Math.sign(lateral) });
  }
  function publishLaneIntent() {
    const intents = laneIntentsFor(heldLaneKeys, attackerModifierHeld);
    handlers.onDefenderIntent?.(intents.defender);
    handlers.onAttackerIntent?.(intents.attacker);
    handlers.onDefenderLateralIntent?.(lateralIntentFrom(heldLateralKeys, attackerModifierHeld));
  }
  // R19W.1: the touch pad. Each button is a virtual arrow key: press puts its key code into the
  // same held-set the keyboard path uses, release takes it out, and everything downstream - the
  // Shift rules, the publish, the intents - is literally the keyboard code running unchanged.
  // Pointer events cover mouse and touch alike; capture keeps a finger that slides off the
  // button from leaving a phantom held key behind.
  documentRef.querySelectorAll('[data-move]').forEach((button) => {
    const code = button.dataset.move;
    const held = LANE_KEYS[code] !== undefined ? heldLaneKeys : heldLateralKeys;
    const press = (event) => {
      event.preventDefault();
      // Capture keeps a sliding finger from leaving a phantom held key, but a pointer that is
      // already gone by the time capture is requested THROWS - an ultra-quick tap can do it -
      // and an uncaught throw here would abort before the intent ever registers.
      try { button.setPointerCapture(event.pointerId); } catch { /* capture is best-effort */ }
      held.add(code); publishLaneIntent();
    };
    const release = (event) => {
      event.preventDefault();
      held.delete(code); publishLaneIntent();
    };
    button.addEventListener('pointerdown', press);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('contextmenu', (event) => event.preventDefault());
  });
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
    // Shift can be pressed or released while an arrow is already held, so the fighter it is
    // driving has to be able to change mid-hold rather than only at the next arrow press.
    if (event.shiftKey !== attackerModifierHeld) {
      attackerModifierHeld = event.shiftKey;
      publishLaneIntent();
    }
    if (LANE_KEYS[event.code] !== undefined) {
      event.preventDefault();
      if (!event.repeat) { heldLaneKeys.add(event.code); publishLaneIntent(); }
      return;
    }
    if (LATERAL_KEYS[event.code] !== undefined) {
      event.preventDefault();
      if (!event.repeat) { heldLateralKeys.add(event.code); publishLaneIntent(); }
      return;
    }
    if (MOVE_FORWARD_KEYS[event.code] !== undefined || MOVE_LATERAL_KEYS[event.code] !== undefined) {
      event.preventDefault();
      if (!event.repeat) { heldMoveKeys.add(event.code); publishMoveIntent(); }
      return;
    }
    if (event.code === LOCK_KEY) {
      // Tab moves focus by default, which would take the keyboard away from the fight.
      event.preventDefault();
      if (!event.repeat) handlers.onLockToggle?.();
      return;
    }
    if (event.code === 'Space' && !event.repeat) {
      // R20F.1: dodge. Direction comes from whatever movement keys are held at the press -
      // lateral wins over lane, nothing held dodges back - and the state itself refuses
      // mid-dodge or cooldown presses, so this only ever asks.
      event.preventDefault();
      let lateral = 0; for (const code of heldLateralKeys) lateral += LATERAL_KEYS[code] || 0;
      let lane = 0; for (const code of heldLaneKeys) lane += LANE_KEYS[code] || 0;
      handlers.onDodge?.(lateral > 0 ? 'right' : lateral < 0 ? 'left' : lane < 0 ? 'forward' : 'back');
      return;
    }
    if (!isParryKey(event) || event.repeat) return;
    parryKeyDownObserved = true;
    event.preventDefault();
    event.stopPropagation();
    // R20G.1 (B6c): F is one key with two readings - a hold (the guard) and a press (the parry
    // input). Both are reported; the entry routes by mode.
    handlers.onGuardKey?.(true);
    handlers.onParryInput('keyboard-f', event);
  }, true);
  documentRef.addEventListener('keyup', (event) => {
    if (event.shiftKey !== attackerModifierHeld) {
      attackerModifierHeld = event.shiftKey;
      publishLaneIntent();
    }
    if (LANE_KEYS[event.code] !== undefined) {
      event.preventDefault();
      heldLaneKeys.delete(event.code);
      publishLaneIntent();
      return;
    }
    if (LATERAL_KEYS[event.code] !== undefined) {
      event.preventDefault();
      heldLateralKeys.delete(event.code);
      publishLaneIntent();
      return;
    }
    if (MOVE_FORWARD_KEYS[event.code] !== undefined || MOVE_LATERAL_KEYS[event.code] !== undefined) {
      event.preventDefault();
      heldMoveKeys.delete(event.code);
      publishMoveIntent();
      return;
    }
    if (!isParryKey(event)) return;
    event.preventDefault();
    event.stopPropagation();
    handlers.onGuardKey?.(false);
    if (!parryKeyDownObserved) handlers.onParryInput('keyboard-f-keyup-fallback', event);
    parryKeyDownObserved = false;
  }, true);
  // A key held when the window loses focus never reports its keyup, so the fighter would walk off
  // on their own until the key was pressed and released again.
  windowRef.addEventListener('blur', () => {
    parryKeyDownObserved = false;
    heldLaneKeys.clear();
    heldMoveKeys.clear();
    publishMoveIntent();
    attackerModifierHeld = false;
    handlers.onGuardKey?.(false); // a guard held into a lost window never reports its keyup
    publishLaneIntent();
  });
  // R20G.1: the touch pad's guard button is a virtual F hold; the dodge button dodges back.
  documentRef.querySelectorAll('[data-hold-guard]').forEach((button) => {
    const press = (event) => { event.preventDefault(); try { button.setPointerCapture(event.pointerId); } catch { /* pointer already gone */ } handlers.onGuardKey?.(true); };
    const release = () => handlers.onGuardKey?.(false);
    button.addEventListener('pointerdown', press);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('contextmenu', (event) => event.preventDefault());
  });
  documentRef.querySelectorAll('[data-dodge]').forEach((button) => {
    button.addEventListener('pointerdown', (event) => { event.preventDefault(); handlers.onDodge?.('back'); });
    button.addEventListener('contextmenu', (event) => event.preventDefault());
  });
  canvas.addEventListener('pointerdown', () => canvas.focus({ preventScroll: true }));
  elements.showSurface.addEventListener('change', () => handlers.onShowSurface(elements.showSurface.checked));
  windowRef.addEventListener('resize', handlers.onResize);
  handlers.onView('three');
  handlers.onResize();
}
