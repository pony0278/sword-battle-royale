import { DEFAULT_KAYKIT_SWORD_MOUNT } from '../../src/character/default-character-mount.js';
import { applyMountCalibration } from '../../src/character/character-sockets.js';
import { loadSkyrimConvertedAnimationLibrary } from '../../src/animation/skyrim-converted-animation-library.js';
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
import { LIVING_GUARD_PRODUCTION_STAGE } from '../../src/combat/living-guard-idle-runtime.js';
import { GUARD_WEAPON_MOUNT_PROFILE_IDS } from '../../src/combat/guard-counter-presentation.js';
import { createGuardWeaponMountRuntime } from '../../src/combat/guard-weapon-mount-runtime.js';

const GUARD_RUNTIME_STAGE = LIVING_GUARD_PRODUCTION_STAGE;
const MODE_LABELS = Object.freeze({
  hold: 'Guard Hold',
  block: 'Guard Block',
  parry: 'Parry Advantage',
  perfect: 'Perfect Parry',
  counter: 'Parry Advantage',
});

const REQUIRED_GUARD_RUNTIME_MODES = Object.freeze(['hold', 'block', 'parry', 'perfect', 'counter']);
const REQUIRED_PRODUCTION_PARRY_CLIPS = Object.freeze([
  PRODUCTION_PARRY_DEFLECT_CLIP_IDS.PARRY,
  PRODUCTION_PARRY_DEFLECT_CLIP_IDS.PERFECT_PARRY,
]);

function captureMountCalibration(object3d) {
  return {
    position: {
      x: Number(object3d?.position?.x) || 0,
      y: Number(object3d?.position?.y) || 0,
      z: Number(object3d?.position?.z) || 0,
    },
    rotation: {
      x: Number(object3d?.rotation?.x) || 0,
      y: Number(object3d?.rotation?.y) || 0,
      z: Number(object3d?.rotation?.z) || 0,
    },
    scale: {
      x: Number(object3d?.scale?.x) || 1,
      y: Number(object3d?.scale?.y) || 1,
      z: Number(object3d?.scale?.z) || 1,
    },
  };
}

function relabelProductionSurface(panel) {
  panel.setAttribute('data-stage', GUARD_RUNTIME_STAGE);
  panel.setAttribute('data-living-guard', 'skyrim-full-source');
  panel.setAttribute('data-living-guard-stage', LIVING_GUARD_PRODUCTION_STAGE);
  panel.setAttribute('data-parry-stage', PRODUCTION_PARRY_DEFLECT_STAGE);
  panel.setAttribute('data-parry-presentation', 'blockhit-powerbash-full-recovery');
  panel.setAttribute('data-parry-motion-family', 'g363-blockhit-powerbash-full-recovery');
  panel.setAttribute('data-followup-model', 'free-directional-attack');
  const title = panel.querySelector('.panel-title span');
  const subtitle = panel.querySelector('.panel-title small');
  const intro = panel.querySelector('.blocking-intro');
  const compatibilityButton = panel.querySelector('[data-guard-runtime="counter"]');
  if (title) title.textContent = `Guard Runtime · ${GUARD_RUNTIME_STAGE}`;
  if (subtitle) subtitle.textContent = 'Guard Hold = Skyrim Full Source · Guard Block = Block Hit · Parry = D Power Bash → Full Recovery';
  if (intro) {
    intro.textContent = 'G3.6.5：Guard Hold 正式採用社群選出的 Skyrim Full Source，從 canonical 50% pose 進場後以 1.00× 播放完整 40 秒 shd_blockidle，保留原生 gentle sway 與較大的 authored fidget；root 仍 in-place + rotation lock，Triangle Guard correction 與 G3.5.2 anti-drift / anti-snap 保留。一般 Guard Block 仍只播放 Block Hit；Parry / Perfect Parry 仍使用 G3.6.3 D：Block Hit → Power Bash → Full Recovery。';
  }
  if (compatibilityButton) {
    compatibilityButton.textContent = '▶ Parry Advantage';
    compatibilityButton.setAttribute('data-guard-runtime-semantic', 'parry-advantage');
  }
}

