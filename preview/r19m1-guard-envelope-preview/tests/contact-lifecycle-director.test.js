import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CONTACT_LIFECYCLE_DIRECTOR_STAGE,
  GUARD_INTENT_AGE_MS,
  PARRY_ATTACKER_RELEASE_SOURCE_SECONDS,
  createContactLifecycleDirector,
} from '../src/combat/contact-lifecycle-director.js';
import { GUARD_STATES } from '../src/combat/guard-state-machine.js';

// A blade sweep that crosses the shield disc, so the real probe reports a contact.
function crossingBlades() {
  const blade = (z) => [
    { x: -0.1, y: 1.0, z },
    { x: 0, y: 1.0, z },
    { x: 0.1, y: 1.0, z },
  ];
  return { previousBlade: blade(0.3), currentBlade: blade(0.7) };
}
function missingBlades() {
  const blade = (z) => [
    { x: 2.0, y: 1.0, z },
    { x: 2.1, y: 1.0, z },
    { x: 2.2, y: 1.0, z },
  ];
  return { previousBlade: blade(0.3), currentBlade: blade(0.7) };
}
const ATTACK_SNAPSHOT = Object.freeze({
  action: { id: 'test-attack' },
  phase: 'attack_active',
  elapsedSeconds: 0.25,
  sequence: 3,
});

function harness({ confirmAccepted = true, outcome = 'parry', guardState = GUARD_STATES.PARRY } = {}) {
  const calls = [];
  const reactionDirector = {
    backwardDirection: () => ({ x: 1, y: 0, z: 0 }),
    trackExcitation: () => calls.push('trackExcitation'),
    arm: (input) => {
      calls.push(`arm:${input.outcome}`);
      return {
        armFlingPlan: { accepted: true },
        attackerDisplacement: { accepted: true, peakMeters: 0.16, durationMs: 500 },
        reports: {
          armFling: Object.freeze({ accepted: true, outcome: input.outcome }),
          torsoLean: Object.freeze({ accepted: true }),
          rootDisplacement: Object.freeze({
            outcome: input.outcome,
            attacker: { peakMeters: 0.16 },
            defender: { peakMeters: 0.05 },
          }),
        },
      };
    },
    advanceAttacker: () => ({ repaintRequired: false }),
    advanceDefender: () => ({ repaintRequired: false, torsoLeanReport: null, rootDisplacementReport: null }),
    reset: () => calls.push('reactionReset'),
  };
  const shieldCenter = { x: 0, y: 1, z: 0.5 };
  const shieldSurface = () => Object.freeze({
    center: Object.freeze({ ...shieldCenter }),
    normal: Object.freeze({ x: 0, y: 0, z: 1 }),
    radius: 0.26,
    thickness: 0.075,
  });
  const attackerRig = { bones: {} };
  const director = createContactLifecycleDirector({
    attackerRig,
    reactionDirector,
    gripConstraint: {
      start: (input) => {
        calls.push('gripStart');
        return { accepted: true, stage: 'test-grip', plan: {}, modifiedBone: 'wrist.r' };
      },
      update: () => ({ holding: true, inspectionPassed: true }),
      get active() { return true; },
    },
    confirmParry: (input) => {
      calls.push('confirmParry');
      return { accepted: confirmAccepted, reason: confirmAccepted ? null : 'declined' };
    },
    resolveCombat: (input) => {
      calls.push('resolveCombat');
      return {
        accepted: true,
        resolution: { outcome },
        attackerReaction: { id: 'b3', plan: { body: { direction: { x: 1, y: 0, z: 0 } } } },
        guardIntentAgeMs: input.guardIntentAgeMs,
      };
    },
    updateCombat: (deltaSeconds, options = {}) => {
      calls.push(`updateCombat:${deltaSeconds}${options.holdAttackerInterruption ? ':live' : ''}`);
      return { recoilUpdate: null, justCompleted: false };
    },
    readCombatSnapshot: () => ({ attackerRecoil: { sample: { weights: { torsoWeight: 1 } }, phaseClock: { latchPointMs: 120 } } }),
    readShieldSurface: shieldSurface,
    readGuardReport: () => ({ state: guardState, sourceTimeSeconds: 9 }),
    takePredictiveHandoff: () => ({ accepted: true, defenderPresentationOffsetSeconds: 0.04 }),
    readCanonicalContactPose: () => ({}),
    fallbackIncomingVelocity: () => ({ x: -6, y: 0, z: 0 }),
    releaseReachOwnership: () => calls.push('releaseReach'),
    observe: {
      contactEvaluated: () => calls.push('observe:contactEvaluated'),
      impactResolved: () => calls.push('observe:impactResolved'),
      attackerPresentationRefreshed: () => calls.push('observe:presentation'),
    },
  });
  return { director, calls, moveShield(dx, dy, dz) { shieldCenter.x += dx; shieldCenter.y += dy; shieldCenter.z += dz; } };
}

