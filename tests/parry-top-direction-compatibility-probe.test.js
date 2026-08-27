import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  R18N_TOP_DIRECTION_COMPATIBILITY_PROBE_STAGE,
  analyzeTopDirectionCompatibilityProbe,
  normalizeTopDirectionCompatibilityVariant,
  shouldRetainTopDirectionAdditive,
} from '../src/combat/parry-top-direction-compatibility-probe.js';

test('R18N.4.3-B.1.1 normalizes only A/B/C probe variants', () => {
  assert.equal(normalizeTopDirectionCompatibilityVariant('a'), 'A');
  assert.equal(normalizeTopDirectionCompatibilityVariant(' B '), 'B');
  assert.equal(normalizeTopDirectionCompatibilityVariant('c'), 'C');
  assert.equal(normalizeTopDirectionCompatibilityVariant('off'), null);
  assert.equal(normalizeTopDirectionCompatibilityVariant(null), null);
});

test('R18N.4.3-B.1.1 A is solver-only baseline and has no compatibility verdict', () => {
  const report = analyzeTopDirectionCompatibilityProbe({
    direction: 'top',
    variant: 'A',
    beforeCenter: { x: 0, y: 1, z: 0 },
    afterCenter: { x: 0, y: 1, z: 0 },
    targetCenter: { x: 0, y: 1.2, z: 0 },
    additiveApplied: false,
  });
  assert.equal(report.stage, R18N_TOP_DIRECTION_COMPATIBILITY_PROBE_STAGE);
  assert.equal(report.variant, 'A');
  assert.equal(report.reason, 'solver-only-baseline');
  assert.equal(report.compatible, null);
  assert.equal(report.additiveStepMeters, 0);
  assert.equal(report.authority, 'lab-probe-only-no-contact-authority');
});

test('R18N.4.3-B.1.1 upward authored shield step aligned with TOP target is compatible', () => {
  const report = analyzeTopDirectionCompatibilityProbe({
    direction: 'top',
    variant: 'B',
    beforeCenter: { x: 0, y: 1, z: 0 },
    afterCenter: { x: 0.005, y: 1.03, z: 0 },
    targetCenter: { x: 0, y: 1.15, z: 0 },
    additiveApplied: true,
  });
  assert.equal(report.compatible, true);
  assert.ok(report.upwardDot > 0.9);
  assert.ok(report.targetDot > 0.9);
  assert.equal(report.reason, 'authored-step-compatible-with-top-direction');
});

test('R18N.4.3-B.1.1 downward authored shield step is rejected for TOP readability', () => {
  const report = analyzeTopDirectionCompatibilityProbe({
    direction: 'top',
    variant: 'C',
    beforeCenter: { x: 0, y: 1, z: 0 },
    afterCenter: { x: 0, y: 0.98, z: 0 },
    targetCenter: { x: 0, y: 1.15, z: 0 },
    additiveApplied: true,
  });
  assert.equal(report.compatible, false);
  assert.equal(report.reason, 'authored-step-opposes-top-upward-readability');
  assert.equal(shouldRetainTopDirectionAdditive(report), false);
});

test('R18N.4.3-B.1.1 authored step away from active TOP target is rejected', () => {
  const report = analyzeTopDirectionCompatibilityProbe({
    direction: 'top',
    variant: 'C',
    beforeCenter: { x: 0, y: 1, z: 0 },
    afterCenter: { x: 0.03, y: 1.001, z: 0 },
    targetCenter: { x: -0.1, y: 1.02, z: 0 },
    additiveApplied: true,
  });
  assert.equal(report.compatible, false);
  assert.equal(report.reason, 'authored-step-opposes-active-intercept-target');
  assert.equal(shouldRetainTopDirectionAdditive(report), false);
});

test('R18N.4.3-B.1.1 B never changes behavior while C may reject incompatible additive', () => {
  assert.equal(shouldRetainTopDirectionAdditive({ variant: 'B', compatible: false }), true);
  assert.equal(shouldRetainTopDirectionAdditive({ variant: 'C', compatible: true }), true);
  assert.equal(shouldRetainTopDirectionAdditive({ variant: 'C', compatible: null }), true);
  assert.equal(shouldRetainTopDirectionAdditive({ variant: 'C', compatible: false }), false);
});

test('R18N.4.3-B.1.1 runtime source keeps A/B/C lab-only and final closure after probe decision', async () => {
  const source = await readFile(new URL('../tools/action-studio/shield-parry-r281/pre-contact-controller.js', import.meta.url), 'utf8');
  assert.match(source, /normalizeTopDirectionCompatibilityVariant/);
  assert.match(source, /new URLSearchParams\(globalThis\.location\.search\)\.get\('topProbe'\)/);
  assert.match(source, /snapshot\.direction === 'top'/);
  assert.match(source, /topDirectionProbeVariant === 'A'/);
  assert.match(source, /topDirectionProbeVariant === 'C'/);
  assert.match(source, /shouldRetainTopDirectionAdditive/);
  assert.match(source, /topDirectionCompatibilityProbe/);

  const additiveIndex = source.indexOf('shieldArmAdditiveRuntime.update({');
  const probeIndex = source.indexOf('analyzeTopDirectionCompatibilityProbe({');
  const closureIndex = source.indexOf('parryInterceptDirector.finalClosure({');
  assert.ok(additiveIndex >= 0 && probeIndex > additiveIndex, 'probe must inspect the authored additive result');
  assert.ok(closureIndex > probeIndex, 'Active Intercept final closure must remain after the probe decision');
});
