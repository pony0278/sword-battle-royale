export const R18N_UPPER_BODY_ANTICIPATION_BONES = Object.freeze(['spine', 'chest']);

export const R18N_ACTIVE_INTERCEPT_PRESERVED_BONES = Object.freeze([
  'root',
  'hips',
  'upperarm.l',
  'lowerarm.l',
  'wrist.l',
  'hand.l',
  'handslot.l',
]);

export const R18N_PREDICTIVE_PARRY_OWNERSHIP_POLICY = Object.freeze({
  stage: 'R18N.4.2',
  anticipationOwner: 'predictive-presentation',
  shieldArmOwner: 'external-active-intercept-tracking',
  anticipationBones: R18N_UPPER_BODY_ANTICIPATION_BONES,
  preservedBones: R18N_ACTIVE_INTERCEPT_PRESERVED_BONES,
  authority: 'presentation-only-ownership-split-no-contact-authority',
});
