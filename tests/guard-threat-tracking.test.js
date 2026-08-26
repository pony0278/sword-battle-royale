import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  GUARD_THREAT_TRACKING_STAGE,
  getGuardThreatTrackingProfile,
  planGuardThreatCorrection,
  predictGuardThreat,
} from '../src/combat/guard-threat-tracking.js';

const surface = { center: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, radius: 0.26, thickness: 0.075 };
function blade(z, y = 0.31) {
  return [
    { x: -0.25, y, z },
    { x: 0, y, z },
    { x: 0.25, y, z },
  ];
}
function close(actual, expected, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

test('G4.3A.1 profiles keep Guard correction smaller than Parry correction', () => {
  assert.equal(GUARD_THREAT_TRACKING_STAGE, 'G4.3A.1');
  const guard = getGuardThreatTrackingProfile('guard');
  const parry = getGuardThreatTrackingProfile('parry');
  assert.equal(guard.maxCorrectionMeters, 0.12);
  assert.equal(parry.maxCorrectionMeters, 0.18);
  assert.ok(guard.horizonSeconds < parry.horizonSeconds);
});

test('G4.3A.1 predicts the future low attack near the Buckler plane', () => {
  const threat = predictGuardThreat({
    previousBlade: blade(-0.30),
    currentBlade: blade(-0.20),
    bucklerSurface: surface,
    deltaSeconds: 0.1,
    horizonSeconds: 0.25,
    timeSamples: 20,
  });
  assert.ok(threat);
  assert.ok(threat.futureSeconds >= 0.15 && threat.futureSeconds <= 0.25);
  close(threat.radialDistance, 0.31, 1e-5);
  assert.ok(Math.abs(threat.signedDistance) < 0.03);
});

test('G4.3A.1 Guard tracking makes a bounded correction toward a low LEFT-like threat', () => {
  const plan = planGuardThreatCorrection({
    mode: 'guard',
    previousBlade: blade(-0.30),
    currentBlade: blade(-0.20),
    bucklerSurface: surface,
    deltaSeconds: 0.1,
    timeSamples: 20,
  });
  assert.equal(plan.mode, 'guard');
  assert.equal(plan.reachable, true);
  assert.ok(plan.requiredDistance > 0.09 && plan.requiredDistance < 0.11);
  close(plan.appliedDistance, plan.requiredDistance);
  assert.ok(plan.correction.y > 0.09);
});

test('G4.3A.1 clamps unreachable Guard tracking instead of magnetizing to the sword', () => {
  const farBlade = blade(-0.2, 0.52);
  const plan = planGuardThreatCorrection({
    mode: 'guard',
    previousBlade: blade(-0.3, 0.52),
    currentBlade: farBlade,
    bucklerSurface: surface,
    deltaSeconds: 0.1,
  });
  assert.equal(plan.reachable, false);
  close(plan.appliedDistance, 0.12);
  assert.equal(plan.reason, 'out-of-tracking-reach');
});

test('G4.3A.1 leaves already covered threats alone in Guard mode', () => {
  const plan = planGuardThreatCorrection({
    mode: 'guard',
    previousBlade: blade(-0.3, 0.12),
    currentBlade: blade(-0.2, 0.12),
    bucklerSurface: surface,
    deltaSeconds: 0.1,
  });
  close(plan.requiredDistance, 0);
  close(plan.appliedDistance, 0);
  assert.equal(plan.reason, 'already-covered');
});

test('G4.3A.1 keeps Three r128 slerpQuaternions result out of chaining assignments', async () => {
  const source = await readFile(new URL('../src/combat/guard-threat-tracking.js', import.meta.url), 'utf8');
  assert.match(source, /const limitedWorldDelta = new THREE\.Quaternion\(\);/);
  assert.match(source, /limitedWorldDelta\.slerpQuaternions\(/);
  assert.doesNotMatch(source, /const\s+limitedWorldDelta\s*=\s*new THREE\.Quaternion\(\)\.slerpQuaternions\(/);
});

test('R17 residual refinement persists separately, stays bounded, and resets without mutating primary intent', async () => {
  const source = await readFile(new URL('../src/combat/guard-threat-tracking.js', import.meta.url), 'utf8');
  const updateStart = source.indexOf('function update(plan,');
  const refineStart = source.indexOf('function refineMeasuredContact(');
  const resetStart = source.indexOf('function reset()', refineStart);
  assert.ok(updateStart >= 0 && refineStart > updateStart && resetStart > refineStart);
  const updateBody = source.slice(updateStart, refineStart);
  const refineBody = source.slice(refineStart, resetStart);
  const resetBody = source.slice(resetStart);
  assert.match(source, /GUARD_THREAT_RESIDUAL_REFINEMENT_STAGE = 'G4\.3B\.5R\.3\.5'/);
  assert.match(updateBody, /constrainResidualOffset\(profile\)/);
  assert.match(updateBody, /if \(mode !== 'parry'\) residualOffset\.set\(0, 0, 0\)/);
  assert.match(updateBody, /targetCenter[\s\S]*\.add\(combinedOffset\)/);
  assert.match(refineBody, /profile\.maxTrackingSpeedMps \* dt \* speedScale/);
  assert.match(refineBody, /residualOffset\.add\(desiredOffset\)/);
  assert.match(refineBody, /constrainResidualOffset\(profile, refinementOptions\.maxResidualMeters\)/);
  assert.match(refineBody, /residualLimitMeters/);
  assert.match(refineBody, /preservedPrimaryOffset/);
  assert.match(refineBody, /persistent-bounded-residual-carry-no-contact-authority/);
  assert.doesNotMatch(refineBody, /currentOffset\.add/);
  assert.match(resetBody, /residualOffset\.set\(0, 0, 0\)/);
  assert.match(source, /get residualOffset\(\)/);
});
