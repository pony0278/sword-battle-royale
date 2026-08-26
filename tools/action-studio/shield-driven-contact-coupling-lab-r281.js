import { getProductionParryDeflectProfile } from '../../src/animation/parry-contact-deflect-runtime-clip.js?v=g43b5r281-parry-sync-r2';
import { GUARD_EVENTS, GUARD_STATES, createGuardStateMachine } from '../../src/combat/guard-state-machine.js';
import { createGuardPresentationRuntime } from '../../src/combat/guard-presentation-runtime.js';
import { createLongswordDirectionalAttackRuntime, LONGSWORD_ATTACK_PHASES } from '../../src/combat/longsword-directional-attack-runtime.js';
import { captureRigPose, applyRigPose, blendRecoveryPose } from '../../src/combat/guard-recovery-bridge.js';
import { sampleLongswordAttackRecovery } from '../../src/combat/longsword-contact-recovery-presentation.js';
import {
  measureSweptSwordBucklerClosestApproach,
  probeSweptSwordBucklerContact,
} from '../../src/combat/swept-sword-buckler-contact.js?v=g43b5r281-residual-body-reach-r18';
import { buildParryWhiffDiagnostic } from '../../src/combat/parry-whiff-diagnostic.js?v=g43b5r281-residual-body-reach-r18';
import { selectReachableParryInterceptTarget } from '../../src/combat/reachable-parry-intercept-target.js?v=g43b5r281-residual-body-reach-r18';
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
} from '../../src/combat/two-actor-combat-integration.js?v=g43b5r281-closed-loop-old-b3-r18i5';
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
  buildLiveParryOldB3Handoff,
  sampleLiveParryOldB3ReleaseBlend,
} from '../../src/combat/live-parry-old-b3-handoff.js?v=g43b5r281-closed-loop-old-b3-r18i5';
import {
  measureAttackerRecoilWorldSilhouette,
} from '../../src/combat/attacker-recoil-world-silhouette.js?v=g43b5r281-closed-loop-old-b3-r18i5';

import {
  compactInterceptDriveTelemetry,
  compactInterceptDriveTraceFrame,
  compactPredictiveAnalysis,
  compactParryGateAttempt,
  compactReachableInterceptTarget,
  compactLiveContactConstraint,
  compactThreatSelection,
} from './shield-parry-r281/diagnostic-telemetry.js';
import {
  describeContactGeometry,
  formatAllInspectionGates,
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
import { createShieldParryInspectionOverlay } from './shield-parry-r281/inspection-overlay.js';
import { createAttackerPresentationAdapter } from './shield-parry-r281/attacker-presentation.js';
import { createDirectOldB3DiagnosticController } from './shield-parry-r281/direct-old-b3-diagnostic.js';
import { bootstrapShieldParryLabAssets } from './shield-parry-r281/lab-bootstrap.js';
import { createShieldParryDebugApi } from './shield-parry-r281/debug-api.js';


const LAB_STAGE = LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE;
const RECOIL_STAGE = LEGACY_TWO_ACTOR_RECOIL_PASSTHROUGH_STAGE;
const THREE = window.THREE;
if (!THREE?.WebGLRenderer || !THREE?.GLTFLoader) throw new Error(`${LAB_STAGE} requires Three.js r128 + GLTFLoader`);

const TIMING_AGE_MS = Object.freeze({ block: 260, parry: 120 });
const HUD_INTERVAL_MS = 50;
const REPORT_INTERVAL_MS = 240;
const MAX_REPORT_DOM_CHARACTERS = 60000;
const RECENT_COMPACT_TRACE_FRAMES = 8;
const PARRY_REVIEW_RATE = 0.12;
const PARRY_PROMPT_HOLD_MS = 1500;
const PARRY_PRESENTATION_MARKERS = getProductionParryDeflectProfile('parry').presentationMarkers;
const PARRY_ATTACKER_RELEASE_SOURCE_SECONDS = PARRY_PRESENTATION_MARKERS.attackerReleaseEligibleSeconds;
const DEBUG_QUERY = new URLSearchParams(window.location.search);
const DEBUG_MODE = DEBUG_QUERY.get('debug') === '1';

const labScene = createShieldParryLabScene({ THREE, documentRef: document, windowRef: window });
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
const exchangeState = createShieldParryExchangeState();

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
let selectedMode = 'parry';
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
  }),
  services: {
    cloneSurface,
    magnitude,
    planArticulatedImpactBracing,
    planFineGuardTracking,
    analyzePredictiveInterceptParry,
    evaluateCommittedParryInput,
    measureSweptSwordBucklerClosestApproach,
    selectReachableParryInterceptTarget,
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
  constants: {
    TIMING_AGE_MS,
    PARRY_ATTACKER_RELEASE_SOURCE_SECONDS,
    LONGSWORD_ATTACK_PHASES,
    GUARD_STATES,
    COMMITTED_PARRY_CONTACT_GATE_STAGE,
    LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE,
    TWO_ACTOR_PARRY_REACTION_CHANNELS,
    TWO_ACTOR_PARRY_REACTION_PHASE_LATCHES,
  },
  services: {
    probeSweptSwordBucklerContact,
    captureRigPose,
    buildLiveParryOldB3Handoff,
    sampleLiveParryOldB3ReleaseBlend,
    publishPostCouplingRecoilStaggerHandoff,
    measureAttackerRecoilWorldSilhouette,
  },
  callbacks: {
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
  timingAgeMs: TIMING_AGE_MS.parry,
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
    buildReport,
  },
});

