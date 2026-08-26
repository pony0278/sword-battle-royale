import test from 'node:test';
import assert from 'node:assert/strict';

import { createStudioExternalAnimationController } from '../tools/action-studio/studio-external-animation-controller.js';
import {
  LONGSWORD_DIRECTIONAL_ATTACKS,
  getCanonicalMotionContactSeconds,
} from '../src/combat/longsword-directional-metadata.js';

class FakeElement {
  constructor(value = '') {
    this.value = value;
    this.textContent = '';
    this.children = [];
    this.listeners = new Map();
    this.checked = false;
    this.disabled = false;
    this.classList = { toggle() {} };
  }

  set innerHTML(value) {
    this._innerHTML = value;
    this.children = [];
    this.value = '';
  }

  get innerHTML() { return this._innerHTML || ''; }

  appendChild(child) {
    this.children.push(child);
    if (this.children.length === 1) this.value = child.value;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }
}

function installFakeDocument(ids) {
  const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement()]));
  const previousDocument = globalThis.document;
  globalThis.document = {
    getElementById: (id) => elements[id],
    createElement: () => new FakeElement(),
  };
  return {
    elements,
    restore() {
      if (previousDocument === undefined) delete globalThis.document;
      else globalThis.document = previousDocument;
    },
  };
}

const COMMON_IDS = [
  'animationPackSource', 'kaykitClip', 'kaykitStatus',
  'loadKayKitAnimations', 'playKayKitAnimation', 'stopKayKitAnimation',
  'bindKayKitAnimation', 'fitKayKitAnimation', 'clearAnimationBinding',
  'animationBindingSpeed', 'animationBindingOffset', 'animationBindingInPlace', 'animationBindingLoop',
  'clipNow', 'phaseNow', 'hitstop',
];

test('canonical longsword directional attacks keep the verified clip and contact mapping', () => {
  assert.deepEqual(LONGSWORD_DIRECTIONAL_ATTACKS.top, {
    weapon: 'longsword',
    direction: 'top',
    clipId: 'UAL1/Sword_Attack',
    contactSeconds: 0.43,
  });
  assert.deepEqual(LONGSWORD_DIRECTIONAL_ATTACKS.right, {
    weapon: 'longsword',
    direction: 'right',
    clipId: 'UAL2/Sword_Regular_A',
    contactSeconds: 0.23,
  });
  assert.deepEqual(LONGSWORD_DIRECTIONAL_ATTACKS.left, {
    weapon: 'longsword',
    direction: 'left',
    clipId: 'UAL2/Sword_Regular_B',
    contactSeconds: 0.30,
  });
  assert.equal(getCanonicalMotionContactSeconds('UAL1/Sword_Attack'), 0.43);
  assert.equal(getCanonicalMotionContactSeconds('UAL2/Sword_Regular_A'), 0.23);
  assert.equal(getCanonicalMotionContactSeconds('UAL2/Sword_Regular_B'), 0.30);
  assert.equal(getCanonicalMotionContactSeconds('UAL2/Sword_Regular_C'), null);
});

test('cached UAL2 playback preserves the clip selected by the author', async () => {
  const { elements, restore } = installFakeDocument(COMMON_IDS);
  elements.animationPackSource.value = 'ual2';
  const played = [];

  try {
    const controller = createStudioExternalAnimationController({
      THREE: {},
      character: {
        rig: { bones: {} },
        playAnimation: (name) => played.push(name),
      },
      getAction: () => ({ animationBinding: { source: 'authored' } }),
      getClip: () => ({ id: 'test', fps: 30, durationFrames: 30 }),
      setBinding() {},
      pausePlayer() {},
      applyCurrentEvaluation() {},
      clearWeaponTrail() {},
      updatePlaybackButtons() {},
      setAnimationSource() {},
      renderBinding() {},
    });
    controller.libraries.set('ual2', {
      clips: new Map([
        ['UAL2/Sword_Regular_A', { duration: 0.433 }],
        ['UAL2/Sword_Regular_B', { duration: 0.533 }],
      ]),
    });
    elements.kaykitClip.value = 'UAL2/Sword_Regular_B';

    await controller.playSelected();

    assert.equal(elements.kaykitClip.value, 'UAL2/Sword_Regular_B');
    assert.deepEqual(played, ['UAL2/Sword_Regular_B']);

    elements.animationPackSource.value = 'ual1';
    controller.libraries.set('ual1', {
      clips: new Map([['UAL1/Sword_Attack', { duration: 1.533 }], ['UAL1/Sword_Idle', { duration: 1.667 }]]),
    });
    elements.kaykitClip.value = 'UAL1/Sword_Idle';
    await controller.playSelected();
    assert.equal(elements.kaykitClip.value, 'UAL1/Sword_Idle');
    assert.deepEqual(played, ['UAL2/Sword_Regular_B', 'UAL1/Sword_Idle']);
  } finally {
    restore();
  }
});

