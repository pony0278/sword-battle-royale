export const DEFENCE_MATRIX_VERDICT_STAGE = 'R21P.1';

// R21P.1 - can a press inside the parry window still defend you?
//
// The question this answers came out of five failed ad-hoc probes, and the reason they failed is
// worth keeping: setGuardHeld returns immediately unless the mode is 'block' (the entry, R20H.1),
// so the directional press R21N.1 built is INERT in parry mode - it selects a sector and does
// nothing else. Every tally this project has collected was therefore recorded in BLOCK mode, where
// the guard's rising edge both arms the parry and raises the shield. That is the mode this gate
// drives, because it is the mode the fight actually happens in.
//
// What it measures is one property, and it is a property the golden grid cannot see: the parry
// window and the blockable range have to OVERLAP. A press is a single action - the shield goes up,
// and the gate judges its timing - so if the latest moment you can still block has already passed
// by the time the parry window opens, the direction has no safe press at all. Going for the parry
// means being undefended when you miss, and blocking means never being able to parry.
//
// And it depends on the TEMPO, which is why the gate below records 1x while the defect that
// prompted it lives at 2x. The blockable range is geometry, so it scales with the swing; the parry
// window is a fixed 180-60ms of TTC, so it does not. They drift apart as the tempo rises, and LEFT
// - whose guard needs the most lead - crosses over first:
//
//   direction   guard still defends when raised at (2x)   1x        2x
//   TOP         250ms                                     overlaps  overlaps
//   RIGHT       250ms                                     overlaps  overlaps
//   LEFT        about 420ms (410 fails, 430 works)        overlaps  NO OVERLAP
//
// At 1x every direction still defends a press made anywhere in its own window - measured, not
// assumed: the gate below drives it and reproduces exactly that. At 2x LEFT does not, which is the
// report that started this: "LEFT can't be blocked unless you raise the shield very early." It
// can't - by the time the game says you may parry, LEFT is already unblockable. That lives in
// MEASURED_AT_DOUBLE_TEMPO rather than in the gate, because 2x is an experiment and 1x is what
// ships.
export const PARRY_WINDOW_MS = Object.freeze({ opensAtTtc: 180, closesAtTtc: 60 });

// The press moments the gate drives. Both sit inside the parry window, so both are moments the
// game tells the player are legal - and a legal press should never leave you defenceless.
export const PROBED_PRESS_TTC_MS = Object.freeze([180, 120]);

// The committed record, the way the golden grid is a committed record: this is what the exchange
// does today, including where it is wrong. A gate that simply demanded overlap would be red from
// the day it was written, which is a worse instrument than one that catches CHANGE.
export const MEASURED_DEFENCE_AT_PRESS = Object.freeze({
  top: Object.freeze({ 180: 'defended', 120: 'defended' }),
  right: Object.freeze({ 180: 'defended', 120: 'defended' }),
  left: Object.freeze({ 180: 'defended', 120: 'defended' }),
});

// The defect, kept as numbers rather than as a story, and deliberately NOT gated: it belongs to a
// tempo the shipped page does not run at. It is here so that whoever next moves LEFT's timeline or
// the window's offsets sees what the pair does to each other before they move it.
export const MEASURED_AT_DOUBLE_TEMPO = Object.freeze({
  tempoScale: 2,
  contactMs: 860,
  guardStillDefendsWhenRaisedAtTtcMs: Object.freeze({ top: 250, right: 250, left: 430 }),
  leftBoundaryMs: Object.freeze({ fails: 410, works: 430 }),
  leftShortfallMs: 250,
  // Why five ad-hoc probes could not find this: the press only exists in BLOCK mode.
  setGuardHeldIsInertOutsideBlockMode: true,
});

export const DEFENCE_MATRIX_DIRECTIONS = Object.freeze(['top', 'right', 'left']);

function normalise(outcome) {
  // A parry and a block are both "you were not hit". The gate is about defence, not about grade -
  // which grade you earned is the parry composition gate's question.
  if (outcome === 'parry' || outcome === 'block') return 'defended';
  return 'undefended';
}

export function judgeDefenceMatrix(observed = {}) {
  const rows = [];
  for (const direction of DEFENCE_MATRIX_DIRECTIONS) {
    for (const pressTtcMs of PROBED_PRESS_TTC_MS) {
      const expected = MEASURED_DEFENCE_AT_PRESS[direction]?.[pressTtcMs] ?? null;
      const actual = normalise(observed[direction]?.[pressTtcMs] ?? null);
      rows.push(Object.freeze({
        direction,
        pressTtcMs,
        expected,
        actual,
        outcome: observed[direction]?.[pressTtcMs] ?? null,
        pass: expected === actual,
      }));
    }
  }
  const failures = rows.filter((row) => !row.pass);
  return Object.freeze({
    stage: DEFENCE_MATRIX_VERDICT_STAGE,
    pass: failures.length === 0,
    rows: Object.freeze(rows),
    failures: Object.freeze(failures),
  });
}

// Whether a direction has any safe press at all: somewhere inside the window the guard still
// defends. Reported rather than enforced, so the defect stays visible while it is unfixed.
export function directionsWithoutOverlap() {
  return DEFENCE_MATRIX_DIRECTIONS.filter((direction) =>
    PROBED_PRESS_TTC_MS.some((ttc) => MEASURED_DEFENCE_AT_PRESS[direction][ttc] !== 'defended'));
}
