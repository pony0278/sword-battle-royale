import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const entry = await readFile(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
const sceneSource = await readFile(new URL('../src/game/scene.js', import.meta.url), 'utf8');
const overlaySource = await readFile(new URL('../tools/action-studio/shield-parry-r281/inspection-overlay.js', import.meta.url), 'utf8');

const forbiddenAuthority = [
  'parryGate.arm',
  'parryGate.confirm',
  'combat.resolveContact',
  'DEFLECT_IMPULSE',
  'buildLiveParryOldB3Handoff',
  'releaseLiveContactToOldB3',
];

test('R18M.C1 entry delegates scene bootstrap and inspection overlay composition', () => {
  assert.match(entry, /createCombatScene/);
  assert.match(entry, /createShieldParryInspectionOverlay/);
  assert.match(entry, /const labScene = createCombatScene/);
  assert.match(entry, /const inspectionOverlay = createShieldParryInspectionOverlay/);
  assert.match(entry, /updateLiveContactMarkers: \(report\) => inspectionOverlay\.update\(report\)/);
});

test('R18M.C1 scene module owns renderer camera characters equipment resize and review views only', () => {
  assert.match(sceneSource, /new THREE\.WebGLRenderer/);
  assert.match(sceneSource, /new THREE\.PerspectiveCamera\(38, 1, 0\.05, 100\)/);
  assert.match(sceneSource, /createDefaultCharacter\(THREE\)/);
  assert.match(sceneSource, /mountDebugSword\(attacker, attackerSword, DEFAULT_KAYKIT_SWORD_MOUNT\)/);
  assert.match(sceneSource, /mountOffhandBuckler\(defender, buckler, ACCEPTED_OFFHAND_BUCKLER_MOUNT_G423\)/);
  assert.match(sceneSource, /function resize\(\)/);
  assert.match(sceneSource, /function setView\(view\)/);
  assert.match(sceneSource, /x: 5\.8, y: 1\.7, z: 0\.1/);
  assert.match(sceneSource, /x: 2\.25, y: 1\.5, z: 2\.2/);
  for (const token of forbiddenAuthority) assert.equal(sceneSource.includes(token), false, `scene must not own ${token}`);
});

test('R18M.C1 inspection overlay remains visual-only and preserves marker geometry semantics', () => {
  assert.match(overlaySource, /new THREE\.SphereGeometry\(0\.027, 12, 8\)/);
  assert.match(overlaySource, /new THREE\.SphereGeometry\(0\.022, 12, 8\)/);
  assert.match(overlaySource, /0x54e7f5/);
  assert.match(overlaySource, /0xffdf59/);
  assert.match(overlaySource, /report\.attackLineClearance\?\.pass \? 0x61f59a : 0xffad55/);
  assert.match(overlaySource, /positions\.setXYZ\(0, origin\.x, origin\.y, origin\.z\)/);
  assert.match(overlaySource, /positions\.setXYZ\(1, target\.x, target\.y, target\.z\)/);
  for (const token of forbiddenAuthority) assert.equal(overlaySource.includes(token), false, `overlay must not own ${token}`);
});

test('R18M.C1 keeps authoritative frame/manual/start-reset paths in the entry', () => {
  assert.match(entry, /function frame\(timestamp\)/);
  assert.match(entry, /function triggerParryNow\(source = 'button'\)/);
  assert.match(entry, /function startAttack\(direction = selectedDirection\)/);
  assert.match(entry, /function restartAttack\(direction = selectedDirection\)/);
  assert.match(entry, /function resetExchange\(\)/);
  assert.match(entry, /contactHandoffController\.updateCombatBeforeGuard/);
  assert.match(entry, /guardRuntime\.update\(deltaMs, camera\)/);
  assert.match(entry, /contactHandoffController\.updateDefenderDeflectReleaseGate\(\)/);
  assert.match(entry, /contactHandoffController\.updateLiveConstraintAfterGuard/);
});
