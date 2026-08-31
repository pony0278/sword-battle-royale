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

function emptyRow() {
  return { attempts: 0, armed: 0, wrongDirection: 0, unaimed: 0, mistimed: 0, other: 0 };
}

export function createParryAttemptTally() {
  const rows = new Map(DIRECTIONS.map((direction) => [direction, emptyRow()]));
  let lastSequence = null;

  return Object.freeze({
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
      else if (report.reason === 'parry-input-too-early' || report.reason === 'parry-input-too-late') row.mistimed += 1;
      else row.other += 1;
      return row;
    },
    reset() { rows.forEach((_, key) => rows.set(key, emptyRow())); lastSequence = null; },
    get summary() {
      return DIRECTIONS.map((direction) => {
        const row = rows.get(direction);
        if (!row.attempts) return `${direction} —`;
        const missReasons = [
          row.wrongDirection ? `${row.wrongDirection} 方向` : null,
          row.mistimed ? `${row.mistimed} 時機` : null,
          row.unaimed ? `${row.unaimed} 沒瞄` : null,
        ].filter(Boolean).join('/');
        return `${direction} ${row.armed}/${row.attempts}${missReasons ? ` (${missReasons})` : ''}`;
      }).join(' · ');
    },
    get rows() {
      return Object.fromEntries(DIRECTIONS.map((direction) => [direction, { ...rows.get(direction) }]));
    },
  });
}
