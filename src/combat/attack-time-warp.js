export const ATTACK_TIME_WARP_STAGE = 'R21B.1';

// R20M.1 (B6h) - a swing may be fast, but it may not disappear.
//
// The attack clips are baked at 30fps, so the pose advances on a 33.4ms grid and the blade's
// velocity is piecewise constant, stepping at every key. That is ordinary for an animation asset.
// What is not ordinary is how much of LEFT's swing lands inside two of those keys. Measured, per
// key interval, blade axis rotation:
//
//   direction  windup       peak        strike burst          total swing
//   TOP        92-546 deg/s 1651 deg/s  155 deg = 25% in 100ms  630 deg
//   RIGHT      957-1292     2619        147 deg = 31% in 100ms  481 deg
//   LEFT       400-482      3972        271 deg = 57% in 100ms  474 deg
//
// LEFT rotates 132 degrees inside the single key interval that contains its own contact. A real
// longsword cut's fast phase runs roughly 700-1200 deg/s; LEFT peaks at three to four times that,
// with the slowest windup of the three. On screen it reads as "raised slowly, then already
// landed": from swing start to contact is 260ms against a human reaction of about 250ms. It is
// also why LEFT has been the direction where every defensive measurement went strange - the blade
// crosses the entire defended zone between two keys, so contact lands wherever the sampling
// happens to catch it.
//
// So LEFT's burst is stretched, and only the burst. The windup keeps its authored pace (that slow
// low preparation is the attack's identity and its only tell), the follow-through keeps its shape,
// and the interval between them is played at a third speed:
//
//   source 0.000 - 0.200s  rate 1     the windup, untouched
//   source 0.200 - 0.333s  rate 1/3   the burst, stretched from 133ms to 400ms
//   source 0.333 - end     rate 1     the follow-through, untouched
//
// which puts the peak at about 1320 deg/s - inside the range a real cut occupies and just under
// TOP's 1651 - and moves contact from 0.26s to 0.38s, so LEFT becomes reactable rather than
// merely survivable. Nothing about the pose changes; only when each pose is reached.
//
// The map is between two clocks and both names matter. SOURCE time is where the clip is sampled.
// RUNTIME time is what the exchange counts - what elapsedSeconds means, what contactSeconds is
// compared against, what the player experiences. Everything outside the animation sampler speaks
// runtime; the sampler is the one caller that has to convert back.
//
// R21B.1 - RIGHT, for a different reason, found the same way.
//
// Re-measuring the blade axis per frame reproduced the table above (TOP peaked at 1667 against
// 1651, RIGHT at 2686 against 2619, and LEFT at 1347 - which is the warp above doing exactly what
// it predicted). RIGHT then failed a play test outright: nobody could parry it. The measurement
// says why, and says it is two faults rather than one.
//
//   ms   :   50   83  117  150  183 |  217   250   283 |  317
//   deg/s:  676 1111 1225 1234  506 | 1613  2686  1653 |  672
//           +------- windup -------+ +---- strike ----+
//
// The peak is the fault LEFT had: 2686 deg/s, more than twice a real cut's fast phase. The second
// is that RIGHT'S WINDUP IS ALREADY A STRIKE - it turns at 676-1234 deg/s while TOP prepares at
// 53-325 and LEFT at 374-670. There is no slow phase to read, which is what a telegraph is.
//
// That second fault is why LEFT's remedy does not transfer. Stretching only the burst works when
// contact sits late inside it, as LEFT's did; RIGHT's contact at 0.23s sits near the FRONT of its
// burst, so stretching 0.20-0.30 alone moves contact to 0.26s and buys 30ms. The parry window
// would still close at 240ms, and a human who starts the clock at commitment presses at 250-300.
//
// So the stretch covers the windup and the burst together, and its size is taken from two numbers
// this project has already accepted rather than chosen:
//
//   peak     2686 / 1.6 = 1679 deg/s, which is TOP's untouched 1667 within the spread of the
//            measurement itself (my 1667 against R20M.1's 1651 is the same 1%)
//   contact  0.23 * 1.6 = 0.368s, just inside LEFT's 0.380s - the one contact time a person has
//            confirmed by hand is reactable - so RIGHT stays the quickest of the three
//
// The windup lands at 423-771 deg/s: still the fastest preparation of the three, which is RIGHT's
// identity, but no longer indistinguishable from a strike. The follow-through past 0.30s keeps its
// authored pace and simply starts later.
export const ATTACK_TIME_WARPS = Object.freeze({
  left: Object.freeze({
    direction: 'left',
    startSourceSeconds: 0.2,
    endSourceSeconds: 1 / 3,
    stretch: 3,
    reason: 'left-burst-3972-deg-per-second-in-one-key',
  }),
  right: Object.freeze({
    direction: 'right',
    startSourceSeconds: 0,
    endSourceSeconds: 0.3,
    stretch: 1.6,
    reason: 'right-windup-was-already-a-strike-and-peaked-at-2686-deg-per-second',
  }),
});

