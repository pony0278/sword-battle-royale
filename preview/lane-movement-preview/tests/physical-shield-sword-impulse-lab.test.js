import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../tools/action-studio/physical-shield-sword-impulse-lab-r29.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../tools/action-studio/physical-shield-sword-impulse-lab-r29.html', import.meta.url), 'utf8');

test('G4.3B.5R.2.9 corrected lab uses the real Cylinder face normal and contact-centered sweep', () => {
  assert.match(source, /LOCAL_SHIELD_FACE_NORMAL = new THREE\.Vector3\(0, -1, 0\)/);
  assert.match(source, /CONTACT_CENTER_SECONDS = 0\.12/);
  assert.match(source, /BASE_SWEEP_DURATION_SECONDS = 0\.21/);
  assert.match(source, /const duration = BASE_SWEEP_DURATION_SECONDS \/ Math\.max\(0\.35, speedScale\(\)\)/);
  assert.match(source, /const start = CONTACT_CENTER_SECONDS - duration \* 0\.5/);
});

test('G4.3B.5R.2.9 contact authority is relative-velocity impulse, not IK target following', () => {
  assert.match(source, /solveKinematicShieldSwordImpulse\(/);
  assert.match(source, /swordLinearVelocity\.set\(result\.nextSwordLinearVelocity/);
  assert.match(source, /swordAngularVelocity\.set\(result\.nextSwordAngularVelocity/);
  assert.match(source, /integrateDynamicSword\(dt\)/);
  assert.doesNotMatch(source, /aimEffectorWithBone/);
  assert.doesNotMatch(source, /attackerFollowRatio/);
  assert.doesNotMatch(source, /applyRigPose/);
  assert.doesNotMatch(source, /targetPose/);
});

test('G4.3B.5R.2.9 corrected lab keeps high-frequency fixed-step collision sampling', () => {
  assert.match(source, /const FIXED_DT = 1 \/ 240/);
  assert.match(source, /while \(accumulator >= FIXED_DT/);
  assert.match(source, /previousSignedDistance > threshold && surface\.signedDistance <= threshold/);
});

test('G4.3B.5R.2.9 corrected preview exposes physical-only acceptance criteria', () => {
  assert.match(html, /G4\.3B\.5R\.2\.9 Physical Shield–Sword Impulse Lab/);
  assert.match(html, /physical-shield-sword-impulse-lab-r29\.js\?v=g43b5r29-contact-geometry/);
  assert.match(html, /correct Cylinder local −Y/);
  assert.match(html, /no IK \/ no followRatio \/ no pose target/);
});
