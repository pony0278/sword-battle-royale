import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  GAITS_ARE_SYMMETRIC,
  MEASURED_UPPER_BODY_DIVERGENCE_BY_RUN_CLIP,
  MEASURED_UPPER_BODY_DIVERGENCE_DEGREES,
  UPPER_BODY_DIVERGENCE_NOTES,
  LOCOMOTION_PHASE_ALIGNMENT_STAGE,
  LOCOMOTION_PHASE_METHOD,
  MEASURED_FOOT_CONTACT_PHASE,
  RUNNING_A_PHASE_OFFSET_TO_WALKING_B,
  STANCE_FRACTION_MISMATCH,
  alignedRunPhase,
} from '../src/combat/locomotion-phase-alignment.js';
import { MEASURED_LOCOMOTION_CLIPS } from '../src/combat/locomotion-clip-measurements.js';

test('R21T.1 both gaits put their feet exactly half a cycle apart', () => {
  assert.equal(LOCOMOTION_PHASE_ALIGNMENT_STAGE, 'R21T.1');
  // The precondition for blending at all: an asymmetric cycle could not be phase-matched to a
  // symmetric one, and a retargeted clip is exactly the thing that comes back subtly lopsided.
  for (const [clipId, expected] of Object.entries(GAITS_ARE_SYMMETRIC)) {
    const clip = MEASURED_FOOT_CONTACT_PHASE[clipId];
    let apart = clip.right.strike - clip.left.strike;
    if (apart < 0) apart += 1;
    assert.ok(Math.abs(apart - expected) < 0.005, `${clipId} feet are ${apart} apart, not ${expected}`);
  }
});

test('R21T.1 the offset lands the run on its own strike', () => {
  // The check that says the number is the alignment and not an arithmetic slip: sampling the run
  // at the walk's strike phase must land on the run's own strike.
  // Named clip, not the default: R22C.1 moved the default to Running_B, and this is R21T.1's
  // reading of Running_A, which is still measured and still selectable.
  const walkStrike = MEASURED_FOOT_CONTACT_PHASE.Walking_B.left.strike;
  const runStrike = MEASURED_FOOT_CONTACT_PHASE.Running_A.left.strike;
  assert.ok(Math.abs(alignedRunPhase(walkStrike, 'Running_A') - runStrike) < 0.002);
  assert.equal(RUNNING_A_PHASE_OFFSET_TO_WALKING_B, Number((walkStrike - runStrike).toFixed(3)));
  // It wraps, so a phase before the offset does not go negative.
  assert.ok(alignedRunPhase(0.05, 'Running_A') > 0.8);
  assert.equal(alignedRunPhase('nonsense'), null);
});

test('R21T.1 only one event can be matched, and the record says which', () => {
  // Aligning the strikes leaves the lifts apart, because the toe's ground time genuinely differs
  // between the gaits - a walk strikes heel-first, a run lands flat. This is the limit on what a
  // blend can be, so it is recorded rather than discovered later by eye.
  const m = STANCE_FRACTION_MISMATCH;
  assert.ok(m.Running_A > m.Walking_B);
  const walkLift = MEASURED_FOOT_CONTACT_PHASE.Walking_B.left.lift;
  const runLiftAligned = MEASURED_FOOT_CONTACT_PHASE.Running_A.left.lift + RUNNING_A_PHASE_OFFSET_TO_WALKING_B;
  assert.ok(Math.abs((runLiftAligned - walkLift) - m.liftsRemainApartBy) < 0.005);
  assert.equal(m.onlyOneEventCanBeMatched, true);
});

test('R21T.1 the phases agree with the speeds fitted from the same contacts', () => {
  // R20W.1 fitted the authored speed from exactly these contacts and kept only the speeds. If the
  // two readings disagreed about which clip is which, one of them is measuring something else.
  for (const clipId of ['Walking_B', 'Running_A']) {
    assert.equal(MEASURED_FOOT_CONTACT_PHASE[clipId].authoredSpeedMps, MEASURED_LOCOMOTION_CLIPS[clipId].authoredSpeedMps);
    assert.equal(MEASURED_FOOT_CONTACT_PHASE[clipId].cycleSeconds, MEASURED_LOCOMOTION_CLIPS[clipId].durationSeconds);
  }
});

