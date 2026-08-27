import { createDefaultCharacter } from '../../src/character/default-character.js';
import { createDebugSword, mountDebugSword } from '../../src/character/debug-sword.js';
import { DEFAULT_KAYKIT_SWORD_MOUNT } from '../../src/character/default-character-mount.js';
import {
  SKYRIM_GUARD_CONVERTED_FILES,
  loadSkyrimConvertedAnimationLibrary,
} from '../../src/animation/skyrim-converted-animation-library.js';
import {
  PRODUCTION_PARRY_DEFLECT_CLIP_IDS,
  PRODUCTION_PARRY_DEFLECT_STAGE,
} from '../../src/animation/parry-contact-deflect-runtime-clip.js';
import { composeSkyrimWeaponMountCalibration } from '../../src/animation/skyrim-weapon-bind-calibration.js';
import {
  GUARD_EVENTS,
  GUARD_STATES,
  createGuardStateMachine,
} from '../../src/combat/guard-state-machine.js';
import { createGuardPresentationRuntime } from '../../src/combat/guard-presentation-runtime.js';
import {
  GUARD_REACTION_VARIANTS,
  LONGSWORD_GUARD_REACTION_PROFILES,
} from '../../src/combat/guard-reaction-presentation.js';

const THREE = window.THREE;
if (!THREE?.WebGLRenderer || !THREE?.GLTFLoader) throw new Error(`${PRODUCTION_PARRY_DEFLECT_STAGE} requires Three.js + GLTFLoader`);

const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1018);
const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
scene.add(new THREE.HemisphereLight(0xffffff, 0x27344a, 1.25));
const key = new THREE.DirectionalLight(0xffffff, 0.95);
key.position.set(3, 5, 4);
scene.add(key);
scene.add(new THREE.GridHelper(8, 16, 0x34435d, 0x202a3b));

const character = createDefaultCharacter(THREE);
scene.add(character.object3d);
const machine = createGuardStateMachine();
const runtime = createGuardPresentationRuntime(THREE, { machine, character });
let sword = null;
let library = null;
let activeReaction = 'block';
let activeElapsedMs = 300;

const status = document.getElementById('status');
const reportNode = document.getElementById('report');
const hudState = document.getElementById('hudState');
const hudDetail = document.getElementById('hudDetail');
const timeline = document.getElementById('timeline');
const timeLabel = document.getElementById('timeLabel');

const REACTION_CONFIG = Object.freeze({
  block: Object.freeze({
    event: GUARD_EVENTS.BLOCK_CONFIRMED,
    payload: Object.freeze({ verification: 'g363-block' }),
    variant: GUARD_REACTION_VARIANTS.BLOCK_HIT,
  }),
  parry: Object.freeze({
    event: GUARD_EVENTS.PARRY_CONFIRMED,
    payload: Object.freeze({ verification: 'g363-parry' }),
    variant: GUARD_REACTION_VARIANTS.PARRY,
  }),
  perfect: Object.freeze({
    event: GUARD_EVENTS.PARRY_CONFIRMED,
    payload: Object.freeze({ verification: 'g363-perfect', perfect: true }),
    variant: GUARD_REACTION_VARIANTS.PERFECT_PARRY,
  }),
});

function setView(view) {
  if (view === 'front') camera.position.set(0, 1.42, 5.3);
  else if (view === 'side') camera.position.set(5.2, 1.45, 0);
  else if (view === 'back') camera.position.set(0, 1.42, -5.3);
  else camera.position.set(4.0, 1.58, 4.25);
  camera.lookAt(0, 1.0, 0);
  camera.updateMatrixWorld(true);
}

