import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTACKER_RECOIL_PRESENTATION_CHANNELS,
  ATTACKER_RECOIL_PRESENTATION_PHASE_LATCHES,
  ATTACKER_RECOIL_PRESENTATION_PHASES,
  ATTACKER_RECOIL_PRESENTATION_PROFILES,
  ATTACKER_RECOIL_PRESENTATION_STAGE,
  advanceAttackerRecoilPresentationClock,
  resolveAttackerRecoilPresentationChannels,
  sampleAttackerRecoilPresentation,
} from '../src/combat/attacker-recoil-presentation.js';
import {
  measureAttackerRecoilWorldSilhouette,
} from '../src/combat/attacker-recoil-world-silhouette.js';

function plan(responseClass = 'parry-directional-recoil', overrides = {}) {
  return {
    stage: 'G4.3B.2',
    planned: true,
    sequence: 9,
    attackDirection: 'left',
    responseClass,
    weapon: {
      direction: { x: 0.6, y: 0.35, z: -0.72 },
      lateralSign: 1,
      strength: responseClass === 'blocked-weapon-bounce' ? 0.28 : responseClass === 'perfect-parry-directional-recoil' ? 1 : 0.68,
      deflectDegrees: responseClass === 'blocked-weapon-bounce' ? 12 : responseClass === 'perfect-parry-directional-recoil' ? 44 : 30,
    },
    body: {
      strength: responseClass === 'blocked-weapon-bounce' ? 0.12 : responseClass === 'perfect-parry-directional-recoil' ? 0.56 : 0.38,
      yawDegrees: 10,
      pitchDegrees: -7,
      rollDegrees: 2.8,
    },
    ...overrides,
  };
}

test('G4.3B.3 presentation keeps a readable frozen contact hold before recoil', () => {
  const p = plan();
  const sample = sampleAttackerRecoilPresentation(p, 12);
  assert.equal(sample.stage, ATTACKER_RECOIL_PRESENTATION_STAGE);
  assert.equal(sample.phase, ATTACKER_RECOIL_PRESENTATION_PHASES.CONTACT_HOLD);
  assert.equal(sample.weights.armWeight, 0);
  assert.equal(sample.weights.torsoWeight, 0);
  assert.equal(sample.weights.legWeight, 0);
  assert.deepEqual(sample.pose.weaponAimOffsetMeters, { x: 0, y: 0, z: 0 });
});

test('G4.3B.3 force chain makes sword arm lead torso and legs during impulse', () => {
  const p = plan();
  const profile = ATTACKER_RECOIL_PRESENTATION_PROFILES[p.responseClass];
  const elapsed = profile.contactHoldMs + (profile.impulseEndMs - profile.contactHoldMs) * 0.55;
  const sample = sampleAttackerRecoilPresentation(p, elapsed);
  assert.equal(sample.phase, ATTACKER_RECOIL_PRESENTATION_PHASES.IMPULSE);
  assert.ok(sample.weights.armWeight > sample.weights.torsoWeight);
  assert.ok(sample.weights.torsoWeight > sample.weights.legWeight);
  assert.ok(sample.pose.upperArmAimDegrees > 0);
});

test('G4.3B.3 Block stays much smaller and shorter than Parry and Perfect Parry', () => {
  const blockProfile = ATTACKER_RECOIL_PRESENTATION_PROFILES['blocked-weapon-bounce'];
  const parryProfile = ATTACKER_RECOIL_PRESENTATION_PROFILES['parry-directional-recoil'];
  const perfectProfile = ATTACKER_RECOIL_PRESENTATION_PROFILES['perfect-parry-directional-recoil'];
  assert.ok(blockProfile.settleEndMs < parryProfile.settleEndMs);
  assert.ok(parryProfile.settleEndMs < perfectProfile.settleEndMs);

  const block = sampleAttackerRecoilPresentation(plan('blocked-weapon-bounce'), blockProfile.impulseEndMs);
  const parry = sampleAttackerRecoilPresentation(plan('parry-directional-recoil'), parryProfile.impulseEndMs);
  const perfect = sampleAttackerRecoilPresentation(plan('perfect-parry-directional-recoil'), perfectProfile.impulseEndMs);
  assert.ok(block.pose.upperArmAimDegrees < parry.pose.upperArmAimDegrees);
  assert.ok(parry.pose.upperArmAimDegrees < perfect.pose.upperArmAimDegrees);
  assert.ok(block.pose.leftKneeBendDegrees < parry.pose.leftKneeBendDegrees);
  assert.ok(parry.pose.leftKneeBendDegrees < perfect.pose.leftKneeBendDegrees);
});

