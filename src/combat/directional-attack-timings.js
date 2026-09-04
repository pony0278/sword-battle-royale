// @ts-check
import { createActionDefinition } from './action-definition.js';
import { warpSourceToRuntime } from './attack-time-warp.js';
import { clampAttackTempoScale, DEFAULT_ATTACK_TEMPO_SCALE } from './attack-tempo.js';

// G1, step 2 of four — a weapon's directional attacks, derived from that weapon's measurements.
//
// Lifted out of longsword-directional-attack-runtime.js unchanged in behaviour. That module held
// SIX tables of per-direction numbers - the natural durations, the presentation trim, and the four
// windows around contact - all resolved at import, which meant one weapon's attacks for the whole
// process. handoff/39 listed them as category A, the data that a second weapon must re-measure
// rather than retype, and this is the function it re-measures them into.
//
// Every landmark below is derived in SOURCE time, because that is the clock the clips were authored
// against, and then restated in runtime through toRuntime. R20M.1 is why: a direction with a warp
// counts differently from one without, and TOP has none while RIGHT and LEFT do. The tempo reaches
// every landmark through the same call, so contact, the active window, the trail, the commitment
// marker and the usable length keep their relationships exactly and only move together.
//
// THREE NUMBERS ARE STILL INLINE, and they are marked rather than parameterised because nothing in
// the repository says which they are. `Math.max(0.11, trailLead)` floors the commitment window,
// `+ 0.04` closes it after contact, and the cancel marker takes the later of the active end and
// `duration - min(0.16, duration * 0.28)`. They arrived without comment and they are policy-shaped
// rather than measurement-shaped - the same for any weapon - so they stay here. If a greatsword's
// commitment window reads wrong, this is the first place to look, and the fix is to make whichever
// of the three is actually the longsword's into a parameter.

/**
 * @param {object} timings
 * @param {string} timings.weapon
 * @param {string} timings.stage
 * @param {number} timings.fps
 * @param {readonly string[]} timings.directions
 * @param {Record<string, { clipId: string, contactSeconds: number }>} timings.attacks
 * @param {Record<string, number>} timings.naturalDurations
 * @param {Record<string, number>} timings.presentationEndSourceSeconds where an authored tail is unusable
 * @param {Record<string, number>} timings.activeLeadSeconds
 * @param {Record<string, number>} timings.activeTrailSeconds
 * @param {Record<string, number>} timings.trailLeadSeconds
 * @param {Record<string, number>} timings.trailTailSeconds
 * @param {(direction: string) => any} timings.getTimeWarp
 * @param {string} timings.actionIdPrefix
 * @param {(clipId: string) => string} timings.clipSourceFor
 */
