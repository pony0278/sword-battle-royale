import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_RUN_CLIP_ID,
  GAITS_ARE_SYMMETRIC,
  MEASURED_FOOT_CONTACT_PHASE,
  MEASURED_UPPER_BODY_DIVERGENCE_BY_RUN_CLIP,
  MEASURED_UPPER_BODY_DIVERGENCE_DEGREES,
  PHASE_OFFSET_TO_WALKING_B,
  RUNNING_A_PHASE_OFFSET_TO_WALKING_B,
  alignedRunPhase,
} from '../src/combat/locomotion-phase-alignment.js';
import {
  DEFAULT_SPRINT_ARM_CLIP_ID,
  SPRINT_ARM_CLIP_CANDIDATES,
  SPRINT_ARM_OVERLAY_BONES,
  resolveSprintArmClip,
  sprintArmSamplePhase,
} from '../src/combat/sprint-arm-overlay.js';
import { MEASURED_LOCOMOTION_CLIPS } from '../src/combat/locomotion-clip-measurements.js';
import { readLabExperimentParameters } from '../tools/action-studio/shield-parry-r281/lab-experiment-parameters.js';
import { readFile } from 'node:fs/promises';
import { LANE_WALK_CLIPS } from '../src/combat/lane-walk-cycle.js';

// R21Y.1 - which run lends the sprint its arms, as a dial.
//
// Asked whether Running_B could replace Running_A. Both are in the pack and both are now measured,
// and they are different animals rather than two speeds of one clip: Running_B gives more shoulder
// and half again as much elbow, less hand, and it leans. Which reads better is an eye's call, so
// ?runclip= exists and the default does not move until somebody has looked.

test('R21Y.1 both candidates are measured, and the offsets come from the contacts', () => {
  for (const clipId of SPRINT_ARM_CLIP_CANDIDATES) {
    const contact = MEASURED_FOOT_CONTACT_PHASE[clipId];
    assert.ok(contact, `${clipId} must have a measured contact or it cannot be aligned`);
    // Half a cycle apart, or it cannot be phase-matched to a symmetric walk at all.
    assert.equal(GAITS_ARE_SYMMETRIC[clipId], 0.5);
    let apart = contact.right.strike - contact.left.strike;
    if (apart < 0) apart += 1;
    assert.ok(Math.abs(apart - 0.5) < 0.002, `${clipId} feet ${apart} apart`);
    // The phase table and the speed table describe the same clip.
    assert.equal(contact.cycleSeconds, MEASURED_LOCOMOTION_CLIPS[clipId].durationSeconds);
    assert.equal(contact.authoredSpeedMps, MEASURED_LOCOMOTION_CLIPS[clipId].authoredSpeedMps);
  }

  // Derived, not restated: an offset and the strikes it came from are one fact written twice, and
  // the copy that gets edited alone is the one that swings the arms against the feet.
  const walkStrike = MEASURED_FOOT_CONTACT_PHASE.Walking_B.left.strike;
  for (const clipId of SPRINT_ARM_CLIP_CANDIDATES) {
    const expected = Number((walkStrike - MEASURED_FOOT_CONTACT_PHASE[clipId].left.strike).toFixed(3));
    assert.equal(PHASE_OFFSET_TO_WALKING_B[clipId], expected, clipId);
  }
  assert.equal(PHASE_OFFSET_TO_WALKING_B.Running_A, 0.207);
  assert.equal(PHASE_OFFSET_TO_WALKING_B.Running_B, 0.127);
  assert.equal(RUNNING_A_PHASE_OFFSET_TO_WALKING_B, PHASE_OFFSET_TO_WALKING_B.Running_A);
});

test('R21Y.1 each clip is sampled where IT strikes with the walk', () => {
  // The point of making the offset per clip: at the walk's left strike, each run must be at its
  // own left strike. Sharing one offset would put Running_B 8% of a cycle out of step.
  const walkStrike = MEASURED_FOOT_CONTACT_PHASE.Walking_B.left.strike;
  for (const clipId of SPRINT_ARM_CLIP_CANDIDATES) {
    assert.ok(Math.abs(sprintArmSamplePhase(walkStrike, clipId) - MEASURED_FOOT_CONTACT_PHASE[clipId].left.strike) < 0.002,
      `${clipId} lands at ${sprintArmSamplePhase(walkStrike, clipId)}`);
  }
  assert.notEqual(sprintArmSamplePhase(walkStrike, 'Running_A'), sprintArmSamplePhase(walkStrike, 'Running_B'));

  // MINUS the offset, not plus - the sign R21Y.1's first divergence reading got backwards.
  assert.ok(alignedRunPhase(0.05, 'Running_A') > 0.8, 'wraps rather than going negative');
  assert.equal(alignedRunPhase('nonsense'), null);
  assert.equal(alignedRunPhase(0.3, 'Running_Nope'), null, 'an unmeasured clip has no aligned phase');
});

