import { planSwingPermission } from '../../../src/combat/swing-permission.js';

export const PLAYER_ATTACK_CONTROLLER_STAGE = 'R23R.1';

// R23R.1 — the player's own swing, as one object instead of two functions and three variables in
// the entry.
//
// Moved out for room, not for shape: the entry sat at 713 of its 720 code lines and step 6 (the
// opponent guards) needs ten of them. This cluster had no test reaching into the entry for it by
// name, which made it the cheapest thing to move; R23G.1 wrote it, R23J.1 gave it the permission
// gate and the duel, R23L.1 the ledger, R23Q.1 the being-struck refusal. Nothing here changed in
// the move - the three browser gates are the proof, and the R23J.1 and R23L.1 tests that read the
// entry's text now read this file's.
//
// Late-built collaborators come in as readers: the engagement and the mount are built in main()
// after the load, `ready` and the mode are the entry's own state, and a captured null would never
// update - the R23E.1 lesson, kept.
export function createPlayerAttackController({
  laneController, guardSector, swingLedger, duel, status, playerFighter,
  readPlayerEngagement, readWeaponMount, readReady, readSelectedMode, readOpponentMidExchange, readLocked,
}) {
  let direction = 'top';
  let refusal = null; // R23J.1: a refusal a player cannot see is a bug they cannot report

  function start() {
    const playerEngagement = readPlayerEngagement();
    const permission = planSwingPermission({ ready: readReady() && Boolean(playerEngagement),
      opponentMidExchange: readOpponentMidExchange(), ownExchangeUncleared: playerEngagement?.combat.active,
      alreadySwinging: playerEngagement?.attackRuntime.active, stillRecovering: playerEngagement?.hasRecovery,
      beingStruck: playerFighter.bodyStrikeReaction.active, canAct: playerFighter.condition.report.canAct }); // R23Q.1: beingStruck
    const aimed = guardSector.sector;
    if (!permission.allowed) {
      refusal = permission.reason;
      swingLedger.recordRefusal({ direction: aimed || 'top', reason: permission.reason, separationMeters: laneController.separationMeters });
      return false;
    }
    direction = aimed || 'top';
    // R23J.1: the two-actor integration refuses a second attack until its last one is cleared - the
    // opponent's restartAttack has always done this and the player's path never did, so the second
    // swing of a session was silently refused with every guard above it reading clear.
    playerEngagement.combat.reset();
    playerEngagement.resetExchange();
    playerEngagement.rememberBlade(playerEngagement.captureBlade());
    const started = playerEngagement.combat.startAttack(direction);
    if (!started.accepted) {
      refusal = `combat-refused-${started.reason || 'unknown'}`;
      swingLedger.recordRefusal({ direction, reason: refusal, separationMeters: laneController.separationMeters });
      return false;
    }
    swingLedger.recordSwing({ direction, separationMeters: laneController.separationMeters, mount: readWeaponMount()?.report.applied, mode: readSelectedMode(), locked: readLocked() });
    laneController.startAttack(direction, playerEngagement.attackRuntime.snapshot?.action?.runtime?.contactSeconds, { swinger: 'defender' });
    status.textContent = `YOU SWING ${direction.toUpperCase()}${aimed ? '' : ' · nothing aimed yet, so TOP'}`;
    status.className = 'warn';
    return true;
  }

  function resolveContact(snapshot, currentBlade, deltaSeconds) {
    const playerEngagement = readPlayerEngagement();
    const resolved = playerEngagement.contactHandoff.resolveContact(snapshot, currentBlade, deltaSeconds, {
      previousBlade: playerEngagement.previousBlade, selectedMode: 'block', selectedDirection: direction,
    });
    const settled = laneController.settle(playerEngagement.exchangeState.latestCombatResult?.resolution?.outcome);
    if (settled) playerEngagement.exchangeState.latestEngagementGround = settled;
    duel.spendExchangeOn(playerEngagement.exchangeState.latestCombatResult?.resolution?.outcome, playerFighter.condition, { tier: playerEngagement.exchangeState.latestParryConfirmation?.tier }); // R24G.1: the opponent aims their own parry, so it is perfect when it lands
    return resolved;
  }

  return Object.freeze({
    stage: PLAYER_ATTACK_CONTROLLER_STAGE,
    start,
    resolveContact,
    get direction() { return direction; },
    get refusal() { return refusal; },
  });
}