function resolve(director, { selectedMode = 'parry', shieldLeadMotion = null } = {}) {
  return director.resolveContact({
    ...crossingBlades(),
    deltaSeconds: 1 / 60,
    attackSnapshot: ATTACK_SNAPSHOT,
    selectedMode,
    selectedDirection: 'right',
    shieldLeadMotion,
  });
}

test('R18S.4 the tighter guard-intent window belongs to the timed action', () => {
  assert.equal(CONTACT_LIFECYCLE_DIRECTOR_STAGE, 'R18S.4');
  assert.ok(GUARD_INTENT_AGE_MS.parry < GUARD_INTENT_AGE_MS.block);
  assert.ok(PARRY_ATTACKER_RELEASE_SOURCE_SECONDS > 0);
});

test('R18S.4 a confirmed parry starts the constraint and lets the reach ladder go', () => {
  const { director, calls } = harness();
  const result = resolve(director);
  assert.equal(result.contacted, true);
  assert.equal(result.event.type, 'parry-live-started');
  assert.deepEqual(calls, [
    'observe:contactEvaluated',
    'confirmParry',
    'resolveCombat',
    'observe:impactResolved',
    'updateCombat:0',
    'observe:presentation',
    'gripStart',
    'releaseReach',
  ], 'the whiff observation precedes the confirmation that consumes the gate');
  assert.equal(director.ownsLiveContact(), true);
  assert.equal(director.transfer.contactConstraintOwnsUntilDeflectImpulse, true);
  assert.equal(director.transfer.weaponArmContactConstrained, true);
});

test('R18S.4 a block arms the whole reaction at impact and never owns a live contact', () => {
  const { director, calls } = harness({ outcome: 'block' });
  const result = resolve(director, { selectedMode: 'block' });
  assert.equal(result.event.type, 'block-reacted');
  assert.ok(calls.includes('arm:block'));
  assert.ok(!calls.includes('confirmParry'), 'block mode never consults the parry gate');
  assert.ok(!calls.includes('gripStart'), 'a held shield never takes the blade hostage');
  assert.equal(director.ownsLiveContact(), false);
  assert.equal(director.blockReaction.startedAtImpact, true);
  assert.equal(director.blockReaction.liveGripConstraint, false);
});

test('R18S.4 a failed parry falls through: the outcome is already a block', () => {
  const { director, calls } = harness({ confirmAccepted: false, outcome: 'block' });
  const result = resolve(director);
  assert.equal(result.event.type, 'block-reacted');
  assert.ok(calls.includes('confirmParry'));
  // The resolution used block's staleness window, because the parry did not confirm.
  assert.equal(result.combatResult.guardIntentAgeMs, GUARD_INTENT_AGE_MS.block);
});

test('R18S.4 no contact latches nothing, and a second contact cannot happen', () => {
  const { director } = harness();
  const missed = director.resolveContact({
    ...missingBlades(),
    deltaSeconds: 1 / 60,
    attackSnapshot: ATTACK_SNAPSHOT,
    selectedMode: 'parry',
    selectedDirection: 'right',
    shieldLeadMotion: null,
  });
  assert.equal(missed.contacted, false);
  assert.equal(director.firstContact, null);

  resolve(director);
  assert.ok(director.firstContact);
  assert.equal(resolve(director), null, 'the first contact is latched for the exchange');
});

test('R18S.4 while the constraint owns the arm, the body runs latched and interruption held', () => {
  const { director, calls } = harness();
  resolve(director);
  const live = director.advanceCombat({ deltaSeconds: 1 / 60, deltaMs: 16.7 });
  assert.equal(live.liveConstraintNeedsUpdate, true);
  assert.ok(calls.includes('trackExcitation'), 'the release excitation is tracked during the hold');
  assert.ok(calls.some((entry) => entry === 'updateCombat:0.016666666666666666:live'));
  assert.equal(live.armJoined, null);
  assert.equal(live.attackerReaction, null, 'the reaction writers wait for the release');
});

test('R18S.4 release is gated on the defender having visibly finished the parry', () => {
  const { director } = harness({ guardState: GUARD_STATES.HOLD });
  resolve(director);
  const held = director.releaseToOldB3({ selectedDirection: 'right', gripReport: { accepted: true } });
  assert.equal(held.accepted, false);
  assert.equal(held.reason, 'defender-deflect-marker-not-reached');
  assert.equal(director.ownsLiveContact(), true, 'the constraint keeps the arm until the marker');
});

