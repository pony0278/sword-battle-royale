// The greatsword's source geometry, extracted the way the longsword's was.
//
// Same output shape as extract-v3-sword-geometry.mjs, same coordinate transform, and deliberately
// the same rig node ids - procedural-v3-weapon.js builds a line weapon out of exactly those eleven,
// and a second weapon that needed a twelfth would be a change to the builder rather than to a mesh.
//
// WHERE THE NUMBERS COME FROM, which is the part worth reading:
//
//   MEASURED off this mesh          the crossguard, the half width, the tip, the butt
//   PROPORTIONAL to the longsword   grip, secondary grip, pommel, blade.root, blade.mid, parry.point
//
// The split is not a compromise, it is what the mesh can and cannot answer. A crossguard is visible
// in the geometry - it is the band where the silhouette is widest - and the method was validated
// before it was trusted: run over the longsword it returns a mean Y of -0.2043 against the -0.20
// that definition has carried since it was authored. A "grip" is not visible in the same way; it is
// a convention about where a hand goes along the handle, so the greatsword keeps the longsword's
// fractions of its own spans rather than inventing new ones. Those fractions are read out of the
// committed longsword definition here rather than copied as literals, so the relationship stays
// true if the longsword is ever re-extracted.
//
// WHAT THIS DOES NOT DECIDE: where the hand sits along the grip. weapon.root is the mesh origin,
// which is where the author put it, and the report below prints how far up the grip that lands so
// the lab can decide whether the mount wants a position offset. That is a look decision, and it
// belongs where it can be looked at.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boundsOf, parseGlb, readAccessor } from './gltf-accessors.mjs';
import { V3_SWORD_GEOMETRY_DEFINITION } from '../src/character/v3-sword-geometry-definition.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceFile = path.join(repositoryRoot, 'assets', 'kaykit', 'weapons', 'sword_E.glb');
const outputFile = path.join(repositoryRoot, 'src', 'character', 'v3-greatsword-geometry-definition.js');

// The outer tenth of the silhouette. Wide enough to catch a whole crossguard, narrow enough that a
// blade's own taper never reaches it: on the longsword it selects 30 vertices spanning 0.105, on
// the greatsword 56 spanning 0.070 - a band in both cases, not a smear down the blade.
const CROSSGUARD_WIDTH_FRACTION = 0.9;

function axisValues(positions, axis) {
  const values = [];
  for (let index = axis; index < positions.length; index += 3) values.push(positions[index]);
  return values;
}

function measureLandmarks(positions) {
  const xs = axisValues(positions, 0);
  const ys = axisValues(positions, 1);
  const halfWidth = Math.max(...xs.map(Math.abs));
  const crossguardYs = [];
  for (let index = 0; index < positions.length; index += 3) {
    if (Math.abs(positions[index]) > CROSSGUARD_WIDTH_FRACTION * halfWidth) crossguardYs.push(positions[index + 1]);
  }
  return {
    halfWidth,
    guardY: crossguardYs.reduce((sum, value) => sum + value, 0) / crossguardYs.length,
    crossguardVertexCount: crossguardYs.length,
    crossguardSpread: Math.max(...crossguardYs) - Math.min(...crossguardYs),
    tipY: Math.min(...ys),
    buttY: Math.max(...ys),
  };
}

// The longsword's own node placements, as fractions of its own two spans, so the greatsword can be
// given the same proportions rather than the same numbers.
function longswordFractions() {
  const nodeY = Object.fromEntries(V3_SWORD_GEOMETRY_DEFINITION.rigNodes.map((node) => [node.id, node]));
  const absolute = {};
  for (const node of V3_SWORD_GEOMETRY_DEFINITION.rigNodes) {
    absolute[node.id] = node.position[1] + (node.parent ? absolute[node.parent] : 0);
  }
  const guardY = absolute.guard;
  const tipY = absolute['blade.tip'];
  const buttY = V3_SWORD_GEOMETRY_DEFINITION.bounds.max[1];
  const bladeSpan = guardY - tipY;
  const gripSpan = buttY - guardY;
  if (!(bladeSpan > 0) || !(gripSpan > 0)) throw new Error('longsword spans are degenerate; the reference definition changed shape');
  void nodeY;
  return {
    absolute,
    guardY,
    tipY,
    buttY,
    bladeSpan,
    gripSpan,
    downBlade: (id) => (guardY - absolute[id]) / bladeSpan,
    upGrip: (id) => (absolute[id] - guardY) / gripSpan,
  };
}

