export const ATTACKER_RECOIL_WORLD_SILHOUETTE_STAGE = 'G4.3B.3.1';

export const ATTACKER_RECOIL_WORLD_READABILITY = Object.freeze({
  minimumBackwardLeanDegrees: 12,
  minimumHeadBackwardMeters: 0.075,
  minimumShouldersBackwardMeters: 0.045,
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function vec(value = {}) {
  return Object.freeze({
    x: finite(value.x),
    y: finite(value.y),
    z: finite(value.z),
  });
}

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(value) {
  return Math.hypot(value.x, value.y, value.z);
}

function normalize(value) {
  const magnitude = length(value);
  if (magnitude <= 1e-8) return null;
  return vec({ x: value.x / magnitude, y: value.y / magnitude, z: value.z / magnitude });
}

function degreesBetween(a, b) {
  const normalizedA = normalize(a);
  const normalizedB = normalize(b);
  if (!normalizedA || !normalizedB) return 0;
  const cosine = Math.max(-1, Math.min(1, dot(normalizedA, normalizedB)));
  return Math.acos(cosine) * 180 / Math.PI;
}

function validSilhouette(value) {
  return Boolean(value?.hips && value?.head && value?.shoulders && value?.chest);
}

export function measureAttackerRecoilWorldSilhouette(input = {}, thresholds = {}) {
  const baseline = input.baseline;
  const current = input.current;
  const backward = normalize({
    x: finite(input.backwardDirection?.x),
    y: 0,
    z: finite(input.backwardDirection?.z),
  });
  if (!validSilhouette(baseline) || !validSilhouette(current) || !backward) {
    return Object.freeze({
      stage: ATTACKER_RECOIL_WORLD_SILHOUETTE_STAGE,
      accepted: false,
      reason: !backward ? 'missing-horizontal-backward-direction' : 'missing-world-silhouette-landmarks',
      readable: false,
    });
  }

  const minimumBackwardLeanDegrees = Math.max(
    0,
    finite(thresholds.minimumBackwardLeanDegrees, ATTACKER_RECOIL_WORLD_READABILITY.minimumBackwardLeanDegrees),
  );
  const minimumHeadBackwardMeters = Math.max(
    0,
    finite(thresholds.minimumHeadBackwardMeters, ATTACKER_RECOIL_WORLD_READABILITY.minimumHeadBackwardMeters),
  );
  const minimumShouldersBackwardMeters = Math.max(
    0,
    finite(
      thresholds.minimumShouldersBackwardMeters,
      ATTACKER_RECOIL_WORLD_READABILITY.minimumShouldersBackwardMeters,
    ),
  );

  const baselineChain = subtract(vec(baseline.head), vec(baseline.hips));
  const currentChain = subtract(vec(current.head), vec(current.hips));
  const headBackwardMeters = dot(subtract(vec(current.head), vec(baseline.head)), backward);
  const shouldersBackwardMeters = dot(
    subtract(vec(current.shoulders), vec(baseline.shoulders)),
    backward,
  );
  const chestBackwardMeters = dot(subtract(vec(current.chest), vec(baseline.chest)), backward);
  const hipsBackwardMeters = dot(subtract(vec(current.hips), vec(baseline.hips)), backward);
  const backwardDisplacement = (headBackwardMeters + shouldersBackwardMeters + chestBackwardMeters) / 3
    - hipsBackwardMeters;
  const unsignedLeanDegrees = degreesBetween(baselineChain, currentChain);
  const worldBackwardLeanDegrees = unsignedLeanDegrees * Math.sign(backwardDisplacement || 1);
  const readable = worldBackwardLeanDegrees >= minimumBackwardLeanDegrees
    && headBackwardMeters >= minimumHeadBackwardMeters
    && shouldersBackwardMeters >= minimumShouldersBackwardMeters;

  return Object.freeze({
    stage: ATTACKER_RECOIL_WORLD_SILHOUETTE_STAGE,
    accepted: true,
    reason: readable ? 'world-space-old-b3-readable' : 'world-space-old-b3-below-readable-threshold',
    readable,
    worldBackwardLeanDegrees,
    headBackwardMeters,
    shouldersBackwardMeters,
    chestBackwardMeters,
    hipsBackwardMeters,
    backwardDisplacementMeters: backwardDisplacement,
    requestedLocalChainPitchDegrees: finite(input.requestedLocalChainPitchDegrees, null),
    thresholds: Object.freeze({
      minimumBackwardLeanDegrees,
      minimumHeadBackwardMeters,
      minimumShouldersBackwardMeters,
    }),
    authority: 'measured-final-rig-world-space-landmarks-after-all-pose-authorities',
  });
}
