import { GUARD_INTENT_AGE_MS } from '../../src/combat/contact-lifecycle-director.js';
import { GUARD_EVENTS, GUARD_STATES, createGuardStateMachine } from '../../src/combat/guard-state-machine.js';
import { createGuardPresentationRuntime } from '../../src/combat/guard-presentation-runtime.js';
import { createLongswordDirectionalAttackRuntime, LONGSWORD_ATTACK_PHASES } from '../../src/combat/longsword-directional-attack-runtime.js';
import { captureRigPose, applyRigPose, blendRecoveryPose } from '../../src/combat/guard-recovery-bridge.js';
import { sampleLongswordAttackRecovery } from '../../src/combat/longsword-contact-recovery-presentation.js';
import {
  measureSweptSwordBucklerClosestApproach,
} from '../../src/combat/swept-sword-buckler-contact.js';
import { createGuardThreatTrackingRuntime, planGuardThreatCorrection } from '../../src/combat/guard-threat-tracking.js';
import { createGuardResidualBodyReachRuntime } from '../../src/combat/guard-residual-body-reach.js';
import {
  GUARD_RESIDUAL_STANCE_REACH_PROFILE,
  createGuardResidualStanceReachRuntime,
} from '../../src/combat/guard-residual-stance-reach.js';
import { planFineGuardTracking } from '../../src/combat/directional-guard-bracing.js';
import { createArticulatedImpactBracingRuntime, planArticulatedImpactBracing } from '../../src/combat/articulated-impact-bracing.js';
import {
  analyzePredictiveInterceptParry,
  createPredictiveInterceptParryPresentationRuntime,
} from '../../src/combat/predictive-intercept-parry.js';
import { sampleActiveShieldLeadMotion } from '../../src/combat/active-shield-lead-parry.js';
import { createActiveParryInterceptIntent } from '../../src/combat/active-parry-intercept-intent.js';
import {
  TWO_ACTOR_PARRY_REACTION_CHANNELS,
  TWO_ACTOR_PARRY_REACTION_PHASE_LATCHES,
} from '../../src/combat/two-actor-combat-integration.js';
import {
  LEGACY_TWO_ACTOR_RECOIL_PASSTHROUGH_STAGE,
  publishPostCouplingRecoilStaggerHandoff,
} from '../../src/combat/post-coupling-recoil-stagger-handoff.js';
import {
  COMMITTED_PARRY_CONTACT_GATE_STAGE,
  createCommittedParryContactGate,
  evaluateCommittedParryInput,
} from '../../src/combat/committed-parry-contact-gate.js';
import {
  LIVE_SHIELD_SWORD_GRIP_CONTACT_STAGE,
} from '../../src/combat/live-shield-sword-grip-contact-constraint.js';
import {
  sampleLiveParryOldB3ReleaseBlend,
} from '../../src/combat/live-parry-old-b3-handoff.js';
import {
  measureAttackerRecoilWorldSilhouette,
} from '../../src/combat/attacker-recoil-world-silhouette.js';
import { maybeStartDefenceMatrixProbe } from './shield-parry-r281/defence-matrix-probe.js'; // R21P.1
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
} from './shield-parry-r281/diagnostic-formatters.js';
import { serializeVerificationReport } from './shield-parry-r281/report-serialization.js';
import { buildShieldParryVerificationReport } from './shield-parry-r281/verification-report.js';
import { createShieldParryLabDom } from './shield-parry-r281/lab-dom.js';
import { createStanceDebugController } from './shield-parry-r281/stance-debug-controls.js';
import { createShieldParryLabUi, bindShieldParryLabUiEvents } from './shield-parry-r281/lab-ui.js';
import { createGuardSectorIndicator } from './shield-parry-r281/guard-sector-indicator.js';
import { createParryAttemptTally } from './shield-parry-r281/parry-attempt-tally.js';
import { readLabExperimentParameters } from './shield-parry-r281/lab-experiment-parameters.js'; // R21O.1, R21V.1
import { createOpponentDriveController } from './shield-parry-r281/opponent-drive-controller.js'; // R21E.1
import { createGuardSectorRuntime } from '../../src/game/guard-sector-runtime.js';
import {
} from '../../src/game/exchange-state.js';
import { createVisualOwnershipRuntimeTaps } from './shield-parry-r281/visual-ownership-runtime-taps.js';
import { createCombatScene } from '../../src/game/scene.js';
import { createFreeInspectionCameraControls } from './free-inspection-camera-controls.js';
import { cloneSurface, magnitude } from '../../src/game/geometry.js';
import { createShieldParryFrameReporting } from './shield-parry-r281/frame-reporting.js';
import { createShieldParryLaneController } from '../../src/game/lane-controller.js';
import { createDefenderStanceRuntime } from '../../src/combat/defender-stance.js';
import { createShieldParryInspectionOverlay } from './shield-parry-r281/inspection-overlay.js';
import { createDirectOldB3DiagnosticController } from './shield-parry-r281/direct-old-b3-diagnostic.js';
import { LANE_WALK_CLIPS, bootstrapShieldParryLabAssets } from '../../src/game/bootstrap.js';
import { createNeutralStanceController } from '../../src/game/neutral-stance.js';
import { createFighter } from '../../src/game/fighter.js'; // R23A.1
import { createShieldParryDebugApi } from './shield-parry-r281/debug-api.js';
import { createFrameClock } from '../../src/game/frame-clock.js';
import { createParryWhiffReporter } from './shield-parry-r281/parry-whiff-reporter.js';
import { createShieldParryPlayerController } from '../../src/game/player-controller.js';
import { createWeaponMountController } from '../../src/game/weapon-mount-controller.js';
import { createEngagement } from '../../src/game/engagement.js';
import { createDuel } from '../../src/game/duel.js';
import { planSwingPermission } from '../../src/combat/swing-permission.js';

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

