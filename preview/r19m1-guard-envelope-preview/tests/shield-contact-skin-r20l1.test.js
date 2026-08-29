import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SHIELD_CONTACT_SKIN_METERS,
  SHIELD_CONTACT_SKIN_STAGE,
  applyShieldContactSkin,
} from '../src/combat/shield-contact-skin.js';

const surface = Object.freeze({
  center: Object.freeze({ x: 0, y: 1, z: 0.5 }),
  normal: Object.freeze({ x: 0, y: 0, z: 1 }),
  radius: 0.26,
  thickness: 0.075,
  visualRadius: 0.24,
});

test('R20L.1 declares a 2cm blocking skin and grows only the radius', () => {
  assert.equal(SHIELD_CONTACT_SKIN_METERS, 0.02);
  const skinned = applyShieldContactSkin(surface);
  assert.equal(skinned.radius, 0.28);
  assert.equal(skinned.thickness, surface.thickness, 'the board is not thicker, only wider');
  assert.deepEqual(skinned.center, surface.center);
  assert.deepEqual(skinned.normal, surface.normal);
  assert.equal(skinned.contactSkinMeters, 0.02, 'the volume says how generous it is being');
  assert.equal(skinned.stage, SHIELD_CONTACT_SKIN_STAGE);
  assert.equal(surface.radius, 0.26, 'the true surface is never mutated');
});

test('R20L.1 a zero or nonsense skin hands back the surface untouched', () => {
  for (const skin of [0, -1, Number.NaN, null]) {
    assert.equal(applyShieldContactSkin(surface, skin), surface, `${String(skin)} must be a no-op`);
  }
  assert.equal(applyShieldContactSkin(null), null);
});

test('R20L.1 only the two blade probes see the skinned volume', () => {
  const director = readFileSync(new URL('../src/combat/contact-lifecycle-director.js', import.meta.url), 'utf8');
  assert.match(director, /const blockingSurface = applyShieldContactSkin\(currentShieldSurface\);/);
  // Both swept blade probes - production authority and the moving-shield observer.
  assert.equal((director.match(/bucklerSurface: blockingSurface,/g) || []).length, 2);
  // The clang keeps its own surface: it is a different mechanic with its own contact volume.
  assert.match(director, /probeHiltClangContact\(\{[\s\S]*bucklerSurface: currentShieldSurface,/);
  // The depth-order test asks which side of the shield plane things are on - a question about
  // sides, not about volume - so it reads the true surface too.
  assert.match(director, /shieldSurface: currentShieldSurface,/);
});

test('R20L.1 records why the volume is generous rather than the aim being fixed', () => {
  const source = readFileSync(new URL('../src/combat/shield-contact-skin.js', import.meta.url), 'utf8');
  // The measurement that rules out aiming as the fix: the arm cannot be aimed at something this
  // fast, so a block is interposition and the tolerance is what has to be honest.
  assert.match(source, /24-120 m\/s/);
  assert.match(source, /2\.5 m\/s/);
  assert.match(source, /interposition/);
  // And the two costs that were measured before the number was chosen.
  assert.match(source, /lateness cliff does not move/);
  assert.match(source, /golden cell keeps its verdict/);
});
