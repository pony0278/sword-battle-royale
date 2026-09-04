import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSwingLedger, SWING_LEDGER_STAGE } from '../src/game/swing-ledger.js';

// R23L.1 - every swing the player throws leaves a line.
//
// R23K.1 landed RIGHT in six probe-driven scenarios while the person playing the same build saw
// RIGHT do nothing. A probe can only reproduce what it thinks to drive; the page the player is
// looking at can record what actually happened. This file proves the record says what happened,
// in the words a person reads between exchanges, and that the lab writes it at the right moments.


test('R23L.1 a refused swing is a line that says why, with the stance it was refused at', () => {
  const ledger = createSwingLedger();
  ledger.recordRefusal({ direction: 'right', reason: 'opponent-mid-exchange', separationMeters: 2.384 });
  assert.equal(ledger.report.count, 1);
  assert.deepEqual(ledger.report.lines, ['#1 你 RIGHT 2.38m 沒出招: opponent-mid-exchange']);
  assert.equal(ledger.report.entries[0].started, false);
});

test('R23L.1 a landed swing says where it landed; a whiff says by how much, short and beside', () => {
  const ledger = createSwingLedger();
  ledger.recordSwing({ direction: 'right', separationMeters: 2.4, mount: 'skyrim-guard-calibrated', mode: 'parry', locked: true });
  assert.equal(ledger.open.n, 1, 'a swing is open until it settles');
  assert.equal(ledger.report.lines.length, 0, 'and an open swing is not yet a line');
  // The mount on the line is the one the blade wore in the air, not the guard's on either side of
  // it: at the press the dial has not written yet, and at the falling edge it has written back.
  ledger.note({ mount: 'kaykit-default' });
  ledger.settle({ bodyHit: { contact: true, band: 'chest' }, separationMeters: 2.21 });
  assert.equal(ledger.open, null);
  assert.deepEqual(ledger.report.lines, ['#1 你 RIGHT 2.40m→2.21m 命中 chest 掛點 kaykit']);
  assert.equal(ledger.note({ mount: 'x' }), false, 'nothing to note on when no swing is open');

  ledger.recordSwing({ direction: 'left', separationMeters: 2.5 });
  ledger.note({ mount: 'skyrim-guard-calibrated' });
  ledger.settle({ bodyHit: { contact: false, closestApproach: { planeGapMeters: 0.07, radialGapMeters: 0.004 } }, separationMeters: 2.31 });
  assert.equal(ledger.report.lines[0], '#2 你 LEFT 2.50m→2.31m 落空 短0.07 偏0.00 掛點 skyrim');

  // A swing the sampler never probed is a different fact from a swing that missed, and the line
  // must not dress one up as the other. The outcome rides along when there is one.
  ledger.recordSwing({ direction: 'top', separationMeters: 1.9 });
  ledger.settle({ bodyHit: null, outcome: 'block', separationMeters: 1.9 });
  assert.equal(ledger.report.lines[0], '#3 你 TOP 1.90m→1.90m 被擋');
  assert.equal(ledger.report.entries[0].probed, false);
});

test('R23L.1 the ledger is a ring: newest first, the oldest falls off, the numbering does not restart', () => {
  const ledger = createSwingLedger({ capacity: 3 });
  for (let i = 0; i < 5; i += 1) ledger.recordRefusal({ direction: 'top', reason: `r${i}`, separationMeters: 2 });
  assert.equal(ledger.report.count, 5);
  assert.deepEqual(ledger.report.entries.map((e) => e.n), [5, 4, 3]);
  // A swing that never settled - the page reset under it - is closed by the next one rather than
  // lost, so the numbering on the page still counts every button press.
  ledger.recordSwing({ direction: 'left', separationMeters: 2 });
  ledger.recordSwing({ direction: 'right', separationMeters: 2 });
  assert.equal(ledger.report.entries[0].n, 6);
  assert.equal(ledger.report.entries[0].direction, 'left');
  assert.equal(ledger.open.n, 7);
  // Numbered order, not settled order: a refusal that lands while #7 is in the air is #8 and reads
  // above #7 once #7 settles, even though #7 settled later.
  ledger.recordRefusal({ direction: 'top', reason: 'already-swinging', separationMeters: 2 });
  ledger.settle({ bodyHit: { contact: true, band: 'waist' }, separationMeters: 2 });
  assert.deepEqual(ledger.report.entries.map((e) => e.n), [8, 7, 6]);
  ledger.reset();
  assert.equal(ledger.report.count, 0);
  assert.equal(ledger.open, null);
  assert.equal(ledger.stage, SWING_LEDGER_STAGE);
});

test('R23L.1 the lab settles a swing on its falling edge and the HUD shows the lines', () => {
  // Composition claims about browser code, so they are read rather than run. The falling edge is
  // the one frame on which the swing's body hit is final and the lane has not yet been rebased.
  const entry = readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
  assert.match(entry, /playerWasSwinging = false; swingLedger\.settle\(\{ bodyHit: playerEngagement\.exchangeState\.latestBodyHit/);
  const ui = readFileSync(new URL('../tools/action-studio/shield-parry-r281/lab-ui.js', import.meta.url), 'utf8');
  assert.match(ui, /model\.swingLedger\.hudLines\.join\('\\n'\)/);
});
