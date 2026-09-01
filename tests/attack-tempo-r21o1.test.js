import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  ATTACK_TEMPO_EVIDENCE,
  ATTACK_TEMPO_SCALE_RANGE,
  ATTACK_TEMPO_STAGE,
  DEFAULT_ATTACK_TEMPO_SCALE,
  EXPERIMENT_ATTACK_TEMPO_SCALE,
  MEASURED_REACTION_SPREAD_MS,
  READABLE_TEMPO_SCALE_BOUNDS,
  TEMPO_SCALE_COVERING_THE_SPREAD,
  clampAttackTempoScale,
  tempoScalePutsAnswerInsideWindow,
} from '../src/combat/attack-tempo.js';
import { ATTACK_TIME_WARPS, warpRuntimeToSource, warpSourceToRuntime } from '../src/combat/attack-time-warp.js';
import { getLongswordDirectionalAttackProfile } from '../src/combat/longsword-directional-attack-runtime.js';
import { createParryAttemptTally } from '../tools/action-studio/shield-parry-r281/parry-attempt-tally.js';
import { readLabExperimentParameters } from '../tools/action-studio/shield-parry-r281/lab-experiment-parameters.js';

const DIRECTIONS = ['top', 'right', 'left'];

test('R21O.1 the default is 1x, so nothing measured at 1x moves', () => {
  assert.equal(ATTACK_TEMPO_STAGE, 'R21O.1');
  assert.equal(DEFAULT_ATTACK_TEMPO_SCALE, 1);
  for (const direction of DIRECTIONS) {
    const plain = getLongswordDirectionalAttackProfile(direction);
    const explicit = getLongswordDirectionalAttackProfile(direction, { tempoScale: 1 });
    // The golden grid and the parry gate are a committed record of the exchange at 1x. An
    // experiment that quietly moved contact out from under them would read as a regression.
    assert.deepEqual({ ...explicit }, { ...plain }, `${direction} must be byte-identical at 1x`);
    assert.equal(plain.tempoScale, 1);
    assert.equal(Math.round(plain.contactSeconds * 1000), 430, `${direction} keeps its measured contact`);
  }
});

test('R21O.1 the scale moves every landmark together, by exactly the scale', () => {
  for (const direction of DIRECTIONS) {
    const one = getLongswordDirectionalAttackProfile(direction);
    const two = getLongswordDirectionalAttackProfile(direction, { tempoScale: 2 });
    assert.equal(two.tempoScale, 2);
    // Contact, the active window, the trail, the commitment marker and the clip's usable length
    // are all derived through the same conversion, so the swing keeps its shape and only its
    // duration changes. If one of these drifted, the direction would be a different attack.
    for (const key of ['contactSeconds', 'durationSeconds', 'activeStartSeconds', 'activeEndSeconds',
      'trailStartSeconds', 'trailEndSeconds', 'movementStartSeconds', 'movementEndSeconds']) {
      assert.ok(Math.abs(two[key] - one[key] * 2) < 1e-9, `${direction}.${key} should scale exactly`);
    }
    assert.equal(Math.round(two.contactSeconds * 1000), 860);
    // The pose the clip is sampled at is unchanged - only when it is reached.
    assert.equal(one.sourceDurationSeconds, two.sourceDurationSeconds);
    assert.equal(one.clipId, two.clipId);
  }
});

test('R21O.1 the tempo rides on top of the warp, and the round trip is exact', () => {
  const warp = ATTACK_TIME_WARPS.left;
  for (const scale of [1, 1.8, 2, 3]) {
    for (const source of [0, 0.05, 0.18, 0.25, 1 / 3, 0.5, 0.9]) {
      const runtime = warpSourceToRuntime(source, warp, scale);
      assert.ok(Math.abs(warpRuntimeToSource(runtime, warp, scale) - source) < 1e-9,
        `round trip must hold at ${scale}x for source ${source}`);
    }
    // Applied AFTER the warp, not folded into its stretch: the burst keeps its authored ratio to
    // its own windup. Folding it in would stretch the burst twice and change the swing's shape,
    // which is the one thing this experiment must not do.
    const unscaled = warpSourceToRuntime(0.25, warp, 1);
    assert.ok(Math.abs(warpSourceToRuntime(0.25, warp, scale) - unscaled * scale) < 1e-9);
  }
  // A direction with no warp still obeys the tempo - otherwise TOP would stay fast while the
  // other two slowed, and the three would no longer share a contact time.
  assert.equal(warpSourceToRuntime(0.43, null, 2), 0.86);
  assert.equal(warpRuntimeToSource(0.86, null, 2), 0.43);
});

test('R21O.1 a scale is clamped rather than trusted', () => {
  assert.equal(clampAttackTempoScale('1.8'), 1.8);
  // A typo in a query string should not produce a swing that never lands, and nothing measured
  // here supports speeding the fight up.
  assert.equal(clampAttackTempoScale('nonsense'), 1);
  assert.equal(clampAttackTempoScale(null), 1);
  assert.equal(clampAttackTempoScale(undefined), 1);
  assert.equal(clampAttackTempoScale(0.2), ATTACK_TEMPO_SCALE_RANGE.min);
  assert.equal(clampAttackTempoScale(99), ATTACK_TEMPO_SCALE_RANGE.max);
  assert.equal(clampAttackTempoScale(Number.NaN), 1);
});

