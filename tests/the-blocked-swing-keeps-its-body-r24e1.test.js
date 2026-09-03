// R24E.1 — a blocked swing keeps its body (#26).
//
// Measured on a RIGHT swing blocked by a held shield, both ways round, bones read in world space
// frame to frame at 60Hz. Four snaps, of which this stage takes the three that are pose writers
// (the fourth, a 7-9cm whole-body step on the contact frame, is the ground transfer landing in one
// frame and is its own change):
//
//   - the player's own swing: the contact pose showed for one frame, then the held block painted
//     over it (sword hand 1.33m in a frame), held it dead still for 16 frames, and the recovery
//     snapped back to the contact pose it had captured underneath (1.18m). The guard writers ran
//     on the frames the player's contact stack owned the body; the opponent's have yielded to
//     theirs since R23V.1.
//   - both: on the frame the recoil completed, the torso lean's weight fell back to 1.0 because the
//     recoil's plan was gone and so was its sample - the lean went from +15.5 to -7.0 degrees in
//     one frame (15cm at the chest, 41cm at the sword hand), and the recovery captured that as the
//     pose to stand up from.
//   - both: the recovery blended toward Sword_Idle and, on the first frame the guard painted
//     again, jumped the whole guard in one frame (24cm chest, 45/56cm hands). It now blends toward
//     the pose the body actually resumes in - the held guard, when the guard machine is in HOLD.
//
// After: the completion frame moves 18mm at the sword hand, the guard handback 5mm, and the
// player's contact hold shows the recoil instead of the shield.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAttackerPresentationAdapter } from '../src/game/attacker-presentation.js';
import { createContactLifecycleDirector } from '../src/combat/contact-lifecycle-director.js';

const src = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

function adapterHarness(extraServices = {}) {
  const calls = [];
  const attacker = {
    rig: { root: { updateMatrixWorld() {} }, bones: {} },
    sampleAnimation(...args) { calls.push(['sampleAnimation', ...args]); },
    update() {},
  };
  let poseIndex = 0;
  const services = {
    captureRigPose() { const pose = { id: `pose-${poseIndex}` }; poseIndex += 1; calls.push(['captureRigPose', pose]); return pose; },
    applyRigPose(_rig, pose) { calls.push(['applyRigPose', pose]); },
    blendRecoveryPose: () => ({}),
    sampleLongswordAttackRecovery: () => ({ progress: 0, complete: false, profile: { attackRecoveryDurationMs: 180 } }),
    sampleLiveParryOldB3ReleaseBlend: () => ({ progress: 0 }),
    ...extraServices,
  };
  const adapter = createAttackerPresentationAdapter({
    THREE: { Vector3: class { constructor() { this.x = 0; this.y = 0; this.z = 0; } } },
    attacker, camera: {}, exchangeState: {}, services,
  });
  return { adapter, calls };
}

test('R24E.1 the recovery blends toward the pose the body resumes in, when there is one', () => {
  const guard = { id: 'held-guard' };
  const { adapter, calls } = adapterHarness({ captureResumePose: () => { calls.push(['captureResumePose']); return guard; } });
  const recovery = adapter.createRecovery('right');
  assert.equal(recovery.targetPose, guard);
  assert.equal(recovery.resumes, 'guard');
  assert.deepEqual(recovery.sourcePose, { id: 'pose-0' }, 'the source is the rig as it stood');
  assert.equal(calls.some((c) => c[0] === 'sampleAnimation'), false, 'the idle is not sampled at all');
  assert.deepEqual(calls.at(-1), ['applyRigPose', { id: 'pose-0' }], 'and the rig is left as it stood');
});

test('R24E.1 without a resume pose the recovery settles into the idle exactly as before', () => {
  for (const services of [{}, { captureResumePose: () => null }]) {
    const { adapter, calls } = adapterHarness(services);
    const recovery = adapter.createRecovery('top');
    assert.equal(recovery.resumes, 'idle');
    assert.deepEqual(calls.find((c) => c[0] === 'sampleAnimation')?.slice(0, 3), ['sampleAnimation', 'UAL1/Sword_Idle', 0]);
    assert.deepEqual(recovery.targetPose, { id: 'pose-1' }, 'the idle, captured after it was sampled');
  }
});

function directorHarness({ recoilUpdate, sampleWeight }) {
  const weights = [];
  const director = createContactLifecycleDirector({
    attackerRig: { bones: {} },
    reactionDirector: {
      advanceAttacker: (_deltaMs, { torsoWeight }) => { weights.push(torsoWeight); return { repaintRequired: false }; },
      reset: () => {},
    },
    gripConstraint: { get active() { return false; } },
    updateCombat: () => ({ recoilUpdate, justCompleted: recoilUpdate?.justCompleted === true }),
    readCombatSnapshot: () => ({ attackerRecoil: { sample: sampleWeight == null ? null : { weights: { torsoWeight: sampleWeight } } } }),
  });
  director.advanceCombat({ deltaSeconds: 1 / 60, deltaMs: 1000 / 60 });
  return weights[0];
}

test('R24E.1 a recoil that has finished weighs nothing on the torso lean', () => {
  assert.equal(directorHarness({ recoilUpdate: { justCompleted: true }, sampleWeight: null }), 0, 'the frame it completes');
  assert.equal(directorHarness({ recoilUpdate: { reactionAlreadyComplete: true }, sampleWeight: null }), 0, 'and every frame after');
});

test('R24E.1 while the recoil runs, its own weight is what the lean reads - and no sample still means full', () => {
  assert.equal(directorHarness({ recoilUpdate: { justCompleted: false, sample: {} }, sampleWeight: 0.35 }), 0.35);
  assert.equal(directorHarness({ recoilUpdate: { justCompleted: false }, sampleWeight: null }), 1, 'the contact-sync delay, before any sample exists');
});

test("R24E.1 the player's guard writers yield to the player's own contact stack", () => {
  const entry = src('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js');
  // Walk, guard, neutral stance and the leg overlay all sit inside the gate; the dodge does not -
  // a dodge outranks the guard, and a landed blade outranks the dodge, exactly as R20F.1 wrote it.
  assert.match(entry, /if \(!playerFrame\?\.handledCombat\) \{\n\s*laneController\.sampleDefenderWalk\([\s\S]*?guardRuntime\.update\(deltaMs, camera\);\n\s*neutralStance\.sample\(deltaMs\);[^\n]*\n\s*laneController\.overlayDefenderWalkLegs\(\);\n\s*\}\n\s*laneController\.overlayDefenderDodge\(\);/);
  // Both swingers hand their recovery the pose they resume in: the held guard, read off the guard
  // machine in HOLD through the same sync the impact path uses.
  assert.equal((entry.match(/captureResumePose: \(\) => resumePoseOf\(/g) || []).length, 2);
});
