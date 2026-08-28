import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKYRIM_LE_HKX_MARKERS = Object.freeze([
  'hk_2010.2.0-r1',
  'hkaAnimationContainer',
  'hkaSplineCompressedAnimation',
  'hkaAnimationBinding',
  'NPC Root [Root]',
]);

function markerOffset(bytes, marker) {
  return Buffer.from(bytes).indexOf(Buffer.from(marker, 'ascii'));
}

export function inspectSkyrimAnimationHkx(bytes, options = {}) {
  const buffer = Buffer.from(bytes || []);
  const markers = Object.fromEntries(SKYRIM_LE_HKX_MARKERS.map((marker) => [marker, markerOffset(buffer, marker)]));
  const missingMarkers = SKYRIM_LE_HKX_MARKERS.filter((marker) => markers[marker] < 0);
  return {
    filename: options.filename || '',
    byteLength: buffer.byteLength,
    format: markers['hk_2010.2.0-r1'] >= 0 ? 'hk_2010.2.0-r1' : 'unknown',
    animationClass: markers.hkaSplineCompressedAnimation >= 0 ? 'hkaSplineCompressedAnimation' : 'unknown',
    bindingClass: markers.hkaAnimationBinding >= 0 ? 'hkaAnimationBinding' : 'unknown',
    rootMarker: markers['NPC Root [Root]'] >= 0 ? 'NPC Root [Root]' : null,
    markers,
    missingMarkers,
    acceptedForG22Bridge: missingMarkers.length === 0,
  };
}

export async function inspectSkyrimAnimationHkxFile(filename) {
  const bytes = await readFile(filename);
  return inspectSkyrimAnimationHkx(bytes, { filename: path.basename(filename) });
}

function isCliEntry() {
  if (!process.argv[1]) return false;
  return fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}

if (isCliEntry()) {
  const filename = process.argv[2];
  if (!filename) {
    console.error('Usage: node tools/skyrim-hkx-bridge/inspect-hkx.mjs <animation.hkx>');
    process.exitCode = 2;
  } else {
    try {
      const report = await inspectSkyrimAnimationHkxFile(filename);
      console.log(JSON.stringify(report, null, 2));
      if (!report.acceptedForG22Bridge) process.exitCode = 1;
    } catch (error) {
      console.error(error?.message || String(error));
      process.exitCode = 1;
    }
  }
}
