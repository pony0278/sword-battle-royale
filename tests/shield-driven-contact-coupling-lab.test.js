import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../tools/action-studio/shield-driven-contact-coupling-lab.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../tools/action-studio/shield-driven-contact-coupling-lab.html', import.meta.url), 'utf8');

test('G4.3B.5R.2 Lab uses real swept Sword x Buckler contact as the authority gate', () => {
  assert.match(source, /probeSweptSwordBucklerContact\(/);
  assert.match(source, /if \(!latestContact\.contact\) return;/);
  assert.match(source, /combat\.resolveContact\(\{ contact: latestContact, guardIntentAgeMs \}\)/);
});

test('G4.3B.5R.2.7 Parry freezes weapon B3 during shield redirect while backward preload advances first', () => {
  assert.match(source, /const parryCouplingOwnsWeapon = couplingRuntime\.active;/);
  const couplingBody = source.slice(source.indexOf('function updateCoupling('), source.indexOf('function updateBlockGive('));
  assert.match(couplingBody, /latestCombatUpdate = combat\.update\(0, \{ camera \}\);/);
  assert.match(couplingBody, /balanceBreakRuntime\.update\(deltaSeconds\)/);
  assert.match(couplingBody, /couplingRuntime\.update\(deltaSeconds\)/);
  assert.ok(couplingBody.indexOf('balanceBreakRuntime.update(deltaSeconds)') < couplingBody.indexOf('couplingRuntime.update(deltaSeconds)'));
});

test('G4.3B.5R.2.4.2 Block remains outside Parry coupling and preload', () => {
  const branchStart = source.indexOf("if (outcome === 'block')");
  const branchEnd = source.indexOf('} else {', branchStart);
  const blockBranch = source.slice(branchStart, branchEnd);
  assert.match(blockBranch, /blockGiveRuntime\.start/);
  assert.doesNotMatch(blockBranch, /couplingRuntime\.start/);
  assert.doesNotMatch(blockBranch, /balanceBreakRuntime\.start/);
  assert.match(source, /blockShieldGiveRunsParallelToAttackerBounce: true/);
  assert.match(source, /blockB3ClockFrozen: false/);
});

test('G4.3B.5R.2 does not reset pre-contact tracking at authoritative contact', () => {
  const contactStart = source.indexOf('function resolveContact(');
  const couplingStart = source.indexOf('function rebuildNeutralCouplingReleaseBase(');
  const resolveBody = source.slice(contactStart, couplingStart);
  assert.doesNotMatch(resolveBody, /trackingRuntime\.reset\(\)/);
  assert.match(source.slice(couplingStart), /if \(latestCouplingReport\?\.complete\)[\s\S]*trackingRuntime\.reset\(\)/);
});

test('G4.3B.5R.2.7 preserves terminal hand constraint and neutral release base before whole-body burst', () => {
  assert.match(source, /rebuildNeutralCouplingReleaseBase/);
  assert.match(source, /reapplyAttackerConstraint/);
  assert.match(source, /couplingReleasePose = captureRigPose\(attacker\.rig\)/);
  assert.match(source, /terminalHandConstraintReappliedForNeutralB3Base: true/);
});

test('historical .2.7 source remains covered while current Lab selects at impact and starts at deflect', () => {
  assert.match(html, /Success authority<\/span><b>real swept Sword .* Shield contact<\/b>/);
  assert.match(html, /After success<\/span><b>ParryImpact selects one 25.* OLD B3 plan.*contact holds presentation at 0ms.*DEFLECT_IMPULSE.*28ms continuity bridge.*OLD B3 runs from elapsed 0<\/b>/);
  assert.match(html, /contact correction fades to zero before visible OLD B3 arm sweep.*separate shoulder\/clavicle helper off.*LEFT release deferred/);
  assert.match(source, /WHOLE-BODY BURST: ACTIVE/);
  assert.match(source, /oldTwoActorWholeBodyB3ClockRestoredAtRelease: true/);
  assert.match(source, /weaponShouldersTorsoHipsLegsShareBurstClock: true/);
});