test('G4.3B.3 LEFT and RIGHT recoil mirror loaded leg bias', () => {
  const profile = ATTACKER_RECOIL_PRESENTATION_PROFILES['parry-directional-recoil'];
  const left = sampleAttackerRecoilPresentation(plan(), profile.impulseEndMs);
  const right = sampleAttackerRecoilPresentation(plan('parry-directional-recoil', {
    attackDirection: 'right',
    weapon: {
      ...plan().weapon,
      lateralSign: -1,
      direction: { x: -0.6, y: 0.35, z: -0.72 },
    },
    body: {
      ...plan().body,
      yawDegrees: -10,
      rollDegrees: -2.8,
    },
  }), profile.impulseEndMs);

  assert.ok(left.pose.leftKneeBendDegrees > left.pose.rightKneeBendDegrees);
  assert.ok(right.pose.rightKneeBendDegrees > right.pose.leftKneeBendDegrees);
  assert.ok(left.pose.chestYawDegrees > 0);
  assert.ok(right.pose.chestYawDegrees < 0);
});

test('G4.3B.3 TOP recoil keeps leg loading substantially symmetric', () => {
  const profile = ATTACKER_RECOIL_PRESENTATION_PROFILES['parry-directional-recoil'];
  const top = sampleAttackerRecoilPresentation(plan('parry-directional-recoil', {
    attackDirection: 'top',
    weapon: { ...plan().weapon, lateralSign: 1, direction: { x: 0.1, y: 0.9, z: -0.4 } },
  }), profile.impulseEndMs);
  assert.ok(Math.abs(top.pose.leftKneeBendDegrees - top.pose.rightKneeBendDegrees) < 1e-9);
  assert.ok(top.pose.weaponAimOffsetMeters.y > 0);
});

test('G4.3B.3 settles to zero and explicitly opens attack handoff', () => {
  const p = plan();
  const profile = ATTACKER_RECOIL_PRESENTATION_PROFILES[p.responseClass];
  const complete = sampleAttackerRecoilPresentation(p, profile.settleEndMs + 1);
  assert.equal(complete.phase, ATTACKER_RECOIL_PRESENTATION_PHASES.COMPLETE);
  assert.equal(complete.complete, true);
  assert.equal(complete.readyForAttackHandoff, true);
  assert.equal(complete.pose.upperArmAimDegrees, 0);
  assert.equal(complete.pose.chestYawDegrees, 0);
  assert.equal(complete.pose.leftKneeBendDegrees, 0);
});

test('G4.3B.3 rejects unplanned or unsupported recoil contracts', () => {
  assert.equal(sampleAttackerRecoilPresentation({ planned: false }, 50), null);
  assert.equal(sampleAttackerRecoilPresentation({ planned: true, responseClass: 'unknown' }, 50), null);
});

test('R18I parks visible OLD B3 at zero during contact and advances only after deflect release', () => {
  const p = plan();
  const latch = ATTACKER_RECOIL_PRESENTATION_PHASE_LATCHES.CONTACT_ORIGIN;
  const first = advanceAttackerRecoilPresentationClock(p, 0, 0.2, {}, { phaseLatch: latch });
  assert.equal(first.elapsedMs, 0);
  assert.equal(first.requestedElapsedMs, 200);
  assert.equal(first.latchPointMs, 0);
  assert.equal(first.latched, true);
  assert.equal(first.presentationClockPausedByContact, true);

  const held = advanceAttackerRecoilPresentationClock(p, first.elapsedMs, 0.4, {}, { phaseLatch: latch });
  assert.equal(held.elapsedMs, 0);
  assert.equal(held.requestedElapsedMs, 400);
  assert.equal(held.latched, true);

  const released = advanceAttackerRecoilPresentationClock(p, held.elapsedMs, 0.016);
  assert.equal(released.previousElapsedMs, 0);
  assert.equal(released.elapsedMs, 16);
  assert.equal(released.latched, false);
  assert.equal(released.presentationClockPausedByContact, false);
});

test('R18I preserves the authored impulse power frame when a slow frame crosses it', () => {
  const p = plan();
  const impulseEndMs = ATTACKER_RECOIL_PRESENTATION_PROFILES[p.responseClass].impulseEndMs;
  const peak = advanceAttackerRecoilPresentationClock(p, 100, 0.05, {
    impulseEndMs,
  });
  assert.equal(peak.requestedElapsedMs, 150);
  assert.equal(peak.elapsedMs, impulseEndMs);
  assert.equal(peak.snappedToImpulsePeak, true);
  assert.equal(peak.presentationClockPausedByContact, false);
  assert.match(peak.authority, /preserves-authored-impulse-power-frame/);

  const continued = advanceAttackerRecoilPresentationClock(p, peak.elapsedMs, 0.05, {
    impulseEndMs,
  });
  assert.equal(continued.elapsedMs, impulseEndMs + 50);
  assert.equal(continued.snappedToImpulsePeak, false);
});

