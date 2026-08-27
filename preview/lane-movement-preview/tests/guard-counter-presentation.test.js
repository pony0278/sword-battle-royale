import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GUARD_COUNTER_PROFILE_IDS,
  GUARD_WEAPON_MOUNT_PROFILE_IDS,
  LONGSWORD_COUNTER_TIMING_ANCHORS,
  LONGSWORD_GUARD_COUNTER_PROFILE,
  sampleGuardCounterProfile,
} from '../src/combat/guard-counter-presentation.js';

function near(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

test('G3.4.2 authors full-source Melee_Block_Attack timing without clipping the motion arc', () => {
  const profile = LONGSWORD_GUARD_COUNTER_PROFILE;
  assert.equal(profile.id, GUARD_COUNTER_PROFILE_IDS.LONGSWORD);
  assert.equal(profile.state, 'guard_counter');
  assert.equal(profile.sourceFamily, 'kaykit-melee');
  assert.equal(profile.clipId, 'Melee_Block_Attack');
  assert.equal(profile.weaponMountProfileId, GUARD_WEAPON_MOUNT_PROFILE_IDS.KAYKIT_DEFAULT);
  assert.equal(profile.correctionWeight, 0);
  assert.equal(profile.inPlace, true);
  assert.equal(profile.loop, false);
  assert.equal(profile.authored, true);
  assert.equal(profile.authoredStage, 'G3.4');
  assert.equal(profile.timingStage, 'G3.4.2');
  assert.equal(profile.completionEvent, 'counter_complete');
  assert.deepEqual(profile.sourceWindow, { startProgress: 0, endProgress: 1 });
  assert.equal(LONGSWORD_COUNTER_TIMING_ANCHORS[0].source, 0);
  assert.equal(LONGSWORD_COUNTER_TIMING_ANCHORS.at(-1).source, 1);
});

test('G3.4.2 advances the strong contact silhouette earlier while preserving the authored settle', () => {
  const duration = 1.0666667222976685;
  const at18 = sampleGuardCounterProfile(duration * 0.18 * 1000, duration);
  const at30 = sampleGuardCounterProfile(duration * 0.30 * 1000, duration);
  const at38 = sampleGuardCounterProfile(duration * 0.38 * 1000, duration);
  const at76 = sampleGuardCounterProfile(duration * 0.76 * 1000, duration);

  near(at18.sourceProgress, 0.25, 1e-7);
  near(at30.sourceProgress, 0.40, 1e-7);
  near(at38.sourceProgress, 0.46, 1e-7);
  near(at76.sourceProgress, 0.85, 1e-7);

  assert.equal(at30.phase, 'strike');
  assert.equal(at38.phase, 'contact-accent');
  assert.ok(at30.sourceProgress > at30.presentationProgress, 'contact silhouette should arrive earlier than linear playback');
  assert.ok((1 - at76.sourceProgress) < (1 - at76.presentationProgress), 'the remaining source settle should receive proportionally more presentation time');
});

test('G3.4.2 samples the complete registered Counter clip and completes deterministically', () => {
  assert.equal(sampleGuardCounterProfile(0, 0), null);

  const mid = sampleGuardCounterProfile(375, 0.75);
  assert.equal(mid.profile.id, GUARD_COUNTER_PROFILE_IDS.LONGSWORD);
  assert.equal(mid.progress, 0.5);
  assert.equal(mid.presentationProgress, 0.5);
  near(mid.sourceProgress, 0.6);
  near(mid.sourceTimeSeconds, 0.45);
  assert.equal(mid.complete, false);

  const end = sampleGuardCounterProfile(750, 0.75);
  assert.equal(end.progress, 1);
  assert.equal(end.sourceProgress, 1);
  assert.equal(end.sourceTimeSeconds, 0.75);
  assert.equal(end.complete, true);
  assert.equal(end.completionEvent, 'counter_complete');

  const clamped = sampleGuardCounterProfile(2000, 0.75);
  assert.equal(clamped.sourceProgress, 1);
  assert.equal(clamped.sourceTimeSeconds, 0.75);
  assert.equal(clamped.complete, true);
});

test('G3.4.2 timing anchors are strictly ordered and monotonic', () => {
  for (let index = 1; index < LONGSWORD_COUNTER_TIMING_ANCHORS.length; index += 1) {
    const previous = LONGSWORD_COUNTER_TIMING_ANCHORS[index - 1];
    const current = LONGSWORD_COUNTER_TIMING_ANCHORS[index];
    assert.ok(current.presentation > previous.presentation);
    assert.ok(current.source > previous.source);
  }
});
