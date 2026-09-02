export const OPPONENT_PARRY_STAGE = 'R23X.1';

// R23X.1 — the opponent's parry, mirrored from the player's block-mode raise (R20H.1): arm their
// gate against the player's swing, then everything an accepted arm sets in motion - the whiff-probe
// resets, the intercept drive, the predictive presentation. The player's version of this is
// driveAcceptedParry in the entry; this is the same sequence on the other engagement.
//
// The sector is not chosen here. The read (opponent-guard.js) moved the shield into the sector
// before the arm, and a parry from the wrong sector is refused by the gate the same way a person's
// is - the gate reads aimedSector against the swing's defended sector (R21C.1).
//
// Measured with an armer that fires on an exact sim frame: armed at 0.12s before contact, TOP,
// RIGHT and LEFT all resolved `parry`; across the gate's window the other cells were whiffs, never
// hits on the opponent.
export function createOpponentParry({ readPlayerEngagement, opponentFighter }) {
  if (typeof readPlayerEngagement !== 'function' || !opponentFighter?.parryGate) {
    throw new Error(`${OPPONENT_PARRY_STAGE} needs the player's engagement reader and the opponent fighter`);
  }
  let attempts = 0;
  let accepted = 0;
  function arm(source = 'opponent-ai') {
    const playerEngagement = readPlayerEngagement();
    if (!playerEngagement) return null;
    const snapshot = playerEngagement.attackRuntime.snapshot;
    const ex = playerEngagement.exchangeState;
    attempts += 1;
    ex.latestParryInput = opponentFighter.parryGate.arm({ attackSnapshot: snapshot, manual: true, source, aimedSector: opponentFighter.guardSector.sector });
    if (ex.latestParryInput.accepted) {
      accepted += 1;
      ex.whiffProbeFrames = 0; ex.closestWhiffApproach = null; ex.outsideActiveContact = null;
      ex.latestReachableInterceptTarget = null; ex.latestInterceptDriveReport = null; ex.interceptDriveTrace = [];
      playerEngagement.preContact.armActiveIntercept(snapshot);
      opponentFighter.predictivePresentation.start({ sequence: snapshot.sequence, requestedGrade: 'parry', triggerTtcSeconds: ex.latestParryInput.timeToContactSeconds });
    }
    return ex.latestParryInput;
  }
  return Object.freeze({
    stage: OPPONENT_PARRY_STAGE,
    arm,
    get report() { return Object.freeze({ stage: OPPONENT_PARRY_STAGE, attempts, accepted }); },
  });
}