const labScene = createCombatScene({
  createInspectionCamera: createFreeInspectionCameraControls, // R20Z.4: the lab brings its own observer
  THREE, documentRef: document, windowRef: window,
  separationMeters: DEBUG_QUERY.has('spacing') ? Number(DEBUG_QUERY.get('spacing')) : undefined,
});
const {
  canvas, renderer, scene, camera, freeCamera, attacker, defender, attackerSword, buckler, attackerBuckler, resize, setView,
} = labScene;
// R20S.2: the game's camera by default; ?camera=free hands the frame back to the inspection rig,
// which is a debugging tool rather than a way anyone plays.
const INSPECTION_CAMERA = DEBUG_QUERY.get('camera') === 'free';
const inspectionOverlay = createShieldParryInspectionOverlay({ THREE, scene });
let defenderSword = null;
let weaponMount = null; // R23E.1: ?mount=, built once the load has both calibrations
// R23G.1: the player's own engagement, swinging the other way. Built in main() rather than here
// because it needs the defender's sword, and that sword's calibration is read out of a clip that
// has not loaded yet. Null until then, and every frame call below is guarded on `ready`.
let playerEngagement = null;
// R23G.1: which way the player swung. Taken from the aim they are already holding rather than from
// keys of its own - the sector is set by the mouse, drawn by the HUD indicator, and was already the
// thing they point with to defend. One aim, both verbs.
let playerDirection = 'top';
let playerWasSwinging = false; // R23G.1: the falling edge is what banks the step

// The two dials a playtest may turn, both defaulting to what ships: how long a swing takes
// (?tempo=, R21O.1 - the golden grid and the parry gate are a record of the exchange at 1x) and how
// fast a sprint travels (?sprint=, R21V.1). Read, clamped and judged in one module so the entry
// carries the choice rather than the parsing, and so the tally can stamp both into its conditions.
const EXPERIMENT = readLabExperimentParameters(DEBUG_QUERY);
const attackRuntime = createLongswordDirectionalAttackRuntime({ tempoScale: EXPERIMENT.tempoScale });
// R23A.1: one fighter, assembled in src/game rather than twelve consts here. Destructured so every
// reader below is unchanged - this stage moves the assembly and must move nothing else, and the
// golden grid is what says so. The second fighter is now one more call, not another twelve lines.
const defenderFighter = createFighter(THREE, { character: defender, buckler, camera });
// R23B.1: the second fighter. Built but not yet wired to anything - it defends nothing until the
// contact stack runs both ways (step 4) and nothing drives it until the opponent can guard (step 6).
// It is constructed NOW because constructing it is the test: every guard runtime states the bones
// it needs, and the attacker is animated from a different pack than the defender. If that rig were
// short a wrist or a toe, this line throws on load rather than three steps later with the wiring
// half-done and the cause buried.
const attackerFighter = createFighter(THREE, { character: attacker, buckler: attackerBuckler, camera });
const {
  guardMachine, guardRuntime, bracingRuntime, fineTrackingRuntime, residualBodyReachRuntime,
  residualStanceReachRuntime, predictivePresentation, activeParryInterceptIntent, parryGate,
  stance: defenderStance, guardSector, neutralStance, bodyStrikeReaction,
} = defenderFighter;
const laneController = createShieldParryLaneController({ // R18Z.1: steps, feet, and the ground ledger
  // R21Y.1: which run lends the sprint its arms; ?runclip=, Running_A unless somebody says otherwise.
  labScene, walkClips: LANE_WALK_CLIPS, services: { captureRigPose, applyRigPose }, sprintArmClipId: EXPERIMENT.sprintArmClipId, wholeBodyRun: EXPERIMENT.wholeBodyRun, runPlaybackAuthored: EXPERIMENT.runPlaybackAuthored });
const playerController = createShieldParryPlayerController({ // R20S.3: feet, lock-on and the camera
  camera, laneController, freeCamera, inspectionCamera: INSPECTION_CAMERA, // R20U.1: running is refused by these two
  // R21V.1: the sprint's ground speed is a playtest dial; with no ?sprint= this is the shipped seed.
  readGuardActive: () => defenderStance.report.guardActive === true, readAttacking: () => attackRuntime.active === true, sprintSpeedMps: EXPERIMENT.sprintSpeedMps });
