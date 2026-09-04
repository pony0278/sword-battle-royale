// R18M.3 — presentation-only Parry cue/HUD rendering and DOM event binding.
// Callers provide snapshots/callbacks. This module never decides combat success.

import { planTouchStick } from '../../../src/game/touch-stick.js'; // R24J.1
import { createFrameTimeSampler } from '../../../src/game/frame-time-sampler.js'; // R24G.2
import { createMobileStartRuntime } from '../../../src/game/mobile-start.js'; // R24F.1
import { PARRY_LUNGE_TRAVEL_BUDGET_METERS } from '../../../src/combat/parry-lunge-reach.js';
import { directionalParryFor } from '../../../src/combat/directional-parry-input.js';
import {
  describeContactGeometry,
  formatAllInspectionGates,
  formatInspectionFailureSummary,
  formatTerminalState,
  formatWhiffDiagnostic,
} from './diagnostic-formatters.js';

import { formatSwingLedgerReport } from '../../../src/game/swing-ledger.js';

// R24G.2: the wall-clock frame times of the fight on this page, sampled where the entry ticks the
// overlay every frame and read where the log is written. One page, one sampler.
const frameTimes = createFrameTimeSampler();

export function createShieldParryLabUi(elements) {
  const {
    hudDuel, hudAttack, hudInput, parryCue, parryCueMain, parryCueDetail, hudContact, hudCoupling,
    hudShield, hudWeapon, hudSeparation, hudLineClearance, hudRecoil, hudDiagnostic, hudParryTally, hudOpponent,
    parryNow, retryAttack, copyTally, copySwings, copyDuelLog,
  } = elements;

  // R21G.2: the tally lives in the HUD, and the HUD folds to its title bar with the state
  // remembered per browser (R20Y.1) - so the panel a tester collapsed to see the stage is the same
  // panel the sample they are collecting is printed in. The button does not care whether it is
  // open: it copies the whole run, with the build it was collected on, because a number pasted
  // without its build cannot be compared to the next one.
  let copyableReport = null;
  let copyableSwings = null; // R23M.1: the player's swings, formatted once per frame like the tally
  const buildVersion = () => document.querySelector('script[type="module"][src*="v="]')?.src.split('v=')[1] || 'unknown';
  // R23M.1: the tally's copy button, generalised - the swing ledger wants exactly the same
  // clipboard-or-textarea behaviour, and two copies of a fallback are two ways for one to rot.
  function bindCopyButton(button, makeText) {
    if (!button) return;
    const label = button.textContent;
    let restore = null;
    button.addEventListener('click', async () => {
      const text = makeText();
      let ok = true;
      try { await navigator.clipboard.writeText(text); } catch (error) { ok = false; }
      if (!ok) {
        // A clipboard write can be refused outright (permissions, an insecure origin). Selecting
        // the text in a field is the fallback that always leaves the tester something to copy.
        const field = document.createElement('textarea');
        field.value = text;
        field.style.cssText = 'position:fixed;left:8px;bottom:8px;width:min(90vw,520px);height:9em;z-index:99';
        document.body.appendChild(field);
        field.select();
        setTimeout(() => field.remove(), 20000);
      }
      button.textContent = ok ? '已複製' : '請手動複製 ↙';
      clearTimeout(restore);
      restore = setTimeout(() => { button.textContent = label; }, 2000);
    });
  }
  bindCopyButton(copyTally, () => [`build ${buildVersion()}`, ...(copyableReport || ['(尚未有任何攻擊)'])].join('\n'));
  // R23Y.1: one text, two buttons - the panel's and the one beside the log in the HUD. Both sides'
  // lines are in it (R23W.1), so it is the fight's log, not the player's swings.
  const duelLogText = () => copyableSwings || formatSwingLedgerReport({ context: { build: buildVersion() } });
  bindCopyButton(copySwings, duelLogText);
  bindCopyButton(copyDuelLog, duelLogText);

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
      // R21O.2: count down to the WINDOW, which is where the gate accepts, not to COMMITMENT,
      // which is only where the attack becomes real. They are different moments and this line
      // said the first while computing the second.
      //
      // At 1x the lie was small enough to hide inside a person's own timing error - the window
      // opens 20ms BEFORE commitment on TOP, 26ms after on RIGHT, 110ms after on LEFT. R21O.1
      // doubled the swing without scaling the window's fixed 180/60ms offsets, which stretched
      // those gaps to 140 / 231 / 400ms, and the playtest failed exactly along that ranking:
      // 4 / 5 / 10 presses too early, LEFT never once landing inside its window. The HUD had
      // counted to zero and said press, 400ms early, on every LEFT swing.
      //
      // Both halves come off the opportunity itself rather than being rebuilt from parts, so this
      // cannot drift from the rule it is describing: the gate accepts while ttc <= earliest.
      //
      // And it is the LATER of two moments, not either alone. The gate accepts only once the
      // attack is committed AND the timing is inside the window, and which of those lands second
      // depends on the direction: at 1x TOP commits 20ms AFTER its window opens, while LEFT
      // commits 110ms before. Counting to commitment alone was the bug; counting to the window
      // alone would simply move it onto TOP.
      const earliestTtc = opportunity.profile?.earliestInputTtcSeconds;
      const untilWindowMs = attack?.timeToContactSeconds == null || earliestTtc == null
        ? null
        : Math.max(0, (attack.timeToContactSeconds - earliestTtc) * 1000);
      const untilCommitMs = attack?.movementStartSeconds == null || attack?.elapsedSeconds == null
        ? null
        : Math.max(0, (attack.movementStartSeconds - attack.elapsedSeconds) * 1000);
      const untilAcceptMs = untilWindowMs == null || untilCommitMs == null
        ? null
        : Math.max(untilWindowMs, untilCommitMs);
      const reviewMs = untilAcceptMs == null
        ? null
        : untilAcceptMs / (parryReviewActive ? parryReviewRate : 1);
      // Committed and waiting is its own state. Folding it into "not committed" is what let the
      // countdown stand in for two different questions in the first place.
      const headline = untilAcceptMs == null
        ? 'WAIT · ATTACK NOT COMMITTED'
        : `${attack.committed ? 'COMMITTED' : 'WAIT'} · WINDOW IN ${untilAcceptMs.toFixed(0)}ms`;
      showParryCue(
        'wait',
        headline,
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
      step3AOwnsLiveContact, directOldB3Diagnostic, debugMode, lockReport, swingInnerReach, sprintReport,
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
    // R20T.2: too close for this swing. Said on the contact line because that is the line about
    // whether a blade meets anything, and said in terms of what to do about it - the player is
    // otherwise left watching a swing pass through nobody with no idea why.
    const insideArc = swingInnerReach?.insideArc === true
      ? ` · 太近:這一刀從身體後方掃過(需要 ${swingInnerReach.requiredSeparationMeters.toFixed(2)}m,接觸時只有 ${swingInnerReach.separationAtContactMeters.toFixed(2)}m)`
      : swingInnerReach?.reason === 'on-the-edge-of-the-sweep-arc' ? ' · 貼在弧線邊緣' : '';
    const contactGeometry = describeContactGeometry(firstContact);
    const whiffGeometry = formatWhiffDiagnostic(latestParryWhiff, { debugMode: debugMode });
    hudContact.textContent = `${contactGeometry
      ? `REAL Sword × Shield: YES · swept ${firstContact.mode || 'contact'} · ${contactGeometry.text}`
      : whiffGeometry
        ? `REAL Sword × Shield: NO · ${whiffGeometry.detail}`
        : 'REAL Sword × Shield: waiting'}${insideArc}`;
    // R20S.3: the lock, on the line the parry gate already owns - one glance answers both "am I
    // locked" and "is my timing being read", which are the two things a player is holding in their
    // head at once.
    // R20U.1: running, on the same line as the lock, because "let go of the lock to run" is the
    // one rule about it a player has to hold in their head.
    // R21Y.1: which run lent the arms, named only when it is not the shipped one - a plain URL's
    // HUD is unchanged, and an A/B run says on screen which side of the comparison is live.
    const armClip = sprintReport?.armClip?.reason === 'override' ? `(手臂 ${sprintReport.armClip.clipId})` : '';
    // R22E.1: when the legs are wearing the run rather than borrowing from it, the cadence on
    // screen is the thing being judged, so the number is put next to it rather than left to be
    // inferred. Only appears under ?wholebody=1.
    const gait = sprintReport?.gait;
    const wholeBody = gait?.wholeBodyOnly === true
      ? ` · 整支 clip:${gait.clipId} ${(2 * (sprintReport.speedMps || 0) / Math.abs(gait.cycleMeters || 1)).toFixed(2)} 步/秒`
        // R22F.1: the price, next to the thing it bought. A slide of zero is not printed - every
        // shipping configuration has one, and a permanent "滑步 0.00" teaches nothing.
        + (gait.footSlideMetersPerSecond > 0.01 ? ` · 腳滑 ${gait.footSlideMetersPerSecond.toFixed(2)} m/s` : '')
      : '';
    const sprintStatus = sprintReport?.sprinting === true
      ? ` · 全速奔跑 ${sprintReport.speedMps} m/s${armClip}${wholeBody}`
      : sprintReport && sprintReport.reason !== 'not-requested' && sprintReport.reason !== 'sprint-is-forward-only'
        ? ` · 跑不起來:${sprintReport.reason === 'locked-on-let-go-of-the-lock-to-run' ? '鎖定中(Tab 解除才能跑)' : sprintReport.reason === 'guard-is-up' ? '舉著盾' : sprintReport.reason === 'mid-swing' ? '揮砍中' : '閃避中'}`
        : '';
    const lockStatus = lockReport
      ? lockReport.locked
        ? ` · LOCK ON ${lockReport.distanceMeters == null ? '' : `${lockReport.distanceMeters.toFixed(2)}m `}(Tab 解除)`
        : ` · FREE · Tab 鎖定${lockReport.reason === 'nobody-inside-the-frontal-view' ? '(對手不在正面視野)' : lockReport.reason === 'nobody-within-lock-range' ? '(超出 3.5m 鎖定距離)' : ''}`
      : '';
    hudCoupling.textContent = `Parry gate: ${inputStatus}${lockStatus}${sprintStatus}`;
    // R21C.2: what the attempts actually did, split by why they failed - a wrong direction says the
    // swing was unreadable, a wrong moment says the window is tight, and they want opposite fixes.
    if (hudParryTally && model.parryTally) hudParryTally.textContent = `Parry 命中: ${model.parryTally}`;
    if (hudOpponent && model.opponent) hudOpponent.textContent = `對手: ${model.opponent}`;
    // R23J.1: the duel itself. A fight nobody can see the health of is a fight nobody can play, and
    // this is the first stage in which there is any health to show.
    if (hudDuel && model.duel) {
      const bar = (fraction) => {
        const filled = Math.max(0, Math.min(10, Math.round(fraction * 10)));
        return '█'.repeat(filled) + '·'.repeat(10 - filled);
      };
      const flag = (side) => (side.staggered ? ' 暈眩' : side.alive ? '' : ' 倒下');
      // R23L.1: and under the bars, the player's last swings - what each asked for and what it
      // found - because a probe that lands every swing and a person whose swings do nothing are
      // describing two different runs, and only the page they are both looking at can say which.
      const ledger = model.swingLedger?.hudLines?.length ? `\n${model.swingLedger.hudLines.join('\n')}` : '';
      hudDuel.textContent = `你 ${bar(model.duel.player.fraction)} ${model.duel.player.health}${flag(model.duel.player)}`
        + `   對手 ${bar(model.duel.opponent.fraction)} ${model.duel.opponent.health}${flag(model.duel.opponent)}${ledger}`;
    }
    if (model.swingLedger) {
      copyableSwings = formatSwingLedgerReport({ report: model.swingLedger, context: {
        build: buildVersion(), mode: model.selectedMode, locked: model.lockReport?.locked ?? null,
        weaponMount: model.weaponMount, opponent: model.opponent, duel: model.duel,
        frameTime: frameTimes.report, // R24G.2
      } });
    }
    // Kept current here rather than assembled on the click, so the button copies exactly the run
    // the tester is looking at even if the HUD is folded away.
    if (model.parryTallyReport) {
      copyableReport = [`對手: ${model.opponent || '手動'}`, `Parry 命中: ${model.parryTally || '—'}`, '', model.parryTallyReport];
    }
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
// R20U.1: running. Shift is the movement convention and this is a movement verb; it keeps its
// older job as the arrows' attacker modifier, because the two act on different key sets - Shift
// with the arrows drives the attacker, Shift with WASD runs. Held rather than toggled: a sprint
// you have to remember to turn off is a sprint you die in.
const SPRINT_KEYS = Object.freeze(['ShiftLeft', 'ShiftRight']);

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

// R21N.1: one press that names the direction and is the timed input. Bound alongside F rather
// than replacing it - F is still the guard, and a held guard is still omnidirectional.
function bindDirectionalParry(documentRef, canvas, handlers) {
  if (typeof handlers.onDirectionalParry !== 'function') return;
  const held = new Set();
  const press = (direction, source) => {
    if (held.has(direction)) return;
    held.add(direction);
    handlers.onDirectionalParry(direction, true, source);
  };
  const release = (direction) => {
    if (!held.delete(direction)) return;
    handlers.onDirectionalParry(direction, false);
  };
  documentRef.addEventListener('keydown', (event) => {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    const direction = directionalParryFor(event.code);
    if (!direction) return;
    event.preventDefault();
    press(direction, 'key');
  });
  documentRef.addEventListener('keyup', (event) => {
    const direction = directionalParryFor(event.code);
    if (direction) release(direction);
  });
  // The sector indicator doubles as the buttons, so touch and mouse share the target the eye is
  // already on. Pointer capture keeps a finger that slides off the cell from sticking the guard up.
  for (const cell of canvas?.ownerDocument?.querySelectorAll?.('#guardSector [data-sector]') || []) {
    const direction = directionalParryFor(cell.dataset.sector);
    if (!direction) continue;
    cell.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      cell.setPointerCapture?.(event.pointerId);
      press(direction, 'button');
    });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
      cell.addEventListener(type, () => release(direction));
    }
  }
  documentRef.addEventListener('blur', () => { for (const direction of [...held]) release(direction); });
}

