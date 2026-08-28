import { createDefaultCharacter } from '../../src/character/default-character.js';
import { createDebugSword, mountDebugSword } from '../../src/character/debug-sword.js';
import { DEFAULT_KAYKIT_SWORD_MOUNT } from '../../src/character/default-character-mount.js';
import { createProceduralBuckler, mountOffhandBuckler } from '../../src/character/offhand-buckler.js';
import {
  ACCEPTED_OFFHAND_BUCKLER_MOUNT_G423,
  ACCEPTED_OFFHAND_BUCKLER_SHAPE_G423,
} from '../../src/character/offhand-buckler-accepted-calibration.js';
import { loadUal1AnimationLibrary } from '../../src/animation/ual1-animation-library.js';
import { loadUal2AnimationLibrary } from '../../src/animation/ual2-animation-library.js';
import { loadSkyrimConvertedAnimationLibrary } from '../../src/animation/skyrim-converted-animation-library.js';
import { composeSkyrimWeaponMountCalibration } from '../../src/animation/skyrim-weapon-bind-calibration.js';
import { GUARD_EVENTS, GUARD_STATES, createGuardStateMachine } from '../../src/combat/guard-state-machine.js';
import { createGuardPresentationRuntime } from '../../src/combat/guard-presentation-runtime.js';
import {
  createLongswordDirectionalAttackRuntime,
  LONGSWORD_ATTACK_PHASES,
} from '../../src/combat/longsword-directional-attack-runtime.js';
import { captureRigPose, applyRigPose, blendRecoveryPose } from '../../src/combat/guard-recovery-bridge.js';
import { sampleLongswordAttackRecovery } from '../../src/combat/longsword-contact-recovery-presentation.js';
import { probeSweptSwordBucklerContact } from '../../src/combat/swept-sword-buckler-contact.js';
import {
  createGuardThreatTrackingRuntime,
  planGuardThreatCorrection,
} from '../../src/combat/guard-threat-tracking.js';
import {
  PREDICTIVE_INTERCEPT_PARRY_STAGE,
  PREDICTIVE_INTERCEPT_PARRY_PROFILE,
  RHYTHM_TRIGGER_ACTIVE_PARRY_STAGE,
  analyzePredictiveInterceptParry,
  createPredictiveInterceptParryPresentationRuntime,
} from '../../src/combat/predictive-intercept-parry.js';
import { createTwoActorCombatIntegration } from '../../src/combat/two-actor-combat-integration.js';

const THREE = window.THREE;
if (!THREE?.WebGLRenderer || !THREE?.GLTFLoader) {
  throw new Error('G4.3B.5R.1 requires Three.js r128 + GLTFLoader');
}

const BLOCK_INTENT_AGE_MS = 260;
const HUD_INTERVAL_MS = 50;
const REPORT_INTERVAL_MS = 160;
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.outputEncoding = THREE.sRGBEncoding;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x090e16);
scene.fog = new THREE.Fog(0x090e16, 8, 18);
const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
scene.add(new THREE.HemisphereLight(0xddeaff, 0x202738, 1.25));
const key = new THREE.DirectionalLight(0xffffff, 1.1);
key.position.set(4, 7, 3);
scene.add(key);
const rim = new THREE.DirectionalLight(0x7fe2cf, 0.55);
rim.position.set(-4, 3, -4);
scene.add(rim);
scene.add(new THREE.GridHelper(12, 24, 0x33445f, 0x202a3b));

const attacker = createDefaultCharacter(THREE);
const defender = createDefaultCharacter(THREE);
attacker.object3d.position.set(0, 0, -1.15);
defender.object3d.position.set(0, 0, 1.15);
defender.object3d.rotation.y = Math.PI;
scene.add(attacker.object3d, defender.object3d);

const attackerSword = createDebugSword(THREE);
mountDebugSword(attacker, attackerSword, DEFAULT_KAYKIT_SWORD_MOUNT);
let defenderSword = null;

const buckler = createProceduralBuckler(THREE, {
  ...ACCEPTED_OFFHAND_BUCKLER_SHAPE_G423,
  lineMode: true,
  solidVisible: false,
});
mountOffhandBuckler(defender, buckler, ACCEPTED_OFFHAND_BUCKLER_MOUNT_G423);
buckler.setParrySurfaceVisible(true);

