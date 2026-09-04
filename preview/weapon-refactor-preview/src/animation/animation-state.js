// Presentation-only mapping between an externally supplied action state and a
// clip. It intentionally contains no hit, guard, parry or counter resolution.
export class AnimationState {
  constructor(clips = {}) {
    this.clips = new Map(Object.entries(clips));
    this.actionId = null;
  }

  register(clip) {
    this.clips.set(clip.id, clip);
    return clip;
  }

  applyActionState(actionState, player) {
    const nextActionId = actionState?.clipId || actionState?.actionId || null;
    if (!nextActionId || !this.clips.has(nextActionId)) return null;
    if (this.actionId !== nextActionId) {
      this.actionId = nextActionId;
      player.setClip(this.clips.get(nextActionId));
    }
    if (Number.isFinite(Number(actionState.frame))) player.seek(Number(actionState.frame));
    if (actionState.playing === true) player.play();
    if (actionState.playing === false) player.pause();
    return player.evaluate();
  }
}