function isParryKey(event) {
  return event?.code === 'KeyF'
    || String(event?.key || '').toLowerCase() === 'f'
    || event?.keyCode === 70;
}

// R20S.3: free look. A drag across the canvas turns the camera when nothing is locked; the entry
// hands this to the player controller, which refuses it while a lock is held.
// R21A.2: where the player is pointing, as offsets from the middle of the view. Bound to the
// CANVAS rather than the document on purpose: moving the cursor off to press a lab button then
// holds the last sector instead of sweeping the guard through two others on the way there. Locked,
// this is the only thing the mouse does - the lock owns the camera, and free look already refuses
// while locked - so it collides with nothing that exists.
function bindGuardAim(canvas, handlers) {
  if (!canvas || typeof handlers.onAim !== 'function') return;
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return;
    handlers.onAim({
      offsetX: event.clientX - (rect.left + rect.width / 2),
      offsetY: event.clientY - (rect.top + rect.height / 2),
      viewportWidth: rect.width,
      viewportHeight: rect.height,
    });
  });
}

// R23H.1 — the attack is the left mouse button, and free look moves out of its way.
//
// The aim was already on the mouse: bindGuardAim follows every pointermove and the HUD draws the
// sector it picks. Putting the swing on a key left the hand holding the aim with nothing to press,
// which is the shape of the question rather than an answer to it.
//
// WHY pointerdown rather than a click, which would be a drag-versus-click threshold and no conflict
// at all: this is the most timing-sensitive input in the game. The parry window it has to be read
// inside is 120ms, and waiting for a release adds a delay the PLAYER controls, so two identical
// intentions would land at different times. An attack fires when the button goes down.
//
// WHICH MEANS free look gives up the left button. That costs nothing in a fight and it is measured
// rather than assumed: free-movement-controller's look() returns immediately while locked, and
// locked is the mode an exchange happens in - so in the fight the left button was already dead.
// Right-drag looks now, which is the other half of the same convention.
//
// Touch keeps the drag it had. A finger has no buttons, and the on-screen pad already carries every
// verb; giving touch an attack is its own change, and this one does not pretend to have made it.
function bindAttack(canvas, handlers) {
  if (!canvas || typeof handlers.onAttack !== 'function') return;
  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch' || event.button !== 0) return;
    event.preventDefault();
    canvas.focus?.({ preventScroll: true });
    handlers.onAttack();
  });
}