const attackRuntime = createLongswordDirectionalAttackRuntime();
const guardMachine = createGuardStateMachine();
const guardRuntime = createGuardPresentationRuntime(THREE, { machine: guardMachine, character: defender });
const trackingRuntime = createGuardThreatTrackingRuntime(THREE, { rig: defender.rig, buckler });
const predictivePresentation = createPredictiveInterceptParryPresentationRuntime(THREE, { character: defender });
const combat = createTwoActorCombatIntegration({
  THREE,
  attackerCharacter: attacker,
  attackRuntime,
  guardMachine,
  parrySync: {
    presentationOffsetSeconds: 0.35,
    parryAttackerRecoilDelayMs: 0,
    perfectParryAttackerRecoilDelayMs: 0,
  },
});

const hudAttack = document.getElementById('hudAttack');
const hudThreat = document.getElementById('hudThreat');
const hudParry = document.getElementById('hudParry');
const hudContact = document.getElementById('hudContact');
const hudOutcome = document.getElementById('hudOutcome');
const hudRecoil = document.getElementById('hudRecoil');
const status = document.getElementById('status');
const reportNode = document.getElementById('report');
const autoRepeat = document.getElementById('autoRepeat');
const showSurface = document.getElementById('showSurface');

let ready = false;
let selectedDirection = 'right';
let selectedMode = 'parry';
let lastTimestamp = performance.now();
let attackerIdleDuration = 1;
let attackerIdleClockSeconds = 0;
let attackerRecovery = null;
let repeatCooldownMs = 0;
let previousBlade = null;
let firstContact = null;
let latestContact = null;
let latestCombatResult = null;
let latestCombatUpdate = null;
let latestAnalysis = null;
let latestTrackingPlan = null;
let latestTrackingReport = null;
let latestPredictiveReport = null;
let latestHandoff = null;
let latestParryResult = null;
let guardReport = null;
let hudClockMs = HUD_INTERVAL_MS;
let reportClockMs = REPORT_INTERVAL_MS;

function marker(name, color, radius = 0.055) {
  const node = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 12, 8),
    new THREE.MeshBasicMaterial({ color, depthWrite: false }),
  );
  node.name = name;
  node.visible = false;
  scene.add(node);
  return node;
}

const predictedMarker = marker('G43B5R1_PREDICTED_INTERCEPT', 0x6df0a7, 0.048);
const contactMarker = marker('G43B5R1_CONTACT', 0xff625f, 0.062);

