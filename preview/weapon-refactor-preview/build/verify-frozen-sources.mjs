// Every committed Skyrim source GLB is the one that was reviewed.
//
// WHY IT EXISTS: three workflows carried the same three sha256 literals inline, and a commit in
// this repository's own history rewrote those files (strip-presentation-meshes.mjs, taking 1.13 MB
// of unused presentation geometry out of them) without updating any of the three. They went red and
// stayed red - on main as well as on the branch - because nothing anyone runs locally checked them.
//
// So the hashes live in one file now, tools/skyrim-hkx-bridge/frozen-source-assets.json, and both
// the workflows and `npm test` read it. Updating a reviewed asset means updating that one record,
// deliberately, which is the point: these files are not build output, nothing regenerates them, and
// a silent change to one is a silent change to what the Guard state machine plays.
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MANIFEST = path.join(ROOT, 'tools/skyrim-hkx-bridge/frozen-source-assets.json');

export async function verifyFrozenSources() {
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
  const results = [];
  for (const entry of manifest.assets) {
    const file = path.join(ROOT, entry.file);
    let actual = null;
    let bytes = null;
    try {
      const contents = await readFile(file);
      bytes = (await stat(file)).size;
      actual = createHash('sha256').update(contents).digest('hex');
    } catch (error) {
      results.push({ ...entry, ok: false, reason: error.code === 'ENOENT' ? 'missing' : String(error.message) });
      continue;
    }
    const ok = actual === entry.sha256 && bytes === entry.bytes;
    results.push({ ...entry, actual, actualBytes: bytes, ok, reason: ok ? null : 'changed' });
  }
  return { results, ok: results.every((result) => result.ok) };
}

function isCliEntry() {
  if (!process.argv[1]) return false;
  return fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}

if (isCliEntry()) {
  const { results, ok } = await verifyFrozenSources();
  for (const result of results) {
    console.log(`${result.ok ? 'ok  ' : 'FAIL'} ${result.file} · ${result.sha256.slice(0, 12)}…`
      + (result.ok ? ` · ${result.bytes} bytes` : ` · ${result.reason}${result.actual ? ` (found ${result.actual.slice(0, 12)}…, ${result.actualBytes} bytes)` : ''}`));
  }
  if (!ok) {
    console.error('\nFAIL · a frozen source asset changed. If the change was intended, update '
      + 'tools/skyrim-hkx-bridge/frozen-source-assets.json and say why in the commit.');
    process.exit(1);
  }
  console.log(`\nPASS · ${results.length} frozen source assets are byte-for-byte what was reviewed`);
}
