import { GUARD_INTENT_AGE_MS } from '../../src/combat/contact-lifecycle-director.js';
import { GUARD_EVENTS, GUARD_STATES, createGuardStateMachine } from '../../src/combat/guard-state-machine.js';
import { createGuardPresentationRuntime } from '../../src/combat/guard-presentation-runtime.js';
import { createLongswordDirectionalAttackRuntime, LONGSWORD_ATTACK_PHASES } from '../../src/combat/longsword-directional-attack-runtime.js';
import { captureRigPose, applyRigPose, blendRecoveryPose } from '../../src/combat/guard-recovery-bridge.js';
import { sampleLongswordAttackRecovery } from '../../src/combat/longsword-contact-recovery-presentation.js';
import {
  measureSweptSwordBucklerClosestApproach,
} from '../../src/combat/swept-sword-buckler-contact.js?v=g43b5r281-residual-body-reach-r18';
import { buildParryWhiffDiagnostic } from '../../src/combat/parry-whiff-diagnostic.js?v=g43b5r281-residual-body-reach-r18';
import { createGuardThreatTrackingRuntime, planGuardThreatCorrection } from '../../src/combat/guard-threat-tracking.js?v=g43b5r281-residual-body-reach-r18';
import { createGuardResidualBodyReachRuntime } from '../../src/combat/guard-residual-body-reach.js?v=g43b5r281-residual-body-reach-r18';
import {
  GUARD_RESIDUAL_STANCE_REACH_PROFILE,
  createGuardResidualStanceReachRuntime,
} from '../../src/combat/guard-residual-stance-reach.js?v=g43b5r281-debug-low-stance-controls-r18e';
import { planFineGuardTracking } from '../../src/combat/directional-guard-bracing.js';
import { createArticulatedImpactBracingRuntime, planArticulatedImpactBracing } from '../../src/combat/articulated-impact-bracing.js';
import {
  analyzePredictiveInterceptParry,
  createPredictiveInterceptParryPresentationRuntime,
} from '../../src/combat/predictive-intercept-parry.js?v=g43b5r281-parry-sync-r2';
import { sampleActiveShieldLeadMotion } from '../../src/combat/active-shield-lead-parry.js?v=g43b5r281';
import { createActiveParryInterceptIntent } from '../../src/combat/active-parry-intercept-intent.js?v=r18n1';
import {
  TWO_ACTOR_PARRY_REACTION_CHANNELS,
  TWO_ACTOR_PARRY_REACTION_PHASE_LATCHES,
  createTwoActorCombatIntegration,
} from '../../src/combat/two-actor-combat-integration.js?v=g43b5r281-step3b-body-fusion-r18o';
import {
  LEGACY_TWO_ACTOR_RECOIL_PASSTHROUGH_STAGE,
  publishPostCouplingRecoilStaggerHandoff,
} from '../../src/combat/post-coupling-recoil-stagger-handoff.js';
import {
  COMMITTED_PARRY_CONTACT_GATE_STAGE,
  createCommittedParryContactGate,
  evaluateCommittedParryInput,
} from '../../src/combat/committed-parry-contact-gate.js?v=g43b5r281-step2-timing-authority-r5';
import {
  LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE,
  createLiveShieldSwordGripContactRuntime,
} from '../../src/combat/live-shield-sword-grip-contact-constraint.js?v=g43b5r281-closed-loop-old-b3-r18i5';
import {
  sampleLiveParryOldB3ReleaseBlend,
} from '../../src/combat/live-parry-old-b3-handoff.js?v=g43b5r281-closed-loop-old-b3-r18i5';
import {
  measureAttackerRecoilWorldSilhouette,
} from '../../src/combat/attacker-recoil-world-silhouette.js?v=g43b5r281-closed-loop-old-b3-r18i5';
import { maybeStartParryGateProbe } from './shield-parry-r281/parry-gate-probe.js';
import {
  compactInterceptDriveTelemetry,
  compactInterceptDriveTraceFrame,
  compactPredictiveAnalysis,
  compactParryGateAttempt,
  compactReachableInterceptTarget,
} from './shield-parry-r281/diagnostic-telemetry.js';
import {
  formatInspectionFailureSummary,
  formatTerminalState,
  formatWhiffDiagnostic,
} from './shield-parry-r281/diagnostic-formatters.js';
import { serializeVerificationReport } from './shield-parry-r281/report-serialization.js';
import { buildShieldParryVerificationReport } from './shield-parry-r281/verification-report.js';
import { createShieldParryLabDom } from './shield-parry-r281/lab-dom.js';
import { createStanceDebugController } from './shield-parry-r281/stance-debug-controls.js';
import { createShieldParryLabUi, bindShieldParryLabUiEvents } from './shield-parry-r281/lab-ui.js';
import {
  createShieldParryExchangeState,
  resetShieldParryExchangeState,
} from './shield-parry-r281/exchange-state.js';
import { createShieldParryPreContactController } from './shield-parry-r281/pre-contact-controller.js';
import { createShieldParryContactHandoffController } from './shield-parry-r281/contact-handoff-controller.js';
import { createShieldParryLabScene } from './shield-parry-r281/lab-scene.js';
import { cloneSurface, magnitude, createBladePolylineSampler } from './shield-parry-r281/lab-geometry.js';
import { createShieldParryFrameReporting } from './shield-parry-r281/frame-reporting.js';
import { createShieldParryLaneController } from './shield-parry-r281/lane-controller.js';
import { createShieldParryInspectionOverlay } from './shield-parry-r281/inspection-overlay.js';
import { createAttackerPresentationAdapter } from './shield-parry-r281/attacker-presentation.js';
import { createDirectOldB3DiagnosticController } from './shield-parry-r281/direct-old-b3-diagnostic.js';
import { ATTACKER_WALK_CLIPS, bootstrapShieldParryLabAssets } from './shield-parry-r281/lab-bootstrap.js';
import { createNeutralStanceController } from './shield-parry-r281/neutral-stance.js';
import { createBodyStrikeReactionController } from './shield-parry-r281/body-strike-reaction-controller.js';
import { createShieldParryDebugApi } from './shield-parry-r281/debug-api.js';