// R20G.1 (B6c): defence is a choice - in block mode the guard (and the whole measured defence
// behind it) exists only while the key is held; the machine follows this input, never auto-raises.
let guardKeyHeld = false; let lateGuardRaise = false; // R20J.1 (B6d): raised before the swing, or into it?
// R20H.2: an armed attempt still awaiting its contact, or the live deflect itself - what a released
// key may not interrupt. Both end on their own; the deferred stand-down lands the frame after. The
// guard machine follows the stance from here on, never the raw key: the stance is what knows about
// the dodge mutex and this hold.
function defenceCommitted() { return parryGate.armed === true || contactHandoffController.ownsLiveContact(); }
function syncGuardToStance() {
  if (selectedMode !== 'block') return;
  const guardActive = defenderStance.report.guardActive === true;
  if (guardActive && guardMachine.state === GUARD_STATES.NEUTRAL) enterGuard();
  else if (!guardActive && guardMachine.state !== GUARD_STATES.NEUTRAL) { guardMachine.send(GUARD_EVENTS.RESET, { stage: LAB_STAGE }); guardRuntime.sync(camera); }
}
function setGuardHeld(held) {
  guardKeyHeld = held === true;
  if (selectedMode !== 'block') return guardKeyHeld;
  // The stance refreshes on the input edge, not the next frame: a guard press and a dodge
  // request in the same tick must already see each other, or the mutex leaks for one frame.
  const stanceEdge = defenderStance.update({ guardKeyHeld, dodgeRunning: laneController.dodgeReport.dodging, defenceCommitted: defenceCommitted() });
  syncGuardToStance();
  // R20H.1 (B6c2): the rising edge IS the Sekiro attempt. Timing is the gate's whole authority
  // (geometry cannot veto), so the raise needs nothing but the live snapshot; a refusal is
  // silent - the shield still rose, and that is already the answer the player asked for.
  if (stanceEdge.justRaisedGuard && attackRuntime.snapshot?.action && !exchangeState.firstContact) {
    lateGuardRaise = true; // R20J.1: raised into a live swing, whatever the gate makes of the timing
    exchangeState.latestParryInput = parryGate.arm({ attackSnapshot: attackRuntime.snapshot, manual: true,
      source: 'guard-raise', aimedSector: guardSector.sector }); // R21C.1: point, then press
    parryTally.record(exchangeState.latestParryInput);
    if (exchangeState.latestParryInput.accepted) driveAcceptedParry(attackRuntime.snapshot);
  }
  return guardKeyHeld;
}
// Every dodge request - keyboard, touch, or probe - walks through the stance gate here.
function requestDodge(direction) {
  if (!defenderStance.mayDodge()) return Object.freeze({ accepted: false, reason: 'guard-refuses-the-dodge' });
  return laneController.tryDodge(direction);
}

const uiElements = createShieldParryLabDom(document);
const { status, reportNode, autoRepeat, opponentDrive, slowReview, showSurface } = uiElements;
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
// R21A.2: the player's aim, and the widget that draws it. Nothing reads the sector to decide an
// outcome yet - step one is that the direction exists and is visible, so a person can answer
// whether it is readable in time before any rule is written against it.
const guardSectorIndicator = createGuardSectorIndicator(document.getElementById('guardSector'));
// R21C.2: counts what the attempts did, so a play test produces numbers rather than impressions.
const parryTally = createParryAttemptTally({ conditions: () => ({ tempoScale: EXPERIMENT.tempoScale, slowReview: slowReview.checked, sprint: EXPERIMENT }) });

let ready = false;
let selectedDirection = 'right';
let selectedMode = null; // R19I.1: chosen, never assumed
const frameClock = createFrameClock(); // R20K.1: the wall clock, until a harness pins it
let repeatCooldownMs = 0;
let hudClockMs = HUD_INTERVAL_MS;
let reportClockMs = REPORT_INTERVAL_MS;