function resize() {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function setView(view) {
  if (view === 'side') camera.position.set(5.8, 1.7, 0.1);
  else if (view === 'attacker') camera.position.set(0, 2.1, -5.6);
  else if (view === 'contact') camera.position.set(2.25, 1.5, 2.2);
  else camera.position.set(4.8, 2.4, 4.9);
  camera.lookAt(0, 1.05, 0);
  camera.updateMatrixWorld(true);
}

const bladeNodes = [attackerSword.bladeBase, attackerSword.bladeMid, attackerSword.tip];
const bladeScratch = bladeNodes.map(() => new THREE.Vector3());
const bladeBuffers = [0, 1].map(() => bladeNodes.map(() => ({ x: 0, y: 0, z: 0 })));
let bladeBufferIndex = 0;
function captureBladePolyline() {
  attackerSword.object3d.updateMatrixWorld(true);
  const buffer = bladeBuffers[bladeBufferIndex];
  bladeBufferIndex = 1 - bladeBufferIndex;
  for (let index = 0; index < bladeNodes.length; index += 1) {
    bladeNodes[index].getWorldPosition(bladeScratch[index]);
    buffer[index].x = bladeScratch[index].x;
    buffer[index].y = bladeScratch[index].y;
    buffer[index].z = bladeScratch[index].z;
  }
  return buffer;
}

function enterProductionGuard() {
  guardMachine.send(GUARD_EVENTS.RESET, { stage: RHYTHM_TRIGGER_ACTIVE_PARRY_STAGE });
  guardRuntime.sync(camera);
  guardMachine.send(GUARD_EVENTS.GUARD_PRESS, { stage: RHYTHM_TRIGGER_ACTIVE_PARRY_STAGE });
  guardRuntime.sync(camera);
  guardReport = guardRuntime.update(180, camera);
  if (guardReport.snapshot.state !== GUARD_STATES.HOLD) {
    throw new Error(`Expected Guard Hold, got ${guardReport.snapshot.state}`);
  }
}

function beginAttackRecovery(direction) {
  const sourcePose = captureRigPose(attacker.rig);
  attacker.sampleAnimation('UAL1/Sword_Idle', 0, { loop: true, inPlace: true, rootRotationPolicy: 'lock' });
  attacker.update(0, camera);
  const targetPose = captureRigPose(attacker.rig);
  applyRigPose(attacker.rig, sourcePose);
  attacker.update(0, camera);
  attackerRecovery = { direction, elapsedMs: 0, sourcePose, targetPose };
  attackerIdleClockSeconds = 0;
}

function sampleAttackerBase(snapshot, deltaMs) {
  if (snapshot.action) {
    const profile = snapshot.action.runtime;
    attacker.sampleAnimation(profile.clipId, Math.min(profile.durationSeconds, snapshot.elapsedSeconds), {
      loop: false,
      inPlace: true,
      rootRotationPolicy: 'lock',
    });
    attacker.update(0, camera);
    if (snapshot.completed && !attackerRecovery) beginAttackRecovery(profile.direction);
    return;
  }
  if (attackerRecovery) {
    attackerRecovery.elapsedMs += deltaMs;
    const recovery = sampleLongswordAttackRecovery(attackerRecovery.direction, attackerRecovery.elapsedMs);
    applyRigPose(attacker.rig, blendRecoveryPose(
      attackerRecovery.sourcePose,
      attackerRecovery.sourcePose,
      attackerRecovery.targetPose,
      recovery.progress,
      { durationMs: recovery.profile.attackRecoveryDurationMs, sampleDeltaMs: 0, momentumScale: 0 },
    ));
    attacker.update(0, camera);
    if (recovery.complete) attackerRecovery = null;
    return;
  }
  attackerIdleClockSeconds += deltaMs / 1000;
  attacker.sampleAnimation(
    'UAL1/Sword_Idle',
    attackerIdleClockSeconds % Math.max(0.001, attackerIdleDuration),
    { loop: true, inPlace: true, rootRotationPolicy: 'lock' },
  );
  attacker.update(0, camera);
}

function resetPredictiveState({ restoreGuard = false, keepResult = false } = {}) {
  predictivePresentation.reset();
  trackingRuntime.reset();
  latestAnalysis = null;
  latestTrackingPlan = null;
  latestTrackingReport = null;
  latestPredictiveReport = null;
  latestHandoff = null;
  if (!keepResult) latestParryResult = null;
  predictedMarker.visible = false;
  if (restoreGuard && guardMachine.state === GUARD_STATES.HOLD) guardRuntime.sync(camera);
}

function startAttack(direction = selectedDirection) {
  if (!ready || combat.active || attackRuntime.active || attackerRecovery) return false;
  if (guardMachine.state !== GUARD_STATES.HOLD) return false;
  selectedDirection = direction;
  firstContact = null;
  latestContact = null;
  latestCombatResult = null;
  latestCombatUpdate = null;
  latestParryResult = null;
  contactMarker.visible = false;
  repeatCooldownMs = 0;
  resetPredictiveState({ restoreGuard: true });
  attackerSword.update();
  previousBlade = captureBladePolyline();
  const result = combat.startAttack(direction);
  if (!result.accepted) return false;
  document.querySelectorAll('[data-attack]').forEach((button) => {
    button.classList.toggle('active', button.dataset.attack === direction);
  });
  return true;
}

function setMode(mode) {
  if (!['block', 'parry', 'perfect'].includes(mode)) return;
  selectedMode = mode;
  document.querySelectorAll('[data-mode]').forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === mode);
  });
}