const LAB_STAGE = LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE;
const RECOIL_STAGE = LEGACY_TWO_ACTOR_RECOIL_PASSTHROUGH_STAGE;
const THREE = window.THREE;
if (!THREE?.WebGLRenderer || !THREE?.GLTFLoader) throw new Error(`${LAB_STAGE} requires Three.js r128 + GLTFLoader`);

const HUD_INTERVAL_MS = 50; const REPORT_INTERVAL_MS = 240;
const MAX_REPORT_DOM_CHARACTERS = 60000;
const RECENT_COMPACT_TRACE_FRAMES = 8;
const PARRY_REVIEW_RATE = 0.12;
const PARRY_PROMPT_HOLD_MS = 1500;
const DEBUG_QUERY = new URLSearchParams(window.location.search);
const DEBUG_MODE = DEBUG_QUERY.get('debug') === '1';

const labScene = createShieldParryLabScene({
  THREE, documentRef: document, windowRef: window,
  separationMeters: DEBUG_QUERY.has('spacing') ? Number(DEBUG_QUERY.get('spacing')) : undefined,
});
const {
  canvas, renderer, scene, camera, freeCamera, attacker, defender, attackerSword, buckler, resize, setView,
} = labScene;
const inspectionOverlay = createShieldParryInspectionOverlay({ THREE, scene });
let defenderSword = null;

