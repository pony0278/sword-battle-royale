import { buildParryWhiffDiagnostic } from '../../../src/combat/parry-whiff-diagnostic.js';
import { formatWhiffDiagnostic } from './diagnostic-formatters.js';

// R20S.1 — an armed parry whose attack ended without ever reaching contact. The diagnosis is built
// once, from what the exchange recorded on its way past, and written to the status line.
//
// Extracted from the entry unchanged: this is a report about a frame, not a decision made in one,
// and the entry's line budget belongs to composition and ordering. Nothing here can influence an
// outcome - it runs only after the attack is over, and writes to exchangeState.latestParryWhiff,
// which is read by the report and by nothing that resolves contact.
export function createParryWhiffReporter({ parryGate, exchangeState, status, debugMode = false }) {
  if (!parryGate || !exchangeState || !status) throw new Error('R20S.1 whiff reporter needs the gate, the exchange and the status line');
  return Object.freeze({
    // Called every frame while an exchange is live; a no-op until all four conditions hold.
    report(snapshot, direction) {
      if (!parryGate.armed || snapshot.action || exchangeState.firstContact || exchangeState.latestParryWhiff) return null;
      exchangeState.latestParryWhiff = buildParryWhiffDiagnostic({
        sequence: parryGate.attempt?.sequence ?? null,
        direction,
        probeFrames: exchangeState.whiffProbeFrames,
        closestApproachRecord: exchangeState.closestWhiffApproach,
        outsideActiveContact: exchangeState.outsideActiveContact,
        predictiveAnalysis: exchangeState.latestPredictiveAnalysis,
        finePlan: exchangeState.latestFinePlan,
        fineTracking: exchangeState.latestFineTracking,
        shieldLeadMotion: exchangeState.latestShieldLeadMotion,
        parryInput: exchangeState.latestParryInput,
      });
      const whiff = formatWhiffDiagnostic(exchangeState.latestParryWhiff, { debugMode });
      status.textContent = `PARRY WHIFF · ${whiff.label} · ${whiff.detail}`;
      status.className = 'bad';
      return exchangeState.latestParryWhiff;
    },
  });
}
