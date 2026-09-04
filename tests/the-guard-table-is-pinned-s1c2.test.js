import test from 'node:test';
import assert from 'node:assert/strict';
import { LONGSWORD_GUARD_PRESENTATION } from '../src/combat/guard-state-machine.js';

// S1.C2, step 1 of four - the table, pinned before anything moves it.
//
// handoff/39 recorded LONGSWORD_GUARD_PRESENTATION as category C: a mechanic with a weapon frozen
// into it at module load. Moving it out of guard-state-machine.js is a change to import structure,
// and import structure is exactly what the existing tests do not measure. Measured: between them
// guard-state-machine.test.js and neutral-stance.test.js reach twelve distinct field names, against
// a table of eighty-four field instances across eight states. Never reached, and all of them the
// ones that decide parry timing rather than which clip plays: role, sourceWindow,
// counterWindowSeconds, completionEvent, sourceFamily, variants. Those could change silently, and
// the golden grid would only notice the ones that reach a pose.
//
// So: every key, every value, written down. This test exists to fail if step 3 or step 4 moves a
// single one of them, and to be deleted the day a second weapon makes a single frozen table the
// wrong shape to assert - at which point what gets pinned is each weapon's table, built by the same
// function, and this file's job is done.
//
// Recorded from the running module at S1.C2, before any of the four steps.
const PINNED = Object.freeze({
  neutral: {
    role: 'neutral',
    clipId: null,
    authored: false,
    inPlace: true,
    loop: true,
  },
  guard_enter: {
    role: 'guard-enter',
    clipId: 'SKYRIM_GUARD/shd_blockidle',
    correctionLayerId: 'longsword_triangle_forward_v1',
    correctionAuthoredStage: 'G2.5.1',
    transitionProfileId: 'longsword_guard_enter_v1',
    weaponMountProfileId: 'skyrim-guard-calibrated',
    authored: true,
    authoredStage: 'G3.2',
    inPlace: true,
    loop: true,
  },
  guard_hold: {
    role: 'guard-hold',
    clipId: 'SKYRIM_GUARD/shd_blockidle',
    correctionLayerId: 'longsword_triangle_forward_v1',
    correctionAuthoredStage: 'G2.5.1',
    weaponMountProfileId: 'skyrim-guard-calibrated',
    authored: true,
    authoredStage: 'G2.5.1',
    inPlace: true,
    loop: true,
  },
  guard_block_hit: {
    role: 'block-hit',
    clipId: 'SKYRIM_GUARD/shd_blockhit',
    correctionLayerId: 'longsword_triangle_forward_v1',
    correctionAuthoredStage: 'G2.5.1',
    reactionProfileId: 'longsword_guard_block_hit_v1',
    reactionVariant: 'block-hit',
    sourceWindow: { startSeconds: 0, endSeconds: 0.6 },
    counterWindowSeconds: [0.24, 0.6],
    completionEvent: 'reaction_complete',
    weaponMountProfileId: 'skyrim-guard-calibrated',
    authored: true,
    authoredStage: 'G3.3.2',
    inPlace: true,
    loop: false,
  },
  guard_parry: {
    role: 'parry-reaction',
    clipId: 'SKYRIM_GUARD/power_parry_g363',
    correctionLayerId: 'longsword_triangle_forward_v1',
    correctionAuthoredStage: 'G2.5.1',
    reactionProfileId: 'longsword_guard_parry_advantage_g363',
    reactionVariant: 'parry',
    sourceWindow: { startSeconds: 0, endSeconds: 0.96 },
    // 0.3333... is one third, authored as a fraction rather than rounded. Pinned as the exact
    // double the module produces, because a rounded 0.333 here would pass this test and move the
    // last legal follow-up by 0.3ms.
    counterWindowSeconds: [0.08, 0.3333333333333333],
    completionEvent: 'reaction_complete',
    weaponMountProfileId: 'skyrim-guard-calibrated',
    authored: true,
    authoredStage: 'G3.3.2',
    inPlace: true,
    loop: false,
    variants: {
      parry: {
        clipId: 'SKYRIM_GUARD/power_parry_g363',
        reactionProfileId: 'longsword_guard_parry_advantage_g363',
      },
      'perfect-parry': {
        clipId: 'SKYRIM_GUARD/perfect_power_parry_g363',
        reactionProfileId: 'longsword_guard_perfect_parry_g363',
      },
    },
  },
  // The one state whose mount is not the Skyrim guard: the counter is a KayKit clip, and
  // weapon-mount-policy.js is why that difference has to survive any move of this table.
  guard_counter: {
    role: 'guard-counter',
    clipId: 'Melee_Block_Attack',
    counterProfileId: 'longsword_guard_counter_melee_block_attack_v1',
    sourceFamily: 'kaykit-melee',
    completionEvent: 'counter_complete',
    correctionWeight: 0,
    weaponMountProfileId: 'kaykit-default',
    authored: true,
    authoredStage: 'G3.4',
    inPlace: true,
    loop: false,
  },
  guard_recover: {
    role: 'guard-recover',
    clipId: 'SKYRIM_GUARD/shd_blockidle',
    correctionLayerId: 'longsword_triangle_forward_v1',
    correctionAuthoredStage: 'G2.5.1',
    transitionProfileId: 'longsword_guard_recover_v1',
    weaponMountProfileId: 'skyrim-guard-calibrated',
    authored: true,
    authoredStage: 'G3.2',
    inPlace: true,
    loop: true,
  },
  guard_exit: {
    role: 'guard-exit',
    clipId: 'SKYRIM_GUARD/shd_blockidle',
    correctionLayerId: 'longsword_triangle_forward_v1',
    correctionAuthoredStage: 'G2.5.1',
    transitionProfileId: 'longsword_guard_exit_v1',
    weaponMountProfileId: 'skyrim-guard-calibrated',
    authored: true,
    authoredStage: 'G3.2',
    inPlace: true,
    loop: true,
  },
});

// Key order is not part of the contract - the table is read by lookup, never iterated for order -
// so both sides are sorted before comparing. Everything else is.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

test('S1.C2 the guard presentation table is exactly what it was before the seam moved', () => {
  assert.deepEqual(canonical(LONGSWORD_GUARD_PRESENTATION), canonical(PINNED));
});

test('S1.C2 the pin covers every state the table has, so a new one cannot slip in unmeasured', () => {
  assert.deepEqual(Object.keys(LONGSWORD_GUARD_PRESENTATION).sort(), Object.keys(PINNED).sort());
  // Measured, not estimated: 8 states, 84 top-level fields across them, 102 counting the nested
  // sourceWindow and variants. deepEqual above already catches an added field; this states the
  // size so the next person can see at a glance how much of it the older tests were reaching.
  const fields = Object.values(LONGSWORD_GUARD_PRESENTATION)
    .reduce((total, entry) => total + Object.keys(entry).length, 0);
  assert.equal(fields, 84, `the table has ${fields} fields; the pin was written against 84`);
});

test('S1.C2 the table and everything in it stays frozen, whoever builds it', () => {
  assert.equal(Object.isFrozen(LONGSWORD_GUARD_PRESENTATION), true);
  for (const [state, entry] of Object.entries(LONGSWORD_GUARD_PRESENTATION)) {
    assert.equal(Object.isFrozen(entry), true, `${state} is not frozen`);
  }
});
