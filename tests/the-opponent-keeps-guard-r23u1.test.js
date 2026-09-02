import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// R23U.1 - the opponent keeps their guard through the swing.
//
// Measured per rendered frame, inside the page. After R23S.1 the opponent left the guard to swing
// (RESET) and re-entered it when the exchange cleared (RESET, PRESS, 180ms in one frame), and the
// frame the shield came back after a LANDED swing carried a 0.66m one-frame bone jump. The player
// has never had that: their guard machine stays HOLD through their own swing, the swing owns the
// pose, and the recovery hands the body back. The opponent does the same now, and the landed
// swing's re-entry jump is gone.
//
// What this does NOT remove, because it is not the opponent's: a BLOCKED swing snaps twice for
// both fighters alike - 1.18m at the block instant (the interruption pose) and 1.10-1.17m when
// the recovery starts (createRecovery blends toward UAL1/Sword_Idle, not toward the guard the
// fighter was standing in). Measured on the player: 1.19m at 0.42s and 1.11m at 0.72s; on the
// opponent after this stage: 1.18m and 1.17m at the same moments. That is #26, for both.

const entry = readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');

test('R23U.1 the swing and its recovery own the opponent\'s body; the guard presentation waits underneath', () => {
  assert.match(entry, /function sampleOpponentGuard\(deltaMs, bodyOwnedByContact = false\) \{[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*if \(attackRuntime\.active \|\| engagement\.hasRecovery \|\| bodyOwnedByContact === true \|\| attackerFighter\.condition\.report\.staggered\) return null;/);
});

test('R23U.1 a body mid-swing guards nothing even with the machine in HOLD', () => {
  assert.match(entry, /readGuardActive: \(\) => attackerFighter\.stance\.report\.guardActive === true && !attackRuntime\.active,/);
});
