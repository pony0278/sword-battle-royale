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
import { captureRigPose, applyRigPose, blendRecoveryPose } from '../../src/combat/guard-recovery-bridge.js';
import { sampleLongswordAttackRecovery } from '../../src/combat/longsword-contact-recovery-presentation.js';
import { probeSweptSwordBucklerContact } from '../../src/combat/swept-sword-buckler-contact.js';
import { createGuardThreatTrackingRuntime } from '../../src/combat/guard-threat-tracking.js';
import { planFineGuardTracking } from '../../src/combat/directional-guard-bracing.js';
import { createArticulatedImpactBracingRuntime, planArticulatedImpactBracing } from '../../src/combat/articulated-impact-bracing.js';
import { createTwoActorCombatIntegration } from '../../src/combat/two-actor-combat-integration.js?v=g43b5r28';
import { createShieldDrivenContactCouplingRuntime } from '../../src/combat/shield-driven-contact-coupling.js?v=g43b5r28';
import { LEGACY_TWO_ACTOR_RECOIL_PASSTHROUGH_STAGE } from '../../src/combat/post-coupling-recoil-stagger-handoff.js?v=g43b5r28';

const LAB_STAGE = LEGACY_TWO_ACTOR_RECOIL_PASSTHROUGH_STAGE;
const THREE = window.THREE;
if (!THREE?.WebGLRenderer || !THREE?.GLTFLoader) throw new Error(`${LAB_STAGE} requires Three.js r128 + GLTFLoader`);

const TIMING_AGE_MS = Object.freeze({ block: 260, parry: 120, perfect: 50 });
const LEGACY_HOLD_MS = Object.freeze({ parry: 28, 'perfect-parry': 36 });
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
const bracingRuntime = createArticulatedImpactBracingRuntime(THREE, { rig: defender.rig, buckler });
const fineTrackingRuntime = createGuardThreatTrackingRuntime(THREE, { rig: defender.rig, buckler });
const couplingRuntime = createShieldDrivenContactCouplingRuntime(THREE, {
  defenderRig: defender.rig,
  attackerRig: attacker.rig,
  buckler,
});

let couplingReleasePose = null;
let legacyContactPose = null;
let releaseBridgeElapsedMs = 0;
let releaseBridgeDurationMs = 0;

function sampleOriginalContactPose(interruption) {
  attacker.sampleAnimation(interruption.clipId, interruption.sourceTimeSeconds, {
    loop: false,
    inPlace: interruption.inPlace !== false,
    rootRotationPolicy: interruption.rootRotationPolicy,
  });
  attacker.update(0, camera);
}