test('R21Y.1 an unmeasured clip name resolves to the default rather than being taken on trust', () => {
  assert.equal(resolveSprintArmClip('Running_B').clipId, 'Running_B');
  assert.equal(resolveSprintArmClip('Running_B').reason, 'override');
  for (const bad of [undefined, null, '', '  ', 'Running_H', 'Running_Strafe_Left', 42]) {
    const resolved = resolveSprintArmClip(bad);
    assert.equal(resolved.clipId, DEFAULT_SPRINT_ARM_CLIP_ID, `${JSON.stringify(bad)}`);
    // A clip with no measured contact has no phase offset, and an unaligned overlay swings the
    // arms against the feet - which R21T.1 measured as reading worse than not borrowing at all.
    assert.ok(resolved.phaseOffset != null, 'the default always has an offset');
  }
  assert.equal(resolveSprintArmClip('Running_H').reason, 'unmeasured-clip-has-no-phase-offset');
  assert.equal(DEFAULT_SPRINT_ARM_CLIP_ID, DEFAULT_RUN_CLIP_ID);
  assert.equal(DEFAULT_SPRINT_ARM_CLIP_ID, 'Running_A', 'the default does not move until somebody has looked');
});

test('R21Y.1 the two clips differ where the rig can show it', () => {
  const a = MEASURED_UPPER_BODY_DIVERGENCE_BY_RUN_CLIP.Running_A;
  const b = MEASURED_UPPER_BODY_DIVERGENCE_BY_RUN_CLIP.Running_B;
  // The case for the swap, as numbers: Running_B trades hand rotation for shoulder and elbow.
  assert.ok(b['upperarm.r'] > a['upperarm.r'] && b['upperarm.l'] > a['upperarm.l'], 'more shoulder');
  assert.ok(b['lowerarm.r'] > a['lowerarm.r'] * 1.35, 'half again as much elbow');
  assert.ok(b['hand.r'] < a['hand.r'], 'and less hand, which is the price');
  // Neither clip animates the wrist, so the hand's rotation has nothing below it to amplify.
  for (const clip of [a, b]) {
    assert.equal(clip['wrist.l'], 0);
    assert.equal(clip['wrist.r'], 0);
  }
  // Every borrowed bone must actually differ, in either clip, or borrowing it is decoration.
  for (const bone of SPRINT_ARM_OVERLAY_BONES) {
    assert.ok(a[bone] > 10 && b[bone] > 10, `${bone} barely differs`);
  }
  // R21U.1's exclusion argument was "KayKit's run does not lean", measured at 8.3 degrees of
  // spine. That is true of Running_A and NOT of Running_B, which is a live question rather than a
  // settled one - pinned here so a swap cannot quietly carry the old justification with it.
  assert.ok(a.spine < 10);
  assert.ok(b.spine > 10, 'Running_B does lean, so the exclusion needs its own argument');

  // The name R21T.2 gave the table still points at the shipped clip's numbers.
  assert.equal(MEASURED_UPPER_BODY_DIVERGENCE_DEGREES, MEASURED_UPPER_BODY_DIVERGENCE_BY_RUN_CLIP[DEFAULT_RUN_CLIP_ID]);
});

test('R21Y.1 the lab reads ?runclip= and a plain URL is still the build', () => {
  const plain = readLabExperimentParameters(new URLSearchParams(''));
  assert.equal(plain.sprintArmClipId, DEFAULT_SPRINT_ARM_CLIP_ID);
  assert.equal(plain.sprintArmClipReason, 'default');
  assert.equal(plain.sprintArmPhaseOffset, 0.207);

  const swapped = readLabExperimentParameters(new URLSearchParams('runclip=Running_B'));
  assert.equal(swapped.sprintArmClipId, 'Running_B');
  assert.equal(swapped.sprintArmPhaseOffset, 0.127, 'and the offset follows the clip');

  // All three dials are independent.
  const all = readLabExperimentParameters(new URLSearchParams('tempo=2&sprint=1.8&runclip=Running_B'));
  assert.equal(all.tempoScale, 2);
  assert.equal(all.sprintSpeedMps, 1.8);
  assert.equal(all.sprintArmClipId, 'Running_B');
});

test('R21Y.1 every candidate gets a real duration, or it is sampled off its own cycle', () => {
  // The silent path. bootstrap builds the duration map from LANE_WALK_CLIPS alone, and a clip that
  // is not in it falls back to `|| 1` - so Running_B would be driven through a 1-second cycle it
  // does not have, sampling 25% off its own 0.8s, and the arms would swing against the feet. That
  // is the exact failure the phase alignment exists to prevent, arriving through a lookup instead
  // of through the maths, with nothing on screen to say so.
  const candidates = new Set(SPRINT_ARM_CLIP_CANDIDATES);
  assert.ok(candidates.has('Running_B'));
  assert.ok(!Object.values(LANE_WALK_CLIPS).includes('Running_B'),
    'Running_B is deliberately NOT in LANE_WALK_CLIPS - that is why bootstrap has to add it');
  for (const clipId of candidates) {
    // Both clips are 0.8s, and the durations bootstrap reads must come out the same as the ones
    // the phase table was measured against.
    assert.equal(MEASURED_FOOT_CONTACT_PHASE[clipId].cycleSeconds, MEASURED_LOCOMOTION_CLIPS[clipId].durationSeconds);
  }
});

test('R21Y.1 bootstrap measures a duration for every candidate, not just the named walk clips', async () => {
  const bootstrap = await readFile(new URL('../src/game/bootstrap.js', import.meta.url), 'utf8');
  assert.match(bootstrap, /SPRINT_ARM_CLIP_CANDIDATES/,
    'the duration map has to cover every clip the arms may be borrowed from');
});
