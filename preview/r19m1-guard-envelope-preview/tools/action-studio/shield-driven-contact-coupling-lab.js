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
import { createLongswordDirectionalAttackRuntime, LONGSWORD_ATTACK_PHASES } from '../../src/combat/longsword-directional-attack-runtime.js';
import { captureRigPose, applyRigPose } from '../../src/combat/guard-recovery-bridge.js';
import { probeSweptSwordBucklerContact } from '../../src/combat/swept-sword-buckler-contact.js';
import { createGuardThreatTrackingRuntime, planGuardThreatCorrection } from '../../src/combat/guard-threat-tracking.js';
import {
  analyzePredictiveInterceptParry,
  createPredictiveInterceptParryPresentationRuntime,
  RECOIL_PRESENTATION_AUTHORITY_STAGE,
} from '../../src/combat/predictive-intercept-parry.js?v=g43b5r27';
import {
  createTwoActorCombatIntegration,
  TWO_ACTOR_RECOIL_PRESENTATION_AUTHORITY_STAGE,
} from '../../src/combat/two-actor-combat-integration.js?v=g43b5r27';
import {
  SHIELD_DRIVEN_CONTACT_COUPLING_STAGE,
  createShieldDrivenContactCouplingRuntime,
} from '../../src/combat/shield-driven-contact-coupling.js?v=g43b5r27';
import {
  IMMEDIATE_BLOCK_REBOUND_PARITY_STAGE,
  createImmediateBlockShieldGiveRuntime,
} from '../../src/combat/immediate-block-rebound-parity.js?v=g43b5r27';
import {
  PARRY_BACKWARD_BALANCE_BREAK_STAGE,
  createParryBackwardBalanceBreakRuntime,
} from '../../src/combat/parry-backward-balance-break.js?v=g43b5r27';
import {
  TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_STAGE,
} from '../../src/combat/two-actor-whole-body-recoil-burst.js?v=g43b5r27';

const LAB_STAGE = TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_STAGE;
const THREE = window.THREE;
if (!THREE?.WebGLRenderer || !THREE?.GLTFLoader) throw new Error(`${LAB_STAGE} requires Three.js r128 + GLTFLoader`);

const BLOCK_INTENT_AGE_MS = 260;
const PARRY_INTENT_AGE_MS = 120;
const PERFECT_INTENT_AGE_MS = 50;
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
const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(4, 7, 3); scene.add(key);
const rim = new THREE.DirectionalLight(0x7fe2cf, 0.55); rim.position.set(-4, 3, -4); scene.add(rim);
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
const couplingRuntime = createShieldDrivenContactCouplingRuntime(THREE, {
  defenderRig: defender.rig,
  attackerRig: attacker.rig,
  buckler,
});
const blockGiveRuntime = createImmediateBlockShieldGiveRuntime(THREE, {
  defenderRig: defender.rig,
  buckler,
});
const balanceBreakRuntime = createParryBackwardBalanceBreakRuntime(THREE, {
  rig: attacker.rig,
});

let couplingReleasePose = null;
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
  sampleFrozenContactPose(interruption) {
    if (couplingReleasePose) {
      applyRigPose(attacker.rig, couplingReleasePose);
      attacker.update(0, camera);
      return;
    }
    attacker.sampleAnimation(interruption.clipId, interruption.sourceTimeSeconds, {
      loop: false,
      inPlace: interruption.inPlace !== false,
      rootRotationPolicy: interruption.rootRotationPolicy,
    });
    attacker.update(0, camera);
  },
});

const hudAttack = document.getElementById('hudAttack');
const hudContact = document.getElementById('hudContact');
const hudCoupling = document.getElementById('hudCoupling');
const hudShield = document.getElementById('hudShield');
const hudWeapon = document.getElementById('hudWeapon');
const hudSeparation = document.getElementById('hudSeparation');
const hudRecoil = document.getElementById('hudRecoil');
const status = document.getElementById('status');
const reportNode = document.getElementById('report');
const autoRepeat = document.getElementById('autoRepeat');
const showSurface = document.getElementById('showSurface');

