// Take the presentation mesh out of an animation pack.
//
// MEASURED: the three KayKit packs the page loads carry 379 KB of mesh geometry EACH - a six-part
// Mannequin model - and the loader disposes the entire scene the moment it has the clips:
//
//   const result = { packId: pack.id, clips: gltf.animations || [] };
//   disposePackScene(gltf.scene);
//
// assets/kaykit/README.md has said so since the packs were extracted: "The Knight model and its
// skinned presentation mesh are not runtime dependencies." The policy was written down and the
// bytes shipped anyway - 1.14 MB downloaded, parsed and thrown away on every first visit.
//
// WHAT IS REMOVED: meshes, and the accessors, bufferViews, materials, textures, images and samplers
// that nothing else references once they are gone.
//
// WHAT IS KEPT, and why each matters:
//   nodes      Animation channels target nodes BY INDEX. Removing one renumbers every channel that
//              follows it, so nodes stay exactly as they are - only their `mesh` and `skin`
//              properties go. A node with no mesh is a transform, which is what a joint is.
//   skins      Kept when a node still references one. inverseBindMatrices is not mesh geometry.
//   animations Untouched apart from accessor renumbering, and the test asserts the sampler bytes
//              come out byte-identical.
//
// This is lossless FOR THIS USE. A pack stripped this way cannot render its own model any more,
// which is exactly the property the README already claimed.
import { readFile, writeFile } from 'node:fs/promises';

export function parseGlb(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'glTF') throw new Error('not a GLB');
  let offset = 12;
  let json = null;
  let bin = Buffer.alloc(0);
  while (offset + 8 <= buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const chunk = buffer.subarray(start, start + chunkLength);
    if (chunkType === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    else if (chunkType === 0x004e4942) bin = Buffer.from(chunk);
    offset = start + chunkLength;
  }
  if (!json) throw new Error('GLB has no JSON chunk');
  return { json, bin };
}

function pad4(length) {
  return (4 - (length % 4)) % 4;
}

export function buildGlb(json, bin) {
  const jsonChunk = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPad = Buffer.alloc(pad4(jsonChunk.length), 0x20);
  const binPad = Buffer.alloc(pad4(bin.length), 0);
  const jsonLength = jsonChunk.length + jsonPad.length;
  const binLength = bin.length + binPad.length;
  const total = 12 + 8 + jsonLength + (binLength ? 8 + binLength : 0);
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonLength, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const parts = [header, jsonHeader, jsonChunk, jsonPad];
  if (binLength) {
    const binHeader = Buffer.alloc(8);
    binHeader.writeUInt32LE(binLength, 0);
    binHeader.writeUInt32LE(0x004e4942, 4);
    parts.push(binHeader, bin, binPad);
  }
  return Buffer.concat(parts);
}

