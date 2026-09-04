import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { codeOnly } from './support/source-text.js';
import * as ThreeModule from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { createProceduralV3Weapon, V3_LONGSWORD_DEFINITION } from '../src/character/procedural-v3-weapon.js';
import { V3_GREATSWORD_DEFINITION } from '../src/character/v3-greatsword-weapon.js';
import { V3_GREATSWORD_GEOMETRY_DEFINITION as GS } from '../src/character/v3-greatsword-geometry-definition.js';
import { V3_SWORD_GEOMETRY_DEFINITION as LS } from '../src/character/v3-sword-geometry-definition.js';

// Step one of the greatsword: a mesh that the fight can measure. Not a move, not a timing - the
// blade, in the hand, as lines, with a contact polyline the sampler can read.
const THREE = { ...ThreeModule, GLTFLoader };

function absoluteNodeY(geometry) {
  const absolute = {};
  for (const node of geometry.rigNodes) absolute[node.id] = node.position[1] + (node.parent ? absolute[node.parent] : 0);
  return absolute;
}

// Staleness is checked in CI, next to the Action Studio bundle's: `npm run extract:greatsword`
// followed by a diff. It is not a test here because re-running an extractor would rewrite a tracked
// file as a side effect of `npm test`.
test('the greatsword is authored on the same axis as the longsword, so it needs no second transform', () => {
  assert.equal(GS.coordinateTransform, LS.coordinateTransform);
  // Blade toward -Y, grip toward +Y, in both. This is the claim that removed a whole piece of work,
  // so it is asserted rather than remembered.
  for (const geometry of [LS, GS]) {
    const absolute = absoluteNodeY(geometry);
    assert.ok(absolute['blade.tip'] < absolute.guard, `${geometry.id}: the tip is not below the guard`);
    assert.ok(absolute.pommel > absolute.guard, `${geometry.id}: the pommel is not above the guard`);
    assert.ok(Math.abs(absolute['blade.tip'] - geometry.bounds.min[1]) < 1e-9, `${geometry.id}: the tip is not the lowest point`);
  }
});

test('the crossguard was measured, and the method reproduces the longsword', () => {
  // The greatsword's guard node is not a guess: it is the mean Y of the vertices in the outer tenth
  // of the silhouette. Run over the longsword the same method returns -0.2043 against the -0.20 that
  // definition has carried since it was authored, which is why it was trusted here.
  const xs = [];
  const ys = [];
  for (let index = 0; index < LS.positions.length; index += 3) { xs.push(LS.positions[index]); ys.push(LS.positions[index + 1]); }
  const halfWidth = Math.max(...xs.map(Math.abs));
  const band = [];
  for (let index = 0; index < LS.positions.length; index += 3) {
    if (Math.abs(LS.positions[index]) > 0.9 * halfWidth) band.push(LS.positions[index + 1]);
  }
  const mean = band.reduce((sum, value) => sum + value, 0) / band.length;
  assert.ok(Math.abs(mean - absoluteNodeY(LS).guard) < 0.005, `method returned ${mean} against the committed -0.20`);

  assert.equal(GS.measured.crossguardVertexCount, 56);
  assert.ok(GS.measured.crossguardSpread < 0.1, 'the greatsword crossguard is a band, not a smear down the blade');
  assert.ok(Math.abs(GS.measured.crossguardY - absoluteNodeY(GS).guard) < 1e-9);
});

test('the greatsword reaches twice as far, which is the whole point of a second mesh', () => {
  const longsword = absoluteNodeY(LS);
  const greatsword = absoluteNodeY(GS);
  // The contact polyline the sampler reads is blade.root -> blade.mid -> blade.tip.
  const longswordContact = longsword['blade.root'] - longsword['blade.tip'];
  const greatswordContact = greatsword['blade.root'] - greatsword['blade.tip'];
  assert.ok(Math.abs(greatswordContact / longswordContact - 2) < 0.01, `contact span ratio ${greatswordContact / longswordContact}`);
  // A greatsword sharing the longsword's blade would have the longsword's reach to the millimetre,
  // and 大範圍 would not be a property the fight could see. handoff/40 said so; this measures it.
  assert.ok(greatswordContact > 2.2 && longswordContact < 1.2);
});

test('the outline is drawn from the weapon it was handed, not from the longsword', () => {
  // The defect this replaces: createExactV3Outline read the longsword geometry module directly, so
  // passing a second weapon's definition drew the first weapon's blade with the second weapon's rig
  // nodes. Silent, and exactly wrong in the way that matters - the drawn blade and the measured one
  // would have disagreed.
  const greatsword = createProceduralV3Weapon(THREE, { definition: V3_GREATSWORD_DEFINITION });
  assert.equal(greatsword.lines.outline.userData.sourceGeometryId, GS.id);
  assert.equal(greatsword.lines.outline.userData.sourceVertexCount, 818);
  assert.equal(greatsword.lines.outline.userData.sourceTriangleCount, 616);
  assert.equal(greatsword.object3d.name, 'V3_PROCEDURAL_GREATSWORD');
  assert.equal(greatsword.object3d.userData.renderStyle, 'v3-rig-line');

  const longsword = createProceduralV3Weapon(THREE, { definition: V3_LONGSWORD_DEFINITION });
  assert.equal(longsword.lines.outline.userData.sourceGeometryId, LS.id);
  assert.equal(longsword.object3d.name, 'V3_PROCEDURAL_LONGSWORD', 'the mount policy documents this name');
});

test('the greatsword line outline has edges, and more of them than the longsword', () => {
  const greatsword = createProceduralV3Weapon(THREE, { definition: V3_GREATSWORD_DEFINITION });
  const longsword = createProceduralV3Weapon(THREE, { definition: V3_LONGSWORD_DEFINITION });
  const edgesOf = (weapon) => weapon.lines.outline.geometry.attributes.position.count / 2;
  assert.ok(edgesOf(greatsword) > 0, 'EdgesGeometry produced nothing: the greatsword would draw as an empty group');
  assert.ok(edgesOf(greatsword) > edgesOf(longsword), `${edgesOf(greatsword)} greatsword edges against ${edgesOf(longsword)}`);
});

test('the greatsword sweep segment runs the length of its own blade', () => {
  const greatsword = createProceduralV3Weapon(THREE, { definition: V3_GREATSWORD_DEFINITION });
  const sweep = greatsword.getSweepSegment();
  const absolute = absoluteNodeY(GS);
  assert.ok(Math.abs(sweep.start.y - absolute['blade.root']) < 1e-6);
  assert.ok(Math.abs(sweep.end.y - absolute['blade.tip']) < 1e-6);
  assert.ok(Math.abs(sweep.end.y - GS.bounds.min[1]) < 1e-9, 'the sweep must end at the actual tip');
});

test('the builder does not drag the greatsword into every page that draws a sword', async () => {
  // 82 KB of generated source, 10.8 KB gzipped. The cold-start work took the published page from
  // ~180 requests to 14; eagerly importing a weapon nobody has equipped would spend part of that
  // back for nothing.
  const builder = await readFile(new URL('../src/character/procedural-v3-weapon.js', import.meta.url), 'utf8');
  // codeOnly, per R22J.1: the module's header explains this choice, and a comment must not be able
  // to satisfy an absence assertion. Written on two lines, the way the other KEEP assertions are,
  // so that R22J.1's census can see the read - wrapping the readFile hides it from the regex, which
  // is the trap R23T.1 recorded.
  assert.doesNotMatch(codeOnly(builder), /greatsword-geometry-definition/);
});
