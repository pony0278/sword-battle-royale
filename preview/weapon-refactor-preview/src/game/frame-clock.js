// R20K.1 (B6e) - the frame clock, and the one place a measurement may take it off the wall.
//
// R22I.1 renamed this from createLabFrameClock. "Lab" named the only caller there has ever been,
// not the thing: a frame clock that a harness may pin is what any build of this game needs, and
// pinning is a capability the header below describes rather than part of what it is. The obvious
// alternative, createFixedStepFrameClock, would have been worse - it defaults to the WALL clock and
// is only fixed-step while something is measuring.
//
// The lab integrates on requestAnimationFrame deltas, clamped so a dropped frame cannot teleport
// the sim. That is right for play and wrong for measurement: the golden grid's cells clear the
// shield by as little as 1cm (measured: LEFT@2.0 closes to 0.0-1.3cm before contact), so the same
// cell run twice on the same build took different frame deltas, sampled the swing at different
// phases, and landed on either side of that centimetre - roughly one flipped cell per eleven-cell
// pass, wandering between cells, on main as much as on any branch. A safety net that reports a
// different answer to the same question is not a safety net.
//
// So a harness may pin the step: every frame then advances exactly the same sim time no matter
// what the browser or the machine is doing, and a cell's trajectory is reproducible. It does not
// widen any margin - a 1cm clearance stays 1cm - it only stops the margin being re-rolled. The
// frame counter is the other half: with a pinned step, "wait 150 frames" is an exact sim duration
// where "wait 2500ms" never was.
//
// Pinning is for measurement only. Play must keep the wall clock, or the sim would run fast on a
// slow machine and slow on a fast one; setFixedStep(null) is how a harness hands the clock back.
export function createFrameClock({ maxStepMs = 50, now = () => performance.now() } = {}) {
  let lastTimestamp = now();
  let frames = 0;
  let fixedStepMs = null;

  return Object.freeze({
    // Returns the raw delta this frame is worth. The caller still owns what it does with it.
    tick(timestamp) {
      const wall = Math.min(maxStepMs, Math.max(0, Number(timestamp) - lastTimestamp));
      lastTimestamp = Number(timestamp);
      frames += 1;
      return fixedStepMs == null ? wall : fixedStepMs;
    },
    get frames() { return frames; },
    get fixedStepMs() { return fixedStepMs; },
    get report() {
      return Object.freeze({ stage: 'R20K.1', frames, fixedStepMs, pinned: fixedStepMs != null });
    },
    // A harness pins the step; anything non-positive or non-finite hands the clock back to the wall.
    setFixedStep(milliseconds) {
      const value = Number(milliseconds);
      fixedStepMs = Number.isFinite(value) && value > 0 ? value : null;
      return fixedStepMs;
    },
  });
}
