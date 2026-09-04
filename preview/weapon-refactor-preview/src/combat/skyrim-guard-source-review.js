function guardClip(id, sourceFile, label, intent, defaultPreviewMode = 'once', holdStrategy = 'not-a-hold') {
  return Object.freeze({
    id,
    source: 'skyrim',
    sourceFile,
    clipId: `SKYRIM_GUARD/${sourceFile.replace(/\.hkx$/i, '')}`,
    label,
    intent,
    defaultPreviewMode,
    holdStrategy,
  });
}

export const SKYRIM_GUARD_SOURCE_REVIEW = Object.freeze({
  enter: guardClip(
    'enter',
    'shd_blockanticipate.hkx',
    'Guard Enter',
    'transition from neutral into the authored shield-block stance',
  ),
  hold: guardClip(
    'hold',
    'shd_blockidle.hkx',
    'Guard Hold',
    'primary authored full-body guard hold candidate',
    'loop',
    'authored-loop-candidate',
  ),
  blockHit: guardClip(
    'blockHit',
    'shd_blockhit.hkx',
    'Block Hit',
    'base successful block recoil candidate',
  ),
  blockHitA: guardClip(
    'blockHitA',
    'shd_blockhit_vara.hkx',
    'Block Hit A',
    'successful block recoil variation A',
  ),
  blockHitB: guardClip(
    'blockHitB',
    'shd_blockhit_varb.hkx',
    'Block Hit B',
    'successful block recoil variation B',
  ),
  perfectGuard: guardClip(
    'perfectGuard',
    'shd_blocktimed.hkx',
    'Perfect Guard',
    'timed block / parry reaction candidate',
  ),
  counterIntro: guardClip(
    'counterIntro',
    'shd_blockbashintro.hkx',
    'Counter Intro',
    'guard-counter anticipation / transition candidate',
  ),
  counter: guardClip(
    'counter',
    'shd_blockbash.hkx',
    'Guard Counter',
    'standard guard bash / counter candidate',
  ),
  heavyCounter: guardClip(
    'heavyCounter',
    'shd_blockbashpower.hkx',
    'Heavy Counter',
    'heavy guard bash / power counter candidate',
  ),
  sprintCounter: guardClip(
    'sprintCounter',
    'shd_blockbashsprint.hkx',
    'Sprint Counter',
    'forward-moving guard bash candidate; optional for the first combat lab',
  ),
});

export const SKYRIM_GUARD_REVIEW_CLIPS = Object.freeze(Object.values(SKYRIM_GUARD_SOURCE_REVIEW));

export function getSkyrimGuardReviewClip(clipId) {
  const normalized = String(clipId || '');
  return SKYRIM_GUARD_REVIEW_CLIPS.find((entry) => entry.clipId === normalized) || null;
}

export function getSkyrimGuardReviewSourceFile(sourceFile) {
  const normalized = String(sourceFile || '').toLowerCase();
  return SKYRIM_GUARD_REVIEW_CLIPS.find((entry) => entry.sourceFile.toLowerCase() === normalized) || null;
}
