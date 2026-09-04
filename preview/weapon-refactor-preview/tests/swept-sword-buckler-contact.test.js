import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SWEPT_SWORD_BUCKLER_CONTACT_STAGE,
  normalizeBucklerParrySurface,
  probeSweptSwordBucklerContact,
} from '../src/combat/swept-sword-buckler-contact.js';
import {
  ACCEPTED_OFFHAND_BUCKLER_MOUNT_G423,
  ACCEPTED_OFFHAND_BUCKLER_SHAPE_G423,
  OFFHAND_BUCKLER_ACCEPTED_CALIBRATION_STAGE,
} from '../src/character/offhand-buckler-accepted-calibration.js';

function close(actual, expected, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

const surface = {
  center: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  radius: 0.26,
  thickness: 0.075,
};

test('G4.2.3 accepted Buckler calibration is the exact user-reviewed HAND_L mount', () => {
  assert.equal(OFFHAND_BUCKLER_ACCEPTED_CALIBRATION_STAGE, 'G4.2.3');
  assert.deepEqual(ACCEPTED_OFFHAND_BUCKLER_MOUNT_G423.position, { x: 0, y: 0, z: 0.035 });
  close(ACCEPTED_OFFHAND_BUCKLER_MOUNT_G423.rotation.y, Math.PI / 2);
  assert.deepEqual(ACCEPTED_OFFHAND_BUCKLER_MOUNT_G423.scale, { x: 1, y: 1, z: 1 });
  assert.equal(ACCEPTED_OFFHAND_BUCKLER_SHAPE_G423.radius, 0.24);
  assert.equal(ACCEPTED_OFFHAND_BUCKLER_SHAPE_G423.parryRadius, 0.26);
  assert.equal(ACCEPTED_OFFHAND_BUCKLER_SHAPE_G423.parryThickness, 0.075);
});

test('G4.3A normalizes Buckler world surface', () => {
  const normalized = normalizeBucklerParrySurface(surface);
  close(normalized.normal.z, 1);
  close(normalized.radius, 0.26);
  close(normalized.thickness, 0.075);
  assert.equal(SWEPT_SWORD_BUCKLER_CONTACT_STAGE, 'G4.3A');
});

test('G4.3A detects high-speed tunneling through the Buckler between frames', () => {
  const result = probeSweptSwordBucklerContact({
    previousBlade: [
      { x: -0.18, y: 0, z: 0.22 },
      { x: 0, y: 0, z: 0.22 },
      { x: 0.18, y: 0, z: 0.22 },
    ],
    currentBlade: [
      { x: -0.18, y: 0, z: -0.22 },
      { x: 0, y: 0, z: -0.22 },
      { x: 0.18, y: 0, z: -0.22 },
    ],
    bucklerSurface: surface,
    deltaSeconds: 1 / 60,
    active: true,
  });
  assert.equal(result.contact, true);
  assert.equal(result.geometricContact, true);
  assert.equal(result.mode, 'swept-strip');
  assert.ok(result.sweepAlpha > 0.3 && result.sweepAlpha < 0.7);
  assert.ok(result.radialDistance <= 0.26);
  assert.ok(result.incomingVelocity.z < 0);
  assert.ok(result.approachDot < -0.9);
});

test('G4.3A rejects a swept crossing outside Buckler radius', () => {
  const result = probeSweptSwordBucklerContact({
    previousBlade: [
      { x: 0.5, y: 0, z: 0.2 },
      { x: 0.6, y: 0, z: 0.2 },
      { x: 0.7, y: 0, z: 0.2 },
    ],
    currentBlade: [
      { x: 0.5, y: 0, z: -0.2 },
      { x: 0.6, y: 0, z: -0.2 },
      { x: 0.7, y: 0, z: -0.2 },
    ],
    bucklerSurface: surface,
    active: true,
  });
  assert.equal(result.contact, false);
  assert.equal(result.reason, 'no-swept-intersection');
  assert.equal(result.diagnostics.closestApproach.insideSlab, true);
  assert.equal(result.diagnostics.closestApproach.insideDisc, false);
  close(result.diagnostics.closestApproach.planeGapMeters, 0);
  assert.ok(result.diagnostics.closestApproach.radialGapMeters > 0.2);
  assert.equal(result.diagnostics.closestApproach.authority, 'sampled-closest-approach-diagnostic-only');
});

test('G4.3A separates geometric touch from ACTIVE combat eligibility', () => {
  const result = probeSweptSwordBucklerContact({
    previousBlade: [
      { x: -0.1, y: 0, z: 0.08 },
      { x: 0, y: 0, z: 0.08 },
      { x: 0.1, y: 0, z: 0.08 },
    ],
    currentBlade: [
      { x: -0.1, y: 0, z: 0.02 },
      { x: 0, y: 0, z: 0.02 },
      { x: 0.1, y: 0, z: 0.02 },
    ],
    bucklerSurface: surface,
    active: false,
  });
  assert.equal(result.geometricContact, true);
  assert.equal(result.contact, false);
  assert.equal(result.eligible, false);
  assert.equal(result.reason, 'contact-outside-active-window');
  assert.equal(result.diagnostics.closestApproach.combinedGapMeters, 0);
  assert.equal(result.diagnostics.closestApproach.authority, 'exact-swept-contact');
});

test('G4.3A midpoint polyline produces blade-fraction and incoming-motion metadata for future recoil', () => {
  const result = probeSweptSwordBucklerContact({
    previousBlade: [
      { x: -0.6, y: 0, z: 0.2 },
      { x: -0.05, y: 0, z: 0.2 },
      { x: 0.7, y: 0, z: 0.2 },
    ],
    currentBlade: [
      { x: -0.6, y: 0, z: -0.2 },
      { x: -0.05, y: 0, z: -0.2 },
      { x: 0.7, y: 0, z: -0.2 },
    ],
    bucklerSurface: surface,
    active: true,
  });
  assert.equal(result.contact, true);
  assert.ok(result.bladeFraction > 0.3 && result.bladeFraction < 0.8);
  assert.ok(Number.isFinite(result.sweepAlpha));
  assert.ok(Number.isFinite(result.radialDistance));
  assert.ok(Number.isFinite(result.incomingVelocity.x));
  assert.ok(Number.isFinite(result.incomingVelocity.y));
  assert.ok(Number.isFinite(result.incomingVelocity.z));
});
