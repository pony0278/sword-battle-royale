import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GUARD_REACTION_PROFILE_IDS,
  GUARD_REACTION_VARIANTS,
  LONGSWORD_GUARD_REACTION_PROFILES,
  getGuardReactionProfile,
  isPerfectParryPayload,
  sampleGuardReactionProfile,
} from '../src/combat/guard-reaction-presentation.js';
import {
  PRODUCTION_PARRY_DEFLECT_CLIP_IDS,
  PRODUCTION_PARRY_DEFLECT_STAGE,
} from '../src/animation/parry-contact-deflect-runtime-clip.js';

test('G3.6.3 keeps ordinary Guard Block as Block Hit only', () => {
  const block = LONGSWORD_GUARD_REACTION_PROFILES[GUARD_REACTION_VARIANTS.BLOCK_HIT];
  assert.equal(block.clipId, 'SKYRIM_GUARD/shd_blockhit');
  assert.equal(block.sourceDurationSeconds, 0.8);
  assert.equal(block.sourceWindow.endSeconds, 0.6);
  assert.equal(block.durationMs, 600);
  assert.equal(block.parryAdvantage, null);
  assert.equal(block.id, GUARD_REACTION_PROFILE_IDS.BLOCK_HIT);
  assert.equal(block.rootRotationPolicy, 'lock');
});

test('G3.6.3 maps Parry Advantage and Perfect Parry to promoted D full-recovery clips', () => {
  const parry = LONGSWORD_GUARD_REACTION_PROFILES[GUARD_REACTION_VARIANTS.PARRY];
  const perfect = LONGSWORD_GUARD_REACTION_PROFILES[GUARD_REACTION_VARIANTS.PERFECT_PARRY];

  assert.equal(PRODUCTION_PARRY_DEFLECT_STAGE, 'G3.6.3');
  assert.equal(parry.clipId, PRODUCTION_PARRY_DEFLECT_CLIP_IDS.PARRY);
  assert.equal(perfect.clipId, PRODUCTION_PARRY_DEFLECT_CLIP_IDS.PERFECT_PARRY);
  assert.equal(parry.sourceDurationSeconds, 0.96);
  assert.equal(perfect.sourceDurationSeconds, 0.96);
  assert.equal(parry.durationMs, 960);
  assert.equal(perfect.durationMs, 960);
  assert.equal(parry.productionPresentationStage, 'G3.6.3');
  assert.equal(perfect.productionPresentationStage, 'G3.6.3');
  assert.equal(parry.sharedMotionFamily, 'g363-blockhit-powerbash-full-recovery');
  assert.equal(perfect.sharedMotionFamily, parry.sharedMotionFamily);
  assert.deepEqual(parry.productionSourceChain, ['SKYRIM_GUARD/shd_blockhit', 'SKYRIM_GUARD/shd_blockbashpower']);
  assert.deepEqual(perfect.productionSourceChain, parry.productionSourceChain);
  assert.equal(parry.productionSourceChain.includes('SKYRIM_GUARD/shd_blockbash'), false);
  assert.match(parry.visualDecision, /0\.080–0\.550s @0\.95x/);
  assert.match(parry.visualDecision, /0\.550–0\.700s @1\.00x recovery/);
  assert.match(perfect.visualDecision, /exact same approved D/);
  assert.deepEqual(parry.counterWindowSeconds, [0.08, 1 / 3]);
  assert.deepEqual(perfect.counterWindowSeconds, [0.1, 0.48]);
});

test('G3.6.3 preserves authoritative Perfect Parry selection metadata', () => {
  assert.equal(isPerfectParryPayload({ perfect: true }), true);
  assert.equal(isPerfectParryPayload({ perfectParry: true }), true);
  assert.equal(isPerfectParryPayload({ grade: 'PERFECT' }), true);
  assert.equal(isPerfectParryPayload({ variant: 'perfect-parry' }), true);
  assert.equal(isPerfectParryPayload({ grade: 'normal' }), false);
  assert.equal(getGuardReactionProfile('guard_parry', {}).variant, GUARD_REACTION_VARIANTS.PARRY);
  assert.equal(getGuardReactionProfile('guard_parry', { perfect: true }).variant, GUARD_REACTION_VARIANTS.PERFECT_PARRY);
  assert.equal(getGuardReactionProfile('guard_block_hit', {}).variant, GUARD_REACTION_VARIANTS.BLOCK_HIT);
  assert.equal(getGuardReactionProfile('guard_hold', {}), null);
});

test('G3.6.3 extends Parry completion to 0.96s while gameplay reward windows remain distinct', () => {
  const blockBefore = sampleGuardReactionProfile('guard_block_hit', 599, {});
  assert.equal(blockBefore.complete, false);
  const blockEnd = sampleGuardReactionProfile('guard_block_hit', 600, {});
  assert.equal(blockEnd.complete, true);

  const parryWindowEnd = sampleGuardReactionProfile('guard_parry', 1000 / 3, {});
  assert.equal(parryWindowEnd.complete, false);
  assert.equal(parryWindowEnd.counterWindowOpen, true);
  const parryOldEnd = sampleGuardReactionProfile('guard_parry', 600, {});
  assert.equal(parryOldEnd.complete, false, 'old 600ms cutoff must no longer truncate D');
  const parryEnd = sampleGuardReactionProfile('guard_parry', 960, {});
  assert.equal(parryEnd.complete, true);
  assert.equal(parryEnd.sourceTimeSeconds, 0.96);

  const perfectWindowEnd = sampleGuardReactionProfile('guard_parry', 480, { perfect: true });
  assert.equal(perfectWindowEnd.counterWindowOpen, true);
  assert.equal(perfectWindowEnd.complete, false);
  const perfectEnd = sampleGuardReactionProfile('guard_parry', 960, { perfect: true });
  assert.equal(perfectEnd.counterWindowOpen, false);
  assert.equal(perfectEnd.complete, true);
  assert.equal(perfectEnd.sourceTimeSeconds, 0.96);
});