const bladeNodes = [attackerSword.bladeBase, attackerSword.bladeMid, attackerSword.tip];
const bladeScratch = bladeNodes.map(() => new THREE.Vector3());
const bladeBuffers = [0, 1].map(() => bladeNodes.map(() => ({ x: 0, y: 0, z: 0 })));
let bladeBufferIndex = 0;

function captureBladePolyline() {
  attackerSword.object3d.updateMatrixWorld(true);
  const buffer = bladeBuffers[bladeBufferIndex];
  bladeBufferIndex = 1 - bladeBufferIndex;
  for (let i = 0; i < bladeNodes.length; i += 1) {
    bladeNodes[i].getWorldPosition(bladeScratch[i]);
    buffer[i].x = bladeScratch[i].x;
    buffer[i].y = bladeScratch[i].y;
    buffer[i].z = bladeScratch[i].z;
  }
  return buffer;
}

function cloneSurface(surface = {}) {
  return {
    center: {
      x: Number(surface.center?.x) || 0,
      y: Number(surface.center?.y) || 0,
      z: Number(surface.center?.z) || 0,
    },
    normal: {
      x: Number(surface.normal?.x) || 0,
      y: Number(surface.normal?.y) || 0,
      z: Number(surface.normal?.z) || -1,
    },
    radius: Number(surface.radius) || 0,
    thickness: Number(surface.thickness) || 0,
  };
}

function magnitude(v) {
  return v ? Math.hypot(Number(v.x) || 0, Number(v.y) || 0, Number(v.z) || 0) : 0;
}

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
  });
  attackerRecovery = presentationState.recovery;
  attackerIdleClockSeconds = presentationState.idleClockSeconds;
}
function resetExchange() {
  parryGate.reset();
  swordGripConstraint.reset();
  bracingRuntime.resetImpact();
  fineTrackingRuntime.reset();
  residualBodyReachRuntime.reset();
  residualStanceReachRuntime.reset();
  predictivePresentation.reset();
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
      : `${(exchangeState.latestParryInput.requiredShieldTravelMeters * 100).toFixed(1)}cm${exchangeState.latestParryInput.gates.trackingClamped ? ' → CLAMP 18cm' : ''}`;
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
  if (guardMachine.state !== GUARD_STATES.HOLD) enterGuard();
  selectedDirection = direction;
  resetExchange();
  previousBlade = captureBladePolyline();
  repeatCooldownMs = 0;
  const started = combat.startAttack(direction);
  if (!started.accepted) return false;
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
  enterGuard();
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
  return contactHandoffController.resolveContact(snapshot, currentBlade, deltaSeconds, {
    previousBlade,
    selectedMode,
    selectedDirection,
  });
}

function updateParryCue(snapshot = attackRuntime.snapshot) {
  return labUi.updateParryCue({
    snapshot,
    ready,
    selectedMode,
    step3AContactTransfer: exchangeState.step3AContactTransfer,
    latestGripConstraintReport: exchangeState.latestGripConstraintReport,
    selectedDirection,
    latestParryConfirmation: exchangeState.latestParryConfirmation,
    latestParryWhiff: exchangeState.latestParryWhiff,
    parryAttempt: parryGate.attempt,
    firstContact: exchangeState.firstContact,
    latestParryOpportunity: exchangeState.latestParryOpportunity,
    parryReviewActive: isParryPreContactReviewActive(snapshot),
    parryReviewRate: PARRY_REVIEW_RATE,
    debugMode: DEBUG_MODE,
  });
}

