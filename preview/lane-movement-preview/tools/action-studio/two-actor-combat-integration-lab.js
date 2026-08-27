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
import { createGuardThreatTrackingRuntime } from '../../src/combat/guard-threat-tracking.js';
import { planFineGuardTracking } from '../../src/combat/directional-guard-bracing.js';
import {
  createArticulatedImpactBracingRuntime,
  planArticulatedImpactBracing,
} from '../../src/combat/articulated-impact-bracing.js';
import {
  createTwoActorCombatIntegration,
  TWO_ACTOR_COMBAT_INTEGRATION_STAGE,
  TWO_ACTOR_PARRY_SYNC_STAGE,
} from '../../src/combat/two-actor-combat-integration.js';

const THREE = window.THREE;
if (!THREE?.WebGLRenderer || !THREE?.GLTFLoader) {
  throw new Error('G4.3B.5 requires Three.js r128 + GLTFLoader');
}

const TIMING_AGE_MS = Object.freeze({ block: 260, parry: 120, perfect: 50 });
const HUD_INTERVAL_MS = 50;
const REPORT_INTERVAL_MS = 200;
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.shadowMap.enabled = true;

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
const guardRuntime = createGuardPresentationRuntime(THREE, {
  machine: guardMachine,
  character: defender,
});
const bracingRuntime = createArticulatedImpactBracingRuntime(THREE, {
  rig: defender.rig,
  buckler,
});
const fineTrackingRuntime = createGuardThreatTrackingRuntime(THREE, {
  rig: defender.rig,
  buckler,
});
const combat = createTwoActorCombatIntegration({
  THREE,
  attackerCharacter: attacker,
  attackRuntime,
  guardMachine,
});

const hudAttack = document.getElementById('hudAttack');
const hudOutcome = document.getElementById('hudOutcome');
const hudContact = document.getElementById('hudContact');
const hudRecoil = document.getElementById('hudRecoil');
const hudDefender = document.getElementById('hudDefender');
const status = document.getElementById('status');
const reportNode = document.getElementById('report');
const autoRepeat = document.getElementById('autoRepeat');
const showSurface = document.getElementById('showSurface');

let ready = false;
let selectedDirection = 'right';
let selectedGrade = 'parry';
let lastTimestamp = performance.now();
let attackerIdleDuration = 1;
let attackerIdleClockSeconds = 0;
let attackerRecovery = null;
let repeatCooldownMs = 0;
let previousBlade = null;
let latestContact = null;
let firstContact = null;
let latestCombatResult = null;
let latestCombatUpdate = null;
let latestBracing = null;
let latestFinePlan = null;
let latestFineTracking = null;
let guardReport = null;
let hudClockMs = HUD_INTERVAL_MS;
let reportClockMs = REPORT_INTERVAL_MS;

function marker(name, color, radius = 0.065) {
  const node = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 12, 8),
    new THREE.MeshBasicMaterial({ color, depthWrite: false }),
  );
  node.name = name;
  node.visible = false;
  scene.add(node);
  return node;
}

const contactMarker = marker('G43B5_CONTACT', 0xff625f);

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
    const point = bladeScratch[index];
    bladeNodes[index].getWorldPosition(point);
    buffer[index].x = point.x;
    buffer[index].y = point.y;
    buffer[index].z = point.z;
  }
  return buffer;
}

function enterProductionGuard() {
  guardMachine.send(GUARD_EVENTS.RESET, { stage: TWO_ACTOR_PARRY_SYNC_STAGE });
  guardRuntime.sync(camera);
  guardMachine.send(GUARD_EVENTS.GUARD_PRESS, { stage: TWO_ACTOR_PARRY_SYNC_STAGE });
  guardRuntime.sync(camera);
  guardReport = guardRuntime.update(180, camera);
  if (guardReport.snapshot.state !== GUARD_STATES.HOLD) {
    throw new Error(`Expected Guard Hold, got ${guardReport.snapshot.state}`);
  }
}

