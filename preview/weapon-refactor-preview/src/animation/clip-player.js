import { evaluateClip } from './animation-clip.js';

export class ClipPlayer {
  constructor(clip = null) {
    this.clip = clip;
    this.frame = 0;
    this.playing = false;
    this.loop = false;
    this.speed = 1;
  }

  setClip(clip, { reset = true } = {}) {
    this.clip = clip;
    if (reset) this.seek(0);
    return this.evaluate();
  }

  play({ restart = false } = {}) {
    if (!this.clip) return null;
    if (restart || this.frame >= this.clip.durationFrames) this.frame = 0;
    this.playing = true;
    return this.evaluate();
  }

  pause() {
    this.playing = false;
    return this.evaluate();
  }

  seek(frame) {
    const max = this.clip ? this.clip.durationFrames : 0;
    this.frame = Math.max(0, Math.min(Number(frame) || 0, max));
    return this.evaluate();
  }

  update(deltaSeconds) {
    if (!this.clip || !this.playing) return this.evaluate();
    this.frame += Math.max(0, Number(deltaSeconds) || 0) * this.clip.fps * this.speed;
    if (this.frame >= this.clip.durationFrames) {
      if (this.loop && this.clip.durationFrames > 0) this.frame %= this.clip.durationFrames;
      else {
        this.frame = this.clip.durationFrames;
        this.playing = false;
      }
    }
    return this.evaluate();
  }

  evaluate(options) {
    return this.clip ? evaluateClip(this.clip, this.frame, options) : null;
  }
}

