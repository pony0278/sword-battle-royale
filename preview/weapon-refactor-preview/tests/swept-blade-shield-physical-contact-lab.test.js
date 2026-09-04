import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../tools/action-studio/swept-blade-shield-physical-contact-lab-r291.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../tools/action-studio/swept-blade-shield-physical-contact-lab-r291.html', import.meta.url), 'utf8');

test('G4.3B.5R.2.9.1 lab exposes earliest TOI, blade fraction, and contact feature telemetry', () => {
  assert.match(html, /G4\.3B\.5R\.2\.9\.1 · Swept Blade–Shield Physical Contact/);
  assert.match(html, /id="hudTOI"/);
  assert.match(html, /id="hudBlade"/);
  assert.match(html, /id="hudFeature"/);
  assert.match(html, /whole blade swept strip/);
  assert.match(html, /earliest TOI/);
  assert.match(html, /FACE \/ RIM/);
});

test('G4.3B.5R.2.9.1 runs whole-blade CCD before physical impulse solve', () => {
  const ccd = source.indexOf('probeSweptBladeShieldPhysicalContact({');
  const impulse = source.indexOf('solveKinematicShieldSwordImpulse({');
  assert.ok(ccd >= 0, 'whole-blade CCD call must exist');
  assert.ok(impulse > ccd, 'impulse solve must happen after CCD');
  assert.match(source, /contactPoint: contact\.point/);
  assert.match(source, /contactNormal: contact\.normal/);
});

test('G4.3B.5R.2.9.1 rewinds sword pose to TOI instead of solving after penetration', () => {
  assert.match(source, /const alpha = contact\.sweepAlpha/);
  assert.match(source, /sword\.position\.lerpVectors\(previousSwordPosition, predictedSwordPosition, alpha\)/);
  assert.match(source, /previousSwordQuaternion\)\.slerp\(predictedSwordQuaternion, alpha\)/);
  assert.match(source, /const remaining = dt \* \(1 - alpha\)/);
  assert.match(source, /integrateDynamicSword\(remaining\)/);
});

test('G4.3B.5R.2.9.1 has no tip-only trigger, contact bias, IK, or pose-target authority', () => {
  assert.doesNotMatch(source, /shieldSurfaceAtTip/);
  assert.doesNotMatch(source, /previousSignedDistance/);
  assert.doesNotMatch(source, /contactBias/);
  assert.doesNotMatch(source, /aimEffectorWithBone/);
  assert.doesNotMatch(source, /followRatio/);
  assert.doesNotMatch(source, /applyRigPose/);
  assert.doesNotMatch(source, /targetPose/);
  assert.match(source, /wholeBladeSweep: true/);
  assert.match(source, /noTipOnlyTrigger: true/);
  assert.match(source, /noContactBias: true/);
});

test('G4.3B.5R.2.9.1 keeps high-frequency physical sampling and a persistent first-contact marker', () => {
  assert.match(source, /const FIXED_DT = 1 \/ 240/);
  assert.match(source, /contactMarker\.position\.copy\(point\); contactMarker\.visible = true/);
  assert.match(source, /normalArrow\.setDirection\(normal\.clone\(\)\.normalize\(\)\)/);
});
