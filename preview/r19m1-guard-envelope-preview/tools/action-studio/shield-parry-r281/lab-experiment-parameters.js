import { clampAttackTempoScale } from '../../../src/combat/attack-tempo.js';
import { SPRINT_SPEED_BRACKET_MPS, resolveSprintSpeed } from '../../../src/combat/sprint-locomotion.js';
import { resolveSprintArmClip } from '../../../src/combat/sprint-arm-overlay.js';
import { resolveWeaponMountMode } from '../../../src/combat/weapon-mount-policy.js';

export const LAB_EXPERIMENT_PARAMETERS_STAGE = 'R21V.1';

// R21V.1 - the lab's playtest dials, in one place.
//
// Four things about a run are chosen by the person doing the running rather than by the build:
// how long a swing takes (?tempo=, R21O.1), how fast a sprint travels (?sprint=, this stage),
// which run clip lends the sprint its arms (?runclip=, R21Y.1), whether the legs wear that clip
// too instead of borrowing from it (?wholebody=1, R22E.1) and whether that clip is driven by the
// clock instead of by the ground, which is the pose exactly as drawn at the price of sliding feet
// (?footslide=1, R22F.1).
// They were going to be two consts and two imports in the entry, which sits one code line under the
// budget that shield-parry-r281-thin-entry-audit.test.js keeps - and that test says in as many
// words that the next thing to hit it should move code out rather than move the number. So this is
// that: reading a dial, clamping it and naming what the clamp did is not composition, and the entry
// keeps one line for both.
//
// Neither dial changes what ships. The defaults are the shipped values, so a plain URL is the game;
// every verdict below exists so a tally taken under an override cannot be mistaken for one taken
// under the build. Three bad tallies this cycle were bad because a condition nobody had written
// down was different, and the fix each time was to write the condition into the report.
export function readLabExperimentParameters(query) {
  const read = (key) => (typeof query?.get === 'function' ? query.get(key) : null);
  const sprint = resolveSprintSpeed(read('sprint'));
  // R21Y.1: Running_A or Running_B. An unmeasured name resolves to the default rather than being
  // taken on trust - a clip with no measured foot contact has no phase offset, and an unaligned
  // overlay swings the arms against the feet.
  const arms = resolveSprintArmClip(read('runclip'));
  // R22E.1: hands the LEGS to the run above the measured transition, which is what R20W.2 did and
  // R21U.1 undid. Off unless asked for, and asked for only to be looked at: at the shipped 1.5 m/s
  // the run's stride gives it 0.52 steps per second against a walking person's two, so it plays at
  // a fifth speed. The switch exists because that is easier to believe once seen.
  // R22G.1: these ship on now, so the switch reads the other way - ?wholebody=0 and ?footslide=0
  // restore the pre-R22E.1 gait exactly. Anything else, including absent, is the build.
  const wholeBodyRun = read('wholebody') !== '0';
  // R22F.1: play the run at the rate it was DRAWN at instead of driving it by distance, so the
  // pose and cadence are exactly the clip's - and the feet slide by the difference between the
  // clip's authored speed and the game's. Only meaningful with ?wholebody=1, since without it the
  // legs are not wearing the run at all.
  const runPlaybackAuthored = wholeBodyRun && read('footslide') !== '0';
  // R23E.1: how the PLAYER's sword sits in their hand. ?mount=kaykit holds it at the attacker's
  // mount, ?mount=skyrim holds it at the Skyrim-calibrated one, and anything else - including
  // absent - is `follow`, the mount that changes with whichever authoring family is posing the
  // hand. R23K.1 made follow the default: under the Skyrim mount the player's LEFT reached 2.4m
  // against a 2.4m stance and landed 3 swings in 7; following the hand it reaches 2.6m like the
  // opponent's does. The numbers are in src/combat/weapon-mount-policy.js.
  //
  // The player's, and only the player's. The attacker's blade is the surface every contact
  // measurement of the opponent's swing is taken from, and swapping their mount moves the swept
  // polyline's far point 0.608m against a 27.5cm shield - a different fight, not a different look.
  const mount = resolveWeaponMountMode(read('mount'));
  return Object.freeze({
    stage: LAB_EXPERIMENT_PARAMETERS_STAGE,
    tempoScale: clampAttackTempoScale(read('tempo')),
    sprintSpeedMps: sprint.speedMps,
    // Past the ceiling the sprint out-travels the dodge's own authored burst, which is the thing
    // SPRINT_SPEED_BRACKET_MPS exists to prevent. Allowed - the point of the dial is to find out
    // whether that bracket is defending anything a player can feel - but never silently.
    sprintInsideBracket: sprint.insideBracket,
    sprintReason: sprint.reason,
    sprintBracketMps: SPRINT_SPEED_BRACKET_MPS,
    sprintArmClipId: arms.clipId,
    sprintArmClipReason: arms.reason,
    sprintArmPhaseOffset: arms.phaseOffset,
    wholeBodyRun,
    runPlaybackAuthored,
    weaponMountMode: mount.mode,
    weaponMountReason: mount.reason,
    authority: 'playtest-parameters-only-no-contact-authority',
  });
}
