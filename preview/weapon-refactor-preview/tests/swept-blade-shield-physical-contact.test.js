import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SWEPT_BLADE_SHIELD_PHYSICAL_CONTACT_STAGE,
  probeSweptBladeShieldPhysicalContact,
} from '../src/combat/swept-blade-shield-physical-contact.js';

const IDENTITY_POSE = Object.freeze({
  center: Object.freeze({ x: 0, y: 0, z: 0 }),
  quaternion: Object.freeze({ x: 0, y: 0, z: 0, w: 1 }),
});

function horizontalBlade(y, x0 = -0.30, x1 = 0.30, z = 0) {
  return [
    { x: x0, y, z },
    { x: (x0 + x1) * 0.5, y, z },
    { x: x1, y, z },
  ];
}

function probe(overrides = {}) {
  return probeSweptBladeShieldPhysicalContact({
    previousBlade: horizontalBlade(0.18),
    currentBlade: horizontalBlade(-0.18),
    previousShieldPose: IDENTITY_POSE,
    currentShieldPose: IDENTITY_POSE,
    shieldRadiusMeters: 0.42,
    shieldThicknessMeters: 0.06,
    rimBandMeters: 0.035,
    localFaceNormal: { x: 0, y: -1, z: 0 },
    deltaSeconds: 1 / 240,
    ...overrides,
  });
}

test('G4.3B.5R.2.9.1 finds earliest swept contact on the blade body instead of waiting for a tip trigger', () => {
  const contact = probe();
  assert.equal(contact.stage, SWEPT_BLADE_SHIELD_PHYSICAL_CONTACT_STAGE);
  assert.equal(contact.contact, true);
  assert.equal(contact.geometricContact, true);
  assert.ok(contact.sweepAlpha > 0 && contact.sweepAlpha < 1);
  assert.ok(contact.timeOfImpactSeconds > 0 && contact.timeOfImpactSeconds < 1 / 240);
  assert.ok(contact.bladeFraction > 0.35 && contact.bladeFraction < 0.65, `blade fraction ${contact.bladeFraction}`);
  assert.equal(contact.contactFeature, 'FACE');
  assert.equal(contact.diagnostics.relativeFrame, true);
});

test('G4.3B.5R.2.9.1 moving shield can create contact against a stationary blade in the relative frame', () => {
  const stationaryBlade = horizontalBlade(0);
  const contact = probe({
    previousBlade: stationaryBlade,
    currentBlade: stationaryBlade,
    previousShieldPose: {
      center: { x: 0, y: -0.18, z: 0 },
      quaternion: { x: 0, y: 0, z: 0, w: 1 },
    },
    currentShieldPose: {
      center: { x: 0, y: 0.18, z: 0 },
      quaternion: { x: 0, y: 0, z: 0, w: 1 },
    },
  });
  assert.equal(contact.contact, true);
  assert.ok(contact.sweepAlpha > 0 && contact.sweepAlpha < 1);
  assert.ok(contact.bladeFraction > 0.35 && contact.bladeFraction < 0.65);
});

test('G4.3B.5R.2.9.1 reports near-edge contact as RIM with a lateral normal component', () => {
  const previousBlade = [
    { x: 0.405, y: 0.18, z: -0.10 },
    { x: 0.405, y: 0.18, z: 0 },
    { x: 0.405, y: 0.18, z: 0.10 },
  ];
  const currentBlade = previousBlade.map((point) => ({ ...point, y: -0.18 }));
  const contact = probe({ previousBlade, currentBlade });
  assert.equal(contact.contact, true);
  assert.equal(contact.contactFeature, 'RIM');
  assert.ok(contact.rimWeight > 0.2);
  assert.ok(contact.localNormal.x > 0.2, `rim normal x ${contact.localNormal.x}`);
  assert.ok(contact.localNormal.y < -0.2, `rim normal y ${contact.localNormal.y}`);
});

test('G4.3B.5R.2.9.1 rejects swept blade motion that stays outside the shield radius', () => {
  const previousBlade = [
    { x: 0.58, y: 0.18, z: -0.12 },
    { x: 0.58, y: 0.18, z: 0 },
    { x: 0.58, y: 0.18, z: 0.12 },
  ];
  const currentBlade = previousBlade.map((point) => ({ ...point, y: -0.18 }));
  const contact = probe({ previousBlade, currentBlade });
  assert.equal(contact.contact, false);
  assert.equal(contact.geometricContact, false);
});

test('G4.3B.5R.2.9.1 preserves active-window authority separately from geometric contact', () => {
  const contact = probe({ active: false });
  assert.equal(contact.geometricContact, true);
  assert.equal(contact.contact, false);
  assert.equal(contact.reason, 'relative-swept-contact-outside-active-window');
});
