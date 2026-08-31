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
    // R21K.1: the burst's stretch is barely touched; the window it opens is moved by starting
    // 20ms of source earlier. See LEFT_SECOND_PASS_REFERENCES.
    direction: 'left',
    startSourceSeconds: 0.18,
    endSourceSeconds: 1 / 3,
    stretch: 3.125,
    reason: 'left-burst-3972-deg-per-second-in-one-key; window closed 13ms before the measured press',
  }),
  right: Object.freeze({
    // R21I.1: 1.6 -> 1.87. See RIGHT_RETIME_REFERENCES.secondPass for what a player's hands
    // measured against the first one.
    direction: 'right',
    startSourceSeconds: 0,
    endSourceSeconds: 0.3,
    stretch: 1.87,
    reason: 'right-window-closed-42ms-before-the-players-measured-press',
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

  // R21I.1 - the second pass, and this one was set by a person's hands rather than by a
  // derivation. R21B.1 got RIGHT from "nobody can block it" to "blockable", and the parry tally
  // then measured what was still wrong with it.
  //
  // Across 29 driven swings a player pressed at a strikingly consistent moment in every direction:
  // median 350ms after the swing began for TOP, 350ms for RIGHT, 300ms for LEFT. The reaction is
  // not what differs between the three - the WINDOW's placement is.
  //
  //   direction   window closes   player's median press   verdict
  //   top         370ms           350ms                   inside, 4 of 9 presses land in it
  //   left        320ms           300ms                   inside, 5 of 9
  //   right       308ms           350ms                   42ms LATE, 1 of 9
  //
  // RIGHT got zero wrong-direction errors in that sample - it is read perfectly and answered too
  // late - so this is a placement problem and nothing else. The window is [contact-180, contact-60],
  // so a 350ms press needs contact at 410ms or later simply to be inside it.
  //
  // 0.430s is taken rather than the 0.410s minimum because it is TOP's contact time, a number
  // already in the game, and TOP is the direction whose window that same player demonstrably lands
  // presses inside. Tuning instead to capture 100% of their current presses would have wanted
  // ~450ms, and that would be over-fitting: their success rate went 1.3% to 10% between two
  // sessions, so the distribution being fitted is still moving.
  //
  // The cost, stated: RIGHT is no longer the quickest of the three - it ties TOP, and LEFT's 380ms
  // becomes the fastest contact. And the peak that R21B.1 tuned to match TOP exactly (1667) drops
  // to a predicted 2686/1.87 = 1436 deg/s, which stops being TOP's number. It lands between LEFT's
  // measured 1347 and TOP's 1667 - inside the band of two swings already accepted - rather than
  // anywhere new.
  secondPass: Object.freeze({
    stretchBefore: 1.6,
    stretchAfter: 1.87,
    runtimeContactSecondsAfter: 0.4301,
    playerMedianPressMsAfterSwingStart: Object.freeze({ top: 350, right: 350, left: 300 }),
    windowClosesMsBefore: Object.freeze({ top: 370, right: 308, left: 320 }),
    rightMedianMsPastClose: 42,
    rightWrongDirectionInSample: 0,
    minimumContactSecondsForA350msPress: 0.41,
    predictedPeakDegreesPerSecond: 1436,
    peakBandAlreadyAccepted: Object.freeze({ left: 1347, top: 1667 }),
    sampleSwings: 29,
    // Re-measured after the change, and the honest caveat with it: this sampler reads the blade
    // AXIS turning between two 60fps frames, and it puts TOP at 2199 where the record above says
    // 1667. So it is not the instrument R21B.1 used, and 1486 must not be read against 1667 as if
    // it were. All three were taken on this one sampler in the same run, which is what makes them
    // comparable - and on it RIGHT still lands between LEFT and TOP, which is the claim the
    // stretch was chosen to keep. The prediction (1436) and the reading (1486) agree to 3.5%.
    sameSamplerPeakDegreesPerSecond: Object.freeze({ top: 2199, right: 1486, left: 1334 }),
    sameSamplerNote: 'blade-axis-turn-per-60fps-frame; reads higher than the R21B.1 record, so compare within this row only',
  }),
});

// R21K.1 - LEFT, the same fault RIGHT had, fixed a different way.
//
// R21I.1 moved RIGHT's contact to where a player's presses actually land and it worked outright:
// 1 parry in 10 became 11 in 19, with 15 of 19 presses inside the window. The same tally then said
// LEFT had inherited the problem - 12 of 19 too late, 5 of 18 presses inside - and by the same
// margin RIGHT used to miss by:
//
//   direction   window closes   player's median press   presses inside
//   top         370ms           350ms                    9 of 17
//   right       370ms           333ms                   15 of 19
//   left        320ms           333ms                    5 of 18   <- 13ms late
//
// So LEFT wants RIGHT's remedy - contact at 0.43s, where the window is 250-370ms and RIGHT's
// median press of TTC 97ms now lands 15 times in 19. But RIGHT's METHOD does not transfer.
//
// LEFT is already stretched three times, and the clips are baked at 30fps: each authored key
// already spans 100ms, six whole frames, and the blade crosses each of them at a constant rate.
// Measured, the plateaus are plainly visible - 17.x for eight frames, 22.2 for six, 11.8 for six.
// Reaching 0.43s by stretch alone needs 3.833, which makes every key 128ms and would fix the
// timing by making the swing step.
//
// Starting the warp 20ms of source earlier buys the same delay for almost no extra stretch:
//
//   0.18 + (0.26 - 0.18) * 3.125 = 0.43 exactly
//
//   route                       stretch   contact   peak deg/s   key span
//   as it was                   3.000     380ms     ~1324        100ms
//   stretch alone (RIGHT's way) 3.833     430ms     ~1036        128ms
//   earlier start (taken)       3.125     430ms     ~1271        104ms
//
// What is given up is 20ms of the windup's authored pace, and R20M.1 kept that pace deliberately:
// the slow low preparation is LEFT's identity and its only tell. Twenty milliseconds of it, at
// 3.125 rather than 1, is not that tell.
export const LEFT_SECOND_PASS_REFERENCES = Object.freeze({
  startSourceSecondsBefore: 0.2,
  startSourceSecondsAfter: 0.18,
  stretchBefore: 3,
  stretchAfter: 3.125,
  runtimeContactSecondsBefore: 0.38,
  runtimeContactSecondsAfter: 0.43,
  playerMedianPressMsAfterSwingStart: 333,
  windowClosedMsBefore: 320,
  msLate: 13,
  pressesInsideWindowBefore: Object.freeze({ inside: 5, of: 18 }),
  rightAfterItsOwnRetime: Object.freeze({ inside: 15, of: 19, parried: 11, swings: 19 }),
  // The reason the stretch was not simply raised. A 30fps key at each candidate stretch:
  authoredKeySeconds: 1 / 30,
  keySpanMsBefore: 100,
  keySpanMsIfStretchedAlone: 128,
  keySpanMsAfter: 104,
  stretchIfRaisedAlone: 3.833,
  predictedPeakDegreesPerSecond: 1271,
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
