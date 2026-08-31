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
export const PARRY_ATTEMPT_TALLY_STAGE = 'R21C.2';

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
  return { thrown: 0, attempts: 0, armed: 0, wrongDirection: 0, unaimed: 0, tooEarly: 0, tooLate: 0, other: 0 };
}

export function createParryAttemptTally() {
  const rows = new Map(DIRECTIONS.map((direction) => [direction, emptyRow()]));
  let lastSequence = null;
  let sessionActive = false;

  return Object.freeze({
    // R21G.1: called with every swing as it starts, so the tally knows what was asked of the
    // player and not merely what they answered.
    recordAttack(direction) {
      const row = rows.get(String(direction || '').toLowerCase());
      if (!row) return null;
      row.thrown += 1;
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
      if (report.accepted) row.armed += 1;
      else if (report.reason === 'parry-input-wrong-direction') row.wrongDirection += 1;
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
      const lines = [head.join('\t')];
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
      return lines.join('\n');
    },
    get rows() {
      return Object.fromEntries(DIRECTIONS.map((direction) => {
        const row = rows.get(direction);
        // mistimed is kept as the derived total of the two halves, so a reader who only wants
        // "was the timing wrong" still has it without re-adding them.
        return [direction, {
          ...row, thrown: thrownOf(row), noAnswer: noAnswerOf(row), mistimed: row.tooEarly + row.tooLate,
        }];
      }));
    },
  });
}