function bindFreeLook(canvas, handlers) {
  if (!canvas || typeof handlers.onLook !== 'function') return;
  let dragging = false;
  let lastX = null;
  // The right button opens a context menu by default, which would eat the drag on the first frame.
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch' && event.button !== 2) return;
    dragging = true; lastX = event.clientX;
  });
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

// R24F.1 (#35): the phone's start sequence. The decision lives in src/game/mobile-start.js; this
// reads the pointer and the orientation off the browser, paints the plan, and hands the two
// verbs to the entry: onStart (set the fight up) and onDriveAllowed (the opponent may swing).
// The drive verb is only ever sent from a coarse pointer - on a desktop the drive checkbox is the
// lab's, and the three browser gates depend on it staying so.
function bindStartOverlay({ documentRef, windowRef, elements, handlers }) {
  const runtime = createMobileStartRuntime();
  if (!elements.startOverlay || typeof windowRef.matchMedia !== 'function') return Object.freeze({ runtime, frame: () => runtime.report });
  const coarse = windowRef.matchMedia('(pointer: coarse)');
  const portrait = windowRef.matchMedia('(orientation: portrait)');
  const environment = () => paint(runtime.setEnvironment({ coarse: coarse.matches === true, portrait: portrait.matches === true }));
  let driveAllowed = null;
  function paint(plan) {
    const overlay = elements.startOverlay;
    overlay.hidden = !plan.visible;
    overlay.dataset.kind = plan.kind ?? '';
    elements.startCount.textContent = plan.count == null ? '' : String(plan.count);
    if (coarse.matches && plan.driveAllowed !== driveAllowed) { driveAllowed = plan.driveAllowed; handlers.onDriveAllowed?.(driveAllowed); }
    return plan;
  }
  coarse.addEventListener?.('change', environment);
  portrait.addEventListener?.('change', environment);
  elements.startButton.addEventListener('click', () => {
    if (!runtime.report.visible) return;
    handlers.onStart?.();
    const pressed = runtime.press();
    if (!pressed.accepted) return;
    paint(pressed.plan);
    // Best effort: Android in fullscreen honours it, iOS Safari has no such call. The rotate
    // prompt is the rule; this only spares a person who did rotate from being asked again.
    try { windowRef.screen?.orientation?.lock?.('landscape')?.catch?.(() => {}); } catch { /* not lockable here */ }
  });
  elements.labToggle.addEventListener('click', () => documentRef.body.classList.toggle('lab-open'));
  environment();
  // R24G.2: the entry's delta is the frame clock's, clamped at 50ms and pinned by the gates; the
  // wall clock is what a phone actually did, so it is read here rather than trusted.
  let lastWallMs = null;
  return Object.freeze({ runtime, frame: (deltaMs, duelOver) => {
    const now = windowRef.performance?.now?.();
    if (Number.isFinite(now)) { if (lastWallMs != null) frameTimes.push(now - lastWallMs); lastWallMs = now; }
    return paint(runtime.advance(deltaMs, { duelOver }));
  } });
}

