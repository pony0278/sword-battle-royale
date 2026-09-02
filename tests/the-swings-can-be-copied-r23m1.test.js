import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSwingLedger, formatSwingLedgerReport } from '../src/game/swing-ledger.js';
import { SHIELD_PARRY_LAB_REQUIRED_DOM_IDS } from '../tools/action-studio/shield-parry-r281/lab-dom.js';

// R23M.1 - the swings can be copied, on their own button, with the run they came from.
//
// R23L.1 put the last six swings on the HUD. A person reading six lines off a screen and typing
// them into a conversation is a measurement with a transcription step in it; the button removes
// the step, and carries the build, mode, lock, mount and health that a line means nothing without.

test('R23M.1 the HUD shows the newest few and the ring behind it keeps the run', () => {
  const ledger = createSwingLedger({ capacity: 10, shown: 3 });
  for (let i = 0; i < 12; i += 1) ledger.recordRefusal({ direction: 'right', reason: `r${i}`, separationMeters: 2 });
  assert.equal(ledger.report.count, 12);
  assert.equal(ledger.report.lines.length, 10, 'the ring keeps ten');
  assert.equal(ledger.report.hudLines.length, 3, 'the HUD shows three');
  assert.deepEqual(ledger.report.hudLines, ledger.report.lines.slice(0, 3), 'and they are the newest three');
  // Defaults: six on the HUD, forty behind it - a session, not a glance.
  const defaults = createSwingLedger();
  for (let i = 0; i < 50; i += 1) defaults.recordRefusal({ direction: 'top', reason: 'x', separationMeters: 2 });
  assert.equal(defaults.report.lines.length, 40);
  assert.equal(defaults.report.hudLines.length, 6);
});

test('R23M.1 the copied text carries the run around the swings, newest first like the HUD', () => {
  const ledger = createSwingLedger();
  ledger.recordSwing({ direction: 'right', separationMeters: 2.4 });
  ledger.note({ mount: 'kaykit-default' });
  ledger.settle({ bodyHit: { contact: true, band: 'chest' }, separationMeters: 2.2 });
  ledger.recordRefusal({ direction: 'left', reason: 'already-swinging', separationMeters: 2.2 });
  const text = formatSwingLedgerReport({ report: ledger.report, context: {
    build: 'g43b5r281-test', mode: 'parry', locked: true,
    weaponMount: { mode: 'follow', reason: 'not-asked-for', applied: 'skyrim-guard-calibrated' },
    opponent: '自動 · 2.38m', duel: { player: { health: 100 }, opponent: { health: 80 } },
  } });
  assert.deepEqual(text.split('\n'), [
    'build g43b5r281-test',
    '模式 parry · 鎖定 是 · 掛點 follow(not-asked-for) 現在 skyrim · 對手 自動 · 2.38m',
    '血量 你 100 / 對手 80',
    '出刀 2 次，最近 2 筆（新→舊）：',
    '#2 LEFT 2.20m 沒出招: already-swinging',
    '#1 RIGHT 2.40m→2.20m 命中 chest 掛點 kaykit',
  ]);
});

test('R23M.1 a copy before any swing still says which build and mode it was, and that nothing was thrown', () => {
  const text = formatSwingLedgerReport({ context: { build: 'b' } });
  assert.deepEqual(text.split('\n'), ['build b', '模式 — · 鎖定 — · 掛點 — · 對手 手動', '血量 —', '出刀 0 次（尚未出刀）']);
  // Unknowns are shown as unknown, never guessed: a lock the page did not report is not "off".
  assert.match(formatSwingLedgerReport({ context: { locked: false } }), /鎖定 否/);
  assert.match(formatSwingLedgerReport({ context: {} }), /鎖定 —/);
});

test('R23M.1 the button is a required element and the UI binds it to the same copier as the tally', () => {
  assert.ok(SHIELD_PARRY_LAB_REQUIRED_DOM_IDS.includes('copySwings'));
  assert.ok(SHIELD_PARRY_LAB_REQUIRED_DOM_IDS.includes('copyTally'));
  // The page itself is not read here: lab-dom throws at boot for any required id the page lacks,
  // and the browser probe boots the page, so a missing button cannot reach a green gate.
  // Composition of browser UI, read rather than run: one copier, two buttons.
  const ui = readFileSync(new URL('../tools/action-studio/shield-parry-r281/lab-ui.js', import.meta.url), 'utf8');
  assert.match(ui, /bindCopyButton\(copySwings, \(\) => copyableSwings/);
});
