const LOOP_ROTATION_GOOD_DEG = 4;
const LOOP_ROTATION_WARN_DEG = 10;
const LOOP_TRANSLATION_GOOD = 0.03;
const LOOP_TRANSLATION_WARN = 0.08;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export const SKYRIM_GUARD_VISUAL_REVIEW_ITEMS = Object.freeze([
  Object.freeze({ id: 'weight', label: 'Pelvis / foot weight', question: 'Does the lower body feel planted and combat-ready rather than floating or leaning away?' }),
  Object.freeze({ id: 'torso', label: 'Torso combat stance', question: 'Does the chest/hips relationship read as a guarded fighting stance?' }),
  Object.freeze({ id: 'weaponArm', label: 'Sword-arm usability', question: 'Can the right arm carry the longsword without severe shoulder/elbow correction?' }),
  Object.freeze({ id: 'offHand', label: 'Off-hand correction cost', question: 'Can the shield-oriented left arm become our compact free-hand guard with local upper-body corrections?' }),
  Object.freeze({ id: 'loop', label: 'Loop seam / popping', question: 'Does the authored hold loop without visible root/pelvis or major-bone popping?' }),
]);

export function classifySkyrimGuardLoopSeam(input = {}) {
  const maxRotationDegrees = Math.max(0, finite(input.maxRotationDegrees));
  const rootTranslation = Math.max(0, finite(input.rootTranslation));
  const pelvisTranslation = Math.max(0, finite(input.pelvisTranslation));
  const maxTranslation = Math.max(rootTranslation, pelvisTranslation);
  const status = maxRotationDegrees <= LOOP_ROTATION_GOOD_DEG && maxTranslation <= LOOP_TRANSLATION_GOOD
    ? 'good'
    : maxRotationDegrees <= LOOP_ROTATION_WARN_DEG && maxTranslation <= LOOP_TRANSLATION_WARN
      ? 'warning'
      : 'bad';
  return Object.freeze({ status, maxRotationDegrees, rootTranslation, pelvisTranslation, maxTranslation });
}

export function decideSkyrimGuardVisualReview(ratings = {}) {
  const normalized = Object.fromEntries(SKYRIM_GUARD_VISUAL_REVIEW_ITEMS.map(({ id }) => {
    const value = String(ratings[id] || 'pending').toLowerCase();
    return [id, ['pass', 'correct', 'fail'].includes(value) ? value : 'pending'];
  }));
  const values = Object.values(normalized);
  let decision = 'PENDING';
  if (values.every((value) => value !== 'pending')) {
    if (values.includes('fail')) decision = 'REJECT';
    else if (values.includes('correct')) decision = 'ADOPT WITH CORRECTIONS';
    else decision = 'ADOPT';
  }
  return Object.freeze({ decision, ratings: Object.freeze(normalized) });
}
