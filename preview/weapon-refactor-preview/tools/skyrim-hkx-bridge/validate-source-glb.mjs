import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { G231_SOURCE_BONES } from './real-bake-contract.mjs';

const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK = 0x4e4f534a;

export function normalizeSourceNodeName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function readGlbJson(bytes) {
  const buffer = Buffer.from(bytes || []);
  if (buffer.byteLength < 20) throw new Error('Source GLB is too small');
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) throw new Error('Source bake is not a binary glTF (.glb)');
  const version = buffer.readUInt32LE(4);
  if (version !== 2) throw new Error(`Source GLB must use glTF 2.0, received ${version}`);
  const declaredLength = buffer.readUInt32LE(8);
  if (declaredLength !== buffer.byteLength) throw new Error(`Source GLB length mismatch: header ${declaredLength}, actual ${buffer.byteLength}`);
  let offset = 12;
  while (offset + 8 <= buffer.byteLength) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + chunkLength;
    if (end > buffer.byteLength) throw new Error('Source GLB contains a truncated chunk');
    if (chunkType === GLB_JSON_CHUNK) {
      const jsonText = buffer.subarray(start, end).toString('utf8').replace(/[\u0000\u0020]+$/g, '');
      return { version, json: JSON.parse(jsonText) };
    }
    offset = end;
  }
  throw new Error('Source GLB does not contain a JSON chunk');
}

function semanticSourceNodes(gltf) {
  const nodes = Array.isArray(gltf?.nodes) ? gltf.nodes : [];
  const byNormalizedName = new Map();
  nodes.forEach((node, index) => {
    const key = normalizeSourceNodeName(node?.name);
    if (key && !byNormalizedName.has(key)) byNormalizedName.set(key, { index, name: node.name });
  });
  const matches = {};
  const missing = [];
  for (const bone of G231_SOURCE_BONES) {
    let found = null;
    for (const alias of bone.aliases) {
      found = byNormalizedName.get(normalizeSourceNodeName(alias));
      if (found) break;
    }
    if (found) matches[bone.id] = found;
    else missing.push(bone.id);
  }
  return { matches, missing, total: G231_SOURCE_BONES.length };
}

function externalUris(gltf) {
  const uris = [];
  for (const item of [...(gltf?.buffers || []), ...(gltf?.images || [])]) {
    const uri = item?.uri;
    if (typeof uri === 'string' && uri && !uri.startsWith('data:')) uris.push(uri);
  }
  return uris;
}

function animationFacts(gltf, semanticMatches) {
  const animations = Array.isArray(gltf?.animations) ? gltf.animations : [];
  const semanticNodeIndexes = new Set(Object.values(semanticMatches).map((entry) => entry.index));
  return animations.map((animation, index) => {
    const channels = Array.isArray(animation?.channels) ? animation.channels : [];
    const animatedNodeIndexes = new Set(channels.map((channel) => channel?.target?.node).filter(Number.isInteger));
    const animatedSemanticCount = [...animatedNodeIndexes].filter((nodeIndex) => semanticNodeIndexes.has(nodeIndex)).length;
    return {
      index,
      name: animation?.name || '',
      channelCount: channels.length,
      animatedNodeCount: animatedNodeIndexes.size,
      animatedSemanticCount,
    };
  });
}

export function validateSkyrimSourceGlb(bytes, options = {}) {
  const { version, json: gltf } = readGlbJson(bytes);
  const semantics = semanticSourceNodes(gltf);
  const external = externalUris(gltf);
  const animations = animationFacts(gltf, semantics.matches);
  const hasAnimation = animations.some((animation) => animation.channelCount > 0);
  const acceptedForG23Review = version === 2
    && semantics.missing.length === 0
    && external.length === 0
    && hasAnimation;
  return {
    stage: 'G2.3.1',
    filename: options.filename || '',
    acceptedForG23Review,
    gltfVersion: version,
    selfContained: external.length === 0,
    externalUris: external,
    nodeCount: Array.isArray(gltf?.nodes) ? gltf.nodes.length : 0,
    semanticBoneCount: semantics.total - semantics.missing.length,
    semanticBoneTotal: semantics.total,
    semanticMatches: semantics.matches,
    missingSemanticBones: semantics.missing,
    animationCount: animations.length,
    animations,
    warning: animations.some((animation) => animation.animatedSemanticCount < 10)
      ? 'Animation has fewer than 10 channels targeting the 19 review semantics; inspect the export before visual review.'
      : null,
  };
}

export async function validateSkyrimSourceGlbFile(filename) {
  const bytes = await readFile(filename);
  return validateSkyrimSourceGlb(bytes, { filename: path.basename(filename) });
}

function isCliEntry() {
  if (!process.argv[1]) return false;
  return fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}

if (isCliEntry()) {
  const filename = process.argv[2];
  if (!filename) {
    console.error('Usage: node tools/skyrim-hkx-bridge/validate-source-glb.mjs <shd_blockidle.source.glb>');
    process.exitCode = 2;
  } else {
    try {
      const report = await validateSkyrimSourceGlbFile(filename);
      console.log(JSON.stringify(report, null, 2));
      if (!report.acceptedForG23Review) process.exitCode = 1;
    } catch (error) {
      console.error(error?.message || String(error));
      process.exitCode = 1;
    }
  }
}
