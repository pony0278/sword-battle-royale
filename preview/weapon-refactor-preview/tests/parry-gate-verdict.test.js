import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  PARRY_GATE_VERDICT_STAGE,
  PARRY_GATE_EXPECTED_THROWS,
  PARRY_GATE_DIRECTIONS,
  judgeParryGateExchange,
  judgeParryGateRun,
} from '../src/combat/parry-gate-verdict.js';

test('R19G.1 the verdict accepts every measured healthy release, outliers included', () => {
  assert.equal(PARRY_GATE_VERDICT_STAGE, 'R19G.1');
  // Straight from the calibration probes: the repeated modes and the worst in-family outliers.
  const healthy = [
    { direction: 'top', outcome: 'parry', carryDirection: { x: 0.08, y: 0.94, z: 0.32 } },
    { direction: 'top', outcome: 'parry', carryDirection: { x: 0.66, y: 0.75, z: 0.09 } },
    { direction: 'right', outcome: 'parry', carryDirection: { x: -0.75, y: 0.58, z: 0.31 } },
    { direction: 'right', outcome: 'parry', carryDirection: { x: -0.98, y: 0.19, z: 0.11 } },
    { direction: 'right', outcome: 'parry', carryDirection: { x: -0.39, y: 0.91, z: -0.12 } },
    { direction: 'left', outcome: 'parry', carryDirection: { x: 0.98, y: -0.1, z: -0.2 } },
    { direction: 'left', outcome: 'parry', carryDirection: { x: 0.49, y: 0.86, z: -0.15 } },
    { direction: 'left', outcome: 'perfect-parry', carryDirection: { x: 0.9, y: -0.05, z: -0.43 } },
  ];
  for (const exchange of healthy) {
    // A perfect parry resolves as its own outcome and must not read as "did not connect".
    const outcome = exchange.outcome === 'perfect-parry' ? 'parry' : exchange.outcome;
    const verdict = judgeParryGateExchange({ ...exchange, outcome });
    assert.equal(verdict.pass, true,
      `${exchange.direction} ${JSON.stringify(exchange.carryDirection)} -> ${verdict.reasons}`);
  }
});

test('R19G.1 the verdict rejects each observed failure class of the R19F regression', () => {
  // TOP whiffed outright at the shipping stance - press F, get hit anyway.
  const whiff = judgeParryGateExchange({ direction: 'top', outcome: null, carryDirection: null });
  assert.equal(whiff.pass, false);
  assert.ok(whiff.reasons.some((reason) => reason.startsWith('no-parry-resolution')));

  // RIGHT threw the arm straight DOWN (measured 0.02, -0.98, 0.20).
  const down = judgeParryGateExchange({
    direction: 'right', outcome: 'parry', carryDirection: { x: 0.02, y: -0.98, z: 0.2 },
  });
  assert.equal(down.pass, false);

  // A reversed across-the-body throw on either side.
  const reversedRight = judgeParryGateExchange({
    direction: 'right', outcome: 'parry', carryDirection: { x: 0.9, y: 0.1, z: 0.2 },
  });
  const reversedLeft = judgeParryGateExchange({
    direction: 'left', outcome: 'parry', carryDirection: { x: -0.9, y: 0.1, z: 0.2 },
  });
  assert.equal(reversedRight.pass, false);
  assert.equal(reversedLeft.pass, false);

  // TOP releasing sideways instead of up.
  const flatTop = judgeParryGateExchange({
    direction: 'top', outcome: 'parry', carryDirection: { x: 0.9, y: 0.1, z: 0.2 },
  });
  assert.equal(flatTop.pass, false);
});

test('R19G.1 the run holds all three directions and a missing exchange is a failure, not silence', () => {
  assert.deepEqual([...PARRY_GATE_DIRECTIONS].sort(), ['left', 'right', 'top']);
  const run = judgeParryGateRun([
    { direction: 'top', outcome: 'parry', carryDirection: { x: 0, y: 0.9, z: 0.2 } },
    { direction: 'right', outcome: 'parry', carryDirection: { x: -0.8, y: 0.4, z: 0.3 } },
  ]);
  assert.equal(run.pass, false, 'left never ran, so the gate must fail');
  const left = run.verdicts.find((verdict) => verdict.direction === 'left');
  assert.equal(left.pass, false);

  const full = judgeParryGateRun([
    { direction: 'top', outcome: 'parry', carryDirection: { x: 0, y: 0.9, z: 0.2 } },
    { direction: 'right', outcome: 'parry', carryDirection: { x: -0.8, y: 0.4, z: 0.3 } },
    { direction: 'left', outcome: 'parry', carryDirection: { x: 0.8, y: 0, z: -0.3 } },
  ]);
  assert.equal(full.pass, true);
});

test('R19G.1 the tolerances stay bands, not pins - a gate that trips on healthy variance gets muted', () => {
  // The bounds must leave the measured wobble room: the worst healthy outliers sat at y 0.75
  // (top), x -0.39 (right) and x 0.49 (left). Tightening past them makes the gate flaky and a
  // flaky golden rule ends up ignored, which is worse than no rule.
  assert.ok(PARRY_GATE_EXPECTED_THROWS.top.minimumCarryY <= 0.7);
  assert.ok(PARRY_GATE_EXPECTED_THROWS.right.maximumCarryX >= -0.39);
  assert.ok(PARRY_GATE_EXPECTED_THROWS.left.minimumCarryX <= 0.45);
});

test('R19G.1 the gate is wired: entry starts the probe and the CI script greps its verdicts', async () => {
  const entry = await readFile(
    new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url),
    'utf8',
  );
  assert.match(entry, /maybeStartParryGateProbe\(\{ api: window\.__G43B5R281_LAB__/);

  const probe = await readFile(
    new URL('../tools/action-studio/shield-parry-r281/parry-gate-probe.js', import.meta.url),
    'utf8',
  );
  assert.match(probe, /parryGate'\) !== '1'/, 'the probe must stay inert without the query flag');
  assert.match(probe, /judgeParryGateRun/, 'the probe drives; the src rule judges');

  const script = await readFile(
    new URL('../tools/action-studio/verify-guard-runtime-surface.sh', import.meta.url),
    'utf8',
  );
  assert.match(script, /verify-shield-parry-gate\.mjs/, 'the CI script must run the parry gate driver');
  assert.match(script, /\|\| fail 'shield parry composition gate did not pass'/,
    'a gate failure must fail the CI step, not merely log');

  const driver = await readFile(
    new URL('../tools/action-studio/verify-shield-parry-gate.mjs', import.meta.url),
    'utf8',
  );
  assert.match(driver, /parryGate=1/, 'the driver must boot the lab with the gate flag');
  assert.match(driver, /parryGate !== 'pass'/, 'the driver must require the composed verdict');
  for (const direction of ['Top', 'Right', 'Left']) {
    assert.match(driver, new RegExp(`'${direction}'`), `the driver must hold the ${direction} exchange`);
  }
  assert.match(driver, /process\.exit\(1\)/, 'a failed verdict must exit nonzero');
});
