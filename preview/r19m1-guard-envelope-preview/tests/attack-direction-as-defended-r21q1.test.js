import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  ATTACK_DIRECTION_AS_DEFENDED_STAGE,
  DEFENDED_SECTOR_FOR_ATTACK,
  MEASURED_BLADE_SCREEN_SIDE,
  NAMING_FRAMES_SHARE_A_VOCABULARY,
  attackDirectionAnsweredBy,
  defendedSectorFor,
} from '../src/combat/attack-direction-as-defended.js';
import { evaluateCommittedParryInput } from '../src/combat/committed-parry-contact-gate.js';
import { createParryAttemptTally } from '../tools/action-studio/shield-parry-r281/parry-attempt-tally.js';

const snapshot = (direction) => ({
  sequence: 1,
  elapsedSeconds: 0.31,
  action: { direction, runtime: { contactSeconds: 0.43, movementStartSeconds: 0.14 } },
});
const press = (direction, aimedSector) =>
  evaluateCommittedParryInput({ attackSnapshot: snapshot(direction), aimedSector, manual: true });

test('R21Q.1 only the lateral pair mirrors', () => {
  assert.equal(ATTACK_DIRECTION_AS_DEFENDED_STAGE, 'R21Q.1');
  assert.equal(defendedSectorFor('top'), 'top');
  assert.equal(defendedSectorFor('right'), 'left');
  assert.equal(defendedSectorFor('left'), 'right');
  assert.equal(defendedSectorFor('RIGHT'), 'left');
  assert.equal(defendedSectorFor('sideways'), null);
  assert.equal(defendedSectorFor(null), null);
  // The mirror is its own inverse, so no caller can apply it an odd number of times and be wrong
  // in a way that only shows up on one side.
  for (const direction of ['top', 'right', 'left']) {
    assert.equal(attackDirectionAnsweredBy(defendedSectorFor(direction)), direction);
  }
  // And this is why nothing caught it: both vocabularies are the same three words, so every
  // comparison type-checked and read correctly out loud.
  assert.equal(NAMING_FRAMES_SHARE_A_VOCABULARY, true);
});

test('R21Q.1 the gate grades a press against what the player can see', () => {
  // A RIGHT attack spends the whole window on the LEFT of the screen, so pointing left is the
  // read that was correct all along.
  assert.equal(press('right', 'left').gates.directionMatched, true);
  assert.equal(press('right', 'right').gates.directionMatched, false);
  assert.equal(press('left', 'right').gates.directionMatched, true);
  assert.equal(press('left', 'left').gates.directionMatched, false);
  // TOP survives the mirror, which is exactly why TOP was the only direction that ever scored.
  assert.equal(press('top', 'top').gates.directionMatched, true);
  assert.equal(press('top', 'left').gates.directionMatched, false);
  // The restatement travels on the report so the HUD and the tally cannot drift from the gate.
  assert.equal(press('right', 'left').defendedSector, 'left');
  assert.equal(press('right', 'left').attackDirection, 'right', 'the clip keeps its own name');
});

test('R21Q.1 a correct read is accepted, not filed as a miss', () => {
  const accepted = press('right', 'left');
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.reason, 'parry-input-armed-awaiting-real-contact');
  const refused = press('right', 'right');
  assert.equal(refused.accepted, false);
  assert.equal(refused.reason, 'parry-input-wrong-direction');
  // No aim at all is still its own verdict, not a mirrored one.
  assert.equal(press('right', null).reason, 'parry-input-unaimed');
});

test('R21Q.1 the measurement that found it is kept as numbers', () => {
  const m = MEASURED_BLADE_SCREEN_SIDE;
  assert.equal(m.screenRightIsWorldAxis, '+x');
  // RIGHT is on the negative half, LEFT on the positive - the mirror, in one line.
  assert.ok(m.meanTipXInsideWindow.right < 0);
  assert.ok(m.meanTipXInsideWindow.left > 0);
  assert.equal(m.crossesTheCentreLineInsideTheWindow, false);
  // What made it a mapping rather than confusion: 35 misses, every one on the lateral pair.
  const r = m.rightAttacksMisreadAsLeft;
  assert.equal(r.thisRun + r.previousRun + r.runBefore, r.total);
  assert.equal(r.total, 35);
  assert.equal(m.rightAttacksMisreadAsTop, 0);
  assert.equal(m.authority, 'naming-frame-only-no-contact-authority');
});

test('R21Q.1 the confusion matrix keys rows by the side the swing came from', () => {
  const tally = createParryAttemptTally();
  tally.recordAttack('right', 'right');
  tally.record({ attackDirection: 'right', aimedSector: 'right', reason: 'parry-input-wrong-direction', sequence: 1 });
  const text = tally.reportText;
  // Keyed by the raw name, the diagonal stopped meaning "read it correctly" - which is how the
  // 35 correct reads were filed as misses in the first place.
  assert.match(text, /列 = 這一刀從你的哪一側來/);
  assert.match(text, /^left\t/m, 'a RIGHT attack is shown as arriving from the left');
});

test('R21Q.1 the tally reports what the swing did, not only how the press was graded', async () => {
  const tally = createParryAttemptTally();
  tally.recordAttack('left', 'right');
  tally.record({ attackDirection: 'left', aimedSector: 'right', reason: 'parry-input-too-early', sequence: 7 });
  tally.recordOutcome('left', 7, null, true);
  // The exchange resolves across several frames; a repeat for the same swing is the same swing.
  tally.recordOutcome('left', 7, null, true);
  assert.equal(tally.rows.left.struck, 1);
  assert.equal(tally.rows.left.defended, 0);
  tally.recordAttack('top', 'top');
  tally.recordOutcome('top', 8, 'block', false);
  assert.equal(tally.rows.top.defended, 1);
  // Kept out of the counts table on purpose: those buckets partition the swings and must sum to
  // 揮出, while being hit is a separate axis that can coincide with any of them.
  assert.match(tally.reportText, /這一刀最後怎麼了/);
  assert.match(tally.reportText, /方向\t擋下或格檔\t被打中/);
  // A press graded "too early" that still put the shield in the way is a different experience
  // from one that left the player open, and the table now tells them apart.
  const entry = await readFile(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
  assert.match(entry, /parryTally\.recordOutcome\(selectedDirection, snapshot\?\.sequence/);
});