// R23F.1: one direction of the fight, as a unit. Nine constructions and four pieces of
// between-frame state used to sit loose in this file; the second exchange is now one more call
// rather than another hundred lines. The functions below still own the UI and the orchestration -
// that is the boundary, and it is why readContext and callbacks are still handed in from here.
const engagement = createEngagement(THREE, {
  swinger: attacker, swingerSword: attackerSword, receiver: defender, receiverBuckler: buckler,
  receiverFighter: defenderFighter, camera, attackRuntime,
  createOwnershipTaps: createVisualOwnershipRuntimeTaps, // R20Z.3: the lab supplies its own watcher
  longswordAttackPhases: LONGSWORD_ATTACK_PHASES, promptHoldMs: PARRY_PROMPT_HOLD_MS, debugMode: DEBUG_MODE,
  presentationServices: {
    captureRigPose, applyRigPose, blendRecoveryPose,
    sampleLongswordAttackRecovery, sampleLiveParryOldB3ReleaseBlend,
  },
  preContactServices: {
    cloneSurface, magnitude, planArticulatedImpactBracing, planFineGuardTracking,
    analyzePredictiveInterceptParry, evaluateCommittedParryInput,
    measureSweptSwordBucklerClosestApproach, planGuardThreatCorrection,
    sampleActiveShieldLeadMotion, compactInterceptDriveTraceFrame, compactInterceptDriveTelemetry,
  },
  contactServices: { measureAttackerRecoilWorldSilhouette },
  readContext: () => ({
    selectedMode,
    slowReviewChecked: slowReview.checked,
    defenderSword,
    debugStanceProfile,
    separationMeters: laneController.separationMeters, defenderFacingErrorRadians: laneController.defenderFacingErrorRadians, dodgeReport: laneController.dodgeReport, stanceReport: defenderStance.report, lateGuardRaise, // R19N.1 + R19Z.1 + R20F.1 + R20G.1 + R20J.1 read the live lane
  }),
  callbacks: {
    // R23J.1: the flinch AND the wound. onBodyStruck is the one signal that means a blade genuinely
    // landed - latestBodyHit also holds near-misses - so it is the only honest place to spend health.
    onBodyStruck: (bodyContact) => { bodyStrikeReaction.start(bodyContact); duel.landBlowOn(defenderFighter.condition); }, readDodgeReport: () => laneController.dodgeReport,
    readGuardActive: () => selectedMode !== 'block' || defenderStance.report.guardActive === true, // R20G.1: parry mode keeps its armed guard
    updateLiveContactMarkers: (report) => inspectionOverlay.update(report),
    formatInspectionFailureSummary,
    publishStatus({ text, className }) { status.textContent = text; status.className = className; },
  },
});
const {
  exchangeState, combat, presentation: attackerPresentation, gripConstraint: swordGripConstraint,
  preContact: preContactController, contactHandoff: contactHandoffController,
  captureBlade: captureBladePolyline, readBladeForMeasurement: readBladePolylineForMeasurement,
} = engagement;
// After the engagement, because the blackboard it reports on is the engagement's now.
const parryWhiffReporter = createParryWhiffReporter({ parryGate, exchangeState, status, debugMode: DEBUG_MODE });

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
    clearAttackerRecovery: () => engagement.clearRecovery(),
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
    lockReport: () => playerController.lockReport, // R20S.3
    // R21Y.1: the arm clip rides along so the HUD can say which run is actually being worn - a
    // playtester comparing ?runclip= needs to see that the override took, not just that they typed it.
    sprintReport: () => ({ ...playerController.sprintReport, armClip: laneController.defenderSprintArmClip, gait: laneController.defenderGait }), // R20U.1
    parryTally: () => parryTally.summary, // R21C.2
    opponent: () => opponentDriveController.summary, // R21E.1
    // R23J.1: the duel, for the one HUD line a player actually needs.
    duel: () => duel.report,
    parryTallyReport: () => parryTally.reportText, // R21G.2: the whole run, pasteable
  },
});

// R21E.1: the opponent places and paces themselves. Input source only - it writes nothing but
// setAttackerIntent and startAttack, which is what leaves the golden grid and the parry gate (both
// of which drive attacks by hand at fixed separations) untouched with the toggle off.
const opponentDriveController = createOpponentDriveController({
  toggle: opponentDrive, laneController, startAttack, tally: parryTally,
  readAttackAvailable: () => ready && !combat.active && !attackRuntime.active && !engagement.hasRecovery,
});

function enterGuard() {
  guardMachine.send(GUARD_EVENTS.RESET, { stage: LAB_STAGE }); guardRuntime.sync(camera);
  guardMachine.send(GUARD_EVENTS.GUARD_PRESS, { stage: LAB_STAGE }); guardRuntime.sync(camera);
  const report = guardRuntime.update(180, camera);
  if (report.snapshot.state !== GUARD_STATES.HOLD) throw new Error(`Expected Guard Hold, got ${report.snapshot.state}`);
}
// R23F.1: the recovery, the idle clock and their two-way handoff live in the engagement now. These
// stay as names because a dozen call sites read like sentences with them and like plumbing without,
// and stay as DECLARATIONS because two of those call sites are construction arguments evaluated
// above this line - a const arrow would be in its temporal dead zone there, which is exactly the
// error this refactor produced before it was one.
function beginAttackRecovery(direction) {
  return engagement.beginRecovery(direction);
}
function sampleAttackerBase(snapshot, deltaMs) {
  return engagement.sampleBase(snapshot, deltaMs, laneController.attackerWalkSample);
}
function resetExchange() {
  laneController.endExchange(); lateGuardRaise = false; // R20J.1: the next swing asks again
  parryGate.reset();
  swordGripConstraint.reset();
  bracingRuntime.resetImpact(); fineTrackingRuntime.reset();
  residualBodyReachRuntime.reset(); residualStanceReachRuntime.reset();
  predictivePresentation.reset(); contactHandoffController.resetRootDisplacement();
  preContactController.resetActiveIntercept();
  engagement.resetExchangeState({ previousShieldLeadSurface: cloneSurface(buckler.getWorldParrySurface()) });
  inspectionOverlay.clear();
}

