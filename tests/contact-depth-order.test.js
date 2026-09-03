import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  CONTACT_DEPTH_ORDER_STAGE,
  CONTACT_DEPTH_PLANE_EPSILON_METERS,
  decideContactDepthOrder,
} from '../src/combat/contact-depth-order.js';

const surface = { center: { x: 0, y: 1, z: 1.6 }, normal: { x: 0, y: 0, z: -1 } };

test('R19Y.1 the shield is between when attacker and body sit on opposite sides of its plane', () => {
  assert.equal(CONTACT_DEPTH_ORDER_STAGE, 'R19Y.1');
  // The lane's geometry: attacker in front of the shield plane, body behind it. Legacy order.
  const normal = decideContactDepthOrder({
    attackerPoint: { x: 0, y: 1, z: -1.2 },
    bodyPoint: { x: 0, y: 1, z: 2.0 },
    shieldSurface: surface,
  });
  assert.equal(normal.order, 'shield-first');
  assert.equal(normal.reason, 'shield-between-attacker-and-body');
});

test('R19Y.1 a shield slung behind the body hands the question to the body', () => {
  // Back turned: the shield is on the far side, attacker and body share its near side. This is
  // the 4/4 phantom-block geometry the investigation measured, and the fix.
  const backTurned = decideContactDepthOrder({
    attackerPoint: { x: 0, y: 1, z: -1.2 },
    bodyPoint: { x: 0, y: 1, z: 1.2 },
    shieldSurface: { center: { x: 0, y: 1, z: 1.7 }, normal: { x: 0, y: 0, z: 1 } },
  });
  assert.equal(backTurned.order, 'body-first');
  assert.equal(backTurned.reason, 'shield-behind-the-body-along-the-approach');
});

test('R19Y.1 / R24I.1 an edge-on or tilted plane cannot take the block away: the order reads positions, not the normal', () => {
  // A -90 rotation lays the shield plane along the attack axis. Under the R19Y.1 plane-sign test
  // this was a doubt case; in the approach frame the shield center simply sits between the two of
  // them, and the orientation never enters the answer.
  const edgeOn = decideContactDepthOrder({
    attackerPoint: { x: 0.05, y: 1, z: -1.2 },
    bodyPoint: { x: -0.04, y: 1, z: 1.2 },
    shieldSurface: { center: { x: 0, y: 1, z: 0 }, normal: { x: 1, y: 0, z: 0 } },
  });
  assert.equal(edgeOn.order, 'shield-first');
  assert.equal(edgeOn.reason, 'shield-between-attacker-and-body');
  // R24I.1 (#39): the geometry the plane-sign test got wrong, measured in play. The opponent
  // covers TOP, the disc pitches toward flat, and at 2.1m the old test put both fighters on the
  // same side of that near-flat plane and called an honest frontal block a backstab - a player
  // TOP at 1.2-2.3m fell through a covered shield to the chest, every time, while 2.4m held.
  const tiltedCover = decideContactDepthOrder({
    attackerPoint: { x: 0, y: 1, z: 2.1 },
    bodyPoint: { x: 0, y: 1, z: 0 },
    shieldSurface: { center: { x: 0.1, y: 1.4, z: 0.5 }, normal: { x: 0, y: -0.95, z: 0.31 } },
  });
  assert.equal(tiltedCover.order, 'shield-first', 'a shield in front of the chest blocks, whatever its pitch');
  // Doubt still resolves to the shield: no approach to order along, and malformed input.
  const onTop = decideContactDepthOrder({
    attackerPoint: { x: 0, y: 1, z: 0.01 },
    bodyPoint: { x: 0, y: 1, z: 0 },
    shieldSurface: { center: { x: 0, y: 1, z: 0.5 }, normal: { x: 0, y: 0, z: -1 } },
  });
  assert.equal(onTop.reason, 'plane-nearly-edge-on-doubt-resolves-to-the-shield');
  assert.ok(CONTACT_DEPTH_PLANE_EPSILON_METERS > 0);
  assert.equal(decideContactDepthOrder({}).order, 'shield-first');
});

test('R19Y.1 body-first flips blade AND clang contacts alike, through the ordinary miss path', async () => {
  const director = await readFile(
    new URL('../src/combat/contact-lifecycle-director.js', import.meta.url), 'utf8');
  // The intercept sits after the clang replacement, so a clang conversion cannot slip past it,
  // and it acts only when a shield contact was actually claimed.
  const clang = director.indexOf('if (clangEvaluation.contact) contactEvaluation = clangEvaluation;');
  const intercept = director.indexOf('decideContactDepthOrder({', clang);
  const bodyBranch = director.indexOf('if (!contactEvaluation.contact) {', intercept);
  assert.ok(clang >= 0 && intercept > clang && bodyBranch > intercept,
    'clang, then the depth intercept, then the ordinary no-contact path');
  assert.match(director, /reason: 'shield-behind-the-body-guards-nothing'/);
});