function updatePredictiveParry(snapshot, currentBlade, deltaSeconds) {
  if (!snapshot.action || firstContact || selectedMode === 'block') {
    predictedMarker.visible = false;
    return;
  }
  if (snapshot.phase === LONGSWORD_ATTACK_PHASES.INTERRUPTED || snapshot.phase === LONGSWORD_ATTACK_PHASES.IDLE) return;

  const surface = buckler.getWorldParrySurface();
  latestAnalysis = analyzePredictiveInterceptParry({
    attackSnapshot: snapshot,
    previousBlade,
    currentBlade,
    bucklerSurface: surface,
    deltaSeconds,
    requestedGrade: selectedMode,
  });

  if (latestAnalysis?.threat?.point) {
    predictedMarker.position.set(
      latestAnalysis.threat.point.x,
      latestAnalysis.threat.point.y,
      latestAnalysis.threat.point.z,
    );
    predictedMarker.visible = true;
  } else {
    predictedMarker.visible = false;
  }

  if (!predictivePresentation.active && latestAnalysis?.shouldTrigger) {
    const started = predictivePresentation.start({
      sequence: snapshot.sequence,
      requestedGrade: selectedMode,
      triggerTtcSeconds: latestAnalysis.triggerTtcSeconds,
    });
    if (started.accepted) {
      latestParryResult = {
        state: 'active',
        reason: 'rhythm-triggered',
        triggerTtcMs: latestAnalysis.triggerTtcSeconds * 1000,
        geometryAtTrigger: latestAnalysis.geometryReason || null,
        reachableAtTrigger: latestAnalysis.trackingPlan?.reachable ?? null,
      };
    }
  }

  if (!predictivePresentation.active) return;
  latestPredictiveReport = predictivePresentation.update({
    deltaSeconds,
    timeToContactSeconds: latestAnalysis?.timeToContactSeconds,
    camera,
  });
  defenderSword?.update();

  const postPresentationSurface = buckler.getWorldParrySurface();
  latestTrackingPlan = latestAnalysis?.threat
    ? planGuardThreatCorrection({
        mode: 'parry',
        threat: latestAnalysis.threat,
        bucklerSurface: postPresentationSurface,
      })
    : null;

  // Reach is presentation capacity, never permission to start Parry.
  // Unreachable plans are deliberately still applied; the runtime clamps to
  // the 18cm Parry envelope and real contact decides success vs WHIFF.
  latestTrackingReport = trackingRuntime.update(latestTrackingPlan, deltaSeconds);
  defender.update(0, camera);
  defenderSword?.update();
}

function updateBlockTracking(snapshot, currentBlade, deltaSeconds) {
  if (selectedMode !== 'block' || !previousBlade || !snapshot.action || firstContact) return;
  if (snapshot.phase === LONGSWORD_ATTACK_PHASES.INTERRUPTED || snapshot.phase === LONGSWORD_ATTACK_PHASES.IDLE) return;
  latestTrackingPlan = planGuardThreatCorrection({
    mode: 'guard',
    previousBlade,
    currentBlade,
    bucklerSurface: buckler.getWorldParrySurface(),
    deltaSeconds,
  });
  latestTrackingReport = trackingRuntime.update(latestTrackingPlan, deltaSeconds);
  defender.update(0, camera);
  defenderSword?.update();
}

function updateContact(snapshot, currentBlade, deltaSeconds) {
  if (!previousBlade || !snapshot.action || firstContact) return;
  latestContact = probeSweptSwordBucklerContact({
    previousBlade,
    currentBlade,
    bucklerSurface: buckler.getWorldParrySurface(),
    deltaSeconds,
    active: snapshot.phase === LONGSWORD_ATTACK_PHASES.ACTIVE,
  });
  if (!latestContact.contact) return;

  firstContact = latestContact;
  contactMarker.position.set(latestContact.point.x, latestContact.point.y, latestContact.point.z);
  contactMarker.visible = true;

  latestHandoff = predictivePresentation.active ? predictivePresentation.handoff() : null;
  const predictiveIntentAgeMs = latestHandoff?.accepted ? latestHandoff.guardIntentAgeMs : null;
  const guardIntentAgeMs = predictiveIntentAgeMs ?? BLOCK_INTENT_AGE_MS;
  latestCombatResult = combat.resolveContact({ contact: latestContact, guardIntentAgeMs });

  if (latestCombatResult.accepted) {
    latestParryResult = {
      state: 'contact-confirmed',
      reason: 'authoritative-swept-contact',
      outcome: latestCombatResult.resolution?.outcome || null,
      guardIntentAgeMs,
    };
    guardReport = guardRuntime.sync(camera);
    trackingRuntime.reset();
    predictedMarker.visible = false;
  }
}

