import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LONGSWORD_CONTACT_RECOVERY_STAGE,
  LONGSWORD_PARRY_VISUAL_LEAD_SECONDS,
  getLongswordContactRecoveryProfile,
  sampleLongswordAttackRecovery,
  sampleLongswordParryPreContact,
} from '../src/combat/longsword-contact-recovery-presentation.js';
import { sampleGuardReactionProfile } from '../src/combat/guard-reaction-presentation.js';

function close(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

test('G4.2.1 starts Parry presentation before canonical contact for every longsword direction', () => {
  // R20M.1 (B6h) and R21B.1: these are the exchange's contact times, not the clips'. LEFT's burst
  // is stretched three times, so its contact moved 0.26 -> 0.38; RIGHT's windup and burst are
  // stretched 1.6 together, so its contact moved 0.23 -> 0.368. Neither clip is retimed.
  const expectedContacts = { top: 0.43, right: 0.368, left: 0.38 };
  for (const [direction, contactSeconds] of Object.entries(expectedContacts)) {
    const profile = getLongswordContactRecoveryProfile(direction);
    assert.equal(profile.stage, LONGSWORD_CONTACT_RECOVERY_STAGE);
    close(profile.contactSeconds, contactSeconds);
    close(profile.parryVisualLeadSeconds, LONGSWORD_PARRY_VISUAL_LEAD_SECONDS);
    close(profile.parryPreviewStartSeconds, contactSeconds - LONGSWORD_PARRY_VISUAL_LEAD_SECONDS);
    close(profile.parryPresentationOffsetSeconds, LONGSWORD_PARRY_VISUAL_LEAD_SECONDS);
  }
});

test('G4.2.1 Parry preview reaches the 160ms contact pose immediately before attack contact', () => {
  const before = sampleLongswordParryPreContact('top', 0.429);
  assert.equal(before.active, true);
  assert.ok(before.sourceTimeSeconds > 0.15);
  assert.ok(before.sourceTimeSeconds < 0.16);
  assert.equal(before.contactReady, false);

  const contact = sampleLongswordParryPreContact('top', 0.43);
  assert.equal(contact.active, false);
  assert.equal(contact.contactReady, true);
});

test('G4.2.1 gives lateral attacks a longer pose-matched return to idle than TOP', () => {
  const top = getLongswordContactRecoveryProfile('top');
  const right = getLongswordContactRecoveryProfile('right');
  const left = getLongswordContactRecoveryProfile('left');
  assert.equal(top.attackRecoveryDurationMs, 120);
  assert.equal(right.attackRecoveryDurationMs, 155);
  assert.equal(left.attackRecoveryDurationMs, 155);
  assert.equal(right.attackRecoveryTargetClipId, 'UAL1/Sword_Idle');

  const half = sampleLongswordAttackRecovery('right', 77.5);
  close(half.progress, 0.5);
  close(half.eased, 0.5);
  assert.equal(half.complete, false);
  assert.equal(sampleLongswordAttackRecovery('right', 155).complete, true);
});

test('G4.2.1 visual Parry lead does not move gameplay follow-up timing before confirmed contact', () => {
  const contact = sampleGuardReactionProfile('guard_parry', 0, {
    presentationOffsetSeconds: 0.16,
  });
  close(contact.sourceTimeSeconds, 0.16);
  close(contact.presentationOffsetSeconds, 0.16);
  assert.equal(contact.counterWindowOpen, false);
  assert.equal(contact.freeAttackFollowupOpen, false);
  assert.equal(contact.complete, false);

  const rewardOpen = sampleGuardReactionProfile('guard_parry', 80, {
    presentationOffsetSeconds: 0.16,
  });
  close(rewardOpen.sourceTimeSeconds, 0.24);
  assert.equal(rewardOpen.counterWindowOpen, true);
  assert.equal(rewardOpen.freeAttackFollowupOpen, true);

  const visualEnd = sampleGuardReactionProfile('guard_parry', 800, {
    presentationOffsetSeconds: 0.16,
  });
  close(visualEnd.sourceTimeSeconds, 0.96);
  assert.equal(visualEnd.complete, true);
});
