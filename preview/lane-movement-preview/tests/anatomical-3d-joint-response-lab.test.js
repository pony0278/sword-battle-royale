import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('tools/action-studio/anatomical-3d-joint-response-lab-r292r11.html', 'utf8');
const source = fs.readFileSync('tools/action-studio/anatomical-3d-joint-response-lab-r292r11.js', 'utf8');
const runtime = fs.readFileSync('src/combat/anatomical-3d-joint-response.js', 'utf8');

function section(name, nextName) {
  const start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `missing function ${name}`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : source.length;
  return source.slice(start, end > start ? end : source.length);
}

test('R1.1 HTML exposes anatomical 3D acceptance instead of planar or spring-Hand tuning', () => {
  assert.match(html, /G4\.3B\.5R\.2\.9\.2R1\.1/);
  assert.match(html, /wrist flex\/deviation/);
  assert.match(html, /elbow flex/);
  assert.match(html, /forearm roll/);
  assert.match(html, /shoulder yaw\/pitch\/roll/);
  assert.match(html, /no spring Hand \/ free sword \/ IK/);
  assert.match(html, /anatomical-3d-joint-response-lab-r292r11\.js/);
});

test('R1.1 runtime owns seven rotational anatomical DOFs and no planar AXIS constant', () => {
  assert.match(runtime, /shoulderYaw/);
  assert.match(runtime, /shoulderPitch/);
  assert.match(runtime, /shoulderRoll/);
  assert.match(runtime, /elbowFlex/);
  assert.match(runtime, /forearmRoll/);
  assert.match(runtime, /wristFlex/);
  assert.match(runtime, /wristDeviation/);
  assert.doesNotMatch(runtime, /const AXIS\s*=/);
  assert.match(runtime, /finite-difference-fk-jacobian-at-actual-blade-fraction/);
});

test('R1.1 contact authority remains whole-blade CCD then 3D articulated impulse', () => {
  const contact = section('solveContact', 'fixedStep');
  const ccd = contact.indexOf('probeSweptBladeShieldPhysicalContact({');
  const impulse = contact.indexOf('solveAnatomical3dContactImpulse({');
  assert.ok(ccd >= 0);
  assert.ok(impulse > ccd);
  assert.match(contact, /bladeFraction: contact\.bladeFraction/);
  assert.match(contact, /contactNormal: contact\.normal/);
  assert.match(contact, /shieldPointVelocity/);
});

test('R1.1 does not import rejected spring-Hand or free-sword impulse authority', () => {
  assert.doesNotMatch(source, /physical-grip-wrist-compliance/);
  assert.doesNotMatch(source, /solveCompliantGripPointImpulse|solveForearmAnchorImpulse|solveWristAngularComplianceImpulse/);
  assert.doesNotMatch(source, /solveKinematicShieldSwordImpulse/);
  assert.doesNotMatch(source, /swordLinearVelocity|handLinearVelocity|hand\.position\.add/);
  assert.doesNotMatch(source, /aimEffectorWithBone|applyRigPose|followRatio|poseTarget|targetPose/);
});

test('R1.1 visual geometry is rebuilt from FK and Grip stays structurally attached', () => {
  const visuals = section('updateArticulatedVisuals', 'inertiaProfile');
  assert.match(visuals, /makeKinematics\(armState\.anglesRad\)/);
  assert.match(visuals, /setSegmentMesh\(upperArmMesh, k\.shoulder, k\.elbow\)/);
  assert.match(visuals, /setSegmentMesh\(forearmMesh, k\.elbow, k\.wrist\)/);
  assert.match(visuals, /setSegmentMesh\(handMesh, k\.wrist, k\.grip\)/);
  assert.match(visuals, /setSegmentMesh\(bladeMesh, k\.bladeStart, k\.bladeTip\)/);
  assert.doesNotMatch(visuals, /spring|snap|copy\(hand/);
});

test('R1.1 telemetry groups wrist elbow-forearm and shoulder response independently', () => {
  assert.match(source, /Wrist Δω/);
  assert.match(source, /Elbow \/ forearm Δω/);
  assert.match(source, /Shoulder Δω/);
  assert.match(source, /groupedDeltaMagnitudeRadPerSecond/);
  assert.match(source, /wristFlexAndDeviation: true/);
  assert.match(source, /elbowFlexAndForearmRoll: true/);
  assert.match(source, /shoulderYawPitchRoll: true/);
  assert.match(source, /const FIXED_DT = 1 \/ 240/);
});