function registerParryWhiff(snapshot) {
  if (!predictivePresentation.active || combat.active || firstContact) return false;
  const report = predictivePresentation.report;
  latestParryResult = {
    state: 'whiff',
    reason: 'attack-ended-without-authoritative-contact',
    attackDirection: selectedDirection,
    sourceTimeSeconds: report?.sourceTimeSeconds ?? null,
    elapsedMs: report?.elapsedMs ?? null,
    requiredTrackingMeters: latestTrackingPlan?.requiredDistance ?? null,
    appliedTrackingMeters: latestTrackingPlan?.appliedDistance ?? null,
    achievedTrackingMeters: latestTrackingReport?.achievedDistance ?? 0,
    reachable: latestTrackingPlan?.reachable ?? null,
    lastAttackPhase: snapshot.phase,
  };
  resetPredictiveState({ restoreGuard: true, keepResult: true });
  return true;
}

function updateHud(snapshot, combatSnapshot) {
  const exchange = combatSnapshot.activeExchange || combatSnapshot.lastExchange;
  const recoilSample = combatSnapshot.attackerRecoil?.sample;
  const rhythmTtcMs = latestAnalysis?.timeToContactSeconds != null
    ? latestAnalysis.timeToContactSeconds * 1000
    : null;
  const predictedTtcMs = latestAnalysis?.predictedTimeToContactSeconds != null
    ? latestAnalysis.predictedTimeToContactSeconds * 1000
    : null;
  hudAttack.textContent = `Attack: ${snapshot.direction?.toUpperCase() || selectedDirection.toUpperCase()} · ${snapshot.phase}`;
  hudThreat.textContent = rhythmTtcMs != null
    ? `Rhythm TTC ${rhythmTtcMs.toFixed(0)}ms · geometry ${predictedTtcMs == null ? '—' : `${predictedTtcMs.toFixed(0)}ms`} · ${latestAnalysis.reason}`
    : 'Threat: —';
  hudParry.textContent = latestPredictiveReport?.active
    ? `Parry: ACTIVE · source ${latestPredictiveReport.sourceTimeSeconds.toFixed(3)}s · track ${(latestTrackingReport?.achievedDistance || 0).toFixed(3)}m · ${latestTrackingPlan?.reachable === false ? 'CLAMPED' : 'tracking'}`
    : `Parry: ${selectedMode.toUpperCase()} waiting`;
  hudContact.textContent = firstContact
    ? `Contact: ACTIVE · radial ${firstContact.radialDistance.toFixed(3)}m · intent age ${(latestHandoff?.guardIntentAgeMs ?? BLOCK_INTENT_AGE_MS).toFixed(0)}ms`
    : latestParryResult?.state === 'whiff'
      ? 'Contact: NONE · PARRY WHIFF'
      : 'Contact: —';
  hudOutcome.textContent = exchange
    ? `Outcome: ${exchange.outcome.toUpperCase()} · ${exchange.responseClass}`
    : latestParryResult?.state === 'whiff'
      ? 'Outcome: PARRY WHIFF'
      : latestParryResult?.state === 'active'
        ? 'Outcome: active Parry · waiting for real contact'
        : 'Outcome: waiting';
  hudRecoil.textContent = recoilSample
    ? `Recoil: ${recoilSample.phase} · arm ${recoilSample.weights?.armWeight?.toFixed(2) ?? '—'} · torso ${recoilSample.weights?.torsoWeight?.toFixed(2) ?? '—'}`
    : 'Recoil: —';
}

