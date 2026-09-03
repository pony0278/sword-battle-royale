import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSwingLedger } from '../src/game/swing-ledger.js';

// R23W.1 - the fight keeps a log.
//
// A person parried the opponent and asked whether anything had happened to them; the page could
// not say. The ledger R23L.1 built was the player's swings only. Now both fighters' swings are on
// it, each with what became of it in the swinger's terms - the player's swing "被擋", the
// opponent's "你擋下" - and a stagger rides along, because that was the invisible part.

test('R23W.1 the opponent\'s swing reads from the player\'s side: blocked, parried and staggered, landed, missed', () => {
  const ledger = createSwingLedger();
  ledger.recordSwing({ who: 'opponent', direction: 'top', separationMeters: 2.4 });
  ledger.settle({ outcome: 'block', separationMeters: 1.55 });
  ledger.recordSwing({ who: 'opponent', direction: 'right', separationMeters: 2.4 });
  ledger.settle({ outcome: 'parry', separationMeters: 1.75, receiverStaggered: true });
  ledger.recordSwing({ who: 'opponent', direction: 'left', separationMeters: 2.4 });
  ledger.settle({ bodyHit: { contact: true, band: 'belly' }, separationMeters: 1.9 });
  ledger.recordSwing({ who: 'opponent', direction: 'top', separationMeters: 2.8 });
  ledger.settle({ bodyHit: { contact: false, closestApproach: { planeGapMeters: 0.46, radialGapMeters: 0.01 } }, separationMeters: 1.9 });
  ledger.recordSwing({ who: 'opponent', direction: 'top', separationMeters: 2.4 });
  ledger.settle({ outcome: 'perfect-parry', separationMeters: 1.75, receiverStaggered: true });
  assert.deepEqual(ledger.report.lines, [
    '#5 對手 TOP 2.40m→1.75m 你完美 parry（對手暈眩）',
    '#4 對手 TOP 2.80m→1.90m 落空 短0.46 偏0.01',
    '#3 對手 LEFT 2.40m→1.90m 打中你 belly',
    '#2 對手 RIGHT 2.40m→1.75m 你 parry（對手暈眩）',
    '#1 對手 TOP 2.40m→1.55m 你擋下',
  ]);
  assert.equal(ledger.report.entries[3].who, 'opponent');
});

test('R23W.1 the player\'s swing reads the other way, and a shield verdict outranks a near-miss reading', () => {
  const ledger = createSwingLedger();
  ledger.recordSwing({ direction: 'right', separationMeters: 2.4 });
  ledger.note({ mount: 'kaykit-default' });
  // latestBodyHit holds the nearest body reading even when the shield took the blow (R19J.2); the
  // line must say what the shield did, not that the blade passed 3cm from a knee.
  ledger.settle({ outcome: 'block', bodyHit: { contact: false, closestApproach: { planeGapMeters: 0, radialGapMeters: 0.03 } }, separationMeters: 2.2 });
  assert.equal(ledger.report.lines[0], '#1 你 RIGHT 2.40m→2.20m 被擋 掛點 kaykit');
  ledger.recordSwing({ direction: 'top', separationMeters: 2.4 });
  ledger.settle({ outcome: 'parry', separationMeters: 2.2, receiverStaggered: true });
  assert.equal(ledger.report.lines[0], '#2 你 TOP 2.40m→2.20m 被 parry（你暈眩）');
  ledger.recordRefusal({ who: 'opponent', direction: 'top', reason: 'still-being-struck', separationMeters: 2 });
  assert.equal(ledger.report.lines[0], '#3 對手 TOP 2.00m 沒出招: still-being-struck');
  assert.equal(ledger.report.entries.find((e) => e.n === 1).who, 'player', 'absent means the player, as every R23L.1 caller assumed');
});

test('R23X.1 a swing never settled is closed as superseded, not as a whiff at 0.00m', () => {
  const ledger = createSwingLedger();
  ledger.recordSwing({ direction: 'top', separationMeters: 2.4 });
  ledger.recordSwing({ who: 'opponent', direction: 'right', separationMeters: 2.3 });
  assert.equal(ledger.report.lines[0], '#1 你 TOP 2.40m 沒結算: 下一刀先開始了');
  assert.equal(ledger.report.entries[0].superseded, true);
});

test('R23W.1 the lab records the opponent\'s swing when it starts and settles it on its falling edge, stagger and all', () => {
  const entry = readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
  assert.match(entry, /laneController\.startAttack\(direction, attackRuntime\.snapshot\?\.action\?\.runtime\?\.contactSeconds\);\n\s*swingLedger\.recordSwing\(\{ who: 'opponent', direction, separationMeters: laneController\.separationMeters \}\);/);
  assert.match(entry, /if \(opponentWasSwinging && !snapshot\?\.action\) swingLedger\.settle\(\{ bodyHit: exchangeState\.latestBodyHit, outcome: exchangeState\.latestCombatResult\?\.resolution\?\.outcome, separationMeters: laneController\.settledSeparationMeters, receiverStaggered: attackerFighter\.condition\.report\.staggered \}\);/);
});
