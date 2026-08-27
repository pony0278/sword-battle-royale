import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKYRIM_LE_VERSION = 'hk_2010.2.0-r1';

export const G231_SOURCE_BONES = Object.freeze([
  Object.freeze({ id: 'root', aliases: Object.freeze(['NPC Root [Root]', 'NPC Root']) }),
  Object.freeze({ id: 'pelvis', aliases: Object.freeze(['NPC Pelvis [Pelv]', 'NPC Pelvis']) }),
  Object.freeze({ id: 'spine', aliases: Object.freeze(['NPC Spine [Spn0]', 'NPC Spine']) }),
  Object.freeze({ id: 'chest', aliases: Object.freeze(['NPC Spine2 [Spn2]', 'NPC Spine2']) }),
  Object.freeze({ id: 'head', aliases: Object.freeze(['NPC Head [Head]', 'NPC Head']) }),
  Object.freeze({ id: 'upperarm.l', aliases: Object.freeze(['NPC L UpperArm [LUar]', 'NPC L UpperArm']) }),
  Object.freeze({ id: 'lowerarm.l', aliases: Object.freeze(['NPC L Forearm [LLar]', 'NPC L Forearm']) }),
  Object.freeze({ id: 'wrist.l', aliases: Object.freeze(['NPC L Hand [LHnd]', 'NPC L Hand']) }),
  Object.freeze({ id: 'upperarm.r', aliases: Object.freeze(['NPC R UpperArm [RUar]', 'NPC R UpperArm']) }),
  Object.freeze({ id: 'lowerarm.r', aliases: Object.freeze(['NPC R Forearm [RLar]', 'NPC R Forearm']) }),
  Object.freeze({ id: 'wrist.r', aliases: Object.freeze(['NPC R Hand [RHnd]', 'NPC R Hand']) }),
  Object.freeze({ id: 'upperleg.l', aliases: Object.freeze(['NPC L Thigh [LThg]', 'NPC L Thigh']) }),
  Object.freeze({ id: 'lowerleg.l', aliases: Object.freeze(['NPC L Calf [LClf]', 'NPC L Calf']) }),
  Object.freeze({ id: 'foot.l', aliases: Object.freeze(['NPC L Foot [Lft ]', 'NPC L Foot [Lft]', 'NPC L Foot']) }),
  Object.freeze({ id: 'toes.l', aliases: Object.freeze(['NPC L Toe0 [LToe]', 'NPC L Toe0']) }),
  Object.freeze({ id: 'upperleg.r', aliases: Object.freeze(['NPC R Thigh [RThg]', 'NPC R Thigh']) }),
  Object.freeze({ id: 'lowerleg.r', aliases: Object.freeze(['NPC R Calf [RClf]', 'NPC R Calf']) }),
  Object.freeze({ id: 'foot.r', aliases: Object.freeze(['NPC R Foot [Rft ]', 'NPC R Foot [Rft]', 'NPC R Foot']) }),
  Object.freeze({ id: 'toes.r', aliases: Object.freeze(['NPC R Toe0 [RToe]', 'NPC R Toe0']) }),
]);

const SKELETON_MARKERS = Object.freeze([SKYRIM_LE_VERSION, 'hkaAnimationContainer', 'hkaSkeleton', 'NPC Root [Root]', 'NPC Pelvis [Pelv]']);
const ANIMATION_MARKERS = Object.freeze([SKYRIM_LE_VERSION, 'hkaAnimationContainer', 'hkaSplineCompressedAnimation', 'hkaAnimationBinding', 'NPC Root [Root]']);

function markerOffset(bytes, marker) {
  return Buffer.from(bytes).indexOf(Buffer.from(marker, 'ascii'));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function inspectMarkers(bytes, markers) {
  const offsets = Object.fromEntries(markers.map((marker) => [marker, markerOffset(bytes, marker)]));
  const missing = markers.filter((marker) => offsets[marker] < 0);
  return { offsets, missing };
}

function firstAliasOffset(bytes, aliases) {
  for (const alias of aliases) {
    const offset = markerOffset(bytes, alias);
    if (offset >= 0) return { alias, offset };
  }
  return null;
}

export function inspectRealBakePair(skeletonBytes, animationBytes, options = {}) {
  const skeleton = Buffer.from(skeletonBytes || []);
  const animation = Buffer.from(animationBytes || []);
  const skeletonMarkers = inspectMarkers(skeleton, SKELETON_MARKERS);
  const animationMarkers = inspectMarkers(animation, ANIMATION_MARKERS);
  const boneMatches = Object.fromEntries(G231_SOURCE_BONES.map((bone) => [bone.id, firstAliasOffset(skeleton, bone.aliases)]));
  const missingBones = G231_SOURCE_BONES.filter((bone) => !boneMatches[bone.id]).map((bone) => bone.id);
  const sameHavokGeneration = markerOffset(skeleton, SKYRIM_LE_VERSION) >= 0 && markerOffset(animation, SKYRIM_LE_VERSION) >= 0;
  const acceptedForRealBake = sameHavokGeneration
    && skeletonMarkers.missing.length === 0
    && animationMarkers.missing.length === 0
    && missingBones.length === 0;

  return {
    stage: 'G2.3.1',
    acceptedForRealBake,
    sameHavokGeneration,
    skeleton: {
      filename: options.skeletonFilename || '',
      byteLength: skeleton.byteLength,
      sha256: sha256(skeleton),
      markers: skeletonMarkers.offsets,
      missingMarkers: skeletonMarkers.missing,
      semanticBoneCount: G231_SOURCE_BONES.length - missingBones.length,
      semanticBoneTotal: G231_SOURCE_BONES.length,
      boneMatches,
      missingBones,
    },
    animation: {
      filename: options.animationFilename || '',
      byteLength: animation.byteLength,
      sha256: sha256(animation),
      markers: animationMarkers.offsets,
      missingMarkers: animationMarkers.missing,
    },
    outputContract: {
      sourceGlb: 'shd_blockidle.source.glb',
      canonicalClipId: 'SKYRIM_GUARD/shd_blockidle',
      fps: 30,
      preserveSourceHierarchy: true,
      retargetInBlender: false,
    },
  };
}

export async function inspectRealBakePairFiles(skeletonFilename, animationFilename) {
  const [skeletonBytes, animationBytes] = await Promise.all([readFile(skeletonFilename), readFile(animationFilename)]);
  return inspectRealBakePair(skeletonBytes, animationBytes, {
    skeletonFilename: path.basename(skeletonFilename),
    animationFilename: path.basename(animationFilename),
  });
}

function isCliEntry() {
  if (!process.argv[1]) return false;
  return fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}

if (isCliEntry()) {
  const [, , skeletonFilename, animationFilename] = process.argv;
  if (!skeletonFilename || !animationFilename) {
    console.error('Usage: node tools/skyrim-hkx-bridge/real-bake-contract.mjs <skeleton.hkx> <animation.hkx>');
    process.exitCode = 2;
  } else {
    try {
      const report = await inspectRealBakePairFiles(skeletonFilename, animationFilename);
      console.log(JSON.stringify(report, null, 2));
      if (!report.acceptedForRealBake) process.exitCode = 1;
    } catch (error) {
      console.error(error?.message || String(error));
      process.exitCode = 1;
    }
  }
}
