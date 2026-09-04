// Two source bakes of the same Skyrim clip, compared curve by curve.
//
// This exists because of one question: can output from tools/skyrim-hkx-bridge/convert-hkx.mjs be
// trusted the way the four committed guard GLBs are? Those were baked in 2025 through Blender and
// reviewed by hand; the new path decodes the same .hkx with HavokLib. The manifest froze the input
// hashes, which turns "trust this decoder" into something a machine can settle: re-bake a clip
// whose reference output is already in the repository, and compare.
//
// Compared are the curves the game actually reads - the channels on the nodes SKYRIM_BONE_RETARGETS
// names - not the whole file. A byte comparison would fail on things that are not motion: the
// committed files were run through strip-presentation-meshes.mjs, which leaves their orphaned mesh
// nodes in place, while a visualize=false bake never creates them.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseGlb, readAccessor } from './gltf-accessors.mjs';
import { SKYRIM_BONE_RETARGETS } from '../src/animation/skyrim-animation-retarget.js';

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// One curve per (retarget, path). Two retargets can name the same source node - wrist.l and hand.l
// both read "NPC L Hand [LHnd]" - so the key is the retarget's, and the curve is counted twice on
// purpose: both are read at runtime, and both have to survive a re-bake.
export function collectRetargetCurves(glbBytes, retargets = SKYRIM_BONE_RETARGETS) {
  const { gltf, buffers } = parseGlb(Buffer.from(glbBytes));
  const nodeIndexByName = new Map();
  (gltf.nodes || []).forEach((node, index) => {
    const key = normalize(node?.name);
    if (key && !nodeIndexByName.has(key)) nodeIndexByName.set(key, index);
  });

  const curves = new Map();
  const unresolved = [];
  for (const retarget of retargets) {
    let nodeIndex;
    for (const alias of retarget.sourceAliases) {
      nodeIndex = nodeIndexByName.get(normalize(alias));
      if (nodeIndex !== undefined) break;
    }
    if (nodeIndex === undefined) {
      unresolved.push(retarget.id);
      continue;
    }
    for (const animation of gltf.animations || []) {
      for (const channel of animation.channels || []) {
        if (channel.target?.node !== nodeIndex) continue;
        const sampler = animation.samplers[channel.sampler];
        curves.set(`${retarget.id}/${channel.target.path}`, {
          times: readAccessor(gltf, buffers, sampler.input),
          values: readAccessor(gltf, buffers, sampler.output),
          interpolation: sampler.interpolation || 'LINEAR',
        });
      }
    }
  }
  return { curves, unresolved, animationNames: (gltf.animations || []).map((a) => a.name) };
}

export function compareSourceBakes(referenceBytes, candidateBytes, retargets = SKYRIM_BONE_RETARGETS) {
  const reference = collectRetargetCurves(referenceBytes, retargets);
  const candidate = collectRetargetCurves(candidateBytes, retargets);

  const onlyInReference = [...reference.curves.keys()].filter((key) => !candidate.curves.has(key));
  const onlyInCandidate = [...candidate.curves.keys()].filter((key) => !reference.curves.has(key));

  let worst = { key: null, delta: 0, kind: null };
  const lengthMismatches = [];
  for (const [key, left] of reference.curves) {
    const right = candidate.curves.get(key);
    if (!right) continue;
    if (left.values.length !== right.values.length || left.times.length !== right.times.length) {
      lengthMismatches.push(key);
      continue;
    }
    for (const kind of ['times', 'values']) {
      for (let index = 0; index < left[kind].length; index += 1) {
        const delta = Math.abs(left[kind][index] - right[kind][index]);
        if (delta > worst.delta) worst = { key, delta, kind };
      }
    }
  }

  return {
    comparedCurves: reference.curves.size - onlyInReference.length,
    referenceCurves: reference.curves.size,
    candidateCurves: candidate.curves.size,
    unresolvedInReference: reference.unresolved,
    unresolvedInCandidate: candidate.unresolved,
    onlyInReference,
    onlyInCandidate,
    lengthMismatches,
    worst,
    identical: onlyInReference.length === 0
      && onlyInCandidate.length === 0
      && lengthMismatches.length === 0
      && worst.delta === 0,
  };
}

function isCliEntry() {
  if (!process.argv[1]) return false;
  return fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}

// CLI: node build/compare-source-bakes.mjs <reference.source.glb> <candidate.glb>
if (isCliEntry()) {
  const { readFile } = await import('node:fs/promises');
  const [, , reference, candidate] = process.argv;
  if (!reference || !candidate) {
    console.error('Usage: node build/compare-source-bakes.mjs <reference.source.glb> <candidate.glb>');
    process.exitCode = 2;
  } else {
    const result = compareSourceBakes(await readFile(reference), await readFile(candidate));
    console.log(JSON.stringify(result, null, 2));
    if (!result.identical) process.exitCode = 1;
  }
}
