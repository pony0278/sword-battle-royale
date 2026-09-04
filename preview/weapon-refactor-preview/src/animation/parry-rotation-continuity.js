import { sanitizeAnimationTargetName } from './animation-target-name.js';

export const PARRY_ROTATION_CONTINUITY_STAGE = 'G3.5.1P-T3.2';

export const PARRY_ROTATION_CONTINUITY_CONTACT_LOCK_TARGETS = Object.freeze([
  'root',
  'hips',
  'upperleg.l',
  'lowerleg.l',
  'foot.l',
  'toes.l',
  'upperleg.r',
  'lowerleg.r',
  'foot.r',
  'toes.r',
]);

const LOCKED_TARGETS = new Set(
  PARRY_ROTATION_CONTINUITY_CONTACT_LOCK_TARGETS.map((target) => sanitizeAnimationTargetName(target)),
);
const LOCKED_PROPERTIES = new Set(['position', 'quaternion']);

function trackTargetName(trackName) {
  const value = String(trackName || '');
  const propertyIndex = value.lastIndexOf('.');
  return propertyIndex < 0 ? value : value.slice(0, propertyIndex);
}

function trackPropertyName(trackName) {
  const value = String(trackName || '');
  const propertyIndex = value.lastIndexOf('.');
  return propertyIndex < 0 ? '' : value.slice(propertyIndex + 1);
}

export function isParryRotationContinuityContactLockedTrack(trackName) {
  const target = sanitizeAnimationTargetName(trackTargetName(trackName));
  const property = trackPropertyName(trackName);
  return LOCKED_TARGETS.has(target) && LOCKED_PROPERTIES.has(property);
}

function canSampleTrack(track) {
  return Boolean(
    track?.name
    && track?.times?.length
    && track?.values?.length
    && typeof track.getValueSize === 'function'
    && typeof track.createInterpolant === 'function'
  );
}

function sampleTrack(track, timeSeconds, durationSeconds) {
  if (!canSampleTrack(track)) return null;
  const time = Math.max(0, Math.min(Number(timeSeconds) || 0, Math.max(0, Number(durationSeconds) || 0)));
  const value = track.createInterpolant().evaluate(time);
  return Array.from(value).slice(0, track.getValueSize());
}

function freezeTrackAfter(track, cutoffSeconds, frozenValue) {
  if (!canSampleTrack(track) || !frozenValue?.length) return false;
  const size = track.getValueSize();
  let changed = false;
  for (let index = 0; index < track.times.length; index += 1) {
    if ((Number(track.times[index]) || 0) + 1e-7 < cutoffSeconds) continue;
    const offset = index * size;
    for (let component = 0; component < size; component += 1) {
      track.values[offset + component] = frozenValue[component] ?? track.values[offset + component];
    }
    changed = true;
  }
  return changed;
}

export function stabilizeProductionParryDeflectClip(clip, sourceClipMap, options = {}) {
  const metadata = clip?.userData?.productionParryDeflect;
  if (!metadata?.productionEnabled || !clip?.tracks?.length) return clip;

  const contactClip = sourceClipMap?.get?.(metadata.contactClipId) || null;
  if (!contactClip) {
    throw new Error(`${PARRY_ROTATION_CONTINUITY_STAGE} requires contact source ${metadata.contactClipId}`);
  }

  const cutoffSeconds = Math.max(0, Number(options.contactEndSeconds ?? metadata.contactEndSeconds) || 0);
  const contactTracks = new Map((contactClip.tracks || []).map((track) => [track.name, track]));
  const stabilizedTracks = [];
  const fallbackTracks = [];

  for (const track of clip.tracks) {
    if (!isParryRotationContinuityContactLockedTrack(track.name)) continue;
    const sourceTrack = contactTracks.get(track.name) || track;
    const sourceDuration = sourceTrack === track ? clip.duration : contactClip.duration;
    const frozenValue = sampleTrack(sourceTrack, cutoffSeconds, sourceDuration);
    if (!frozenValue?.length) continue;
    if (sourceTrack === track) fallbackTracks.push(track.name);
    if (freezeTrackAfter(track, cutoffSeconds, frozenValue)) stabilizedTracks.push(track.name);
  }

  clip.userData = {
    ...(clip.userData || {}),
    productionParryDeflect: Object.freeze({
      ...metadata,
      rotationContinuity: Object.freeze({
        stage: PARRY_ROTATION_CONTINUITY_STAGE,
        policy: 'contact-lock-lower-body-after-contact',
        contactEndSeconds: cutoffSeconds,
        contactLockedTargets: PARRY_ROTATION_CONTINUITY_CONTACT_LOCK_TARGETS,
        stabilizedTrackCount: stabilizedTracks.length,
        stabilizedTracks: Object.freeze([...stabilizedTracks]),
        fallbackTracks: Object.freeze([...fallbackTracks]),
      }),
    }),
  };
  return clip;
}

export function stabilizeProductionParryDeflectClips(clips, sourceClipMap, options = {}) {
  return Array.from(clips || [], (clip) => stabilizeProductionParryDeflectClip(clip, sourceClipMap, options));
}