const bytes = await readFile(sourceFile);
const { gltf, buffers } = parseGlb(bytes);
const scene = gltf.scenes[gltf.scene || 0];
const sourceNode = gltf.nodes[scene.nodes[0]];
const sourceMesh = gltf.meshes[sourceNode.mesh];
if (!sourceMesh || sourceMesh.primitives.length !== 1) throw new Error('Expected one greatsword mesh primitive');
const primitive = sourceMesh.primitives[0];
if ((primitive.mode ?? 4) !== 4) throw new Error('Expected triangle-list greatsword geometry');
if (gltf.skins?.length) throw new Error('The greatsword must be a static mesh: it mounts to a socket, it is not skinned');

const sourcePositions = readAccessor(gltf, buffers, primitive.attributes.POSITION);
// rotate-z-pi, the same transform the v3 extractor applies: it is what turns an authored +Y blade
// into this rig's -Y one. Measured on the source files, both swords are authored the same way, so
// no second transform is needed and none is recorded.
const positions = [];
for (let index = 0; index < sourcePositions.length; index += 3) {
  positions.push(-sourcePositions[index], -sourcePositions[index + 1], sourcePositions[index + 2]);
}
const indices = readAccessor(gltf, buffers, primitive.indices);

// Where the off hand goes on a greatsword, measured rather than assumed.
//
// Every other grip landmark here keeps the longsword's proportions, which is the right default for
// a weapon nobody has been filmed holding. This one is different: assets/skyrim/greatsword/converted
// /2hm_idle.source.glb IS a two-handed hold, so it can be asked.
//
// THE REFERENCE POINTS ARE THE WHOLE TRICK, and getting them wrong is what made three earlier
// answers disagree. Skyrim's `Weapon` and `Shield` nodes are the two hands' EQUIPMENT points -
// exactly what handslot.r and handslot.l are here, and what PRIMARY_GRIP and SECONDARY_GRIP have to
// line up with. `NPC L Hand [LHnd]` is the wrist, one palm short of the grip, and measuring from it
// gives 0.179 instead. In 2hm_idle at rest:
//
//   Weapon -> Shield     11.540 source units
//   head-to-root        117.39  source units
//                    =    0.0983 of a body, 166.8 degrees off the source weapon's +Y - so along
//                         the haft, 2.64 units off-axis, which is the wrist's own offset
//
// This rig's REST head-to-root is 1.2414, so 0.0983 x 1.2414 = 0.1220. The rest pose rather than
// the clip's own, because a weapon's geometry cannot depend on which frame you look at; measured
// against the animated stature the same fraction gives 0.1169, and the test allows that 4%.
//
// The node sits on the haft axis like every other node in this file. The off-axis part of the
// source offset - 2.64 of 11.54 units, the wrist's own displacement - is left out rather than
// fitted to one clip.
//
// The longsword-proportional value this replaces was 0.0881 - 72% of it.
const TWO_HAND_SECONDARY_GRIP_Y = 0.1220;

const measured = measureLandmarks(positions);
const reference = longswordFractions();
const bladeSpan = measured.guardY - measured.tipY;
const gripSpan = measured.buttY - measured.guardY;
const downBlade = (id) => measured.guardY - reference.downBlade(id) * bladeSpan;
const upGrip = (id) => measured.guardY + reference.upGrip(id) * gripSpan;

const absolute = {
  'weapon.root': 0,
  pommel: upGrip('pommel'),
  grip: upGrip('grip'),
  // NOT the longsword's proportion. This one is measured off the clip that actually holds the
  // weapon with two hands - see the constant above.
  secondary_grip: TWO_HAND_SECONDARY_GRIP_Y,
  guard: measured.guardY,
  'blade.root': downBlade('blade.root'),
  'blade.mid': downBlade('blade.mid'),
  'parry.point': downBlade('parry.point'),
  'blade.tip': measured.tipY,
};

