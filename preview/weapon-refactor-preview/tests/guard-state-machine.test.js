import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GUARD_EVENT_AUTHORITY,
  GUARD_EVENTS,
  GUARD_STATES,
  LONGSWORD_GUARD_PRESENTATION,
  createGuardStateMachine,
  getGuardPresentation,
} from '../src/combat/guard-state-machine.js';
import { LONGSWORD_GUARD_BASE } from '../src/combat/longsword-guard-metadata.js';
import { GUARD_TRANSITION_PROFILE_IDS } from '../src/combat/guard-transition-presentation.js';
import {
  GUARD_REACTION_PROFILE_IDS,
  GUARD_REACTION_VARIANTS,
} from '../src/combat/guard-reaction-presentation.js';
import {
  GUARD_COUNTER_PROFILE_IDS,
  GUARD_WEAPON_MOUNT_PROFILE_IDS,
} from '../src/combat/guard-counter-presentation.js';
import { PRODUCTION_PARRY_DEFLECT_CLIP_IDS } from '../src/animation/parry-contact-deflect-runtime-clip.js';

test('G3.1 enters and exits the canonical Skyrim guard hold', () => {
  const machine = createGuardStateMachine();
  assert.equal(machine.state, GUARD_STATES.NEUTRAL);

  assert.equal(machine.send(GUARD_EVENTS.GUARD_PRESS).snapshot.state, GUARD_STATES.ENTER);
  assert.equal(machine.send(GUARD_EVENTS.ENTER_COMPLETE).snapshot.state, GUARD_STATES.HOLD);

  const hold = getGuardPresentation(GUARD_STATES.HOLD);
  assert.equal(hold.clipId, LONGSWORD_GUARD_BASE.clipId);
  assert.equal(hold.correctionLayerId, LONGSWORD_GUARD_BASE.correctionLayerId);
  assert.equal(hold.authored, true);
  assert.equal(hold.loop, true);
  assert.equal(hold.inPlace, true);
  assert.equal(hold.weaponMountProfileId, GUARD_WEAPON_MOUNT_PROFILE_IDS.SKYRIM_GUARD);

  assert.equal(machine.send(GUARD_EVENTS.GUARD_RELEASE).snapshot.state, GUARD_STATES.EXIT);
  assert.equal(machine.send(GUARD_EVENTS.EXIT_COMPLETE).snapshot.state, GUARD_STATES.NEUTRAL);
});

test('G3.1 block reaction latches guard release until recovery completes', () => {
  const machine = createGuardStateMachine();
  machine.send(GUARD_EVENTS.GUARD_PRESS);
  machine.send(GUARD_EVENTS.ENTER_COMPLETE);

  const blocked = machine.send(GUARD_EVENTS.BLOCK_CONFIRMED, { attackId: 'attack-42' });
  assert.equal(blocked.accepted, true);
  assert.equal(blocked.snapshot.state, GUARD_STATES.BLOCK_HIT);
  assert.equal(blocked.snapshot.lastOutcome, 'block');
  assert.equal(blocked.snapshot.lastTransition.authority, 'authoritative-combat');

  const released = machine.send(GUARD_EVENTS.GUARD_RELEASE);
  assert.equal(released.accepted, true);
  assert.equal(released.transitioned, false);
  assert.equal(released.snapshot.guardHeld, false);
  assert.equal(released.snapshot.state, GUARD_STATES.BLOCK_HIT);

  assert.equal(machine.send(GUARD_EVENTS.REACTION_COMPLETE).snapshot.state, GUARD_STATES.RECOVER);
  assert.equal(machine.send(GUARD_EVENTS.RECOVER_COMPLETE).snapshot.state, GUARD_STATES.EXIT);
  assert.equal(machine.send(GUARD_EVENTS.EXIT_COMPLETE).snapshot.state, GUARD_STATES.NEUTRAL);
});

test('G3.1 authoritative parry may chain into authoritative counter then return to hold', () => {
  const machine = createGuardStateMachine();
  machine.send(GUARD_EVENTS.GUARD_PRESS);
  machine.send(GUARD_EVENTS.ENTER_COMPLETE);

  assert.equal(machine.send(GUARD_EVENTS.PARRY_CONFIRMED).snapshot.state, GUARD_STATES.PARRY);
  const counter = machine.send(GUARD_EVENTS.COUNTER_CONFIRMED, { authorityTick: 77 });
  assert.equal(counter.snapshot.state, GUARD_STATES.COUNTER);
  assert.equal(counter.snapshot.presentation.clipId, 'Melee_Block_Attack');
  assert.equal(counter.snapshot.presentation.counterProfileId, GUARD_COUNTER_PROFILE_IDS.LONGSWORD);
  assert.equal(counter.snapshot.presentation.authoredStage, 'G3.4');
  assert.equal(counter.snapshot.lastTransition.authority, 'authoritative-combat');
  assert.equal(machine.send(GUARD_EVENTS.COUNTER_COMPLETE).snapshot.state, GUARD_STATES.RECOVER);
  assert.equal(machine.send(GUARD_EVENTS.RECOVER_COMPLETE).snapshot.state, GUARD_STATES.HOLD);
  assert.equal(machine.snapshot.lastOutcome, 'counter');
});

