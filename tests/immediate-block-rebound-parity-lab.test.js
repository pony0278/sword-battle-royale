import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../tools/action-studio/shield-driven-contact-coupling-lab.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../tools/action-studio/shield-driven-contact-coupling-lab.html', import.meta.url), 'utf8');

test('G4.3B.5R.2.4.2 routes Block into defender-only give instead of Parry coupling', () => {
  assert.match(source, /createImmediateBlockShieldGiveRuntime/);
  assert.match(source, /if \(outcome === 'block'\)[\s\S]*blockGiveRuntime\.start/);
  const branchStart = source.indexOf("if (outcome === 'block')");
  const branchEnd = source.indexOf('} else {', branchStart);
  const blockBranch = source.slice(branchStart, branchEnd);
  assert.doesNotMatch(blockBranch, /couplingRuntime\.start/);
  assert.doesNotMatch(blockBranch, /balanceBreakRuntime\.start/);
});

test('G4.3B.5R.2.4.2 lets B3 advance while Block shield give runs in parallel', () => {
  assert.match(source, /const parryCouplingOwnsWeapon = couplingRuntime\.active/);
  assert.match(source, /if \(!parryCouplingOwnsWeapon\)[\s\S]*combat\.update\(deltaSeconds, \{ camera \}\)/);
  assert.match(source, /updateBlockGive\(deltaSeconds\)/);
  assert.match(source, /BLOCK rebound: IMMEDIATE/);
  assert.match(source, /B3 RUNNING IN PARALLEL/);
});

test('G4.3B.5R.2.7 keeps Parry weapon coupling frozen until release power frame', () => {
  assert.match(source, /function updateCoupling\(deltaSeconds\)[\s\S]*combat\.update\(0, \{ camera \}\)/);
  assert.match(source, /backward PRELOAD/);
  assert.match(source, /balanceBreakRuntime\.update\(deltaSeconds\)/);
  assert.match(source, /WHOLE-BODY BURST: ACTIVE/);
});

test('current Step 2 Lab keeps invalid or absent Parry input on the Block fallback', () => {
  assert.match(html, /Invalid \/ no input<\/span><b>falls back to BLOCK<\/b>/);
  assert.match(html, /Physical arm chain<\/span><b>during contact: bounded upperarm\.r.*lowerarm\.r.*wrist\.r.*after DEFLECT_IMPULSE: contact correction fades to zero before visible OLD B3 arm sweep.*separate shoulder\/clavicle helper off.*all three directions release<\/b>/);
  assert.match(html, /g43b5r281-your-shield-covers-every-sector-r23z1/);
});