function updateHud(snapshot, combatSnapshot) {
  return labUi.updateHud({
    snapshot,
    combatSnapshot,
    latestCombatResult: exchangeState.latestCombatResult,
    latestParryWhiff: exchangeState.latestParryWhiff,
    latestParryConfirmation: exchangeState.latestParryConfirmation,
    latestParryInput: exchangeState.latestParryInput,
    selectedMode,
    requestedOutcome: selectedMode,
    parryReviewActive: isParryPreContactReviewActive(snapshot),
    parryReviewRate: PARRY_REVIEW_RATE,
    parryPromptHeld: Boolean(exchangeState.parryPromptHold),
    firstContact: exchangeState.firstContact,
    latestFinePlan: exchangeState.latestFinePlan,
    latestReachableInterceptTarget: exchangeState.latestReachableInterceptTarget,
    latestGripConstraintReport: exchangeState.latestGripConstraintReport,
    step3AContactTransfer: exchangeState.step3AContactTransfer,
    defenderReleaseGate: contactHandoffController.defenderDeflectReleaseGate(),
    step3AOwnsLiveContact: contactHandoffController.ownsLiveContact(),
    directOldB3Diagnostic: exchangeState.directOldB3Diagnostic,
    debugMode: DEBUG_MODE,
  });
}

function buildReport(combatSnapshot = combat.snapshot) {
  const report = buildShieldParryVerificationReport({
    combatSnapshot,
    exchangeState,
    labStage: LAB_STAGE,
    recoilStage: RECOIL_STAGE,
    ready,
    selectedDirection,
    selectedMode,
    parryProfile: parryGate.profile,
    defenderReleaseGate: contactHandoffController.defenderDeflectReleaseGate(),
    ownsLiveContact: contactHandoffController.ownsLiveContact(),
    inspectionCameraSnapshot: freeCamera.snapshot(),
    debugMode: DEBUG_MODE,
    debugStanceProfile,
    recentCompactTraceFrames: RECENT_COMPACT_TRACE_FRAMES,
    liveContactPhaseLatch: TWO_ACTOR_PARRY_REACTION_PHASE_LATCHES.LIVE_CONTACT,
  });
  const publication = serializeVerificationReport({
    report,
    maxCharacters: MAX_REPORT_DOM_CHARACTERS,
    traceFrames: exchangeState.interceptDriveTrace.length,
    recentTraceFrames: Math.min(exchangeState.interceptDriveTrace.length, RECENT_COMPACT_TRACE_FRAMES),
  });
  reportNode.textContent = publication.displayText;
  document.documentElement.dataset.g43b5r281 = report.pass ? 'pass' : 'fail';
  window.__G43B5R281_RESULT__ = report;
  window.__G43B5R281_PERF__ = publication.perf;
  return report;
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
  defenderSword = bootstrap.defenderSword;
  enterGuard();
  exchangeState.previousShieldLeadSurface = cloneSurface(buckler.getWorldParrySurface());
  ready = true;
  status.textContent = `${LAB_STAGE} READY · start an attack, then press PARRY NOW after commitment and before contact`;
  status.className = 'good';
  buildReport();
  startAttack('right');
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

    const contactFrame = contactHandoffController.updateCombatBeforeGuard({
      deltaSeconds,
      deltaMs,
      selectedDirection,
      hasAttackerRecovery: Boolean(attackerRecovery),
      beginAttackRecovery,
    });
    if (!contactFrame.handledCombat) sampleAttackerBase(snapshot, deltaMs);

    guardRuntime.update(deltaMs, camera);
    contactHandoffController.updateDefenderDeflectReleaseGate();
    contactHandoffController.updateLiveConstraintAfterGuard({
      deltaSeconds,
      selectedDirection,
      needsUpdate: contactFrame.liveConstraintNeedsUpdate,
    });
    attackerSword.update(); defenderSword?.update();
    contactHandoffController.recordVisibleOldB3Sample(exchangeState.latestCombatUpdate);

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
  },
  runtimes: {
    combat,
    attackRuntime,
    guardMachine,
    predictivePresentation,
    parryGate,
    freeCamera,
    residualBodyReachRuntime,
    residualStanceReachRuntime,
    swordGripConstraint,
  },
  debugMode: DEBUG_MODE,
  getDebugStanceProfile: () => debugStanceProfile,
  getExchangeState: () => exchangeState,
});