// Rewrite a glTF so its binary carries only what its animations still read, and return that
// binary. Split out of stripPresentationMeshes when a second caller needed it: pruning foreign
// animation tracks leaves the same debris behind - accessors nothing points at any more.
//
// Animations are assumed to be the only accessor holder, which is true for both callers: one has
// just deleted every mesh, the other never had one.
export function repackAnimationAccessors(json, bin) {
  // Which accessors anything still alive uses. Animations are the only holder left.
  const keptAccessors = new Set();
  for (const animation of json.animations || []) {
    for (const sampler of animation.samplers || []) {
      keptAccessors.add(sampler.input);
      keptAccessors.add(sampler.output);
    }
  }

  // How many bytes one accessor actually occupies.
  //
  // NOT the bufferView's length. Several accessors commonly share one view - shd_blockidle packs
  // 323 of them into 294 KB - and copying view.byteLength per accessor duplicates almost the whole
  // view once per accessor. Measured when that bug shipped into a first attempt: a 380 KB file came
  // out at 6878 KB. The size is the accessor's own: count times the element it holds.
  //
  // byteStride is deliberately not handled: it applies to interleaved vertex attributes, and the
  // accessors kept here are animation inputs and outputs, which are always tightly packed. A view
  // that declares one is refused rather than copied wrongly.
  const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  const COMPONENT_COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
  function accessorByteLength(accessor) {
    const componentBytes = COMPONENT_BYTES[accessor.componentType];
    const components = COMPONENT_COUNT[accessor.type];
    if (!componentBytes || !components) {
      throw new Error(`unsupported accessor: componentType=${accessor.componentType} type=${accessor.type}`);
    }
    return accessor.count * componentBytes * components;
  }

  // Repack: one bufferView per kept accessor, copied in order, so the binary carries nothing else.
  const oldAccessors = json.accessors || [];
  const oldViews = json.bufferViews || [];
  const accessorRemap = new Map();
  const accessors = [];
  const bufferViews = [];
  const chunks = [];
  let cursor = 0;
  for (const index of [...keptAccessors].sort((a, b) => a - b)) {
    const accessor = { ...oldAccessors[index] };
    if (accessor.bufferView == null) {
      // A sparse or zero-filled accessor carries no view; keep it as-is.
      accessorRemap.set(index, accessors.length);
      accessors.push(accessor);
      continue;
    }
    const view = oldViews[accessor.bufferView];
    if (view.byteStride != null) {
      throw new Error('interleaved animation accessor: byteStride is not handled here');
    }
    const start = (view.byteOffset || 0) + (accessor.byteOffset || 0);
    const length = accessorByteLength(accessor);
    if (start + length > bin.length) throw new Error('accessor runs past the binary chunk');
    const slice = bin.subarray(start, start + length);
    const padding = Buffer.alloc(pad4(cursor), 0);
    if (padding.length) { chunks.push(padding); cursor += padding.length; }
    chunks.push(slice);
    const newView = { buffer: 0, byteOffset: cursor, byteLength: slice.length };
    cursor += slice.length;
    accessor.bufferView = bufferViews.length;
    delete accessor.byteOffset;
    bufferViews.push(newView);
    accessorRemap.set(index, accessors.length);
    accessors.push(accessor);
  }

  for (const animation of json.animations || []) {
    for (const sampler of animation.samplers || []) {
      sampler.input = accessorRemap.get(sampler.input);
      sampler.output = accessorRemap.get(sampler.output);
    }
  }

  json.accessors = accessors;
  json.bufferViews = bufferViews;
  return Buffer.concat(chunks);
}

export function stripPresentationMeshes(buffer) {
  const { json, bin } = parseGlb(buffer);
  if (!json.meshes?.length) return { buffer, removedMeshes: 0, savedBytes: 0 };

  const removedMeshes = json.meshes.length;
  for (const node of json.nodes || []) {
    delete node.mesh;
    delete node.skin;
  }
  delete json.meshes;
  delete json.materials;
  delete json.textures;
  delete json.images;
  delete json.samplers;
  // Every skin is now unreferenced, because only a node's `skin` pointed at one and those are gone.
  // The joints themselves are nodes and stay.
  delete json.skins;

  const newBin = repackAnimationAccessors(json, bin);
  json.buffers = newBin.length ? [{ byteLength: newBin.length }] : [];
  const out = buildGlb(json, newBin);
  return { buffer: out, removedMeshes, savedBytes: buffer.length - out.length };
}

// Runnable on its own so a pack can be inspected without a full extract.
if (import.meta.url === `file://${process.argv[1]}`) {
  const targets = process.argv.slice(2);
  if (!targets.length) {
    console.error('usage: node build/strip-presentation-meshes.mjs <file.glb> [...]');
    process.exit(1);
  }
  for (const target of targets) {
    const before = await readFile(target);
    const { buffer, removedMeshes, savedBytes } = stripPresentationMeshes(before);
    await writeFile(target, buffer);
    console.log(`${target}: removed ${removedMeshes} meshes, ${(savedBytes / 1024).toFixed(0)} KB `
      + `(${before.length / 1024 | 0} KB to ${buffer.length / 1024 | 0} KB)`);
  }
}