test('R18I4 holds the whole-body power frame for multiple 30 fps frames', () => {
  const p = plan();
  const overrides = {
    impulseEndMs: 112,
    recoilEndMs: 245,
    settleEndMs: 420,
    powerFrameHoldMs: 72,
  };
  const held = sampleAttackerRecoilPresentation(p, 160, overrides);
  assert.equal(held.phase, ATTACKER_RECOIL_PRESENTATION_PHASES.IMPULSE);
  assert.equal(held.weights.armWeight, 1);
  assert.equal(held.weights.torsoWeight, 1);
  assert.equal(held.weights.legWeight, 1);
  assert.equal(held.weights.powerFrameHeld, true);

  const continued = sampleAttackerRecoilPresentation(p, 190, overrides);
  assert.equal(continued.phase, ATTACKER_RECOIL_PRESENTATION_PHASES.RECOIL);
  const complete = sampleAttackerRecoilPresentation(p, 493, overrides);
  assert.equal(complete.complete, true);
  assert.equal(complete.profile.visibleSettleEndMs, 492);
});

test('R18I4 visual acceptance measures final world landmarks instead of requested local angles', () => {
  const baseline = {
    hips: { x: 0, y: 0, z: 0 },
    chest: { x: 0, y: 1, z: 0 },
    shoulders: { x: 0, y: 1.4, z: 0 },
    head: { x: 0, y: 2, z: 0 },
  };
  const radians = 20 * Math.PI / 180;
  const readable = measureAttackerRecoilWorldSilhouette({
    baseline,
    current: {
      hips: { x: 0, y: 0, z: 0 },
      chest: { x: 0, y: Math.cos(radians), z: Math.sin(radians) },
      shoulders: { x: 0, y: 1.4 * Math.cos(radians), z: 1.4 * Math.sin(radians) },
      head: { x: 0, y: 2 * Math.cos(radians), z: 2 * Math.sin(radians) },
    },
    backwardDirection: { x: 0, y: 0, z: 1 },
    requestedLocalChainPitchDegrees: -24.5,
  });
  assert.equal(readable.accepted, true);
  assert.equal(readable.readable, true);
  assert.ok(Math.abs(readable.worldBackwardLeanDegrees - 20) < 1e-9);
  assert.match(readable.authority, /final-rig-world-space/);

  const armOnlyFalsePositive = measureAttackerRecoilWorldSilhouette({
    baseline,
    current: baseline,
    backwardDirection: { x: 0, y: 0, z: 1 },
    requestedLocalChainPitchDegrees: -24.5,
  });
  assert.equal(armOnlyFalsePositive.readable, false);
  assert.equal(armOnlyFalsePositive.requestedLocalChainPitchDegrees, -24.5);
});

test('R18F latches OLD B3 at impulse peak during contact and continues without rewinding', () => {
  const p = plan();
  const latch = ATTACKER_RECOIL_PRESENTATION_PHASE_LATCHES.IMPULSE_PEAK;
  const impulseEndMs = ATTACKER_RECOIL_PRESENTATION_PROFILES[p.responseClass].impulseEndMs;
  const first = advanceAttackerRecoilPresentationClock(p, 0, 0.2, {}, { phaseLatch: latch });
  assert.equal(first.elapsedMs, impulseEndMs);
  assert.equal(first.requestedElapsedMs, 200);
  assert.equal(first.latched, true);
  assert.equal(first.presentationClockPausedByContact, true);

  const held = advanceAttackerRecoilPresentationClock(
    p,
    first.elapsedMs,
    0.4,
    {},
    { phaseLatch: latch },
  );
  assert.equal(held.elapsedMs, impulseEndMs);
  assert.equal(held.requestedElapsedMs, impulseEndMs + 400);
  assert.equal(held.latched, true);

  const released = advanceAttackerRecoilPresentationClock(p, held.elapsedMs, 0.016);
  assert.equal(released.previousElapsedMs, impulseEndMs);
  assert.equal(released.elapsedMs, impulseEndMs + 16);
  assert.equal(released.latched, false);
  assert.equal(released.presentationClockPausedByContact, false);
});

test('G4.3B.3 exposes body-only ownership while a live contact constraint owns the weapon arm', () => {
  assert.deepEqual(
    resolveAttackerRecoilPresentationChannels(
      ATTACKER_RECOIL_PRESENTATION_CHANNELS.BODY_WITH_CONTACT_ARM,
    ),
    {
      torso: true,
      torsoYawRoll: false,
      legs: true,
      weaponArm: false,
    },
  );
  assert.deepEqual(
    resolveAttackerRecoilPresentationChannels(),
    {
      torso: true,
      torsoYawRoll: true,
      legs: true,
      weaponArm: true,
    },
  );
});
