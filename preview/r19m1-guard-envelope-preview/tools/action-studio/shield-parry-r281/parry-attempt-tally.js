// R21C.2: a count of what actually happened, per direction.
//
// Removing the threat light was a design decision with a measured cost - the player's clock now
// starts when the animation separates rather than when the attacker commits, which R21A.1 put at
// 67ms - and whether that cost is payable is a question about hands, not arithmetic. So the lab
// counts instead of asking for impressions: how many attempts per direction, how many landed, and
// of the misses, how many were the wrong direction rather than the wrong moment.
//
// That split is the whole point. "Wrong direction" says the player could not read the swing, and
// the answer would be a more legible windup. "Wrong moment" says the window is too tight, and the
// answer would be timing. Without the split a failure rate says only that it is hard.
import { COMMITTED_PARRY_CONTACT_GATE_PROFILE } from '../../../src/combat/committed-parry-contact-gate.js';
import { defendedSectorFor } from '../../../src/combat/attack-direction-as-defended.js'; // R21Q.1

export const PARRY_ATTEMPT_TALLY_STAGE = 'R21C.2';

// R21G.4: where the presses actually land, not just which side of the window they missed.
//
// A 78-swing sample came back 64% too late, and "too late" cannot say whether the presses are
// clustered 40ms past the closing edge - which a small retime would recover - or 300ms past it,
// which no window change reaches. Those are different problems and the tally could not tell them
// apart, so the pacing target would have had to be guessed.
//
// Time-to-contact is the right axis for this because the window is the SAME band of TTC for every
// direction (0.18s to 0.06s), even though the three attacks contact at different times. Measured
// in TTC, all three directions land on one comparable scale.
const WINDOW_OPENS_MS = COMMITTED_PARRY_CONTACT_GATE_PROFILE.earliestInputTtcSeconds * 1000;
const WINDOW_CLOSES_MS = COMMITTED_PARRY_CONTACT_GATE_PROFILE.latestInputTtcSeconds * 1000;

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

const DIRECTIONS = Object.freeze(['top', 'right', 'left']);

// R21G.3: mistiming is two opposite mistakes and they were sharing a bucket. The first real
// sample came back 4 mistimed out of 7 - the dominant failure by far - and could not say which,
// because these three reasons had been counted as one number since R21G.1.
//
//   too early  the player is guessing, ahead of the swing. They cannot see WHEN the attack starts,
//              so the fix is the attacker's commitment being legible.
//   too late   the player saw it and could not get there. The fix is the window, or the pace.
//
// Those want opposite changes, so a single "mistimed" count says only that the timing is hard -
// exactly the failure R21C.2 built this tally to avoid making about direction.
//
// `attack-not-committed` is the gate's answer to a press before movementStartSeconds, which is the
// earliest a press can be; it joins too-early. The gate also answers a not-yet-committed press
// whose contact is already imminent with 'parry-input-too-late', and that stays late - what makes
// a press late is the contact it missed, not the phase flag.
//
// `missing-authored-attack-timeline` deliberately stays out of both - that one is a broken attack,
// not a player who mistimed anything, and it should stay conspicuous in `other`.
const TOO_EARLY_REASONS = new Set(['parry-input-too-early', 'attack-not-committed']);
const TOO_LATE_REASONS = new Set(['parry-input-too-late']);

// A press can exist for a swing this tally never saw start - an attack already in the air when the
// session reset, or a caller that records presses without recording swings - so the denominator is
// whichever of the two is larger. That keeps it honest in both directions: it can never report
// more successes than swings, and it never hides a press behind a swing that was not counted.
function thrownOf(row) {
  return Math.max(row.thrown, row.attempts);
}

function noAnswerOf(row) {
  return thrownOf(row) - row.attempts;
}

