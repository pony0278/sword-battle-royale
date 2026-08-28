import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  RECOIL_PRESENTATION_AUTHORITY_STAGE,
  getLockedRhythmGuardIntentAgeMs,
} from '../src/combat/predictive-intercept-parry.js';
import {
  TWO_ACTOR_RECOIL_PRESENTATION_AUTHORITY_STAGE,
  createTwoActorCombatIntegration,
} from '../src/combat/two-actor-combat-integration.js';
import {
  createLongswordDirectionalAttackRuntime,
  LONGSWORD_ATTACK_PHASES,
} from '../src/combat/longsword-directional-attack-runtime.js';
import {
  createGuardStateMachine,
  GUARD_EVENTS,
} from '../src/combat/guard-state-machine.js';

function authoritativeContact() {
  return Object.freeze({
    contact: true,
    geometricContact: true,
    eligible: true,
    point: Object.freeze({ x: 0.1, y: 1.1, z: 0.2 }),
    incomingVelocity: Object.freeze({ x: 4.6, y: -0.3, z: 2.1 }),
    radialDistance: 0.08,
    bladeFraction: 0.62,
    sweepAlpha: 0.45,
  });
}

function createFakeRecoil() {
  let activePlan = null;
  let updates = 0;
  return {
    get active() { return Boolean(activePlan); },
    get snapshot() { return Object.freeze({ active: Boolean(activePlan), plan: activePlan, updates }); },
    start(plan) {
      activePlan = plan;
      updates = 0;
      return Object.freeze({ accepted: true, snapshot: this.snapshot });
    },
    update() {
      updates += 1;
      return Object.freeze({ justCompleted: false, sample: { phase: 'recoil' }, snapshot: this.snapshot });
    },
    reset() {
      activePlan = null;
      updates = 0;
      return this.snapshot;
    },
  };
}

test('G4.3B.5R.2.3 locks rhythm intent inside the requested authoritative grade', () => {
  assert.equal(RECOIL_PRESENTATION_AUTHORITY_STAGE, 'G4.3B.5R.2.3');
  // R19F.1: the canonical prompt moved to the input-window edge (180ms), so the locked intent
  // age the rhythm grade carries moved with it.
  assert.equal(getLockedRhythmGuardIntentAgeMs('parry'), 180);
  assert.equal(getLockedRhythmGuardIntentAgeMs('perfect'), 65);
  assert.equal(getLockedRhythmGuardIntentAgeMs('parry', { normalTriggerTtcSeconds: 0.04 }), 76);
  assert.equal(getLockedRhythmGuardIntentAgeMs('parry', { normalTriggerTtcSeconds: 0.24 }), 180);
  assert.equal(getLockedRhythmGuardIntentAgeMs('perfect', { perfectTriggerTtcSeconds: 0.12 }), 75);
});

test('G4.3B.5R.2.3 predictive handoff keeps presentation elapsed separate from locked gameplay intent', () => {
  const source = fs.readFileSync(new URL('../src/combat/predictive-intercept-parry.js', import.meta.url), 'utf8');
  assert.match(source, /lockedGuardIntentAgeMs/);
  assert.match(source, /presentationElapsedMs: report\.presentationElapsedMs/);
  assert.match(source, /guardIntentAgeMs: report\.lockedGuardIntentAgeMs/);
  assert.match(source, /rhythm-trigger-locked-until-authoritative-contact/);
});

test('G4.3B.5R.2.3 refreshes attacker presentation after additive recoil mutates the rig', () => {
  const attackRuntime = createLongswordDirectionalAttackRuntime();
  const guardMachine = createGuardStateMachine();
  guardMachine.send(GUARD_EVENTS.GUARD_PRESS);
  guardMachine.send(GUARD_EVENTS.ENTER_COMPLETE);
  const attackerRecoil = createFakeRecoil();
  let appearanceRefreshes = 0;
  const attackerCharacter = {
    update(deltaSeconds) {
      assert.equal(deltaSeconds, 0);
      appearanceRefreshes += 1;
    },
  };
  const integration = createTwoActorCombatIntegration({
    attackRuntime,
    guardMachine,
    attackerRecoil,
    attackerCharacter,
    sampleFrozenContactPose() {},
  });

  const started = integration.startAttack('right');
  assert.equal(started.accepted, true);
  const profile = attackRuntime.snapshot.action.runtime;
  attackRuntime.update(profile.activeStartSeconds * 1000 + 1);
  assert.equal(attackRuntime.snapshot.phase, LONGSWORD_ATTACK_PHASES.ACTIVE);
  const resolved = integration.resolveContact({ contact: authoritativeContact(), guardIntentAgeMs: 120 });
  assert.equal(resolved.accepted, true);
  assert.equal(resolved.resolution.outcome, 'parry');

  const frame = integration.update(0.03, { camera: {} });
  assert.equal(TWO_ACTOR_RECOIL_PRESENTATION_AUTHORITY_STAGE, 'G4.3B.5R.2.3');
  assert.equal(frame.attackerVisualRefreshApplied, true);
  assert.equal(appearanceRefreshes, 1);
});

test('G4.3B.5R.2.3+ lab keeps requested/actual and visual-refresh authority visible after Block split', () => {
  const labSource = fs.readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab.js', import.meta.url), 'utf8');
  assert.match(labSource, /Requested: \$\{requested\.toUpperCase\(\)\} · Actual: \$\{actual\.toUpperCase\(\)\}/);
  assert.match(labSource, /DOWNGRADED\/MISMATCH/);
  assert.match(labSource, /latestPredictiveHandoff/);
  assert.match(labSource, /attackerVisualRefreshApplied/);
  assert.match(labSource, /postCouplingStage/);
});