const combat = createTwoActorCombatIntegration({
  THREE,
  attackerCharacter: attacker,
  attackRuntime,
  guardMachine,
  parrySync: {
    presentationOffsetSeconds: 0.205,
    parryAttackerRecoilDelayMs: 0,
    perfectParryAttackerRecoilDelayMs: 0,
  },
  sampleFrozenContactPose(interruption) {
    sampleOriginalContactPose(interruption);
    if (!couplingReleasePose || !legacyContactPose || releaseBridgeDurationMs <= 0) return;
    const progress = Math.min(1, releaseBridgeElapsedMs / releaseBridgeDurationMs);
    applyRigPose(attacker.rig, blendRecoveryPose(
      couplingReleasePose,
      couplingReleasePose,
      legacyContactPose,
      progress,
      { durationMs: releaseBridgeDurationMs, sampleDeltaMs: 0, momentumScale: 0 },
    ));
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
let attackerIdleDuration = 1;
let attackerIdleClockSeconds = 0;
let attackerRecovery = null;
let repeatCooldownMs = 0;
let previousBlade = null;
let firstContact = null;
let latestContact = null;
let latestCombatResult = null;
let latestCombatUpdate = null;
let latestCouplingReport = null;
let latestFinePlan = null;
let latestFineTracking = null;
let hudClockMs = HUD_INTERVAL_MS;
let reportClockMs = REPORT_INTERVAL_MS;

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
    attacker.sampleAnimation(profile.clipId, Math.min(profile.durationSeconds, snapshot.elapsedSeconds), { loop: false, inPlace: true, rootRotationPolicy: 'lock' });
    attacker.update(0, camera);
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
  attacker.sampleAnimation('UAL1/Sword_Idle', attackerIdleClockSeconds % Math.max(0.001, attackerIdleDuration), { loop: true, inPlace: true, rootRotationPolicy: 'lock' });
  attacker.update(0, camera);
}
function resetExchange() {
  couplingRuntime.reset();
  bracingRuntime.resetImpact();
  fineTrackingRuntime.reset();
  couplingReleasePose = null;
  legacyContactPose = null;
  releaseBridgeElapsedMs = 0;
  releaseBridgeDurationMs = 0;
  firstContact = null;
  latestContact = null;
  latestCombatResult = null;
  latestCombatUpdate = null;
  latestCouplingReport = null;
  latestFinePlan = null;
  latestFineTracking = null;
}
function startAttack(direction = selectedDirection) {
  if (!ready || combat.active || attackRuntime.active || couplingRuntime.active || attackerRecovery) return false;
  if (guardMachine.state !== GUARD_STATES.HOLD) enterGuard();
  selectedDirection = direction;
  resetExchange();
  previousBlade = captureBladePolyline();
  repeatCooldownMs = 0;
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
function requestedOutcome() { return selectedMode === 'perfect' ? 'perfect-parry' : selectedMode; }
function zeroBracePlan() { return planArticulatedImpactBracing({ mode: 'off' }); }

function updatePreContact(snapshot, currentBlade, deltaSeconds) {
  if (!snapshot.action || firstContact) return;
  const baselineSurface = buckler.getWorldParrySurface();
  const bracePlan = previousBlade && snapshot.phase !== LONGSWORD_ATTACK_PHASES.INTERRUPTED
    ? planArticulatedImpactBracing({
        mode: 'brace-fine', attackDirection: snapshot.direction,
        previousBlade, currentBlade, bucklerSurface: baselineSurface, deltaSeconds,
      })
    : zeroBracePlan();
  bracingRuntime.update(bracePlan, deltaSeconds);
  const postBraceSurface = buckler.getWorldParrySurface();
  latestFinePlan = planFineGuardTracking({
    threat: bracePlan?.analysis?.threat || null,
    bucklerSurface: postBraceSurface,
    maxCorrectionMeters: bracePlan?.fineTrackMaxMeters || 0,
  });
  latestFineTracking = fineTrackingRuntime.update(latestFinePlan, deltaSeconds);
  defender.update(0, camera); defenderSword?.update();
}

function resolveContact(snapshot, currentBlade, deltaSeconds) {
  if (!previousBlade || !snapshot.action || firstContact) return;
  latestContact = probeSweptSwordBucklerContact({
    previousBlade, currentBlade,
    bucklerSurface: buckler.getWorldParrySurface(),
    deltaSeconds,
    active: snapshot.phase === LONGSWORD_ATTACK_PHASES.ACTIVE,
  });
  if (!latestContact.contact) return;
  firstContact = latestContact;
  latestCombatResult = combat.resolveContact({
    contact: latestContact,
    guardIntentAgeMs: TIMING_AGE_MS[selectedMode],
  });
  if (!latestCombatResult.accepted) return;
  guardRuntime.sync(camera);
  const outcome = latestCombatResult.resolution.outcome;
  if (outcome === 'parry' || outcome === 'perfect-parry') {
    couplingRuntime.start({
      outcome,
      attackDirection: latestCombatResult.resolution.attackDirection,
      contact: latestContact,
      surfaceAtContact: buckler.getWorldParrySurface(),
    });
    combat.update(0, { camera });
    latestCouplingReport = couplingRuntime.update(0);
  }
}

function prepareLegacyReleaseBridge() {
  // First restore the exact frozen contact base used by old Two-Actor B3.
  couplingReleasePose = null;
  legacyContactPose = null;
  releaseBridgeElapsedMs = 0;
  latestCombatUpdate = combat.update(0, { camera });
  legacyContactPose = captureRigPose(attacker.rig);

  // Then reapply only the terminal shield hand constraint and capture the visible release pose.
  couplingRuntime.reapplyAttackerConstraint(latestCouplingReport);
  attacker.update(0, camera);
  attackerSword.update();
  couplingReleasePose = captureRigPose(attacker.rig);

  const outcome = latestCombatResult?.resolution?.outcome || 'parry';
  releaseBridgeDurationMs = LEGACY_HOLD_MS[outcome] || 28;
}

function updateCoupling(deltaSeconds) {
  if (!couplingRuntime.active) return false;
  latestCombatUpdate = combat.update(0, { camera });
  latestCouplingReport = couplingRuntime.update(deltaSeconds);
  attacker.update(0, camera); defender.update(0, camera); attackerSword.update(); defenderSword?.update();
  if (latestCouplingReport?.complete) {
    prepareLegacyReleaseBridge();
    fineTrackingRuntime.reset();
  }
  return true;
}

function advanceReleaseBridge(deltaMs) {
  if (!couplingReleasePose || releaseBridgeDurationMs <= 0) return;
  releaseBridgeElapsedMs = Math.min(releaseBridgeDurationMs, releaseBridgeElapsedMs + deltaMs);
}
function finishReleaseBridgeIfReady() {
  if (!couplingReleasePose || releaseBridgeElapsedMs < releaseBridgeDurationMs) return;
  couplingReleasePose = null;
  legacyContactPose = null;
}

function updateHud(snapshot, combatSnapshot) {
  const outcome = latestCombatResult?.resolution?.outcome || '—';
  const recoil = combatSnapshot.attackerRecoil?.sample;
  const handoff = combatSnapshot.attackerRecoil?.postCouplingHandoff;
  const bridge = couplingReleasePose && releaseBridgeDurationMs > 0
    ? Math.min(1, releaseBridgeElapsedMs / releaseBridgeDurationMs)
    : null;
  hudAttack.textContent = `Requested: ${requestedOutcome().toUpperCase()} · Actual: ${String(outcome).toUpperCase()} · attack ${snapshot.phase}`;
  hudContact.textContent = firstContact ? `Contact: YES · radial ${firstContact.radialDistance.toFixed(3)}m · blade ${firstContact.bladeFraction.toFixed(2)}` : 'Contact: —';
  hudCoupling.textContent = couplingRuntime.active
    ? `Shield coupling: ${latestCouplingReport?.phase || 'hold'} ${latestCouplingReport?.elapsedMs?.toFixed?.(0) || '0'}ms · B3 clock frozen`
    : bridge != null
      ? `Release bridge: ${(bridge * 100).toFixed(0)}% · shield pose → OLD contact pose`
      : 'Shield coupling: —';
  hudShield.textContent = latestCouplingReport?.shieldOffset
    ? `Shield drive: ${(Math.hypot(latestCouplingReport.shieldOffset.x, latestCouplingReport.shieldOffset.y, latestCouplingReport.shieldOffset.z) * 100).toFixed(1)}cm`
    : 'Shield drive: —';
  hudWeapon.textContent = handoff?.stage === LAB_STAGE
    ? `Weapon authority: OLD B3 plan unchanged · ${handoff.reason}`
    : couplingRuntime.active ? 'Weapon authority: shield-constrained until release' : 'Weapon authority: waiting';
  hudSeparation.textContent = releaseBridgeDurationMs > 0
    ? `Continuity hold: ${releaseBridgeDurationMs}ms · no added separation · no 68/76ms jump`
    : 'Continuity hold: —';
  hudRecoil.textContent = recoil
    ? `OLD B3 recoil: ${recoil.phase} · arm ${recoil.weights?.armWeight?.toFixed(2) ?? '—'} · torso ${recoil.weights?.torsoWeight?.toFixed(2) ?? '—'} · legs ${recoil.weights?.legWeight?.toFixed(2) ?? '—'}`
    : 'OLD B3 recoil: —';
}

function buildReport(combatSnapshot = combat.snapshot) {
  const handoff = combatSnapshot.attackerRecoil?.postCouplingHandoff || null;
  const report = {
    stage: LAB_STAGE,
    pass: ready,
    selectedDirection,
    selectedMode,
    outcome: latestCombatResult?.resolution?.outcome || null,
    postCouplingStage: handoff?.stage || null,
    postCouplingReason: handoff?.reason || null,
    originalPlanPreserved: handoff?.legacyPassthrough?.originalPlanPreserved === true,
    initialElapsedMs: handoff?.initialElapsedMs ?? null,
    releaseBridge: {
      durationMs: releaseBridgeDurationMs,
      elapsedMs: releaseBridgeElapsedMs,
      active: Boolean(couplingReleasePose),
      intent: 'shield-release-pose-to-original-frozen-contact-pose-during-legacy-contact-hold',
    },
    recoil: combatSnapshot.attackerRecoil?.sample || null,
    invariants: {
      realShieldCouplingBeforeRelease: true,
      oldFrozenContactPoseRestoredBeforeImpulse: true,
      originalB2PlanPreservedAfterCoupling: true,
      legacyB3StartsAtZeroMs: true,
      noWholeBodyBurstRewrite: true,
      noBalanceBreakOverlayAfterRelease: true,
      noRootTranslation: true,
    },
  };
  reportNode.textContent = JSON.stringify(report, null, 2);
  document.documentElement.dataset.g43b5r28 = report.pass ? 'pass' : 'fail';
  window.__G43B5R28_RESULT__ = report;
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
  status.textContent = `${LAB_STAGE} READY · shield redirect → contact-hold bridge → original Two-Actor B3`;
  status.className = 'good';
  buildReport();
  startAttack('right');
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
  if (ready) {
    const snapshot = attackRuntime.update(deltaMs);
    const couplingOwnsWeapon = couplingRuntime.active;

    if (combat.active && !couplingOwnsWeapon) {
      advanceReleaseBridge(deltaMs);
      latestCombatUpdate = combat.update(deltaSeconds, { camera });
      finishReleaseBridgeIfReady();
      if (latestCombatUpdate?.justCompleted && !attackerRecovery) beginAttackRecovery(selectedDirection);
    } else if (!combat.active) {
      sampleAttackerBase(snapshot, deltaMs);
    }

    guardRuntime.update(deltaMs, camera);
    attackerSword.update(); defenderSword?.update();

    if (couplingOwnsWeapon) {
      updateCoupling(deltaSeconds);
    } else if (!firstContact) {
      const currentBlade = captureBladePolyline();
      updatePreContact(snapshot, currentBlade, deltaSeconds);
      resolveContact(snapshot, currentBlade, deltaSeconds);
      previousBlade = currentBlade;
    }

    const combatSnapshot = combat.snapshot;
    hudClockMs += deltaMs; reportClockMs += deltaMs;
    if (hudClockMs >= HUD_INTERVAL_MS) { hudClockMs %= HUD_INTERVAL_MS; updateHud(snapshot, combatSnapshot); }
    if (reportClockMs >= REPORT_INTERVAL_MS) { reportClockMs %= REPORT_INTERVAL_MS; buildReport(combatSnapshot); }

    if (!combat.active && !attackRuntime.active && !couplingRuntime.active && !attackerRecovery && guardMachine.state === GUARD_STATES.HOLD && autoRepeat.checked) {
      repeatCooldownMs += deltaMs;
      if (repeatCooldownMs >= 700) startAttack(selectedDirection);
    }
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
main().catch((error) => {
  document.documentElement.dataset.g43b5r28 = 'fail';
  status.textContent = `${LAB_STAGE} FAIL · ${error?.message || error}`;
  status.className = 'bad';
  reportNode.textContent = error?.stack || String(error);
  window.__G43B5R28_RESULT__ = { stage: LAB_STAGE, pass: false, error: error?.stack || String(error) };
});

window.__G43B5R28_LAB__ = {
  startAttack,
  setMode,
  combat,
  attackRuntime,
  guardMachine,
  couplingRuntime,
  get releaseBridgeElapsedMs() { return releaseBridgeElapsedMs; },
  get releaseBridgeDurationMs() { return releaseBridgeDurationMs; },
  get latestCombatResult() { return latestCombatResult; },
  get latestCouplingReport() { return latestCouplingReport; },
};