// R24J.1 (#40) - the phone's controls: the left thumb steers and names the direction, the right
// thumb acts. The arithmetic is in src/game/touch-stick.js; this is the DOM half.
//
// Two rules earn their place here. The direction is read AT THE PRESS - measured at zero frames,
// where a swipe would have cost 30-60ms of a 120ms parry window - and it is only read while an
// action is being taken, so a thumb pushed forward to close the distance never restates the
// guard's sector. And a refused press now says why: 45% of a person's attack presses did nothing
// at all, with nothing on screen to say so.
const TOUCH_REFUSAL_TEXT = Object.freeze({
  'the-opponent-is-mid-exchange': '對手正在出手',
  'still-being-struck': '你正被打中',
  'staggered-or-down': '你暈眩中',
  'already-swinging': '你正在揮刀',
  'still-recovering': '收刀中',
  'your-last-exchange-has-not-cleared': '上一刀還沒結算',
  'not-ready': '尚未就緒',
});

function bindTouchControls({ documentRef, windowRef, elements, handlers }) {
  const zone = elements.touchStickZone;
  const base = elements.touchStick;
  const knob = elements.touchStickKnob;
  const notice = elements.touchNotice;
  if (!zone || !base || !knob) return null;
  let pointerId = null;
  let origin = null;
  let plan = null;
  let guardHeld = false;
  let noticeTimer = null;
  // R24J.2: the ring is bottom-anchored at home and centred on the thumb while it is held, so the
  // grab swaps which edge it is pinned to and the release hands it back to the stylesheet.
  const goHome = () => { base.style.left = ''; base.style.top = ''; base.style.bottom = ''; base.style.transform = ''; };
  const followThumb = (x, y) => { base.style.left = `${x}px`; base.style.top = `${y}px`; base.style.bottom = 'auto'; base.style.transform = 'translate(-50%, -50%)'; };

  // The label on the buttons, so a player can see that these verbs have a direction at all - the
  // discoverable half of a swipe, without the swipe's cost. The glyph follows the stick's dominant
  // axis; the sector itself is decided by the aim planner, which adds hysteresis this does not.
  const glyphOf = () => (plan?.naming
    ? (Math.abs(plan.knob.y) >= Math.abs(plan.knob.x) ? '▲' : (plan.knob.x > 0 ? '▶' : '◀'))
    : '自動');
  function paint() {
    const at = plan ? plan.knob : { x: 0, y: 0 };
    knob.style.transform = `translate(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px)`;
    const glyph = glyphOf();
    for (const id of ['touchAttack', 'touchGuard']) {
      const label = elements[id]?.querySelector('small');
      if (label) label.textContent = glyph;
    }
  }
  function publishMove() {
    handlers.onDefenderIntent?.(plan ? plan.laneIntent : 0);
    handlers.onDefenderLateralIntent?.(plan ? plan.lateralIntent : 0);
  }
  function say(text) {
    if (!notice) return;
    notice.textContent = text;
    notice.hidden = false;
    if (noticeTimer) windowRef.clearTimeout(noticeTimer);
    noticeTimer = windowRef.setTimeout(() => { notice.hidden = true; }, 900);
  }
  // The sector, named the instant it is needed and never in between.
  function aimNow() {
    if (plan?.aim) handlers.onAim?.(plan.aim);
  }
  function release() {
    pointerId = null; origin = null; plan = null;
    zone.classList.remove('holding');
    goHome();
    publishMove(); paint();
  }
  zone.addEventListener('pointerdown', (event) => {
    if (pointerId != null) return;
    event.preventDefault();
    pointerId = event.pointerId;
    try { zone.setPointerCapture(event.pointerId); } catch { /* capture is best-effort */ }
    const rect = zone.getBoundingClientRect();
    origin = { x: event.clientX, y: event.clientY };
    followThumb(event.clientX - rect.left, event.clientY - rect.top);
    zone.classList.add('holding');
    plan = planTouchStick({ originX: origin.x, originY: origin.y, pointerX: event.clientX, pointerY: event.clientY });
    publishMove(); paint();
  });
  zone.addEventListener('pointermove', (event) => {
    if (pointerId !== event.pointerId || !origin) return;
    event.preventDefault();
    plan = planTouchStick({ originX: origin.x, originY: origin.y, pointerX: event.clientX, pointerY: event.clientY });
    publishMove(); paint();
    // A guard already up follows the thumb: the sector it will answer with is live while it is held.
    if (guardHeld) aimNow();
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
    zone.addEventListener(type, (event) => { if (pointerId === event.pointerId) release(); });
  }
  const actions = {
    attack: () => { aimNow(); const refusal = handlers.onAttack?.(); if (refusal) say(TOUCH_REFUSAL_TEXT[refusal] || String(refusal)); },
    guard: () => { aimNow(); guardHeld = true; handlers.onGuardKey?.(true); },
    dodge: () => { handlers.onDodge?.(plan?.dodgeDirection ?? 'back'); },
  };
  documentRef.querySelectorAll('[data-touch-action]').forEach((button) => {
    const action = button.dataset.touchAction;
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      try { button.setPointerCapture(event.pointerId); } catch { /* capture is best-effort */ }
      actions[action]?.();
    });
    const up = () => { if (action === 'guard' && guardHeld) { guardHeld = false; handlers.onGuardKey?.(false); } };
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) button.addEventListener(type, up);
    button.addEventListener('contextmenu', (event) => event.preventDefault());
  });
  paint();
  return Object.freeze({ get plan() { return plan; }, get guardHeld() { return guardHeld; } });
}

