import test from 'node:test';
import assert from 'node:assert/strict';
import { getLongswordDirectionalAttackProfile } from '../src/combat/longsword-directional-attack-runtime.js';
import { ATTACK_DIRECTIONS } from '../src/combat/attack-directions.js';

// G1, step 1 of four - the attack timings, pinned before the seam moves them.
//
// The same measure taken for the guard table at S1.C2, for the same reason and against a larger
// surface. longsword-directional-attack-runtime.js holds SIX module-level tables of per-direction
// measurements - NATURAL_DURATIONS, PRESENTATION_END_SOURCE_SECONDS, ACTIVE_LEAD_SECONDS,
// ACTIVE_TRAIL_SECONDS, TRAIL_LEAD_SECONDS, TRAIL_TAIL_SECONDS - and every landmark below is
// derived from them through the warp and the tempo. A greatsword is those six tables with different
// numbers in them, which is exactly why they have to become parameters, and exactly why nothing may
// shift while they do.
//
// Pinned as EXACT doubles, deliberately. Two of these are the fingerprints of the warp arithmetic
// rather than round authored values - right's 0.43010000000000004 and left's 0.36375000000000013 -
// and a rounded pin would let the warp be re-derived slightly differently and still pass. The
// 0.1ms on right's contact is the same one S1.C1 recorded and wrote a tolerance around; here the
// point is the opposite, that it must not move at all.
//
// timeWarp itself is not pinned by value - it is a nested profile with its own tests - only whether
// a direction has one. TOP does not; right and left do, which is R20M.1's whole finding.
const PINNED = Object.freeze({
  top: {
    tempoScale: 1,
    sourceDurationSeconds: 1.533,
    stage: 'G4.1',
    weapon: 'longsword',
    category: 'attack',
    direction: 'top',
    clipId: 'UAL1/Sword_Attack',
    source: 'ual1',
    durationSeconds: 1.533,
    contactSeconds: 0.43,
    activeStartSeconds: 0.375,
    activeEndSeconds: 0.495,
    trailStartSeconds: 0.27,
    trailEndSeconds: 0.55,
    movementStartSeconds: 0.27,
    movementEndSeconds: 0.47,
    cancelStartSeconds: 1.373,
    inPlace: true,
    rootRotationPolicy: 'lock',
    timeWarpPresent: false,
  },
  right: {
    tempoScale: 1,
    sourceDurationSeconds: 0.433,
    stage: 'G4.1',
    weapon: 'longsword',
    category: 'attack',
    direction: 'right',
    clipId: 'UAL2/Sword_Regular_A',
    source: 'ual2',
    durationSeconds: 0.571,
    contactSeconds: 0.43010000000000004,
    activeStartSeconds: 0.3553,
    activeEndSeconds: 0.5236000000000001,
    trailStartSeconds: 0.22440000000000004,
    trailEndSeconds: 0.581,
    movementStartSeconds: 0.22440000000000004,
    movementEndSeconds: 0.5049,
    // RIGHT is the one direction whose cancel is its active end: R21J.1 trimmed its unusable
    // authored tail, and PRESENTATION_END_SOURCE_SECONDS is why. If this stops equalling
    // activeEndSeconds, the trim was lost in the move.
    cancelStartSeconds: 0.5236000000000001,
    inPlace: true,
    rootRotationPolicy: 'lock',
    timeWarpPresent: true,
  },
  left: {
    tempoScale: 1,
    sourceDurationSeconds: 0.533,
    stage: 'G4.1',
    weapon: 'longsword',
    category: 'attack',
    direction: 'left',
    clipId: 'UAL2/Sword_Regular_B',
    source: 'ual2',
    durationSeconds: 0.7030000000000001,
    contactSeconds: 0.43000000000000005,
    activeStartSeconds: 0.36375000000000013,
    activeEndSeconds: 0.48500000000000004,
    trailStartSeconds: 0.14,
    trailEndSeconds: 0.53,
    movementStartSeconds: 0.14,
    movementEndSeconds: 0.47000000000000003,
    cancelStartSeconds: 0.543,
    inPlace: true,
    rootRotationPolicy: 'lock',
    timeWarpPresent: true,
  },
});

function pinnable(profile) {
  const { timeWarp, ...rest } = profile;
  return { ...rest, timeWarpPresent: timeWarp !== null };
}

test('G1 every attack landmark is exactly what it was before the seam moved', () => {
  for (const direction of ATTACK_DIRECTIONS) {
    assert.deepEqual(pinnable(getLongswordDirectionalAttackProfile(direction)), PINNED[direction],
      `${direction} moved`);
  }
});

test('G1 the pin covers every direction and every field a profile carries', () => {
  assert.deepEqual([...ATTACK_DIRECTIONS].sort(), Object.keys(PINNED).sort());
  for (const direction of ATTACK_DIRECTIONS) {
    const live = Object.keys(pinnable(getLongswordDirectionalAttackProfile(direction))).sort();
    assert.deepEqual(live, Object.keys(PINNED[direction]).sort(),
      `${direction} has a field the pin does not name`);
  }
});

// The relationships the six tables exist to produce. Pinned separately from the values because a
// refactor that broke one of these while keeping every number would be a different kind of wrong,
// and because these are the invariants a GREATSWORD has to satisfy too - its numbers will all
// differ, and every line below still has to hold.
test('G1 the landmarks keep their order, which is what a second weapon must also satisfy', () => {
  for (const direction of ATTACK_DIRECTIONS) {
    const p = getLongswordDirectionalAttackProfile(direction);
    assert.ok(p.trailStartSeconds <= p.activeStartSeconds,
      `${direction}: the trail opens before the blade goes active`);
    assert.ok(p.activeStartSeconds < p.contactSeconds,
      `${direction}: contact lands inside the active window, not before it`);
    assert.ok(p.contactSeconds < p.activeEndSeconds,
      `${direction}: contact lands inside the active window, not after it`);
    assert.ok(p.activeEndSeconds <= p.trailEndSeconds,
      `${direction}: the trail outlasts the active window`);
    assert.ok(p.movementStartSeconds <= p.movementEndSeconds,
      `${direction}: movement does not end before it starts`);
    assert.ok(p.cancelStartSeconds <= p.durationSeconds,
      `${direction}: the cancel marker is inside the clip`);
    assert.ok(p.contactSeconds < p.cancelStartSeconds,
      `${direction}: a swing cannot be cancelled before it has landed`);
  }
});
