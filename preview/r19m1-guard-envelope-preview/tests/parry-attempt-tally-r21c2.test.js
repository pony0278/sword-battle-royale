import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createParryAttemptTally, PARRY_ATTEMPT_TALLY_STAGE } from '../tools/action-studio/shield-parry-r281/parry-attempt-tally.js';

const report = (attackDirection, reason, sequence, accepted = false) => ({
  attackDirection, reason, sequence, accepted,
});

test('R21C.2 counts attempts per direction and why they missed', () => {
  assert.equal(PARRY_ATTEMPT_TALLY_STAGE, 'R21C.2');
  const tally = createParryAttemptTally();
  tally.record(report('right', 'parry-input-armed-awaiting-real-contact', 1, true));
  tally.record(report('right', 'parry-input-wrong-direction', 2));
  tally.record(report('right', 'parry-input-too-late', 3));
  tally.record(report('top', 'parry-input-unaimed', 4));

  const rows = tally.rows;
  // R21G.1 added thrown/noAnswer; with no swings recorded the denominator falls back to the
  // presses, which is what keeps this pre-R21G.1 reading of the split intact. R21G.3 split
  // mistimed into tooEarly/tooLate and kept mistimed as their derived total.
  const row = (extra) => ({
    thrown: 0, attempts: 0, armed: 0, wrongDirection: 0, unaimed: 0,
    tooEarly: 0, tooLate: 0, other: 0, noAnswer: 0, mistimed: 0,
    // R21M.1: these presses carry no aimed sector at all, so none of them is classified as
    // moved or unmoved - pointing nowhere says nothing about movement.
    pressesUnmoved: 0, pressesMoved: 0, misreadUnmoved: 0, misreadMoved: 0,
    // R21Q.1: what the swing did, counted on its own axis - a press graded "too early" may still
    // have put the shield in the way, and only this pair can say so.
    defended: 0, struck: 0, ...extra,
  });
  assert.deepEqual(rows.right, row({ thrown: 3, attempts: 3, armed: 1, wrongDirection: 1, tooLate: 1, mistimed: 1 }));
  assert.deepEqual(rows.top, row({ thrown: 1, attempts: 1, unaimed: 1 }));
  assert.deepEqual(rows.left, row());
  // The split is what makes the number actionable: wrong direction wants a more legible windup,
  // wrong moment wants a wider window, and a bare failure rate says only that it is hard.
  assert.match(tally.summary, /right 1\/3 \(1 方向\/1 太晚\)/);
  assert.match(tally.summary, /left —/);
});

test('R21C.2 a refused duplicate is not a second attempt', () => {
  // One arm per attack is the gate's own rule, so the refusal it returns is that rule speaking,
  // not a player trying again. Counting it would inflate every failure rate.
  const tally = createParryAttemptTally();
  tally.record(report('left', 'parry-input-wrong-direction', 7));
  tally.record(report('left', 'parry-input-already-used-for-attack', 7));
  tally.record(report('left', 'parry-input-wrong-direction', 7));
  assert.equal(tally.rows.left.attempts, 1);
  // A new sequence is a new attempt.
  tally.record(report('left', 'parry-input-wrong-direction', 8));
  assert.equal(tally.rows.left.attempts, 2);
});

test('R21C.2 ignores what it cannot attribute, and resets', () => {
  const tally = createParryAttemptTally();
  assert.equal(tally.record(null), null);
  assert.equal(tally.record(report('', 'parry-input-unaimed', 1)), null, 'no direction, nothing to count');
  assert.equal(tally.record(report('sideways', 'parry-input-unaimed', 2)), null);
  assert.equal(tally.rows.top.attempts, 0);
  tally.record(report('top', 'parry-input-armed-awaiting-real-contact', 3, true));
  assert.equal(tally.rows.top.armed, 1);
  tally.reset();
  assert.equal(tally.rows.top.attempts, 0);
});

test('R21G.1 the denominator is the swing, so an unanswered attack is visible', () => {
  const tally = createParryAttemptTally();
  // Three TOP swings; the player answers one and never touches the key for the other two. Before
  // R21G.1 this read "top 1/1" - a perfect record - because the two they could not react to left
  // no trace at all. That is the failure the tally most needs to find.
  for (let i = 0; i < 3; i += 1) tally.recordAttack('top');
  tally.record(report('top', 'parry-input-armed-awaiting-real-contact', 1, true));
  assert.equal(tally.rows.top.thrown, 3);
  assert.equal(tally.rows.top.noAnswer, 2);
  assert.match(tally.summary, /top 1\/3 \(2 沒答\)/);
});

