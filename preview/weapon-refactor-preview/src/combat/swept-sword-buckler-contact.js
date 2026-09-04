export const SWEPT_SWORD_BUCKLER_CONTACT_STAGE = 'G4.3A';
export const DEFAULT_SWORD_SWEEP_EPSILON = 1e-7;

// R18X.1: how far a blade endpoint may travel inside one swept step before the step is subdivided.
//
// The swept test builds a straight quad from the previous blade to the current one. A swinging
// blade travels an arc, and the quad is its chord, so everything between the two frames is tested
// in the wrong place. That is tolerable while the blade is slow and the chord hugs the arc. It is
// not tolerable at contact speed: measured off the R281 lab on LEFT, blade endpoints cover 1.5-2m
// in a single frame and the chord's midpoint sits a median of 0.44m away from where the blade
// actually was. Offline replay of ten missed blocks: the chord put the closest approach at 11cm
// while the arc put it at 1.6cm, on the same frames.
//
// Subdividing costs nothing where the chord was already adequate - a frame under this threshold
// resolves to exactly one step, which is the original test unchanged, byte for byte.
export const SWORD_SWEEP_SUBSTEP_TRAVEL_METERS = 0.25;
export const MAX_SWORD_SWEEP_SUBSTEPS = 16;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function vec(input = {}) {
  return { x: finite(input.x), y: finite(input.y), z: finite(input.z) };
}

function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function mul(a, scalar) { return { x: a.x * scalar, y: a.y * scalar, z: a.z * scalar }; }
function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function cross(a, b) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
function lengthSq(a) { return dot(a, a); }
function length(a) { return Math.sqrt(lengthSq(a)); }
function lerp(a, b, t) { return add(a, mul(sub(b, a), t)); }
function clamp01(value) { return Math.max(0, Math.min(1, finite(value))); }
function normalize(a) {
  const magnitude = length(a);
  return magnitude > 1e-12 ? mul(a, 1 / magnitude) : { x: 0, y: 0, z: 1 };
}
function projectToPlane(point, center, normal) {
  const signedDistance = dot(sub(point, center), normal);
  return { point: sub(point, mul(normal, signedDistance)), signedDistance };
}
function radialDistance(point, center, normal) {
  return length(sub(projectToPlane(point, center, normal).point, center));
}
function freezeVector(value) {
  return Object.freeze({ x: value.x, y: value.y, z: value.z });
}

export function normalizeSwordSweepPolyline(input = {}) {
  const points = input.points || input;
  if (!Array.isArray(points) || points.length < 2) {
    throw new Error('G4.3A sword sweep polyline requires at least two world-space points');
  }
  return Object.freeze(points.map((point) => freezeVector(vec(point))));
}

export function normalizeBucklerParrySurface(surface = {}) {
  const radius = Math.max(0, finite(surface.radius));
  const thickness = Math.max(0, finite(surface.thickness));
  if (!(radius > 0)) throw new Error('G4.3A Buckler surface radius must be positive');
  return Object.freeze({
    center: freezeVector(vec(surface.center)),
    normal: freezeVector(normalize(vec(surface.normal))),
    radius,
    thickness,
  });
}

function closestPointOnSegment(point, a, b) {
  const ab = sub(b, a);
  const denominator = lengthSq(ab);
  const u = denominator > 1e-12 ? clamp01(dot(sub(point, a), ab) / denominator) : 0;
  return { point: lerp(a, b, u), u };
}

