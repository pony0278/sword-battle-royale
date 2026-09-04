// @ts-check
export const LONGSWORD_ATTACK_DIRECTIONS = Object.freeze(['top', 'right', 'left']);

export const LONGSWORD_DIRECTIONAL_ATTACKS = Object.freeze({
  top: Object.freeze({
    weapon: 'longsword',
    direction: 'top',
    clipId: 'UAL1/Sword_Attack',
    contactSeconds: 0.43,
  }),
  right: Object.freeze({
    weapon: 'longsword',
    direction: 'right',
    clipId: 'UAL2/Sword_Regular_A',
    contactSeconds: 0.23,
  }),
  left: Object.freeze({
    weapon: 'longsword',
    direction: 'left',
    clipId: 'UAL2/Sword_Regular_B',
    // Measured, not assumed: the low sweep crosses the defender's plane at
    // ~0.25-0.27s; by 0.30 the tip is already in its follow-through behind
    // the attacker, so the TTC window opened ~50ms late.
    contactSeconds: 0.26,
  }),
});

export const LONGSWORD_MOTION_METADATA = Object.freeze(Object.fromEntries(
  Object.values(LONGSWORD_DIRECTIONAL_ATTACKS).map((entry) => [entry.clipId, entry]),
));

export function getLongswordMotionMetadata(clipId) {
  return LONGSWORD_MOTION_METADATA[String(clipId || '')] || null;
}

export function getCanonicalMotionContactSeconds(clipId) {
  const metadata = getLongswordMotionMetadata(clipId);
  return metadata ? metadata.contactSeconds : null;
}
