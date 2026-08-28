import { probeSweptSwordBucklerContact } from './swept-sword-buckler-contact.js';

export const BODY_HURTBOX_STAGE = 'R18U.1';

// R18U.1: What a sword can hit when nothing blocks it.
//
// Until now the only thing in the world a blade could touch was the shield. A defender who did
// not guard was not hurt - the sword passed through them and the exchange simply ended. That made
// every measurement of "did the guard work?" unfalsifiable in one direction: an attack the guard
// missed and an attack that was never going to land looked identical.
//
// The body is modelled as a stack of discs facing the attacker, taken from the rig's own bones,
// so it crouches, leans and displaces with the fighter rather than sitting at a fixed height over
// a root position. Discs, and the same swept blade-vs-disc probe the shield uses, on purpose:
// contact against the body is decided by exactly the machinery that decides contact against the
// shield, so neither can drift from the other or claim a different kind of truth.
//
// A hit here is not damage. It is the fact that the blade reached the body; what that costs is
// somebody else's decision.

// Half-widths and depths of a blocky fighter, measured off the rig rather than authored: each
// band's radius covers the silhouette at that height, and the thickness gives the torso the depth
// a flat disc otherwise lacks.
export const BODY_HURTBOX_BANDS = Object.freeze([
  Object.freeze({ id: 'head', bone: 'head', radius: 0.13, thickness: 0.22 }),
  Object.freeze({ id: 'chest', bone: 'chest', radius: 0.22, thickness: 0.30 }),
  Object.freeze({ id: 'waist', bone: 'hips', radius: 0.20, thickness: 0.28 }),
  // The legs have no single bone at the height that matters, so the knee band is taken from the
  // lower-leg pair and sits between them.
  Object.freeze({ id: 'knees', bone: 'lowerleg.l', pairedBone: 'lowerleg.r', radius: 0.20, thickness: 0.26 }),
]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function freezeVector(value) {
  return Object.freeze({ x: finite(value?.x), y: finite(value?.y), z: finite(value?.z) });
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

function normalizeFacing(direction) {
  const x = finite(direction?.x);
  const z = finite(direction?.z);
  const magnitude = Math.hypot(x, z);
  // Discs face the attacker on the horizontal plane only: a body does not tilt to meet a blade.
  if (!(magnitude > 1e-6)) return { x: 0, y: 0, z: 1 };
  return { x: x / magnitude, y: 0, z: z / magnitude };
}

// The bands as world discs, this frame. `facing` points from the defender toward the attacker.
export function buildBodyHurtbox({ readBonePosition, facing, bands = BODY_HURTBOX_BANDS } = {}) {
  if (typeof readBonePosition !== 'function') return null;
  const normal = normalizeFacing(facing);
  const discs = [];
  for (const band of bands) {
    const primary = readBonePosition(band.bone);
    if (!primary) continue;
    const paired = band.pairedBone ? readBonePosition(band.pairedBone) : null;
    const center = paired ? midpoint(primary, paired) : primary;
    discs.push(Object.freeze({
      id: band.id,
      center: freezeVector(center),
      normal: Object.freeze({ ...normal }),
      radius: band.radius,
      thickness: band.thickness,
    }));
  }
  if (!discs.length) return null;
  return Object.freeze({
    stage: BODY_HURTBOX_STAGE,
    discs: Object.freeze(discs),
    facing: Object.freeze(normal),
    authority: 'hurtbox-geometry-only-the-swept-probe-decides-contact',
  });
}

// The swept blade against every band. The nearest band wins, and a band that is actually struck
// wins over one that is merely close, however close.
export function probeBodyHurtboxContact({
  previousBlade,
  currentBlade,
  hurtbox,
  deltaSeconds,
  active = true,
} = {}) {
  if (!hurtbox?.discs?.length || !previousBlade || !currentBlade) {
    return Object.freeze({
      stage: BODY_HURTBOX_STAGE,
      contact: false,
      reason: 'no-hurtbox-geometry',
      band: null,
      closestApproach: null,
      authority: 'real-swept-blade-vs-body-contact',
    });
  }
  let struck = null;
  let nearest = null;
  for (const disc of hurtbox.discs) {
    const probe = probeSweptSwordBucklerContact({
      previousBlade,
      currentBlade,
      bucklerSurface: disc,
      deltaSeconds,
      active,
    });
    const gap = finite(probe.diagnostics?.closestApproach?.combinedGapMeters, Infinity);
    if (probe.contact === true && (!struck || finite(probe.sweepAlpha, 1) < finite(struck.probe.sweepAlpha, 1))) {
      struck = { band: disc.id, probe };
    }
    if (!nearest || gap < nearest.gap) nearest = { band: disc.id, gap, probe };
  }
  if (struck) {
    return Object.freeze({
      stage: BODY_HURTBOX_STAGE,
      contact: true,
      reason: 'swept-blade-struck-body',
      band: struck.band,
      point: struck.probe.point ?? null,
      sweepAlpha: struck.probe.sweepAlpha ?? null,
      closestApproach: struck.probe.diagnostics?.closestApproach ?? null,
      gapMeters: 0,
      authority: 'real-swept-blade-vs-body-contact',
    });
  }
  return Object.freeze({
    stage: BODY_HURTBOX_STAGE,
    contact: false,
    reason: nearest && Number.isFinite(nearest.gap) ? 'blade-missed-the-body' : 'no-swept-intersection',
    band: nearest?.band ?? null,
    point: null,
    sweepAlpha: null,
    closestApproach: nearest?.probe?.diagnostics?.closestApproach ?? null,
    gapMeters: nearest && Number.isFinite(nearest.gap) ? nearest.gap : null,
    authority: 'real-swept-blade-vs-body-contact',
  });
}
