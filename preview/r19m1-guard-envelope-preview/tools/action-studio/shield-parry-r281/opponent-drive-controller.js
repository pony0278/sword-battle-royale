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
  tally = null, // R21G.1: told when a run starts, so each run is read on its own sample
}) {
  if (!laneController || typeof startAttack !== 'function' || typeof readAttackAvailable !== 'function') {
    throw new Error('R21E.1 opponent drive needs the lane, the attack verb and the availability read');
  }
  const enabled = () => toggle?.checked === true;

  return Object.freeze({
    // Called every frame with real milliseconds. A tester slowing the pre-contact review down is
    // slowing the fight they are watching, not asking the opponent to think more slowly.
    frame(rawDeltaMs) {
      // Told every frame rather than on the click: the checkbox is polled, not listened to, and a
      // rising edge the tally detects itself cannot be missed by a handler that was never bound.
      tally?.setSessionActive(enabled());
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
      if (plan.attack && startAttack(plan.attack)) runtime.commit(plan.attack);
      return plan;
    },
    setEnabled(on) { if (toggle) toggle.checked = on === true; return enabled(); },
    reseed: (seed) => runtime.reseed(seed),
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
      return `seed ${report.seed} · 下一刀 ${String(report.upcoming).toUpperCase()} · ${report.reason} · 距離差 ${gap} · 已出 ${report.attacksServed}`;
    },
  });
}
