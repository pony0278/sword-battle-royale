import { sanitizeAnimationTargetName } from './animation-target-name.js';
import {
  G36_POWER_PARRY_TORSO_SAFETY_LIMITS_DEGREES,
  PRODUCTION_PARRY_DEFLECT_PHASES,
  sampleProductionParryDeflectTimeline,
} from './parry-contact-deflect-runtime-clip.js';

export const PARRY_UPPER_BODY_CONTINUITY_STAGE = 'G3.6';

// G3.6 preserves the T3.3 contact-relative rebase, but deliberately widens
// the torso envelope so Power Bash keeps its authored shoulder/chest action.
// This is a safety cap against basis jumps, not an animation-style clamp.
export const PARRY_UPPER_BODY_CONTINUITY_LIMITS_DEGREES = G36_POWER_PARRY_TORSO_SAFETY_LIMITS_DEGREES;

function canSampleTrack(track) {
  return Boolean(
    track?.name
    && track?.times?.length
    && track?.values?.length
    && typeof track.getValueSize === 'function'
    && typeof track.createInterpolant === 'function'
  );
}

function trackTargetName(trackName) {
  const value = String(trackName || '');
  const propertyIndex = value.lastIndexOf('.');
  return sanitizeAnimationTargetName(propertyIndex < 0 ? value : value.slice(0, propertyIndex));
}

function trackPropertyName(trackName) {
  const value = String(trackName || '');
  const propertyIndex = value.lastIndexOf('.');
  return propertyIndex < 0 ? '' : value.slice(propertyIndex + 1);
}

function resolveLimits(input) {
  return input && typeof input === 'object'
    ? input
    : PARRY_UPPER_BODY_CONTINUITY_LIMITS_DEGREES;
}

export function parryUpperBodyContinuityLimitDegrees(trackName, limits = PARRY_UPPER_BODY_CONTINUITY_LIMITS_DEGREES) {
  if (trackPropertyName(trackName) !== 'quaternion') return null;
  const target = trackTargetName(trackName);
  const limit = resolveLimits(limits)[target];
  return Number.isFinite(limit) ? limit : null;
}

function sampleTrack(track, timeSeconds, durationSeconds) {
  if (!canSampleTrack(track)) return null;
  const time = Math.max(0, Math.min(Number(timeSeconds) || 0, Math.max(0, Number(durationSeconds) || 0)));
  const value = track.createInterpolant().evaluate(time);
  return Array.from(value).slice(0, track.getValueSize());
}

function quaternionFromArray(THREE, value) {
  return new THREE.Quaternion(value[0], value[1], value[2], value[3]).normalize();
}

function quaternionArray(value) {
  return [value.x, value.y, value.z, value.w];
}

function shortestQuaternion(value) {
  if (value.w >= 0) return value;
  value.set(-value.x, -value.y, -value.z, -value.w);
  return value;
}

function clampQuaternionDelta(THREE, delta, maxDegrees) {
  const normalized = shortestQuaternion(delta.clone().normalize());
  const angle = 2 * Math.acos(Math.max(-1, Math.min(1, normalized.w)));
  const maxRadians = THREE.MathUtils.degToRad(maxDegrees);
  if (!(angle > maxRadians) || angle < 1e-8) return normalized;
  return new THREE.Quaternion().identity().slerp(normalized, maxRadians / angle).normalize();
}

function contactRelativeQuaternion(THREE, contactBase, deflectBase, deflectValue, maxDegrees) {
  const contact = quaternionFromArray(THREE, contactBase);
  const sourceBase = quaternionFromArray(THREE, deflectBase);
  const sourceValue = quaternionFromArray(THREE, deflectValue);
  const delta = sourceBase.clone().invert().multiply(sourceValue).normalize();
  const limitedDelta = clampQuaternionDelta(THREE, delta, maxDegrees);
  return quaternionArray(contact.multiply(limitedDelta).normalize());
}

function blendQuaternion(THREE, from, to, alpha) {
  const value = quaternionFromArray(THREE, from);
  value.slerp(quaternionFromArray(THREE, to), Math.max(0, Math.min(1, Number(alpha) || 0)));
  return quaternionArray(value.normalize());
}

function writeTrackValue(track, keyIndex, value) {
  const size = track.getValueSize();
  const offset = keyIndex * size;
  for (let component = 0; component < size; component += 1) {
    track.values[offset + component] = value[component] ?? track.values[offset + component];
  }
}

