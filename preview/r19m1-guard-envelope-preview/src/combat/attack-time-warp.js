export const ATTACK_TIME_WARP_STAGE = 'R20M.1';

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
export const ATTACK_TIME_WARPS = Object.freeze({
  left: Object.freeze({
    direction: 'left',
    startSourceSeconds: 0.2,
    endSourceSeconds: 1 / 3,
    stretch: 3,
    reason: 'left-burst-3972-deg-per-second-in-one-key',
  }),
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
