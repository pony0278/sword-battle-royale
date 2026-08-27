import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ATTACK_ADVANCE_PROFILES,
  ATTACK_ADVANCE_STAGE,
  createAttackAdvanceRuntime,
  planAttackAdvance,
  sampleAttackAdvance,
} from '../src/combat/attack-advance.js';
import { LONGSWORD_DIRECTIONAL_ATTACKS } from '../src/combat/longsword-directional-metadata.js';

function plan(direction = 'right', overrides = {}) {
  return planAttackAdvance({
    direction,
    contactSeconds: LONGSWORD_DIRECTIONAL_ATTACKS[direction].contactSeconds,
    startSeconds: 0,
    ...overrides,
  });
}

test('R18Y.1 covers every attack direction the game can throw', () => {
  assert.equal(ATTACK_ADVANCE_STAGE, 'R18Y.1');
  assert.deepEqual(
    Object.keys(ATTACK_ADVANCE_PROFILES).sort(),
    Object.keys(LONGSWORD_DIRECTIONAL_ATTACKS).sort(),
    'a direction without an advance profile silently keeps the old planted behaviour',
  );
});

test('R18Y.1 keeps the two authored steps at what the clips actually measured', () => {
  // These are transcriptions of the Root_Motion variants at each direction's contact frame. If the
  // attack clips are ever re-authored or re-timed, these stop being descriptions of the animation
  // and the footwork will slide against the swing.
  assert.equal(ATTACK_ADVANCE_PROFILES.top.metersByContact, 0.862);
  assert.equal(ATTACK_ADVANCE_PROFILES.right.metersByContact, 0.663);
  assert.equal(ATTACK_ADVANCE_PROFILES.top.source, 'authored-root-motion');
  assert.equal(ATTACK_ADVANCE_PROFILES.right.source, 'authored-root-motion');

  // LEFT is the one the animation never had, so it is labelled as ours rather than the clip's.
  assert.equal(ATTACK_ADVANCE_PROFILES.left.source, 'code-driven-target');
  assert.ok(ATTACK_ADVANCE_PROFILES.left.metersByContact > 0, 'LEFT was authored planted; give it a step');
  assert.ok(
    ATTACK_ADVANCE_PROFILES.left.metersByContact < ATTACK_ADVANCE_PROFILES.right.metersByContact,
    'LEFT already reaches half a metre further than the others, so it needs less of a step, not more',
  );
});

test('R18Y.1 spends the whole step by the moment of contact', () => {
  for (const direction of Object.keys(ATTACK_ADVANCE_PROFILES)) {
    const planned = plan(direction);
    assert.equal(planned.accepted, true, direction);
    const atContact = sampleAttackAdvance(planned, planned.contactSeconds);
    assert.ok(
      Math.abs(atContact.advanceMeters - ATTACK_ADVANCE_PROFILES[direction].metersByContact) < 1e-9,
      `${direction} must have closed its whole distance by contact, not after it`,
    );
    assert.equal(atContact.complete, true);
    assert.equal(sampleAttackAdvance(planned, 0).advanceMeters, 0);
  }
});

test('R18Y.1 holds the step after contact instead of walking into the defender', () => {
  const planned = plan('top');
  const atContact = sampleAttackAdvance(planned, planned.contactSeconds);
  for (const after of [planned.contactSeconds + 0.05, planned.contactSeconds + 0.4, 10]) {
    const later = sampleAttackAdvance(planned, after);
    assert.equal(later.advanceMeters, atContact.advanceMeters, `advance grew after contact at ${after}s`);
  }
});

test('R18Y.1 eases the travel and never runs backwards', () => {
  const planned = plan('right');
  let previous = -Infinity;
  for (let i = 0; i <= 20; i += 1) {
    const sample = sampleAttackAdvance(planned, (planned.contactSeconds * i) / 20);
    assert.ok(sample.advanceMeters >= previous - 1e-12, 'the attacker must never step backwards mid-swing');
    previous = sample.advanceMeters;
  }
  // Eased, not linear: the middle of the step covers more ground than the ends.
  const quarter = sampleAttackAdvance(planned, planned.contactSeconds * 0.25).advanceMeters;
  const half = sampleAttackAdvance(planned, planned.contactSeconds * 0.5).advanceMeters;
  const threeQuarter = sampleAttackAdvance(planned, planned.contactSeconds * 0.75).advanceMeters;
  assert.ok(half - quarter > quarter, 'travel should accelerate out of the windup');
  assert.ok(half - quarter > threeQuarter - half, 'and settle into contact rather than arriving at speed');
});

test('R18Y.1 refuses to guess when it has no direction or no timeline', () => {
  assert.equal(planAttackAdvance({ direction: 'nonsense', contactSeconds: 0.3 }).accepted, false);
  assert.equal(planAttackAdvance({ direction: 'nonsense', contactSeconds: 0.3 }).reason, 'unsupported-attack-direction');
  assert.equal(planAttackAdvance({ direction: 'left' }).reason, 'missing-contact-timeline');
  assert.equal(planAttackAdvance({ direction: 'left', contactSeconds: 0 }).reason, 'missing-contact-timeline');
  assert.equal(sampleAttackAdvance(null, 1), null);
  assert.equal(sampleAttackAdvance({ accepted: false }, 1), null);
});

test('R18Y.1 reports an absolute offset so a repeated frame cannot accumulate', () => {
  const runtime = createAttackAdvanceRuntime();
  assert.equal(runtime.active, false);
  assert.equal(runtime.advanceMeters, 0);

  runtime.start({ direction: 'left', contactSeconds: 0.26, startSeconds: 0 });
  assert.equal(runtime.active, true);
  const midway = runtime.update(0.13).advanceMeters;
  assert.equal(runtime.update(0.13).advanceMeters, midway, 'the same elapsed time must give the same offset');
  assert.ok(runtime.update(0.20).advanceMeters > midway);
  // And a frame that arrives out of order rewinds rather than double-counting.
  assert.equal(runtime.update(0.13).advanceMeters, midway);

  runtime.reset();
  assert.equal(runtime.active, false);
  assert.equal(runtime.advanceMeters, 0);
  assert.equal(runtime.update(0.2), null, 'a reset runtime must not keep reporting travel');
});

test('R18Y.1 carries no authority over whether anything was hit', () => {
  const planned = plan('left');
  assert.match(planned.authority, /no-contact-authority/);
  assert.match(sampleAttackAdvance(planned, 0.1).authority, /no-contact-authority/);
});