const attackRuntime = createLongswordDirectionalAttackRuntime();
const guardMachine = createGuardStateMachine();
const guardRuntime = createGuardPresentationRuntime(THREE, { machine: guardMachine, character: defender });
const bracingRuntime = createArticulatedImpactBracingRuntime(THREE, { rig: defender.rig, buckler });
const fineTrackingRuntime = createGuardThreatTrackingRuntime(THREE, { rig: defender.rig, buckler });
const residualBodyReachRuntime = createGuardResidualBodyReachRuntime(THREE, { rig: defender.rig, buckler });
const residualStanceReachRuntime = createGuardResidualStanceReachRuntime(THREE, { rig: defender.rig, buckler });
const predictivePresentation = createPredictiveInterceptParryPresentationRuntime(THREE, { character: defender });
const activeParryInterceptIntent = createActiveParryInterceptIntent();
const parryGate = createCommittedParryContactGate();
const laneController = createShieldParryLaneController({ // R18Z.1: steps, feet, and the ground ledger
  labScene, walkClips: ATTACKER_WALK_CLIPS, services: { captureRigPose, applyRigPose } });
const exchangeState = createShieldParryExchangeState();
const neutralStance = createNeutralStanceController({
  defender, camera, readGuardState: () => guardMachine.state,
});
const bodyStrikeReaction = createBodyStrikeReactionController({ defender, camera }); // R19K.1

const attackerPresentation = createAttackerPresentationAdapter({
  THREE,
  attacker,
  camera,
  exchangeState,
  services: {
    captureRigPose,
    applyRigPose,
    blendRecoveryPose,
    sampleLongswordAttackRecovery,
    sampleLiveParryOldB3ReleaseBlend,
  },
});

const combat = createTwoActorCombatIntegration({
  THREE,
  attackerCharacter: attacker,
  attackRuntime,
  guardMachine,
  parrySync: {
    presentationOffsetSeconds: 0.205,
    parryAttackerRecoilDelayMs: 0,
  },
  sampleFrozenContactPose(interruption) {
    attackerPresentation.sampleFrozenContactPose(interruption, {
      ownsLiveContact: contactHandoffController.ownsLiveContact(),
    });
  },
});
const swordGripConstraint = createLiveShieldSwordGripContactRuntime(THREE, {
  attackerRig: attacker.rig,
  attackerSword,
});

const uiElements = createShieldParryLabDom(document);
const { status, reportNode, autoRepeat, slowReview, showSurface } = uiElements;
const stanceDebug = createStanceDebugController({
  documentRef: document,
  windowRef: window,
  debugMode: DEBUG_MODE,
  debugQuery: DEBUG_QUERY,
  profileDefaults: GUARD_RESIDUAL_STANCE_REACH_PROFILE,
  elements: uiElements,
});
const debugStanceProfile = stanceDebug.profile;
const refreshDebugStanceProfile = (syncUrl = true) => stanceDebug.refresh(syncUrl);
const resetDebugStanceDefaults = () => stanceDebug.resetDefaults();
stanceDebug.initialize();
const labUi = createShieldParryLabUi(uiElements);

let ready = false;
let selectedDirection = 'right';
let selectedMode = null; // R19I.1: chosen, never assumed
let lastTimestamp = performance.now();
let attackerIdleDuration = 1;
let attackerIdleClockSeconds = 0;
let attackerRecovery = null;
let repeatCooldownMs = 0;
let previousBlade = null;
let hudClockMs = HUD_INTERVAL_MS;
let reportClockMs = REPORT_INTERVAL_MS;

const preContactController = createShieldParryPreContactController({
  exchangeState,
  buckler,
  defender,
  camera,
  bracingRuntime,
  fineTrackingRuntime,
  residualBodyReachRuntime,
  residualStanceReachRuntime,
  predictivePresentation,
  activeInterceptIntent: activeParryInterceptIntent,
  parryGate,
  longswordAttackPhases: LONGSWORD_ATTACK_PHASES,
  promptHoldMs: PARRY_PROMPT_HOLD_MS,
  debugMode: DEBUG_MODE,
  readContext: () => ({
    selectedMode,
    slowReviewChecked: slowReview.checked,
    previousBlade,
    defenderSword,
    debugStanceProfile,
    separationMeters: laneController.separationMeters, defenderFacingErrorRadians: laneController.defenderFacingErrorRadians, // R19N.1 relevance + R19Z.1 cone gate read the live lane
  }),
  services: {
    cloneSurface,
    magnitude,
    planArticulatedImpactBracing,
    planFineGuardTracking,
    analyzePredictiveInterceptParry,
    evaluateCommittedParryInput,
    measureSweptSwordBucklerClosestApproach,
    planGuardThreatCorrection,
    sampleActiveShieldLeadMotion,
    compactInterceptDriveTraceFrame,
    compactInterceptDriveTelemetry,
  },
});

