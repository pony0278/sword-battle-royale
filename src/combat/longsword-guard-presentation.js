// @ts-check
import { createGuardPresentationTable } from './guard-presentation-table.js';
import {
  LONGSWORD_GUARD_BASE,
  LONGSWORD_GUARD_AUTHORING_STATE,
} from './longsword-guard-metadata.js';
import { GUARD_TRANSITION_PROFILE_IDS } from './guard-transition-presentation.js';
import {
  GUARD_REACTION_VARIANTS,
  LONGSWORD_GUARD_REACTION_PROFILES,
} from './guard-reaction-presentation.js';
import {
  GUARD_WEAPON_MOUNT_PROFILE_IDS,
  LONGSWORD_GUARD_COUNTER_PROFILE,
} from './guard-counter-presentation.js';

// S1.C2, step 4 of four — the longsword's guard presentation, assembled where the longsword lives.
//
// This is the whole of what guard-state-machine.js used to do at module load, moved to the weapon
// that owns it. The state machine now imports one already-built table instead of four sources it
// had to combine, and a second weapon is a second file shaped exactly like this one - the machine
// does not change to gain it.
//
// A NEW module rather than a section of longsword-guard-metadata.js, and the reason is a cycle:
// guard-transition-presentation.js imports longsword-guard-metadata.js, so putting the assembly
// there would make the metadata module depend on something that depends on it.
// longsword-guard-metadata.js keeps its zero imports and stays what it is - measured data - while
// the assembly that reads it lives one level up.
export const LONGSWORD_GUARD_PRESENTATION = createGuardPresentationTable({
  base: LONGSWORD_GUARD_BASE,
  authoringState: LONGSWORD_GUARD_AUTHORING_STATE,
  transitionProfileIds: GUARD_TRANSITION_PROFILE_IDS,
  reactionProfiles: LONGSWORD_GUARD_REACTION_PROFILES,
  reactionVariants: GUARD_REACTION_VARIANTS,
  counterProfile: LONGSWORD_GUARD_COUNTER_PROFILE,
  // Every guard state but the counter is held at the Skyrim-calibrated mount; the counter carries
  // its own, which is KayKit's. weapon-mount-policy.js is where that difference is measured.
  guardMountProfileId: GUARD_WEAPON_MOUNT_PROFILE_IDS.SKYRIM_GUARD,
  // When this weapon's transitions and reactions were authored. Provenance, not behaviour - and
  // the longsword's, which is why it is written here rather than in the builder.
  transitionAuthoredStage: 'G3.2',
  reactionAuthoredStage: 'G3.3.2',
});
