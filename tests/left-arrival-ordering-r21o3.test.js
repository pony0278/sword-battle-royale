import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ATTACK_TIME_WARPS,
  LEFT_ARRIVAL_ORDERING_REFERENCES,
  warpSourceToRuntime,
} from '../src/combat/attack-time-warp.js';
import { COMMITTED_PARRY_CONTACT_GATE_PROFILE } from '../src/combat/committed-parry-contact-gate.js';
import { getLongswordDirectionalAttackProfile } from '../src/combat/longsword-directional-attack-runtime.js';

const refs = LEFT_ARRIVAL_ORDERING_REFERENCES;

test('R21O.3 the stretch ends before the blade arrives', () => {
  const left = ATTACK_TIME_WARPS.left;
  // This is the whole change in one line: the region used to swallow the arrival, so the approach
  // was slowed along with the burst and landed early in the swing's runtime.
  assert.ok(left.endSourceSeconds < refs.sourceSeconds.bladeReachesBody);
  assert.ok(refs.supersedes.endSourceSeconds > refs.sourceSeconds.bladeReachesBody);
  // The peak is only 28ms of source past the arrival, which is why freeing one frees the other.
  assert.ok(refs.sourceSeconds.peakRotation - refs.sourceSeconds.bladeReachesBody < 0.03);
  assert.ok(refs.sourceSeconds.peakRotation < refs.sourceSeconds.authoredContact);
});

test('R21O.3 contact does not move, so nothing downstream does', () => {
  for (const tempoScale of [1, 2]) {
    for (const direction of ['top', 'right', 'left']) {
      const { contactSeconds } = getLongswordDirectionalAttackProfile(direction, { tempoScale });
      assert.equal(Math.round(contactSeconds * 1000), 430 * tempoScale,
        `${direction}@${tempoScale}x must keep the measured contact time`);
    }
  }
  // And the authored pose it lands on is untouched - only when it is reached.
  assert.ok(Math.abs(warpSourceToRuntime(refs.sourceSeconds.authoredContact, ATTACK_TIME_WARPS.left) - 0.43) < 1e-9);
});

test('R21O.3 the parry window now opens in front of the arrival, not behind it', () => {
  // The rule that failed: the window sits a FIXED 180ms before contact, so scaling the swing
  // moves it later as a fraction of the swing while the arrival stays at its own fraction.
  const windowOpensShare = (tempoScale) => {
    const { contactSeconds } = getLongswordDirectionalAttackProfile('left', { tempoScale });
    return (contactSeconds - COMMITTED_PARRY_CONTACT_GATE_PROFILE.earliestInputTtcSeconds) / contactSeconds;
  };
  assert.ok(windowOpensShare(2) > windowOpensShare(1), 'the window moves later in the swing as the tempo rises');
  // Before: the window opened at 79% of the swing and the blade arrived at 77%. After: 91%.
  assert.ok(refs.arrivalShareOfSwing.before < windowOpensShare(2), 'which is exactly how LEFT became unparryable');
  assert.ok(refs.arrivalShareOfSwing.after > windowOpensShare(2), 'and why moving the arrival fixes it');
  assert.ok(Math.abs(refs.arrivalShareOfSwing.after - refs.arrivalShareOfSwing.top) < 0.03,
    'LEFT should arrive about as late in its swing as TOP does');
  // Measured in the built page, not derived: 16ms behind the window before, 104ms in front after.
  assert.ok(refs.windowVersusArrivalMs.beforeAt2x < 0);
  assert.ok(refs.windowVersusArrivalMs.afterAt2x > 100);
});

test('R21O.3 records the cost instead of hiding it', () => {
  // The burst leaves the stretched region together with the arrival, so LEFT is the fastest blade
  // again. Kept as a number so the next person weighing this trade sees what it bought and cost.
  const { before, after, top, right } = refs.peakDegreesPerSecondAt2x;
  assert.ok(after > before * 3, 'the burst is no longer slowed by the warp');
  assert.ok(after > top && top > right);
  // Before, LEFT was slower than a real cut's fast phase - the "hanging" the playtest described.
  assert.ok(before < refs.realCutFastPhaseDegreesPerSecond.min);
  // After, it is above it. Neither sits inside the band, which is why this is a trade and not a fix.
  assert.ok(after > refs.realCutFastPhaseDegreesPerSecond.max);
  assert.equal(refs.authority, 'timeline-shape-only-no-contact-authority');
});
