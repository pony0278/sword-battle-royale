// Reading vertex data out of a glTF, in one place.
//
// This decoding lived inside extract-v3-sword-geometry.mjs, which was fine while one extractor
// existed. It is here because a second one now needs it, and because the last time this repository
// wrote a second copy of accessor arithmetic - build/strip-presentation-meshes.mjs - the copy was
// wrong in a way that only showed up on one file in four: it sized each accessor as
// `view.byteLength - accessor.byteOffset`, which is correct only when one accessor owns one view,
// and shd_blockidle packs 323 accessors into shared views. 380 KB came out as 6878 KB.
//
// So: one decoder, and byteStride respected.

const COMPONENT_READERS = Object.freeze({
  5120: { bytes: 1, read: (buffer, offset) => buffer.readInt8(offset) },
  5121: { bytes: 1, read: (buffer, offset) => buffer.readUInt8(offset) },
  5122: { bytes: 2, read: (buffer, offset) => buffer.readInt16LE(offset) },
  5123: { bytes: 2, read: (buffer, offset) => buffer.readUInt16LE(offset) },
  5125: { bytes: 4, read: (buffer, offset) => buffer.readUInt32LE(offset) },
  5126: { bytes: 4, read: (buffer, offset) => buffer.readFloatLE(offset) },
});

const TYPE_SIZES = Object.freeze({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 });

export function readAccessor(gltf, buffers, accessorIndex) {
  const accessor = gltf.accessors[accessorIndex];
  const view = gltf.bufferViews[accessor.bufferView];
  const reader = COMPONENT_READERS[accessor.componentType];
  const size = TYPE_SIZES[accessor.type];
  if (!reader || !size) throw new Error(`Unsupported accessor ${accessor.componentType}/${accessor.type}`);
  const buffer = buffers[view.buffer || 0];
  const start = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const elementBytes = reader.bytes * size;
  // Interleaved attributes advance by the view's stride, not by the element's own width.
  const stride = view.byteStride || elementBytes;
  const values = [];
  for (let element = 0; element < accessor.count; element += 1) {
    const elementStart = start + element * stride;
    for (let component = 0; component < size; component += 1) {
      values.push(reader.read(buffer, elementStart + component * reader.bytes));
    }
  }
  return values;
}

export function decodeDataUriBuffer(uri) {
  const match = String(uri || '').match(/^data:[^,]+;base64,(.+)$/);
  if (!match) throw new Error('Expected an embedded base64 data URI buffer');
  return Buffer.from(match[1], 'base64');
}

// A binary .glb: a 12-byte header, then length-prefixed chunks. The first chunk is the JSON, the
// second - when present - is the buffer that accessors with no uri read from.
export function parseGlb(bytes) {
  if (bytes.readUInt32LE(0) !== 0x46546c67) throw new Error('Not a .glb: missing the glTF magic');
  const totalLength = bytes.readUInt32LE(8);
  let gltf = null;
  const binaryChunks = [];
  let offset = 12;
  while (offset + 8 <= totalLength) {
    const chunkLength = bytes.readUInt32LE(offset);
    const chunkType = bytes.readUInt32LE(offset + 4);
    const body = bytes.subarray(offset + 8, offset + 8 + chunkLength);
    if (chunkType === 0x4e4f534a) gltf = JSON.parse(body.toString('utf8'));
    else if (chunkType === 0x004e4942) binaryChunks.push(body);
    offset += 8 + chunkLength;
  }
  if (!gltf) throw new Error('.glb carries no JSON chunk');
  // Buffers with a uri are self-describing; the one without is the binary chunk, by spec in order.
  const buffers = (gltf.buffers || []).map((entry) => (
    entry.uri ? decodeDataUriBuffer(entry.uri) : binaryChunks.shift()
  ));
  return { gltf, buffers };
}

export function boundsOf(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], positions[index + axis]);
      max[axis] = Math.max(max[axis], positions[index + axis]);
    }
  }
  return { min, max };
}