function staticSegmentVsDiscSlab(a, b, surface, metadata = {}) {
  const { center, normal, radius, thickness } = surface;
  const halfThickness = thickness * 0.5;
  const da = dot(sub(a, center), normal);
  const db = dot(sub(b, center), normal);
  const delta = db - da;

  let uMin = 0;
  let uMax = 1;
  if (Math.abs(delta) < 1e-12) {
    if (Math.abs(da) > halfThickness) return null;
  } else {
    const enter = (-halfThickness - da) / delta;
    const exit = (halfThickness - da) / delta;
    uMin = Math.max(0, Math.min(enter, exit));
    uMax = Math.min(1, Math.max(enter, exit));
    if (uMin > uMax) return null;
  }

  const pMin = lerp(a, b, uMin);
  const pMax = lerp(a, b, uMax);
  const projectedMin = projectToPlane(pMin, center, normal).point;
  const projectedMax = projectToPlane(pMax, center, normal).point;
  const radialClosest = closestPointOnSegment(center, projectedMin, projectedMax);
  const u = uMin + (uMax - uMin) * radialClosest.u;
  const worldPoint = lerp(a, b, u);
  const signedDistance = dot(sub(worldPoint, center), normal);
  const projectedPoint = projectToPlane(worldPoint, center, normal).point;
  const radial = length(sub(projectedPoint, center));
  if (radial > radius) return null;

  return {
    mode: 'static-slab',
    point: projectedPoint,
    signedDistance,
    radialDistance: radial,
    bladeFraction: metadata.s0 + (metadata.s1 - metadata.s0) * u,
    sweepAlpha: metadata.timeAlpha,
  };
}

function uniqueIntersections(items, epsilon) {
  const output = [];
  for (const item of items) {
    if (!output.some((entry) => lengthSq(sub(entry.point, item.point)) <= epsilon * epsilon)) output.push(item);
  }
  return output;
}

function intersectTriangleWithOffsetPlane(vertices, surface, planeOffset, epsilon) {
  const { center, normal } = surface;
  const distances = vertices.map((vertex) => dot(sub(vertex.point, center), normal) - planeOffset);
  const intersections = [];
  const edges = [[0, 1], [1, 2], [2, 0]];

  for (const [ia, ib] of edges) {
    const a = vertices[ia];
    const b = vertices[ib];
    const da = distances[ia];
    const db = distances[ib];
    const aOn = Math.abs(da) <= epsilon;
    const bOn = Math.abs(db) <= epsilon;

    if (aOn) intersections.push({ point: a.point, t: a.t, s: a.s });
    if (bOn) intersections.push({ point: b.point, t: b.t, s: b.s });
    if ((da < -epsilon && db > epsilon) || (da > epsilon && db < -epsilon)) {
      const u = da / (da - db);
      intersections.push({
        point: lerp(a.point, b.point, u),
        t: a.t + (b.t - a.t) * u,
        s: a.s + (b.s - a.s) * u,
      });
    }
  }

  return uniqueIntersections(intersections, epsilon);
}

function bestDiscCandidate(intersections, surface, planeOffset) {
  if (!intersections.length) return null;
  const { center, normal, radius } = surface;
  let best = null;

  const consider = (candidate) => {
    const projected = sub(candidate.point, mul(normal, planeOffset));
    const radial = length(sub(projected, center));
    if (radial > radius) return;
    if (!best || radial < best.radialDistance) {
      best = {
        mode: 'swept-strip',
        point: projected,
        signedDistance: planeOffset,
        radialDistance: radial,
        bladeFraction: candidate.s,
        sweepAlpha: candidate.t,
      };
    }
  };

  intersections.forEach(consider);
  for (let i = 0; i < intersections.length; i += 1) {
    for (let j = i + 1; j < intersections.length; j += 1) {
      const a = intersections[i];
      const b = intersections[j];
      const closest = closestPointOnSegment(center, a.point, b.point);
      consider({
        point: closest.point,
        t: a.t + (b.t - a.t) * closest.u,
        s: a.s + (b.s - a.s) * closest.u,
      });
    }
  }
  return best;
}

