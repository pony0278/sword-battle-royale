import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab.js', import.meta.url), 'utf8');
const historicalRuntime = fs.readFileSync(new URL('../src/combat/parallel-parry-body-stagger.js', import.meta.url), 'utf8');

test('G4.3B.5R.2.5 historical runtime remains available for comparison', () => {
  assert.match(historicalRuntime, /PARALLEL_PARRY_BODY_STAGGER_STAGE = 'G4\.3B\.5R\.2\.5'/);
  assert.match(historicalRuntime, /chestScale: 1\.45/);
});

test('G4.3B.5R.2.7 supersedes .2.5 as active release authority while keeping .2.6 preload', () => {
  assert.match(source, /PARRY_BACKWARD_BALANCE_BREAK_STAGE/);
  assert.match(source, /TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_STAGE/);
  assert.match(source, /createParryBackwardBalanceBreakRuntime/);
  assert.doesNotMatch(source, /createParallelParryBodyStaggerRuntime/);
  assert.match(source, /backwardPreloadFadesIntoReleaseBurst: true/);
  assert.match(source, /oldTwoActorWholeBodyB3ClockRestoredAtRelease: true/);
});