const contactHandoffController = createShieldParryContactHandoffController({
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
  services: {
    measureAttackerRecoilWorldSilhouette,
  },
  callbacks: {
    onBodyStruck: (bodyContact) => bodyStrikeReaction.start(bodyContact), // R19K.1
    captureCanonicalAttackerOldB3Base: () => attackerPresentation.captureCanonicalOldB3Base(attackRuntime.snapshot.interruption),
    captureAttackerWorldSilhouette: () => attackerPresentation.captureWorldSilhouette(),
    updateLiveContactMarkers: (report) => inspectionOverlay.update(report),
    formatInspectionFailureSummary,
    publishStatus({ text, className }) {
      status.textContent = text;
      status.className = className;
    },
  },
});

const directOldB3DiagnosticController = createDirectOldB3DiagnosticController({
  THREE,
  exchangeState,
  attacker,
  attackerSword,
  attackRuntime,
  combat,
  guardRuntime,
  camera,
  buckler,
  timingAgeMs: GUARD_INTENT_AGE_MS.parry,
  services: {
    captureRigPose,
    publishPostCouplingRecoilStaggerHandoff,
  },
  readContext: () => ({ ready, selectedDirection }),
  callbacks: {
    disableAutoRepeat: () => { autoRepeat.checked = false; },
    clearAttackerRecovery: () => { attackerRecovery = null; },
    enterGuard,
    setSelectedDirection: (direction) => { selectedDirection = direction; },
    resetExchange,
    sampleAttackerBase,
    captureCanonicalOldB3Base: (interruption) => attackerPresentation.captureCanonicalOldB3Base(interruption),
    publishStatus({ text, className }) {
      status.textContent = text;
      status.className = className;
    },
    // Bound lazily on purpose: the reporting is constructed below because it needs this very
    // controller, so the binding cannot exist yet. The arrow is only ever called after both do.
    buildReport: (combatSnapshot) => buildReport(combatSnapshot),
  },
});

const captureBladePolyline = createBladePolylineSampler(THREE, attackerSword);

// Gathering only, and constructed here because every accessor below reads a `let` this file owns.
const { updateParryCue, updateHud, buildReport } = createShieldParryFrameReporting({
  labUi,
  exchangeState,
  documentRef: document,
  windowRef: window,
  reportNode,
  runtimes: { combat, attackRuntime, parryGate, freeCamera, contactHandoffController, labScene },
  services: { buildShieldParryVerificationReport, serializeVerificationReport },
  constants: {
    labStage: LAB_STAGE,
    recoilStage: RECOIL_STAGE,
    parryReviewRate: PARRY_REVIEW_RATE,
    maxReportCharacters: MAX_REPORT_DOM_CHARACTERS,
    recentCompactTraceFrames: RECENT_COMPACT_TRACE_FRAMES,
    liveContactPhaseLatch: TWO_ACTOR_PARRY_REACTION_PHASE_LATCHES.LIVE_CONTACT_IMPULSE_PEAK,
    debugMode: DEBUG_MODE,
  },
  read: {
    ready: () => ready,
    selectedMode: () => selectedMode,
    selectedDirection: () => selectedDirection,
    debugStanceProfile: () => debugStanceProfile,
    parryReviewActive: (snapshot) => isParryPreContactReviewActive(snapshot),
  },
});

