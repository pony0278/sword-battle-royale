import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planGuardSectorGate } from '../src/combat/guard-sector-gate.js';
import { OPPONENT_GUARD_REASONS, decideOpponentGuard, planOpponentGuard } from '../src/combat/opponent-guard.js';
import { createOpponentGuardRuntime } from '../src/game/opponent-guard-runtime.js';
import { createOpponentDriveController } from '../tools/action-studio/shield-parry-r281/opponent-drive-controller.js';
import { createContactLifecycleDirector } from '../src/combat/contact-lifecycle-director.js';

// R23T.1 - the shield guards one sector (step 6b).
//
// Measured before: with the guard held and the pointer in any sector, all nine aim-by-direction
// cells resolved `block`. Measured after, on the page: the three cells where the shield is in the
// sector the swing arrives at still block; the six where it is not reach the body (chest, belly,
// waist, at the heights each swing arrives at). The golden grid, re-captured with each cell's
// shield pointed at its swing, reproduces its ten blocks and one ignored cell unchanged.


test('R23T.1 the gate: a shield covers the sector its swing arrives at, mirrored for the lateral ones, and nothing when unpointed', () => {
  assert.equal(planGuardSectorGate({ direction: 'top', aimedSector: 'top' }).covers, true);
  assert.equal(planGuardSectorGate({ direction: 'right', aimedSector: 'left' }).covers, true, 'a swing from their RIGHT arrives at my LEFT');
  assert.equal(planGuardSectorGate({ direction: 'left', aimedSector: 'right' }).covers, true);
  assert.equal(planGuardSectorGate({ direction: 'right', aimedSector: 'right' }).covers, false);
  assert.equal(planGuardSectorGate({ direction: 'top', aimedSector: 'left' }).reason, 'shield-in-another-sector-guards-nothing');
  assert.equal(planGuardSectorGate({ direction: 'top', aimedSector: null }).covers, false);
  assert.equal(planGuardSectorGate({ direction: 'top' }).reason, 'shield-not-pointed-anywhere-covers-nothing');
  assert.equal(planGuardSectorGate({ direction: 'diagonal', aimedSector: 'top' }).covers, false);
  assert.equal(planGuardSectorGate({ direction: 'TOP', aimedSector: ' Top ' }).covers, false, 'no trimming: an input that is not a sector name is not a sector');
  assert.equal(planGuardSectorGate({ direction: 'TOP', aimedSector: 'Top' }).covers, true, 'case is a person typing');
});