test('R21O.1 the chosen scale covers the reaction spread that was actually measured', () => {
  assert.equal(EXPERIMENT_ATTACK_TEMPO_SCALE, 2);
  const { min, max } = TEMPO_SCALE_COVERING_THE_SPREAD;
  assert.ok(EXPERIMENT_ATTACK_TEMPO_SCALE >= min && EXPERIMENT_ATTACK_TEMPO_SCALE <= max);
  // Re-derive the band from the measurements rather than trusting the two numbers: the answer
  // becomes legible at 220k, contact lands at 430k, and the window is a fixed 180..60ms of TTC.
  const { answerLegibleFromMs, contactMs, windowMs } = READABLE_TEMPO_SCALE_BOUNDS;
  const pressAt = (k, reaction) => answerLegibleFromMs * k + reaction;
  const opens = (k) => contactMs * k - windowMs.opensAtTtc;
  const closes = (k) => contactMs * k - windowMs.closesAtTtc;
  for (const reaction of [MEASURED_REACTION_SPREAD_MS.fastest, 300, MEASURED_REACTION_SPREAD_MS.slowest]) {
    const press = pressAt(EXPERIMENT_ATTACK_TEMPO_SCALE, reaction);
    assert.ok(press >= opens(EXPERIMENT_ATTACK_TEMPO_SCALE) && press <= closes(EXPERIMENT_ATTACK_TEMPO_SCALE),
      `a ${reaction}ms reaction must land inside the window at 2x`);
  }
  // 1x is the condition the playtests failed in, and it fails here for the same reason: even the
  // fastest reaction arrives after the window has shut.
  assert.ok(pressAt(1, MEASURED_REACTION_SPREAD_MS.fastest) > closes(1));
  // 1.8 was the first choice and it clips the slower half of the same spread. Kept as an assertion
  // so the correction cannot be quietly undone.
  assert.ok(pressAt(1.8, MEASURED_REACTION_SPREAD_MS.slowest) > closes(1.8));
  assert.equal(tempoScalePutsAnswerInsideWindow(2), true);
  assert.equal(tempoScalePutsAnswerInsideWindow(1.2), false);
});

test('R21O.1 the evidence that motivated the scale travels with it', () => {
  // Reading the blade against being told the answer - the pair that says the fault is perception
  // and not the input or the window.
  assert.equal(ATTACK_TEMPO_EVIDENCE.readingTheBlade.correct, 14);
  assert.equal(ATTACK_TEMPO_EVIDENCE.readingTheBlade.of, 50);
  assert.equal(ATTACK_TEMPO_EVIDENCE.toldTheAnswer.correct, 19);
  assert.equal(ATTACK_TEMPO_EVIDENCE.toldTheAnswer.of, 22);
  assert.ok(ATTACK_TEMPO_EVIDENCE.toldTheAnswer.z > 5 && ATTACK_TEMPO_EVIDENCE.readingTheBlade.z < 0);
  // The shape of the problem: loudest at the first frame, gone by 116ms, back after 220ms.
  const { closestPairMeters } = ATTACK_TEMPO_EVIDENCE;
  assert.ok(closestPairMeters.at116ms < closestPairMeters.atFirstFrame);
  assert.ok(closestPairMeters.at116ms < closestPairMeters.at220ms);
  assert.equal(ATTACK_TEMPO_EVIDENCE.authority, 'timing-scale-only-no-contact-authority');
});

test('R21O.1 a pasted run says what it was measured under', () => {
  const tally = createParryAttemptTally({ conditions: () => ({ tempoScale: 2, slowReview: false }) });
  tally.recordAttack('top', null);
  assert.match(tally.reportText, /^條件: 攻擊節奏 2\.0× · 無慢動作輔助/);
  // The aid that invalidated two whole playtests has to name itself.
  const aided = createParryAttemptTally({ conditions: () => ({ tempoScale: 1, slowReview: true }) });
  assert.match(aided.reportText, /^條件: 攻擊節奏 1\.0× · 慢動作輔助 0\.12× \+ 凍結 1\.5s/);
  // A tally built without conditions still reports; the header is simply absent.
  const bare = createParryAttemptTally();
  assert.doesNotMatch(bare.reportText, /條件:/);
  assert.match(bare.reportText, /^方向\t揮出/);
});

test('R21O.1 the lab takes the scale from the query and passes it to the attack runtime', async () => {
  // R21V.1: the parsing moved to lab-experiment-parameters.js, where ?sprint= joined it. The claim
  // is unchanged - the query decides the tempo, and the fight and the report read the same value.
  const entry = await readFile(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
  assert.match(entry, /readLabExperimentParameters\(DEBUG_QUERY\)/);
  assert.equal(readLabExperimentParameters(new URLSearchParams('tempo=2')).tempoScale, 2);
  assert.equal(readLabExperimentParameters(new URLSearchParams('')).tempoScale, DEFAULT_ATTACK_TEMPO_SCALE);
  assert.match(entry, /createLongswordDirectionalAttackRuntime\(\{ tempoScale: EXPERIMENT\.tempoScale \}\)/);
  // The report is built from the same constant the fight runs on, so it cannot describe a run
  // that did not happen.
  assert.match(entry, /conditions: \(\) => \(\{ tempoScale: EXPERIMENT\.tempoScale, slowReview: slowReview\.checked, sprint: EXPERIMENT \}\)/);
  // Timing only. Whether a parry lands is still the swept contact's answer.
  const tempo = await readFile(new URL('../src/combat/attack-tempo.js', import.meta.url), 'utf8');
  assert.doesNotMatch(tempo, /resolveContact|parryGate|accepted|aimedSector/);
});