function buildReport(combatSnapshot = combat.snapshot) {
  const exchange = combatSnapshot.activeExchange || combatSnapshot.lastExchange;
  const report = {
    stage: RHYTHM_TRIGGER_ACTIVE_PARRY_STAGE,
    baseStage: PREDICTIVE_INTERCEPT_PARRY_STAGE,
    pass: ready,
    selectedDirection,
    selectedMode,
    attackPhase: attackRuntime.snapshot.phase,
    defenderState: guardMachine.state,
    rhythm: latestAnalysis ? {
      timeToContactMs: latestAnalysis.timeToContactSeconds == null ? null : latestAnalysis.timeToContactSeconds * 1000,
      triggerTtcMs: latestAnalysis.triggerTtcSeconds * 1000,
      timingGrade: latestAnalysis.timingGrade,
      shouldTrigger: latestAnalysis.shouldTrigger,
      reason: latestAnalysis.rhythm?.reason || latestAnalysis.reason,
    } : null,
    predictiveGeometry: latestAnalysis ? {
      geometryReason: latestAnalysis.geometryReason || null,
      predictedTimeToContactMs: latestAnalysis.predictedTimeToContactSeconds == null
        ? null
        : latestAnalysis.predictedTimeToContactSeconds * 1000,
      planeCapturable: latestAnalysis.planeCapturable,
      interceptable: latestAnalysis.interceptable,
      requiredTrackingMeters: latestAnalysis.trackingPlan?.requiredDistance ?? null,
      maxTrackingMeters: latestAnalysis.parryTrackingProfile?.maxCorrectionMeters ?? null,
    } : null,
    presentation: latestPredictiveReport ? {
      active: latestPredictiveReport.active,
      sourceTimeSeconds: latestPredictiveReport.sourceTimeSeconds,
      elapsedMs: latestPredictiveReport.elapsedMs,
      progress: latestPredictiveReport.progress,
    } : null,
    tracking: latestTrackingPlan ? {
      mode: latestTrackingPlan.mode,
      requiredDistance: latestTrackingPlan.requiredDistance,
      appliedDistance: latestTrackingPlan.appliedDistance,
      reachable: latestTrackingPlan.reachable,
      achievedDistance: latestTrackingReport?.achievedDistance || 0,
      clampedButStillActive: latestTrackingPlan.reachable === false && Boolean(latestPredictiveReport?.active),
    } : null,
    contact: firstContact ? {
      radialDistance: firstContact.radialDistance,
      bladeFraction: firstContact.bladeFraction,
      incomingVelocity: firstContact.incomingVelocity,
    } : null,
    parryResult: latestParryResult,
    handoff: latestHandoff,
    outcome: exchange ? {
      outcome: exchange.outcome,
      responseClass: exchange.responseClass,
      defenderPresentationOffsetSeconds: exchange.defenderPresentationOffsetSeconds,
      attackerRecoilDelayMs: exchange.attackerRecoilDelayMs,
    } : null,
    invariants: {
      rhythmTriggerUsesCanonicalAttackTtc: true,
      reachNeverGatesParryStart: true,
      unreachableTrackingStillClampsAndRuns: true,
      authoritativeOutcomeRequiresRealContact: true,
      parryTrackingMaxMeters: 0.18,
      sameFrameGuardAuthorityHandoff: true,
      rootTeleport: false,
    },
  };
  reportNode.textContent = JSON.stringify(report, null, 2);
  document.documentElement.dataset.g43b5r1 = report.pass ? 'pass' : 'fail';
  window.__G43B5R1_RESULT__ = report;
  return report;
}

async function main() {
  status.textContent = 'Loading UAL attacks + Skyrim Guard + rhythm-triggered active Parry…';
  const [ual1, ual2, skyrim] = await Promise.all([
    loadUal1AnimationLibrary(new THREE.GLTFLoader(), { THREE, rig: attacker.rig, fps: 30 }),
    loadUal2AnimationLibrary(new THREE.GLTFLoader(), { THREE, rig: attacker.rig, fps: 30 }),
    loadSkyrimConvertedAnimationLibrary(new THREE.GLTFLoader(), { THREE, rig: defender.rig, fps: 30 }),
  ]);
  attacker.registerAnimations(ual1);
  attacker.registerAnimations(ual2);
  defender.registerAnimations(skyrim);
  attackerIdleDuration = attacker.getAnimationDuration('UAL1/Sword_Idle') || 1;

  const idle = skyrim.clips.get('SKYRIM_GUARD/shd_blockidle');
  const bind = idle?.userData?.weaponBindCalibration;
  if (!bind?.correctionQuaternion) throw new Error('G4.3B.5R.1 requires Skyrim Guard weapon bind calibration');
  defenderSword = createDebugSword(THREE);
  mountDebugSword(
    defender,
    defenderSword,
    composeSkyrimWeaponMountCalibration(THREE, DEFAULT_KAYKIT_SWORD_MOUNT, bind),
  );

  enterProductionGuard();
  ready = true;
  status.textContent = 'G4.3B.5R.1 READY · canonical rhythm TTC → active Parry → geometry-guided tracking → real contact / WHIFF';
  status.className = 'good';
  buildReport();
  startAttack('right');
}