function stabilizedValueForTimeline(
  THREE,
  timeline,
  contactBase,
  deflectBase,
  deflectTrack,
  deflectDuration,
  maxDegrees,
) {
  if (timeline.phase === PRODUCTION_PARRY_DEFLECT_PHASES.CONTACT
    || timeline.phase === PRODUCTION_PARRY_DEFLECT_PHASES.CONTACT_HOLD) return null;

  if (timeline.phase === PRODUCTION_PARRY_DEFLECT_PHASES.BLEND) {
    const deflectValue = sampleTrack(deflectTrack, timeline.toSourceTimeSeconds, deflectDuration);
    if (!deflectValue) return null;
    const target = contactRelativeQuaternion(THREE, contactBase, deflectBase, deflectValue, maxDegrees);
    return blendQuaternion(THREE, contactBase, target, timeline.blendAlpha);
  }

  const deflectValue = sampleTrack(deflectTrack, timeline.sourceTimeSeconds, deflectDuration);
  if (!deflectValue) return null;
  return contactRelativeQuaternion(THREE, contactBase, deflectBase, deflectValue, maxDegrees);
}

export function stabilizeProductionParryUpperBodyClip(THREE, clip, sourceClipMap) {
  const metadata = clip?.userData?.productionParryDeflect;
  if (!metadata?.productionEnabled || !clip?.tracks?.length || !THREE?.Quaternion) return clip;

  const contactClip = sourceClipMap?.get?.(metadata.contactClipId) || null;
  const deflectClip = sourceClipMap?.get?.(metadata.deflectClipId) || null;
  if (!contactClip || !deflectClip) {
    throw new Error(`${PARRY_UPPER_BODY_CONTINUITY_STAGE} requires contact + Power Bash source clips`);
  }

  const limitsDegrees = resolveLimits(metadata.upperBodySafetyLimitsDegrees);
  const contactTracks = new Map((contactClip.tracks || []).map((track) => [track.name, track]));
  const deflectTracks = new Map((deflectClip.tracks || []).map((track) => [track.name, track]));
  const stabilizedTracks = [];

  for (const track of clip.tracks) {
    const maxDegrees = parryUpperBodyContinuityLimitDegrees(track.name, limitsDegrees);
    if (!Number.isFinite(maxDegrees) || !canSampleTrack(track)) continue;
    const contactTrack = contactTracks.get(track.name) || null;
    const deflectTrack = deflectTracks.get(track.name) || null;
    if (!contactTrack || !deflectTrack) continue;

    const contactBase = sampleTrack(contactTrack, metadata.contactEndSeconds, contactClip.duration);
    const deflectBase = sampleTrack(deflectTrack, metadata.deflectWindow?.[0] || 0, deflectClip.duration);
    if (contactBase?.length !== 4 || deflectBase?.length !== 4) continue;

    for (let keyIndex = 0; keyIndex < track.times.length; keyIndex += 1) {
      const timeSeconds = Number(track.times[keyIndex]) || 0;
      const timeline = sampleProductionParryDeflectTimeline(metadata.variant, timeSeconds);
      const value = stabilizedValueForTimeline(
        THREE,
        timeline,
        contactBase,
        deflectBase,
        deflectTrack,
        deflectClip.duration,
        maxDegrees,
      );
      if (value?.length === 4) writeTrackValue(track, keyIndex, value);
    }
    stabilizedTracks.push(track.name);
  }

  clip.userData = {
    ...(clip.userData || {}),
    productionParryDeflect: Object.freeze({
      ...metadata,
      upperBodyContinuity: Object.freeze({
        stage: PARRY_UPPER_BODY_CONTINUITY_STAGE,
        policy: 'contact-relative-wide-torso-safety-cap',
        limitsDegrees: Object.freeze({ ...limitsDegrees }),
        purpose: 'prevent-basis-snaps-without-flattening-power-bash-motion',
        stabilizedTrackCount: stabilizedTracks.length,
        stabilizedTracks: Object.freeze([...stabilizedTracks]),
      }),
    }),
  };
  return clip;
}

export function stabilizeProductionParryUpperBodyClips(THREE, clips, sourceClipMap) {
  return Array.from(clips || [], (clip) => stabilizeProductionParryUpperBodyClip(THREE, clip, sourceClipMap));
}