function sweptSectionVsDisc(previousA, previousB, currentA, currentB, surface, s0, s1, epsilon) {
  const vertices = {
    p0: { point: previousA, t: 0, s: s0 },
    p1: { point: previousB, t: 0, s: s1 },
    c0: { point: currentA, t: 1, s: s0 },
    c1: { point: currentB, t: 1, s: s1 },
  };
  const triangles = [
    [vertices.p0, vertices.p1, vertices.c1],
    [vertices.p0, vertices.c1, vertices.c0],
  ];
  const offsets = surface.thickness > 0
    ? [0, surface.thickness * 0.5, -surface.thickness * 0.5]
    : [0];
  let best = null;
  for (const triangle of triangles) {
    for (const offset of offsets) {
      const intersections = intersectTriangleWithOffsetPlane(triangle, surface, offset, epsilon);
      const candidate = bestDiscCandidate(intersections, surface, offset);
      if (candidate && (!best || candidate.sweepAlpha < best.sweepAlpha
        || (Math.abs(candidate.sweepAlpha - best.sweepAlpha) <= epsilon && candidate.radialDistance < best.radialDistance))) {
        best = candidate;
      }
    }
  }
  return best;
}

function samplePolylineAtFraction(polyline, fraction) {
  const clamped = clamp01(fraction);
  const sectionCount = polyline.length - 1;
  const scaled = clamped * sectionCount;
  const index = Math.min(sectionCount - 1, Math.floor(scaled));
  const local = scaled - index;
  return lerp(polyline[index], polyline[index + 1], local);
}

export function measureSweptSwordBucklerClosestApproach(input = {}) {
  const previous = normalizeSwordSweepPolyline(input.previousBlade);
  const current = normalizeSwordSweepPolyline(input.currentBlade);
  if (previous.length !== current.length) throw new Error('G4.3A closest-approach polylines must have matching point counts');
  const surface = normalizeBucklerParrySurface(input.bucklerSurface);
  const timeSamples = Math.max(2, Math.min(32, Math.round(finite(input.timeSamples, 8))));
  const bladeSamplesPerSection = Math.max(2, Math.min(32, Math.round(finite(input.bladeSamplesPerSection, 8))));
  const sectionCount = current.length - 1;
  const halfThickness = surface.thickness * 0.5;
  let best = null;

  for (let sectionIndex = 0; sectionIndex < sectionCount; sectionIndex += 1) {
    for (let timeIndex = 0; timeIndex <= timeSamples; timeIndex += 1) {
      const sweepAlpha = timeIndex / timeSamples;
      for (let bladeIndex = 0; bladeIndex <= bladeSamplesPerSection; bladeIndex += 1) {
        const sectionFraction = bladeIndex / bladeSamplesPerSection;
        const previousPoint = lerp(previous[sectionIndex], previous[sectionIndex + 1], sectionFraction);
        const currentPoint = lerp(current[sectionIndex], current[sectionIndex + 1], sectionFraction);
        const point = lerp(previousPoint, currentPoint, sweepAlpha);
        const projection = projectToPlane(point, surface.center, surface.normal);
        const radial = length(sub(projection.point, surface.center));
        const planeGapMeters = Math.max(0, Math.abs(projection.signedDistance) - halfThickness);
        const radialGapMeters = Math.max(0, radial - surface.radius);
        const combinedGapMeters = Math.hypot(planeGapMeters, radialGapMeters);
        const candidate = {
          point,
          planePoint: projection.point,
          signedDistance: projection.signedDistance,
          planeGapMeters,
          radialDistanceMeters: radial,
          radialGapMeters,
          combinedGapMeters,
          bladeFraction: (sectionIndex + sectionFraction) / sectionCount,
          sweepAlpha,
        };
        if (!best || candidate.combinedGapMeters < best.combinedGapMeters
          || (candidate.combinedGapMeters === best.combinedGapMeters
            && candidate.planeGapMeters + candidate.radialGapMeters < best.planeGapMeters + best.radialGapMeters)) {
          best = candidate;
        }
      }
    }
  }

  return Object.freeze({
    point: freezeVector(best.point),
    planePoint: freezeVector(best.planePoint),
    signedDistance: best.signedDistance,
    planeGapMeters: best.planeGapMeters,
    radialDistanceMeters: best.radialDistanceMeters,
    radialGapMeters: best.radialGapMeters,
    combinedGapMeters: best.combinedGapMeters,
    bladeFraction: clamp01(best.bladeFraction),
    sweepAlpha: clamp01(best.sweepAlpha),
    insideSlab: best.planeGapMeters === 0,
    insideDisc: best.radialGapMeters === 0,
    timeSamples,
    bladeSamplesPerSection,
    authority: 'sampled-closest-approach-diagnostic-only',
  });
}

