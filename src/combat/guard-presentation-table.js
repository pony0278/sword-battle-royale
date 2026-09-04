// @ts-check
import { GUARD_STATES } from './guard-states.js';

// S1.C2, step 4 of four — how a weapon's guard states are presented, as a function of that weapon.
//
// Lifted out of guard-state-machine.js unchanged in behaviour. What used to happen there happened
// once, when the module loaded, from four longsword imports: the state machine could hold exactly
// one weapon's presentation and it was decided before anything ran. handoff/39 recorded that as the
// second of the two category-C blockers.
//
// Everything a weapon owns is a parameter here, and this module imports nothing but the vocabulary.
// That is deliberate rather than tidy: guard-transition-presentation.js imports
// longsword-guard-metadata.js, so a builder that reached for GUARD_TRANSITION_PROFILE_IDS itself
// would close a cycle the moment a weapon's module imported the builder. Taking the ids as an
// argument means the dependency runs one way, from the weapon down to here, for every weapon.
//
// The two authored stages are parameters for the same reason the clips are: 'G3.2' and 'G3.3.2' are
// when THIS weapon's transitions and reactions were authored, and a second weapon authored at a
// different stage says so rather than inheriting the longsword's provenance.

/**
 * @param {object} weapon
 * @param {{ clipId: string, correctionLayerId: string }} weapon.base
 * @param {{ authored: boolean, authoredStage: string }} weapon.authoringState
 * @param {{ ENTER: string, RECOVER: string, EXIT: string }} weapon.transitionProfileIds
 * @param {Record<string, any>} weapon.reactionProfiles keyed by reaction variant
 * @param {{ BLOCK_HIT: string, PARRY: string, PERFECT_PARRY: string }} weapon.reactionVariants
 * @param {Record<string, any>} weapon.counterProfile
 * @param {string} weapon.guardMountProfileId the mount every guard state but the counter is held at
 * @param {string} weapon.transitionAuthoredStage
 * @param {string} weapon.reactionAuthoredStage
 */
export function createGuardPresentationTable({
  base,
  authoringState,
  transitionProfileIds,
  reactionProfiles,
  reactionVariants,
  counterProfile,
  guardMountProfileId,
  transitionAuthoredStage,
  reactionAuthoredStage,
}) {
  function authoredGuardTransition(role, transitionProfileId) {
    return Object.freeze({
      role,
      clipId: base.clipId,
      correctionLayerId: base.correctionLayerId,
      correctionAuthoredStage: authoringState.authoredStage,
      transitionProfileId,
      weaponMountProfileId: guardMountProfileId,
      authored: true,
      authoredStage: transitionAuthoredStage,
      inPlace: true,
      loop: true,
    });
  }

  function authoredGuardReaction(role, profile, extra = {}) {
    return Object.freeze({
      role,
      clipId: profile.clipId,
      correctionLayerId: base.correctionLayerId,
      correctionAuthoredStage: authoringState.authoredStage,
      reactionProfileId: profile.id,
      reactionVariant: profile.variant,
      sourceWindow: profile.sourceWindow,
      counterWindowSeconds: profile.counterWindowSeconds,
      completionEvent: profile.completionEvent,
      weaponMountProfileId: guardMountProfileId,
      authored: true,
      authoredStage: reactionAuthoredStage,
      inPlace: true,
      loop: false,
      ...extra,
    });
  }

  // The one state that does NOT take guardMountProfileId: a counter is a KayKit swing rather than a
  // Skyrim hold, and weapon-mount-policy.js decides the mount from whichever family is posing the
  // hand. So the counter carries its profile's own mount, and always has.
  function authoredGuardCounter() {
    return Object.freeze({
      role: 'guard-counter',
      clipId: counterProfile.clipId,
      counterProfileId: counterProfile.id,
      sourceFamily: counterProfile.sourceFamily,
      completionEvent: counterProfile.completionEvent,
      correctionWeight: counterProfile.correctionWeight,
      weaponMountProfileId: counterProfile.weaponMountProfileId,
      authored: true,
      authoredStage: counterProfile.authoredStage,
      inPlace: counterProfile.inPlace,
      loop: counterProfile.loop,
    });
  }

  const blockHitProfile = reactionProfiles[reactionVariants.BLOCK_HIT];
  const parryProfile = reactionProfiles[reactionVariants.PARRY];
  const perfectParryProfile = reactionProfiles[reactionVariants.PERFECT_PARRY];

  return Object.freeze({
    // NEUTRAL is not a weapon's: standing with nothing raised plays no clip and is authored by
    // nobody. It is the fallback getGuardPresentation returns for an unknown state, so every
    // weapon's table has it and every weapon's is identical.
    [GUARD_STATES.NEUTRAL]: Object.freeze({
      role: 'neutral',
      clipId: null,
      authored: false,
      inPlace: true,
      loop: true,
    }),
    [GUARD_STATES.ENTER]: authoredGuardTransition('guard-enter', transitionProfileIds.ENTER),
    [GUARD_STATES.HOLD]: Object.freeze({
      role: 'guard-hold',
      clipId: base.clipId,
      correctionLayerId: base.correctionLayerId,
      correctionAuthoredStage: authoringState.authoredStage,
      weaponMountProfileId: guardMountProfileId,
      authored: authoringState.authored === true,
      authoredStage: authoringState.authoredStage,
      inPlace: true,
      loop: true,
    }),
    [GUARD_STATES.BLOCK_HIT]: authoredGuardReaction('block-hit', blockHitProfile),
    [GUARD_STATES.PARRY]: authoredGuardReaction('parry-reaction', parryProfile, {
      variants: Object.freeze({
        [reactionVariants.PARRY]: Object.freeze({
          clipId: parryProfile.clipId,
          reactionProfileId: parryProfile.id,
        }),
        [reactionVariants.PERFECT_PARRY]: Object.freeze({
          clipId: perfectParryProfile.clipId,
          reactionProfileId: perfectParryProfile.id,
        }),
      }),
    }),
    [GUARD_STATES.COUNTER]: authoredGuardCounter(),
    [GUARD_STATES.RECOVER]: authoredGuardTransition('guard-recover', transitionProfileIds.RECOVER),
    [GUARD_STATES.EXIT]: authoredGuardTransition('guard-exit', transitionProfileIds.EXIT),
  });
}
