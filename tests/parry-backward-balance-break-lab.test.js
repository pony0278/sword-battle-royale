import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab.html', import.meta.url), 'utf8');

test('G4.3B.5R.2.6 backward preload still starts only on Parry / Perfect', () => {
  assert.match(source, /balanceBreakRuntime\.start\(\{ outcome, plan: latestCombatResult\.recoilPlan \}\)/);
  const blockStart = source.indexOf("if (outcome === 'block')");
  const elseStart = source.indexOf('} else {', blockStart);
  const blockBody = source.slice(blockStart, elseStart);
  assert.doesNotMatch(blockBody, /balanceBreakRuntime\.start/);
});

test('G4.3B.5R.2.6 preload still applies body first and shield attacker constraint last during coupling', () => {
  const couplingBody = source.slice(source.indexOf('function updateCoupling('), source.indexOf('function updateBlockGive('));
  const baseIndex = couplingBody.indexOf('combat.update(0, { camera })');
  const bodyIndex = couplingBody.indexOf('balanceBreakRuntime.update(deltaSeconds)');
  const couplingIndex = couplingBody.indexOf('couplingRuntime.update(deltaSeconds)');
  assert.ok(baseIndex >= 0 && bodyIndex > baseIndex && couplingIndex > bodyIndex);
});

test('G4.3B.5R.2.6 neutral torso release base remains the .2.7 whole-body burst base', () => {
  assert.match(source, /function rebuildNeutralCouplingReleaseBase\(\)/);
  assert.match(source, /couplingRuntime\.reapplyAttackerConstraint\(latestCouplingReport\)/);
  assert.match(source, /couplingReleasePose = captureRigPose\(attacker\.rig\)/);
  assert.match(source, /terminalHandConstraintReappliedForNeutralB3Base: true/);
});

test('historical .2.6 preload source remains while current Lab isolates hand propagation', () => {
  assert.match(html, /Step 3A · Live Shield → Sword → Arm → OLD B3/);
  assert.match(html, /Physical arm chain<\/span><b>during contact: bounded upperarm\.r.*lowerarm\.r.*wrist\.r.*after DEFLECT_IMPULSE: contact correction fades to zero before visible OLD B3 arm sweep.*separate shoulder\/clavicle helper off.*all three directions release<\/b>/);
  assert.match(html, /g43b5r281-the-arms-were-being-dropped-r21x1/);
  assert.match(source, /parry-backward-balance-break\.js\?v=g43b5r27/);
  assert.match(source, /window\.__G43B5R27_LAB__/);
});
