// Drop the animation tracks a bake produced for bones its skeleton does not have.
//
// FOUND while checking the greatsword idle: 2hm_idle.hkx carries 210 transform tracks, and the
// skeleton.hkx it was baked against declares 99 animation bones (plus a 19-bone ragdoll). Skyrim
// animation packs are routinely authored against an extended skeleton - XPMSE and friends add
// weapon-style, twist and physics bones - and hk_to_gltf numbers its output channels by track
// index, so a clip with more tracks than the skeleton has bones writes channels that point past
// the end of the node array. 184 of the greatsword's 421 channels targeted 92 nodes numbered
// 118..209, which do not exist. That is not a glTF a loader is required to read.
//
// WHY THE REST OF THE FILE IS STILL GOOD, and this prunes rather than refusing: track index still
// means the same bone for every bone both skeletons share. The evidence is the bind offsets, which
// are the skeleton's own bone lengths and would scramble under any shift - all 23 retarget bones
// carry offsets identical to shd_blockidle's, to every decimal, except the WEAPON node, which is
// exactly the one a two-handed clip is supposed to place differently.
//
// THE RULE: a channel survives if its target is the animation skeleton or something under it.
// Everything else is a track that overshot. Three kinds were actually present:
//
//   past the end of the node array   184 channels   invalid glTF, and the obvious half
//   the ragdoll skeleton              37 channels   a real node, a stranger's rotation
//   the scene root above the bones     2 channels   the one that would have moved the character
//
// The last is why the rule is structural rather than a name test. A first version excluded nodes
// named Ragdoll_ and let two channels through onto the wrapper node the exporter puts above the
// skeleton - which is not named Ragdoll_ anything, and which carries the whole body.
//
// What comes out has the reviewed shape exactly: 198 channels on nodes 0..98, which is what all
// four guard bakes carry, and the 46 retarget curves are bit-for-bit what they were before.
//
// On a clip whose skeleton does match, this removes nothing and returns the input buffer unchanged.
import { readFile, writeFile } from 'node:fs/promises';

import { buildGlb, parseGlb, repackAnimationAccessors } from './strip-presentation-meshes.mjs';

// Which nodes are bones.
//
// A source bake comes out as two scene roots: a synthetic wrapper holding the animation skeleton,
// and the ragdoll. The wrapper is recognisable - the exporter names it after the root bone it
// parents, so it has a descendant with its own name - and it is not a bone: the four reviewed
// guard bakes animate 99 tracks onto the 99 nodes below it and none onto the wrapper itself.
//
// Recognising it matters. Nodes 0..98 are the bones, node 99 is the wrapper, and the wrapper
// carries the whole body - a foreign track landing there moves the character.
function animationSkeletonBones(nodes) {
  const isChild = new Set();
  nodes.forEach((node) => (node.children || []).forEach((child) => isChild.add(child)));
  const subtreeOf = (index) => {
    const inside = new Set();
    const stack = [index];
    while (stack.length) {
      const current = stack.pop();
      if (current == null || current >= nodes.length || inside.has(current)) continue;
      inside.add(current);
      for (const child of nodes[current].children || []) stack.push(child);
    }
    return inside;
  };

  const roots = nodes.map((_node, index) => index).filter((index) => !isChild.has(index));
  if (!roots.length) throw new Error('every node has a parent: this is not a glTF scene');
  let bones = new Set();
  let chosen = -1;
  for (const root of roots) {
    const subtree = subtreeOf(root);
    if (subtree.size > bones.size) { bones = subtree; chosen = root; }
  }
  // Only drop the root when it is the exporter's duplicate. A bake whose skeleton root IS the
  // scene root would otherwise lose the one bone that carries root motion.
  const name = nodes[chosen]?.name;
  const duplicated = [...bones].some((index) => index !== chosen && nodes[index]?.name === name);
  if (duplicated) bones.delete(chosen);
  return bones;
}

export function pruneForeignAnimationTracks(buffer) {
  const { json, bin } = parseGlb(Buffer.from(buffer));
  const nodes = json.nodes || [];
  const bones = animationSkeletonBones(nodes);
  const report = { dangling: 0, outsideSkeleton: 0, keptChannels: 0, removedSamplers: 0 };

  for (const animation of json.animations || []) {
    const kept = [];
    for (const channel of animation.channels || []) {
      const target = channel.target?.node;
      if (target == null || target >= nodes.length) report.dangling += 1;
      else if (!bones.has(target)) report.outsideSkeleton += 1;
      else { kept.push(channel); continue; }
    }
    animation.channels = kept;
    report.keptChannels += kept.length;
  }

  const removed = report.dangling + report.outsideSkeleton;
  if (removed === 0) return { buffer: Buffer.from(buffer), ...report, removed };

  // A sampler nothing points at is dead weight, and renumbering it out is what lets the repack
  // below drop its accessors too.
  for (const animation of json.animations || []) {
    const used = [...new Set(animation.channels.map((channel) => channel.sampler))].sort((a, b) => a - b);
    const remap = new Map(used.map((index, position) => [index, position]));
    report.removedSamplers += animation.samplers.length - used.length;
    animation.samplers = used.map((index) => animation.samplers[index]);
    for (const channel of animation.channels) channel.sampler = remap.get(channel.sampler);
  }

  const newBin = repackAnimationAccessors(json, bin);
  json.buffers = newBin.length ? [{ byteLength: newBin.length }] : [];
  return { buffer: buildGlb(json, newBin), ...report, removed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const targets = process.argv.slice(2);
  if (!targets.length) {
    console.error('usage: node build/prune-foreign-animation-tracks.mjs <file.glb> [...]');
    process.exit(1);
  }
  for (const target of targets) {
    const before = await readFile(target);
    const result = pruneForeignAnimationTracks(before);
    if (result.removed) await writeFile(target, result.buffer);
    console.log(`${target}: removed ${result.dangling} dangling + ${result.outsideSkeleton} outside-skeleton channels, `
      + `kept ${result.keptChannels} (${before.length / 1024 | 0} KB to ${result.buffer.length / 1024 | 0} KB)`);
  }
}
