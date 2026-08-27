import { createFittedAnimationBinding } from '../../src/animation/animation-binding.js';
import {
  KAYKIT_ANIMATION_PACKS,
  loadKayKitAnimationLibrary,
} from '../../src/animation/kaykit-animation-library.js';
import {
  UAL1_ANIMATION_FILES,
  loadUal1AnimationLibrary,
} from '../../src/animation/ual1-animation-library.js';
import {
  UAL2_ANIMATION_FILES,
  loadUal2AnimationLibrary,
} from '../../src/animation/ual2-animation-library.js';
import {
  SKYRIM_GUARD_CONVERTED_FILES,
  importSkyrimConvertedAnimationFile,
  loadSkyrimConvertedAnimationLibrary,
} from '../../src/animation/skyrim-converted-animation-library.js';
import {
  getCanonicalMotionContactSeconds,
  getLongswordMotionMetadata,
} from '../../src/combat/longsword-directional-metadata.js';
import { readAnimationBindingView } from './studio-editor-view.js';
import { installStudioSkyrimBridgeControls } from './studio-skyrim-bridge-controls.js';
import { createStudioGuardRuntimeController } from './studio-guard-runtime-controller.js';

const SOURCE_INFO = Object.freeze({
  ual2: Object.freeze({ label: 'UAL2 Sword Combat', count: UAL2_ANIMATION_FILES.length, defaultClip: 'UAL2/Sword_Regular_A' }),
  ual1: Object.freeze({ label: 'UAL1 Sword Basics', count: UAL1_ANIMATION_FILES.length, defaultClip: 'UAL1/Sword_Attack' }),
  skyrim: Object.freeze({ label: 'Skyrim Guard Probe', count: SKYRIM_GUARD_CONVERTED_FILES.length, defaultClip: 'SKYRIM_GUARD/shd_blockidle' }),
  kaykit: Object.freeze({ label: 'KayKit Base', count: KAYKIT_ANIMATION_PACKS.length, defaultClip: 'Idle_A' }),
});

const MOTION_CONTACT_STORAGE_KEY = 'ACTION_STUDIO_MOTION_CONTACTS_V1';

function shouldLoopClip(name) {
  const clipId = String(name || '');
  if (clipId === 'SKYRIM_GUARD/shd_blockidle') return true;
  if (/^SKYRIM_GUARD\/shd_block(?:hit|bash|bashpower)$/i.test(clipId)) return false;
  return /Idle|Walking|Running|Block|Crouching|Sneaking|Crawling/i.test(clipId);
}