// R20H.1: everything an accepted arm sets in motion besides the gate itself - the whiff-probe
// resets, the intercept drive, the predictive presentation. Shared by the parry-mode trigger and
// the block-mode guard raise: without the drive, a LEFT raise inside the timing window still eats
// the hit on the body (the whole window sits past the B6b raise-conversion cliff, measured).
function driveAcceptedParry(snapshot) {
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
    aimedSector: guardSector.sector, // R21C.1: the other door into the same gate
  });
  parryTally.record(exchangeState.latestParryInput);

  if (exchangeState.latestParryInput.accepted) {
    driveAcceptedParry(snapshot);
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
  // R20H.1: in block mode F IS the guard raise - setGuardHeld already armed the Sekiro attempt on
  // this keydown; the legacy trigger would only clobber that verdict with 'select-parry-mode-first'.
  if (selectedMode === 'block' && source.startsWith('keyboard-f')) return exchangeState.latestParryInput;
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
  if (!ready || combat.active || attackRuntime.active || engagement.hasRecovery) return false;
  // R23G.1: and not into the player's swing either. One advance runtime, one swinging slot - the
  // refusal is symmetric because the ledger underneath is.
  // R23J.1: and a parried or downed opponent does not swing - what makes the stagger a RULE.
  if (playerEngagement?.attackRuntime.active || playerEngagement?.combat.active
    || !attackerFighter.condition.report.canAct) return false;
  // B6c: parry mode keeps its armed guard; block mode raises only what the held key says.
  if ((selectedMode === 'parry' || (selectedMode === 'block' && guardKeyHeld)) && guardMachine.state !== GUARD_STATES.HOLD) enterGuard();
  selectedDirection = direction;
  resetExchange();
  engagement.rememberBlade(captureBladePolyline());
  repeatCooldownMs = 0;
  const started = combat.startAttack(direction);
  if (!started.accepted) return false;
  laneController.startAttack(direction, attackRuntime.snapshot?.action?.runtime?.contactSeconds);
  // R21G.1: the denominator is the swing, not the press. R21M.1: with where the player was
  // already pointing when it began, so a press that never moved can be told from a misread one.
  parryTally.recordAttack(direction, guardSector.sector);
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
  engagement.clearRecovery();
  if (selectedMode === 'parry' || (selectedMode === 'block' && guardKeyHeld)) enterGuard();
  else if (selectedMode === 'block') { guardMachine.send(GUARD_EVENTS.RESET, { stage: LAB_STAGE }); guardRuntime.sync(camera); }
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
  // R19I.1 said choosing a defence raises the guard; B6c narrows that to parry mode - in block
  // mode the held key is the only thing that raises it, so entering block re-reads the key.
  if (mode === 'parry' && guardMachine.state === GUARD_STATES.NEUTRAL) enterGuard();
  if (mode === 'block') setGuardHeld(guardKeyHeld);
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


// R23G.1: the player's swing, aimed where they are already pointing.
//
// The sector is null until a first aim ('never-aimed'), and a swing that silently refuses because
// of an invisible precondition is worse than one that picks a direction and says which - so an
// unaimed press swings TOP and the status line names it.
//
// Refused while either engagement is live, and that is the LEDGER's rule surfacing rather than a
// new one: engagement-ground holds one advance runtime and one swinging slot, so two swings at once
// would not be a harder fight, it would be one swing wearing the other's arithmetic.
let playerAttackRefusal = null; // R23J.1: a refusal a player cannot see is a bug they cannot report
function startPlayerAttack() {
  const permission = planSwingPermission({ ready: ready && Boolean(playerEngagement),
    opponentMidExchange: combat.active || attackRuntime.active, ownExchangeUncleared: playerEngagement?.combat.active,
    alreadySwinging: playerEngagement?.attackRuntime.active, stillRecovering: playerEngagement?.hasRecovery,
    canAct: defenderFighter.condition.report.canAct });
  if (!permission.allowed) { playerAttackRefusal = permission.reason; return false; }
  const aimed = guardSector.sector;
  playerDirection = aimed || 'top';
  // R23J.1: the two-actor integration refuses a second attack until its last one is cleared - the
  // opponent's restartAttack has always done this and the player's path never did, so the second
  // swing of a session was silently refused with every guard above it reading clear.
  playerEngagement.combat.reset();
  playerEngagement.resetExchange();
  playerEngagement.rememberBlade(playerEngagement.captureBlade());
  const started = playerEngagement.combat.startAttack(playerDirection);
  if (!started.accepted) { playerAttackRefusal = `combat-refused-${started.reason || 'unknown'}`; return false; }
  laneController.startAttack(playerDirection, playerEngagement.attackRuntime.snapshot?.action?.runtime?.contactSeconds, { swinger: 'defender' });
  status.textContent = `YOU SWING ${playerDirection.toUpperCase()}${aimed ? '' : ' · nothing aimed yet, so TOP'}`;
  status.className = 'warn';
  return true;
}
// R23J.1: the result layer. Its rule is in src/combat/fighter-condition.js and its two-fighter
// half in src/game/duel.js; what stays here is the page it publishes to.
const duel = createDuel({
  playerCondition: defenderFighter.condition, opponentCondition: attackerFighter.condition,
  publishStatus({ text, className }) { status.textContent = text; status.className = className; },
});
function resolvePlayerContact(snapshot, currentBlade, deltaSeconds) {
  const resolved = playerEngagement.contactHandoff.resolveContact(snapshot, currentBlade, deltaSeconds, {
    previousBlade: playerEngagement.previousBlade, selectedMode: 'block', selectedDirection: playerDirection,
  });
  const settled = laneController.settle(playerEngagement.exchangeState.latestCombatResult?.resolution?.outcome);
  if (settled) playerEngagement.exchangeState.latestEngagementGround = settled;
  duel.spendExchangeOn(playerEngagement.exchangeState.latestCombatResult?.resolution?.outcome, defenderFighter.condition);
  return resolved;
}
function resolveContact(snapshot, currentBlade, deltaSeconds) {
  const resolved = contactHandoffController.resolveContact(snapshot, currentBlade, deltaSeconds, {
    previousBlade: engagement.previousBlade,
    selectedMode,
    selectedDirection,
  });
  // R21Q.1: what the swing did, beside how the press was graded - the column that would have said
  // "you were hit" while every other table only said "too early".
  parryTally.recordOutcome(selectedDirection, snapshot?.sequence, exchangeState.latestCombatResult?.resolution?.outcome, exchangeState.latestBodyHit?.contact === true);
  const settled = laneController.settle(exchangeState.latestCombatResult?.resolution?.outcome);
  if (settled) exchangeState.latestEngagementGround = settled;
  duel.spendExchangeOn(exchangeState.latestCombatResult?.resolution?.outcome, attackerFighter.condition); // they swung, so a parry staggers them
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
  engagement.setIdleDuration(bootstrap.attackerIdleDuration);
  laneController.setWalkDurations(bootstrap.locomotionClipDurations);
  neutralStance.setIdleDuration(bootstrap.defenderIdleDuration);
  defenderSword = bootstrap.defenderSword;
  // R23G.1: the mirror of the engagement above - the player swings, the opponent receives. Measured
  // before it was wired: every per-frame call in this stack is inert while its own attack runtime
  // has no action (updatePreContact returns on !snapshot.action, updateCombatBeforeGuard on
  // !combat.active, advanceDefender's root write on no plan), which is why a second one can sit in
  // the frame loop without the golden grid moving a single cell.
  playerEngagement = createEngagement(THREE, {
    swinger: defender, swingerSword: defenderSword, receiver: attacker, receiverBuckler: attackerBuckler,
    receiverFighter: attackerFighter, camera,
    attackRuntime: createLongswordDirectionalAttackRuntime({ tempoScale: EXPERIMENT.tempoScale }),
    createOwnershipTaps: createVisualOwnershipRuntimeTaps,
    longswordAttackPhases: LONGSWORD_ATTACK_PHASES, promptHoldMs: PARRY_PROMPT_HOLD_MS, debugMode: DEBUG_MODE,
    presentationServices: {
      captureRigPose, applyRigPose, blendRecoveryPose,
      sampleLongswordAttackRecovery, sampleLiveParryOldB3ReleaseBlend,
    },
    preContactServices: {
      cloneSurface, magnitude, planArticulatedImpactBracing, planFineGuardTracking,
      analyzePredictiveInterceptParry, evaluateCommittedParryInput,
      measureSweptSwordBucklerClosestApproach, planGuardThreatCorrection,
      sampleActiveShieldLeadMotion, compactInterceptDriveTraceFrame, compactInterceptDriveTelemetry,
    },
    contactServices: { measureAttackerRecoilWorldSilhouette },
    // The opponent does not defend yet - step 6 is what gives them a guard - so this says so
    // explicitly rather than letting an absent stance read as a raised one.
    readContext: () => ({
      selectedMode: 'block', slowReviewChecked: false, defenderSword: attackerSword, debugStanceProfile,
      separationMeters: laneController.separationMeters, defenderFacingErrorRadians: 0,
      dodgeReport: null, stanceReport: { guardActive: false }, lateGuardRaise: false,
    }),
    callbacks: {
      onBodyStruck: (bodyContact) => { attackerFighter.bodyStrikeReaction.start(bodyContact); duel.landBlowOn(attackerFighter.condition); },
      readDodgeReport: () => null,
      readGuardActive: () => false,
      updateLiveContactMarkers: () => {},
      formatInspectionFailureSummary,
      publishStatus: () => {},
    },
  });
  playerEngagement.setIdleDuration(bootstrap.defenderIdleDuration);
  // R23E.1: ?mount=. The PLAYER's sword only - the attacker's blade is what every contact
  // measurement is taken from, and moving it 0.608m is a different fight, not a different look.
  weaponMount = createWeaponMountController({ weapon: defenderSword, mounts: bootstrap.defenderMounts, mode: EXPERIMENT.weaponMountMode, readGuardState: () => guardMachine.state });
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
    onRetryAttack: () => { if (duel.verdict.over) duel.reset(); return restartAttack(selectedDirection); },
    onDebugApplyRetry: () => restartAttack(selectedDirection),
    onDebugResetDefaults: resetDebugStanceDefaults,
    onDefenderIntent: (intent) => laneController.setDefenderIntent(intent), onAttackerIntent: (intent) => laneController.setAttackerIntent(intent),
    onDefenderLateralIntent: (intent) => laneController.setDefenderLateralIntent(intent), onGuardKey: (held) => setGuardHeld(held), // R19V.1 + R20G.1
    onAttack: () => startPlayerAttack(), // R23G.1 the player's own swing
    onDodge: (direction) => requestDodge(direction), // R20F.1 through the stance gate
    onMoveIntent: (moveIntent) => playerController.setMoveIntent(moveIntent), // R20S.3 WASD, world frame
    onLockToggle: () => playerController.toggleLock(), // R20S.3 Tab
    onSprint: (held) => playerController.setSprintRequested(held), // R20U.1 Shift
    onLook: (deltaPixels) => (INSPECTION_CAMERA ? null : playerController.look(deltaPixels)), // R20S.3 free look
    onAim: (aim) => guardSector.aim(aim), // R21A.2 the guard sector, aim only - no rule reads it
    // R21N.1: one press that names the direction and is the timed input. The sector is chosen
    // first so the guard's rising edge - which IS the parry attempt (R20H.1) - already sees it;
    // ordering these the other way round would arm every directional press against wherever the
    // pointer happened to be left.
    onDirectionalParry: (direction, pressed) => {
      if (pressed) guardSector.select(direction);
      return setGuardHeld(pressed);
    },
    onShowSurface: (checked) => buckler.setParrySurfaceVisible(checked),
    onResize: resize,
  },
});

