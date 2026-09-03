// R24G.2 - the frame time, in the log a person pastes back.
//
// A phone runs the same code as a desktop and sees different numbers: every per-frame writer in
// this fight scales with dt, so a 33ms frame moves an arm two to three times further than a 17ms
// one, and a small correction that is invisible at 60fps is a visible jerk at 30. Whether a phone
// IS at 30 - or 20, or throttled to something worse - is not something a paste of the swing log
// could say until now. This keeps the last few hundred wall-clock frame times and reports them
// the way the question is asked: what is a typical frame, what is the worst one, how many samples.
export const FRAME_TIME_SAMPLER_STAGE = 'r24g2-the-log-says-how-fast-the-phone-ran';
export const FRAME_TIME_SAMPLE_CAPACITY = 900; // 15s at 60fps: the fight that was just pasted, not the loading screen

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * fraction)));
  return sorted[index];
}

export function createFrameTimeSampler({ capacity = FRAME_TIME_SAMPLE_CAPACITY } = {}) {
  const samples = [];
  let head = 0;
  let count = 0;
  return Object.freeze({
    stage: FRAME_TIME_SAMPLER_STAGE,
    // One wall-clock frame. Zero and negative deltas (a clock that did not advance, a tab that came
    // back) are not frames and are dropped rather than counted as instant ones.
    push(milliseconds) {
      const ms = finite(milliseconds);
      if (ms == null || ms <= 0) return false;
      if (samples.length < capacity) samples.push(ms);
      else { samples[head] = ms; head = (head + 1) % capacity; }
      count += 1;
      return true;
    },
    get report() {
      const sorted = [...samples].sort((a, b) => a - b);
      const medianMs = percentile(sorted, 0.5);
      return Object.freeze({
        stage: FRAME_TIME_SAMPLER_STAGE,
        samples: samples.length,
        pushed: count,
        medianMs,
        p95Ms: percentile(sorted, 0.95),
        worstMs: sorted.length ? sorted[sorted.length - 1] : null,
        medianFps: medianMs ? 1000 / medianMs : null,
      });
    },
    reset() { samples.length = 0; head = 0; count = 0; },
  });
}

// One line for the pasted log. Absent samples say so rather than printing NaN.
export function formatFrameTimeLine(report) {
  if (!report || !(report.samples > 0)) return '幀時間 —（尚未取樣）';
  const ms = (value) => `${Number(value).toFixed(1)}ms`;
  return `幀時間 中位 ${ms(report.medianMs)}（${report.medianFps.toFixed(0)} fps）· 95% ${ms(report.p95Ms)} · 最差 ${ms(report.worstMs)} · 樣本 ${report.samples}`;
}