export function bindShieldParryLabUiEvents({
  documentRef,
  windowRef,
  canvas,
  elements,
  handlers,
}) {
  bindAttack(canvas, handlers);
  bindFreeLook(canvas, handlers);
  bindGuardAim(canvas, handlers);
  bindDirectionalParry(documentRef, canvas, handlers);
  let sprintHeld = false;
  function publishSprint(held) {
    if (held === sprintHeld) return;
    sprintHeld = held;
    handlers.onSprint?.(sprintHeld);
  }
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
    if (SPRINT_KEYS.includes(event.code)) { publishSprint(true); return; }
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
    // R23G.1: the attack, on a key. R23H.1 gave it the left mouse button, which is where the aim
    // already was and where this genre puts it - K stays as the keyboard alternative, for a hand
    // that is not on the mouse and for probes that would rather press a key than aim one.
    if (event.code === 'KeyK' && !event.repeat) {
      event.preventDefault();
      handlers.onAttack?.();
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
    if (SPRINT_KEYS.includes(event.code)) { publishSprint(false); return; }
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
    publishSprint(false); // a key held into a lost window never reports its keyup
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
  // R24F.2 (#36): the thumb's blade. Measured before: a touch on the canvas did nothing at all - no
  // swing, no refusal - because bindAttack returns for touch pointers, and the panel's direction
  // buttons are the lab's. The same handler the mouse button calls, on the same edge: pointerdown,
  // measured on the mouse path as active on the very frame of the press. One touch is one swing
  // because the permission gate refuses a second start while the first is live.
  documentRef.querySelectorAll('[data-attack-touch]').forEach((button) => {
    button.addEventListener('pointerdown', (event) => { event.preventDefault(); handlers.onAttack?.(); });
    button.addEventListener('contextmenu', (event) => event.preventDefault());
  });
  canvas.addEventListener('pointerdown', () => canvas.focus({ preventScroll: true }));
  elements.showSurface.addEventListener('change', () => handlers.onShowSurface(elements.showSurface.checked));
  windowRef.addEventListener('resize', handlers.onResize);
  handlers.onView('three');
  handlers.onResize();
  return Object.freeze({
    startOverlay: bindStartOverlay({ documentRef, windowRef, elements, handlers }), // R24F.1
    touch: bindTouchControls({ documentRef, windowRef, elements, handlers }), // R24J.1
  });
}
