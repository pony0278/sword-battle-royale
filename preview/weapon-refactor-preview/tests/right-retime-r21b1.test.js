import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ATTACK_TIME_WARPS,
  RIGHT_RETIME_REFERENCES,
  getAttackTimeWarp,
  warpRuntimeToSource,
  warpSourceToRuntime,
} from '../src/combat/attack-time-warp.js';
import { LONGSWORD_DIRECTIONAL_ATTACKS } from '../src/combat/longsword-directional-metadata.js';
import { PREDICTIVE_INTERCEPT_PARRY_PROFILE } from '../src/combat/predictive-intercept-parry.js';
import { COMMITTED_PARRY_CONTACT_GATE_PROFILE } from '../src/combat/committed-parry-contact-gate.js';
import {
  PRESENTATION_END_SOURCE_SECONDS,
  getLongswordDirectionalAttackProfile,
} from '../src/combat/longsword-directional-attack-runtime.js';

// R21B.1 - RIGHT could not be parried, and the fix is sized by things already measured.
//
// The play test said nobody could do it; the arithmetic says why. A parry is accepted between
// contact minus earlyWindowEnd and contact minus minimumTriggerTtc, so at RIGHT's authored 0.23s
// the window closed 210ms after the swing began - inside a human's reaction to it starting.

test('R21B.1 the first stretch was the ratio between two numbers already in the game', () => {
  // Kept as history rather than as a live claim. R21B.1 set the stretch to 1.6 because it brought
  // RIGHT's peak to TOP's untouched 1667 - a derivation that held: measured afterwards at 1667 to
  // the digit. R21I.1 then moved the stretch for a reason that derivation could not see, and the
  // record of how 1.6 was reached is worth more than the number it produced.
  const first = RIGHT_RETIME_REFERENCES.secondPass.stretchBefore;
  assert.equal(first, 1.6);
  const peakAtFirstStretch = RIGHT_RETIME_REFERENCES.measuredPeakDegreesPerSecond / first;
  assert.ok(Math.abs(peakAtFirstStretch - RIGHT_RETIME_REFERENCES.topUntouchedPeakDegreesPerSecond) < 40,
    `stretched peak ${peakAtFirstStretch.toFixed(0)} against TOP's`);
  assert.ok(Math.abs(RIGHT_RETIME_REFERENCES.measuredPeakAfterDegreesPerSecond
    - RIGHT_RETIME_REFERENCES.topUntouchedPeakDegreesPerSecond) <= 1, 'and the lab agreed');
  assert.ok(getAttackTimeWarp('top') == null, 'TOP is the yardstick, so it stays untouched');
});

test('R21I.1 the second stretch was set by a player\'s hands, not by a derivation', () => {
  const pass = RIGHT_RETIME_REFERENCES.secondPass;
  assert.equal(getAttackTimeWarp('right').stretch, pass.stretchAfter);
  assert.ok(pass.stretchAfter > pass.stretchBefore, 'RIGHT was still too fast to answer');

  // What the tally measured: the player's press time barely varies by direction - it is the
  // window's placement that does. RIGHT's closed 42ms before their median press.
  const press = pass.playerMedianPressMsAfterSwingStart;
  const closes = pass.windowClosesMsBefore;
  assert.ok(press.top <= closes.top, 'TOP: the same reaction landed inside');
  assert.ok(press.left <= closes.left, 'LEFT: likewise');
  assert.ok(press.right > closes.right, 'RIGHT: the same reaction did not');
  assert.equal(press.right - closes.right, pass.rightMedianMsPastClose);
  // And it was never a reading problem: zero wrong-direction presses against RIGHT in the sample.
  assert.equal(pass.rightWrongDirectionInSample, 0);

  // A press that late needs contact at 410ms merely to be inside a [contact-180, contact-60]
  // window. 430ms was taken instead - TOP's contact time, already in the game, and the direction
  // that same player lands presses inside.
  const window = COMMITTED_PARRY_CONTACT_GATE_PROFILE;
  const minimum = (press.right + window.latestInputTtcSeconds * 1000) / 1000;
  assert.ok(Math.abs(minimum - pass.minimumContactSecondsForA350msPress) < 1e-9, `${minimum}`);
  assert.ok(pass.runtimeContactSecondsAfter > pass.minimumContactSecondsForA350msPress, 'with margin');
});

