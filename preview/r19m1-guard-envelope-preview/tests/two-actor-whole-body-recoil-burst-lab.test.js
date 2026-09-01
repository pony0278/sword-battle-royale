import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../tools/action-studio/shield-driven-contact-coupling-lab.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../tools/action-studio/shield-driven-contact-coupling-lab.html', import.meta.url), 'utf8');

test('historical G4.3B.5R.2.7 source stays covered after current Lab advances to TOP/RIGHT OLD B3 handoff', () => {
  assert.match(html, /Step 3A .* Live Shield .* Sword .* Arm .* OLD B3/);
  assert.match(html, /shield-driven-contact-coupling-lab-r281\.js\?v=g43b5r281-left-arrives-late-r21o3/);
  assert.match(source, /two-actor-whole-body-recoil-burst\.js\?v=g43b5r27/);
  assert.match(source, /const LAB_STAGE = TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_STAGE/);
  assert.match(source, /window\.__G43B5R27_LAB__/);
});

test('G4.3B.5R.2.7 lab keeps Block on accepted immediate rebound path', () => {
  const branchStart = source.indexOf("if (outcome === 'block')");
  const branchEnd = source.indexOf('} else {', branchStart);
  const blockBranch = source.slice(branchStart, branchEnd);
  assert.match(blockBranch, /blockGiveRuntime\.start/);
  assert.doesNotMatch(blockBranch, /balanceBreakRuntime\.start/);
  assert.doesNotMatch(blockBranch, /couplingRuntime\.start/);
  assert.match(source, /blockUsesOriginalB2B3WithoutPostCouplingScaling: true/);
});

test('G4.3B.5R.2.7 lab exposes release power frame instead of separation phase', () => {
  assert.match(source, /WHOLE-BODY BURST: ACTIVE/);
  assert.match(source, /separation BYPASSED/);
  assert.match(source, /B3 power frame entry/);
  assert.match(source, /parryExplicitSeparationBypassed: true/);
  assert.match(source, /oldTwoActorWholeBodyB3ClockRestoredAtRelease: true/);
});

test('historical .2.7 remains covered while R18I starts visible OLD B3 from the deflect event', () => {
  assert.match(source, /backward PRELOAD/);
  assert.match(source, /weaponShouldersTorsoHipsLegsShareBurstClock: true/);
  assert.match(source, /freeArmUsesParentHierarchyRatherThanExplicitFlail: true/);
  assert.match(html, /ParryImpact selects one exaggerated OLD B3 plan whose torso and legs run from impact.*DEFLECT_IMPULSE.*28ms continuity bridge.*the weapon arm joins the running OLD B3/);
  assert.match(html, /Physical arm chain<\/span><b>during contact: bounded upperarm\.r.*lowerarm\.r.*wrist\.r.*after DEFLECT_IMPULSE: contact correction fades to zero before visible OLD B3 arm sweep.*separate shoulder\/clavicle helper off.*all three directions release<\/b>/);
});
