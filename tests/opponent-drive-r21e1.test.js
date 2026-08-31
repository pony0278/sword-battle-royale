import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  MEASURED_ATTACK_CADENCE_FLOOR_MS,
  MEASURED_OPPONENT_THREAT_CEILING_METERS,
  OPPONENT_DRIVE_PROFILE,
  OPPONENT_ENGAGEMENT_BAND_METERS,
  createOpponentDirectionSequence,
  createSeededRandom,
  drawRestIntervalMs,
  planOpponentDrive,
} from '../src/combat/opponent-drive.js';
import { createOpponentDriveRuntime } from '../src/game/opponent-drive-runtime.js';
import { ATTACK_ADVANCE_PROFILES } from '../src/combat/attack-advance.js';
import {
  CALIBRATED_ENGAGEMENT_SEPARATION_METERS,
  MEASURED_UNDEFENDED_BODY_REACH_METERS,
  effectiveSeparationAtContact,
} from '../src/combat/engagement-spacing.js';
import { LONGSWORD_ATTACK_DIRECTIONS } from '../src/combat/longsword-directional-metadata.js';
import { LANE_LOCOMOTION_PROFILE } from '../src/combat/lane-locomotion.js';

const DIRECTIONS = ['top', 'right', 'left'];

test('R21E.1 the band stays inside every direction it must threaten', () => {
  const band = OPPONENT_ENGAGEMENT_BAND_METERS;
  const ceiling = MEASURED_OPPONENT_THREAT_CEILING_METERS;
  for (const direction of DIRECTIONS) {
    assert.ok(band.maximum <= ceiling[direction], `${direction} is theatre past its ceiling`);
    assert.ok(ceiling[direction] <= ceiling.testedRange.maximum, direction);
  }
  assert.ok(band.minimum < band.preferred && band.preferred < band.maximum);
  // The preferred distance is the calibrated one, and that is a claim the reach has to support.
  assert.equal(band.preferred, CALIBRATED_ENGAGEMENT_SEPARATION_METERS);
});

test('R21E.1 all three directions strike the body from the preferred distance', () => {
  for (const direction of DIRECTIONS) {
    const start = OPPONENT_ENGAGEMENT_BAND_METERS.preferred;
    assert.ok(start <= MEASURED_UNDEFENDED_BODY_REACH_METERS[direction], direction);
    const contact = effectiveSeparationAtContact(start, ATTACK_ADVANCE_PROFILES[direction].metersByContact);
    // The measured contact separations at 2.40m: 1.54 / 1.74 / 1.95m.
    assert.ok(contact > 1.5 && contact < 2.0, `${direction} contacts at ${contact}`);
  }
});

test('R21E.1 the sign of the offset is the intent: -1 closes, +1 opens', () => {
  const band = OPPONENT_ENGAGEMENT_BAND_METERS;
  assert.equal(planOpponentDrive({ separationMeters: band.preferred + 0.9 }).intent, -1);
  assert.equal(planOpponentDrive({ separationMeters: band.preferred - 0.9 }).intent, 1);
  assert.equal(planOpponentDrive({ separationMeters: band.preferred }).intent, 0);
});

test('R21E.1 spacing is a precondition of the swing, not a race against it', () => {
  const rested = { attackAvailable: true, restedMs: 5000, restTargetMs: 100, nextDirection: 'right' };
  const inBand = planOpponentDrive({ ...rested, separationMeters: OPPONENT_ENGAGEMENT_BAND_METERS.preferred });
  assert.equal(inBand.attack, 'right');
  const tooClose = planOpponentDrive({ ...rested, separationMeters: 1.6 });
  assert.equal(tooClose.attack, null);
  assert.equal(tooClose.reason, 'backing-off-to-band');
  assert.equal(tooClose.intent, 1);
});