function enterGuard() {
  guardMachine.send(GUARD_EVENTS.RESET, { stage: LAB_STAGE }); guardRuntime.sync(camera);
  guardMachine.send(GUARD_EVENTS.GUARD_PRESS, { stage: LAB_STAGE }); guardRuntime.sync(camera);
  const report = guardRuntime.update(180, camera);
  if (report.snapshot.state !== GUARD_STATES.HOLD) throw new Error(`Expected Guard Hold, got ${report.snapshot.state}`);
}
function beginAttackRecovery(direction) {
  attackerRecovery = attackerPresentation.createRecovery(direction);
  attackerIdleClockSeconds = 0;
}
function sampleAttackerBase(snapshot, deltaMs) {
  const presentationState = attackerPresentation.sampleBase({
    snapshot,
    deltaMs,
    recovery: attackerRecovery,
    idleClockSeconds: attackerIdleClockSeconds,
    idleDuration: attackerIdleDuration,
    walkSample: laneController.attackerWalkSample,
  });
  attackerRecovery = presentationState.recovery;
  attackerIdleClockSeconds = presentationState.idleClockSeconds;
}
function resetExchange() {
  laneController.endExchange();
  parryGate.reset();
  swordGripConstraint.reset();
  bracingRuntime.resetImpact(); fineTrackingRuntime.reset();
  residualBodyReachRuntime.reset(); residualStanceReachRuntime.reset();
  predictivePresentation.reset(); contactHandoffController.resetRootDisplacement();
  preContactController.resetActiveIntercept();
  resetShieldParryExchangeState(exchangeState, {
    previousShieldLeadSurface: cloneSurface(buckler.getWorldParrySurface()),
  });
  inspectionOverlay.clear();
}

function triggerParryNow(source = 'button') {
  if (!ready) {
    exchangeState.latestParryInput = Object.freeze({ accepted: false, reason: 'lab-not-ready', source });
    status.textContent = 'PARRY INPUT REJECTED · lab-not-ready';
    status.className = 'bad';
    return exchangeState.latestParryInput;
  }
  if (selectedMode !== 'parry') {
    exchangeState.latestParryInput = Object.freeze({ accepted: false, reason: 'select-parry-mode-first', source });
    status.textContent = 'PARRY INPUT REJECTED · select-parry-mode-first';
    status.className = 'bad';
    return exchangeState.latestParryInput;
  }

  const snapshot = attackRuntime.snapshot;
  exchangeState.latestParryInput = parryGate.arm({
    attackSnapshot: snapshot,
    predictiveAnalysis: exchangeState.latestPredictiveAnalysis,
    manual: true,
    source,
  });

  if (exchangeState.latestParryInput.accepted) {
    exchangeState.whiffProbeFrames = 0;
    exchangeState.closestWhiffApproach = null;
    exchangeState.outsideActiveContact = null;
    exchangeState.latestReachableInterceptTarget = null;
    exchangeState.latestInterceptDriveReport = null;
    exchangeState.interceptDriveTrace = [];
    preContactController.armActiveIntercept(snapshot);
    predictivePresentation.start({
      sequence: snapshot.sequence,
      requestedGrade: 'parry',
      triggerTtcSeconds: exchangeState.latestParryInput.timeToContactSeconds,
    });
    const trackingDistance = exchangeState.latestParryInput.requiredShieldTravelMeters == null
      ? 'path pending'
      : `${(exchangeState.latestParryInput.requiredShieldTravelMeters * 100).toFixed(1)}cm${exchangeState.latestParryInput.gates.trackingClamped ? ' → CLAMPED' : ''}`;
    status.textContent = `PARRY ARMED · TTC ${(exchangeState.latestParryInput.timeToContactSeconds * 1000).toFixed(0)}ms · tracking ${trackingDistance} · waiting for real Sword × Shield contact`;
    status.className = 'good';
  } else {
    status.textContent = `PARRY REJECTED · ${exchangeState.latestParryInput.reason}`;
    status.className = 'bad';
  }
  buildReport();
  return exchangeState.latestParryInput;
}