test('R21G.1 every swing lands in exactly one bucket', () => {
  const tally = createParryAttemptTally();
  const reasons = [
    ['parry-input-armed-awaiting-real-contact', true],
    ['parry-input-wrong-direction', false],
    ['parry-input-too-late', false],
    ['parry-input-unaimed', false],
    ['something-else-entirely', false],
  ];
  let sequence = 0;
  for (const direction of ['top', 'right', 'left']) {
    for (const [reason, accepted] of reasons) {
      sequence += 1;
      tally.recordAttack(direction);
      tally.record(report(direction, reason, sequence, accepted));
    }
    tally.recordAttack(direction); // and one nobody answered
  }
  for (const [direction, row] of Object.entries(tally.rows)) {
    const bucketed = row.armed + row.wrongDirection + row.unaimed + row.mistimed + row.other + row.noAnswer;
    assert.equal(bucketed, row.thrown, `${direction}: ${bucketed} bucketed vs ${row.thrown} thrown`);
    assert.equal(row.thrown, 6, direction);
    assert.equal(row.noAnswer, 1, direction);
  }
});

test('R21G.1 switching the opponent on starts a fresh sample, and only the rising edge does', () => {
  const tally = createParryAttemptTally();
  tally.recordAttack('top');
  tally.record(report('top', 'parry-input-too-late', 1));
  assert.equal(tally.rows.top.thrown, 1);

  assert.equal(tally.setSessionActive(true), true);
  assert.equal(tally.rows.top.thrown, 0, 'a run begins on a clean sample');

  tally.recordAttack('left');
  tally.setSessionActive(true); // still on: a held checkbox must not wipe the run every frame
  assert.equal(tally.rows.left.thrown, 1);

  tally.setSessionActive(false); // switched off: the numbers stay readable
  assert.equal(tally.rows.left.thrown, 1);
  assert.equal(tally.sessionActive, false);
  tally.setSessionActive(true);
  assert.equal(tally.rows.left.thrown, 0, 'and the next run is clean again');
});

test('R21G.1 recording is not gated on the session - practising by hand still counts', () => {
  const tally = createParryAttemptTally();
  assert.equal(tally.sessionActive, false);
  tally.recordAttack('right');
  tally.record(report('right', 'parry-input-wrong-direction', 9));
  assert.equal(tally.rows.right.thrown, 1);
  assert.equal(tally.rows.right.wrongDirection, 1);
});

