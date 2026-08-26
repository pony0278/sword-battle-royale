import { normalizePose, evaluateEase, interpolatePose } from './pose-utils.js';

export const SUPPORTED_EASES = Object.freeze(['lin', 'in', 'out', 'in-out']);

function safeKeyName(value, index) {
  const name = String(value ?? '').trim();
  return name || `key_${index}`;
}

function uniqueName(name, used) {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  let suffix = 2;
  while (used.has(`${name}_${suffix}`)) suffix += 1;
  const result = `${name}_${suffix}`;
  used.add(result);
  return result;
}

function inferTag(name, impact) {
  if (impact) return 'impact';
  return String(name).toLowerCase();
}

export function normalizeTimeline(input = []) {
  const source = Array.isArray(input) && input.length ? input : [{ name: 'idle', frame: 0 }];
  const used = new Set();
  let accumulatedFrame = 0;
  const normalized = source.map((raw = {}, index) => {
    const explicitFrame = Number(raw.frame);
    const segmentFrames = Math.max(1, Math.round(Number(raw.frames) || (index === 0 ? 1 : 6)));
    if (index === 0) accumulatedFrame = Number.isFinite(explicitFrame) ? Math.max(0, Math.round(explicitFrame)) : 0;
    else accumulatedFrame = Number.isFinite(explicitFrame)
      ? Math.max(0, Math.round(explicitFrame))
      : accumulatedFrame + segmentFrames;
    const name = uniqueName(safeKeyName(raw.name, index), used);
    const impact = Boolean(raw.impact);
    const ease = SUPPORTED_EASES.includes(raw.ease) ? raw.ease : (index === 0 ? 'lin' : 'out');
    return {
      name,
      frame: accumulatedFrame,
      frames: segmentFrames,
      ease,
      impact,
      cancel: Boolean(raw.cancel),
      tag: raw.tag == null || String(raw.tag).trim() === '' ? inferTag(name, impact) : String(raw.tag),
    };
  });

  normalized.sort((a, b) => a.frame - b.frame);
  let previousFrame = normalized[0].frame;
  normalized[0].frames = 0;
  for (let index = 1; index < normalized.length; index += 1) {
    normalized[index].frame = Math.max(previousFrame + 1, normalized[index].frame);
    normalized[index].frames = normalized[index].frame - previousFrame;
    previousFrame = normalized[index].frame;
  }
  return normalized;
}

export function createAnimationClip(input = {}) {
  const timeline = normalizeTimeline(input.timeline || input.seq);
  const sourcePoses = input.poses || input.phases || {};
  const poses = {};
  let previousPose = normalizePose();
  for (const key of timeline) {
    previousPose = normalizePose(sourcePoses[key.name] || previousPose);
    poses[key.name] = previousPose;
  }
  const fps = Number.isFinite(Number(input.fps)) && Number(input.fps) > 0 ? Number(input.fps) : 60;
  return {
    format: 'action-studio-clip',
    version: 1,
    id: String(input.id || input.name || 'untitled_action'),
    name: String(input.name || input.id || 'Untitled Action'),
    fps,
    timeline,
    poses,
    durationFrames: timeline[timeline.length - 1].frame,
    metadata: input.metadata && typeof input.metadata === 'object' ? structuredCloneSafe(input.metadata) : {},
  };
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

export function evaluateClip(clip, frame, options = {}) {
  if (!clip || !Array.isArray(clip.timeline) || !clip.timeline.length) return null;
  const timeline = clip.timeline;
  const currentFrame = Math.max(timeline[0].frame, Math.min(Number(frame) || 0, clip.durationFrames));
  const first = timeline[0];
  if (timeline.length === 1 || currentFrame <= first.frame) {
    return {
      frame: currentFrame,
      pose: normalizePose(clip.poses[first.name]),
      from: first.name,
      to: first.name,
      progress: 1,
      easedProgress: 1,
      key: first,
      isImpact: Boolean(first.impact),
    };
  }

  for (let index = 1; index < timeline.length; index += 1) {
    const previous = timeline[index - 1];
    const next = timeline[index];
    if (currentFrame <= next.frame) {
      const progress = (currentFrame - previous.frame) / Math.max(1, next.frame - previous.frame);
      const easedProgress = evaluateEase(progress, next.ease);
      const lags = next.impact ? undefined : options.lags;
      return {
        frame: currentFrame,
        pose: interpolatePose(clip.poses[previous.name], clip.poses[next.name], easedProgress, { lags }),
        from: previous.name,
        to: next.name,
        progress,
        easedProgress,
        key: next,
        isImpact: Boolean(next.impact && currentFrame > previous.frame),
      };
    }
  }

  const last = timeline[timeline.length - 1];
  return {
    frame: currentFrame,
    pose: normalizePose(clip.poses[last.name]),
    from: last.name,
    to: last.name,
    progress: 1,
    easedProgress: 1,
    key: last,
    isImpact: Boolean(last.impact),
  };
}

export function clipMarkerSummary(clip) {
  return {
    impacts: clip.timeline.filter((key) => key.impact).map((key) => key.frame),
    cancels: clip.timeline.filter((key) => key.cancel).map((key) => key.frame),
  };
}