function exactContactApproach(best) {
  return Object.freeze({
    point: freezeVector(best.point),
    planePoint: freezeVector(best.point),
    signedDistance: best.signedDistance,
    planeGapMeters: 0,
    radialDistanceMeters: best.radialDistance,
    radialGapMeters: 0,
    combinedGapMeters: 0,
    bladeFraction: clamp01(best.bladeFraction),
    sweepAlpha: clamp01(best.sweepAlpha),
    insideSlab: true,
    insideDisc: true,
    authority: 'exact-swept-contact',
  });
}

function makeNoContact(previous, current, surface, options, diagnostics = {}) {
  return Object.freeze({
    stage: SWEPT_SWORD_BUCKLER_CONTACT_STAGE,
    contact: false,
    eligible: options.active !== false,
    reason: diagnostics.reason || 'no-swept-intersection',
    surface,
    diagnostics: Object.freeze({
      sectionCount: current.length - 1,
      ...diagnostics,
    }),
  });
}

// A three-node blade polyline is collinear, so the only motion it can carry between two frames is
// its base's translation plus a rotation of its axis. Roll about the axis moves no point of a
// segment, so this is not an approximation of the blade's motion - for sweep purposes it is all of
// it. The rotation is taken about the common perpendicular of the two axes.
function fitBladeAxisMotion(previous, current) {
  const from = normalize(sub(previous[previous.length - 1], previous[0]));
  const to = normalize(sub(current[current.length - 1], current[0]));
  const perpendicular = cross(from, to);
  const sin = length(perpendicular);
  const cos = Math.max(-1, Math.min(1, dot(from, to)));
  return {
    axis: sin > 1e-9 ? mul(perpendicular, 1 / sin) : { x: 0, y: 1, z: 0 },
    angle: Math.atan2(sin, cos),
  };
}

function rotateAboutAxis(value, axis, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return add(
    add(mul(value, c), mul(cross(axis, value), s)),
    mul(axis, dot(axis, value) * (1 - c)),
  );
}

function bladeAtFraction(previous, current, alpha, motion) {
  if (alpha <= 0) return previous;
  if (alpha >= 1) return current;
  const pivotFrom = previous[0];
  const pivot = add(pivotFrom, mul(sub(current[0], pivotFrom), alpha));
  return previous.map((point) => add(pivot, rotateAboutAxis(sub(point, pivotFrom), motion.axis, motion.angle * alpha)));
}

// How many steps this frame's travel needs. One step is the original chord test.
export function resolveSweptContactSubsteps(previous, current, override) {
  if (override != null) {
    const requested = Math.floor(finite(override, 1));
    return Math.max(1, Math.min(MAX_SWORD_SWEEP_SUBSTEPS, requested));
  }
  let travel = 0;
  for (let index = 0; index < current.length; index += 1) {
    travel = Math.max(travel, length(sub(current[index], previous[index])));
  }
  const needed = Math.ceil(travel / SWORD_SWEEP_SUBSTEP_TRAVEL_METERS);
  return Math.max(1, Math.min(MAX_SWORD_SWEEP_SUBSTEPS, needed));
}

