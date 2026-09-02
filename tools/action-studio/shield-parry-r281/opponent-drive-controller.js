import { createOpponentDriveRuntime } from '../../../src/game/opponent-drive-runtime.js';
import { createOpponentGuardRuntime } from '../../../src/game/opponent-guard-runtime.js';

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
  // R23S.1: the shield. The drive walks and swings; this decides whether the shield is up, and the
  // lab is handed the verdict through one verb, the way the walk intent and the swing already are.
  // R23T.1: and which sector it is in - the verb carries both.
  guardRuntime = createOpponentGuardRuntime({ seed: runtime.seed }),
  readThreat = () => null,
  readOwnSwinging = () => false,
  applyGuard = () => {},
}) {
  if (!laneController || typeof startAttack !== 'function' || typeof readAttackAvailable !== 'function') {
    throw new Error('R21E.1 opponent drive needs the lane, the attack verb and the availability read');
  }
  const enabled = () => toggle?.checked === true;
  let wasEnabled = false;

  return Object.freeze({
    // Called every frame with real milliseconds. A tester slowing the pre-contact review down is
    // slowing the fight they are watching, not asking the opponent to think more slowly.
    frame(rawDeltaMs) {
      // Told every frame rather than on the click: the checkbox is polled, not listened to, and a
      // rising edge the tally detects itself cannot be missed by a handler that was never bound.
      // A run begins on the rising edge, and both counters have to start there or the report
      // carries two totals on different clocks.
      const running = enabled();
      if (running && !wasEnabled) runtime.resetRun();
      wasEnabled = running;
      tally?.setSessionActive(running);
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
      const guard = guardRuntime.frame({ threat: readThreat(), ownSwinging: readOwnSwinging() === true });
      applyGuard({ held: guard.hold === true, sector: guard.sector });
      return plan;
    },
    setEnabled(on) { if (toggle) toggle.checked = on === true; return enabled(); },
    reseed: (seed) => { guardRuntime.reseed(seed); return runtime.reseed(seed); },
    get guardReport() { return guardRuntime.report; }, // R23S.1
    get enabled() { return enabled(); },
    get report() { return enabled() ? runtime.report : null; },
    // One HUD line: the seed a tester quotes in a bug report, what is coming, and why it is or is
    // not swinging right now.
    get summary() {
      // R21G.2: a run that has been switched off still names its seed. A tester switches the
      // opponent off before reading the numbers, and a sample whose seed is gone cannot be replayed
      // - which was the whole reason for seeding it.
      if (!enabled()) {
        const last = runtime.report;
        return last.attacksServed > 0 ? `手動（上一輪 seed ${last.seed} · 已出 ${last.attacksServed}）` : '手動';
      }
      const report = runtime.report;
      const gap = report.offsetMeters == null
        ? '—'
        : `${report.offsetMeters >= 0 ? '+' : ''}${report.offsetMeters.toFixed(2)}m`;
      const guard = guardRuntime.report;
      return `seed ${report.seed} · 下一刀 ${String(report.upcoming).toUpperCase()} · ${report.reason} · 距離差 ${gap} · 已出 ${report.attacksServed} · 盾${guard.hold ? '→' + String(guard.sector).toUpperCase() : '↓'} 讀到 ${guard.swingsRead}/${guard.swingsSeen}`;
    },
  });
}
