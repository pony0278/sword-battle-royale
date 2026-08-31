import { createOpponentDriveRuntime } from '../../../src/game/opponent-drive-runtime.js';

// R21E.1 — composition only. This owns no authority: it reads two numbers off the lab and writes
// back through the same two public verbs a tester's hands use, setAttackerIntent and startAttack.
//
// Extracted from the entry for the reason the entry's line budget exists — the drive is a
// subsystem, and a subsystem's wiring is not composition the entry should carry. What is left
// there is the construction and one call.
export function createOpponentDriveController({
  toggle,
  laneController,
  startAttack,
  readAttackAvailable,
  runtime = createOpponentDriveRuntime(),
  telegraph = null, // R21F.1: optional, so a drive without a stance still works exactly as before
}) {
  if (!laneController || typeof startAttack !== 'function' || typeof readAttackAvailable !== 'function') {
    throw new Error('R21E.1 opponent drive needs the lane, the attack verb and the availability read');
  }
  const enabled = () => toggle?.checked === true;

  return Object.freeze({
    // Called every frame with real milliseconds. A tester slowing the pre-contact review down is
    // slowing the fight they are watching, not asking the opponent to think more slowly.
    frame(rawDeltaMs) {
      if (!enabled()) return null;
      const plan = runtime.frame({
        deltaMs: rawDeltaMs,
        separationMeters: laneController.report?.separationMeters ?? null,
        // The same conditions startAttack checks, asked before it rather than after: a direction
        // spent on a swing the lab then refuses would skew the very distribution the bag exists
        // to guarantee.
        attackAvailable: readAttackAvailable() === true,
      });
      laneController.setAttackerIntent(plan.intent);
      // R21F.1: the stance stands between deciding to swing and swinging. The drive holds the
      // direction it chose across the stance rather than re-asking the bag, or the pose the player
      // just read would be a promise about a different attack.
      if (!telegraph) {
        if (plan.attack && startAttack(plan.attack)) runtime.commit(plan.attack);
        return plan;
      }
      if (telegraph.active) {
        // A stance is only worth holding while the swing it announces can still happen. If the
        // spacing or the gate went away underneath it, drop it rather than lie to the player.
        if (!plan.attackAvailableNow || !plan.inBand) { telegraph.clear(); return plan; }
        if (telegraph.released && startAttack(telegraph.report.direction)) {
          runtime.commit(telegraph.report.direction);
          telegraph.clear();
        }
        return plan;
      }
      if (plan.attack) telegraph.begin(plan.attack);
      return plan;
    },
    setEnabled(on) {
      if (toggle) toggle.checked = on === true;
      if (!enabled()) telegraph?.clear(); // switching off must not leave a stance frozen on screen
      return enabled();
    },
    reseed: (seed) => { telegraph?.clear(); return runtime.reseed(seed); },
    get enabled() { return enabled(); },
    get report() { return enabled() ? runtime.report : null; },
    // One HUD line: the seed a tester quotes in a bug report, what is coming, and why it is or is
    // not swinging right now.
    get summary() {
      if (!enabled()) return '手動';
      const report = runtime.report;
      const gap = report.offsetMeters == null
        ? '—'
        : `${report.offsetMeters >= 0 ? '+' : ''}${report.offsetMeters.toFixed(2)}m`;
      const stance = telegraph?.active ? ` · 架式 ${String(telegraph.report.direction).toUpperCase()} ${telegraph.report.phase}` : '';
      return `seed ${report.seed} · 下一刀 ${String(report.upcoming).toUpperCase()} · ${report.reason}${stance} · 距離差 ${gap} · 已出 ${report.attacksServed}`;
    },
  });
}
