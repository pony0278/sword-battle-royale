import test from 'node:test';
import assert from 'node:assert/strict';
import { getAttackTimeWarp, warpSourceToRuntime } from '../src/combat/attack-time-warp.js';
import {
  MEASURED_RECOVERY_TRAVEL_DEGREES,
  SETTLE_DEGREES_PER_SECOND,
} from '../src/combat/longsword-contact-recovery-presentation.js';
import { LONGSWORD_DIRECTIONAL_ATTACKS } from '../src/combat/longsword-directional-metadata.js';
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
  // R20M.1 (B6h), R21B.1 and R21I.1: these are the exchange's contact times, not the clips'. LEFT's
  // burst is stretched three times, so its contact moved 0.26 -> 0.38; RIGHT's windup and burst are
  // stretched together, moving its contact from 0.23. Neither clip is retimed.
  //
  // RIGHT's figure is derived from the warp rather than written down, because it has now moved
  // twice and this test is about the recovery profile agreeing with the exchange, not about any
  // particular number. TOP and LEFT stay literal: TOP is unwarped, and LEFT's warp has not moved.
  const expectedContacts = {
    top: 0.43,
    right: warpSourceToRuntime(LONGSWORD_DIRECTIONAL_ATTACKS.right.contactSeconds, getAttackTimeWarp('right')),
    left: warpSourceToRuntime(LONGSWORD_DIRECTIONAL_ATTACKS.left.contactSeconds, getAttackTimeWarp('left')),
  };
  close(expectedContacts.left, 0.43, 1e-9);
  close(expectedContacts.right, 0.4301, 1e-4);
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

test('R21J.2 the return to idle is a settle SPEED, so every direction settles alike', () => {
  // G4.2.1 gave lateral attacks 155ms and TOP 120ms, which sounds like it accounts for them
  // travelling further - but the distances are not remotely comparable, and one duration for all
  // of them meant TOP drifted home at 34 deg/s while RIGHT whipped at 823, inside the range of a
  // real cut. The durations are derived from the measured travel now.
  const travel = MEASURED_RECOVERY_TRAVEL_DEGREES;
  for (const direction of ['top', 'right', 'left']) {
    const profile = getLongswordContactRecoveryProfile(direction);
    const speed = travel[direction] / (profile.attackRecoveryDurationMs / 1000);
    assert.ok(speed <= SETTLE_DEGREES_PER_SECOND + 1, `${direction} settles at ${speed.toFixed(0)} deg/s`);
    // Nothing settles faster than the slowest deliberate motion these attacks contain.
    assert.ok(speed < 325, `${direction} must be gentler than TOP's windup ceiling`);
    assert.ok(profile.attackRecoveryDurationMs >= 120, `${direction} still takes a moment`);
  }
  // The direction that has furthest to go gets longest, which was the whole point.
  const ms = (d) => getLongswordContactRecoveryProfile(d).attackRecoveryDurationMs;
  assert.ok(ms('right') > ms('left') && ms('left') > ms('top'));
  assert.ok(travel.right > travel.left && travel.left > travel.top);
  assert.equal(getLongswordContactRecoveryProfile('right').attackRecoveryTargetClipId, 'UAL1/Sword_Idle');

  // What was measured before the change, kept so the size of it stays visible.
  assert.equal(travel.speedBeforeDegreesPerSecond.right, 823);
  assert.ok(travel.speedBeforeDegreesPerSecond.right / SETTLE_DEGREES_PER_SECOND > 3);
});

test('G4.2.1 the recovery sample is still a smoothstep across its own duration', () => {
  const duration = getLongswordContactRecoveryProfile('right').attackRecoveryDurationMs;
  const half = sampleLongswordAttackRecovery('right', duration / 2);
  close(half.progress, 0.5);
  close(half.eased, 0.5);
  assert.equal(half.complete, false);
  assert.equal(sampleLongswordAttackRecovery('right', duration).complete, true);
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
