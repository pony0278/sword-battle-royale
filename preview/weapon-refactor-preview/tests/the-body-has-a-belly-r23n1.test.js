import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BODY_HURTBOX_BANDS,
  buildBodyHurtbox,
  probeBodyHurtboxContact,
} from '../src/combat/body-hurtbox.js';
import { BODY_STRIKE_REACTION_BY_BAND, BODY_STRIKE_REACTION_CLIP_ID } from '../src/combat/body-strike-reaction.js';

// R23N.1 - the body has a belly.
//
// The bones below are the OPPONENT's, read live off the running lab at the 0.90m stance floor -
// not the person-shaped fixture R18U.1 tested against, whose hips sat at the waist. On this rig
// `hips` is the bottom of the pelvis, and between the waist disc and the chest disc there was
// nothing. The player's LEFT crossed at 0.477 and the ledger read 落空 短0.00 偏0.01.
const OPPONENT_BONES = Object.freeze({
  head: { x: -0.215, y: 0.928, z: 0 },
  chest: { x: -0.197, y: 0.663, z: 0 },
  spine: { x: -0.075, y: 0.316, z: 0 },
  hips: { x: -0.013, y: 0.139, z: 0 },
  'lowerleg.l': { x: 0.098, y: 0.182, z: 0 },
  'lowerleg.r': { x: -0.014, y: 0.059, z: 0 },
});
const readBonePosition = (id) => OPPONENT_BONES[id] ?? null;
const facing = { x: 0, y: 0, z: 1 };

// The measured crossing: at closest approach the blade's HILT end (bladeFraction 0) was at the
// height and lateral offset below and the blade ran away from the body from there - a low sweep
// passing the fighter with the hand almost touching them. So the blade here starts at (x, y) and
// extends 0.7m toward +x, and sweeps front to back.
function sweepAt(y, x = 0) {
  const blade = (z) => [{ x, y, z }, { x: x + 0.35, y, z }, { x: x + 0.7, y, z }];
  return { previousBlade: blade(0.6), currentBlade: blade(-0.6) };
}
const CROSSING = { y: 0.477, x: -0.045 };

test('R23N.1 the crack: without the belly band the measured LEFT crossing touches nothing', () => {
  const without = buildBodyHurtbox({ readBonePosition, facing, bands: BODY_HURTBOX_BANDS.filter((b) => b.id !== 'belly') });
  const probe = probeBodyHurtboxContact({ ...sweepAt(CROSSING.y, CROSSING.x), hurtbox: without, deltaSeconds: 1 / 60 });
  assert.equal(probe.contact, false, 'this is the bug as measured');
  // And it is a crack, not a miss: the blade is on the body plane, centimetres from two discs.
  assert.ok(probe.closestApproach.planeGapMeters < 1e-6);
  assert.ok(probe.closestApproach.radialGapMeters < 0.05, `radial gap ${probe.closestApproach.radialGapMeters}`);
});

test('R23N.1 the belly band closes it, on the spine bone, and the same crossing lands', () => {
  const belly = BODY_HURTBOX_BANDS.find((b) => b.id === 'belly');
  assert.ok(belly, 'there is a belly band');
  assert.equal(belly.bone, 'spine');
  const hurtbox = buildBodyHurtbox({ readBonePosition, facing });
  const probe = probeBodyHurtboxContact({ ...sweepAt(CROSSING.y, CROSSING.x), hurtbox, deltaSeconds: 1 / 60 });
  assert.equal(probe.contact, true);
  assert.equal(probe.band, 'belly');
});

test('R23N.1 no vertical gap is left anywhere between the ground and the head, on either rig', () => {
  // Coverage, not one crossing: every centimetre of height from the knees to the top of the head
  // is inside at least one disc, on the opponent's low idle and on the player's taller stance.
  const PLAYER_BONES = Object.freeze({
    head: { x: 0, y: 1.125, z: 0 }, chest: { x: 0, y: 0.863, z: 0 }, spine: { x: 0, y: 0.498, z: 0 },
    hips: { x: 0, y: 0.311, z: 0 }, 'lowerleg.l': { x: 0, y: 0.230, z: 0 }, 'lowerleg.r': { x: 0, y: 0.291, z: 0 },
  });
  for (const [name, bones] of [['opponent', OPPONENT_BONES], ['player', PLAYER_BONES]]) {
    const hurtbox = buildBodyHurtbox({ readBonePosition: (id) => bones[id] ?? null, facing });
    const top = hurtbox.discs.find((d) => d.id === 'head').center.y;
    const bottom = Math.min(...hurtbox.discs.map((d) => d.center.y - d.radius));
    for (let y = bottom + 0.005; y < top; y += 0.01) {
      // Straight down the centreline: the lateral offset that covers most, so an uncovered height
      // here is uncovered everywhere.
      const covered = hurtbox.discs.some((d) => Math.abs(y - d.center.y) <= d.radius);
      assert.ok(covered, `${name}: no disc at height ${y.toFixed(3)}`);
    }
  }
});

test('R23N.1 a belly hit flinches like every other band', () => {
  assert.equal(BODY_STRIKE_REACTION_BY_BAND.belly, BODY_STRIKE_REACTION_CLIP_ID);
});
