// @ts-check
import { createDirectionalAttackTimings } from './directional-attack-timings.js';
import { ATTACK_DIRECTIONS } from './attack-directions.js';
import { LONGSWORD_DIRECTIONAL_ATTACKS } from './longsword-directional-metadata.js';
import { getAttackTimeWarp } from './attack-time-warp.js';

// G1, step 3 of four — the longsword's attack measurements, where the longsword lives.
//
// Six tables, every number of them measured against the clips rather than chosen. They moved here
// out of longsword-directional-attack-runtime.js, which now asks this record for its profiles
// instead of holding them. A greatsword is a file shaped exactly like this one with different
// numbers, and the runtime does not change to gain it.

export const LONGSWORD_ATTACK_STAGE = 'G4.1';
export const LONGSWORD_ATTACK_FPS = 30;

// The authored length of each clip, in source seconds.
const NATURAL_DURATIONS = Object.freeze({
  top: 1.533,
  right: 0.433,
  left: 0.533,
});

// R21J.1 — where the presentation stops sampling the clip, when its authored tail is unusable.
// Only RIGHT has one: reported from play as "does not settle after the swing, it looks like a
// dropped frame", and measured as a blade axis that never stops moving through the tail.
export const PRESENTATION_END_SOURCE_SECONDS = Object.freeze({
  right: 0.31,
});

// The four windows around contact, in source seconds. Each is an offset from that direction's
// contact, which is why they are small and why they differ per direction rather than per weapon:
// a faster swing needs a tighter window to read as the same thing on screen.
const ACTIVE_LEAD_SECONDS = Object.freeze({ top: 0.055, right: 0.04, left: 0.045 });
const ACTIVE_TRAIL_SECONDS = Object.freeze({ top: 0.065, right: 0.05, left: 0.055 });
const TRAIL_LEAD_SECONDS = Object.freeze({ top: 0.16, right: 0.11, left: 0.12 });
const TRAIL_TAIL_SECONDS = Object.freeze({ top: 0.12, right: 0.09, left: 0.10 });

// Which animation pack a clip came from. A heuristic on the clip id, and the longsword's: it draws
// from UAL1 and UAL2 and from nothing else, so anything not marked UAL1 is UAL2. A weapon that
// draws from a third pack needs its own resolver rather than an extra branch in this one.
function longswordClipSource(clipId) {
  return String(clipId).startsWith('UAL1/') ? 'ual1' : 'ual2';
}

export const LONGSWORD_ATTACK_TIMINGS = createDirectionalAttackTimings({
  weapon: 'longsword',
  stage: LONGSWORD_ATTACK_STAGE,
  fps: LONGSWORD_ATTACK_FPS,
  directions: ATTACK_DIRECTIONS,
  attacks: LONGSWORD_DIRECTIONAL_ATTACKS,
  naturalDurations: NATURAL_DURATIONS,
  presentationEndSourceSeconds: PRESENTATION_END_SOURCE_SECONDS,
  activeLeadSeconds: ACTIVE_LEAD_SECONDS,
  activeTrailSeconds: ACTIVE_TRAIL_SECONDS,
  trailLeadSeconds: TRAIL_LEAD_SECONDS,
  trailTailSeconds: TRAIL_TAIL_SECONDS,
  // R20M.1's warps, which are this weapon's: LEFT rotates 132 degrees inside the single key
  // interval containing its own contact, and RIGHT lands 0.1ms late through the same arithmetic.
  // A greatsword's clips have their own shape and will need their own warps or none.
  getTimeWarp: getAttackTimeWarp,
  actionIdPrefix: 'longsword_light',
  clipSourceFor: longswordClipSource,
});
