import { clampAttackTempoScale } from '../../../src/combat/attack-tempo.js';
import { SPRINT_SPEED_BRACKET_MPS, resolveSprintSpeed } from '../../../src/combat/sprint-locomotion.js';

export const LAB_EXPERIMENT_PARAMETERS_STAGE = 'R21V.1';

// R21V.1 - the lab's playtest dials, in one place.
//
// Two things about a run are chosen by the person doing the running rather than by the build:
// how long a swing takes (?tempo=, R21O.1) and how fast a sprint travels (?sprint=, this stage).
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
    authority: 'playtest-parameters-only-no-contact-authority',
  });
}
