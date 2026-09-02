import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OPPONENT_GUARD_PROFILE, decideOpponentGuard, planOpponentParry } from '../src/combat/opponent-guard.js';
import { createOpponentGuardRuntime } from '../src/game/opponent-guard-runtime.js';
import { createOpponentDriveController } from '../tools/action-studio/shield-parry-r281/opponent-drive-controller.js';
import { COMMITTED_PARRY_CONTACT_GATE_PROFILE as COMMITTED_PARRY_INPUT_PROFILE } from '../src/combat/committed-parry-contact-gate.js';

// R23X.1 - the opponent parries (step 6d).
//
// Measured with an armer that fires on an exact sim frame, mirroring the player's block-mode raise
// against the player's swing: armed at 0.12s before contact, TOP, RIGHT and LEFT all resolved
// `parry`, the player was staggered, and the drive's next swing landed on them 0.75s later. Across
// the gate's window the other cells were whiffs, never hits - a mis-framed attempt costs nothing.

const swing = (ttc, sequence = 1) => ({ active: true, sequence, elapsedSeconds: 0.43 - ttc, direction: 'top', timeToContactSeconds: ttc });

test('R23X.1 the arming margin sits inside the gate\'s own window', () => {
  assert.ok(OPPONENT_GUARD_PROFILE.parryArmTtcSeconds < COMMITTED_PARRY_INPUT_PROFILE.earliestInputTtcSeconds);
  assert.ok(OPPONENT_GUARD_PROFILE.parryArmTtcSeconds > COMMITTED_PARRY_INPUT_PROFILE.latestInputTtcSeconds);
  assert.ok(OPPONENT_GUARD_PROFILE.parryChance > 0 && OPPONENT_GUARD_PROFILE.parryChance < 1);
});

test('R23X.1 a parry is a second draw on a read swing, never on an unread one', () => {
  const rolls = (values) => { let i = 0; return () => values[i++]; };
  const profile = { coverChance: 0.6, parryChance: 0.35, reactionSeconds: 0.18, parryArmTtcSeconds: 0.12 };
  assert.deepEqual([decideOpponentGuard(rolls([0.1, 0.1]), profile)].map((d) => [d.willCover, d.willParry]), [[true, true]]);
  assert.deepEqual([decideOpponentGuard(rolls([0.1, 0.9]), profile)].map((d) => [d.willCover, d.willParry]), [[true, false]]);
  assert.deepEqual([decideOpponentGuard(rolls([0.9, 0.1]), profile)].map((d) => [d.willCover, d.willParry]), [[false, false]], 'no read, no parry');
  assert.equal(decideOpponentGuard(null, profile).willParry, false);
});

test('R23X.1 the plan arms once, only with the shield already in the sector, only inside the margin', () => {
  const parries = { willCover: true, willParry: true, parryArmTtcSeconds: 0.12 };
  const pick = (p) => [p.arm, p.reason];
  assert.deepEqual(pick(planOpponentParry({ threat: null, decision: parries })), [false, 'no-swing-to-parry']);
  assert.deepEqual(pick(planOpponentParry({ threat: swing(0.1), decision: { willCover: true, willParry: false } })), [false, 'this-swing-is-blocked-not-parried']);
  assert.deepEqual(pick(planOpponentParry({ threat: swing(0.1), decision: parries, shieldInSector: false })), [false, 'shield-not-yet-in-the-sector']);
  assert.deepEqual(pick(planOpponentParry({ threat: swing(0.2), decision: parries, shieldInSector: true })), [false, 'blade-not-yet-inside-the-arming-margin']);
  assert.deepEqual(pick(planOpponentParry({ threat: swing(0.12), decision: parries, shieldInSector: true })), [true, 'arm-the-parry-now']);
  assert.deepEqual(pick(planOpponentParry({ threat: swing(0.1), decision: parries, shieldInSector: true, alreadyArmed: true })), [false, 'already-armed-for-this-swing']);
});