function scanSectionsForContact(previous, current, surface, epsilon, alphaOffset, alphaScale) {
  let best = null;
  const sectionCount = current.length - 1;
  for (let index = 0; index < sectionCount; index += 1) {
    const s0 = index / sectionCount;
    const s1 = (index + 1) / sectionCount;
    const swept = sweptSectionVsDisc(
      previous[index], previous[index + 1],
      current[index], current[index + 1],
      surface, s0, s1, epsilon,
    );
    const staticCurrent = staticSegmentVsDiscSlab(current[index], current[index + 1], surface, {
      s0, s1, timeAlpha: 1,
    });
    const staticPrevious = staticSegmentVsDiscSlab(previous[index], previous[index + 1], surface, {
      s0, s1, timeAlpha: 0,
    });
    for (const candidate of [staticPrevious, swept, staticCurrent]) {
      if (!candidate) continue;
      // Substep alphas are local to their slice; lift them back onto the frame's own timeline so
      // sweepAlpha keeps meaning the same thing to the temporal eligibility gate.
      const lifted = candidate.sweepAlpha * alphaScale + alphaOffset;
      const scaled = lifted === candidate.sweepAlpha ? candidate : { ...candidate, sweepAlpha: lifted };
      if (!best || scaled.sweepAlpha < best.sweepAlpha
        || (Math.abs(scaled.sweepAlpha - best.sweepAlpha) <= epsilon && scaled.radialDistance < best.radialDistance)) {
        best = scaled;
      }
    }
  }
  return best;
}

export function probeSweptSwordBucklerContact(input = {}) {
  const previous = normalizeSwordSweepPolyline(input.previousBlade);
  const current = normalizeSwordSweepPolyline(input.currentBlade);
  if (previous.length !== current.length) throw new Error('G4.3A previous/current blade polylines must have matching point counts');
  const surface = normalizeBucklerParrySurface(input.bucklerSurface);
  const epsilon = Math.max(1e-10, finite(input.epsilon, DEFAULT_SWORD_SWEEP_EPSILON));
  const deltaSeconds = Math.max(1e-6, finite(input.deltaSeconds, 1 / 60));
  const active = input.active !== false;
  const closestApproach = measureSweptSwordBucklerClosestApproach({
    previousBlade: previous,
    currentBlade: current,
    bucklerSurface: surface,
    timeSamples: input.closestApproachTimeSamples,
    bladeSamplesPerSection: input.closestApproachBladeSamples,
  });

  const sectionCount = current.length - 1;
  const substeps = resolveSweptContactSubsteps(previous, current, input.sweepSubsteps);
  const motion = substeps > 1 ? fitBladeAxisMotion(previous, current) : null;
  let best = null;
  for (let step = 0; step < substeps && !best; step += 1) {
    const from = substeps === 1 ? previous : bladeAtFraction(previous, current, step / substeps, motion);
    const to = substeps === 1 ? current : bladeAtFraction(previous, current, (step + 1) / substeps, motion);
    best = scanSectionsForContact(from, to, surface, epsilon, step / substeps, 1 / substeps);
  }

  if (!best) {
    const endpointTravel = current.map((point, index) => length(sub(point, previous[index])));
    return makeNoContact(previous, current, surface, { active }, {
      maxEndpointTravel: Math.max(...endpointTravel),
      closestApproach,
      substeps,
      reason: 'no-swept-intersection',
    });
  }

  const previousAtContact = samplePolylineAtFraction(previous, best.bladeFraction);
  const currentAtContact = samplePolylineAtFraction(current, best.bladeFraction);
  const incomingMotion = sub(currentAtContact, previousAtContact);
  const incomingVelocity = mul(incomingMotion, 1 / deltaSeconds);
  const approachDot = dot(normalize(incomingMotion), surface.normal);
  const contact = active;

  return Object.freeze({
    stage: SWEPT_SWORD_BUCKLER_CONTACT_STAGE,
    contact,
    geometricContact: true,
    eligible: active,
    reason: active ? 'active-swept-contact' : 'contact-outside-active-window',
    mode: best.mode,
    point: freezeVector(best.point),
    sweepAlpha: clamp01(best.sweepAlpha),
    bladeFraction: clamp01(best.bladeFraction),
    signedDistance: best.signedDistance,
    radialDistance: best.radialDistance,
    incomingMotion: freezeVector(incomingMotion),
    incomingVelocity: freezeVector(incomingVelocity),
    approachDot,
    surface,
    diagnostics: Object.freeze({
      sectionCount,
      deltaSeconds,
      previousRadialDistance: radialDistance(previousAtContact, surface.center, surface.normal),
      currentRadialDistance: radialDistance(currentAtContact, surface.center, surface.normal),
      closestApproach: exactContactApproach(best),
      substeps,
    }),
  });
}
