import { POSE_KEYS, defaultPoseValue } from './pose-schema.js';

export const NO_LIMB_LAG = Object.freeze({ aL: 0, aR: 0, lL: 0, lR: 0 });

export function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

export function normalizePose(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  return Object.fromEntries(POSE_KEYS.map((key) => {
    const value = Number(source[key]);
    return [key, Number.isFinite(value) ? value : defaultPoseValue(key)];
  }));
}

export function normalizeLimbLags(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  return Object.fromEntries(Object.keys(NO_LIMB_LAG).map((key) => {
    const value = Number(source[key]);
    return [key, Number.isFinite(value) ? clamp(value, 0, 0.95) : 0];
  }));
}

export function evaluateEase(value, mode = 'lin') {
  const t = clamp(Number(value) || 0);
  if (mode === 'in' || mode === 'ease-in') return t * t;
  if (mode === 'out' || mode === 'ease-out') return 1 - (1 - t) * (1 - t);
  if (mode === 'in-out' || mode === 'ease-in-out') {
    return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
  }
  return t;
}

function lagForPoseKey(key, lags) {
  if (key.startsWith('aL_')) return lags.aL;
  if (key.startsWith('aR_')) return lags.aR;
  if (key.startsWith('lL_')) return lags.lL;
  if (key.startsWith('lR_')) return lags.lR;
  return 0;
}

export function interpolatePose(from = {}, to = {}, value = 0, options = {}) {
  const t = clamp(Number(value) || 0);
  const lags = normalizeLimbLags(options.lags);
  return Object.fromEntries(POSE_KEYS.map((key) => {
    const fallback = defaultPoseValue(key);
    const a = Number.isFinite(Number(from[key])) ? Number(from[key]) : fallback;
    const b = Number.isFinite(Number(to[key])) ? Number(to[key]) : fallback;
    const lag = lagForPoseKey(key, lags);
    const localT = lag > 0 ? clamp((t - lag) / Math.max(1 - lag, 0.001)) : t;
    return [key, a + (b - a) * localT];
  }));
}

