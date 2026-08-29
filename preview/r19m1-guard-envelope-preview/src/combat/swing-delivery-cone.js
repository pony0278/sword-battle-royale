export const SWING_DELIVERY_CONE_STAGE = 'R20A.1';

// R20A.1: the attacker's delivery cone, and what a sidestep actually buys today. The B4
// pre-investigation, recorded before any soft tracking is built - because its findings falsify
// the premise B4 was scoped under.
//
// Method, two instruments at the calibrated stances, fresh page per trial:
//   STATIC - a controlled aim error injected onto the attacker's facing (scene stamp and
//   swing-spend direction together), defender square and fully defending, each direction
//   replayed per angle at 2.4m. Positive error is the sign a defender stepping their OWN LEFT
//   induces on a frozen attacker (attacker rotation.y positive on the lane).
//   DYNAMIC - no injection: a full-speed sidestep held from the commitment frame against the
//   shipping freeze, outcome plus the bearing error the strafe had actually accumulated when
//   the exchange resolved.
//
// The one-sentence finding: TODAY'S SIDESTEP IS NOT A DODGE, AND B4'S PREMISE WAS BACKWARDS.
// The R19T freeze was accepted as "a sidestep mid-swing is stepped away from, never tracked",
// and B4 was scoped as making that absolute dodge conditional. Measured, the absolute dodge
// does not exist: at 2.4m every full-speed sidestep against TOP and RIGHT is still blocked
// (the guard's own tracking absorbs the +/-6-12 degrees a windup permits), and the single true
// dodge cell in the whole grid is LEFT met by a left step (3/4 whiff). Everything else a
// sidestep changes, it changes AGAINST the defender: the delivery cone has the same shape as
// the guard cone (R19X.1) - a body-hit band sits between the block band and the whiff band on
// the shield-flank side, LEFT's flank collapsing at TWO degrees - so a stepping defender
// mostly walks their own body into the arc's uncovered angle. LEFT met by a left step is 4/4
// body hits at 1.6m and 1.8m; TOP met by a right step at 1.8m is a coin flip of body hits at
// the -25 cliff's edge.
//
// Why the angles are small: the windups are short (TOP 0.375s, RIGHT 0.190s, LEFT 0.215s -
// authored contacts minus the active leads in longsword-directional-attack-runtime.js), and
// 0.75 m/s of lateral speed buys only ~6-9 degrees at RIGHT/LEFT tempo, ~12-20 at TOP's. The
// active windows are ~0.1s, worth ~2-3 degrees - dodge-by-timing inside the swing is
// geometrically negligible; the windup is where every degree comes from. Full negation by a
// B4 windup tracker therefore needs only ~45-55 deg/s, and what it would buy is measured
// here in advance: it removes the grid's one true dodge and the defender's self-harm cells
// alike - it makes ATTACKS more reliable, not defence. That trade is now a design decision
// with numbers on it instead of a slider tuned blind.
export const MEASURED_ATTACK_TIMELINE_SECONDS = Object.freeze({
  top: Object.freeze({ contact: 0.43, activeStart: 0.375, activeEnd: 0.495, windup: 0.375 }),
  right: Object.freeze({ contact: 0.23, activeStart: 0.19, activeEnd: 0.28, windup: 0.19 }),
  left: Object.freeze({ contact: 0.26, activeStart: 0.215, activeEnd: 0.315, windup: 0.215 }),
});

// aimErrorDegrees -> [blocked, bodyHit, whiff] of n, at the 2.4m calibrated stance. Rates,
// not verdicts; boundary cells carry their noise on purpose.
export const MEASURED_DELIVERY_CONE_TRIALS = Object.freeze({
  top: Object.freeze({
    '-45': [0, 1, 1], '-30': [0, 6, 0], '-25': [0, 4, 0], '-20': [6, 0, 0], '-15': [2, 0, 0],
    '-10': [2, 0, 0], '-5': [2, 0, 0], '0': [2, 0, 0], '5': [2, 0, 0], '10': [2, 0, 0],
    '15': [6, 0, 0], '20': [4, 0, 2], '25': [0, 0, 4], '30': [0, 0, 2], '45': [0, 0, 2],
  }),
  right: Object.freeze({
    '-45': [0, 0, 2], '-30': [0, 0, 2], '-20': [2, 0, 0], '-15': [2, 0, 0], '-10': [2, 0, 0],
    '-5': [2, 0, 0], '0': [2, 0, 0], '5': [6, 0, 0], '8': [3, 1, 0], '10': [5, 1, 0],
    '12': [4, 0, 0], '15': [2, 4, 0], '20': [0, 2, 0], '30': [0, 2, 0], '45': [0, 0, 2],
  }),
  left: Object.freeze({
    '-45': [0, 0, 2], '-30': [0, 0, 2], '-20': [0, 1, 1], '-15': [0, 2, 0], '-10': [0, 1, 1],
    '-8': [0, 3, 1], '-5': [0, 4, 2], '-3': [0, 3, 1], '-2': [0, 4, 0], '0': [2, 0, 0],
    '5': [2, 0, 0], '10': [2, 0, 0], '15': [2, 0, 0], '20': [2, 0, 0], '30': [2, 0, 0],
    '45': [2, 0, 0],
  }),
});

// The dynamic grid: attack direction x the defender's own step side, full speed from the
// commitment frame, shipping freeze. outcome [blocked, bodyHit, whiff] of n, and the bearing
// error the strafe had accumulated when the exchange resolved (own-left positive).
export const MEASURED_STRAFE_DODGE_TRIALS = Object.freeze({
  '2.4': Object.freeze({
    top: Object.freeze({ ownLeft: [4, 0, 0], ownRight: [4, 0, 0], errorDegrees: 12 }),
    right: Object.freeze({ ownLeft: [4, 0, 0], ownRight: [4, 0, 0], errorDegrees: 6 }),
    left: Object.freeze({ ownLeft: [0, 1, 3], ownRight: [4, 0, 0], errorDegrees: 6 }),
  }),
  '2.0': Object.freeze({
    top: Object.freeze({ ownLeft: [4, 0, 0], ownRight: [4, 0, 0], errorDegrees: 16 }),
  }),
  '1.8': Object.freeze({
    top: Object.freeze({ ownLeft: [4, 0, 0], ownRight: [2, 2, 0], errorDegrees: 20 }),
    right: Object.freeze({ ownLeft: [4, 0, 0], ownRight: [4, 0, 0], errorDegrees: 9 }),
    left: Object.freeze({ ownLeft: [0, 4, 0], ownRight: [4, 0, 0], errorDegrees: 9 }),
  }),
  '1.6': Object.freeze({
    left: Object.freeze({ ownLeft: [0, 4, 0], ownRight: [4, 0, 0], errorDegrees: 10 }),
  }),
});

// The reliable block band per direction at 2.4m, same derivation rule as the guard cone's:
// widest contiguous span around zero at full rate, boundary-noise cells outside it. The
// asymmetry mirrors R19X.1 - each arc's shield-flank side dies first, LEFT's at once - and
// past the block band the FIRST failure mode is the defender's body, not a whiff.
export const MEASURED_DELIVERY_RELIABLE_BAND_DEGREES = Object.freeze({
  top: Object.freeze({ fromDegrees: -20, toDegrees: 15 }),
  right: Object.freeze({ fromDegrees: -20, toDegrees: 12 }),
  left: Object.freeze({ fromDegrees: 0, toDegrees: 45 }),
});