export function createDirectionalAttackTimings({
  weapon,
  stage,
  fps: defaultFps,
  directions,
  attacks,
  naturalDurations,
  presentationEndSourceSeconds,
  activeLeadSeconds,
  activeTrailSeconds,
  trailLeadSeconds,
  trailTailSeconds,
  getTimeWarp,
  actionIdPrefix,
  clipSourceFor,
}) {
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function frameFloor(seconds, fps) {
    return Math.max(0, Math.floor(seconds * fps + 1e-9));
  }

  function frameCeil(seconds, fps) {
    return Math.max(0, Math.ceil(seconds * fps - 1e-9));
  }

  function directionEntry(direction) {
    const key = String(direction || '').toLowerCase();
    const entry = attacks[key];
    if (!entry) throw new Error(`Unknown ${weapon} attack direction: ${direction}`);
    return { key, entry };
  }

  function getProfile(direction, options = {}) {
    const { key, entry } = directionEntry(direction);
    const sourceDurationSeconds = Math.max(0.001, Number(options.durationSeconds) || naturalDurations[key]);
    const timeWarp = options.timeWarp === null ? null : (options.timeWarp || getTimeWarp(key));
    const tempoScale = clampAttackTempoScale(options.tempoScale ?? DEFAULT_ATTACK_TEMPO_SCALE);
    const toRuntime = (seconds) => warpSourceToRuntime(seconds, timeWarp, tempoScale);
    // R21J.1: the clip may be abandoned before it ends, but never extended past it, and never
    // trimmed back over anything the exchange is calibrated against - the trim is refused if it
    // would land at or before contact.
    const presentationEnd = presentationEndSourceSeconds[key];
    const usableSourceSeconds = presentationEnd != null
      && presentationEnd > entry.contactSeconds
      && presentationEnd < sourceDurationSeconds
      ? presentationEnd
      : sourceDurationSeconds;
    const durationSeconds = toRuntime(usableSourceSeconds);
    const contactSeconds = toRuntime(clamp(entry.contactSeconds, 0, sourceDurationSeconds));
    const activeStartSeconds = toRuntime(clamp(entry.contactSeconds - activeLeadSeconds[key], 0, sourceDurationSeconds));
    const activeEndSeconds = Math.max(activeStartSeconds, toRuntime(clamp(entry.contactSeconds + activeTrailSeconds[key], 0, sourceDurationSeconds)));
    const trailStartSeconds = toRuntime(clamp(entry.contactSeconds - trailLeadSeconds[key], 0, sourceDurationSeconds));
    const trailEndSeconds = Math.max(trailStartSeconds, toRuntime(clamp(entry.contactSeconds + trailTailSeconds[key], 0, sourceDurationSeconds)));
    const movementStartSeconds = toRuntime(clamp(entry.contactSeconds - Math.max(0.11, trailLeadSeconds[key]), 0, sourceDurationSeconds));
    const movementEndSeconds = Math.max(movementStartSeconds, toRuntime(clamp(entry.contactSeconds + 0.04, 0, sourceDurationSeconds)));
    const cancelStartSeconds = clamp(Math.max(activeEndSeconds, durationSeconds - Math.min(0.16, durationSeconds * 0.28)), 0, durationSeconds);
    return Object.freeze({
      timeWarp,
      tempoScale,
      sourceDurationSeconds,
      stage,
      weapon,
      category: 'attack',
      direction: key,
      clipId: entry.clipId,
      source: clipSourceFor(entry.clipId),
      durationSeconds,
      contactSeconds,
      activeStartSeconds,
      activeEndSeconds,
      trailStartSeconds,
      trailEndSeconds,
      movementStartSeconds,
      movementEndSeconds,
      cancelStartSeconds,
      inPlace: true,
      rootRotationPolicy: 'lock',
    });
  }

  function createDefinition(direction, options = {}) {
    const fps = Math.max(1, Number(options.fps) || defaultFps);
    const profile = getProfile(direction, options);
    const maxFrame = frameCeil(profile.durationSeconds, fps);
    const action = createActionDefinition({
      id: `${actionIdPrefix}_${profile.direction}`,
      clipId: profile.clipId,
      category: 'attack',
      animationBinding: {
        source: profile.source,
        clipId: profile.clipId,
        speed: 1,
        inPlace: true,
        loop: false,
        blendInSeconds: 0.04,
        blendOutSeconds: 0.08,
      },
      windows: {
        active: [{
          startFrame: frameFloor(profile.activeStartSeconds, fps),
          endFrame: frameCeil(profile.activeEndSeconds, fps),
          label: `${profile.direction} sword contact`,
        }],
        movement: [{
          startFrame: frameFloor(profile.movementStartSeconds, fps),
          endFrame: frameCeil(profile.movementEndSeconds, fps),
          label: `${profile.direction} attack commitment`,
        }],
        weaponTrail: [{
          startFrame: frameFloor(profile.trailStartSeconds, fps),
          endFrame: frameCeil(profile.trailEndSeconds, fps),
          label: `${profile.direction} sword trail`,
        }],
        cancel: [{
          startFrame: frameFloor(profile.cancelStartSeconds, fps),
          endFrame: maxFrame,
          label: `${profile.direction} recovery cancel`,
        }],
      },
    }, maxFrame);
    return Object.freeze({
      ...action,
      direction: profile.direction,
      runtime: profile,
      fps,
      durationFrames: maxFrame,
    });
  }

  return Object.freeze({
    weapon,
    stage,
    fps: defaultFps,
    directions,
    // Which animation clips this weapon's moves actually name. The asset loaders take this, so
    // adding a direction loads its clip and removing one stops loading it, without a second list
    // anywhere to keep in step - which is the failure mode every hand-maintained clip list has.
    clipIds: Object.freeze([...new Set(directions.map((direction) => attacks[direction]?.clipId).filter(Boolean))]),
    getProfile,
    createDefinition,
    definitions: Object.freeze(Object.fromEntries(
      directions.map((direction) => [direction, createDefinition(direction)]),
    )),
  });
}
