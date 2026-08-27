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
  // R18R.1: Guard now reaches further than Parry (it has to cover every direction from one
  // stance) but moves slower, and reads further ahead to pay for that slower travel.
  assert.equal(guard.maxCorrectionMeters, 0.34);
  assert.equal(parry.maxCorrectionMeters, 0.18);
  assert.ok(guard.maxTrackingSpeedMps < parry.maxTrackingSpeedMps);
  assert.ok(guard.horizonSeconds > parry.horizonSeconds);
  assert.equal(guard.threatSelection, 'disc-distance');
  assert.equal(parry.threatSelection, 'plane-first');
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
  // R18R.1: Guard aims deeper than it used to (comfortRadiusRatio 0.55), so the same low threat
  // now asks for more correction than the old 10cm nudge.
  assert.ok(plan.requiredDistance > 0.14 && plan.requiredDistance < 0.18);
  close(plan.appliedDistance, plan.requiredDistance);
  assert.ok(plan.correction.y > 0.14);
});

test('G4.3A.1 clamps unreachable Guard tracking instead of magnetizing to the sword', () => {
  const farBlade = blade(-0.2, 0.84);
  const plan = planGuardThreatCorrection({
    mode: 'guard',
    previousBlade: blade(-0.3, 0.84),
    currentBlade: farBlade,
    bucklerSurface: surface,
    deltaSeconds: 0.1,
  });
  assert.equal(plan.reachable, false);
  close(plan.appliedDistance, 0.34);
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
  // R18R.6: Guard carries a measured residual too, so only 'off' clears it.
  assert.match(updateBody, /if \(mode === 'off'\) residualOffset\.set\(0, 0, 0\)/);
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

test('R18R.1 disc-distance beats plane-first when a hilt end grazes the plane far off the disc', () => {
  // A blade lying on the shield plane but a metre off centre, versus one still 40cm out but
  // heading at the disc. plane-first picks the first; a Guard that does the same holds its line
  // against a point the blade never occupies.
  const previousBlade = [
    { x: 1.2, y: 0.9, z: 0.0 },
    { x: 1.0, y: 0.9, z: -0.02 },
    { x: 0.02, y: 0.92, z: -0.7 },
  ];
  const currentBlade = previousBlade.map((point) => ({ ...point }));
  const graze = { center: { x: 0, y: 0.9, z: 0 }, normal: { x: 0, y: 0, z: 1 }, radius: 0.1, thickness: 0.02 };
  const input = { previousBlade, currentBlade, bucklerSurface: graze, deltaSeconds: 0.1, horizonSeconds: 0 };
  const planeFirst = predictGuardThreat({ ...input, selection: 'plane-first' });
  const discDistance = predictGuardThreat({ ...input, selection: 'disc-distance' });
  assert.equal(planeFirst.selection, 'plane-first');
  assert.equal(discDistance.selection, 'disc-distance');
  assert.ok(Math.abs(planeFirst.signedDistance) < 0.05, 'plane-first takes the point nearest the plane');
  assert.ok(planeFirst.radialDistance > 0.9, 'even though it is a metre off the disc');
  assert.ok(Math.abs(discDistance.signedDistance) > 0.5, 'disc-distance accepts depth to be on the line');
  assert.ok(discDistance.radialDistance < 0.2, 'disc-distance takes the one actually aimed at the shield');
});

test('R18R.4 rigid extrapolation follows the swing arc that linear velocity leaves behind', () => {
  // A blade rotating about the origin in the xz plane, 20 degrees of arc per frame, with both of
  // its nodes out near the tip so no part of it passes through the axis. The shield sits on the
  // arc a few frames ahead. Linear extrapolation sends each node off along its tangent and misses;
  // the rigid step replays the rotation and arrives.
  const swingRadius = 0.9;
  const at = (degrees) => {
    const radians = (degrees * Math.PI) / 180;
    return [0.85, 1.0].map((scale) => ({
      x: Math.cos(radians) * swingRadius * scale,
      y: 1,
      z: Math.sin(radians) * swingRadius * scale,
    }));
  };
  const deltaSeconds = 1 / 60;
  const arcSurface = {
    center: { x: 0, y: 1, z: swingRadius * 0.925 },
    normal: { x: 0, y: 0, z: 1 },
    radius: 0.02,
    thickness: 0.01,
  };
  const input = {
    previousBlade: at(0),
    currentBlade: at(20),
    bucklerSurface: arcSurface,
    deltaSeconds,
    horizonSeconds: deltaSeconds * 5,
    timeSamples: 10,
    selection: 'disc-distance',
  };
  const linear = predictGuardThreat({ ...input, extrapolation: 'linear' });
  const rigid = predictGuardThreat({ ...input, extrapolation: 'rigid' });
  assert.equal(linear.extrapolation, 'linear');
  assert.equal(rigid.extrapolation, 'rigid');
  const distanceToDisc = (threat) => Math.hypot(threat.signedDistance, threat.outsideDisc);
  assert.ok(distanceToDisc(rigid) < 0.12, `rigid should reach the arc, got ${distanceToDisc(rigid)}`);
  assert.ok(distanceToDisc(linear) > 4 * distanceToDisc(rigid),
    `linear ${distanceToDisc(linear)} should be far worse than rigid ${distanceToDisc(rigid)}`);
  assert.ok(Math.abs(Math.hypot(rigid.worldPoint.x, rigid.worldPoint.z) - swingRadius * 0.925) < 0.15,
    'the rigid prediction stays on the arc');
});

test('R18R.4 an unknown extrapolation or selection falls back to the original behaviour', () => {
  const input = {
    previousBlade: blade(-0.30), currentBlade: blade(-0.20),
    bucklerSurface: surface, deltaSeconds: 0.1, horizonSeconds: 0.25, timeSamples: 20,
  };
  const fallback = predictGuardThreat({ ...input, selection: 'nonsense', extrapolation: 'nonsense' });
  const original = predictGuardThreat(input);
  assert.equal(fallback.selection, 'plane-first');
  assert.equal(fallback.extrapolation, 'linear');
  assert.deepEqual(fallback.point, original.point);
});
