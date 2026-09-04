// @ts-check
import { createDirectionalAttackTimings } from './directional-attack-timings.js';

// G1, step 4 — the greatsword's attack measurements, and the reason there are none yet.
//
// handoff/06 makes the greatsword Weapon Prototype 2, to verify "武器速度差異 + Heavy Impact".
// G1 built the seam it plugs into: createDirectionalAttackTimings takes six tables of per-direction
// measurements, and the longsword's live in longsword-attack-timings.js. This file is the same
// shape with the numbers missing, because the assets they would be measured off do not exist yet.
//
// WHAT IS MISSING, measured against the repository rather than assumed - see
// handoff/40_greatsword_asset_requirements.md for the full specification:
//
//   No mesh.       The only blade in the repository is v3-sword-geometry-definition.js, generated
//                  from `sword_1handed` - 358 vertices, and the sole weapon object the generator
//                  embeds. The contact system measures reach off the blade polyline, so a
//                  greatsword sharing that mesh has the longsword's reach exactly, and "大範圍"
//                  cannot be verified.
//   No animations. UAL1 ships Sword_Attack and Sword_Idle; UAL2 ships Sword_Regular_A/B/C,
//                  Sword_Regular_Combo, Sword_Heavy_Combo, Sword_Block, Sword_Dash. Every one is
//                  authored one-handed. Sword_Heavy_Combo and Sword_Regular_C are unused and are
//                  the closest stand-ins, but a two-handed grip is not among them.
//
// THIS FILE DELIBERATELY DOES NOT SHIP PLACEHOLDER NUMBERS. Every number in the longsword's record
// was measured in the running lab, and handoff/39 is explicit that a second weapon re-measures
// rather than retypes. A seeded table that looked real would be indistinguishable from a measured
// one three stages from now, in a repository whose entire discipline is that you can tell the
// difference. So the measurements are null, and asking for the timings throws with the list of
// what is still missing.

export const GREATSWORD_ATTACK_STAGE = 'G1-unmeasured';
export const GREATSWORD_ATTACK_FPS = 30;

/**
 * Every slot the greatsword needs filled, in the order it can be filled. Each is null until a
 * measurement replaces it, and the note says what the measurement is OF - not what it should be.
 * @type {Record<string, { value: any, note: string }>}
 */
export const GREATSWORD_ATTACK_MEASUREMENTS = Object.freeze({
  directions: Object.freeze({
    value: null,
    note: 'Which directions the greatsword swings. The longsword has top/right/left, and guard-sector.js asserts the guard sectors share that vocabulary - a weapon with a different set needs that assertion revisited first.',
  }),
  attacks: Object.freeze({
    value: null,
    note: 'Per direction: the clip id, and contactSeconds measured in the lab as the source time at which the blade crosses the defender plane. The longsword measured 0.43 / 0.23 / 0.26.',
  }),
  naturalDurations: Object.freeze({
    value: null,
    note: 'The authored length of each clip in source seconds, read off the glb rather than chosen.',
  }),
  presentationEndSourceSeconds: Object.freeze({
    value: null,
    note: 'Only for a direction whose authored tail is unusable - R21J.1 measured the longsword RIGHT never settling. Sparse by design; most directions have no entry.',
  }),
  activeLeadSeconds: Object.freeze({
    value: null,
    note: 'How far before contact the blade becomes dangerous, per direction. The longsword measured 0.055 / 0.04 / 0.045.',
  }),
  activeTrailSeconds: Object.freeze({
    value: null,
    note: 'How far after contact it stays dangerous. Longsword: 0.065 / 0.05 / 0.055.',
  }),
  trailLeadSeconds: Object.freeze({
    value: null,
    note: 'Where the weapon trail opens, which also floors the commitment window. Longsword: 0.16 / 0.11 / 0.12.',
  }),
  trailTailSeconds: Object.freeze({
    value: null,
    note: 'Where the trail closes. Longsword: 0.12 / 0.09 / 0.10.',
  }),
  timeWarps: Object.freeze({
    value: null,
    note: 'Per direction, or none. R20M.1 warped the longsword LEFT and RIGHT because their peaks ran three to four times a real cut. A slow weapon may need no warp at all - that is a measurement, not a default.',
  }),
  clipSourceFor: Object.freeze({
    value: null,
    note: 'Which animation pack a clip id belongs to. The longsword resolves UAL1 vs UAL2 by prefix; a greatsword drawing from a third pack needs its own resolver rather than a branch in that one.',
  }),
  tempoScale: Object.freeze({
    value: null,
    note: 'Optional. ATTACK_TEMPO_SCALE_RANGE is 1 to 3 and a scale below 1 is refused, so tempo can only make a weapon SLOWER - which is the direction a greatsword wants. Whether it needs any is a question for after the clips exist.',
  }),
});

export function missingGreatswordMeasurements() {
  return Object.entries(GREATSWORD_ATTACK_MEASUREMENTS)
    .filter(([, slot]) => slot.value == null)
    .map(([name]) => name);
}

export function greatswordAttackMeasurementsAreComplete() {
  return missingGreatswordMeasurements().length === 0;
}

// Throws until the measurements exist, and the error is the checklist. Deliberately not a warning:
// a greatsword built from nulls would produce NaN landmarks that the ordering invariants in
// tests/the-attack-timings-are-pinned-g1.test.js would catch, but only if someone thought to run
// them against it - and by then the numbers would be in a commit.
export function createGreatswordAttackTimings() {
  const missing = missingGreatswordMeasurements();
  if (missing.length > 0) {
    throw new Error(
      `${GREATSWORD_ATTACK_STAGE}: the greatsword has no measurements yet. Missing: ${missing.join(', ')}. `
      + 'See handoff/40_greatsword_asset_requirements.md - the mesh and the animations have to exist before any of these can be measured.',
    );
  }
  const m = GREATSWORD_ATTACK_MEASUREMENTS;
  return createDirectionalAttackTimings({
    weapon: 'greatsword',
    stage: GREATSWORD_ATTACK_STAGE,
    fps: GREATSWORD_ATTACK_FPS,
    directions: m.directions.value,
    attacks: m.attacks.value,
    naturalDurations: m.naturalDurations.value,
    presentationEndSourceSeconds: m.presentationEndSourceSeconds.value,
    activeLeadSeconds: m.activeLeadSeconds.value,
    activeTrailSeconds: m.activeTrailSeconds.value,
    trailLeadSeconds: m.trailLeadSeconds.value,
    trailTailSeconds: m.trailTailSeconds.value,
    getTimeWarp: (direction) => m.timeWarps.value?.[direction] ?? null,
    actionIdPrefix: 'greatsword_light',
    clipSourceFor: m.clipSourceFor.value,
  });
}
