import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { DEFAULT_KAYKIT_SWORD_MOUNT } from '../src/character/default-character-mount.js';
import { composeSkyrimWeaponMountCalibration } from '../src/animation/skyrim-weapon-bind-calibration.js';
import { createStudioGameMountPreview, readWeaponBind } from '../tools/action-studio/studio-game-mount-preview.js';

// Action Studio mounts its stage sword with the author's dialled calibration; src/game/bootstrap.js
// mounts a Skyrim-driven fighter with that calibration composed with the clip's G2.4.5 weapon bind.
// The two differ by 112.1 degrees, and measured against the haft direction 2hm_idle itself carries,
// the studio's is 40.8 degrees off where the clip holds the sword and the game's is 22.9.
//
// So the studio shows the game's angle now - as an OVERLAY. The distinction is the whole test file:
// `mountCalibration` in the entry is the author's base. The dial renders it, Save writes it,
// project JSON carries it, setProject writes it back on every load, and Bake Pose Keys solves poses
// against the sword's world grip and writes the answer into clip.poses. A composed mount living in
// that variable would make the dial lie, compose a second time on the next nudge of any axis, and
// bake authored poses against a blade the author never chose.

const BIND = Object.freeze({
  correctionQuaternion: Object.freeze([0.18599574, -0.80092339, -0.11031984, 0.55835189]),
  correctionAngleDegrees: 112.116207,
});

function installFakeDom(checked = true) {
  const toggle = { checked };
  const status = { textContent: '' };
  const previous = globalThis.document;
  globalThis.document = {
    getElementById: (id) => (id === 'gameMount' ? toggle : (id === 'gameMountStatus' ? status : null)),
  };
  return {
    toggle,
    status,
    restore() {
      if (previous === undefined) delete globalThis.document;
      else globalThis.document = previous;
    },
  };
}

function harness({ checked = true, clip = { userData: { weaponBindCalibration: BIND } } } = {}) {
  const dom = installFakeDom(checked);
  const weapon = { object3d: new THREE.Object3D() };
  // A base the author has dialled away from the default, so "wrote the base" cannot be confused
  // with "wrote the default".
  const base = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0.25, y: 0, z: Math.PI }, scale: { x: 1, y: 1, z: 1 } };
  let bound = clip;
  const preview = createStudioGameMountPreview(THREE, {
    getWeapon: () => weapon,
    getBaseMount: () => base,
    getBoundClip: () => bound,
  });
  return { dom, weapon, base, preview, setClip(next) { bound = next; } };
}

test('a clip with no Skyrim weapon bind is refused, because composing would throw', () => {
  // composeSkyrimWeaponMountCalibration throws without a correction quaternion, and most clips have
  // none: every authored template, every KayKit and UAL clip, and the virtual production-parry
  // clips the Skyrim library derives. verify-built-studio.mjs fails on any console error, so an
  // unguarded compose would take the page's boot gate down with it.
  assert.equal(readWeaponBind(undefined), null);
  assert.equal(readWeaponBind({}), null);
  assert.equal(readWeaponBind({ userData: {} }), null);
  assert.equal(readWeaponBind({ userData: { weaponBindCalibration: {} } }), null);
  assert.equal(readWeaponBind({ userData: { weaponBindCalibration: BIND } }), BIND);
  assert.throws(() => composeSkyrimWeaponMountCalibration(THREE, DEFAULT_KAYKIT_SWORD_MOUNT, {}));
});

test('with a bind, the blade wears the composed mount', () => {
  const { dom, weapon, base, preview } = harness();
  try {
    preview.update();
    const expected = composeSkyrimWeaponMountCalibration(THREE, base, BIND);
    assert.equal(preview.applied, 'game');
    for (const axis of ['x', 'y', 'z']) {
      assert.ok(Math.abs(weapon.object3d.rotation[axis] - expected.rotation[axis]) < 1e-9, axis);
    }
    assert.match(dom.status.textContent, /112\.1/);
  } finally {
    dom.restore();
  }
});

test('the author\'s base is never written - it is read, never mutated', () => {
  const { dom, base, preview } = harness();
  try {
    const before = JSON.stringify(base);
    preview.update();
    preview.update();
    // The one property everything else in the studio depends on: the dial, Save, project JSON and
    // setProject all read this object.
    assert.equal(JSON.stringify(base), before);
  } finally {
    dom.restore();
  }
});

test('without a bind, or switched off, the blade goes back to the author\'s mount', () => {
  for (const [label, options] of [
    ['no bind', { clip: { userData: {} } }],
    ['switched off', { checked: false }],
  ]) {
    const { dom, weapon, base, preview } = harness(options);
    try {
      preview.update();
      assert.equal(preview.applied, 'author', label);
      for (const axis of ['x', 'y', 'z']) {
        assert.ok(Math.abs(weapon.object3d.rotation[axis] - base.rotation[axis]) < 1e-9, `${label}/${axis}`);
      }
    } finally {
      dom.restore();
    }
  }
});

test('withBaseMount hands back the author\'s blade, then puts the preview back', () => {
  // Bake Pose Keys runs in here. It solves against the sword's world grip and writes the result
  // into clip.poses - authored data that ships and replays in the game - so a pose baked under the
  // preview mount would be silently and permanently wrong.
  const { dom, weapon, base, preview } = harness();
  try {
    preview.update();
    assert.equal(preview.applied, 'game');
    let sawDuring = null;
    const returned = preview.withBaseMount(() => {
      sawDuring = weapon.object3d.rotation.x;
      return 'baked';
    });
    assert.equal(returned, 'baked');
    assert.ok(Math.abs(sawDuring - base.rotation.x) < 1e-9, `bake saw ${sawDuring}, not the author's ${base.rotation.x}`);
    assert.equal(preview.applied, 'game', 'the preview was not put back');
  } finally {
    dom.restore();
  }
});

test('withBaseMount restores even when the bake throws', () => {
  const { dom, preview } = harness();
  try {
    preview.update();
    assert.throws(() => preview.withBaseMount(() => { throw new Error('bake failed'); }), /bake failed/);
    assert.equal(preview.applied, 'game');
  } finally {
    dom.restore();
  }
});

test('a swapped weapon is written again, because nothing was on it', () => {
  // The stage weapon selector builds a NEW sword. Without invalidate the preview would believe the
  // composed mount was already applied and leave the new blade wearing the author's.
  const { dom, weapon, preview } = harness();
  try {
    preview.update();
    assert.equal(preview.applied, 'game');
    weapon.object3d = new THREE.Object3D();
    preview.invalidate();
    assert.equal(preview.applied, null);
    preview.update();
    assert.equal(preview.applied, 'game');
    assert.ok(Math.abs(weapon.object3d.rotation.z) > 1e-6, 'the new blade never got the mount');
  } finally {
    dom.restore();
  }
});