function resize() {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function resetToHold() {
  machine.send(GUARD_EVENTS.RESET, { verification: 'g363-reset' });
  runtime.sync(camera);
  machine.send(GUARD_EVENTS.GUARD_PRESS, { verification: 'g363-guard-press' });
  runtime.sync(camera);
  const enter = runtime.update(180, camera);
  if (enter.snapshot.state !== GUARD_STATES.HOLD) {
    throw new Error(`${PRODUCTION_PARRY_DEFLECT_STAGE} failed to auto-complete Guard Enter: ${enter.snapshot.state}`);
  }
  return enter;
}

function beginReaction(kind) {
  const config = REACTION_CONFIG[kind];
  if (!config) throw new Error(`Unknown ${PRODUCTION_PARRY_DEFLECT_STAGE} reaction: ${kind}`);
  resetToHold();
  const result = machine.send(config.event, config.payload);
  if (!result.accepted) throw new Error(`${PRODUCTION_PARRY_DEFLECT_STAGE} ${kind} event was rejected by the Guard FSM`);
  runtime.sync(camera);
  return config;
}

function reactionProfile(kind) {
  return LONGSWORD_GUARD_REACTION_PROFILES[REACTION_CONFIG[kind].variant];
}

function displayReaction(kind, elapsedMs) {
  const config = beginReaction(kind);
  const profile = LONGSWORD_GUARD_REACTION_PROFILES[config.variant];
  const clamped = Math.max(0, Math.min(Number(elapsedMs) || 0, profile.durationMs));
  const result = runtime.update(clamped, camera);
  activeReaction = kind;
  activeElapsedMs = clamped;
  timeline.max = String(Math.ceil(profile.durationMs));
  timeline.value = String(Math.min(Number(timeline.max), clamped));
  timeLabel.textContent = `${Math.round(clamped)} ms`;
  hudState.textContent = `${kind.toUpperCase()} · ${result.snapshot.state}`;
  hudDetail.textContent = `${result.report.clipId || '—'} · source ${result.report.sourceTimeSeconds.toFixed(3)}s · counter ${result.report.counterWindowOpen ? 'OPEN' : 'closed'}`;
  character.object3d.updateMatrixWorld(true);
  sword?.update();
  return result;
}

function clipDiagnostics(clipId) {
  const clip = library.clips.get(clipId);
  if (!clip) return { present:false, clipId };
  const arm = clip.userData?.armChainMetrics || {};
  const translation = clip.userData?.translationSafety || {};
  return {
    present:true,
    clipId,
    duration:Number((clip.duration || 0).toFixed(6)),
    translationScale:Number((clip.userData?.translationScale || 0).toFixed(8)),
    translationSafe:translation.safe === true,
    translationExcursionRatio:Number((translation.excursionRatio || 0).toFixed(8)),
    armMaxErrorDegrees:Number((arm.maxDirectionErrorDegrees || 0).toFixed(8)),
    helperCoverage:arm.helperCoverage || {},
    convertedSource:clip.userData?.convertedSource || null,
    productionParryDeflect:clip.userData?.productionParryDeflect || null,
  };
}

function verifyScenario(kind) {
  const profile = reactionProfile(kind);
  const config = beginReaction(kind);
  const beforeMs = Math.max(0, profile.durationMs - 1);
  const before = runtime.update(beforeMs, camera);
  const beforeState = before.snapshot.state;
  const beforeClip = before.report.clipId;
  const counterWindowOpen = before.report.counterWindowOpen;
  const end = runtime.update(1, camera);
  const recoverState = end.snapshot.state;
  const completion = end.snapshot.lastTransition;
  const recoveryDurationMs = Number(end.report.recoveryDurationMs) || 140;
  const recoveryProfileId = end.report.recoveryProfileId || null;
  const recover = runtime.update(recoveryDurationMs, camera);
  return {
    kind,
    variant:config.variant,
    durationMs:profile.durationMs,
    sourceEndSeconds:profile.sourceWindow.endSeconds,
    beforeState,
    beforeClip,
    counterWindowOpen,
    recoverState,
    recoveryDurationMs,
    recoveryProfileId,
    completionEvent:completion?.event || null,
    completionAuthority:completion?.authority || null,
    completionVariant:completion?.payload?.reactionVariant || null,
    afterRecoverState:recover.snapshot.state,
    pass:beforeState === profile.state
      && beforeClip === profile.clipId
      && recoverState === GUARD_STATES.RECOVER
      && Boolean(recoveryProfileId)
      && completion?.event === GUARD_EVENTS.REACTION_COMPLETE
      && completion?.authority === 'presentation'
      && completion?.payload?.reactionVariant === profile.variant
      && recover.snapshot.state === GUARD_STATES.HOLD,
  };
}

function sameMotionMetadata(a, b) {
  if (!a || !b) return false;
  return a.sharedMotionFamily === 'g363-blockhit-powerbash-full-recovery'
    && b.sharedMotionFamily === a.sharedMotionFamily
    && a.sharedMotionContract === true
    && b.sharedMotionContract === true
    && a.contactClipId === b.contactClipId
    && a.deflectClipId === b.deflectClipId
    && a.contactEndSeconds === b.contactEndSeconds
    && a.contactHoldSeconds === b.contactHoldSeconds
    && a.blendSeconds === b.blendSeconds
    && JSON.stringify(a.deflectWindow) === JSON.stringify(b.deflectWindow)
    && JSON.stringify(a.powerWindow) === JSON.stringify(b.powerWindow)
    && JSON.stringify(a.recoveryWindow) === JSON.stringify(b.recoveryWindow)
    && a.deflectRate === b.deflectRate
    && a.recoveryRate === b.recoveryRate
    && a.powerEndAtSeconds === b.powerEndAtSeconds
    && a.recoveryEndAtSeconds === b.recoveryEndAtSeconds
    && a.visualChainEndSeconds === b.visualChainEndSeconds
    && a.reactionDurationSeconds === b.reactionDurationSeconds;
}

function productionMetadataPass(entry) {
  const metadata = entry?.productionParryDeflect;
  return metadata?.stage === PRODUCTION_PARRY_DEFLECT_STAGE
    && metadata?.productionEnabled === true
    && metadata?.probeOnly === false
    && metadata?.sourceDecision === 'G3_6_3_PROMOTE_D_FULL_RECOVERY'
    && metadata?.deflectClipId === 'SKYRIM_GUARD/shd_blockbashpower'
    && metadata?.sharedMotionFamily === 'g363-blockhit-powerbash-full-recovery'
    && JSON.stringify(metadata?.powerWindow) === JSON.stringify([0.08, 0.55])
    && JSON.stringify(metadata?.recoveryWindow) === JSON.stringify([0.55, 0.7])
    && metadata?.deflectRate === 0.95
    && metadata?.recoveryRate === 1
    && Math.abs((metadata?.reactionDurationSeconds || 0) - 0.96) < 1e-9;
}

function runVerification() {
  const sourceIds = [
    'SKYRIM_GUARD/shd_blockidle',
    'SKYRIM_GUARD/shd_blockhit',
    'SKYRIM_GUARD/shd_blockbash',
    'SKYRIM_GUARD/shd_blockbashpower',
  ];
  const productionIds = [
    PRODUCTION_PARRY_DEFLECT_CLIP_IDS.PARRY,
    PRODUCTION_PARRY_DEFLECT_CLIP_IDS.PERFECT_PARRY,
  ];
  const expectedIds = [...sourceIds, ...productionIds];
  const clips = Object.fromEntries(expectedIds.map((clipId) => [clipId, clipDiagnostics(clipId)]));
  const scenarios = {
    block:verifyScenario('block'),
    parry:verifyScenario('parry'),
    perfect:verifyScenario('perfect'),
  };
  const sourceReactionClips = sourceIds.slice(1).map((clipId) => clips[clipId]);
  const productionClips = productionIds.map((clipId) => clips[clipId]);
  const parryMetadata = productionClips[0]?.productionParryDeflect || null;
  const perfectMetadata = productionClips[1]?.productionParryDeflect || null;
  const gates = {
    sourceFamilyCount:SKYRIM_GUARD_CONVERTED_FILES.length === 4,
    productionLibraryCount:library.clips.size === 6,
    allClipsPresent:expectedIds.every((clipId) => clips[clipId].present),
    sourceTranslationSafe:sourceReactionClips.every((entry) => entry.translationSafe),
    sourceArmChainSafe:sourceReactionClips.every((entry) => entry.armMaxErrorDegrees <= 0.1),
    sourceScaleSafe:sourceReactionClips.every((entry) => entry.translationScale > 0 && entry.translationScale < 0.1),
    productionVirtualMetadata:productionClips.every(productionMetadataPass),
    powerBashIsProduction:productionClips.every((entry) => entry.productionParryDeflect?.deflectClipId === 'SKYRIM_GUARD/shd_blockbashpower'),
    fullRecoveryIsProduction:productionClips.every((entry) => JSON.stringify(entry.productionParryDeflect?.recoveryWindow) === JSON.stringify([0.55, 0.7])),
    sharedParryPerfectMotion:sameMotionMetadata(parryMetadata, perfectMetadata),
    blockRemainsBlockHit:LONGSWORD_GUARD_REACTION_PROFILES[GUARD_REACTION_VARIANTS.BLOCK_HIT].clipId === 'SKYRIM_GUARD/shd_blockhit',
    blockRuntime:scenarios.block.pass,
    parryRuntime:scenarios.parry.pass,
    perfectRuntime:scenarios.perfect.pass,
    promotedDNotTruncated:scenarios.parry.durationMs === 960 && scenarios.perfect.durationMs === 960,
    poseMatchedRecovery:[scenarios.block, scenarios.parry, scenarios.perfect].every((scenario) => Boolean(scenario.recoveryProfileId)),
    rejectedIntroAbsent:!library.clips.has('SKYRIM_GUARD/shd_blockbashintro'),
  };
  const failures = Object.entries(gates).filter(([, pass]) => !pass).map(([name]) => name);
  const report = {
    stage:PRODUCTION_PARRY_DEFLECT_STAGE,
    pass:failures.length === 0,
    files:SKYRIM_GUARD_CONVERTED_FILES.map(({ id, file, clipId, role, visualDecision }) => ({ id, file, clipId, role, visualDecision:visualDecision || 'ADOPT' })),
    virtualClips:library.virtualClips || [],
    clips,
    scenarios,
    gates,
    failures,
  };
  document.documentElement.dataset.g332 = report.pass ? 'pass' : 'fail';
  document.documentElement.dataset.g332Count = String(library.clips.size);
  document.documentElement.dataset.g332Block = scenarios.block.pass ? 'pass' : 'fail';
  document.documentElement.dataset.g332Parry = scenarios.parry.pass ? 'pass' : 'fail';
  document.documentElement.dataset.g332Perfect = scenarios.perfect.pass ? 'pass' : 'fail';
  document.documentElement.dataset.g363 = report.pass ? 'pass' : 'fail';
  document.documentElement.dataset.g363Virtual = gates.productionVirtualMetadata ? 'pass' : 'fail';
  document.documentElement.dataset.g363Power = gates.powerBashIsProduction ? 'pass' : 'fail';
  document.documentElement.dataset.g363Recovery = gates.fullRecoveryIsProduction && gates.promotedDNotTruncated ? 'pass' : 'fail';
  document.documentElement.dataset.g363SharedMotion = gates.sharedParryPerfectMotion ? 'pass' : 'fail';
  document.documentElement.dataset.g363BlockSemantic = gates.blockRemainsBlockHit ? 'pass' : 'fail';
  // Compatibility signals retained for older Guard regression consumers.
  document.documentElement.dataset.g36 = report.pass ? 'pass' : 'fail';
  document.documentElement.dataset.g36Virtual = gates.productionVirtualMetadata ? 'pass' : 'fail';
  document.documentElement.dataset.g36Power = gates.powerBashIsProduction ? 'pass' : 'fail';
  document.documentElement.dataset.g36SharedMotion = gates.sharedParryPerfectMotion ? 'pass' : 'fail';
  document.documentElement.dataset.g36BlockSemantic = gates.blockRemainsBlockHit ? 'pass' : 'fail';
  document.documentElement.dataset.g351pt3 = report.pass ? 'pass' : 'fail';
  document.documentElement.dataset.g351pt3Virtual = gates.productionVirtualMetadata ? 'pass' : 'fail';
  document.documentElement.dataset.g351pt3Power = gates.powerBashIsProduction ? 'pass' : 'fail';
  document.documentElement.dataset.g341Recovery = gates.poseMatchedRecovery ? 'pass' : 'fail';
  reportNode.textContent = JSON.stringify(report, null, 2);
  window.__G332_RESULT__ = report;
  window.__G363_POWER_PARRY_RESULT__ = report;
  window.__G36_POWER_PARRY_RESULT__ = report;
  status.textContent = `${PRODUCTION_PARRY_DEFLECT_STAGE} ${report.pass ? 'PASS' : 'FAIL'} · Guard Block + approved D Power Bash → Full Recovery production motion`;
  status.className = report.pass ? 'good' : 'bad';
  return report;
}

async function main() {
  status.textContent = `Loading Skyrim Guard sources + ${PRODUCTION_PARRY_DEFLECT_STAGE} promoted D production clips…`;
  library = await loadSkyrimConvertedAnimationLibrary(new THREE.GLTFLoader(), {
    THREE,
    rig:character.rig,
    fps:30,
  });
  if (library.clips.size !== 6) throw new Error(`Expected 6 Skyrim Guard clips including ${PRODUCTION_PARRY_DEFLECT_STAGE} Power Parry virtual clips, got ${library.clips.size}`);
  character.registerAnimations(library);
  const idle = library.clips.get('SKYRIM_GUARD/shd_blockidle');
  const bind = idle?.userData?.weaponBindCalibration;
  if (!bind?.correctionQuaternion) throw new Error(`${PRODUCTION_PARRY_DEFLECT_STAGE} requires accepted G2.4.5 weapon bind calibration`);
  sword = createDebugSword(THREE);
  mountDebugSword(character, sword, composeSkyrimWeaponMountCalibration(THREE, DEFAULT_KAYKIT_SWORD_MOUNT, bind));

  runVerification();
  const params = new URLSearchParams(location.search);
  const requested = REACTION_CONFIG[params.get('reaction')] ? params.get('reaction') : 'block';
  const requestedElapsed = Number(params.get('elapsed'));
  const profile = reactionProfile(requested);
  displayReaction(requested, Number.isFinite(requestedElapsed) ? requestedElapsed : profile.durationMs * 0.5);
}

document.querySelectorAll('[data-reaction]').forEach((button) => button.addEventListener('click', () => {
  const kind = button.dataset.reaction;
  displayReaction(kind, reactionProfile(kind).durationMs * 0.5);
}));
document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
timeline.addEventListener('input', () => displayReaction(activeReaction, Number(timeline.value)));

setView(new URLSearchParams(location.search).get('view') || 'three');
resize();
addEventListener('resize', resize);
(function frame(){ if(sword)sword.update(); renderer.render(scene,camera); requestAnimationFrame(frame); })();

main().catch((error) => {
  document.documentElement.dataset.g332 = 'fail';
  document.documentElement.dataset.g363 = 'fail';
  document.documentElement.dataset.g36 = 'fail';
  document.documentElement.dataset.g351pt3 = 'fail';
  status.textContent = `${PRODUCTION_PARRY_DEFLECT_STAGE} FAIL · ${error?.message || error}`;
  status.className = 'bad';
  reportNode.textContent = error?.stack || String(error);
  window.__G332_RESULT__ = { stage:PRODUCTION_PARRY_DEFLECT_STAGE, pass:false, error:error?.stack || String(error) };
  window.__G363_POWER_PARRY_RESULT__ = window.__G332_RESULT__;
  window.__G36_POWER_PARRY_RESULT__ = window.__G332_RESULT__;
});

window.__G332_LAB__ = { displayReaction, runVerification };
