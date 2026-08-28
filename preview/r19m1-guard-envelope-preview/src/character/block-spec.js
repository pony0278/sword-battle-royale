export const DEFAULT_BLOCK_SPEC = Object.freeze({
  headSize: 0.84,
  bodyH: 0.78,
  bodyW: 0.86,
  bodyD: 0.56,
  armUpper: 0.25,
  armLower: 0.30,
  armThick: 0.90,
  armLenL: 1,
  armLenR: 1,
  legUpper: 0.34,
  legLower: 0.45,
  legThick: 1.23,
  fist: 0.71,
  shoe: 1.11,
  shoulderDrop: 0.08,
  legSpread: 0.22,
});

export function createBlockSpec(overrides = {}) {
  const result = { ...DEFAULT_BLOCK_SPEC };
  for (const key of Object.keys(result)) {
    const value = Number(overrides[key]);
    if (Number.isFinite(value) && value > 0) result[key] = value;
  }
  return result;
}

