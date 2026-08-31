import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ATTACK_TIME_WARPS,
  RIGHT_RETIME_REFERENCES,
  getAttackTimeWarp,
  warpRuntimeToSource,
  warpSourceToRuntime,
} from '../src/combat/attack-time-warp.js';
import { LONGSWORD_DIRECTIONAL_ATTACKS } from '../src/combat/longsword-directional-metadata.js';
import { PREDICTIVE_INTERCEPT_PARRY_PROFILE } from '../src/combat/predictive-intercept-parry.js';
import { getLongswordDirectionalAttackProfile } from '../src/combat/longsword-directional-attack-runtime.js';

// R21B.1 - RIGHT could not be parried, and the fix is sized by things already measured.
//
// The play test said nobody could do it; the arithmetic says why. A parry is accepted between
// contact minus earlyWindowEnd and contact minus minimumTriggerTtc, so at RIGHT's authored 0.23s
// the window closed 210ms after the swing began - inside a human's reaction to it starting.

test('R21B.1 the stretch is the ratio between two numbers already in the game', () => {
  const right = getAttackTimeWarp('right');
  assert.ok(right, 'RIGHT is warped now');
  // Peak: brought to TOP's, which is the fastest rotation this project has accepted untouched.
  const peakAfter = RIGHT_RETIME_REFERENCES.measuredPeakDegreesPerSecond / right.stretch;
  assert.ok(Math.abs(peakAfter - RIGHT_RETIME_REFERENCES.topUntouchedPeakDegreesPerSecond) < 40,
    `stretched peak ${peakAfter.toFixed(0)} against TOP's ${RIGHT_RETIME_REFERENCES.topUntouchedPeakDegreesPerSecond}`);
  // And measured afterwards in the lab, which is the assertion that matters: predicting is easy.
  assert.ok(Math.abs(RIGHT_RETIME_REFERENCES.measuredPeakAfterDegreesPerSecond
    - RIGHT_RETIME_REFERENCES.topUntouchedPeakDegreesPerSecond) <= 1);
  assert.ok(getAttackTimeWarp('top') == null, 'TOP is the yardstick, so it stays untouched');
});

test('R21B.1 RIGHT is reactable now, and still the quickest of the three', () => {
  const contacts = Object.fromEntries(Object.entries(LONGSWORD_DIRECTIONAL_ATTACKS).map(([direction, attack]) => [
    direction, warpSourceToRuntime(attack.contactSeconds, getAttackTimeWarp(direction)),
  ]));
  assert.ok(Math.abs(contacts.right - 0.368) < 1e-9, `right contact ${contacts.right}`);
  // LEFT's 0.38s is the one contact time a person has confirmed by hand is reactable. RIGHT lands
  // just inside it: reactable, and still the fastest attack in the game.
  assert.ok(contacts.right < contacts.left, 'RIGHT keeps its identity as the quick one');
  assert.ok(contacts.left < contacts.top);
  assert.ok(contacts.right > 0.3, 'and is far enough out that the window is not shut on arrival');

  // The window itself, stated the way the profile defines it rather than restated by hand.
  const opens = contacts.right - PREDICTIVE_INTERCEPT_PARRY_PROFILE.earlyWindowEndSeconds;
  const closes = contacts.right - PREDICTIVE_INTERCEPT_PARRY_PROFILE.minimumTriggerTtcSeconds;
  assert.ok(Math.abs(opens - 0.148) < 1e-6 && Math.abs(closes - 0.348) < 1e-6,
    `window ${(opens * 1000).toFixed(0)}-${(closes * 1000).toFixed(0)}ms`);
  // Before the retime it closed at 210ms. A player whose clock starts at commitment presses at
  // 250-300ms; that now lands inside the window, and inside the perfect band.
  assert.ok(closes > 0.3, 'a 300ms reaction must still be inside');
  const perfectOpens = contacts.right - PREDICTIVE_INTERCEPT_PARRY_PROFILE.perfectWindowEndSeconds;
  const perfectCloses = contacts.right - PREDICTIVE_INTERCEPT_PARRY_PROFILE.perfectWindowStartSeconds;
  assert.ok(perfectOpens < 0.3 && perfectCloses > 0.25, `perfect band ${perfectOpens}-${perfectCloses}`);
});

test('R21B.1 the clip is not retimed, only when its poses are reached', () => {
  const right = getAttackTimeWarp('right');
  const profile = getLongswordDirectionalAttackProfile('right');
  assert.equal(profile.sourceDurationSeconds, 0.433, 'the asset is untouched');
  assert.ok(Math.abs(warpRuntimeToSource(profile.contactSeconds, right) - 0.23) < 1e-9,
    'and contact is still authored where it always was');
  // Everything past the stretched span keeps its authored pace and merely starts later.
  const spanCost = (right.endSourceSeconds - right.startSourceSeconds) * (right.stretch - 1);
  assert.ok(Math.abs(warpSourceToRuntime(0.433, right) - (0.433 + spanCost)) < 1e-9);
  assert.equal(Object.keys(ATTACK_TIME_WARPS).length, 2);
});