function frame(timestamp) {
  const rawDeltaMs = frameClock.tick(timestamp);
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

  defenderStance.update({ guardKeyHeld, dodgeRunning: laneController.dodgeReport.dodging, defenceCommitted: defenceCommitted() }); // R20G.1 + R20H.2
  syncGuardToStance(); // a deferred stand-down lands the frame its commitment ends
  playerController.frame(rawDeltaMs / 1000); // R20S.3: lock, then feet, then the camera - in that order
  opponentDriveController.frame(rawDeltaMs); // R21E.1: before the walk, so its intent is spent this frame
  laneController.walk(rawDeltaMs / 1000, exchangeState.latestGuardFacingPlan); // real seconds; R19Q.1 facing plan rides along
  if (ready) {
    const snapshot = attackRuntime.update(deltaMs);

    parryWhiffReporter.report(snapshot, selectedDirection); // R20S.1: a report about a finished attack, never a decision

    // R23G.1: the player's swing advances on the same clock. One swing at a time is not a policy
    // here, it is the ledger: engagement-ground holds one advance runtime and one swinging slot, so
    // the lane is driven by whichever engagement actually has an action this frame.
    const playerSnapshot = playerEngagement ? playerEngagement.attackRuntime.update(deltaMs) : null;
    // R23G.1: bank the step the frame the swing ends. Measured without this: the player closed the
    // measured 0.862m of a TOP advance and then stood there forever - separation stuck at 1.538m
    // and the swing never banked, because the ledger only spends a swing while one is live and
    // nothing was telling it this one had stopped. The opponent's side banks at the START of its
    // next attack instead, which is what the golden grid was measured against and is therefore not
    // changed here; the two ought to agree, and that is its own change with its own evidence.
    if (playerWasSwinging && !playerSnapshot?.action) { laneController.endExchange(); playerWasSwinging = false; }
    playerWasSwinging = Boolean(playerSnapshot?.action);
    const laneSwing = playerSnapshot?.action ? playerSnapshot : snapshot;
    laneController.update(laneSwing.elapsedSeconds, Boolean(laneSwing.action), laneSwing.phase); // R20B.1 phase rides along

    const contactFrame = contactHandoffController.updateCombatBeforeGuard({
      deltaSeconds,
      deltaMs,
      selectedDirection,
      hasAttackerRecovery: engagement.hasRecovery,
      beginAttackRecovery,
    });
    // R21J.1: a swing that ends without the combat path completing it - the blade missed, or it
    // landed on a body that never resolved an exchange - got no recovery at all, so the attacker
    // teleported to idle in a single frame. Measured: the blade tip jumped 2.105m between two
    // frames, then moved 0.011m in the next. Every other lab in this repo already begins the
    // recovery on the attack's own completion; only this one relied on the combat path, which is
    // why the snap appeared exactly when a player FAILED to answer a swing.
    if (snapshot.completed && !engagement.hasRecovery) beginAttackRecovery(selectedDirection);
    if (!contactFrame.handledCombat) sampleAttackerBase(snapshot, deltaMs);

    const playerFrame = playerEngagement?.contactHandoff.updateCombatBeforeGuard({
      deltaSeconds, deltaMs, selectedDirection: playerDirection,
      hasAttackerRecovery: playerEngagement.hasRecovery,
      beginAttackRecovery: (direction) => playerEngagement.beginRecovery(direction),
    });
    if (playerSnapshot?.completed && !playerEngagement.hasRecovery) playerEngagement.beginRecovery(playerDirection);

    laneController.sampleDefenderWalk(!attackRuntime.active && !combat.active, // R20W.2: and whether
      selectedMode !== 'block' || defenderStance.report.guardActive === true); // the guard owns the torso
    guardRuntime.update(deltaMs, camera);
    neutralStance.sample(deltaMs); // R19I.1: no-op unless the guard is neutral
    laneController.overlayDefenderWalkLegs(); laneController.overlayDefenderDodge(); // R20F.1 dodge outranks the guard, a landed blade outranks the dodge
    bodyStrikeReaction.sample(deltaMs); // R19K.1: last writer - a landed blade owns the fighter
    // R23G.1: and after all of it, the player's own swing, because a body that is swinging is not
    // also standing in its guard. Inert on every frame the player is not swinging: sampleBase does
    // nothing without an action or a recovery, which is what keeps the three gates unmoved.
    if (playerEngagement && (playerSnapshot?.action || playerEngagement.hasRecovery)) {
      if (!playerFrame?.handledCombat) playerEngagement.sampleBase(playerSnapshot, deltaMs, null);
    }
    contactHandoffController.updateDefenderDeflectReleaseGate();
    playerEngagement?.contactHandoff.updateDefenderDeflectReleaseGate();
    playerEngagement?.contactHandoff.updateLiveConstraintAfterGuard({
      deltaSeconds, selectedDirection: playerDirection, needsUpdate: playerFrame?.liveConstraintNeedsUpdate,
    });
    contactHandoffController.updateLiveConstraintAfterGuard({
      deltaSeconds,
      selectedDirection,
      needsUpdate: contactFrame.liveConstraintNeedsUpdate,
    });
    // R23J.1: the stagger burns down on the wall clock, not the review-slowed one - a second taken
    // out of the fight is a second the player waits through, whatever the tempo dial is set to.
    duel.advance(rawDeltaMs);
    weaponMount?.frame(); // R23E.1: before the swords redraw, so a changed mount is what they draw
    attackerSword.update(); defenderSword?.update(); contactHandoffController.recordVisibleOldB3Sample(exchangeState.latestCombatUpdate);

    if (!exchangeState.firstContact) {
      const currentBlade = captureBladePolyline();
      preContactController.update(snapshot, currentBlade, deltaSeconds);
      resolveContact(snapshot, currentBlade, deltaSeconds);
      engagement.rememberBlade(currentBlade);
    }
    // The same three steps the other way. Guarded on an action rather than on firstContact alone so
    // an idle player never samples a blade or runs a probe - the golden grid replays with this
    // branch never taken, which is the measurement that says a second engagement is free.
    if (playerEngagement && playerSnapshot?.action && !playerEngagement.exchangeState.firstContact) {
      const playerBlade = playerEngagement.captureBlade();
      playerEngagement.preContact.update(playerSnapshot, playerBlade, deltaSeconds);
      resolvePlayerContact(playerSnapshot, playerBlade, deltaSeconds);
      playerEngagement.rememberBlade(playerBlade);
    }
    // R21D.1: after contact resolution, so a confirmation landing this frame still wins. An
    // accepted attempt whose attack has ended can never be confirmed - letting it stay armed
    // held the guard up forever through a released key.
    parryGate.lapse({ attackSnapshot: snapshot, attackActive: attackRuntime.active });
    updateParryCue(snapshot);

    const combatSnapshot = combat.snapshot;
    hudClockMs += deltaMs; reportClockMs += deltaMs;
    if (hudClockMs >= HUD_INTERVAL_MS) { hudClockMs %= HUD_INTERVAL_MS; updateHud(snapshot, combatSnapshot); }
    if (reportClockMs >= REPORT_INTERVAL_MS) { reportClockMs %= REPORT_INTERVAL_MS; buildReport(combatSnapshot); }

    if (!combat.active && !attackRuntime.active && !engagement.hasRecovery && (guardMachine.state === GUARD_STATES.HOLD || selectedMode === 'block') && autoRepeat.checked && !opponentDrive?.checked) { // R21E.1: the drive owns the cadence when it is on
      repeatCooldownMs += deltaMs;
      if (repeatCooldownMs >= 700) startAttack(selectedDirection);
    }
  }
  guardSectorIndicator.update({ sector: guardSector.sector }); // R21C.2: the player's aim, only
  defender.update(0, camera); attacker.update(0, camera); // R20W.2: rebuild the skeleton lines from
  renderer.render(scene, camera); // the bones AFTER every pose writer, or they draw a stale pose
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
    setGuardHeld, setFixedStepMs: (ms) => frameClock.setFixedStep(ms), // R20G.1 + R20K.1: drivers hold the guard, harnesses pin the clock
    tryDodge: requestDodge, // R20G.1: same gate as the keys - the facade may not skip the stance
    forceOldTwoActorB3,
    resetDuel: () => duel.reset(), // R23J.1: both fighters back to full, for a probe or a second duel
    resetLane: () => (combat.active || attackRuntime.active ? null : laneController.resetLane()),
    captureBladeGeometry: () => ({ blade: captureBladePolyline(), surface: buckler.getWorldParrySurface() }),
    // R21A.1: the passive half of the call above, safe to read mid-swing. captureBladePolyline only
    // refreshes the sword's matrices and reads three world points; it is getWorldParrySurface that
    // advances anchor matrices outside the frame pipeline and flips outcomes. Measuring where a
    // blade travels should not need the half that changes the fight.
    readBladePolyline: () => readBladePolylineForMeasurement().map((point) => ({ x: point.x, y: point.y, z: point.z })),
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
    laneController, playerController, defenderFighter, attackerFighter, // R20S.3 + R23B.1
    defenderStance, frameClock,
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
    guardSector,
    parryTally,
    opponentDriveController,
    get weaponMount() { return weaponMount; }, // a getter: built after the load, so a captured null would never update
    playerEngagement: () => playerEngagement, // R23G.1: same reason, and a thunk so the facade holds no stale null
    playerAttackRefusal: () => playerAttackRefusal, // R23J.1
  },
  debugMode: DEBUG_MODE,
  getDebugStanceProfile: () => debugStanceProfile,
  getExchangeState: () => exchangeState,
});
maybeStartParryGateProbe({ api: window.__G43B5R281_LAB__, windowRef: window, documentRef: document }); // R19G.1 CI gate
maybeStartDefenceMatrixProbe({ api: window.__G43B5R281_LAB__, windowRef: window, documentRef: document }); // R21P.1 CI gate