test('R21I.1 the cost of the second stretch is stated, not hidden', () => {
  const pass = RIGHT_RETIME_REFERENCES.secondPass;
  // The peak stops being TOP's, which was the whole basis of the first stretch. It lands between
  // two swings already accepted rather than anywhere new.
  const peak = RIGHT_RETIME_REFERENCES.measuredPeakDegreesPerSecond / pass.stretchAfter;
  assert.ok(Math.abs(peak - pass.predictedPeakDegreesPerSecond) < 1, `${peak.toFixed(0)}`);
  assert.ok(peak < pass.peakBandAlreadyAccepted.top, 'slower than TOP now');
  assert.ok(peak > pass.peakBandAlreadyAccepted.left, 'still faster than LEFT');
  assert.notEqual(Math.round(peak), RIGHT_RETIME_REFERENCES.topUntouchedPeakDegreesPerSecond);
});

test('R21I.1 RIGHT is answerable now, and is no longer the quickest of the three', () => {
  const contacts = Object.fromEntries(Object.entries(LONGSWORD_DIRECTIONAL_ATTACKS).map(([direction, attack]) => [
    direction, warpSourceToRuntime(attack.contactSeconds, getAttackTimeWarp(direction)),
  ]));
  assert.ok(Math.abs(contacts.right - 0.4301) < 1e-4, `right contact ${contacts.right}`);
  // R21I.1 gave this up deliberately. RIGHT was kept the fastest contact in the game by R21B.1,
  // and a player then answered it 1 time in 10 with zero direction errors - read perfectly, reached
  // too late. Being the quick one is not worth being the one nobody can answer, so RIGHT now ties
  // TOP and LEFT's 0.38s becomes the fastest contact.
  // 1.87 is a rounded stretch, so it overshoots TOP's 0.43 by a tenth of a millisecond. A 60fps
  // frame is 16.7ms; carrying more precision than that into the constant would be false exactness.
  assert.ok(Math.abs(contacts.right - contacts.top) < 1e-3, 'RIGHT now matches TOP');
  assert.ok(contacts.left < contacts.right, 'LEFT is the quick one now');
  assert.ok(contacts.right > 0.3, 'and is far enough out that the window is not shut on arrival');

  // The window itself, stated the way the profile defines it rather than restated by hand.
  const opens = contacts.right - PREDICTIVE_INTERCEPT_PARRY_PROFILE.earlyWindowEndSeconds;
  const closes = contacts.right - PREDICTIVE_INTERCEPT_PARRY_PROFILE.minimumTriggerTtcSeconds;
  assert.ok(Math.abs(opens - (contacts.right - PREDICTIVE_INTERCEPT_PARRY_PROFILE.earlyWindowEndSeconds)) < 1e-9);
  assert.ok(Math.abs(closes - 0.4101) < 1e-4,
    `window ${(opens * 1000).toFixed(0)}-${(closes * 1000).toFixed(0)}ms`);
  // Before the retime it closed at 210ms. A player whose clock starts at commitment presses at
  // 250-300ms; that now lands inside the window, and inside the perfect band.
  assert.ok(closes > 0.3, 'a 300ms reaction must still be inside');
  // R21I.1: the perfect band rides on contact, so matching TOP's contact matches TOP's band too.
  // Stated against TOP rather than against the 0.25-0.30s literals R21B.1 used, which described
  // where RIGHT's band sat at 0.368s contact and nothing more general than that.
  const perfectBand = (contact) => [
    contact - PREDICTIVE_INTERCEPT_PARRY_PROFILE.perfectWindowEndSeconds,
    contact - PREDICTIVE_INTERCEPT_PARRY_PROFILE.perfectWindowStartSeconds,
  ];
  const [perfectOpens, perfectCloses] = perfectBand(contacts.right);
  const [topPerfectOpens, topPerfectCloses] = perfectBand(contacts.top);
  assert.ok(Math.abs(perfectOpens - topPerfectOpens) < 1e-3, `perfect band ${perfectOpens}-${perfectCloses}`);
  assert.ok(Math.abs(perfectCloses - topPerfectCloses) < 1e-3);
  assert.ok(perfectOpens > opens && perfectOpens < closes, 'the perfect band opens inside the input window');
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

test('R21I.1 the re-measurement is compared on its own scale, not against a different instrument', () => {
  const pass = RIGHT_RETIME_REFERENCES.secondPass;
  const same = pass.sameSamplerPeakDegreesPerSecond;
  // The claim the stretch was chosen to keep: RIGHT sits between the two swings already accepted.
  // Checked on the sampler that produced all three in one run, because that sampler reads TOP at
  // 2199 against the 1667 recorded by R21B.1's - so the two scales must not be mixed.
  assert.ok(same.right > same.left, 'RIGHT is still faster than LEFT');
  assert.ok(same.right < same.top, 'and slower than TOP');
  assert.ok(same.top > RIGHT_RETIME_REFERENCES.topUntouchedPeakDegreesPerSecond,
    'the caveat is real: this sampler reads higher than the earlier record');
  // The prediction was worth making: 2686/1.87 against what the lab then read.
  const predicted = RIGHT_RETIME_REFERENCES.measuredPeakDegreesPerSecond / pass.stretchAfter;
  assert.ok(Math.abs(predicted - pass.predictedPeakDegreesPerSecond) < 1);
  assert.ok(Math.abs(same.right - pass.predictedPeakDegreesPerSecond) / pass.predictedPeakDegreesPerSecond < 0.05,
    `predicted ${pass.predictedPeakDegreesPerSecond} against measured ${same.right}`);
});

test('R21J.1 the presentation stops sampling RIGHT where its clip stops moving', () => {
  const trim = PRESENTATION_END_SOURCE_SECONDS.right;
  const profile = getLongswordDirectionalAttackProfile('right');
  assert.equal(trim, 0.31);
  // The clip's own length is untouched: this says when we stop looking at it, not how long it is.
  assert.equal(profile.sourceDurationSeconds, 0.433);
  assert.ok(profile.durationSeconds < warpSourceToRuntime(0.433, getAttackTimeWarp('right')));
  // And it can never eat anything the exchange is calibrated against.
  assert.ok(trim > LONGSWORD_DIRECTIONAL_ATTACKS.right.contactSeconds, 'past contact');
  assert.ok(profile.durationSeconds > profile.activeEndSeconds, 'past the active window');
  assert.ok(Math.abs(profile.contactSeconds - 0.4301) < 1e-4, 'contact is where R21I.1 put it');
});

test('R21J.1 only RIGHT is trimmed, and a trim that would reach contact is refused', () => {
  assert.deepEqual(Object.keys(PRESENTATION_END_SOURCE_SECONDS), ['right']);
  for (const direction of ['top', 'left']) {
    const profile = getLongswordDirectionalAttackProfile(direction);
    const natural = warpSourceToRuntime(profile.sourceDurationSeconds, getAttackTimeWarp(direction));
    assert.ok(Math.abs(profile.durationSeconds - natural) < 1e-9, `${direction} plays its whole clip`);
  }
});

test('R21J.1 a swing that nobody answered still gets a recovery', () => {
  // Measured before the fix: with the guard down, RIGHT's blade tip jumped 2.105m between two
  // frames and then moved 0.011m in the next - the attacker teleporting to idle in one frame. With
  // the guard held, the same swing eased. The difference was that beginAttackRecovery was only
  // reached through the combat path, so a swing that missed, or landed on a body without resolving
  // an exchange, got no recovery at all. The snap therefore appeared exactly when a player FAILED
  // to answer - which is why it read as RIGHT's problem while RIGHT was the one being missed.
  const entry = readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
  // R23F.1 moved the recovery state into the engagement; the ORDERING claim is the substance and
  // is unchanged, so it is re-spelled rather than dropped.
  assert.match(entry, /if \(snapshot\.completed && !engagement\.hasRecovery\) beginAttackRecovery\(/);
  // It has to run before the base pose is sampled, or the frame it is created on renders unblended.
  const begins = entry.indexOf('if (snapshot.completed && !engagement.hasRecovery) beginAttackRecovery(');
  const samples = entry.indexOf('if (!contactFrame.handledCombat) sampleAttackerBase(');
  assert.ok(begins > 0 && samples > begins);
  // Every other lab in the repo already did this; this entry was the outlier.
  const others = ['two-actor-combat-lab', 'swept-sword-buckler-contact-lab', 'predictive-intercept-parry-lab'];
  for (const name of others) {
    const source = readFileSync(new URL(`../tools/action-studio/${name}.js`, import.meta.url), 'utf8');
    assert.match(source, /snapshot\.completed && !attackerRecovery/, name);
  }
});
