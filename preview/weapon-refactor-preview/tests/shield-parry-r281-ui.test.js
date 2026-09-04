import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SHIELD_PARRY_LAB_REQUIRED_DOM_IDS } from '../tools/action-studio/shield-parry-r281/lab-dom.js';

const entry = await readFile(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
const ui = await readFile(new URL('../tools/action-studio/shield-parry-r281/lab-ui.js', import.meta.url), 'utf8');
const frameReporting = await readFile(new URL('../tools/action-studio/shield-parry-r281/frame-reporting.js', import.meta.url), 'utf8');
const stance = await readFile(new URL('../tools/action-studio/shield-parry-r281/stance-debug-controls.js', import.meta.url), 'utf8');

test('R18M.3 entry delegates DOM, stance debug, Parry cue, HUD, and input bindings', () => {
  assert.match(entry, /shield-parry-r281\/lab-dom\.js/);
  assert.match(entry, /shield-parry-r281\/stance-debug-controls\.js/);
  assert.match(entry, /shield-parry-r281\/lab-ui\.js/);
  assert.doesNotMatch(entry, /const hudAttack = document\.getElementById/);
  assert.doesNotMatch(entry, /let parryCueState = null/);
  assert.doesNotMatch(entry, /hudAttack\.textContent/);
  assert.doesNotMatch(entry, /function isParryKey\(/);
  assert.doesNotMatch(entry, /document\.addEventListener\('keydown'/);
  // R18V.3: the cue and HUD view models are assembled in frame-reporting.js now. The delegation
  // this test exists to protect got stronger, not weaker - the entry no longer even gathers them.
  assert.match(entry, /shield-parry-r281\/frame-reporting\.js/);
  assert.match(frameReporting, /labUi\.updateParryCue\(\{/);
  assert.match(frameReporting, /labUi\.updateHud\(\{/);
  assert.doesNotMatch(entry, /latestGripConstraintReport: exchangeState\.latestGripConstraintReport/);
  assert.match(entry, /bindShieldParryLabUiEvents\(\{/);
  assert.ok(entry.split('\n').length < 1850, 'R281 entry should become materially smaller after UI extraction');
});

test('R18M.3 UI module owns presentation/input wiring but no combat success authority', () => {
  assert.match(ui, /PARRY NOW! · PRESS F/);
  assert.match(ui, /keyboard-f-keyup-fallback/);
  assert.match(ui, /input-flash/);
  assert.match(ui, /retry-attention/);
  assert.match(ui, /review hold 最多 1\.5s/);
  assert.doesNotMatch(ui, /parryGate\.arm\(/);
  assert.doesNotMatch(ui, /parryGate\.confirm\(/);
  assert.doesNotMatch(ui, /combat\.resolveContact\(/);
  assert.doesNotMatch(ui, /swordGripConstraint\.(?:start|update)\(/);
});

test('R18M.3 stance debug module preserves existing query keys and remains guidance-only', () => {
  for (const query of ['leadMs', 'crouchCm', 'crouchSpeed', 'edgeCm', 'planeCm', 'lowGapCm', 'downRatio', 'kneeBandCm', 'armAttemptCm']) {
    assert.match(stance, new RegExp("query: '" + query + "'"));
  }
  assert.match(stance, /profile\[spec\.profileKey\] = value \* spec\.scale/);
  assert.doesNotMatch(stance, /combat\.|parryGate\.|swordGripConstraint\./);
});

test('R18M.3 DOM contract keeps all current HUD, controls, and debug elements explicit', () => {
  for (const id of ['hudAttack', 'hudInput', 'parryCue', 'hudDiagnostic', 'status', 'report', 'autoRepeat', 'slowReview', 'showSurface', 'forceOldB3', 'parryNow', 'retryAttack', 'stanceDebugPanel', 'debugApplyRetry', 'debugResetDefaults']) {
    assert.ok(SHIELD_PARRY_LAB_REQUIRED_DOM_IDS.includes(id), 'missing DOM contract id: ' + id);
  }
});