test('R21G.1 the drive tells the tally when a run starts, and the lab counts every swing', () => {
  const controller = readFileSync(new URL('../tools/action-studio/shield-parry-r281/opponent-drive-controller.js', import.meta.url), 'utf8');
  assert.ok(controller.includes('tally?.setSessionActive(running);'));
  // Before the early return, or a run would only ever be reset by the frame that also drove it.
  assert.ok(controller.indexOf('tally?.setSessionActive(running);') < controller.indexOf('if (!enabled()) return null;'));
  // R21L.1: and the drive's own swing counter starts on the same edge, so a report cannot carry
  // two totals from different clocks.
  assert.ok(controller.includes('if (running && !wasEnabled) runtime.resetRun();'));
  const entry = readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
  assert.match(entry, /parryTally\.recordAttack\(direction, /, 'every swing is counted as it starts');
});

test('R21G.1 pressing before the attacker commits is a timing miss, not an unknown one', () => {
  // The gate answers a press made before movementStartSeconds with 'attack-not-committed'. From
  // the player's side that is pressing too early; a driven run filed 34 of 34 such presses under
  // "other", which is the bucket that means the tally has nothing to tell you.
  const tally = createParryAttemptTally();
  for (const reason of ['parry-input-too-early', 'parry-input-too-late', 'attack-not-committed']) {
    tally.recordAttack('top');
  }
  let sequence = 0;
  for (const reason of ['parry-input-too-early', 'parry-input-too-late', 'attack-not-committed']) {
    tally.record(report('top', reason, sequence += 1));
  }
  assert.equal(tally.rows.top.mistimed, 3);
  assert.equal(tally.rows.top.other, 0);

  // A broken attack timeline is NOT a player mistake and must stay conspicuous.
  const broken = createParryAttemptTally();
  broken.recordAttack('left');
  broken.record(report('left', 'missing-authored-attack-timeline', 1));
  assert.equal(broken.rows.left.other, 1);
  assert.equal(broken.rows.left.mistimed, 0);
});

test('R21G.2 the pasteable report carries every derived column', () => {
  const tally = createParryAttemptTally();
  for (let i = 0; i < 4; i += 1) tally.recordAttack('top');
  tally.record(report('top', 'parry-input-armed-awaiting-real-contact', 1, true));
  tally.record(report('top', 'parry-input-too-late', 2));
  // R21G.4 appended a second table, so the counts table is the block before the first blank line.
  const lines = tally.reportText.split('\n');
  const counts = lines.slice(0, lines.indexOf(''));
  const head = counts[0].split('\t');
  const top = counts.find((l) => l.startsWith('top')).split('\t');
  const total = counts[counts.length - 1].split('\t');
  assert.ok(total[0] === '總計', `expected the counts total, got ${total[0]}`);
  assert.equal(head.length, top.length);
  assert.equal(head.length, total.length);
  // thrown and noAnswer are derived rather than stored; reading them off the raw row gave a blank
  // cell and a NaN total, which a tester would have pasted without noticing.
  for (const cell of [...top.slice(1), ...total.slice(1)]) {
    assert.match(cell, /^\d+$/, `"${cell}" is not a number in:\n${tally.reportText}`);
  }
  assert.equal(top[1], '4', 'thrown');
  assert.equal(top[top.length - 1], '2', 'noAnswer');
  // Every row must still balance: the buckets account for every swing.
  const bucketed = top.slice(2).reduce((a, v) => a + Number(v), 0);
  assert.equal(bucketed, Number(top[1]));
});

test('R21G.2 a run that has been switched off still names its seed', async () => {
  const { createOpponentDriveController } = await import('../tools/action-studio/shield-parry-r281/opponent-drive-controller.js');
  const toggle = { checked: false };
  const controller = createOpponentDriveController({
    toggle,
    laneController: { report: { separationMeters: 2.4 }, setAttackerIntent() {} },
    startAttack: () => true,
    readAttackAvailable: () => true,
  });
  assert.equal(controller.summary, '手動', 'nothing has happened yet');
  toggle.checked = true;
  for (let i = 0; i < 200 && controller.report.attacksServed === 0; i += 1) controller.frame(16);
  assert.ok(controller.report.attacksServed > 0);
  toggle.checked = false;
  // A tester switches the opponent off before reading the numbers. A sample whose seed is gone
  // cannot be replayed, which was the entire reason for seeding it.
  assert.match(controller.summary, /seed \d+/);
  assert.match(controller.summary, /已出 \d+/);
});

test('R21G.2 the HUD is actually handed the opponent line and the report', () => {
  // Both were added to the entry's HUD source list and never forwarded, so the 對手 line did not
  // update once between R21E.1 and R21G.2 - the drive had only ever been checked through the debug
  // API, which reads the runtime rather than the screen.
  const reporting = readFileSync(new URL('../tools/action-studio/shield-parry-r281/frame-reporting.js', import.meta.url), 'utf8');
  const hud = reporting.slice(reporting.indexOf('function updateHud'), reporting.indexOf('function buildReport'));
  assert.match(hud, /opponent: read\.opponent/);
  assert.match(hud, /parryTallyReport: read\.parryTallyReport/);
});

test('R21G.3 too early and too late are counted apart, because they want opposite fixes', () => {
  // The first real playtest came back 4 mistimed out of 7 - the dominant failure by far - and
  // could not say which kind. Too early means the player cannot see WHEN the swing starts and the
  // fix is the attacker's commitment being legible; too late means they saw it and could not get
  // there, and the fix is the window or the pace. One number chooses neither.
  const tally = createParryAttemptTally();
  let sequence = 0;
  const press = (reason) => { tally.recordAttack('top'); tally.record(report('top', reason, sequence += 1)); };
  press('parry-input-too-early');
  press('attack-not-committed'); // the earliest a press can be: before movementStartSeconds
  press('parry-input-too-late');
  const row = tally.rows.top;
  assert.equal(row.tooEarly, 2);
  assert.equal(row.tooLate, 1);
  assert.equal(row.mistimed, 3, 'still available as the derived total');
  assert.match(tally.summary, /2 太早/);
  assert.match(tally.summary, /1 太晚/);
  assert.match(tally.reportText.split('\n')[0], /太早\t太晚/);
  // And the buckets still account for every swing.
  const bucketed = row.armed + row.wrongDirection + row.unaimed + row.tooEarly + row.tooLate + row.other + row.noAnswer;
  assert.equal(bucketed, row.thrown);
});

test('R21G.3 a broken attack timeline is still neither kind of mistiming', () => {
  const tally = createParryAttemptTally();
  tally.recordAttack('left');
  tally.record(report('left', 'missing-authored-attack-timeline', 1));
  assert.equal(tally.rows.left.other, 1);
  assert.equal(tally.rows.left.mistimed, 0);
  assert.equal(tally.rows.left.tooEarly, 0);
  assert.equal(tally.rows.left.tooLate, 0);
});

test('R21G.4 how late a press was, not just that it was late', () => {
  // A 78-swing sample came back 64% too late, and "too late" cannot distinguish presses clustered
  // 40ms past the closing edge - which a small retime recovers - from presses 300ms past it, which
  // no window change reaches. The pacing target would otherwise have been a guess.
  const tally = createParryAttemptTally();
  let sequence = 0;
  const press = (direction, reason, ttcSeconds, accepted = false) => {
    tally.recordAttack(direction);
    tally.record({ attackDirection: direction, sequence: sequence += 1, accepted, reason, timeToContactSeconds: ttcSeconds });
  };
  press('top', 'parry-input-armed-awaiting-real-contact', 0.12, true);
  press('top', 'parry-input-too-late', 0.03);
  press('top', 'parry-input-too-late', 0.01);
  press('top', 'parry-input-too-late', -0.04); // pressed after the blade had already arrived

  const { opensMs, closesMs } = tally.windowMs;
  assert.equal(opensMs, 180);
  assert.equal(closesMs, 60);
  const top = tally.timing.top;
  assert.equal(top.presses, 4);
  assert.equal(top.earliestMs, 120, 'largest TTC is the soonest press');
  assert.equal(top.medianMs, 20);
  assert.equal(top.latestMs, -40, 'negative TTC means the blade had landed');
  assert.equal(top.insideWindow, 1);
  assert.equal(top.medianMsPastClose, 50);
  assert.equal(top.worstMsPastClose, 100);
});

test('R21G.4 a direction with no late press reports no lateness rather than zero', () => {
  const tally = createParryAttemptTally();
  tally.recordAttack('left');
  tally.record({ attackDirection: 'left', sequence: 1, accepted: true, reason: 'ok', timeToContactSeconds: 0.11 });
  const left = tally.timing.left;
  assert.equal(left.insideWindow, 1);
  assert.equal(left.medianMsPastClose, null, 'zero would read as "on the edge", which is not what happened');
  assert.equal(left.worstMsPastClose, null);
  assert.deepEqual(tally.timing.right, {
    presses: 0, earliestMs: null, medianMs: null, latestMs: null,
    insideWindow: 0, medianMsPastClose: null, worstMsPastClose: null,
  });
});

test('R21G.4 a press the gate could not time is counted but not timed', () => {
  // inspectCommittedAttackTiming returns a null TTC when the attack has no authored timeline.
  const tally = createParryAttemptTally();
  tally.recordAttack('right');
  tally.record({ attackDirection: 'right', sequence: 1, reason: 'missing-authored-attack-timeline', timeToContactSeconds: null });
  assert.equal(tally.rows.right.attempts, 1);
  assert.equal(tally.rows.right.other, 1);
  assert.equal(tally.timing.right.presses, 0, 'no timing sample to report');
});

test('R21G.4 the timing table rides along with the report, on the shared TTC axis', () => {
  const tally = createParryAttemptTally();
  tally.recordAttack('top');
  tally.record({ attackDirection: 'top', sequence: 1, accepted: true, reason: 'ok', timeToContactSeconds: 0.1 });
  const text = tally.reportText;
  assert.match(text, /按下時距接觸多久/);
  assert.match(text, /窗口 = 180→60ms/);
  assert.match(text, /方向\t按壓\t最早\t中位\t最晚\t窗口內\t過關中位\t過關最差/);
  // The counts table must still be there and still balance.
  assert.match(text, /方向\t揮出\t成功/);
});

test('R21G.4 the raw samples stay out of rows, so the bucket invariant is untouched', () => {
  const tally = createParryAttemptTally();
  tally.recordAttack('top');
  tally.record({ attackDirection: 'top', sequence: 1, accepted: true, reason: 'ok', timeToContactSeconds: 0.1 });
  assert.ok(!('ttcMs' in tally.rows.top), 'rows is a counts view; an array in it breaks every deepEqual');
  const row = tally.rows.top;
  assert.equal(row.armed + row.wrongDirection + row.unaimed + row.tooEarly + row.tooLate + row.other + row.noAnswer, row.thrown);
});

test('R21L.1 a misread swing records what it was mistaken FOR', () => {
  // "Wrong direction" says the swing was misread; it cannot say misread as what. R21A.1 measured
  // that all three attacks travel on the defender's right through the windup and are separated
  // only by the tip's vertical velocity - TOP rises, RIGHT holds level, LEFT falls - so they are
  // not equally alike, and "make the swings readable" is a vaguer instruction than "these two are
  // being mistaken for each other".
  const tally = createParryAttemptTally();
  let sequence = 0;
  const miss = (thrown, aimed) => {
    tally.recordAttack(thrown);
    tally.record({
      attackDirection: thrown, aimedSector: aimed, sequence: sequence += 1,
      accepted: false, reason: 'parry-input-wrong-direction', timeToContactSeconds: 0.1,
    });
  };
  miss('top', 'left'); miss('top', 'left'); miss('top', 'right');
  miss('left', 'top');
  const confusion = tally.confusion;
  assert.equal(confusion.top.left, 2);
  assert.equal(confusion.top.right, 1);
  assert.equal(confusion.left.top, 1);
  assert.equal(confusion.right.top, 0, 'a direction nobody misread is all zeroes');
  assert.equal(confusion.top.top, 0, 'aiming correctly is not a miss, so the diagonal stays empty');
  // The counts view stays a counts view; a nested object in it breaks every deepEqual on rows.
  assert.ok(!('wrongAim' in tally.rows.top));
  assert.equal(tally.rows.top.wrongDirection, 3, 'and still totals the row');
});

test('R21L.1 the matrix only appears when there is something in it', () => {
  const clean = createParryAttemptTally();
  clean.recordAttack('top');
  clean.record({ attackDirection: 'top', sequence: 1, accepted: true, reason: 'ok', timeToContactSeconds: 0.1 });
  assert.ok(!clean.reportText.includes('方向錯的分布'), 'an empty grid every run trains the eye to skip it');

  const messy = createParryAttemptTally();
  messy.recordAttack('left');
  messy.record({
    attackDirection: 'left', aimedSector: 'top', sequence: 1,
    accepted: false, reason: 'parry-input-wrong-direction', timeToContactSeconds: 0.1,
  });
  const text = messy.reportText;
  assert.match(text, /方向錯的分布（列 = 這一刀從你的哪一側來，欄 = 你瞄的）· 共 1 次/);
  assert.match(text, /來自\\瞄準\ttop\tright\tleft/);
  // R21Q.1: the LEFT attack is shown by the side it ARRIVES from, which is the player's right,
  // so the dash sits under 'right' - the cell that would have meant "read it correctly".
  assert.match(text, /^right\t1\t—\t0$/m, 'the diagonal is a dash, not a zero');
});

test('R21L.1 an unaimed press is not a misread one', () => {
  // A null sector counts as a mismatch for the gate (R21C.1) but says nothing about what the
  // player thought the swing was, so it must not land in the matrix.
  const tally = createParryAttemptTally();
  tally.recordAttack('right');
  tally.record({
    attackDirection: 'right', aimedSector: null, sequence: 1,
    accepted: false, reason: 'parry-input-unaimed', timeToContactSeconds: 0.1,
  });
  assert.equal(tally.rows.right.unaimed, 1);
  assert.equal(tally.rows.right.wrongDirection, 0);
  for (const aimed of ['top', 'right', 'left']) assert.equal(tally.confusion.right[aimed], 0);
});

test('R21M.1 a press that never moved the aim is told apart from a misread one', () => {
  // R21L.1's matrix came back with 15 of 16 misreads aimed at RIGHT, and never TOP mistaken for
  // LEFT or the reverse - which is not what a reading failure between those two looks like. The
  // sector holds indefinitely by design and RIGHT is the direction being parried 12 times in 13,
  // so the aim sits there. Two explanations fit that matrix and want opposite fixes: the aim was
  // already wrong and stayed (an input problem), or the player pointed and pointed wrong (reading).
  const tally = createParryAttemptTally();
  let sequence = 0;
  const swing = (thrown, startAim, pressAim, reason, accepted = false) => {
    tally.recordAttack(thrown, startAim);
    tally.record({
      attackDirection: thrown, aimedSector: pressAim, sequence: sequence += 1,
      accepted, reason, timeToContactSeconds: 0.1,
    });
  };
  swing('top', 'right', 'right', 'parry-input-wrong-direction');       // parked, never moved
  swing('top', 'right', 'right', 'parry-input-wrong-direction');       // parked, never moved
  swing('top', 'left', 'right', 'parry-input-wrong-direction');        // moved, and moved wrong
  swing('top', 'left', 'top', 'parry-input-armed-awaiting-real-contact', true); // moved, correctly

  const top = tally.aimMovement.top;
  assert.equal(top.presses, 4);
  assert.equal(top.unmoved, 2);
  assert.equal(top.moved, 2);
  assert.equal(top.misreadUnmoved, 2, 'the aim never left where the last swing put it');
  assert.equal(top.misreadMoved, 1, 'this one is a genuine misread');
  assert.equal(top.misreadUnmoved + top.misreadMoved, tally.rows.top.wrongDirection);
  // A correct press that had to move counts as moved but never as a misread.
  assert.equal(tally.rows.top.armed, 1);
});

test('R21M.1 the aim is compared against where THIS swing started, not the last press', () => {
  const tally = createParryAttemptTally();
  // The aim moves to top during the first swing and stays there. The second swing therefore starts
  // with the aim already on top: pressing top on it is not a move, and must not read as one.
  tally.recordAttack('left', 'right');
  tally.record({ attackDirection: 'left', aimedSector: 'top', sequence: 1, reason: 'parry-input-wrong-direction', timeToContactSeconds: 0.1 });
  tally.recordAttack('top', 'top');
  tally.record({ attackDirection: 'top', aimedSector: 'top', sequence: 2, accepted: true, reason: 'ok', timeToContactSeconds: 0.1 });
  assert.equal(tally.aimMovement.left.moved, 1, 'the first press did move');
  assert.equal(tally.aimMovement.top.unmoved, 1, 'the second did not have to');
  assert.equal(tally.aimMovement.top.moved, 0);
});

test('R21M.1 a swing recorded without a starting aim treats any press as a move', () => {
  // recordAttack is called from startAttack, which every lab and probe reaches; one that does not
  // pass the aim must not silently classify every press as "never moved".
  const tally = createParryAttemptTally();
  tally.recordAttack('right');
  tally.record({ attackDirection: 'right', aimedSector: 'right', sequence: 1, accepted: true, reason: 'ok', timeToContactSeconds: 0.1 });
  assert.equal(tally.aimMovement.right.moved, 1);
  assert.equal(tally.aimMovement.right.unmoved, 0);
});

test('R21M.1 the movement table prints whenever anything was pressed', () => {
  const tally = createParryAttemptTally();
  tally.recordAttack('right', 'right');
  tally.record({ attackDirection: 'right', aimedSector: 'right', sequence: 1, accepted: true, reason: 'ok', timeToContactSeconds: 0.1 });
  const text = tally.reportText;
  // A clean run has no confusion matrix but still has this: "the aim never moved" is as
  // informative when the run went well as when it did not.
  assert.ok(!text.includes('方向錯的分布'));
  assert.match(text, /瞄準有沒有動（攻擊開始 → 按下）/);
  assert.match(text, /^right\t1\t1\t0\t0\t0$/m);
});

test('R21M.1 the lab hands the aim in with every swing', () => {
  const entry = readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
  assert.match(entry, /parryTally\.recordAttack\(direction, guardSector\.sector\);/);
});

test('R21M.1 an unaimed press is neither moved nor unmoved', () => {
  // Pointing nowhere is already counted as `unaimed`. Filing it as "never moved" would inflate
  // the exact bucket this split exists to size.
  const tally = createParryAttemptTally();
  tally.recordAttack('top', 'right');
  tally.record({ attackDirection: 'top', aimedSector: null, sequence: 1, reason: 'parry-input-unaimed', timeToContactSeconds: 0.1 });
  const top = tally.aimMovement.top;
  assert.equal(top.presses, 1, 'it was still a press');
  assert.equal(top.unmoved, 0);
  assert.equal(top.moved, 0);
  assert.equal(tally.rows.top.unaimed, 1);
});
