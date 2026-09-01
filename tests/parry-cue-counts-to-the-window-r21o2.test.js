import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { COMMITTED_PARRY_CONTACT_GATE_PROFILE, evaluateCommittedParryInput } from '../src/combat/committed-parry-contact-gate.js';
import { getLongswordDirectionalAttackProfile } from '../src/combat/longsword-directional-attack-runtime.js';

const ui = await readFile(new URL('../tools/action-studio/shield-parry-r281/lab-ui.js', import.meta.url), 'utf8');

// The cue's own arithmetic, lifted out of the DOM so it can be checked against the gate that
// decides the same question. If these two ever disagree, the HUD is lying to the player.
function untilWindowMs(opportunity) {
  const earliest = opportunity.profile?.earliestInputTtcSeconds;
  const ttc = opportunity.attack?.timeToContactSeconds;
  const { movementStartSeconds, elapsedSeconds } = opportunity.attack || {};
  if (ttc == null || earliest == null || movementStartSeconds == null || elapsedSeconds == null) return null;
  // The later of the two, because the gate wants both: committed AND inside the window.
  return Math.max(
    Math.max(0, (ttc - earliest) * 1000),
    Math.max(0, (movementStartSeconds - elapsedSeconds) * 1000),
  );
}

function opportunityAt(direction, elapsedSeconds, tempoScale = 1) {
  const runtime = getLongswordDirectionalAttackProfile(direction, { tempoScale });
  return evaluateCommittedParryInput({
    manual: false,
    attackSnapshot: {
      sequence: 1,
      elapsedSeconds,
      action: { direction, runtime },
    },
  });
}

test('R21O.2 the cue counts down to the window, not to commitment', () => {
  assert.match(ui, /count down to the WINDOW/);
  // The two numbers the countdown is built from come off the opportunity, so the cue cannot drift
  // from the rule it describes.
  assert.match(ui, /opportunity\.profile\?\.earliestInputTtcSeconds/);
  assert.match(ui, /attack\.timeToContactSeconds/);
  // The bug: movementStartSeconds is commitment, and it must no longer drive a line saying WINDOW.
  // Commitment is still one of the two terms - it just may no longer be the only one.
  assert.match(ui, /const untilAcceptMs = /);
  assert.match(ui, /Math\.max\(untilWindowMs, untilCommitMs\)/);
  assert.match(ui, /WINDOW IN \$\{untilAcceptMs\.toFixed\(0\)\}ms/);
});

test('R21O.2 the countdown reaches zero exactly when the gate starts accepting', () => {
  for (const tempoScale of [1, 2]) {
    for (const direction of ['top', 'right', 'left']) {
      const { contactSeconds, movementStartSeconds } = getLongswordDirectionalAttackProfile(direction, { tempoScale });
      // TOP at 1x commits 20ms after its window opens, so the gate's first accepting frame is the
      // later of the two - which is the whole point of the countdown this test is pinning.
      const opensAt = Math.max(contactSeconds - COMMITTED_PARRY_CONTACT_GATE_PROFILE.earliestInputTtcSeconds, movementStartSeconds);
      // A frame before the window: the countdown is positive and the gate refuses.
      const before = opportunityAt(direction, opensAt - 0.02, tempoScale);
      assert.equal(before.accepted, false);
      assert.ok(untilWindowMs(before) > 0, `${direction}@${tempoScale}x should still be counting down`);
      assert.ok(Math.abs(untilWindowMs(before) - 20) < 1e-6, 'and count down in real milliseconds');
      // The frame the window opens: the countdown is zero and the gate accepts.
      const open = opportunityAt(direction, opensAt + 1e-6, tempoScale);
      assert.equal(open.accepted, true, `${direction}@${tempoScale}x should be acceptable as the countdown hits zero`);
      assert.ok(untilWindowMs(open) < 1e-3);
    }
  }
});

test('R21O.2 the old countdown is what failed the 2x playtest, and by how much', () => {
  // Commitment and the window are different moments, and the distance between them grows with the
  // tempo because the window's 180/60ms offsets are absolute while everything else scales. The
  // playtest failed along exactly this ranking: 4 / 5 / 10 presses too early.
  const gapMs = (direction, tempoScale) => {
    const p = getLongswordDirectionalAttackProfile(direction, { tempoScale });
    const opensAt = p.contactSeconds - COMMITTED_PARRY_CONTACT_GATE_PROFILE.earliestInputTtcSeconds;
    return Math.round((opensAt - p.movementStartSeconds) * 1000);
  };
  assert.equal(gapMs('top', 1), -20);
  assert.equal(gapMs('right', 1), 26);
  assert.equal(gapMs('left', 1), 110);
  assert.equal(gapMs('top', 2), 140);
  assert.equal(gapMs('right', 2), 231);
  assert.equal(gapMs('left', 2), 400);
  // LEFT is the worst at both tempos, which is why it was the direction that felt broken.
  for (const scale of [1, 2]) {
    assert.ok(gapMs('left', scale) > gapMs('right', scale));
    assert.ok(gapMs('right', scale) > gapMs('top', scale));
  }
});

test('R21O.2 committed-but-waiting is its own state', () => {
  // Folding it into "not committed" is what let one countdown stand in for two questions.
  assert.match(ui, /attack\.committed \? 'COMMITTED' : 'WAIT'/);
  const { contactSeconds, movementStartSeconds } = getLongswordDirectionalAttackProfile('left', { tempoScale: 2 });
  const opensAt = contactSeconds - COMMITTED_PARRY_CONTACT_GATE_PROFILE.earliestInputTtcSeconds;
  const waiting = opportunityAt('left', (movementStartSeconds + opensAt) / 2, 2);
  assert.equal(waiting.attack.committed, true, 'the attack is real');
  assert.equal(waiting.accepted, false, 'and it is still not time to press');
  assert.ok(untilWindowMs(waiting) > 100, 'so the player is told how much longer');
});
