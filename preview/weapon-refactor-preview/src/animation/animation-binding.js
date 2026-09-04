export const ACTION_MOTION_SOURCES = Object.freeze(['authored', 'kaykit', 'ual2', 'ual1', 'skyrim']);

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeAnimationBinding(input = {}, fallbackClipId = '') {
  const requestedSource = String(input.source || 'authored');
  const source = ACTION_MOTION_SOURCES.includes(requestedSource) ? requestedSource : 'authored';
  return {
    source,
    clipId: String(input.clipId || (source === 'authored' ? fallbackClipId : '')),
    speed: Math.max(0.001, finiteNumber(input.speed, 1)),
    startOffsetSeconds: Math.max(0, finiteNumber(input.startOffsetSeconds, 0)),
    inPlace: input.inPlace !== false,
    loop: input.loop === true,
    blendInSeconds: Math.max(0, finiteNumber(input.blendInSeconds, 0.08)),
    blendOutSeconds: Math.max(0, finiteNumber(input.blendOutSeconds, 0.12)),
  };
}

export function createFittedAnimationBinding(options = {}) {
  const fps = Math.max(1, finiteNumber(options.fps, 30));
  const actionSeconds = Math.max(0, finiteNumber(options.durationFrames, 0)) / fps;
  const animationSeconds = Math.max(0, finiteNumber(options.animationDurationSeconds, 0));
  const speed = actionSeconds > 0 && animationSeconds > 0 ? animationSeconds / actionSeconds : 1;
  const requestedSource = String(options.source || 'kaykit');
  const source = ACTION_MOTION_SOURCES.includes(requestedSource) && requestedSource !== 'authored'
    ? requestedSource
    : 'kaykit';
  return normalizeAnimationBinding({
    ...options,
    source,
    speed,
    startOffsetSeconds: 0,
    loop: false,
  });
}

export function animationTimeAtFrame(bindingInput, frame, fps, animationDurationSeconds) {
  const binding = normalizeAnimationBinding(bindingInput);
  const safeFps = Math.max(1, finiteNumber(fps, 30));
  const timelineSeconds = Math.max(0, finiteNumber(frame, 0)) / safeFps;
  const rawTime = binding.startOffsetSeconds + timelineSeconds * binding.speed;
  const duration = finiteNumber(animationDurationSeconds, Number.POSITIVE_INFINITY);
  if (!Number.isFinite(duration) || duration <= 0) return rawTime;
  if (binding.loop) return ((rawTime % duration) + duration) % duration;
  return Math.min(rawTime, duration);
}
