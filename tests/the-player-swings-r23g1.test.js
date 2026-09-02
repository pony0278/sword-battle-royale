import test from 'node:test';
import assert from 'node:assert/strict';
import { createShieldParryLaneController } from '../src/game/lane-controller.js';
import { LONGSWORD_ATTACK_PHASES } from '../src/combat/longsword-directional-attack-runtime.js';
import { ATTACK_ADVANCE_PROFILES } from '../src/combat/attack-advance.js';
import { DIRECTIONAL_PARRY_KEYS } from '../src/combat/directional-parry-input.js';
import { GUARD_SECTORS } from '../src/combat/guard-sector.js';
import { MINIMUM_ENGAGEMENT_SEPARATION_METERS } from '../src/combat/lane-locomotion.js';

// R23G.1 - the player gets a swing, and the rules that fall out of the ledger rather than out of
// a design meeting.
//
// The blow itself is proven in the running lab, because that is the only place the whole chain
// exists: pressing K closes the measured 0.862m of a TOP advance and the swept probe returns
// { contact: true, reason: 'swept-blade-struck-body', band: 'chest', gapMeters: 0 } against the
// opponent's chest. What can be driven here is the pair of rules that decide when a swing is
// allowed at all, and the one that banks it when it ends - and those are the ones that were wrong
// first: the step stayed unspent forever, so the player closed the gap once and stood in it.

function harness(separationMeters = 2.4) {
  const labScene = {
    engagementStance: { separationMeters },
    setLanePositions: () => {},
    setDefenderYawOffset: () => {},
    defender: null,
    camera: null,
  };
  return createShieldParryLaneController({
    labScene,
    walkClips: { forward: 'Walking_A', backward: 'Walking_Backwards' },
    services: { captureRigPose: () => null, applyRigPose: () => {} },
  });
}
// One swing, driven the way the frame loop drives it: the runtime's elapsed clock, then the walk.
function swing(lane, { swinger, seconds, contactSeconds = 0.43, direction = 'top' }) {
  lane.startAttack(direction, contactSeconds, { swinger });
  const step = 1 / 60;
  for (let elapsed = step; elapsed <= seconds + 1e-9; elapsed += step) {
    lane.update(elapsed, true, LONGSWORD_ATTACK_PHASES.ACTIVE);
    lane.walk(step, null);
  }
}

test('R23G.1 the player\'s swing carries them the distance the clip was measured at', () => {
  const lane = harness();
  const before = lane.report.defenderPosition.z;
  swing(lane, { swinger: 'defender', seconds: 0.43 });
  const closed = before - lane.report.defenderPosition.z;
  // TOP's authored advance to contact, measured in attack-advance.js and reproduced in the lab.
  const authored = ATTACK_ADVANCE_PROFILES.top.contactMeters ?? 0.862;
  assert.ok(Math.abs(closed - authored) < 0.05,
    `a TOP swing should carry the player ~${authored}m toward the opponent, got ${closed.toFixed(3)}`);
  assert.ok(lane.report.defenderSwingMeters < 0, 'toward the opponent is -z from the defender\'s mark');
  assert.equal(lane.report.attackerSwingMeters, 0, 'and it is not the opponent who moved');
});

test('R23G.1 the step is banked when the swing ends, not left standing', () => {
  const lane = harness();
  swing(lane, { swinger: 'defender', seconds: 0.43 });
  const mid = lane.report;
  assert.notEqual(mid.defenderSwingMeters, 0, 'mid-swing the step is still being spent');
  const wherePlayerStands = mid.defenderPosition.z;

  // The frame the runtime goes idle, the entry ends the exchange. Before this existed, the ledger
  // kept the swing unspent forever: separation stuck at 1.538m with 0.862m of unbanked step.
  lane.endExchange();
  assert.equal(lane.report.defenderSwingMeters, 0, 'the swing is spent');
  assert.ok(Math.abs(lane.report.defenderPosition.z - wherePlayerStands) < 1e-9,
    'and banking it moves nobody - the ground simply owns what the swing did');
  assert.equal(lane.report.separationMeters, mid.separationMeters);
});

test('R23G.1 an over-committed player swing stops at the same floor an opponent\'s does', () => {
  const player = harness(1.2);
  swing(player, { swinger: 'defender', seconds: 1.5 });
  const opponent = harness(1.2);
  swing(opponent, { swinger: 'attacker', seconds: 1.5 });
  assert.ok(player.report.separationMeters >= MINIMUM_ENGAGEMENT_SEPARATION_METERS - 1e-9,
    `the player stops at the contact floor, got ${player.report.separationMeters}`);
  assert.ok(Math.abs(player.report.separationMeters - opponent.report.separationMeters) < 1e-9,
    'and at the same one, from either side');
});

test('R23G.1 one swing at a time is the ledger\'s rule, not a policy on top of it', () => {
  // The refusal in the entry is symmetric because this is: engagement-ground holds ONE advance
  // runtime and one swinging slot, so a second swing does not fight the first, it overwrites it.
  const lane = harness();
  lane.startAttack('top', 0.43, { swinger: 'defender' });
  lane.update(0.2, true, LONGSWORD_ATTACK_PHASES.ACTIVE);
  assert.equal(lane.swingingSlot, 'defender');
  lane.startAttack('top', 0.43, { swinger: 'attacker' });
  assert.equal(lane.swingingSlot, 'attacker',
    'a second start does not queue behind the first, it takes the slot - which is why both sides refuse');
});

test('R23G.1 the attack key takes its direction from the aim, so it needs none of its own', () => {
  // K is free, and it is the middle of the I-J-L inverted T the directional guard already uses:
  // one hand aims and defends, the same hand strikes.
  assert.equal(DIRECTIONAL_PARRY_KEYS.KeyK, undefined, 'K must not already mean a guard direction');
  assert.deepEqual(Object.keys(DIRECTIONAL_PARRY_KEYS).sort(), ['KeyI', 'KeyJ', 'KeyL']);
  // And every sector the aim can hold is a direction a swing can be thrown in, so the aim needs no
  // translation - which is the whole reason the attack borrows it.
  for (const sector of GUARD_SECTORS) {
    assert.ok(ATTACK_ADVANCE_PROFILES[sector], `the aim can point at ${sector}, so a swing must exist for it`);
  }
});
