import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const LAB_PATH = new URL('../tools/action-studio/articulated-arm-impulse-chain-lab-r292r1.js', import.meta.url);
const HTML_PATH = new URL('../tools/action-studio/articulated-arm-impulse-chain-lab-r292r1.html', import.meta.url);
const source = fs.readFileSync(LAB_PATH, 'utf8');
const html = fs.readFileSync(HTML_PATH, 'utf8');

function indexOfOrFail(needle) {
  const index = source.indexOf(needle);
  assert.ok(index >= 0, `expected lab source to contain: ${needle}`);
  return index;
}

test('G4.3B.5R.2.9.2R1 lab uses whole-blade CCD before articulated contact impulse', () => {
  const ccd = indexOfOrFail('probeSweptBladeShieldPhysicalContact({');
  const articulated = indexOfOrFail('solveArticulatedArmContactImpulse({');
  assert.ok(ccd < articulated, 'earliest-TOI CCD must run before articulated impulse solve');
  assert.match(source, /buildBladePolylineFromArticulatedArm\(previousKinematics\)/);
  assert.match(source, /buildBladePolylineFromArticulatedArm\(predictedKinematics\)/);
  assert.match(source, /jointMapLerp\(previousAngles, predictedAngles, contact\.sweepAlpha\)/);
});

test('G4.3B.5R.2.9.2R1 exact CCD point and normal feed the articulated solver', () => {
  const solveStart = indexOfOrFail('solveArticulatedArmContactImpulse({');
  const solveSlice = source.slice(solveStart, solveStart + 900);
  assert.match(solveSlice, /contactPoint:\s*contact\.point/);
  assert.match(solveSlice, /contactNormal:\s*contact\.normal/);
  assert.match(solveSlice, /shieldPointVelocity/);
  assert.match(solveSlice, /jointVelocityRadPerSecond:\s*armState\.jointVelocityRadPerSecond/);
});

test('G4.3B.5R.2.9.2R1 removes failed free-Hand spring model and free-sword authority', () => {
  assert.doesNotMatch(source, /physical-grip-wrist-compliance/);
  assert.doesNotMatch(source, /solveCompliantGripPointImpulse/);
  assert.doesNotMatch(source, /solveWristAngularComplianceImpulse/);
  assert.doesNotMatch(source, /solveForearmAnchorImpulse/);
  assert.doesNotMatch(source, /solveKinematicShieldSwordImpulse/);
  assert.doesNotMatch(source, /handLinearVelocity/);
  assert.doesNotMatch(source, /handAngularVelocity/);
  assert.doesNotMatch(source, /swordLinearVelocity/);
  assert.doesNotMatch(source, /swordAngularVelocity/);
  assert.doesNotMatch(source, /sword\.position\s*=/);
});

test('G4.3B.5R.2.9.2R1 has joint-only rigid-grip authority with no IK or pose snapping', () => {
  assert.match(source, /forwardArticulatedSwordArm\(/);
  assert.match(source, /stepArticulatedArmState\(/);
  assert.match(source, /Grip separation: 0\.0 mm/);
  assert.match(source, /hand translation DOF: NONE/);
  assert.match(source, /rigidGrip:\s*true/);
  assert.match(source, /handTranslationDof:\s*false/);
  assert.doesNotMatch(source, /aimEffectorWithBone/);
  assert.doesNotMatch(source, /applyRigPose/);
  assert.doesNotMatch(source, /followRatio/);
  assert.doesNotMatch(source, /IK target/i);
});

test('G4.3B.5R.2.9.2R1 keeps 240 Hz simulation and exposes the articulated visual contract', () => {
  assert.match(source, /const FIXED_DT = 1 \/ 240/);
  assert.match(source, /fixedStepHz:\s*240/);
  assert.match(html, /Articulated Arm Impulse Chain/);
  assert.match(html, /rigid grip, 0 translation DOF/);
  assert.match(html, /wrist → elbow → shoulder/);
  assert.match(html, /no free Hand particle \/ no Grip spring/);
});
