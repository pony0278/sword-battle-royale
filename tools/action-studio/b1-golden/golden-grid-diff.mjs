// R21W.1 - what a golden cell's failure has to leave behind.
//
// Split out of verify-golden-grid.mjs so it can be tested without a browser. The verifier is a
// driver: it launches chromium, replays eleven exchanges and exits. The judgement - which fields
// must match, what tolerance each is judged at, and what a failure prints - is here, where a test
// can hold it to the thing that made it necessary.
//
// What made it necessary: this gate went red once in four runs and the evidence was gone by the
// time anyone looked. R20K.1 pinned the frame step precisely so these cells reproduce bit for bit
// (measured 8/8 identical to six decimals), so a red run is either a real behavioural change or
// the pinning stopped holding - and telling those apart needs the numbers, not the verdict.

// The exact-match fields. A difference in any of these is a different fight.
export const EXACT_FIELDS = Object.freeze(['blocked', 'clang', 'body', 'posture', 'relevance']);

export const NUMERIC_TOLERANCES = Object.freeze([
  // The stance is set rather than settled, so it must come back exactly.
  Object.freeze({ field: 'startSep', tolerance: 1e-6, because: 'the stance is set, not settled' }),
  // Transfers are deterministic but the settle samples a moving value.
  Object.freeze({ field: 'settledSep', tolerance: 0.05, because: 'settle timing samples a moving value' }),
]);

// The defender must finish square. Not a comparison against the golden record - it is zero or the
// exchange left the fighter turned, whatever the record happens to say.
export const SETTLED_YAW_TOLERANCE_DEGREES = 0.5;

export const REPORTED_FIELDS = Object.freeze([...EXACT_FIELDS, 'startSep', 'settledSep', 'settledYawDeg']);

// Both records, every field, on one line each. A terse diff says which field moved; this says what
// the rest of the cell was doing at the time, which is how a single flipped boolean gets read as
// "the block failed" rather than "the whole exchange went somewhere else".
export function describeCell(record) {
  return REPORTED_FIELDS.map((field) => `${field}=${record?.[field] ?? '-'}`).join(' ');
}

export function compareGoldenCell(golden, measured) {
  const bad = [];
  const margins = [];
  for (const field of EXACT_FIELDS) {
    if (measured?.[field] !== golden?.[field]) bad.push(`${field} ${measured?.[field]}!=${golden?.[field]}`);
  }
  for (const { field, tolerance } of NUMERIC_TOLERANCES) {
    if (field !== 'startSep' && golden?.[field] == null) continue;
    const distance = Math.abs((measured?.[field] ?? 0) - (golden?.[field] ?? 0));
    margins.push({ field, distance, tolerance });
    // The distance and the tolerance both, so a reader can tell a hair over the line from a
    // different fight without going and looking the tolerance up.
    if (distance > tolerance) {
      bad.push(`${field} ${measured?.[field]}!=${golden?.[field]} (off by ${distance.toFixed(6)}, tolerance ${tolerance})`);
    }
  }
  const yaw = Math.abs(measured?.settledYawDeg ?? 0);
  margins.push({ field: 'settledYawDeg', distance: yaw, tolerance: SETTLED_YAW_TOLERANCE_DEGREES });
  if (yaw > SETTLED_YAW_TOLERANCE_DEGREES) {
    bad.push(`settledYawDeg ${measured?.settledYawDeg}!=0 (tolerance ${SETTLED_YAW_TOLERANCE_DEGREES})`);
  }
  return { bad, margins };
}

// Ranked by the FRACTION of its tolerance a cell used, not by the absolute gap: startSep is judged
// at 1e-6 and settledSep at 0.05, so an absolute ranking always names startSep and says nothing.
// A cell sitting at 90% of its own tolerance is the one that flips next, and a green run that
// prints it turns "it went red once" into something anyone can watch drift.
export function tightestMargin(entries) {
  let tightest = null;
  for (const entry of entries ?? []) {
    const used = entry.tolerance > 0 ? entry.distance / entry.tolerance : 0;
    if (tightest == null || used > tightest.used) tightest = { ...entry, used };
  }
  return tightest;
}

export function describeTightestMargin(tightest) {
  if (!tightest) return null;
  return `tightest margin: ${tightest.name} ${tightest.field} used ${(tightest.used * 100).toFixed(1)}%`
    + ` of its ${tightest.tolerance} tolerance (off by ${tightest.distance.toFixed(6)})`;
}
