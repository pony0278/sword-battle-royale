const EPSILON = 1e-8;

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeQuat(value) {
  const out = {
    x: finite(value?.x),
    y: finite(value?.y),
    z: finite(value?.z),
    w: finite(value?.w, 1),
  };
  const length = Math.hypot(out.x, out.y, out.z, out.w) || 1;
  return Object.freeze({
    x: out.x / length,
    y: out.y / length,
    z: out.z / length,
    w: out.w / length,
  });
}

function multiplyQuat(aInput, bInput) {
  const a = normalizeQuat(aInput);
  const b = normalizeQuat(bInput);
  return normalizeQuat({
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  });
}

function inverseQuat(valueInput) {
  const value = normalizeQuat(valueInput);
  return Object.freeze({ x: -value.x, y: -value.y, z: -value.z, w: value.w });
}

function smoothstep(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export function quaternionAngleDegrees(aInput, bInput) {
  const a = normalizeQuat(aInput);
  const b = normalizeQuat(bInput);
  const dot = Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w);
  return (2 * Math.acos(Math.max(-1, Math.min(1, dot)))) * 180 / Math.PI;
}

export function slerpShortestQuaternion(fromInput, toInput, progressInput) {
  const progress = clamp01(progressInput);
  const from = normalizeQuat(fromInput);
  let to = normalizeQuat(toInput);
  let dot = from.x * to.x + from.y * to.y + from.z * to.z + from.w * to.w;

  if (dot < 0) {
    dot = -dot;
    to = { x: -to.x, y: -to.y, z: -to.z, w: -to.w };
  }

  if (dot > 0.9995) {
    return normalizeQuat({
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
      z: from.z + (to.z - from.z) * progress,
      w: from.w + (to.w - from.w) * progress,
    });
  }

  const theta = Math.acos(Math.max(-1, Math.min(1, dot)));
  const sinTheta = Math.sin(theta);
  if (Math.abs(sinTheta) < EPSILON) return from;
  const a = Math.sin((1 - progress) * theta) / sinTheta;
  const b = Math.sin(progress * theta) / sinTheta;
  return normalizeQuat({
    x: from.x * a + to.x * b,
    y: from.y * a + to.y * b,
    z: from.z * a + to.z * b,
    w: from.w * a + to.w * b,
  });
}

export function sampleWorldSwordRecoveryOrientation(sourceWorld, targetWorld, progress) {
  return slerpShortestQuaternion(sourceWorld, targetWorld, smoothstep(progress));
}

export function solveLocalQuaternionForWorld(parentWorld, desiredWorld) {
  return multiplyQuat(inverseQuat(parentWorld), desiredWorld);
}