function dispatchParryInput(source, event = null) {
  exchangeState.latestInputSignal = Object.freeze({
    source,
    code: event?.code || null,
    key: event?.key || null,
    sequence: attackRuntime.snapshot.sequence,
    elapsedSeconds: attackRuntime.snapshot.elapsedSeconds,
  });
  labUi.flashParryInput();
  const result = triggerParryNow(source);
  exchangeState.parryPromptHold = null;
  labUi.setInputReceipt(source, result);
  updateParryCue(attackRuntime.snapshot);
  return result;
}

function forceOldTwoActorB3(direction = selectedDirection) {
  return directOldB3DiagnosticController.run(direction);
}
function startAttack(direction = selectedDirection) {
  if (!ready || combat.active || attackRuntime.active || attackerRecovery) return false;
  if (selectedMode && guardMachine.state !== GUARD_STATES.HOLD) enterGuard();
  selectedDirection = direction;
  resetExchange();
  previousBlade = captureBladePolyline();
  repeatCooldownMs = 0;
  const started = combat.startAttack(direction);
  if (!started.accepted) return false;
  laneController.startAttack(direction, attackRuntime.snapshot?.action?.runtime?.contactSeconds);
  status.textContent = `ATTACK ${direction.toUpperCase()} · wait for committed YES, then press PARRY NOW or F`;
  status.className = 'warn';
  document.querySelectorAll('[data-attack]').forEach((button) => button.classList.toggle('active', button.dataset.attack === direction));
  return true;
}
function restartAttack(direction = selectedDirection) {
  if (!ready) {
    status.textContent = 'RETRY REJECTED · lab-not-ready';
    status.className = 'bad';
    return false;
  }
  combat.reset();
  attackerRecovery = null;
  if (selectedMode) enterGuard();
  const started = startAttack(direction);
  if (started) {
    hudInput.textContent = 'NEW ATTACK · input available · wait for PARRY NOW prompt';
    updateParryCue(attackRuntime.snapshot);
  }
  return started;
}
function setMode(mode) {
  if (!['block', 'parry'].includes(mode)) return;
  selectedMode = mode;
  // R19I.1: choosing a defence is what raises the guard - before that both fighters just stand.
  if (guardMachine.state === GUARD_STATES.NEUTRAL) enterGuard();
  if (mode !== 'parry') {
    exchangeState.parryPromptHold = null;
    residualBodyReachRuntime.reset();
    residualStanceReachRuntime.reset();
  }
  document.querySelectorAll('[data-mode]').forEach((button) => button.classList.toggle('active', button.dataset.mode === mode));
}
function isParryPreContactReviewActive(snapshot = attackRuntime.snapshot) {
  const contactSeconds = snapshot?.action?.runtime?.contactSeconds;
  return selectedMode === 'parry'
    && slowReview.checked
    && !exchangeState.firstContact
    && Number.isFinite(contactSeconds)
    && snapshot.elapsedSeconds < contactSeconds;
}


function resolveContact(snapshot, currentBlade, deltaSeconds) {
  const resolved = contactHandoffController.resolveContact(snapshot, currentBlade, deltaSeconds, {
    previousBlade,
    selectedMode,
    selectedDirection,
  });
  const settled = laneController.settle(exchangeState.latestCombatResult?.resolution?.outcome);
  if (settled) exchangeState.latestEngagementGround = settled;
  return resolved;
}

async function main() {
  status.textContent = `Loading UAL attacks + Skyrim Guard + ${LAB_STAGE}…`;
  const bootstrap = await bootstrapShieldParryLabAssets({
    THREE,
    attacker,
    defender,
    labStage: LAB_STAGE,
  });
  attackerIdleDuration = bootstrap.attackerIdleDuration;
  laneController.setWalkDurations({ forward: bootstrap.walkForwardDuration, backward: bootstrap.walkBackwardDuration });
  neutralStance.setIdleDuration(bootstrap.defenderIdleDuration);
  defenderSword = bootstrap.defenderSword;
  exchangeState.previousShieldLeadSurface = cloneSurface(buckler.getWorldParrySurface());
  ready = true;
  status.textContent = `${LAB_STAGE} READY · both fighters idle · choose BLOCK or PARRY, then an attack direction`;
  status.className = 'good';
  buildReport();
}