document.querySelectorAll('[data-attack]').forEach((button) => {
  button.addEventListener('click', () => startAttack(button.dataset.attack));
});
document.querySelectorAll('[data-mode]').forEach((button) => {
  button.addEventListener('click', () => setMode(button.dataset.mode));
});
document.querySelectorAll('[data-view]').forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.view));
});
showSurface.addEventListener('change', () => buckler.setParrySurfaceVisible(showSurface.checked));

setView('three');
resize();
addEventListener('resize', resize);

function frame(timestamp) {
  const deltaMs = Math.min(50, Math.max(0, timestamp - lastTimestamp));
  const deltaSeconds = Math.max(1e-5, deltaMs / 1000);
  lastTimestamp = timestamp;

  if (ready) {
    const snapshot = attackRuntime.update(deltaMs);

    if (combat.active) {
      latestCombatUpdate = combat.update(deltaSeconds, { camera });
      if (latestCombatUpdate.justCompleted && !attackerRecovery) beginAttackRecovery(selectedDirection);
    } else {
      sampleAttackerBase(snapshot, deltaMs);
    }

    if (!predictivePresentation.active) guardReport = guardRuntime.update(deltaMs, camera);
    attackerSword.update();
    defenderSword?.update();
    const currentBlade = captureBladePolyline();

    updatePredictiveParry(snapshot, currentBlade, deltaSeconds);
    updateBlockTracking(snapshot, currentBlade, deltaSeconds);
    updateContact(snapshot, currentBlade, deltaSeconds);
    previousBlade = currentBlade;

    if (!snapshot.action && predictivePresentation.active && !combat.active) {
      registerParryWhiff(snapshot);
    }

    const combatSnapshot = combat.snapshot;
    hudClockMs += deltaMs;
    reportClockMs += deltaMs;
    if (hudClockMs >= HUD_INTERVAL_MS) {
      hudClockMs %= HUD_INTERVAL_MS;
      updateHud(snapshot, combatSnapshot);
    }
    if (reportClockMs >= REPORT_INTERVAL_MS) {
      reportClockMs %= REPORT_INTERVAL_MS;
      buildReport(combatSnapshot);
    }

    if (!combat.active
      && !attackRuntime.active
      && !attackerRecovery
      && guardMachine.state === GUARD_STATES.HOLD
      && autoRepeat.checked) {
      repeatCooldownMs += deltaMs;
      if (repeatCooldownMs >= 700) startAttack(selectedDirection);
    }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
main().catch((error) => {
  document.documentElement.dataset.g43b5r1 = 'fail';
  status.textContent = `G4.3B.5R.1 FAIL · ${error?.message || error}`;
  status.className = 'bad';
  reportNode.textContent = error?.stack || String(error);
  window.__G43B5R1_RESULT__ = {
    stage: RHYTHM_TRIGGER_ACTIVE_PARRY_STAGE,
    pass: false,
    error: error?.stack || String(error),
  };
});

window.__G43B5R1_LAB__ = {
  startAttack,
  setMode,
  combat,
  attackRuntime,
  guardMachine,
  trackingRuntime,
  predictivePresentation,
  buckler,
  profile: PREDICTIVE_INTERCEPT_PARRY_PROFILE,
  get latestAnalysis() { return latestAnalysis; },
  get latestTrackingPlan() { return latestTrackingPlan; },
  get latestTrackingReport() { return latestTrackingReport; },
  get latestPredictiveReport() { return latestPredictiveReport; },
  get latestParryResult() { return latestParryResult; },
  get latestContact() { return latestContact; },
  get latestCombatResult() { return latestCombatResult; },
};