test('R18S.4 the defender gate latches once passed and stays latched', () => {
  const { director } = harness();
  assert.equal(director.defenderReleaseGate().latched, false);
  const { gate } = director.advanceDefender();
  assert.equal(gate.latched, true);
  assert.equal(director.defenderReleaseGate().latched, true);
  assert.equal(director.latchedDefenderGate.authority, 'latched-defender-deflect-marker-gates-attacker-release');
});

test('R18S.4 reset returns the lifecycle to before-first-contact', () => {
  const { director, calls } = harness();
  resolve(director);
  assert.ok(director.transfer);
  director.reset();
  assert.ok(calls.includes('reactionReset'));
  assert.equal(director.firstContact, null);
  assert.equal(director.transfer, null);
  assert.equal(director.ownsLiveContact(), false);
  assert.ok(resolve(director), 'a new exchange can contact again');
});

test('R18S.4 the lab keeps presentation and words, and no state transition of its own', async () => {
  const controller = await readFile(
    new URL('../tools/action-studio/shield-parry-r281/contact-handoff-controller.js', import.meta.url),
    'utf8',
  );
  assert.match(controller, /createContactLifecycleDirector\(\{/);
  for (const escaped of [
    'probeSweptSwordBucklerContact',
    'evaluateSweptContactTemporalEligibility',
    'buildLiveParryOldB3Handoff',
    'publishPostCouplingRecoilStaggerHandoff',
    'swordGripConstraint\\.start',
    'parryGate\\.confirm\\(\\{',
    'combat\\.resolveContact\\(\\{',
    'releasedToOldB3: true',
  ]) {
    assert.doesNotMatch(controller, new RegExp(escaped), `state transition left behind in the lab: ${escaped}`);
  }
  // What it keeps is its own: publishing, repaints, and the status vocabulary.
  assert.match(controller, /publishStatus\(\{/);
  assert.match(controller, /exchangeState\.step3AContactTransfer = lifecycleDirector\.transfer/);
});

test('R18W.2 the moving-shield solve measures its own translation when nothing hands it one', () => {
  // The relative solve was written for Parry, which is handed a shield translation by the lead
  // motion sampler. Guard has no sampler, so in BLOCK mode shieldLeadMotion is null and the solve
  // was silently inert -- in the one mode where the shield does most of its travelling. Measured
  // in the lab: it fired 0/12 on every direction in BLOCK before this, 12/12 on TOP and RIGHT
  // after. It stays observer-only either way; nothing reads it to decide a contact.
  const { director, moveShield } = harness();
  const miss = () => director.resolveContact({
    ...missingBlades(), deltaSeconds: 1 / 60, attackSnapshot: ATTACK_SNAPSHOT,
    selectedMode: 'block', selectedDirection: 'left', shieldLeadMotion: null,
  });

  // Nothing to compare against on the very first resolve.
  assert.equal(miss().contactEvaluation.diagnostics?.relativeMovingShieldTranslation ?? null, null);

  moveShield(0.03, 0, 0);
  const solve = miss().contactEvaluation.diagnostics?.relativeMovingShieldTranslation;
  assert.ok(solve, 'a guard-mode resolve must still produce the moving-shield solve');
  assert.equal(solve.translationSource, 'director-measured');
  assert.ok(Math.abs(solve.shieldTranslationMeters - 0.03) < 1e-9);
  assert.deepEqual({ ...solve.shieldTranslation }, { x: 0.03, y: 0, z: 0 });
  assert.match(solve.authority, /observer-only/);
});

test('R18W.2 a supplied parry translation still wins, and reset forgets where the shield was', () => {
  const { director, moveShield } = harness();
  director.resolveContact({
    ...missingBlades(), deltaSeconds: 1 / 60, attackSnapshot: ATTACK_SNAPSHOT,
    selectedMode: 'block', selectedDirection: 'left', shieldLeadMotion: null,
  });
  moveShield(0.03, 0, 0);
  const led = director.resolveContact({
    ...missingBlades(), deltaSeconds: 1 / 60, attackSnapshot: ATTACK_SNAPSHOT,
    selectedMode: 'parry', selectedDirection: 'left',
    shieldLeadMotion: { translation: { x: 0.11, y: 0, z: 0 } },
  });
  const solve = led.contactEvaluation.diagnostics.relativeMovingShieldTranslation;
  assert.equal(solve.translationSource, 'parry-lead-sampler');
  assert.ok(Math.abs(solve.shieldTranslationMeters - 0.11) < 1e-9);

  // A centre left over across a reset would invent a translation the shield never made.
  director.reset();
  moveShield(0.5, 0, 0);
  const afterReset = director.resolveContact({
    ...missingBlades(), deltaSeconds: 1 / 60, attackSnapshot: ATTACK_SNAPSHOT,
    selectedMode: 'block', selectedDirection: 'left', shieldLeadMotion: null,
  });
  assert.equal(afterReset.contactEvaluation.diagnostics?.relativeMovingShieldTranslation ?? null, null);
});
