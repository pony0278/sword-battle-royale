import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GUARD_ACTION_SEMANTIC_FIT,
  GUARD_ACTION_SEMANTIC_ROLES,
  GUARD_ACTION_SEMANTIC_STAGE,
} from '../src/combat/guard-action-semantics.js';
import {
  GUARD_REACTION_VARIANTS,
  LONGSWORD_GUARD_REACTION_PROFILES,
  sampleGuardReactionProfile,
} from '../src/combat/guard-reaction-presentation.js';
import { LONGSWORD_GUARD_COUNTER_PROFILE } from '../src/combat/guard-counter-presentation.js';
import { PRODUCTION_PARRY_DEFLECT_CLIP_IDS } from '../src/animation/parry-contact-deflect-runtime-clip.js';
import {
  PARRY_ADVANTAGE_DIRECTIONS,
  PARRY_ADVANTAGE_ENEMY_RESPONSE,
  PARRY_ADVANTAGE_FOLLOWUP_MODE,
  PARRY_ADVANTAGE_STAGE,
} from '../src/combat/parry-advantage.js';

test('G3.5.1 keeps Block Hit semantically approved without granting free attack advantage', () => {
  const block = LONGSWORD_GUARD_REACTION_PROFILES[GUARD_REACTION_VARIANTS.BLOCK_HIT];
  assert.equal(block.semanticStage, GUARD_ACTION_SEMANTIC_STAGE);
  assert.equal(block.intendedRole, GUARD_ACTION_SEMANTIC_ROLES.BLOCK_REACTION);
  assert.equal(block.sourceRole, GUARD_ACTION_SEMANTIC_ROLES.BLOCK_REACTION);
  assert.equal(block.semanticFit, GUARD_ACTION_SEMANTIC_FIT.MATCH);
  assert.equal(block.replacementRequired, false);
  assert.equal(block.parryAdvantage, null);
  assert.equal(sampleGuardReactionProfile('guard_block_hit', 300, {}).freeAttackFollowupOpen, false);
});

test('G3.5.1 turns Parry into attacker stagger plus existing directional attack follow-up', () => {
  const block = LONGSWORD_GUARD_REACTION_PROFILES[GUARD_REACTION_VARIANTS.BLOCK_HIT];
  const parry = LONGSWORD_GUARD_REACTION_PROFILES[GUARD_REACTION_VARIANTS.PARRY];
  const perfect = LONGSWORD_GUARD_REACTION_PROFILES[GUARD_REACTION_VARIANTS.PERFECT_PARRY];

  // G3.6.3 superseded the original G3.5.1 shape: Parry no longer replays Block Hit
  // verbatim, it replays a Power Deflect composed from Block Hit plus shd_blockbashpower.
  // So each grade now carries its own source role and its own clip id. What G3.5.1
  // actually established still holds, and is what the rest of this test guards: no new
  // animation had to be acquired, and no dedicated Counter state exists.
  for (const { profile, sourceRole, clipId } of [
    {
      profile: parry,
      sourceRole: GUARD_ACTION_SEMANTIC_ROLES.PARRY_SUCCESS,
      clipId: PRODUCTION_PARRY_DEFLECT_CLIP_IDS.PARRY,
    },
    {
      profile: perfect,
      sourceRole: GUARD_ACTION_SEMANTIC_ROLES.PERFECT_PARRY_SUCCESS,
      clipId: PRODUCTION_PARRY_DEFLECT_CLIP_IDS.PERFECT_PARRY,
    },
  ]) {
    assert.equal(profile.intendedRole, GUARD_ACTION_SEMANTIC_ROLES.PARRY_ADVANTAGE);
    assert.equal(profile.sourceRole, sourceRole);
    assert.equal(profile.semanticFit, GUARD_ACTION_SEMANTIC_FIT.MATCH);
    assert.equal(profile.replacementRequired, false);
    assert.equal(profile.clipId, clipId);
    assert.notEqual(profile.clipId, block.clipId);
    assert.equal(profile.productionSourceChain[0], block.clipId);
    assert.equal(profile.parryAdvantage.stage, PARRY_ADVANTAGE_STAGE);
    assert.equal(profile.parryAdvantage.enemyResponse, PARRY_ADVANTAGE_ENEMY_RESPONSE);
    assert.equal(profile.parryAdvantage.followupMode, PARRY_ADVANTAGE_FOLLOWUP_MODE);
    assert.deepEqual(profile.parryAdvantage.allowedDirections, PARRY_ADVANTAGE_DIRECTIONS);
    assert.equal(profile.parryAdvantage.dedicatedCounterState, false);
    assert.equal(profile.parryAdvantage.dedicatedCounterAnimation, false);
    assert.equal(profile.parryAdvantage.enemyStaggerDurationAuthority, 'authoritative-combat-balance');
  }
});

test('G3.5.1 preserves distinct normal/perfect follow-up windows without a dedicated Counter clip', () => {
  const parry = LONGSWORD_GUARD_REACTION_PROFILES[GUARD_REACTION_VARIANTS.PARRY];
  const perfect = LONGSWORD_GUARD_REACTION_PROFILES[GUARD_REACTION_VARIANTS.PERFECT_PARRY];

  assert.deepEqual(parry.followupWindowSeconds, [0.08, 1 / 3]);
  assert.deepEqual(perfect.followupWindowSeconds, [0.1, 0.48]);
  assert.notDeepEqual(parry.followupWindowSeconds, perfect.followupWindowSeconds);

  assert.equal(sampleGuardReactionProfile('guard_parry', 79, {}).freeAttackFollowupOpen, false);
  assert.equal(sampleGuardReactionProfile('guard_parry', 80, {}).freeAttackFollowupOpen, true);
  assert.equal(sampleGuardReactionProfile('guard_parry', 334, {}).freeAttackFollowupOpen, false);
  assert.equal(sampleGuardReactionProfile('guard_parry', 100, { perfect: true }).freeAttackFollowupOpen, true);
  assert.equal(sampleGuardReactionProfile('guard_parry', 481, { perfect: true }).freeAttackFollowupOpen, false);
});

test('G3.5.1 retires Melee_Block_Attack from production instead of searching for a replacement Counter', () => {
  const counter = LONGSWORD_GUARD_COUNTER_PROFILE;
  assert.equal(counter.semanticStage, GUARD_ACTION_SEMANTIC_STAGE);
  assert.equal(counter.intendedRole, GUARD_ACTION_SEMANTIC_ROLES.LEGACY_COUNTER_PRESENTATION);
  assert.equal(counter.sourceRole, GUARD_ACTION_SEMANTIC_ROLES.BLOCK_ATTACK_PUSH);
  assert.equal(counter.semanticFit, GUARD_ACTION_SEMANTIC_FIT.PROVISIONAL);
  assert.equal(counter.replacementRequired, false);
  assert.equal(counter.legacyOnly, true);
  assert.equal(counter.productionEnabled, false);
  assert.equal(counter.retiredByStage, 'G3.5.1');
  assert.match(counter.semanticNote, /No replacement Counter animation is required/i);
});