test('R23X.1 the runtime arms exactly once per swing, after the read has moved the shield', () => {
  const runtime = createOpponentGuardRuntime({ seed: 5, profile: { coverChance: 1, parryChance: 1, reactionSeconds: 0.18, parryArmTtcSeconds: 0.12, restSector: 'top' } });
  const armed = [];
  for (const ttc of [0.40, 0.30, 0.20, 0.15, 0.12, 0.10, 0.08]) {
    runtime.frame({ threat: { active: true, sequence: 1, elapsedSeconds: 0.43 - ttc, direction: 'right', timeToContactSeconds: ttc } });
    if (runtime.parry.arm) armed.push(ttc);
  }
  assert.deepEqual(armed, [0.12], 'once, on the first frame inside the margin');
  assert.equal(runtime.report.parriesArmed, 1);
  assert.equal(runtime.report.sector, 'left', 'the read moved the shield before the arm');
  runtime.frame({ threat: null });
  // A second swing: seen early, the read is still reacting and the shield is not in the sector yet,
  // so nothing arms; once the read has moved the shield and the blade is inside the margin, it arms.
  runtime.frame({ threat: { active: true, sequence: 2, elapsedSeconds: 0.1, direction: 'top', timeToContactSeconds: 0.33 } });
  assert.equal(runtime.parry.arm, false, 'still reacting - the shield has not moved');
  runtime.frame({ threat: { active: true, sequence: 2, elapsedSeconds: 0.35, direction: 'top', timeToContactSeconds: 0.08 } });
  assert.equal(runtime.parry.arm, true);
  assert.equal(runtime.report.parriesArmed, 2);
});

test('R23X.1 the drive calls the parry verb on the frame the plan arms it, and the summary counts it', () => {
  const verbs = [];
  let threat = null;
  const controller = createOpponentDriveController({
    toggle: { checked: true },
    laneController: { report: { separationMeters: 2.4 }, setAttackerIntent() {} },
    startAttack: () => false,
    readAttackAvailable: () => false,
    guardRuntime: createOpponentGuardRuntime({ seed: 3, profile: { coverChance: 1, parryChance: 1, reactionSeconds: 0, parryArmTtcSeconds: 0.12, restSector: 'top' } }),
    readThreat: () => threat,
    readOwnSwinging: () => false,
    applyGuard: () => {},
    applyParry: () => verbs.push('parry'),
  });
  threat = { active: true, sequence: 1, elapsedSeconds: 0.1, direction: 'left', timeToContactSeconds: 0.33 }; controller.frame(16);
  threat = { active: true, sequence: 1, elapsedSeconds: 0.32, direction: 'left', timeToContactSeconds: 0.11 }; controller.frame(16);
  threat = { active: true, sequence: 1, elapsedSeconds: 0.34, direction: 'left', timeToContactSeconds: 0.09 }; controller.frame(16);
  assert.deepEqual(verbs, ['parry']);
  assert.match(controller.summary, /parry 1$/);
});

test('R23X.1 the lab arms the opponent\'s gate the way the player\'s raise arms theirs, and the threat carries the time to contact', () => {
  const entry = readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
  const parryModule = readFileSync(new URL('../tools/action-studio/shield-parry-r281/opponent-parry.js', import.meta.url), 'utf8');
  assert.match(parryModule, /ex\.latestParryInput = opponentFighter\.parryGate\.arm\(\{ attackSnapshot: snapshot, manual: true, source, aimedSector: opponentFighter\.guardSector\.sector \}\);/);
  assert.match(parryModule, /playerEngagement\.preContact\.armActiveIntercept\(snapshot\);\n\s*opponentFighter\.predictivePresentation\.start\(/);
  assert.match(entry, /applyParry: \(\) => opponentParry\.arm\(\),/);
  // A swing owns the lane until its action is gone, not until `active` ends: a parried swing's
  // active ends at the parry, and the punish that started in the gap ended the wrong exchange.
  // Measured twice: the drive's frame runs before the player's falling edge, so the gate also waits
  // for that unprocessed edge (playerWasSwinging) - otherwise the punish started on the very frame
  // the action dropped, the edge then ended the OPPONENT's exchange and the log settled the wrong line.
  assert.match(entry, /playerEngagement\?\.attackRuntime\.active \|\| playerEngagement\?\.combat\.active \|\| playerEngagement\?\.attackRuntime\.snapshot\?\.action \|\| playerWasSwinging/);
  assert.match(entry, /readOpponentMidExchange: \(\) => combat\.active \|\| attackRuntime\.active \|\| Boolean\(attackRuntime\.snapshot\?\.action\) \|\| opponentWasSwinging/);
  assert.match(entry, /timeToContactSeconds: Number\(s\.action\.runtime\?\.contactSeconds\) - s\.elapsedSeconds \}/);
});