function displayClipName(name) {
  return String(name || '').replace(/^(?:UAL[12]|SKYRIM_GUARD)\//, '');
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function readStoredContacts() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const value = JSON.parse(localStorage.getItem(MOTION_CONTACT_STORAGE_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch (_error) {
    return {};
  }
}

function writeStoredContacts(value) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(MOTION_CONTACT_STORAGE_KEY, JSON.stringify(value));
  } catch (_error) {
    // Preview metadata should never break animation playback when storage is unavailable.
  }
}

export function createStudioExternalAnimationController(options) {
  installStudioSkyrimBridgeControls();
  const {
    THREE,
    character,
    getAction,
    getClip,
    setBinding,
    pausePlayer,
    applyCurrentEvaluation,
    clearWeaponTrail,
    updatePlaybackButtons,
    setAnimationSource,
    renderBinding,
  } = options;
  const libraries = new Map();
  const sourceSelect = document.getElementById('animationPackSource');
  const clipSelect = document.getElementById('kaykitClip');
  const status = document.getElementById('kaykitStatus');
  const storedContacts = readStoredContacts();
  let contactTimer = null;
  let hitstopReleaseTimer = null;
  let naturalPreviewAction = null;
  let naturalPreviewToken = 0;

  const guardRuntime = createStudioGuardRuntimeController(THREE, {
    character,
    pausePlayer,
    clearWeaponTrail,
    updatePlaybackButtons,
    setAnimationSource,
    applyCurrentEvaluation,
  });

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle('error', isError);
  }

  function selectedSource() {
    return sourceSelect.value in SOURCE_INFO ? sourceSelect.value : 'ual2';
  }

  function selectedLibraryClip() {
    return libraries.get(selectedSource())?.clips.get(clipSelect.value) || null;
  }

  function contactSecondsFor(name, durationSeconds) {
    const duration = Math.max(0, Number(durationSeconds) || 0);
    if (Number.isFinite(Number(storedContacts[name]))) {
      return clamp(storedContacts[name], 0, duration || Number(storedContacts[name]));
    }
    const canonicalContact = getCanonicalMotionContactSeconds(name);
    if (Number.isFinite(canonicalContact)) {
      return clamp(canonicalContact, 0, duration || canonicalContact);
    }
    return duration > 0 ? duration * 0.35 : 0;
  }

  function installContactControls() {
    if (document.getElementById('externalImpactContact')) return;
    const sourcePreviewButton = document.getElementById('playKayKitAnimation');
    if (!sourcePreviewButton || typeof sourcePreviewButton.insertAdjacentHTML !== 'function') return;
    sourcePreviewButton.insertAdjacentHTML('afterend', `
      <button id="previewKayKitWithImpact" class="primary" title="Play the selected source at natural speed and trigger the active Combat Feel profile at this motion's own contact marker.">▶ Preview + Impact</button>
      <label class="external-impact-contact">Impact contact
        <output id="externalImpactContactValue">—</output>
        <input id="externalImpactContact" type="range" min="0" max="1" step="0.01" value="0.35">
      </label>
      <span id="externalImpactContactStatus" class="status-line">Natural 1.00× · load a clip to edit contact timing</span>
    `);
  }

  function refreshContactControls() {
    const input = document.getElementById('externalImpactContact');
    const output = document.getElementById('externalImpactContactValue');
    const contactStatus = document.getElementById('externalImpactContactStatus');
    if (!input || !output || !contactStatus) return;
    const sourceClip = selectedLibraryClip();
    const name = clipSelect.value;
    if (!sourceClip || !name) {
      input.disabled = true;
      output.textContent = '—';
      contactStatus.textContent = 'Natural 1.00× · load a clip to edit contact timing';
      return;
    }
    const duration = Math.max(0.01, Number(sourceClip.duration) || 0.01);
    const contact = contactSecondsFor(name, duration);
    input.disabled = false;
    input.min = '0';
    input.max = String(duration);
    input.step = '0.01';
    input.value = String(contact);
    output.textContent = `${contact.toFixed(2)}s`;
    const canonicalMetadata = getLongswordMotionMetadata(name);
    let source = 'estimated marker';
    if (storedContacts[name] !== undefined) source = 'local override';
    else if (canonicalMetadata) source = `canonical ${canonicalMetadata.weapon} ${canonicalMetadata.direction.toUpperCase()} marker`;
    contactStatus.textContent = `Natural 1.00× · duration ${duration.toFixed(3)}s · ${source}`;
  }

  function saveCurrentContact(rawValue) {
    const sourceClip = selectedLibraryClip();
    const name = clipSelect.value;
    if (!sourceClip || !name) return 0;
    const contact = clamp(rawValue, 0, Number(sourceClip.duration) || 0);
    storedContacts[name] = contact;
    writeStoredContacts(storedContacts);
    refreshContactControls();
    return contact;
  }

  function populate(source, preferredClipId = '') {
    clipSelect.innerHTML = '';
    const library = libraries.get(source);
    if (!library) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = `Load ${SOURCE_INFO[source].label} first`;
      clipSelect.appendChild(option);
      refreshContactControls();
      return;
    }
    [...library.clips.keys()].forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = displayClipName(name);
      clipSelect.appendChild(option);
    });
    clipSelect.value = library.clips.has(preferredClipId)
      ? preferredClipId
      : SOURCE_INFO[source].defaultClip;
    refreshContactControls();
  }

  function registerLibrary(source, library, preferredClipId = '') {
    character.registerAnimations(library);
    libraries.set(source, library);
    populate(source, preferredClipId || getAction()?.animationBinding?.clipId);
    const info = SOURCE_INFO[source];
    const detail = source === 'kaykit'
      ? `${library.clips.size} unique clips · ${library.duplicates.length} duplicates ignored`
      : source === 'skyrim'
        ? `${library.clips.size} converted Guard clip${library.clips.size === 1 ? '' : 's'} retargeted at ${library.retargetFps} fps`
        : `${library.clips.size} sword clips retargeted at ${library.retargetFps} fps`;
    setStatus(`ready · ${info.label} · ${detail} · ${Object.keys(character.rig.bones).length} target bones`);
    renderBinding();
    return library;
  }

  async function load(source = selectedSource()) {
    if (libraries.has(source)) {
      populate(source, clipSelect.value || getAction()?.animationBinding?.clipId);
      return libraries.get(source);
    }
    if (!THREE.GLTFLoader) throw new Error('Three.js GLTFLoader is unavailable');
    if (location.protocol === 'file:') throw new Error('External GLB animations require the local HTTP server');
    const info = SOURCE_INFO[source];
    setStatus(`Loading ${info.label} · ${info.count} files…`);
    const loader = new THREE.GLTFLoader();
    let library;
    if (source === 'ual1') {
      library = await loadUal1AnimationLibrary(loader, {
        THREE,
        rig: character.rig,
        baseUrl: '../../assets/UAL1_Animation_Split_Package/Animation_Only/No_Root_Motion/',
        fps: 30,
      });
    } else if (source === 'ual2') {
      library = await loadUal2AnimationLibrary(loader, {
        THREE,
        rig: character.rig,
        baseUrl: '../../assets/UAL2_Sword_Combat_Package/Animation_Only/No_Root_Motion/',
        fps: 30,
      });
    } else if (source === 'skyrim') {
      library = await loadSkyrimConvertedAnimationLibrary(loader, {
        THREE,
        rig: character.rig,
        baseUrl: '../../assets/skyrim/guard/converted/',
        fps: 30,
      });
    } else {
      library = await loadKayKitAnimationLibrary(loader, { baseUrl: '../../assets/kaykit/animations/' });
    }
    return registerLibrary(source, library);
  }

  async function importConvertedSkyrimFile(file) {
    if (!THREE.GLTFLoader) throw new Error('Three.js GLTFLoader is unavailable');
    setStatus(`Importing local Skyrim Guard bridge · ${file?.name || 'select a .glb'}…`);
    const loader = new THREE.GLTFLoader();
    const library = await importSkyrimConvertedAnimationFile(loader, file, {
      THREE,
      rig: character.rig,
      fps: 30,
      entry: SKYRIM_GUARD_CONVERTED_FILES[0],
    });
    sourceSelect.value = 'skyrim';
    return registerLibrary('skyrim', library, SOURCE_INFO.skyrim.defaultClip);
  }

  async function ensureBinding(binding) {
    if (!binding || binding.source === 'authored') return null;
    sourceSelect.value = binding.source;
    const library = await load(binding.source);
    populate(binding.source, binding.clipId);
    return library;
  }

  function isAvailable(binding) {
    return Boolean(binding?.source !== 'authored'
      && libraries.get(binding.source)?.clips.has(binding.clipId)
      && character.hasAnimation(binding.clipId));
  }

  async function bindSelected(fitToAction = false) {
    const source = selectedSource();
    const library = await load(source);
    const controlBinding = readAnimationBindingView(source);
    const sourceClip = library.clips.get(controlBinding.clipId);
    if (!sourceClip) throw new Error(`Select a ${SOURCE_INFO[source].label} clip first`);
    const binding = fitToAction ? createFittedAnimationBinding({
      ...controlBinding,
      source,
      animationDurationSeconds: sourceClip.duration,
      durationFrames: getClip().durationFrames,
      fps: getClip().fps,
    }) : controlBinding;
    setBinding(binding);
    return binding;
  }

  function clearNaturalPreviewTimers() {
    naturalPreviewToken += 1;
    if (contactTimer !== null) clearTimeout(contactTimer);
    if (hitstopReleaseTimer !== null) clearTimeout(hitstopReleaseTimer);
    contactTimer = null;
    hitstopReleaseTimer = null;
    if (naturalPreviewAction) naturalPreviewAction.paused = false;
    naturalPreviewAction = null;
  }

  async function playSelected() {
    const source = selectedSource();
    await load(source);
    const name = clipSelect.value;
    if (!name) throw new Error(`Select a ${SOURCE_INFO[source].label} clip first`);
    clearNaturalPreviewTimers();
    pausePlayer();
    clearWeaponTrail();
    setAnimationSource(`${source}-preview`);
    character.playAnimation(name, { loop: shouldLoopClip(name), inPlace: true });
    document.getElementById('clipNow').textContent = displayClipName(name).toUpperCase();
    document.getElementById('phaseNow').textContent = source === 'kaykit'
      ? 'KAYKIT RUNTIME'
      : `${source.toUpperCase()} RETARGET PREVIEW`;
    updatePlaybackButtons();
  }

  function emitExternalImpact() {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
    const EventCtor = globalThis.CustomEvent || window.CustomEvent;
    if (!EventCtor) return;
    window.dispatchEvent(new EventCtor('action-studio-external-impact'));
  }

  function activeFeelProfile() {
    if (typeof window === 'undefined') return 'active profile';
    return window.__actionStudio?.combatFeelProfile || 'active profile';
  }

  async function playSelectedWithImpact() {
    const source = selectedSource();
    const library = await load(source);
    const name = clipSelect.value;
    const sourceClip = library.clips.get(name);
    if (!sourceClip) throw new Error(`Select a ${SOURCE_INFO[source].label} clip first`);

    clearNaturalPreviewTimers();
    pausePlayer();
    clearWeaponTrail();
    const duration = Math.max(0, Number(sourceClip.duration) || 0);
    const contactInput = document.getElementById('externalImpactContact');
    const contactSeconds = clamp(contactInput?.value ?? contactSecondsFor(name, duration), 0, duration);
    const inPlace = document.getElementById('animationBindingInPlace')?.checked !== false;
    const token = naturalPreviewToken;

    setAnimationSource(`${source}-impact-preview`);
    naturalPreviewAction = character.playAnimation(name, {
      loop: false,
      inPlace,
      speed: 1,
      fadeSeconds: 0.04,
    });
    document.getElementById('clipNow').textContent = displayClipName(name).toUpperCase();
    document.getElementById('phaseNow').textContent = `${source.toUpperCase()} NATURAL IMPACT PREVIEW`;
    updatePlaybackButtons();

    contactTimer = setTimeout(() => {
      if (token !== naturalPreviewToken) return;
      if (naturalPreviewAction) naturalPreviewAction.paused = true;
      emitExternalImpact();
      const hitstopSeconds = Math.max(0, Number(document.getElementById('hitstop')?.value) || 0);
      hitstopReleaseTimer = setTimeout(() => {
        if (token !== naturalPreviewToken) return;
        if (naturalPreviewAction) naturalPreviewAction.paused = false;
      }, hitstopSeconds * 1000);
    }, contactSeconds * 1000);

    const clipName = displayClipName(name);
    setStatus(`impact preview · ${clipName} · Natural 1.00× · contact ${contactSeconds.toFixed(2)}s · ${activeFeelProfile()}`);
    return {
      source,
      clipId: name,
      speed: 1,
      durationSeconds: duration,
      contactSeconds,
    };
  }

  installContactControls();
  const impactButton = document.getElementById('previewKayKitWithImpact');
  impactButton?.addEventListener('click', () => {
    playSelectedWithImpact().catch((error) => setStatus(error.message, true));
  });
  document.getElementById('externalImpactContact')?.addEventListener('input', (event) => {
    saveCurrentContact(event.target.value);
  });

  sourceSelect.addEventListener('change', () => {
    clearNaturalPreviewTimers();
    const source = selectedSource();
    populate(source, getAction()?.animationBinding?.source === source ? getAction().animationBinding.clipId : '');
    const state = libraries.has(source) ? 'ready' : 'not loaded';
    setStatus(`${SOURCE_INFO[source].label} · ${state}`);
  });
  clipSelect.addEventListener('change', refreshContactControls);
  document.getElementById('loadKayKitAnimations').addEventListener('click', () => {
    load().catch((error) => setStatus(error.message, true));
  });
  document.getElementById('playKayKitAnimation').addEventListener('click', () => {
    playSelected().catch((error) => setStatus(error.message, true));
  });
  document.getElementById('stopKayKitAnimation').addEventListener('click', () => {
    clearNaturalPreviewTimers();
    applyCurrentEvaluation();
  });
  document.getElementById('bindKayKitAnimation').addEventListener('click', () => {
    bindSelected(false).catch((error) => setStatus(error.message, true));
  });
  document.getElementById('fitKayKitAnimation').addEventListener('click', () => {
    bindSelected(true).catch((error) => setStatus(error.message, true));
  });
  document.getElementById('clearAnimationBinding').addEventListener('click', () => {
    setBinding({ source: 'authored', clipId: getClip().id });
  });

  const skyrimFileInput = document.getElementById('skyrimConvertedFile');
  document.getElementById('importSkyrimConverted')?.addEventListener('click', () => skyrimFileInput?.click());
  skyrimFileInput?.addEventListener('change', () => {
    const file = skyrimFileInput.files?.[0];
    if (!file) return;
    importConvertedSkyrimFile(file).catch((error) => setStatus(error.message, true));
    skyrimFileInput.value = '';
  });

  populate(selectedSource());

  return {
    get libraries() { return libraries; },
    get guardRuntime() { return guardRuntime; },
    hasLoaded: (source) => libraries.has(source),
    isAvailable,
    ensureBinding,
    load,
    importConvertedSkyrimFile,
    bindSelected,
    playSelected,
    playSelectedWithImpact,
    refreshContactControls,
    saveCurrentContact,
    setStatus,
    playClip(source, name, playOptions = {}) {
      if (!libraries.has(source)) throw new Error(`${SOURCE_INFO[source]?.label || source} is not loaded`);
      clearNaturalPreviewTimers();
      setAnimationSource(`${source}-preview`);
      return character.playAnimation(name, playOptions);
    },
  };
}