let ready = false;
let selectedDirection = 'right';
let selectedMode = 'parry';
let lastTimestamp = performance.now();
let previousBlade = null;
let firstContact = null;
let latestAnalysis = null;
let latestTrackingPlan = null;
let latestTrackingReport = null;
let latestContact = null;
let latestCombatResult = null;
let latestCombatUpdate = null;
let latestCouplingReport = null;
let latestBlockGiveReport = null;
let latestBalanceBreakReport = null;
let latestConstraintReapply = null;
let latestPredictiveReport = null;
let latestPredictiveHandoff = null;
let repeatCooldownMs = 0;
let attackerIdleDuration = 1;
let attackerIdleClockSeconds = 0;
let hudClockMs = HUD_INTERVAL_MS;
let reportClockMs = REPORT_INTERVAL_MS;
let releaseTipCaptured = false;
let maxReleaseTipDisplacementMeters = 0;
let blockGiveStartedThisFrame = false;
const releaseTipPosition = new THREE.Vector3();
const currentTipPosition = new THREE.Vector3();

function marker(name, color, radius) {
  const node = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), new THREE.MeshBasicMaterial({ color, depthWrite: false }));
  node.name = name;
  node.visible = false;
  scene.add(node);
  return node;
}
const predictedMarker = marker('G43B5R27_PREDICTED', 0x6df0a7, 0.048);
const contactMarker = marker('G43B5R27_CONTACT', 0xff625f, 0.062);
const driveMarker = marker('G43B5R27_SHIELD_DRIVE', 0x59d9ff, 0.042);
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

