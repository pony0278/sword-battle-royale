export const SHIELD_CONTACT_SKIN_STAGE = 'R20L.1';

// R20L.1 (B6f) - the shield's blocking volume is declared slightly larger than its disc, and this
// is the one place that says so.
//
// Measured, and the reason this exists: the shield cannot intercept. At contact the blade point
// that meets it is travelling 24-120 m/s while the guard's tracking arm is capped at 2.5 m/s, so
// the arm is between one and two orders of magnitude too slow to be aimed at anything. What
// actually happens - in every cell of the defence grid - is interposition: the shield stands in
// the swing's way and the blade grazes it. Measured aim error at contact is 10-26cm on a 26cm
// disc, and the contact point wanders more than 20cm across the face under ordinary timing
// variation, so a block regularly lands on the last few millimetres of the rim. Two runs of the
// same input, perturbed only in frame timing, were measured closing to 2-3mm inside the rim and
// resolving as a body hit.
//
// Interposition is the mechanic, not a defect - a buckler is used by putting it in the way. What
// was wrong was the tolerance: the boundary between "blocked" and "hit in the body" sat on
// millimetres nobody controls, and no amount of aiming can fix that when the blade is thirty times
// faster than the arm. So the volume is generous on purpose, and by a stated amount.
//
// What 2cm buys, all measured before it was chosen:
//   - a near-rim graze that used to resolve as a body hit now blocks (LEFT@2.4 under jitter)
//   - the B6d lateness cliff does not move at all: raising the guard later than ~70ms before
//     contact still eats the hit, at +2cm, +4cm and +6cm alike. That cliff is the coverage latch's
//     reaction watch, not geometry, so generosity here cannot buy back a late guard
//   - every golden cell keeps its verdict, so this is not a re-declaration of the defence grid
// A blade whose path genuinely goes elsewhere is still a miss: at +6cm the extreme-jitter LEFT@2.0
// miss stays a miss. The skin widens a graze; it does not invent a block.
//
// Deliberately NOT skinned: the hilt clang (its own mechanic, its own surface), the depth-order
// test (a question about sides, not volume), the coverage planner and the visual. The visual disc
// is already 24cm against a 26cm collision disc, so this puts the blocking edge 4cm beyond what a
// player sees - the honest cost of the generosity, and the number to revisit if a block ever reads
// as phantom.
export const SHIELD_CONTACT_SKIN_METERS = 0.02;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

// Anything that is not a finite positive number means no skin. A caller passing nonsense gets the
// true disc back - the behaviour this stage started from - rather than a silently invented volume.
function skinOrNone(skinMeters) {
  const number = Number(skinMeters);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

// Returns the surface a blade is tested against. Radius only: the slab thickness is the shield's
// own board and has never been the axis a graze runs out along - every measured miss ran out at
// the rim, with the sword inside the disc's depth.
export function applyShieldContactSkin(surface, skinMeters = SHIELD_CONTACT_SKIN_METERS) {
  if (!surface) return surface;
  const skin = skinOrNone(skinMeters);
  if (skin <= 0) return surface;
  return Object.freeze({
    ...surface,
    radius: Math.max(0, finite(surface.radius)) + skin,
    contactSkinMeters: skin,
    stage: SHIELD_CONTACT_SKIN_STAGE,
  });
}