// R21G.1: `thrown` is what makes the rest of the row readable. Counting only the presses answered
// a question nobody asked - of the attempts you made, how many were good - while the attacks a
// player never answered at all, because they could not read the swing in time to move, left no
// trace whatsoever. A tally where the failure mode you most want to find is invisible is worse
// than no tally, because it looks like an answer.
//
// So the denominator is the swing, not the press, and every attack lands in exactly one bucket:
//
//   thrown = armed + wrongDirection + unaimed + mistimed + other + noAnswer
//
// noAnswer is derived rather than counted - it is simply the swings that no press ever claimed -
// which is what keeps that identity true by construction instead of by bookkeeping.
function emptyRow() {
  // ttcMs holds one entry per press, so the distribution survives rather than a running mean -
  // a mean over a bimodal set of presses describes neither of its halves.
  return {
    thrown: 0, attempts: 0, armed: 0, wrongDirection: 0, unaimed: 0, tooEarly: 0, tooLate: 0, other: 0,
    ttcMs: [],
    // R21L.1: which way the player pointed when they pointed the wrong way. Kept per swing
    // direction, so the two tables together say "this attack was mistaken for that one".
    wrongAim: Object.create(null),
    // R21M.1: and whether they pointed anywhere at all. See AIM_MOVEMENT_QUESTION.
    startAim: null,
    pressesUnmoved: 0,
    pressesMoved: 0,
    misreadUnmoved: 0,
    misreadMoved: 0,
    // R21Q.1: what the swing did, as opposed to how the press was graded.
    defended: 0,
    struck: 0,
  };
}

// R21O.1: a run that cannot say what it was measured under is not evidence. Two whole playtests
// were read as findings about the fight before the numbers turned out to be about the lab's own
// 0.12x review aid, so the conditions now travel with the table rather than with anyone's memory.
// Spelled out rather than abbreviated: the reader of a pasted table is deciding whether to trust
// it, and "1.0x" beside "慢動作" says more than a pair of booleans would.
function conditionLine(conditions) {
  if (!conditions) return null;
  const tempo = Number(conditions.tempoScale);
  const tempoText = Number.isFinite(tempo) ? `${tempo.toFixed(2).replace(/0$/, '')}×` : '?';
  const review = conditions.slowReview === true ? '慢動作輔助 0.12× + 凍結 1.5s' : '無慢動作輔助';
  return `條件: 攻擊節奏 ${tempoText} · ${review}`;
}