function beginAttackRecovery(direction) {
  const sourcePose = captureRigPose(attacker.rig);
  attacker.sampleAnimation('UAL1/Sword_Idle', 0, {
    loop: true,
    inPlace: true,
    rootRotationPolicy: 'lock',
  });
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
    const time = Math.min(profile.durationSeconds, snapshot.elapsedSeconds);
    attacker.sampleAnimation(profile.clipId, time, {
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
      {
        durationMs: recovery.profile.attackRecoveryDurationMs,
        sampleDeltaMs: 0,
        momentumScale: 0,
      },
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

function startAttack(direction = selectedDirection) {
  if (!ready || combat.active || attackRuntime.active || attackerRecovery) return false;
  if (guardMachine.state !== GUARD_STATES.HOLD) return false;
  selectedDirection = direction;
  firstContact = null;
  latestContact = null;
  latestCombatResult = null;
  latestCombatUpdate = null;
  latestFinePlan = null;
  latestFineTracking = null;
  bracingRuntime.resetImpact();
  fineTrackingRuntime.reset();
  contactMarker.visible = false;
  repeatCooldownMs = 0;
  previousBlade = captureBladePolyline();
  const result = combat.startAttack(direction);
  if (!result.accepted) return false;
  document.querySelectorAll('[data-attack]').forEach((button) => {
    button.classList.toggle('active', button.dataset.attack === direction);
  });
  return true;
}

function setGrade(grade) {
  if (!(grade in TIMING_AGE_MS)) return;
  selectedGrade = grade;
  document.querySelectorAll('[data-grade]').forEach((button) => {
    button.classList.toggle('active', button.dataset.grade === grade);
  });
}

function zeroBracePlan() {
  return planArticulatedImpactBracing({ mode: 'off' });
}

function contactStrength(contact) {
  const velocity = contact?.incomingVelocity;
  if (!velocity) return 0.7;
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
  return Math.max(0.45, Math.min(1.15, speed / 5));
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
  bracingRuntime.triggerImpact({
    direction: snapshot.direction,
    strength: contactStrength(latestContact),
  });
  latestCombatResult = combat.resolveContact({
    contact: latestContact,
    guardIntentAgeMs: TIMING_AGE_MS[selectedGrade],
  });
}

function updateHud(snapshot, combatSnapshot, guardSnapshot) {
  const exchange = combatSnapshot.activeExchange || combatSnapshot.lastExchange;
  const recoilSample = combatSnapshot.attackerRecoil?.sample;
  const fine = latestFinePlan;
  hudAttack.textContent = `Attack: ${snapshot.direction?.toUpperCase() || selectedDirection.toUpperCase()} · ${snapshot.phase}`;
  hudOutcome.textContent = exchange
    ? `Outcome: ${exchange.outcome.toUpperCase()} · ${exchange.responseClass}`
    : `Outcome: waiting · requested ${selectedGrade.toUpperCase()} (${TIMING_AGE_MS[selectedGrade]}ms)`;
  hudContact.textContent = firstContact
    ? `Contact: ACTIVE · radial ${firstContact.radialDistance.toFixed(3)}m · speed ${Math.hypot(firstContact.incomingVelocity.x, firstContact.incomingVelocity.y, firstContact.incomingVelocity.z).toFixed(2)}m/s`
    : fine
      ? `Contact: — · fine ${(fine.appliedDistance * 100).toFixed(1)}/${(fine.requiredDistance * 100).toFixed(1)}cm · ${fine.reason}`
      : 'Contact: —';
  hudRecoil.textContent = recoilSample
    ? `Recoil: ${recoilSample.phase} · arm ${recoilSample.weights?.armWeight?.toFixed(2) ?? '—'} · torso ${recoilSample.weights?.torsoWeight?.toFixed(2) ?? '—'}`
    : 'Recoil: —';
  hudDefender.textContent = `Defender: ${guardSnapshot.state} · ${guardSnapshot.presentation?.reactionVariant || guardSnapshot.presentation?.role || '—'}`;
}

function compactExchange(exchange) {
  if (!exchange) return null;
  return {
    sequence: exchange.sequence,
    attackDirection: exchange.attackDirection,
    outcome: exchange.outcome,
    responseClass: exchange.responseClass,
    defenderReactionVariant: exchange.defenderReactionVariant,
    defenderPresentationOffsetSeconds: exchange.defenderPresentationOffsetSeconds || 0,
    attackerHandoffReleased: Boolean(exchange.attackerHandoffReleased),
  };
}

function compactContact(contact) {
  if (!contact) return null;
  return {
    contact: contact.contact,
    reason: contact.reason,
    radialDistance: contact.radialDistance,
    bladeFraction: contact.bladeFraction,
    sweepAlpha: contact.sweepAlpha,
    incomingVelocity: contact.incomingVelocity,
  };
}

function buildReport(combatSnapshot = combat.snapshot, guardSnapshot = guardMachine.snapshot) {
  const exchange = combatSnapshot.activeExchange || combatSnapshot.lastExchange;
  const report = {
    stage: TWO_ACTOR_PARRY_SYNC_STAGE,
    baseIntegrationStage: TWO_ACTOR_COMBAT_INTEGRATION_STAGE,
    pass: ready,
    selectedDirection,
    selectedGrade,
    timingAgeMs: TIMING_AGE_MS[selectedGrade],
    combatPhase: combatSnapshot.phase,
    attackPhase: attackRuntime.snapshot.phase,
    defenderState: guardSnapshot.state,
    exchange: compactExchange(exchange),
    latestCombatResult: latestCombatResult
      ? { accepted: latestCombatResult.accepted, reason: latestCombatResult.reason, outcome: latestCombatResult.resolution?.outcome || null }
      : null,
    latestCombatUpdate: latestCombatUpdate
      ? { updated: latestCombatUpdate.updated, justCompleted: Boolean(latestCombatUpdate.justCompleted) }
      : null,
    firstContact: compactContact(firstContact),
    fineTracking: latestFinePlan
      ? {
          requiredDistance: latestFinePlan.requiredDistance,
          appliedDistance: latestFinePlan.appliedDistance,
          reachable: latestFinePlan.reachable,
          reason: latestFinePlan.reason,
          achievedDistance: latestFineTracking?.achievedDistance || 0,
        }
      : null,
    authority: {
      contact: 'G4.3A swept geometry after final fine-tracked Buckler surface',
      outcome: 'G4.3A.4 resolution gate',
      interruption: 'G4.3B.1 frozen source pose',
      recoilPlan: 'G4.3B.2 incoming-vector planner',
      recoilPresentation: 'G4.3B.3 additive attacker pose',
      orchestration: 'G4.3B.4',
      contactSynchronization: TWO_ACTOR_PARRY_SYNC_STAGE,
    },
    invariants: {
      fineTrackingMaxMeters: 0.07,
      fineTrackingBeforeContactProbe: true,
      oneResolutionPerAttackSequence: true,
      frozenPoseSampledBeforeAdditiveRecoil: true,
      defenderUsesAuthoritativeGuardEvent: true,
      attackerRootTeleport: false,
      hudRateHz: Math.round(1000 / HUD_INTERVAL_MS),
      reportRateHz: Math.round(1000 / REPORT_INTERVAL_MS),
      pixelRatioMax: 1.5,
    },
  };
  reportNode.textContent = JSON.stringify(report, null, 2);
  document.documentElement.dataset.g43b5 = report.pass ? 'pass' : 'fail';
  window.__G43B5_RESULT__ = report;
  return report;
}

async function main() {
  status.textContent = 'Loading UAL attacks + Skyrim Guard + B.5 synchronization…';
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
  if (!bind?.correctionQuaternion) {
    throw new Error('G4.3B.5 requires Skyrim Guard weapon bind calibration');
  }

  defenderSword = createDebugSword(THREE);
  mountDebugSword(
    defender,
    defenderSword,
    composeSkyrimWeaponMountCalibration(THREE, DEFAULT_KAYKIT_SWORD_MOUNT, bind),
  );

  enterProductionGuard();
  ready = true;
  status.textContent = 'G4.3B.5 READY · synchronized Parry + fine tracking + stabilized debug loop';
  status.className = 'good';
  buildReport();
  startAttack('right');
}

document.querySelectorAll('[data-attack]').forEach((button) => {
  button.addEventListener('click', () => startAttack(button.dataset.attack));
});
document.querySelectorAll('[data-grade]').forEach((button) => {
  button.addEventListener('click', () => setGrade(button.dataset.grade));
});
document.querySelectorAll('[data-view]').forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.view));
});
showSurface.addEventListener('change', () => {
  buckler.setParrySurfaceVisible(showSurface.checked);
});

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
      if (latestCombatUpdate.justCompleted && !attackerRecovery) {
        beginAttackRecovery(selectedDirection);
      }
    } else {
      sampleAttackerBase(snapshot, deltaMs);
    }

    guardReport = guardRuntime.update(deltaMs, camera);
    attackerSword.update();
    defenderSword?.update();

    const currentBlade = captureBladePolyline();
    const baselineSurface = buckler.getWorldParrySurface();
    const attackCanBrace = snapshot.action
      && snapshot.phase !== LONGSWORD_ATTACK_PHASES.INTERRUPTED
      && snapshot.phase !== LONGSWORD_ATTACK_PHASES.IDLE;
    const bracePlan = previousBlade && attackCanBrace
      ? planArticulatedImpactBracing({
          mode: 'brace-fine',
          attackDirection: snapshot.direction,
          previousBlade,
          currentBlade,
          bucklerSurface: baselineSurface,
          deltaSeconds,
        })
      : zeroBracePlan();

    latestBracing = bracingRuntime.update(bracePlan, deltaSeconds);
    const postBraceSurface = buckler.getWorldParrySurface();
    latestFinePlan = planFineGuardTracking({
      threat: bracePlan?.analysis?.threat || null,
      bucklerSurface: postBraceSurface,
      maxCorrectionMeters: bracePlan?.fineTrackMaxMeters || 0,
    });
    latestFineTracking = fineTrackingRuntime.update(latestFinePlan, deltaSeconds);
    defender.update(0, camera);
    defenderSword?.update();

    updateContact(snapshot, currentBlade, deltaSeconds);
    previousBlade = currentBlade;

    const combatSnapshot = combat.snapshot;
    const guardSnapshot = guardMachine.snapshot;
    hudClockMs += deltaMs;
    reportClockMs += deltaMs;
    if (hudClockMs >= HUD_INTERVAL_MS) {
      hudClockMs %= HUD_INTERVAL_MS;
      updateHud(snapshot, combatSnapshot, guardSnapshot);
    }
    if (reportClockMs >= REPORT_INTERVAL_MS) {
      reportClockMs %= REPORT_INTERVAL_MS;
      buildReport(combatSnapshot, guardSnapshot);
    }

    if (!combat.active
      && !attackRuntime.active
      && !attackerRecovery
      && guardMachine.state === GUARD_STATES.HOLD
      && autoRepeat.checked) {
      repeatCooldownMs += deltaMs;
      if (repeatCooldownMs >= 750) startAttack(selectedDirection);
    }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

main().catch((error) => {
  document.documentElement.dataset.g43b5 = 'fail';
  status.textContent = `G4.3B.5 FAIL · ${error?.message || error}`;
  status.className = 'bad';
  reportNode.textContent = error?.stack || String(error);
  window.__G43B5_RESULT__ = {
    stage: TWO_ACTOR_PARRY_SYNC_STAGE,
    pass: false,
    error: error?.stack || String(error),
  };
});

window.__G43B5_LAB__ = {
  startAttack,
  setGrade,
  combat,
  attackRuntime,
  guardMachine,
  bracingRuntime,
  fineTrackingRuntime,
  buckler,
  get latestFinePlan() { return latestFinePlan; },
  get latestFineTracking() { return latestFineTracking; },
  get latestContact() { return latestContact; },
  get latestCombatResult() { return latestCombatResult; },
  get latestCombatUpdate() { return latestCombatUpdate; },
};
