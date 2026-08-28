import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('tools/action-studio/physical-grip-wrist-compliance-lab-r292.html', 'utf8');
const source = fs.readFileSync('tools/action-studio/physical-grip-wrist-compliance-lab-r292.js', 'utf8');

function section(name, nextName) {
  const start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `missing function ${name}`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : source.length;
  return source.slice(start, end > start ? end : source.length);
}

test('G4.3B.5R.2.9.2 HTML loads the dedicated physical grip wrist lab', () => {
  assert.match(html, /G4\.3B\.5R\.2\.9\.2/);
  assert.match(html, /physical-grip-wrist-compliance-lab-r292\.js/);
  assert.match(html, /Grip stiffness/);
  assert.match(html, /Wrist stiffness/);
  assert.match(html, /no hard snap \/ IK \/ pose target/);
});

test('G4.3B.5R.2.9.2 contact authority remains whole-blade CCD then blade impulse', () => {
  const contact = section('solveContact', 'fixedStep');
  const ccd = contact.indexOf('probeSweptBladeShieldPhysicalContact({');
  const impulse = contact.indexOf('solveKinematicShieldSwordImpulse({');
  const grip = contact.indexOf('integrateCompliantSystem(dt * (1 - alpha))');
  assert.ok(ccd >= 0);
  assert.ok(impulse > ccd);
  assert.ok(grip > impulse);
  assert.match(contact, /sword\.position\.lerpVectors\(previousSwordPosition, predictedSwordPosition, alpha\)/);
  assert.match(contact, /contactPoint: contact\.point/);
  assert.match(contact, /contactNormal: contact\.normal/);
});

test('G4.3B.5R.2.9.2 post-contact system uses impulses instead of grip snapping or IK', () => {
  const compliance = section('applyConstraintSubstep', 'integrateCompliantSystem');
  assert.match(compliance, /solveForearmAnchorImpulse\(/);
  assert.match(compliance, /solveCompliantGripPointImpulse\(/);
  assert.match(compliance, /solveWristAngularComplianceImpulse\(/);
  assert.match(compliance, /sword\.position\.addScaledVector\(swordLinearVelocity, dt\)/);
  assert.match(compliance, /hand\.position\.addScaledVector\(handLinearVelocity, dt\)/);
  assert.doesNotMatch(compliance, /sword\.position\.copy\(hand\.position\)/);
  assert.doesNotMatch(compliance, /hand\.position\.copy\(gripWorld\)/);
  assert.doesNotMatch(compliance, /aimEffectorWithBone|applyRigPose|followRatio|poseTarget|targetPose/);
});

test('G4.3B.5R.2.9.2 keeps high-rate physics and substepped constraints', () => {
  assert.match(source, /const FIXED_DT = 1 \/ 240/);
  assert.match(source, /const CONSTRAINT_SUBSTEPS = 3/);
  assert.match(source, /const subDt = dt \/ CONSTRAINT_SUBSTEPS/);
  assert.match(source, /constraintSubsteps: CONSTRAINT_SUBSTEPS/);
});

test('G4.3B.5R.2.9.2 telemetry exposes grip error hand travel wrist error and contact energy handoff', () => {
  assert.match(source, /maximumGripErrorMeters/);
  assert.match(source, /maximumHandTravelMeters/);
  assert.match(source, /maximumTipTravelMeters/);
  assert.match(source, /maximumWristErrorRadians/);
  assert.match(source, /summarizeGripEnergyHandoff/);
  assert.match(source, /tipHandTravelRatio/);
  assert.match(source, /bladeImpulseBeforeGripResponse: true/);
  assert.match(source, /noHardGripSnapAfterContact: true/);
});