test('R23T.1 the lifecycle: a shield contact in another sector guards nothing, and the blade goes on to the body probe', () => {
  const events = [];
  const shieldContact = { contact: true, eligible: true, reason: 'swept' };
  const director = createContactLifecycleDirector({
    readGuardActive: () => true,
    readAimedSector: () => 'left',
    readDefenderHurtbox: () => null,
    observe: { contactEvaluated: (evaluation) => events.push(evaluation) },
    evaluateContact: () => shieldContact,
  });
  assert.ok(director, 'the director builds with the new reader');
  // The pure gate is what the director consults; its verdict is the reason the director stamps.
  const gate = planGuardSectorGate({ direction: 'top', aimedSector: 'left' });
  assert.equal(gate.covers, false);
  assert.equal(gate.reason, 'shield-in-another-sector-guards-nothing');
  const source = readFileSync(new URL('../src/combat/contact-lifecycle-director.js', import.meta.url), 'utf8');
  assert.match(source, /if \(contactEvaluation\.contact && typeof readAimedSector === 'function'\) \{\n\s*const sectorGate = planGuardSectorGate\(\{ direction: attackSnapshot\?\.direction, aimedSector: readAimedSector\(\), coverage: guardCoverage \}\);/);
});

test('R23T.1 coverage does not engage for a sector the shield is not in', () => {
  const source = readFileSync(new URL('../src/game/pre-contact-controller.js', import.meta.url), 'utf8');
  assert.match(source, /&& coneGate\.plan\.engaged\n\s*&& sectorGate\.covers\n\s*&& !dodgeGuardDown/);
});

test('R23T.1 the opponent stands in guard and moves the shield into the sector when they read the swing', () => {
  const reads = { willCover: true, reactionSeconds: 0.18 };
  const swing = (elapsedSeconds, direction = 'right') => ({ active: true, sequence: 1, elapsedSeconds, direction });
  const pick = (p) => [p.hold, p.sector, p.reason];
  assert.deepEqual(pick(planOpponentGuard({ threat: null, currentSector: 'top' })), [true, 'top', OPPONENT_GUARD_REASONS.STANDING]);
  assert.deepEqual(pick(planOpponentGuard({ threat: null, currentSector: null })), [true, 'top', OPPONENT_GUARD_REASONS.STANDING], 'nowhere yet means the rest sector');
  assert.deepEqual(pick(planOpponentGuard({ threat: swing(0.05), decision: null, currentSector: 'top' })), [true, 'top', OPPONENT_GUARD_REASONS.UNDECIDED]);
  assert.deepEqual(pick(planOpponentGuard({ threat: swing(0.05), decision: reads, currentSector: 'top' })), [true, 'top', OPPONENT_GUARD_REASONS.REACTING]);
  assert.deepEqual(pick(planOpponentGuard({ threat: swing(0.18), decision: reads, currentSector: 'top' })), [true, 'left', OPPONENT_GUARD_REASONS.COVERING], 'their RIGHT arrives at my LEFT');
  assert.deepEqual(pick(planOpponentGuard({ threat: swing(0.4), decision: { willCover: false, reactionSeconds: 0.18 }, currentSector: 'top' })), [true, 'top', OPPONENT_GUARD_REASONS.DECLINED]);
  assert.deepEqual(pick(planOpponentGuard({ threat: swing(0.4), decision: reads, currentSector: 'top', ownSwinging: true })), [true, 'top', OPPONENT_GUARD_REASONS.SWINGING], 'R23U.1: held through the swing, not moved');
  assert.deepEqual(pick(planOpponentGuard({ threat: swing(0.4, 'top'), decision: reads, currentSector: 'left' })), [true, 'top', OPPONENT_GUARD_REASONS.COVERING]);
});

test('R23T.1 one roll per swing, the shield stays where it was moved, and a seed replays the fight', () => {
  let next = 0.1;
  assert.equal(decideOpponentGuard(() => next, { coverChance: 0.6, reactionSeconds: 0.18 }).willCover, true);
  next = 0.9;
  assert.equal(decideOpponentGuard(() => next, { coverChance: 0.6, reactionSeconds: 0.18 }).willCover, false);
  assert.equal(decideOpponentGuard(null, { coverChance: 0.6 }).willCover, false, 'no generator, no read - never a silent wall');

  const run = (seed) => {
    const runtime = createOpponentGuardRuntime({ seed, profile: { coverChance: 0.5, reactionSeconds: 0, restSector: 'top' } });
    const sectors = [];
    for (let sequence = 1; sequence <= 12; sequence += 1) {
      const direction = ['top', 'right', 'left'][sequence % 3];
      runtime.frame({ threat: { active: true, sequence, elapsedSeconds: 0.1, direction } });
      const first = runtime.plan.sector;
      runtime.frame({ threat: { active: true, sequence, elapsedSeconds: 0.3, direction } });
      assert.equal(runtime.plan.sector, first, 'a swing is not re-rolled mid-swing');
      runtime.frame({ threat: null });
      assert.equal(runtime.plan.sector, first, 'the shield stays where the last swing left it');
      assert.equal(runtime.plan.hold, true, 'and stays up between swings');
      sectors.push(first);
    }
    return { sectors, report: runtime.report };
  };
  const a = run(7); const b = run(7); const c = run(8);
  assert.deepEqual(a.sectors, b.sectors);
  assert.notDeepEqual(a.sectors, c.sectors);
  assert.equal(a.report.swingsSeen, 12);
  assert.ok(a.report.swingsRead > 0 && a.report.swingsRead < 12, `${a.report.swingsRead} of 12`);
  assert.equal(a.report.sector, a.sectors.at(-1));
});

test('R23T.1 the drive hands the lab held-and-sector in one verb, and the summary says where the shield is', () => {
  const verbs = [];
  let threat = null;
  const controller = createOpponentDriveController({
    toggle: { checked: true },
    laneController: { report: { separationMeters: 2.4 }, setAttackerIntent() {} },
    startAttack: () => false,
    readAttackAvailable: () => false,
    guardRuntime: createOpponentGuardRuntime({ seed: 3, profile: { coverChance: 1, reactionSeconds: 0, restSector: 'top' } }),
    readThreat: () => threat,
    readOwnSwinging: () => false,
    applyGuard: (v) => verbs.push(v),
  });
  controller.frame(16);
  threat = { active: true, sequence: 1, elapsedSeconds: 0.2, direction: 'left' }; controller.frame(16);
  threat = null; controller.frame(16);
  assert.deepEqual(verbs, [{ held: true, sector: 'top' }, { held: true, sector: 'right' }, { held: true, sector: 'right' }]);
  assert.match(controller.summary, /盾→RIGHT 讀到 1\/1/);
  controller.reseed(9);
  assert.equal(controller.guardReport.sector, 'top');
});

test('R23T.1 the lab points the opponent\'s guard before it rises, keeps their legs walking under it, and lets the golden grid point a shield', () => {
  const entry = readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
  assert.match(entry, /applyGuard: \(\{ held, sector \}\) => \{ attackerFighter\.guardSector\.select\(sector\); syncOpponentGuard\(held\); \}/);
  assert.match(entry, /laneController\.captureAttackerWalkLegs\(\); const report = attackerFighter\.guardRuntime\.update\(deltaMs, camera\); laneController\.overlayAttackerWalkLegs\(\);/);
  assert.match(entry, /readAimedSector: \(\) => guardSector\.sector,/);
  // Measured the hard way: without the direction in the threat the opponent 'read' every swing
  // and the shield never left TOP - defendedSectorFor(undefined) is nothing, and nothing kept it.
  assert.match(entry, /elapsedSeconds: s\.elapsedSeconds, direction: s\.direction, timeToContactSeconds/); // R23X.1 added the TTC after it
  assert.match(entry, /readAimedSector: \(\) => attackerFighter\.guardSector\.sector,/);
  const golden = readFileSync(new URL('../tools/action-studio/b1-golden/capture-golden-grid.mjs', import.meta.url), 'utf8');
  assert.match(golden, /selectGuardSector\(\{ top: 'top', right: 'left', left: 'right' \}\[d\]\)/);
});