test('R21E.1 RIGHT is why spacing gates the swing: its gate reopens before the walk-back finishes', () => {
  // The measured reason the rule above is not paranoia. RIGHT spends 0.663m of advance and keeps
  // it; backing that out at the opening speed takes longer than RIGHT's own cadence floor, so a
  // drive that swung on the clock alone would throw RIGHT from inside the band every time.
  const walkBackMs = (ATTACK_ADVANCE_PROFILES.right.metersByContact / LANE_LOCOMOTION_PROFILE.backwardSpeedMps) * 1000;
  assert.ok(walkBackMs > MEASURED_ATTACK_CADENCE_FLOOR_MS.right, `${walkBackMs}ms vs ${MEASURED_ATTACK_CADENCE_FLOOR_MS.right}ms`);
  // TOP and LEFT are the other way round, which is why this is a per-direction fact and not a rule.
  for (const direction of ['top', 'left']) {
    const ms = (ATTACK_ADVANCE_PROFILES[direction].metersByContact / LANE_LOCOMOTION_PROFILE.backwardSpeedMps) * 1000;
    assert.ok(ms < MEASURED_ATTACK_CADENCE_FLOOR_MS[direction], direction);
  }
});

test('R21E.1 the fixed 700ms auto-repeat was under TOP\'s floor, which is why it was not a cadence', () => {
  assert.ok(MEASURED_ATTACK_CADENCE_FLOOR_MS.top > 700);
  assert.ok(MEASURED_ATTACK_CADENCE_FLOOR_MS.right < 700);
});

test('R21E.1 a closed attack gate is never attacked through, however long the rest', () => {
  const plan = planOpponentDrive({
    attackAvailable: false, restedMs: 99999, restTargetMs: 0,
    nextDirection: 'top', separationMeters: OPPONENT_ENGAGEMENT_BAND_METERS.preferred,
  });
  assert.equal(plan.attack, null);
  assert.equal(plan.reason, 'exchange-still-running');
});

test('R21E.1 the bag serves each direction exactly once per three, order seeded', () => {
  const sequence = createOpponentDirectionSequence(7);
  for (let round = 0; round < 40; round += 1) {
    const three = [sequence.next(), sequence.next(), sequence.next()].sort();
    assert.deepEqual(three, [...LONGSWORD_ATTACK_DIRECTIONS].sort(), `round ${round}`);
  }
  assert.equal(sequence.served, 120);
});

test('R21E.1 the same seed replays the same fight, a different one does not', () => {
  const draw = (seed) => {
    const sequence = createOpponentDirectionSequence(seed);
    return Array.from({ length: 30 }, () => sequence.next()).join(',');
  };
  assert.equal(draw(1234), draw(1234), 'a reported bug has to be replayable');
  assert.notEqual(draw(1234), draw(5678));
});

test('R21E.1 upcoming shows the next swing without spending it', () => {
  const sequence = createOpponentDirectionSequence(99);
  const peeked = sequence.upcoming;
  assert.equal(sequence.upcoming, peeked);
  assert.equal(sequence.served, 0);
  assert.equal(sequence.next(), peeked);
  assert.equal(sequence.served, 1);
});

test('R21E.1 the rest is drawn inside its measured range', () => {
  const random = createSeededRandom(5);
  for (let i = 0; i < 500; i += 1) {
    const ms = drawRestIntervalMs(random);
    assert.ok(ms >= OPPONENT_DRIVE_PROFILE.restIntervalMs.minimum);
    assert.ok(ms <= OPPONENT_DRIVE_PROFILE.restIntervalMs.maximum);
  }
});

test('R21E.1 the runtime banks no rest while an exchange is running', () => {
  const runtime = createOpponentDriveRuntime({ seed: 3 });
  const preferred = OPPONENT_ENGAGEMENT_BAND_METERS.preferred;
  runtime.frame({ deltaMs: 5000, separationMeters: preferred, attackAvailable: false });
  assert.equal(runtime.report.restedMs, 0, 'a long exchange is not credit toward the next swing');
  const opened = runtime.frame({ deltaMs: 16, separationMeters: preferred, attackAvailable: true });
  assert.ok(opened.restedMs <= 16, 'the rest starts when the gate opens');
});

test('R21E.1 the runtime eventually attacks, and only commits what the lab accepted', () => {
  const runtime = createOpponentDriveRuntime({ seed: 11 });
  const preferred = OPPONENT_ENGAGEMENT_BAND_METERS.preferred;
  let attack = null;
  for (let i = 0; i < 200 && !attack; i += 1) {
    attack = runtime.frame({ deltaMs: 16, separationMeters: preferred, attackAvailable: true }).attack;
  }
  assert.ok(LONGSWORD_ATTACK_DIRECTIONS.includes(attack));
  assert.equal(runtime.report.attacksServed, 0, 'planning is not spending');
  runtime.commit(attack);
  assert.equal(runtime.report.attacksServed, 1);
  assert.equal(runtime.report.lastDirection, attack);
  assert.equal(runtime.report.restedMs, 0, 'the rest restarts on the swing');
});