test('G3.1 accepts a delayed authoritative counter after local reaction already entered recover', () => {
  const machine = createGuardStateMachine();
  machine.send(GUARD_EVENTS.GUARD_PRESS);
  machine.send(GUARD_EVENTS.ENTER_COMPLETE);
  machine.send(GUARD_EVENTS.BLOCK_CONFIRMED);
  machine.send(GUARD_EVENTS.REACTION_COMPLETE);

  assert.equal(machine.state, GUARD_STATES.RECOVER);
  assert.equal(machine.snapshot.lastOutcome, 'block');
  assert.equal(machine.can(GUARD_EVENTS.COUNTER_CONFIRMED), true);

  const counter = machine.send(GUARD_EVENTS.COUNTER_CONFIRMED, { authorityTick: 912 });
  assert.equal(counter.accepted, true);
  assert.equal(counter.snapshot.state, GUARD_STATES.COUNTER);
  assert.equal(counter.snapshot.lastOutcome, 'counter');
  assert.equal(counter.snapshot.lastTransition.payload.authorityTick, 912);
  assert.equal(counter.snapshot.presentation.clipId, 'Melee_Block_Attack');
});

test('G3.1 rejects combat outcomes outside valid guard reaction states', () => {
  const machine = createGuardStateMachine();
  const block = machine.send(GUARD_EVENTS.BLOCK_CONFIRMED);
  const parry = machine.send(GUARD_EVENTS.PARRY_CONFIRMED);
  const counter = machine.send(GUARD_EVENTS.COUNTER_CONFIRMED);

  assert.equal(block.accepted, false);
  assert.equal(parry.accepted, false);
  assert.equal(counter.accepted, false);
  assert.equal(machine.state, GUARD_STATES.NEUTRAL);
  assert.equal(machine.snapshot.lastOutcome, null);
});

test('G3.1 re-press during exit re-enters guard without transient neutral', () => {
  const machine = createGuardStateMachine();
  machine.send(GUARD_EVENTS.GUARD_PRESS);
  machine.send(GUARD_EVENTS.ENTER_COMPLETE);
  machine.send(GUARD_EVENTS.GUARD_RELEASE);
  assert.equal(machine.state, GUARD_STATES.EXIT);

  assert.equal(machine.send(GUARD_EVENTS.GUARD_PRESS).snapshot.state, GUARD_STATES.ENTER);
  assert.equal(machine.guardHeld, true);
});