function resolveGuardPanel() {
  const panel = document.getElementById('guardRuntimePanel');
  if (!panel) {
    throw new Error('Action Studio Guard Runtime panel must be authored statically in index.template.html');
  }
  const buttons = [...panel.querySelectorAll('[data-guard-runtime]')];
  const modes = buttons.map((button) => button.dataset.guardRuntime);
  const missing = REQUIRED_GUARD_RUNTIME_MODES.filter((mode) => !modes.includes(mode));
  if (buttons.length !== REQUIRED_GUARD_RUNTIME_MODES.length || missing.length) {
    throw new Error(`Static Guard Runtime panel is incomplete: ${missing.join(', ') || `${buttons.length} buttons`}`);
  }
  panel.setAttribute('data-guard-runtime-static', 'true');
  panel.setAttribute('data-controller-bound', 'true');
  panel.setAttribute('data-guard-runtime-button-count', String(buttons.length));
  relabelProductionSurface(panel);
  return panel;
}

function createUnavailableGuardRuntime() {
  return Object.freeze({
    start: async () => null,
    sampleAt: async () => null,
    deactivate: () => {},
    get active() { return false; },
    get mode() { return null; },
    get snapshot() { return null; },
    get report() { return null; },
    get ready() { return false; },
  });
}

export function createStudioGuardRuntimeController(THREE, options = {}) {
  const {
    character,
    pausePlayer = () => {},
    clearWeaponTrail = () => {},
    updatePlaybackButtons = () => {},
    setAnimationSource = () => {},
    applyCurrentEvaluation = () => {},
  } = options;
  if (!character?.sampleAnimation || !character?.registerAnimations) {
    return createUnavailableGuardRuntime();
  }

  const panel = resolveGuardPanel();
  const status = document.getElementById('guardRuntimeStatus');
  const detail = document.getElementById('guardRuntimeDetail');
  const weaponObject3d = character.sockets?.HAND_R?.children?.[0] || null;
  let machine = null;
  let runtime = null;
  let mountRuntime = null;
  let loadPromise = null;
  let loaded = false;
  let active = false;
  let activeMode = null;
  let lastFrameAt = performance.now();
  let restoreMountCalibration = null;
  let lastResult = null;

  function setStatus(message, isError = false) {
    if (status) {
      status.textContent = message;
      status.classList.toggle('error', isError);
    }
  }

  function setActiveButton(mode) {
    document.querySelectorAll('[data-guard-runtime]').forEach((button) => {
      button.classList.toggle('on', Boolean(mode) && button.dataset.guardRuntime === mode);
    });
  }

  function isParryAdvantageMode() {
    return activeMode === 'parry' || activeMode === 'perfect' || activeMode === 'counter';
  }

  function updateReadout(result) {
    if (!result) return;
    const { snapshot, report } = result;
    const freeAttackFollowupOpen = isParryAdvantageMode() && Boolean(report.counterWindowOpen);
    panel?.setAttribute('data-guard-state', snapshot.state);
    panel?.setAttribute('data-guard-clip', report.clipId || '');
    panel?.setAttribute('data-guard-mount', report.weaponMountProfileId || '');
    panel?.setAttribute('data-free-attack-followup', freeAttackFollowupOpen ? 'open' : 'closed');
    panel?.setAttribute('data-living-guard-active', report.livingGuardStage === LIVING_GUARD_PRODUCTION_STAGE ? 'true' : 'false');
    if (report.recoveryProfileId) panel?.setAttribute('data-recovery-profile', report.recoveryProfileId);
    const clipLabel = String(report.clipId || snapshot.presentation?.clipId || '—').replace(/^SKYRIM_GUARD\//, '');
    const sourceSeconds = Number(report.sourceTimeSeconds) || 0;
    document.getElementById('clipNow').textContent = clipLabel.toUpperCase();
    document.getElementById('phaseNow').textContent = freeAttackFollowupOpen
      ? 'PARRY ADVANTAGE · FREE ATTACK'
      : `GUARD RUNTIME · ${snapshot.state.toUpperCase()}`;
    if (detail) {
      const recovery = report.recoveryProfileId
        ? ` · recover ${Math.round((report.recoveryProgress || 0) * 100)}%/${report.recoveryDurationMs}ms${report.recoveryMomentumActive ? ' · inertia' : ''}`
        : '';
      const living = report.livingGuardStage === LIVING_GUARD_PRODUCTION_STAGE
        ? ` · living ${report.livingGuardSourceRate.toFixed(2)}× · loops ${report.livingGuardCompletedLoops}`
        : '';
      const followup = isParryAdvantageMode()
        ? ` · free attack ${freeAttackFollowupOpen ? 'OPEN' : 'closed'} · Top / Left / Right`
        : '';
      detail.textContent = `${snapshot.state} · ${clipLabel} · ${sourceSeconds.toFixed(3)}s · mount ${report.weaponMountProfileId || '—'}${living}${followup}${recovery}`;
    }
  }

  async function ensureLoaded() {
    if (loaded) return;
    if (loadPromise) return loadPromise;
    if (!THREE?.GLTFLoader) throw new Error('Action Studio Guard Runtime requires Three.js GLTFLoader');
    if (location.protocol === 'file:') throw new Error('Guard Runtime assets require Action Studio over HTTP / GitHub Pages');
    if (!weaponObject3d) throw new Error('Guard Runtime could not resolve the HAND_R weapon object');

    setStatus(`${GUARD_RUNTIME_STAGE} · loading Skyrim Full Source Living Guard + D Power Parry…`);
    loadPromise = (async () => {
      const loader = new THREE.GLTFLoader();
      const skyrim = await loadSkyrimConvertedAnimationLibrary(loader, {
        THREE,
        rig: character.rig,
        baseUrl: '../../assets/skyrim/guard/converted/',
        fps: 30,
      });
      const missingProductionClips = REQUIRED_PRODUCTION_PARRY_CLIPS.filter((clipId) => !skyrim.clips.has(clipId));
      if (missingProductionClips.length) {
        throw new Error(`${GUARD_RUNTIME_STAGE} missing production Power Parry clips: ${missingProductionClips.join(', ')}`);
      }
      character.registerAnimations(skyrim);

      const bind = skyrim.clips.get('SKYRIM_GUARD/shd_blockidle')?.userData?.weaponBindCalibration;
      if (!bind?.correctionQuaternion) {
        throw new Error(`${GUARD_RUNTIME_STAGE} requires the accepted Skyrim Guard weapon-bind calibration`);
      }
      const skyrimMount = composeSkyrimWeaponMountCalibration(
        THREE,
        DEFAULT_KAYKIT_SWORD_MOUNT,
        bind,
      );
      mountRuntime = createGuardWeaponMountRuntime({
        weaponObject3d,
        profiles: {
          [GUARD_WEAPON_MOUNT_PROFILE_IDS.SKYRIM_GUARD]: skyrimMount,
        },
      });
      machine = createGuardStateMachine();
      runtime = createGuardPresentationRuntime(THREE, {
        machine,
        character,
        weaponObject3d,
        applyWeaponMountProfile(profileId) {
          const result = mountRuntime.apply(profileId);
          if (result.applied) weaponObject3d.updateMatrixWorld?.(true);
        },
      });
      loaded = true;
      setStatus(`${GUARD_RUNTIME_STAGE} ready · Living Hold = Skyrim Full Source · Parry = D Power Bash → Full Recovery`);
      panel?.setAttribute('data-g351-ready', 'true');
      panel?.setAttribute('data-g351pt3-ready', 'true');
      panel?.setAttribute('data-g36-ready', 'true');
      panel?.setAttribute('data-g363-ready', 'true');
      panel?.setAttribute('data-g365-ready', 'true');
    })().catch((error) => {
      loadPromise = null;
      setStatus(`${GUARD_RUNTIME_STAGE} load failed · ${error.message}`, true);
      panel?.setAttribute('data-g351-ready', 'false');
      panel?.setAttribute('data-g351pt3-ready', 'false');
      panel?.setAttribute('data-g36-ready', 'false');
      panel?.setAttribute('data-g363-ready', 'false');
      panel?.setAttribute('data-g365-ready', 'false');
      throw error;
    });
    return loadPromise;
  }

  function resetMachine() {
    machine.send(GUARD_EVENTS.RESET, { source: 'action-studio-guard-runtime' });
    return runtime.sync();
  }

  function forceHold() {
    resetMachine();
    machine.send(GUARD_EVENTS.GUARD_PRESS, { source: 'action-studio-guard-runtime' });
    runtime.sync();
    let result = runtime.update(180);
    if (result.snapshot.state !== GUARD_STATES.HOLD) result = runtime.update(180);
    if (result.snapshot.state !== GUARD_STATES.HOLD) {
      throw new Error(`Action Studio Guard Enter did not settle to Hold: ${result.snapshot.state}`);
    }
    return result;
  }

  function dispatchPreviewMode(mode) {
    if (mode === 'hold') {
      resetMachine();
      machine.send(GUARD_EVENTS.GUARD_PRESS, { source: 'action-studio-guard-runtime' });
      return runtime.sync();
    }

    forceHold();
    if (mode === 'block') {
      machine.send(GUARD_EVENTS.BLOCK_CONFIRMED, {
        source: 'action-studio-preview-authority',
        verification: 'action-studio-g365-guard-block-hit',
      });
    } else if (mode === 'parry' || mode === 'perfect' || mode === 'counter') {
      machine.send(GUARD_EVENTS.PARRY_CONFIRMED, {
        source: 'action-studio-preview-authority',
        perfect: mode === 'perfect',
        verification: mode === 'counter'
          ? 'action-studio-g365-parry-advantage'
          : `action-studio-g365-${mode}`,
      });
    } else {
      throw new Error(`Unknown Guard Runtime preview mode: ${mode}`);
    }
    return runtime.sync();
  }

  async function start(mode) {
    if (!(mode in MODE_LABELS)) throw new Error(`Unknown Guard Runtime mode: ${mode}`);
    await ensureLoaded();
    pausePlayer();
    clearWeaponTrail();
    character.stopAnimation?.();
    restoreMountCalibration = captureMountCalibration(weaponObject3d);
    active = true;
    activeMode = mode;
    lastFrameAt = performance.now();
    setAnimationSource('guard-runtime');
    setActiveButton(mode);
    lastResult = dispatchPreviewMode(mode);
    updateReadout(lastResult);
    setStatus(`${MODE_LABELS[mode]} · ${GUARD_RUNTIME_STAGE}${mode === 'counter' ? ' · shared D Power Parry motion; no dedicated Counter animation' : ''}`);
    updatePlaybackButtons();
    return lastResult;
  }

  async function sampleAt(mode, elapsedMs = 0) {
    if (!(mode in MODE_LABELS)) throw new Error(`Unknown Guard Runtime mode: ${mode}`);
    await ensureLoaded();
    pausePlayer();
    clearWeaponTrail();
    character.stopAnimation?.();
    if (!restoreMountCalibration) restoreMountCalibration = captureMountCalibration(weaponObject3d);
    active = false;
    activeMode = mode;
    setAnimationSource('guard-runtime');
    setActiveButton(mode);
    lastResult = dispatchPreviewMode(mode);
    const targetMs = Math.max(0, Number(elapsedMs) || 0);
    if (targetMs > 0) lastResult = runtime.update(targetMs);
    updateReadout(lastResult);
    setStatus(`${MODE_LABELS[mode]} · ${GUARD_RUNTIME_STAGE} · sampled ${Math.round(targetMs)}ms`);
    updatePlaybackButtons();
    return lastResult;
  }

  function deactivate(options = {}) {
    if (!active && !options.force) return;
    active = false;
    activeMode = null;
    setActiveButton(null);
    if (machine && runtime) resetMachine();
    character.stopAnimation?.();
    if (restoreMountCalibration && weaponObject3d) {
      applyMountCalibration(weaponObject3d, restoreMountCalibration);
      weaponObject3d.updateMatrixWorld?.(true);
    }
    restoreMountCalibration = null;
    if (options.restoreEvaluation !== false) applyCurrentEvaluation();
    if (!options.quiet) setStatus(`${GUARD_RUNTIME_STAGE} ready · choose Living Guard / Guard Block / D Power Parry preview`);
  }

  document.querySelectorAll('[data-guard-runtime]').forEach((button) => {
    button.addEventListener('click', () => {
      start(button.dataset.guardRuntime).catch((error) => setStatus(error.message, true));
    });
  });

  document.addEventListener('pointerdown', (event) => {
    if (!active) return;
    if (event.target.closest?.('[data-guard-runtime], #guardRuntimePanel, .stage-shell')) return;
    deactivate({ quiet: true });
  }, true);

  function frame(now) {
    const deltaMs = Math.min(50, Math.max(0, now - lastFrameAt));
    lastFrameAt = now;
    if (active && runtime) {
      try {
        lastResult = runtime.update(deltaMs);
        updateReadout(lastResult);
      } catch (error) {
        setStatus(`Guard Runtime stopped · ${error.message}`, true);
        deactivate({ quiet: true });
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  if (typeof window !== 'undefined') {
    window.__ACTION_STUDIO_GUARD_RUNTIME__ = {
      start,
      sampleAt,
      deactivate,
      get active() { return active; },
      get mode() { return activeMode; },
      get snapshot() { return machine?.snapshot || null; },
      get report() { return lastResult?.report || null; },
      get freeAttackFollowupOpen() {
        return isParryAdvantageMode() && Boolean(lastResult?.report?.counterWindowOpen);
      },
      get ready() { return loaded; },
    };
  }

  return Object.freeze({
    start,
    sampleAt,
    deactivate,
    get active() { return active; },
    get mode() { return activeMode; },
    get snapshot() { return machine?.snapshot || null; },
    get report() { return lastResult?.report || null; },
    get freeAttackFollowupOpen() {
      return isParryAdvantageMode() && Boolean(lastResult?.report?.counterWindowOpen);
    },
    get ready() { return loaded; },
  });
}
