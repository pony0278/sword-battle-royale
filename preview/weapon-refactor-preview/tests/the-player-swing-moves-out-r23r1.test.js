import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { codeOnly } from './support/source-text.js';
import { createPlayerAttackController } from '../tools/action-studio/shield-parry-r281/player-attack-controller.js';

// R23R.1 - the player's swing moves out of the entry, whole and unchanged, to make room for step 6.


function harness({ ready = true, opponentMidExchange = false, accepted = true } = {}) {
  const calls = [];
  const engagement = {
    combat: { active: false, reset: () => calls.push('combat.reset'), startAttack: (d) => { calls.push(`combat.startAttack:${d}`); return { accepted, reason: accepted ? null : 'busy' }; } },
    attackRuntime: { active: false, snapshot: { action: { runtime: { contactSeconds: 0.43 } } } },
    hasRecovery: false,
    resetExchange: () => calls.push('resetExchange'),
    captureBlade: () => 'blade', rememberBlade: (b) => calls.push(`remember:${b}`), previousBlade: 'prev',
    contactHandoff: { resolveContact: (snapshot, blade, dt, ctx) => { calls.push(`resolve:${ctx.selectedDirection}:${ctx.selectedMode}`); return 'resolved'; } },
    exchangeState: { latestCombatResult: { resolution: { outcome: 'block' } } },
  };
  const ledger = [];
  const controller = createPlayerAttackController({
    laneController: { separationMeters: 2.4, startAttack: (d, c, o) => calls.push(`lane.startAttack:${d}:${c}:${o.swinger}`), settle: (o) => { calls.push(`lane.settle:${o}`); return o ? { settled: o } : null; } },
    guardSector: { sector: 'left' },
    swingLedger: { recordRefusal: (r) => ledger.push(['refusal', r]), recordSwing: (r) => ledger.push(['swing', r]) },
    duel: { spendExchangeOn: (o, c) => calls.push(`duel.spend:${o}:${c.name}`) },
    status: {},
    playerFighter: { bodyStrikeReaction: { active: false }, condition: { name: 'player', report: { canAct: true } } },
    readPlayerEngagement: () => engagement, readWeaponMount: () => ({ report: { applied: 'kaykit-default' } }),
    readReady: () => ready, readSelectedMode: () => 'parry', readOpponentMidExchange: () => opponentMidExchange, readLocked: () => true,
  });
  return { controller, calls, ledger, engagement };
}

test('R23R.1 a refused swing is refused by name, goes to the ledger, and touches nothing else', () => {
  const { controller, calls, ledger } = harness({ opponentMidExchange: true });
  assert.equal(controller.start(), false);
  assert.equal(controller.refusal, 'the-opponent-is-mid-exchange');
  assert.deepEqual(ledger, [['refusal', { direction: 'left', reason: 'the-opponent-is-mid-exchange', separationMeters: 2.4 }]]);
  assert.deepEqual(calls, []);
  assert.equal(controller.direction, 'top', 'a refusal does not change the direction of record');
});

test('R23R.1 an accepted swing clears the last exchange, starts the runtime, tells the lane the defender swings, and is on the ledger', () => {
  const { controller, calls, ledger } = harness();
  assert.equal(controller.start(), true);
  assert.equal(controller.direction, 'left');
  assert.deepEqual(calls, ['combat.reset', 'resetExchange', 'remember:blade', 'combat.startAttack:left', 'lane.startAttack:left:0.43:defender']);
  assert.equal(ledger[0][0], 'swing');
  assert.deepEqual(ledger[0][1], { direction: 'left', separationMeters: 2.4, mount: 'kaykit-default', mode: 'parry', locked: true });
});

test('R23R.1 a runtime refusal after the gate is named too', () => {
  const { controller, ledger } = harness({ accepted: false });
  assert.equal(controller.start(), false);
  assert.equal(controller.refusal, 'combat-refused-busy');
  assert.equal(ledger.at(-1)[1].reason, 'combat-refused-busy');
});

test('R23R.1 resolving the player\'s contact settles the lane and spends the exchange on the player', () => {
  const { controller, calls, engagement } = harness();
  controller.start(); calls.length = 0;
  assert.equal(controller.resolveContact({}, 'blade', 1 / 60), 'resolved');
  assert.deepEqual(calls, ['resolve:left:block', 'lane.settle:block', 'duel.spend:block:player']);
  assert.deepEqual(engagement.exchangeState.latestEngagementGround, { settled: 'block' });
});

test('R23R.1 the entry builds the controller and no longer carries the swing itself', () => {
  const entry = readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
  assert.match(entry, /const playerAttack = createPlayerAttackController\(\{/);
  assert.doesNotMatch(codeOnly(entry), /function startPlayerAttack|function resolvePlayerContact|let playerAttackRefusal/);
});