// R21B.1: what the stretch was set against, kept as numbers rather than as a story. Both are
// measurements of something already in the game, not targets invented for this change.
export const RIGHT_RETIME_REFERENCES = Object.freeze({
  measuredPeakDegreesPerSecond: 2686,
  topUntouchedPeakDegreesPerSecond: 1667,
  leftContactSecondsAfterWarp: 0.38,
  rightSourceContactSeconds: 0.23,
  windupDegreesPerSecondBefore: Object.freeze({ from: 676, to: 1234 }),
  // Predicted 1679 and 423-771 by dividing the before numbers; re-measured in the lab afterwards
  // at 1667 and 237-803, which is TOP's untouched peak to the digit. The prediction is kept beside
  // the measurement because a derivation that turns out right is worth being able to check.
  predictedPeakDegreesPerSecond: 1679,
  measuredPeakAfterDegreesPerSecond: 1667,
  windupDegreesPerSecondAfter: Object.freeze({ from: 237, to: 803 }),
  windupRuntimeMsBefore: Object.freeze({ from: 17, to: 183 }),
  windupRuntimeMsAfter: Object.freeze({ from: 17, to: 283 }),
  runtimeContactSecondsAfter: 0.368,
  authority: 'attack-timing-only-no-contact-authority',
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function getAttackTimeWarp(direction) {
  return ATTACK_TIME_WARPS[String(direction || '').toLowerCase()] || null;
}

function normalize(warp) {
  if (!warp) return null;
  const start = Math.max(0, finite(warp.startSourceSeconds, 0));
  const end = Math.max(start, finite(warp.endSourceSeconds, start));
  const stretch = Math.max(1, finite(warp.stretch, 1));
  if (end <= start || stretch === 1) return null;
  return { start, end, stretch, span: end - start };
}

// Source -> runtime. Used to restate every authored source time (contact, the active window, the
// trail, the commitment marker, the clip's own length) in the clock the exchange counts in.
export function warpSourceToRuntime(sourceSeconds, warp) {
  const w = normalize(warp);
  const t = finite(sourceSeconds, 0);
  if (!w) return t;
  if (t <= w.start) return t;
  if (t >= w.end) return t + w.span * (w.stretch - 1);
  return w.start + (t - w.start) * w.stretch;
}

// Runtime -> source. The animation sampler's direction: given how long the exchange says the
// swing has been running, which pose is it standing in?
export function warpRuntimeToSource(runtimeSeconds, warp) {
  const w = normalize(warp);
  const t = finite(runtimeSeconds, 0);
  if (!w) return t;
  const stretchedEnd = w.start + w.span * w.stretch;
  if (t <= w.start) return t;
  if (t >= stretchedEnd) return t - w.span * (w.stretch - 1);
  return w.start + (t - w.start) / w.stretch;
}
