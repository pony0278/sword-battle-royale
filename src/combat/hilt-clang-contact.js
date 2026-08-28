import { probeSweptSwordBucklerContact } from './swept-sword-buckler-contact.js';

export const HILT_CLANG_CONTACT_STAGE = 'R19P.1';
export const HILT_CLANG_CONTACT_AUTHORITY = 'hilt-clang-authored-zone-swept-contact';

// R19P.1: inside the working floor, the hilt jars the held shield and the swing ends as a block.
//
// This is the third of three steps against what the close-range film showed. The first two made
// the defender honest - no flinch at range, no lunge after an unreachable blade - and left the
// close band in its true state: the shield holds in front, and the swing passes through the
// defender anyway, because the swept probe tests the blade and at this distance the blade is
// already behind the shield plane when it arrives. What actually travels through the space in
// front of the defender is the attacker's HILT - wrist to blade base - measured crossing the
// shield plane inside the attack's active window on every close swing.
//
// The zone is authored, and this comment is the honest label on that. Measured under the shipped
// hold posture with the arm segments tracked through the active window, the attacker's forearm
// and hilt punch through the shield plane between one frame and the next on every close swing,
// and the crossing corridor depends on the direction: a TOP chop crosses 0.52-0.66m from the
// resting shield's centre (it travels the defender's centre line while the buckler rests at
// their side) and RIGHT's horizontal sweep enters wider still, at about 0.85m - so no zone that
// pretends to be the wooden disc (0.26m) can honestly reach either. A strict physical read would say "no contact"
// and let swings pass through bodies forever; the design this codebase is building says a swing
// thrown from inside your own reach meets the defender's braced shield arm and stops, the way it
// does in the games this lab studies. So the zone is the defender's braced frontal area around
// the boss - the measured arm corridor plus margin - and within it, in hold posture only, a hilt
// crossing IS a shield contact. What keeps this a rule rather than a cheat is everything it
// inherits: the crossing must be swept (the same sub-frame solver as the blade), it must fall
// inside the attack's authored active window (the same temporal eligibility), and the outcome
// then runs the ordinary block resolution - reaction, recoil, ground transfer. Nothing downstream
// knows the difference, which is the point.
export const HILT_CLANG_ZONE_RADIUS_METERS = 0.95;

function vec(point = {}) {
  return {
    x: Number(point?.x) || 0,
    y: Number(point?.y) || 0,
    z: Number(point?.z) || 0,
  };
}

// The hilt as a two-point polyline for the same swept solver the blade uses. Fraction semantics
// inside a clang report therefore run wrist (0) to blade base (1) - callers that read blade
// fraction for release geometry must not be handed a clang report, and the block path does not.
export function buildHiltPolyline(wristPoint, bladeBasePoint) {
  if (!wristPoint || !bladeBasePoint) return null;
  return [vec(wristPoint), vec(bladeBasePoint)];
}

// One question: did the hilt sweep across the clang zone this frame? Geometry only - the caller
// owns posture (hold only), mode (block only), and temporal eligibility, exactly as it does for
// the blade probe this wraps.
export function probeHiltClangContact(input = {}) {
  const previousHilt = input.previousHilt;
  const currentHilt = input.currentHilt;
  const surface = input.bucklerSurface;
  if (!previousHilt || !currentHilt || !surface) return null;
  const report = probeSweptSwordBucklerContact({
    previousBlade: previousHilt,
    currentBlade: currentHilt,
    bucklerSurface: {
      ...surface,
      radius: HILT_CLANG_ZONE_RADIUS_METERS,
    },
    deltaSeconds: input.deltaSeconds,
    active: true,
  });
  if (!report) return null;
  return Object.freeze({
    ...report,
    hiltClang: report.geometricContact === true,
    clangZoneRadiusMeters: HILT_CLANG_ZONE_RADIUS_METERS,
    physicalDiscRadiusMeters: Number(surface.radius) || 0,
    authority: HILT_CLANG_CONTACT_AUTHORITY,
  });
}