export function createParryAttemptTally(options = {}) {
  const readConditions = typeof options.conditions === 'function' ? options.conditions : () => null;
  const rows = new Map(DIRECTIONS.map((direction) => [direction, emptyRow()]));
  let lastSequence = null;
  let lastOutcomeSequence = null;
  let sessionActive = false;

  return Object.freeze({
    // R21G.1: called with every swing as it starts, so the tally knows what was asked of the
    // player and not merely what they answered.
    // R21M.1: with where the player was already pointing when it started.
    recordAttack(direction, aimAtStart = null) {
      const row = rows.get(String(direction || '').toLowerCase());
      if (!row) return null;
      row.thrown += 1;
      row.startAim = String(aimAtStart || '').toLowerCase() || null;
      return row;
    },
    // R21G.1: switching the self-driving opponent on starts a fresh sample. Recording is NOT
    // gated on it - practising by hand still counts - but a run that begins by turning the
    // opponent on should not be read through whatever came before it.
    setSessionActive(active) {
      const next = active === true;
      if (next && !sessionActive) this.reset();
      sessionActive = next;
      return sessionActive;
    },
    get sessionActive() { return sessionActive; },
    // R21Q.1 - what the swing DID, which is not what the press was graded.
    //
    // Every table above grades the input: too early, wrong direction, armed. None of them said
    // whether the blow landed, and that is the only thing a player actually feels. A press judged
    // "too early" that still put the shield in the way is a completely different experience from
    // one that left them open - and telling those two apart by hand is what cost this project a
    // week of chasing LEFT. The exchange resolves over several frames, so the sequence dedupes.
    recordOutcome(direction, sequence, outcome, struck) {
      const row = rows.get(String(direction || '').toLowerCase());
      if (!row) return null;
      if (sequence != null && sequence === lastOutcomeSequence) return null;
      if (outcome == null && struck !== true) return null;
      lastOutcomeSequence = sequence ?? null;
      if (outcome === 'parry' || outcome === 'block') row.defended += 1;
      if (struck === true) row.struck += 1;
      return row;
    },
    // Called with each arm report. One attempt per attack sequence is already the gate's own rule,
    // so a repeat for the same sequence is the refusal that says so, not a second attempt.
    record(report) {
      if (!report || report.reason === 'parry-input-already-used-for-attack') return null;
      const direction = String(report.attackDirection || '').toLowerCase();
      const row = rows.get(direction);
      if (!row) return null;
      if (report.sequence != null && report.sequence === lastSequence) return null;
      lastSequence = report.sequence ?? null;
      row.attempts += 1;
      // R21M.1: a press that never moved the aim is not a misread swing, it is an unanswered one.
      // A press with no aim at all is neither: it says the player pointed nowhere, which is
      // already counted as `unaimed`, and counting it as "never moved" would quietly inflate the
      // very bucket this split exists to size.
      const pressedAim = String(report.aimedSector || '').toLowerCase() || null;
      const moved = pressedAim != null && pressedAim !== row.startAim;
      if (pressedAim != null) { if (moved) row.pressesMoved += 1; else row.pressesUnmoved += 1; }
      // Number(null) is 0, not NaN - so a press the gate could not time (no authored timeline, so
      // inspectCommittedAttackTiming hands back a null TTC) would otherwise be recorded as a press
      // landing exactly on contact, which is a real-looking sample invented out of a missing one.
      const ttc = report.timeToContactSeconds == null ? null : Number(report.timeToContactSeconds);
      if (ttc != null && Number.isFinite(ttc)) row.ttcMs.push(Math.round(ttc * 1000));
      if (report.accepted) row.armed += 1;
      else if (report.reason === 'parry-input-wrong-direction') {
        row.wrongDirection += 1;
        const aimed = String(report.aimedSector || '').toLowerCase();
        if (aimed) row.wrongAim[aimed] = (row.wrongAim[aimed] || 0) + 1;
        // Same rule as above: no aim, no verdict about movement. The gate never produces a
        // wrong-direction miss without a sector, but a caller constructing one by hand can.
        if (pressedAim != null) { if (moved) row.misreadMoved += 1; else row.misreadUnmoved += 1; }
      }
      else if (report.reason === 'parry-input-unaimed') row.unaimed += 1;
      else if (TOO_EARLY_REASONS.has(report.reason)) row.tooEarly += 1;
      else if (TOO_LATE_REASONS.has(report.reason)) row.tooLate += 1;
      else row.other += 1;
      return row;
    },
    reset() { rows.forEach((_, key) => rows.set(key, emptyRow())); lastSequence = null; },
    get summary() {
      return DIRECTIONS.map((direction) => {
        const row = rows.get(direction);
        if (!thrownOf(row)) return `${direction} —`;
        const missReasons = [
          row.wrongDirection ? `${row.wrongDirection} 方向` : null,
          row.tooEarly ? `${row.tooEarly} 太早` : null,
          row.tooLate ? `${row.tooLate} 太晚` : null,
          row.unaimed ? `${row.unaimed} 沒瞄` : null,
          row.other ? `${row.other} 其他` : null,
          noAnswerOf(row) ? `${noAnswerOf(row)} 沒答` : null,
        ].filter(Boolean).join('/');
        return `${direction} ${row.armed}/${thrownOf(row)}${missReasons ? ` (${missReasons})` : ''}`;
      }).join(' · ');
    },
    // R21G.2: the whole sample as pasteable text. A playtest report that has to be transcribed by
    // eye off a HUD line is a playtest report with transcription errors in it, and the split this
    // tally exists to show is exactly the part that gets lost.
    get reportText() {
      const cols = ['thrown', 'armed', 'wrongDirection', 'tooEarly', 'tooLate', 'unaimed', 'other', 'noAnswer'];
      const head = ['方向', '揮出', '成功', '方向錯', '太早', '太晚', '沒瞄', '其他', '沒答'];
      const total = Object.fromEntries(cols.map((c) => [c, 0]));
      const lines = [conditionLine(readConditions()), head.join('\t')].filter(Boolean);
      for (const direction of DIRECTIONS) {
        const row = rows.get(direction);
        // thrown and noAnswer are both derived rather than stored, so neither can be read off the
        // row the way the counted buckets can.
        const values = cols.map((c) => {
          if (c === 'thrown') return thrownOf(row);
          if (c === 'noAnswer') return noAnswerOf(row);
          return row[c];
        });
        cols.forEach((c, i) => { total[c] += values[i]; });
        lines.push([direction, ...values].join('\t'));
      }
      lines.push(['總計', ...cols.map((c) => total[c])].join('\t'));

      // R21Q.1 - the outcome, kept OUT of the table above on purpose. Those buckets partition the
      // swings and must sum to 揮出; being hit is a different axis entirely - a press graded "too
      // early" may still have put the shield in the way, and that is the difference between a
      // frustrating round and an unplayable one. Mixing them would have cost the invariant that
      // every bucket accounts for every swing.
      const outcomes = DIRECTIONS.map((direction) => rows.get(direction));
      if (outcomes.some((row) => row.defended > 0 || row.struck > 0)) {
        lines.push('');
        lines.push('這一刀最後怎麼了（跟上面的判定分開算）');
        lines.push(['方向', '擋下或格檔', '被打中'].join('\t'));
        for (const direction of DIRECTIONS) {
          const row = rows.get(direction);
          lines.push([direction, row.defended, row.struck].join('\t'));
        }
        lines.push(['總計', outcomes.reduce((a, r) => a + r.defended, 0), outcomes.reduce((a, r) => a + r.struck, 0)].join('\t'));
      }

      // The second table is the one a pacing decision is read off. TTC, so all three directions
      // sit on the same scale despite contacting at different times.
      const timing = this.timing;
      lines.push('');
      lines.push(`按下時距接觸多久（ms）· 窗口 = ${WINDOW_OPENS_MS}→${WINDOW_CLOSES_MS}ms`);
      lines.push(['方向', '按壓', '最早', '中位', '最晚', '窗口內', '過關中位', '過關最差'].join('\t'));
      for (const direction of DIRECTIONS) {
        const t = timing[direction];
        const show = (value) => (value == null ? '—' : String(value));
        lines.push([direction, t.presses, show(t.earliestMs), show(t.medianMs), show(t.latestMs),
          t.insideWindow, show(t.medianMsPastClose), show(t.worstMsPastClose)].join('\t'));
      }

      // The third table only appears when there is something to show; an empty grid of zeroes in
      // every report would train the eye to skip past it on the runs where it matters.
      const confusion = this.confusion;
      const misread = DIRECTIONS.reduce((sum, d) => sum + rows.get(d).wrongDirection, 0);
      if (misread > 0) {
        lines.push('');
        // R21Q.1: the row is the attack RESTATED AS THE PLAYER SEES IT, because the clips are
        // named for the attacker's hand and the sector for the screen. Keyed by the raw name, the
        // diagonal stopped meaning "read it correctly" - which is how 35 correct reads in a row
        // were filed as misses.
        lines.push(`方向錯的分布（列 = 這一刀從你的哪一側來，欄 = 你瞄的）· 共 ${misread} 次`);
        lines.push(['來自\\瞄準', ...DIRECTIONS].join('\t'));
        for (const thrown of DIRECTIONS) {
          const seenAs = defendedSectorFor(thrown) || thrown;
          lines.push([seenAs, ...DIRECTIONS.map((aimed) => (aimed === seenAs ? '—' : confusion[thrown][aimed]))].join('\t'));
        }
      }

      // R21M.1: the fourth table. Printed whenever anything was pressed, because "the aim never
      // moved" is as informative on a run that went well as on one that did not.
      const movement = this.aimMovement;
      const pressed = DIRECTIONS.reduce((sum, d) => sum + movement[d].presses, 0);
      if (pressed > 0) {
        lines.push('');
        lines.push('瞄準有沒有動（攻擊開始 → 按下）');
        lines.push(['方向', '按壓', '沒動', '移動', '方向錯·沒動', '方向錯·移動'].join('\t'));
        for (const direction of DIRECTIONS) {
          const m = movement[direction];
          lines.push([direction, m.presses, m.unmoved, m.moved, m.misreadUnmoved, m.misreadMoved].join('\t'));
        }
      }
      return lines.join('\n');
    },
    // R21G.4: the distribution of presses on the one axis all three directions share. Negative
    // TTC means the press came after the blade had already arrived.
    get timing() {
      return Object.fromEntries(DIRECTIONS.map((direction) => {
        const samples = rows.get(direction).ttcMs;
        const late = samples.filter((ms) => ms < WINDOW_CLOSES_MS);
        return [direction, Object.freeze({
          presses: samples.length,
          earliestMs: samples.length ? Math.max(...samples) : null, // largest TTC = pressed soonest
          medianMs: median(samples),
          latestMs: samples.length ? Math.min(...samples) : null,
          insideWindow: samples.filter((ms) => ms <= WINDOW_OPENS_MS && ms >= WINDOW_CLOSES_MS).length,
          // How far past the closing edge the late half sat. This is the number a retime target is
          // read off: a median of 40 is a window problem, a median of 300 is a pacing problem.
          medianMsPastClose: late.length ? median(late.map((ms) => WINDOW_CLOSES_MS - ms)) : null,
          worstMsPastClose: late.length ? Math.round(WINDOW_CLOSES_MS - Math.min(...late)) : null,
        })];
      }));
    },
    // R21L.1 - what a direction was mistaken FOR.
    //
    // "wrong direction" says the swing was misread; it cannot say misread as what. R21A.1 measured
    // that all three attacks travel on the defender's right through the windup and are separated
    // only by the tip's vertical velocity - TOP rises at +4.45 m/s, RIGHT holds level at -1.79,
    // LEFT falls at -7.01 - so the three are not equally alike. Rising against falling is one
    // question; either against level is another. A confusion matrix is the difference between
    // "make the swings readable", which is vague, and "these two are being mistaken for each
    // other", which names a pair.
    get confusion() {
      return Object.fromEntries(DIRECTIONS.map((thrown) => [thrown, Object.freeze(
        Object.fromEntries(DIRECTIONS.map((aimed) => [aimed, rows.get(thrown).wrongAim[aimed] || 0])),
      )]));
    },
    // R21M.1 - did the player point anywhere, or press with the aim where it already was?
    //
    // R21L.1's matrix came back with 15 of 16 misreads aimed at RIGHT - never TOP mistaken for
    // LEFT or the reverse, which is what a reading failure between those two would look like. The
    // sector holds indefinitely by design (planGuardSector: a cursor drifting through the middle
    // has not asked to drop its guard), and RIGHT is the direction being parried 12 times in 13,
    // so the aim sits there. Two explanations fit the same matrix and want opposite fixes:
    //
    //   never moved   the aim was already wrong when the swing began and stayed. Not a reading
    //                 failure - the player either could not get the cursor there in time, or did
    //                 not try. The fix is the input.
    //   moved wrong   they pointed somewhere, and somewhere was wrong. That is reading.
    //
    // A matrix cannot separate those; comparing the aim at the swing's start against the aim at
    // the press can.
    get aimMovement() {
      return Object.fromEntries(DIRECTIONS.map((direction) => {
        const row = rows.get(direction);
        return [direction, Object.freeze({
          presses: row.attempts,
          unmoved: row.pressesUnmoved,
          moved: row.pressesMoved,
          misreadUnmoved: row.misreadUnmoved,
          misreadMoved: row.misreadMoved,
        })];
      }));
    },
    get windowMs() { return Object.freeze({ opensMs: WINDOW_OPENS_MS, closesMs: WINDOW_CLOSES_MS }); },
    get rows() {
      return Object.fromEntries(DIRECTIONS.map((direction) => {
        const row = rows.get(direction);
        // mistimed is kept as the derived total of the two halves, so a reader who only wants
        // "was the timing wrong" still has it without re-adding them.
        const { ttcMs, wrongAim, startAim, ...counts } = row;
        return [direction, {
          ...counts, thrown: thrownOf(row), noAnswer: noAnswerOf(row), mistimed: row.tooEarly + row.tooLate,
        }];
      }));
    },
  });
}