test('R21E.1 reseeding restarts the fight from the top', () => {
  const runtime = createOpponentDriveRuntime({ seed: 42 });
  const first = runtime.report.upcoming;
  runtime.commit(runtime.report.upcoming);
  runtime.reseed(42);
  assert.equal(runtime.report.upcoming, first);
  assert.equal(runtime.report.attacksServed, 0);
});

test('R21E.1 the drive owns no authority: it writes only the two verbs a tester uses', () => {
  const planner = readFileSync(new URL('../src/combat/opponent-drive.js', import.meta.url), 'utf8');
  const runtime = readFileSync(new URL('../src/game/opponent-drive-runtime.js', import.meta.url), 'utf8');
  const FORBIDDEN = ['parryGate', 'guardMachine', 'applyRigPose', 'renderer', 'exchangeState'];
  for (const [name, source] of [['planner', planner], ['runtime', runtime]]) {
    for (const forbidden of FORBIDDEN) {
      assert.ok(!source.includes(forbidden), `${name} must not reach into ${forbidden}`);
    }
  }
});

test('R21E.1 the lab drives the opponent before the walk, and never races auto-repeat', () => {
  const entry = readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
  const driveAt = entry.indexOf('opponentDriveController.frame(rawDeltaMs);');
  const walkAt = entry.indexOf('laneController.walk(rawDeltaMs / 1000');
  assert.ok(driveAt > 0 && walkAt > driveAt, 'the intent it sets must be spent the same frame');
  assert.ok(entry.includes("autoRepeat.checked && !opponentDrive?.checked"), 'one cadence at a time');
  // Off is genuinely off: the golden grid and the parry gate place the attacker by hand.
  const controller = readFileSync(new URL('../tools/action-studio/shield-parry-r281/opponent-drive-controller.js', import.meta.url), 'utf8');
  assert.ok(controller.includes('if (!enabled()) return null;'));
  // And it only ever writes the two verbs a tester's hands write.
  assert.ok(controller.includes('laneController.setAttackerIntent(plan.intent)'));
  assert.ok(controller.includes('startAttack(plan.attack)'));
});

test('R21E.1 hysteresis: it walks to the stated distance, not to the edge of tolerance', () => {
  const band = OPPONENT_ENGAGEMENT_BAND_METERS;
  const profile = OPPONENT_DRIVE_PROFILE;
  assert.ok(profile.arrivalToleranceMeters < profile.holdToleranceMeters, 'or it is one threshold again');
  // Mid-walk, just inside the old single threshold: keep going.
  const midWalk = planOpponentDrive({
    separationMeters: band.preferred - profile.holdToleranceMeters + 0.01, repositioning: true,
  });
  assert.equal(midWalk.repositioning, true);
  assert.notEqual(midWalk.intent, 0);
  assert.equal(midWalk.attack, null, 'and it does not swing from there');
  // Arrived.
  const arrived = planOpponentDrive({ separationMeters: band.preferred + 0.01, repositioning: true });
  assert.equal(arrived.repositioning, false);
  assert.equal(arrived.intent, 0);
  // Standing still, small drift is tolerated rather than chased.
  const drifting = planOpponentDrive({
    separationMeters: band.preferred + profile.holdToleranceMeters - 0.01, repositioning: false,
  });
  assert.equal(drifting.repositioning, false);
  assert.equal(drifting.intent, 0);
});

test('R21E.1 the runtime starts walking back on the same frame it swings', () => {
  const runtime = createOpponentDriveRuntime({ seed: 8 });
  const preferred = OPPONENT_ENGAGEMENT_BAND_METERS.preferred;
  let attack = null;
  for (let i = 0; i < 200 && !attack; i += 1) {
    attack = runtime.frame({ deltaMs: 16, separationMeters: preferred, attackAvailable: true }).attack;
  }
  assert.ok(attack);
  assert.equal(runtime.report.repositioning, false, 'it swung from a standstill');
  runtime.commit(attack);
  assert.equal(runtime.report.repositioning, true, 'the advance is spent, so the walk back starts now');
});