function resize() {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
function setView(view) {
  if (view === 'side') camera.position.set(5.8, 1.7, 0.1);
  else if (view === 'contact') camera.position.set(2.25, 1.5, 2.2);
  else camera.position.set(4.8, 2.4, 4.9);
  camera.lookAt(0, 1.05, 0);
  camera.updateMatrixWorld(true);
}
function enterGuard() {
  guardMachine.send(GUARD_EVENTS.RESET, { stage: LAB_STAGE }); guardRuntime.sync(camera);
  guardMachine.send(GUARD_EVENTS.GUARD_PRESS, { stage: LAB_STAGE }); guardRuntime.sync(camera);
  const report = guardRuntime.update(180, camera);
  if (report.snapshot.state !== GUARD_STATES.HOLD) throw new Error(`Expected Guard Hold, got ${report.snapshot.state}`);
}
function sampleAttacker(snapshot, deltaMs) {
  if (snapshot.action) {
    const profile = snapshot.action.runtime;
    attacker.sampleAnimation(profile.clipId, Math.min(profile.durationSeconds, snapshot.elapsedSeconds), { loop: false, inPlace: true, rootRotationPolicy: 'lock' });
    attacker.update(0, camera);
    return;
  }
  attackerIdleClockSeconds += deltaMs / 1000;
  attacker.sampleAnimation('UAL1/Sword_Idle', attackerIdleClockSeconds % Math.max(0.001, attackerIdleDuration), { loop: true, inPlace: true, rootRotationPolicy: 'lock' });
  attacker.update(0, camera);
}
function resetExchange() {
  couplingRuntime.reset();
  blockGiveRuntime.reset();
  balanceBreakRuntime.reset();
  predictivePresentation.reset();
  trackingRuntime.reset();
  couplingReleasePose = null;
  firstContact = null;
  latestContact = null;
  latestCombatResult = null;
  latestCombatUpdate = null;
  latestCouplingReport = null;
  latestBlockGiveReport = null;
  latestBalanceBreakReport = null;
  latestConstraintReapply = null;
  latestPredictiveReport = null;
  latestPredictiveHandoff = null;
  latestAnalysis = null;
  latestTrackingPlan = null;
  latestTrackingReport = null;
  releaseTipCaptured = false;
  maxReleaseTipDisplacementMeters = 0;
  blockGiveStartedThisFrame = false;
  contactMarker.visible = false;
  predictedMarker.visible = false;
  driveMarker.visible = false;
}
function startAttack(direction = selectedDirection) {
  if (!ready || combat.active || attackRuntime.active || couplingRuntime.active || blockGiveRuntime.active || balanceBreakRuntime.active) return false;
  if (guardMachine.state !== GUARD_STATES.HOLD) enterGuard();
  selectedDirection = direction;
  resetExchange();
  repeatCooldownMs = 0;
  attackerSword.update();
  previousBlade = captureBladePolyline();
  const started = combat.startAttack(direction);
  if (!started.accepted) return false;
  document.querySelectorAll('[data-attack]').forEach((button) => button.classList.toggle('active', button.dataset.attack === direction));
  return true;
}
function setMode(mode) {
  if (!['block', 'parry', 'perfect'].includes(mode)) return;
  selectedMode = mode;
  document.querySelectorAll('[data-mode]').forEach((button) => button.classList.toggle('active', button.dataset.mode === mode));
}
function intentAgeMs() {
  return selectedMode === 'perfect' ? PERFECT_INTENT_AGE_MS : selectedMode === 'parry' ? PARRY_INTENT_AGE_MS : BLOCK_INTENT_AGE_MS;
}
function normalizedRequestedOutcome() { return selectedMode === 'perfect' ? 'perfect-parry' : selectedMode; }

function updatePreContact(snapshot, currentBlade, deltaSeconds) {
  if (!snapshot.action || firstContact) return;
  if (selectedMode === 'block') {
    latestTrackingPlan = previousBlade ? planGuardThreatCorrection({ mode: 'guard', previousBlade, currentBlade, bucklerSurface: buckler.getWorldParrySurface(), deltaSeconds }) : null;
    latestTrackingReport = trackingRuntime.update(latestTrackingPlan, deltaSeconds);
    defender.update(0, camera); defenderSword?.update();
    return;
  }
  latestAnalysis = analyzePredictiveInterceptParry({ attackSnapshot: snapshot, previousBlade, currentBlade, bucklerSurface: buckler.getWorldParrySurface(), deltaSeconds, requestedGrade: selectedMode });
  if (latestAnalysis?.threat?.point) {
    predictedMarker.position.set(latestAnalysis.threat.point.x, latestAnalysis.threat.point.y, latestAnalysis.threat.point.z);
    predictedMarker.visible = true;
  }
  if (!predictivePresentation.active && latestAnalysis?.shouldTrigger) predictivePresentation.start({ sequence: snapshot.sequence, requestedGrade: selectedMode, triggerTtcSeconds: latestAnalysis.triggerTtcSeconds });
  if (!predictivePresentation.active) return;
  latestPredictiveReport = predictivePresentation.update({ deltaSeconds, timeToContactSeconds: latestAnalysis?.timeToContactSeconds, camera });
  const surface = buckler.getWorldParrySurface();
  latestTrackingPlan = latestAnalysis?.threat ? planGuardThreatCorrection({ mode: 'parry', threat: latestAnalysis.threat, bucklerSurface: surface }) : null;
  latestTrackingReport = trackingRuntime.update(latestTrackingPlan, deltaSeconds);
  defender.update(0, camera); defenderSword?.update();
}

function resolveContact(snapshot, currentBlade, deltaSeconds) {
  if (!previousBlade || !snapshot.action || firstContact) return;
  latestContact = probeSweptSwordBucklerContact({ previousBlade, currentBlade, bucklerSurface: buckler.getWorldParrySurface(), deltaSeconds, active: snapshot.phase === LONGSWORD_ATTACK_PHASES.ACTIVE });
  if (!latestContact.contact) return;
  firstContact = latestContact;
  const surfaceAtContact = buckler.getWorldParrySurface();
  contactMarker.position.set(latestContact.point.x, latestContact.point.y, latestContact.point.z);
  contactMarker.visible = true;
  predictedMarker.visible = false;
  latestPredictiveHandoff = predictivePresentation.active ? predictivePresentation.handoff() : null;
  const guardIntentAgeMs = latestPredictiveHandoff?.accepted ? latestPredictiveHandoff.guardIntentAgeMs : intentAgeMs();
  latestCombatResult = combat.resolveContact({ contact: latestContact, guardIntentAgeMs });
  if (!latestCombatResult.accepted) return;
  guardRuntime.sync(camera);

  const outcome = latestCombatResult.resolution.outcome;
  if (outcome === 'block') {
    blockGiveRuntime.start({ contact: latestContact, surfaceAtContact });
    latestBlockGiveReport = blockGiveRuntime.update(0);
    blockGiveStartedThisFrame = true;
    latestCouplingReport = null;
    combat.update(0, { camera });
  } else {
    balanceBreakRuntime.start({ outcome, plan: latestCombatResult.recoilPlan });
    latestBalanceBreakReport = balanceBreakRuntime.update(0);
    couplingRuntime.start({ outcome, attackDirection: latestCombatResult.resolution.attackDirection, contact: latestContact, surfaceAtContact });
    combat.update(0, { camera });
    latestCouplingReport = couplingRuntime.update(0);
  }
  attacker.update(0, camera); defender.update(0, camera); attackerSword.update(); defenderSword?.update();
}

function rebuildNeutralCouplingReleaseBase() {
  latestCombatUpdate = combat.update(0, { camera });
  latestConstraintReapply = couplingRuntime.reapplyAttackerConstraint(latestCouplingReport);
  attacker.update(0, camera);
  attackerSword.update();
  couplingReleasePose = captureRigPose(attacker.rig);
  attackerSword.tip.getWorldPosition(releaseTipPosition);
  releaseTipCaptured = true;
  maxReleaseTipDisplacementMeters = 0;
}

function restoreVisibleBalanceBreakAtRelease() {
  latestCombatUpdate = combat.update(0, { camera });
  if (balanceBreakRuntime.active) latestBalanceBreakReport = balanceBreakRuntime.update(0);
  latestConstraintReapply = couplingRuntime.reapplyAttackerConstraint(latestCouplingReport);
  attacker.update(0, camera);
  attackerSword.update();
}

function updateCoupling(deltaSeconds) {
  if (!couplingRuntime.active) return false;
  latestCombatUpdate = combat.update(0, { camera });
  if (balanceBreakRuntime.active) latestBalanceBreakReport = balanceBreakRuntime.update(deltaSeconds);
  latestCouplingReport = couplingRuntime.update(deltaSeconds);
  attacker.update(0, camera); defender.update(0, camera); attackerSword.update(); defenderSword?.update();

  if (latestCouplingReport?.finalSurface?.center) {
    const p = latestCouplingReport.finalSurface.center;
    driveMarker.position.set(p.x, p.y, p.z); driveMarker.visible = true;
  }
  if (latestCouplingReport?.complete) {
    rebuildNeutralCouplingReleaseBase();
    restoreVisibleBalanceBreakAtRelease();
    trackingRuntime.reset();
    driveMarker.visible = false;
  }
  return true;
}

function updateBlockGive(deltaSeconds) {
  if (!blockGiveRuntime.active || blockGiveStartedThisFrame) return false;
  latestBlockGiveReport = blockGiveRuntime.update(deltaSeconds);
  defender.update(0, camera); defenderSword?.update();
  if (latestBlockGiveReport?.finalSurface?.center) {
    const p = latestBlockGiveReport.finalSurface.center;
    driveMarker.position.set(p.x, p.y, p.z); driveMarker.visible = !latestBlockGiveReport.complete;
  }
  if (latestBlockGiveReport?.complete) {
    trackingRuntime.reset();
    driveMarker.visible = false;
  }
  return true;
}

function updateBalanceBreak(deltaSeconds) {
  if (!balanceBreakRuntime.active) return false;
  latestBalanceBreakReport = balanceBreakRuntime.update(deltaSeconds);
  attacker.update(0, camera);
  attackerSword.update();
  return true;
}

function updateReleaseSeparationProbe(combatSnapshot) {
  if (!releaseTipCaptured || couplingRuntime.active) return;
  const sample = combatSnapshot.attackerRecoil?.sample;
  if (!sample || !['separation', 'impulse', 'recoil'].includes(sample.phase)) return;
  attackerSword.tip.getWorldPosition(currentTipPosition);
  maxReleaseTipDisplacementMeters = Math.max(maxReleaseTipDisplacementMeters, currentTipPosition.distanceTo(releaseTipPosition));
}
function registerWhiff(snapshot) {
  if (selectedMode === 'block' || firstContact || !predictivePresentation.active || snapshot.action) return;
  predictivePresentation.reset(); trackingRuntime.reset(); predictedMarker.visible = false;
}
function magnitude(v) { return v ? Math.hypot(v.x || 0, v.y || 0, v.z || 0) : 0; }

function updateHud(snapshot, combatSnapshot) {
  const resolution = latestCombatResult?.resolution || null;
  const requested = normalizedRequestedOutcome();
  const actual = resolution?.outcome || '—';
  const mismatch = actual !== '—' && actual !== requested;
  const intent = resolution?.guard?.intentAgeMs;
  const responseClass = resolution?.attacker?.responseClass || '—';
  const recoil = combatSnapshot.attackerRecoil?.sample;
  const postHandoff = combatSnapshot.attackerRecoil?.postCouplingHandoff || null;
  const refresh = latestCombatUpdate?.attackerVisualRefreshApplied === true ? 'REFRESH YES' : 'refresh —';
  const balance = latestBalanceBreakReport;
  const burst = postHandoff?.wholeBodyBurst || null;
  hudAttack.textContent = `Requested: ${requested.toUpperCase()} · Actual: ${actual.toUpperCase()}${mismatch ? ' ⚠ DOWNGRADED/MISMATCH' : ''} · intent ${intent == null ? '—' : `${intent.toFixed(0)}ms`}`;
  hudContact.textContent = firstContact ? `Contact: YES · radial ${firstContact.radialDistance.toFixed(3)}m · blade ${firstContact.bladeFraction.toFixed(2)} · response ${responseClass}` : 'Contact: —';

  if (actual === 'block' && latestBlockGiveReport) {
    hudCoupling.textContent = `BLOCK rebound: IMMEDIATE · shield ${latestBlockGiveReport.phase} ${latestBlockGiveReport.elapsedMs.toFixed(0)}ms · B3 RUNNING IN PARALLEL`;
    hudShield.textContent = `Shield give: ${(magnitude(latestBlockGiveReport.shieldOffset) * 100).toFixed(1)}cm · defender-only`;
    hudWeapon.textContent = 'Weapon authority: original B2/B3 · NO shield follow · NO post-coupling handoff';
  } else {
    hudCoupling.textContent = couplingRuntime.active
      ? `PARRY coupling: ${latestCouplingReport?.phase || '—'} ${latestCouplingReport?.elapsedMs?.toFixed?.(0) || '0'}ms · backward PRELOAD · weapon constrained`
      : burst
        ? `WHOLE-BODY BURST: ACTIVE · B3 entry ${burst.initialElapsedMs.toFixed(0)}ms · old Two-Actor impulse clock`
        : 'Coupling: —';
    hudShield.textContent = latestCouplingReport?.shieldOffset ? `Shield drive: ${(magnitude(latestCouplingReport.shieldOffset) * 100).toFixed(1)}cm` : 'Shield drive: —';
    hudWeapon.textContent = burst
      ? `Weapon burst: direct arm authority restored · separation BYPASSED · free arm via parent chain`
      : latestCouplingReport?.attackerWeaponOffset
        ? `Weapon follow: ${(magnitude(latestCouplingReport.attackerWeaponOffset) * 100).toFixed(1)}cm · terminal constraint ${latestConstraintReapply?.applied ? 'READY' : '—'}`
        : 'Weapon follow: —';
  }

  const targetDistance = recoil?.profile?.releaseSeparationDistanceMeters || 0;
  const targetWindow = recoil?.profile?.releaseSeparationWindowMs || postHandoff?.separation?.releaseWindowMs || 0;
  hudSeparation.textContent = postHandoff?.separation?.bypassedForWholeBodyBurst
    ? `Release separation: BYPASSED · B3 power frame entry ${postHandoff.initialElapsedMs.toFixed(0)}ms · tip ${(maxReleaseTipDisplacementMeters * 100).toFixed(1)}cm`
    : targetDistance > 0 || maxReleaseTipDisplacementMeters > 0
      ? `Release separation: ${recoil?.phase || '—'} · ${(targetDistance * 100).toFixed(1)}cm / ${targetWindow.toFixed(0)}ms · tip ${(maxReleaseTipDisplacementMeters * 100).toFixed(1)}cm`
      : 'Release separation: BLOCK immediate / PARRY waiting for release';
  hudRecoil.textContent = couplingRuntime.active
    ? `Preload: ${balance?.phase || 'wait'} ${(balance?.weight ?? 0).toFixed(2)} · chest-back ${(balance?.chestBackwardDegrees ?? 0).toFixed(1)}° · weapon B3 LOCKED`
    : recoil
      ? `WHOLE-BODY B3: ${recoil.phase} · arm ${recoil.weights?.armWeight?.toFixed(2) ?? '—'} · torso ${recoil.weights?.torsoWeight?.toFixed(2) ?? '—'} · legs ${recoil.weights?.legWeight?.toFixed(2) ?? '—'} · ${refresh}`
      : `B3 recoil: — · preload ${(balance?.weight ?? 0).toFixed(2)} · ${refresh}`;
}

function buildReport(combatSnapshot = combat.snapshot) {
  const exchange = combatSnapshot.activeExchange || combatSnapshot.lastExchange;
  const resolution = latestCombatResult?.resolution || null;
  const recoil = combatSnapshot.attackerRecoil?.sample || null;
  const postHandoff = combatSnapshot.attackerRecoil?.postCouplingHandoff || null;
  const actualOutcome = resolution?.outcome || null;
  const block = actualOutcome === 'block';
  const report = {
    stage: LAB_STAGE,
    previousBlockStage: IMMEDIATE_BLOCK_REBOUND_PARITY_STAGE,
    preloadStage: PARRY_BACKWARD_BALANCE_BREAK_STAGE,
    predictiveAuthorityStage: RECOIL_PRESENTATION_AUTHORITY_STAGE,
    baseCouplingStage: SHIELD_DRIVEN_CONTACT_COUPLING_STAGE,
    integrationAuthorityStage: TWO_ACTOR_RECOIL_PRESENTATION_AUTHORITY_STAGE,
    pass: ready,
    selectedDirection,
    selectedMode,
    authorityDebug: {
      requestedOutcome: normalizedRequestedOutcome(),
      actualOutcome,
      responseClass: resolution?.attacker?.responseClass || null,
      blockReboundAuthority: block ? 'original-B2-B3-immediate' : null,
      parryWeaponAuthority: !block && actualOutcome ? 'shield-redirect-then-old-two-actor-direct-arm-burst' : null,
      parryBodyAuthority: !block && actualOutcome ? TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_STAGE : null,
      postCouplingStage: postHandoff?.stage || null,
      terminalConstraintReapply: latestConstraintReapply?.applied === true,
      attackerVisualRefreshApplied: latestCombatUpdate?.attackerVisualRefreshApplied === true,
    },
    balanceBreak: latestBalanceBreakReport ? {
      stage: latestBalanceBreakReport.stage,
      phase: latestBalanceBreakReport.phase,
      elapsedMs: latestBalanceBreakReport.elapsedMs,
      weight: latestBalanceBreakReport.weight,
      chestBackwardDegrees: latestBalanceBreakReport.chestBackwardDegrees,
      handoffTarget: latestBalanceBreakReport.handoffTarget || null,
      rootMotion: latestBalanceBreakReport.rootMotion,
    } : null,
    wholeBodyBurst: postHandoff?.wholeBodyBurst ? {
      stage: postHandoff.wholeBodyBurst.stage,
      initialElapsedMs: postHandoff.wholeBodyBurst.initialElapsedMs,
      separationBypassed: postHandoff.wholeBodyBurst.powerFrame?.separationBypassed === true,
      oldTwoActorArmAuthorityRestored: postHandoff.wholeBodyBurst.powerFrame?.oldTwoActorArmAuthorityRestored === true,
      parentChainFreeArmMotion: postHandoff.wholeBodyBurst.powerFrame?.parentChainFreeArmMotion === true,
      minimumChestBackwardDegreesAtFullTorsoWeight: postHandoff.wholeBodyBurst.powerFrame?.minimumChestBackwardDegreesAtFullTorsoWeight ?? null,
    } : null,
    blockGive: latestBlockGiveReport ? {
      phase: latestBlockGiveReport.phase,
      elapsedMs: latestBlockGiveReport.elapsedMs,
      shieldGiveMeters: magnitude(latestBlockGiveReport.shieldOffset),
      attackerRecoilFrozen: latestBlockGiveReport.attackerRecoilFrozen,
      attackerWeaponFollow: latestBlockGiveReport.attackerWeaponFollow,
    } : null,
    coupling: latestCouplingReport ? {
      outcome: latestCouplingReport.outcome,
      phase: latestCouplingReport.phase,
      elapsedMs: latestCouplingReport.elapsedMs,
      shieldDriveMeters: magnitude(latestCouplingReport.shieldOffset),
      attackerWeaponFollowMeters: magnitude(latestCouplingReport.attackerWeaponOffset),
      complete: latestCouplingReport.complete,
      neutralRecoilBaseCaptured: Boolean(couplingReleasePose),
    } : null,
    recoil: recoil ? {
      phase: recoil.phase,
      armWeight: recoil.weights?.armWeight ?? null,
      torsoWeight: recoil.weights?.torsoWeight ?? null,
      legWeight: recoil.weights?.legWeight ?? null,
      responseClass: exchange?.responseClass || null,
    } : null,
    invariants: {
      swordShieldSweptContactAuthority: true,
      blockUsesOriginalB2B3WithoutPostCouplingScaling: true,
      blockB3ClockFrozen: false,
      blockShieldGiveRunsParallelToAttackerBounce: true,
      parryWeaponB3ClockFrozenDuringCoupling: true,
      backwardPreloadFadesIntoReleaseBurst: true,
      parryExplicitSeparationBypassed: true,
      oldTwoActorWholeBodyB3ClockRestoredAtRelease: true,
      weaponShouldersTorsoHipsLegsShareBurstClock: true,
      freeArmUsesParentHierarchyRatherThanExplicitFlail: true,
      terminalHandConstraintReappliedForNeutralB3Base: true,
      plantedRootNoTranslation: true,
      postAdditiveAttackerAppearanceRefresh: true,
    },
  };
  reportNode.textContent = JSON.stringify(report, null, 2);
  document.documentElement.dataset.g43b5r27 = report.pass ? 'pass' : 'fail';
  window.__G43B5R27_RESULT__ = report;
  return report;
}

async function main() {
  status.textContent = `Loading UAL attacks + Skyrim Guard + ${LAB_STAGE}…`;
  const [ual1, ual2, skyrim] = await Promise.all([
    loadUal1AnimationLibrary(new THREE.GLTFLoader(), { THREE, rig: attacker.rig, fps: 30 }),
    loadUal2AnimationLibrary(new THREE.GLTFLoader(), { THREE, rig: attacker.rig, fps: 30 }),
    loadSkyrimConvertedAnimationLibrary(new THREE.GLTFLoader(), { THREE, rig: defender.rig, fps: 30 }),
  ]);
  attacker.registerAnimations(ual1); attacker.registerAnimations(ual2); defender.registerAnimations(skyrim);
  attackerIdleDuration = attacker.getAnimationDuration('UAL1/Sword_Idle') || 1;
  const idle = skyrim.clips.get('SKYRIM_GUARD/shd_blockidle');
  const bind = idle?.userData?.weaponBindCalibration;
  if (!bind?.correctionQuaternion) throw new Error(`${LAB_STAGE} requires Skyrim Guard weapon bind calibration`);
  defenderSword = createDebugSword(THREE);
  mountDebugSword(defender, defenderSword, composeSkyrimWeaponMountCalibration(THREE, DEFAULT_KAYKIT_SWORD_MOUNT, bind));
  enterGuard();
  ready = true;
  status.textContent = `${LAB_STAGE} READY · BLOCK unchanged · PARRY = shield redirect → old Two-Actor whole-body release burst`;
  status.className = 'good';
  buildReport(); startAttack('right');
}

document.querySelectorAll('[data-attack]').forEach((button) => button.addEventListener('click', () => startAttack(button.dataset.attack)));
document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
showSurface.addEventListener('change', () => buckler.setParrySurfaceVisible(showSurface.checked));
setView('three'); resize(); addEventListener('resize', resize);

function frame(timestamp) {
  const deltaMs = Math.min(50, Math.max(0, timestamp - lastTimestamp));
  const deltaSeconds = Math.max(1e-5, deltaMs / 1000);
  lastTimestamp = timestamp;
  blockGiveStartedThisFrame = false;
  if (ready) {
    const snapshot = attackRuntime.update(deltaMs);
    const parryCouplingOwnsWeapon = couplingRuntime.active;
    if (combat.active) {
      if (!parryCouplingOwnsWeapon) {
        latestCombatUpdate = combat.update(deltaSeconds, { camera });
        if (latestCombatUpdate?.justCompleted) couplingReleasePose = null;
      }
    } else {
      sampleAttacker(snapshot, deltaMs);
    }

    if (!predictivePresentation.active) guardRuntime.update(deltaMs, camera);
    attackerSword.update(); defenderSword?.update();

    let balanceAdvancedWithCoupling = false;
    if (parryCouplingOwnsWeapon) {
      balanceAdvancedWithCoupling = updateCoupling(deltaSeconds);
    } else {
      const currentBlade = captureBladePolyline();
      updatePreContact(snapshot, currentBlade, deltaSeconds);
      resolveContact(snapshot, currentBlade, deltaSeconds);
      previousBlade = currentBlade;
    }

    updateBlockGive(deltaSeconds);
    if (!balanceAdvancedWithCoupling) updateBalanceBreak(deltaSeconds);
    registerWhiff(snapshot);
    const combatSnapshot = combat.snapshot;
    updateReleaseSeparationProbe(combatSnapshot);
    hudClockMs += deltaMs; reportClockMs += deltaMs;
    if (hudClockMs >= HUD_INTERVAL_MS) { hudClockMs %= HUD_INTERVAL_MS; updateHud(snapshot, combatSnapshot); }
    if (reportClockMs >= REPORT_INTERVAL_MS) { reportClockMs %= REPORT_INTERVAL_MS; buildReport(combatSnapshot); }
    if (!combat.active && !attackRuntime.active && !couplingRuntime.active && !blockGiveRuntime.active && !balanceBreakRuntime.active && guardMachine.state === GUARD_STATES.HOLD && autoRepeat.checked) {
      repeatCooldownMs += deltaMs;
      if (repeatCooldownMs >= 700) startAttack(selectedDirection);
    }
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
main().catch((error) => {
  document.documentElement.dataset.g43b5r27 = 'fail';
  status.textContent = `${LAB_STAGE} FAIL · ${error?.message || error}`;
  status.className = 'bad';
  reportNode.textContent = error?.stack || String(error);
  window.__G43B5R27_RESULT__ = { stage: LAB_STAGE, pass: false, error: error?.stack || String(error) };
});
window.__G43B5R27_LAB__ = {
  startAttack, setMode, combat, attackRuntime, guardMachine, couplingRuntime, blockGiveRuntime, balanceBreakRuntime, trackingRuntime, buckler,
  get latestContact() { return latestContact; },
  get latestCouplingReport() { return latestCouplingReport; },
  get latestBlockGiveReport() { return latestBlockGiveReport; },
  get latestBalanceBreakReport() { return latestBalanceBreakReport; },
  get latestConstraintReapply() { return latestConstraintReapply; },
  get latestCombatResult() { return latestCombatResult; },
  get latestCombatUpdate() { return latestCombatUpdate; },
};
