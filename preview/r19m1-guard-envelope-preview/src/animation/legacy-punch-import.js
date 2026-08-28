import { LEGACY_NON_HUMANOID_POSE_KEYS, POSE_KEYS } from './pose-schema.js';
import { createAnimationClip } from './animation-clip.js';

export function importLegacyPunchSnapshot(snapshot = {}) {
  const phases = snapshot.phases || snapshot.PHASES || {};
  const ignoredKeys = new Set();
  const poses = {};
  for (const [name, sourcePose] of Object.entries(phases)) {
    poses[name] = {};
    for (const key of POSE_KEYS) {
      if (sourcePose && sourcePose[key] !== undefined) poses[name][key] = sourcePose[key];
    }
    for (const key of LEGACY_NON_HUMANOID_POSE_KEYS) {
      if (sourcePose && sourcePose[key] !== undefined) ignoredKeys.add(key);
    }
  }
  return {
    clip: createAnimationClip({
      id: snapshot.id || snapshot.name || 'imported_punch_action',
      name: snapshot.name || 'Imported Punch Action',
      fps: snapshot.fps || 60,
      timeline: snapshot.seq || snapshot.SEQ,
      poses,
      metadata: { importedFrom: 'punch-studio', legacyVersion: snapshot.version ?? null },
    }),
    report: { ignoredPoseKeys: [...ignoredKeys].sort() },
  };
}

