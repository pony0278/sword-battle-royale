export const KAYKIT_GUARD_SOURCE_REVIEW = Object.freeze({
  enter: Object.freeze({
    id: 'enter',
    clipId: 'Melee_Block',
    label: 'Guard Enter',
    intent: 'one-shot transition into guard',
    defaultPreviewMode: 'once',
    holdStrategy: 'not-a-hold',
  }),
  hold: Object.freeze({
    id: 'hold',
    clipId: 'Melee_Blocking',
    label: 'Guard Hold',
    intent: 'authored full-body guard base candidate',
    defaultPreviewMode: 'loop',
    holdStrategy: 'authored-loop-candidate',
  }),
  blockHit: Object.freeze({
    id: 'blockHit',
    clipId: 'Melee_Block_Hit',
    label: 'Block Hit',
    intent: 'successful block reaction candidate',
    defaultPreviewMode: 'once',
    holdStrategy: 'not-a-hold',
  }),
  counter: Object.freeze({
    id: 'counter',
    clipId: 'Melee_Block_Attack',
    label: 'Guard Counter',
    intent: 'counter-attack candidate after block/parry',
    defaultPreviewMode: 'once',
    holdStrategy: 'not-a-hold',
  }),
});

export const KAYKIT_GUARD_REVIEW_CLIPS = Object.freeze([
  KAYKIT_GUARD_SOURCE_REVIEW.enter,
  KAYKIT_GUARD_SOURCE_REVIEW.hold,
  KAYKIT_GUARD_SOURCE_REVIEW.blockHit,
  KAYKIT_GUARD_SOURCE_REVIEW.counter,
]);

export function getKayKitGuardReviewClip(clipId) {
  const normalized = String(clipId || '');
  return KAYKIT_GUARD_REVIEW_CLIPS.find((entry) => entry.clipId === normalized) || null;
}