test('R21T.1 the method is reproducible, and the script is committed this time', async () => {
  // R20W.1's fit was not kept, so when the phases were wanted the whole reading had to be rebuilt
  // from the comment describing it.
  assert.equal(LOCOMOTION_PHASE_METHOD.samplesPerCycle, 480);
  assert.equal(LOCOMOTION_PHASE_METHOD.groundHeightMeters, 0.04);
  const driver = await readFile(new URL(`../${LOCOMOTION_PHASE_METHOD.driver}`, import.meta.url), 'utf8');
  const probe = await readFile(new URL(`../${LOCOMOTION_PHASE_METHOD.probe}`, import.meta.url), 'utf8');
  // The absolute ground height is the correction that moved the answer 8% of a cycle on the first
  // pass, so the driver must not quietly go back to a fraction of each clip's own range.
  assert.match(driver, /const GROUND_HEIGHT_METERS = 0\.04;/);
  assert.match(driver, /travels\s*\n?\/\/ backwards at exactly the authored speed|backwards at exactly the authored speed/);
  assert.match(probe, /const SAMPLES = 480;/);
});

test('R21T.2 the run has something worth borrowing, and it is the arms', () => {
  // The overlay's premise, checked before anything was built on it. If the two clips' upper bodies
  // were alike, borrowing one would buy nothing. True of both runs, so it survives R22C.1 moving
  // the default - but it is asserted per clip now rather than through whichever one ships.
  for (const clipId of ['Running_A', 'Running_B']) {
    const d = MEASURED_UPPER_BODY_DIVERGENCE_BY_RUN_CLIP[clipId];
    for (const bone of ['upperarm.l', 'upperarm.r', 'hand.l', 'hand.r']) {
      assert.ok(d[bone] > 30, `${clipId} ${bone} differs by only ${d[bone]} degrees`);
    }
    assert.ok(Math.min(d['upperarm.l'], d['upperarm.r']) > d.spine * 2);
    // Listing an unanimated bone in an overlay would be inert. Neither clip animates the wrists.
    assert.equal(d['wrist.l'], 0);
    assert.equal(d['wrist.r'], 0);
  }

  // R21T.2's other conclusion was "the torso barely moves, so the overlay will not buy a
  // forward-pitched sprint silhouette". That was true of the clip it was measured on and false of
  // the one that now ships, so the note is per clip and this asserts BOTH halves - the original
  // reading was not wrong, it was narrower than the sentence it was written as.
  assert.equal(UPPER_BODY_DIVERGENCE_NOTES.runDoesNotLean.Running_A, true);
  assert.equal(UPPER_BODY_DIVERGENCE_NOTES.runDoesNotLean.Running_B, false);
  const a = MEASURED_UPPER_BODY_DIVERGENCE_BY_RUN_CLIP.Running_A;
  const b = MEASURED_UPPER_BODY_DIVERGENCE_BY_RUN_CLIP.Running_B;
  for (const bone of ['spine', 'head']) {
    assert.ok(a[bone] < 10, `Running_A ${bone} moves ${a[bone]} degrees`);
    assert.ok(b[bone] > 10, `Running_B ${bone} moves only ${b[bone]} degrees`);
  }
  // The default's table is the one that ships, and it is the leaning one now.
  assert.equal(MEASURED_UPPER_BODY_DIVERGENCE_DEGREES, b);
});

test('R21T.2 nothing else claims those bones while sprinting', () => {
  // guard-walk-overlay names the legs as the bones with two would-be owners. The sprint's arms
  // would be a third claimant, except that sprinting is already refused while the guard is up.
  assert.equal(UPPER_BODY_DIVERGENCE_NOTES.ownershipIsUncontested, 'sprint-refused-while-guard-is-up');
});