const definition = {
  format: 'procedural-v3-sword-source-geometry',
  version: 1,
  id: 'v3_greatsword_two_handed_exact_edges',
  source: 'assets/kaykit/weapons/sword_E.glb',
  sourceObject: sourceNode.name || sourceMesh.name || 'sword_E',
  coordinateTransform: 'rotate-z-pi-for-action-studio-hand-r-mount',
  vertexCount: positions.length / 3,
  triangleCount: indices.length / 3,
  bounds: boundsOf(positions),
  measured: {
    method: 'crossguard-is-the-widest-band; grip landmarks keep the longsword proportions',
    crossguardY: measured.guardY,
    crossguardVertexCount: measured.crossguardVertexCount,
    crossguardSpread: measured.crossguardSpread,
    halfWidth: measured.halfWidth,
    bladeSpan,
    gripSpan,
    // How far up the grip the mount origin lands, against the longsword's. A look decision for the
    // lab, recorded here rather than silently corrected.
    handFractionUpGrip: (0 - measured.guardY) / gripSpan,
    longswordHandFractionUpGrip: (0 - reference.guardY) / reference.gripSpan,
    // The one landmark that is not proportional, and where it came from.
    secondaryGripY: TWO_HAND_SECONDARY_GRIP_Y,
    secondaryGripSource: 'assets/skyrim/greatsword/converted/2hm_idle.source.glb Weapon -> Shield, 0.0983 of head-to-root',
    secondaryGripLongswordProportional: upGrip('secondary_grip'),
  },
  positions,
  indices,
  rigNodes: [
    { id: 'weapon.root', parent: null, position: [0, 0, 0] },
    { id: 'pommel', parent: 'weapon.root', position: [0, absolute.pommel, 0] },
    { id: 'grip', parent: 'weapon.root', position: [0, absolute.grip, 0] },
    { id: 'secondary_grip', parent: 'grip', position: [0, absolute.secondary_grip - absolute.grip, 0] },
    { id: 'guard', parent: 'weapon.root', position: [0, absolute.guard, 0] },
    { id: 'guard.l', parent: 'guard', position: [measured.halfWidth, 0, 0] },
    { id: 'guard.r', parent: 'guard', position: [-measured.halfWidth, 0, 0] },
    { id: 'blade.root', parent: 'guard', position: [0, absolute['blade.root'] - absolute.guard, 0] },
    { id: 'blade.mid', parent: 'blade.root', position: [0, absolute['blade.mid'] - absolute['blade.root'], 0] },
    { id: 'parry.point', parent: 'blade.mid', position: [0, absolute['parry.point'] - absolute['blade.mid'], 0] },
    { id: 'blade.tip', parent: 'blade.mid', position: [0, absolute['blade.tip'] - absolute['blade.mid'], 0] },
  ],
};

function generatedModule(value) {
  return '// Generated by build/extract-greatsword-geometry.mjs. Do not edit by hand.\n'
    + 'function deepFreeze(value) {\n'
    + "  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;\n"
    + '  Object.values(value).forEach(deepFreeze);\n'
    + '  return Object.freeze(value);\n'
    + '}\n\n'
    + `export const V3_GREATSWORD_GEOMETRY_DEFINITION = deepFreeze(${JSON.stringify(value, null, 2)});\n`;
}

await mkdir(path.dirname(outputFile), { recursive: true });
await writeFile(outputFile, generatedModule(definition), 'utf8');

const round = (value) => Number(value.toFixed(4));
console.log(`Generated ${path.relative(repositoryRoot, outputFile)} (${definition.vertexCount} vertices, ${definition.triangleCount} triangles).`);
console.log(`  crossguard   Y ${round(measured.guardY)} from ${measured.crossguardVertexCount} vertices spanning ${round(measured.crossguardSpread)}`);
console.log(`  blade        guard ${round(measured.guardY)} -> tip ${round(measured.tipY)}  (${round(bladeSpan)}, longsword ${round(reference.bladeSpan)}, x${round(bladeSpan / reference.bladeSpan)})`);
console.log(`  grip         guard ${round(measured.guardY)} -> butt ${round(measured.buttY)}  (${round(gripSpan)}, longsword ${round(reference.gripSpan)})`);
console.log(`  hand sits    ${round(definition.measured.handFractionUpGrip * 100)}% up the grip (longsword ${round(definition.measured.longswordHandFractionUpGrip * 100)}%)`);
console.log(`  contact span blade.root ${round(absolute['blade.root'])} -> tip ${round(absolute['blade.tip'])} = ${round(absolute['blade.root'] - absolute['blade.tip'])} (longsword ${round(reference.absolute['blade.root'] - reference.absolute['blade.tip'])})`);