test('G3.5.1P-T3 preserves Guard authority while promoting production Parry presentation', () => {
  assert.equal(GUARD_EVENT_AUTHORITY[GUARD_EVENTS.GUARD_PRESS], 'local-intent');
  assert.equal(GUARD_EVENT_AUTHORITY[GUARD_EVENTS.BLOCK_CONFIRMED], 'authoritative-combat');
  assert.equal(GUARD_EVENT_AUTHORITY[GUARD_EVENTS.PARRY_CONFIRMED], 'authoritative-combat');
  assert.equal(GUARD_EVENT_AUTHORITY[GUARD_EVENTS.COUNTER_CONFIRMED], 'authoritative-combat');
  assert.equal(GUARD_EVENT_AUTHORITY[GUARD_EVENTS.COUNTER_COMPLETE], 'presentation');

  const enter = LONGSWORD_GUARD_PRESENTATION[GUARD_STATES.ENTER];
  const recover = LONGSWORD_GUARD_PRESENTATION[GUARD_STATES.RECOVER];
  const exit = LONGSWORD_GUARD_PRESENTATION[GUARD_STATES.EXIT];
  for (const presentation of [enter, recover, exit]) {
    assert.equal(presentation.authored, true);
    assert.equal(presentation.authoredStage, 'G3.2');
    assert.equal(presentation.clipId, LONGSWORD_GUARD_BASE.clipId);
    assert.equal(presentation.correctionLayerId, LONGSWORD_GUARD_BASE.correctionLayerId);
    assert.equal(presentation.inPlace, true);
    assert.equal(presentation.loop, true);
    assert.equal(presentation.weaponMountProfileId, GUARD_WEAPON_MOUNT_PROFILE_IDS.SKYRIM_GUARD);
  }
  assert.equal(enter.transitionProfileId, GUARD_TRANSITION_PROFILE_IDS.ENTER);
  assert.equal(recover.transitionProfileId, GUARD_TRANSITION_PROFILE_IDS.RECOVER);
  assert.equal(exit.transitionProfileId, GUARD_TRANSITION_PROFILE_IDS.EXIT);

  const block = LONGSWORD_GUARD_PRESENTATION[GUARD_STATES.BLOCK_HIT];
  assert.equal(block.authored, true);
  assert.equal(block.authoredStage, 'G3.3.2');
  assert.equal(block.clipId, 'SKYRIM_GUARD/shd_blockhit');
  assert.equal(block.reactionProfileId, GUARD_REACTION_PROFILE_IDS.BLOCK_HIT);
  assert.equal(block.reactionVariant, GUARD_REACTION_VARIANTS.BLOCK_HIT);
  assert.equal(block.loop, false);
  assert.equal(block.weaponMountProfileId, GUARD_WEAPON_MOUNT_PROFILE_IDS.SKYRIM_GUARD);

  const parry = LONGSWORD_GUARD_PRESENTATION[GUARD_STATES.PARRY];
  assert.equal(parry.authored, true);
  assert.equal(parry.authoredStage, 'G3.3.2');
  assert.equal(parry.clipId, PRODUCTION_PARRY_DEFLECT_CLIP_IDS.PARRY);
  assert.equal(parry.reactionProfileId, GUARD_REACTION_PROFILE_IDS.PARRY);
  assert.equal(parry.reactionVariant, GUARD_REACTION_VARIANTS.PARRY);

  const perfect = getGuardPresentation(GUARD_STATES.PARRY, { perfect: true });
  assert.equal(perfect.clipId, PRODUCTION_PARRY_DEFLECT_CLIP_IDS.PERFECT_PARRY);
  assert.equal(perfect.reactionProfileId, GUARD_REACTION_PROFILE_IDS.PERFECT_PARRY);
  assert.equal(perfect.reactionVariant, GUARD_REACTION_VARIANTS.PERFECT_PARRY);

  const counter = LONGSWORD_GUARD_PRESENTATION[GUARD_STATES.COUNTER];
  assert.equal(counter.authored, true);
  assert.equal(counter.authoredStage, 'G3.4');
  assert.equal(counter.clipId, 'Melee_Block_Attack');
  assert.equal(counter.counterProfileId, GUARD_COUNTER_PROFILE_IDS.LONGSWORD);
  assert.equal(counter.weaponMountProfileId, GUARD_WEAPON_MOUNT_PROFILE_IDS.KAYKIT_DEFAULT);
  assert.equal(counter.correctionWeight, 0);
  assert.equal(counter.loop, false);
  assert.equal(counter.inPlace, true);
});

test('G3.5.1P-T3 preserves the authoritative Perfect Parry payload with the shared-deflect virtual clip', () => {
  const machine = createGuardStateMachine();
  machine.send(GUARD_EVENTS.GUARD_PRESS);
  machine.send(GUARD_EVENTS.ENTER_COMPLETE);
  const result = machine.send(GUARD_EVENTS.PARRY_CONFIRMED, {
    perfect: true,
    authorityTick: 451,
  });

  assert.equal(result.snapshot.state, GUARD_STATES.PARRY);
  assert.equal(result.snapshot.lastOutcome, 'parry');
  assert.equal(result.snapshot.lastTransition.authority, 'authoritative-combat');
  assert.equal(result.snapshot.lastTransition.payload.authorityTick, 451);
  assert.equal(result.snapshot.presentation.clipId, PRODUCTION_PARRY_DEFLECT_CLIP_IDS.PERFECT_PARRY);
  assert.equal(result.snapshot.presentation.reactionVariant, 'perfect-parry');
});

test('G3.1 tracks deterministic state age and transition sequence', () => {
  const machine = createGuardStateMachine();
  machine.update(16.67);
  machine.update(16.67);
  assert.ok(machine.snapshot.elapsedMs > 33);
  assert.equal(machine.snapshot.sequence, 0);
  machine.send(GUARD_EVENTS.GUARD_PRESS);
  assert.equal(machine.snapshot.elapsedMs, 0);
  assert.equal(machine.snapshot.sequence, 1);
  machine.send(GUARD_EVENTS.ENTER_COMPLETE);
  assert.equal(machine.snapshot.sequence, 2);
});