test('Preview + Impact keeps UAL1 Sword_Attack at natural speed and uses its motion contact marker', async () => {
  const { elements, restore } = installFakeDocument(COMMON_IDS);
  elements.animationPackSource.value = 'ual1';
  elements.animationBindingInPlace.checked = true;
  elements.hitstop.value = '0.03';
  const played = [];
  const bindings = [];
  let pauseCount = 0;

  try {
    const controller = createStudioExternalAnimationController({
      THREE: {},
      character: {
        rig: { bones: {} },
        playAnimation: (name, options) => {
          const action = { paused: false };
          played.push({ name, options, action });
          return action;
        },
      },
      getAction: () => ({ animationBinding: { source: 'authored' } }),
      getClip: () => ({
        id: 'slash_test',
        fps: 30,
        durationFrames: 26,
        timeline: [{ name: 'legacy-impact', frame: 14, impact: true }],
      }),
      setBinding: (binding) => bindings.push(binding),
      pausePlayer: () => { pauseCount += 1; },
      applyCurrentEvaluation() {},
      clearWeaponTrail() {},
      updatePlaybackButtons() {},
      setAnimationSource() {},
      renderBinding() {},
    });
    controller.libraries.set('ual1', {
      clips: new Map([
        ['UAL1/Sword_Attack', { duration: 1.533 }],
        ['UAL1/Sword_Idle', { duration: 1.667 }],
      ]),
    });
    elements.kaykitClip.value = 'UAL1/Sword_Attack';

    const result = await controller.playSelectedWithImpact();

    assert.equal(result.source, 'ual1');
    assert.equal(result.clipId, 'UAL1/Sword_Attack');
    assert.equal(result.speed, 1);
    assert.equal(result.durationSeconds, 1.533);
    assert.equal(result.contactSeconds, 0.43);
    assert.equal(bindings.length, 0, 'impact preview must not fit or replace the current Action binding');
    assert.equal(pauseCount, 1);
    assert.equal(played.length, 1);
    assert.equal(played[0].name, 'UAL1/Sword_Attack');
    assert.equal(played[0].options.speed, 1);
    assert.equal(played[0].options.loop, false);
    assert.match(elements.kaykitStatus.textContent, /Natural 1\.00×/);
    assert.match(elements.kaykitStatus.textContent, /contact 0\.43s/);

    await controller.playSelected(); // clears the pending contact timer before the test exits
  } finally {
    restore();
  }
});

test('Fit + bind remains available as an explicit authoring operation', async () => {
  const { elements, restore } = installFakeDocument(COMMON_IDS);
  elements.animationPackSource.value = 'ual1';
  elements.animationBindingSpeed.value = '1';
  elements.animationBindingOffset.value = '0';
  elements.animationBindingInPlace.checked = true;
  elements.animationBindingLoop.checked = false;
  const bindings = [];

  try {
    const controller = createStudioExternalAnimationController({
      THREE: {},
      character: { rig: { bones: {} } },
      getAction: () => ({ animationBinding: { source: 'authored' } }),
      getClip: () => ({ id: 'slash_test', fps: 30, durationFrames: 26 }),
      setBinding: (binding) => bindings.push(binding),
      pausePlayer() {},
      applyCurrentEvaluation() {},
      clearWeaponTrail() {},
      updatePlaybackButtons() {},
      setAnimationSource() {},
      renderBinding() {},
    });
    controller.libraries.set('ual1', {
      clips: new Map([['UAL1/Sword_Attack', { duration: 1.533 }]]),
    });
    elements.kaykitClip.value = 'UAL1/Sword_Attack';

    const binding = await controller.bindSelected(true);

    assert.equal(binding.clipId, 'UAL1/Sword_Attack');
    assert.ok(binding.speed > 1.7 && binding.speed < 1.8, 'explicit Fit + bind still compresses the clip to the Action duration');
    assert.equal(bindings.length, 1);
  } finally {
    restore();
  }
});