bindShieldParryLabUiEvents({
  documentRef: document,
  windowRef: window,
  canvas,
  elements: uiElements,
  handlers: {
    onAttack: (direction) => startAttack(direction),
    onMode: (mode) => setMode(mode),
    onView: (view) => setView(view),
    onForceOldB3: () => forceOldTwoActorB3(selectedDirection),
    onParryInput: (inputSource, event) => dispatchParryInput(inputSource, event),
    onRetryAttack: () => restartAttack(selectedDirection),
    onDebugApplyRetry: () => restartAttack(selectedDirection),
    onDebugResetDefaults: resetDebugStanceDefaults,
    onDefenderIntent: (intent) => laneController.setDefenderIntent(intent), onAttackerIntent: (intent) => laneController.setAttackerIntent(intent),
    onDefenderLateralIntent: (intent) => laneController.setDefenderLateralIntent(intent), // R19V.1 A/D
    onShowSurface: (checked) => buckler.setParrySurfaceVisible(checked),
    onResize: resize,
  },
});

function frame(timestamp) {
  const rawDeltaMs = Math.min(50, Math.max(0, timestamp - lastTimestamp));
  const preUpdateSnapshot = attackRuntime.snapshot;
  const parryReviewActive = isParryPreContactReviewActive(preUpdateSnapshot);
  const holdingParryPrompt = parryReviewActive
    && exchangeState.parryPromptHold?.sequence === preUpdateSnapshot.sequence
    && !parryGate.attempt;
  if (holdingParryPrompt) {
    exchangeState.parryPromptHold.remainingRealMs -= rawDeltaMs;
    if (exchangeState.parryPromptHold.remainingRealMs <= 0) exchangeState.parryPromptHold = null;
  }
  const reviewRate = parryReviewActive ? PARRY_REVIEW_RATE : 1;
  const deltaMs = holdingParryPrompt ? 0 : rawDeltaMs * reviewRate;
  const deltaSeconds = Math.max(1e-5, deltaMs / 1000);
  lastTimestamp = timestamp;
  freeCamera.update(rawDeltaMs / 1000);
  laneController.walk(rawDeltaMs / 1000, exchangeState.latestGuardFacingPlan); // real seconds; R19Q.1 facing plan rides along
  if (ready) {
    const snapshot = attackRuntime.update(deltaMs);

    if (parryGate.armed && !snapshot.action && !exchangeState.firstContact && !exchangeState.latestParryWhiff) {
      exchangeState.latestParryWhiff = buildParryWhiffDiagnostic({
        sequence: parryGate.attempt?.sequence ?? null,
        direction: selectedDirection,
        probeFrames: exchangeState.whiffProbeFrames,
        closestApproachRecord: exchangeState.closestWhiffApproach,
        outsideActiveContact: exchangeState.outsideActiveContact,
        predictiveAnalysis: exchangeState.latestPredictiveAnalysis,
        finePlan: exchangeState.latestFinePlan,
        fineTracking: exchangeState.latestFineTracking,
        shieldLeadMotion: exchangeState.latestShieldLeadMotion,
        parryInput: exchangeState.latestParryInput,
      });
      const whiff = formatWhiffDiagnostic(exchangeState.latestParryWhiff, { debugMode: DEBUG_MODE });
      status.textContent = `PARRY WHIFF · ${whiff.label} · ${whiff.detail}`;
      status.className = 'bad';
    }

    laneController.update(snapshot.elapsedSeconds, Boolean(snapshot.action));

    const contactFrame = contactHandoffController.updateCombatBeforeGuard({
      deltaSeconds,
      deltaMs,
      selectedDirection,
      hasAttackerRecovery: Boolean(attackerRecovery),
      beginAttackRecovery,
    });
    if (!contactFrame.handledCombat) sampleAttackerBase(snapshot, deltaMs);

    laneController.sampleDefenderWalk(!attackRuntime.active && !combat.active);
    guardRuntime.update(deltaMs, camera);
    neutralStance.sample(deltaMs); // R19I.1: no-op unless the guard is neutral
    laneController.overlayDefenderWalkLegs();
    bodyStrikeReaction.sample(deltaMs); // R19K.1: last writer - a landed blade owns the fighter
    contactHandoffController.updateDefenderDeflectReleaseGate();
    contactHandoffController.updateLiveConstraintAfterGuard({
      deltaSeconds,
      selectedDirection,
      needsUpdate: contactFrame.liveConstraintNeedsUpdate,
    });
    attackerSword.update(); defenderSword?.update(); contactHandoffController.recordVisibleOldB3Sample(exchangeState.latestCombatUpdate);

    if (!exchangeState.firstContact) {
      const currentBlade = captureBladePolyline();
      preContactController.update(snapshot, currentBlade, deltaSeconds);
      resolveContact(snapshot, currentBlade, deltaSeconds);
      previousBlade = currentBlade;
    }
    updateParryCue(snapshot);

    const combatSnapshot = combat.snapshot;
    hudClockMs += deltaMs; reportClockMs += deltaMs;
    if (hudClockMs >= HUD_INTERVAL_MS) { hudClockMs %= HUD_INTERVAL_MS; updateHud(snapshot, combatSnapshot); }
    if (reportClockMs >= REPORT_INTERVAL_MS) { reportClockMs %= REPORT_INTERVAL_MS; buildReport(combatSnapshot); }

    if (!combat.active && !attackRuntime.active && !attackerRecovery && guardMachine.state === GUARD_STATES.HOLD && autoRepeat.checked) {
      repeatCooldownMs += deltaMs;
      if (repeatCooldownMs >= 700) startAttack(selectedDirection);
    }
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
main().catch((error) => {
  document.documentElement.dataset.g43b5r281 = 'fail';
  status.textContent = `${LAB_STAGE} FAIL · ${error?.message || error}`;
  status.className = 'bad';
  reportNode.textContent = error?.stack || String(error);
  window.__G43B5R281_RESULT__ = { stage: LAB_STAGE, pass: false, error: error?.stack || String(error) };
});

window.__G43B5R281_LAB__ = createShieldParryDebugApi({
  actions: {
    startAttack,
    restartAttack,
    setMode,
    refreshDebugStanceProfile,
    resetDebugStanceDefaults,
    triggerParryNow,
    dispatchParryInput,
    forceOldTwoActorB3,
    resetLane: () => (combat.active || attackRuntime.active ? null : laneController.resetLane()),
    captureBladeGeometry: () => ({ blade: captureBladePolyline(), surface: buckler.getWorldParrySurface() }),
    setEngagementSeparation: (meters) => {
      // Between exchanges only: moving either actor mid-exchange would move the geometry the
      // swept contact probe is measuring.
      if (combat.active || attackRuntime.active) return null;
      const stance = labScene.setEngagementSeparation(meters);
      resetExchange();
      laneController.resetLane(); // the ledger's base must follow the stance
      return stance;
    },
  },
  runtimes: {
    laneController,
    combat,
    attackRuntime,
    guardMachine,
    predictivePresentation,
    parryGate,
    freeCamera,
    residualBodyReachRuntime,
    residualStanceReachRuntime,
    swordGripConstraint,
    labScene,
  },
  debugMode: DEBUG_MODE,
  getDebugStanceProfile: () => debugStanceProfile,
  getExchangeState: () => exchangeState,
});
maybeStartParryGateProbe({ api: window.__G43B5R281_LAB__, windowRef: window, documentRef: document }); // R19G.1 CI gate
