import { ClipPlayer } from './clip-player.js';
import {
  animationTimeAtFrame,
  normalizeAnimationBinding,
} from './animation-binding.js';

export class ActionMotionPlayer {
  constructor(options = {}) {
    this.posePlayer = options.posePlayer || new ClipPlayer();
    this.adapter = options.adapter || {};
    this.action = null;
    this.appliedSource = null;
  }

  get clip() { return this.posePlayer.clip; }
  get frame() { return this.posePlayer.frame; }
  get playing() { return this.posePlayer.playing; }
  get loop() { return this.posePlayer.loop; }
  set loop(value) { this.posePlayer.loop = Boolean(value); }
  get speed() { return this.posePlayer.speed; }
  set speed(value) { this.posePlayer.speed = Number(value) || 1; }
  get binding() {
    return normalizeAnimationBinding(this.action?.animationBinding, this.clip?.id || '');
  }

  setProject(clip, action, options = {}) {
    this.action = action || null;
    return this.posePlayer.setClip(clip, options);
  }

  setClip(clip, options = {}) {
    return this.posePlayer.setClip(clip, options);
  }

  setAction(action) {
    this.action = action || null;
    return this.evaluate();
  }

  play(options) { return this.decorate(this.posePlayer.play(options)); }
  pause() { return this.decorate(this.posePlayer.pause()); }
  seek(frame) { return this.decorate(this.posePlayer.seek(frame)); }
  update(deltaSeconds) { return this.decorate(this.posePlayer.update(deltaSeconds)); }
  evaluate(options) { return this.decorate(this.posePlayer.evaluate(options)); }

  decorate(evaluation) {
    if (!evaluation) return null;
    const binding = this.binding;
    const external = binding.source !== 'authored';
    const hasAnimation = external
      && binding.clipId
      && (this.adapter.hasAnimation ? this.adapter.hasAnimation(binding.clipId) : Boolean(this.adapter.sampleAnimation));
    const animationDurationSeconds = hasAnimation && this.adapter.getAnimationDuration
      ? this.adapter.getAnimationDuration(binding.clipId)
      : 0;
    return {
      ...evaluation,
      motion: {
        source: binding.source,
        clipId: binding.clipId,
        binding,
        available: Boolean(hasAnimation),
        pending: external && !hasAnimation,
        timeSeconds: external
          ? animationTimeAtFrame(binding, evaluation.frame, this.clip?.fps, animationDurationSeconds)
          : evaluation.frame / Math.max(1, this.clip?.fps || 30),
      },
    };
  }

  apply(evaluation = this.evaluate()) {
    if (!evaluation) return null;
    const { motion } = evaluation;
    if (motion.source !== 'authored' && motion.available && this.adapter.sampleAnimation) {
      this.adapter.sampleAnimation(motion.clipId, motion.timeSeconds, motion.binding);
      this.appliedSource = motion.source;
      return { ...evaluation, motion: { ...motion, appliedSource: motion.source } };
    }
    if (this.appliedSource && this.appliedSource !== 'authored') this.adapter.stopAnimation?.();
    this.adapter.applyPose?.(evaluation.pose);
    this.appliedSource = 'authored';
    return { ...evaluation, motion: { ...motion, appliedSource: 'authored' } };
  }
}
