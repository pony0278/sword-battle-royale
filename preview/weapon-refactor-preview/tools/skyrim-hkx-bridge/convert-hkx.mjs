// Skyrim HKX -> source GLB, with the settings this repository's bridge requires.
//
// The conversion itself is HavokLib's hk_to_gltf (see build-havok-toolset.sh, and handoff/45 for
// why the decoder is not ours). What lives here is the part that is this repository's business:
// which settings a source bake has to use, so that every pack lands on the same canonical
// hierarchy and stays comparable.
//
//   sample-rate  30    the manifest's fps, and what every committed source was baked at
//   visualize    false the game never draws the source; the bake should not carry a mesh
//   skeleton     the caller's, and it should be the one g2-3-1-input-manifest.json froze
//
// Those are written into the toolset's config rather than passed on the command line: hk_to_gltf
// announces "CLI option detected, config won't be loaded, all booleans set to false" the moment any
// flag appears, which would silently turn visualize back off-by-default and lose the sample rate.
//
// AND THE BAKE IS NOT THE ASSET. Two things happen to the tool's output before it is written, and
// both are here rather than in a README because the greatsword idle nearly shipped without them:
//
//   prune     an animation authored against an extended skeleton carries tracks for bones this
//             skeleton does not have, and the exporter numbers them off the end of the node array
//   validate  the same check the review harness runs, so a bake that would be refused later is
//             refused now, before it reaches a directory of accepted assets
//
// Usage:
//   node tools/skyrim-hkx-bridge/convert-hkx.mjs <skeleton.hkx> <animation.hkx> [outDir]
import { spawn } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pruneForeignAnimationTracks } from '../../build/prune-foreign-animation-tracks.mjs';
import { inspectRealBakePairFiles } from './real-bake-contract.mjs';
import { validateSkyrimSourceGlb } from './validate-source-glb.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOOLSET = process.env.HAVOK_TOOLSET
  || path.join(process.env.HAVOK_TOOLSET_ROOT || '/tmp/havok-toolset', 'HavokLib', 'build', 'spike', 'havok_toolset');

export const SOURCE_BAKE_SETTINGS = Object.freeze({
  sampleRate: 30,
  visualize: false,
  filenameAnims: true,
});

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${command} exited ${code}\n${out}`))));
  });
}

// Makes hk_to_gltf emit its default config. The module has to actually run for that, so it is
// pointed at a scratch file it will refuse; the refusal is the point, the config is the output.
async function seedToolsetConfig(configPath) {
  const seeding = path.join('/tmp', `hkx-seed-config-${process.pid}`);
  await mkdir(seeding, { recursive: true });
  const decoy = path.join(seeding, 'seed.hkx');
  await writeFile(decoy, '', 'utf8');
  await run(TOOLSET, ['hk_to_gltf', decoy], { cwd: path.dirname(TOOLSET) }).catch(() => {});
  if (!existsSync(configPath)) {
    throw new Error(`hk_to_gltf did not write ${configPath}; the toolset build may be incomplete`);
  }
}

export async function convertHkx(skeletonHkx, animationHkx, outDir = path.join(ROOT, 'assets')) {
  if (!existsSync(TOOLSET)) {
    throw new Error(`havok_toolset not built. Run tools/skyrim-hkx-bridge/build-havok-toolset.sh (looked in ${TOOLSET})`);
  }
  // The pair contract first: a bake from a mismatched skeleton is the failure that would be
  // hardest to see afterwards, because it produces a plausible animation on the wrong hierarchy.
  const pair = await inspectRealBakePairFiles(skeletonHkx, animationHkx);
  if (!pair.acceptedForRealBake) {
    throw new Error(`the pair was refused by real-bake-contract: ${JSON.stringify(pair.skeleton.missingBones)} / ${JSON.stringify(pair.animation.missingMarkers)}`);
  }

  const configPath = path.join(path.dirname(TOOLSET), 'havok_toolset.config');
  // A freshly built toolset has no config yet - hk_to_gltf writes its defaults the first time a
  // module runs, and only then. Without this, the first conversion after a rebuild died on a bare
  // ENOENT for a file the recipe never told anyone to create.
  if (!existsSync(configPath)) await seedToolsetConfig(configPath);
  const config = await readFile(configPath, 'utf8');
  await writeFile(configPath, config
    .replace(/sample-rate="\d+"/, `sample-rate="${SOURCE_BAKE_SETTINGS.sampleRate}"`)
    .replace(/visualize="(true|false)"/, `visualize="${SOURCE_BAKE_SETTINGS.visualize}"`)
    .replace(/filename-anims="(true|false)"/, `filename-anims="${SOURCE_BAKE_SETTINGS.filenameAnims}"`)
    .replace(/skeleton-path="[^"]*"/, `skeleton-path="${path.resolve(skeletonHkx)}"`), 'utf8');

  // The tool writes its output beside the input, so the animation is staged where it can be found.
  const staging = path.join('/tmp', `hkx-convert-${process.pid}`);
  await mkdir(staging, { recursive: true });
  const stagedInput = path.join(staging, path.basename(animationHkx));
  await copyFile(animationHkx, stagedInput);
  await run(TOOLSET, ['hk_to_gltf', path.basename(stagedInput)], { cwd: staging });

  const produced = stagedInput.replace(/\.hkx$/i, '.glb');
  if (!existsSync(produced)) throw new Error(`hk_to_gltf produced no glb for ${animationHkx}`);

  // Then the two post-steps a committed source asset needs, in the order the guard pack's README
  // has always described them - except that the first one is new, and is here rather than in the
  // README because leaving it to a human is how the greatsword nearly shipped with 184 channels
  // pointing at nodes that do not exist.
  const pruned = pruneForeignAnimationTracks(await readFile(produced));
  const filename = `${path.basename(animationHkx).replace(/\.hkx$/i, '')}.source.glb`;
  const validation = validateSkyrimSourceGlb(pruned.buffer, { filename });
  if (!validation.acceptedForG23Review) {
    throw new Error(`the bake was refused by validate-source-glb: ${JSON.stringify({
      missingSemanticBones: validation.missingSemanticBones,
      danglingChannelCount: validation.danglingChannelCount,
      externalUris: validation.externalUris,
    })}`);
  }

  await mkdir(outDir, { recursive: true });
  const target = path.join(outDir, filename);
  await writeFile(target, pruned.buffer);
  return { target, pair, pruned, validation, settings: SOURCE_BAKE_SETTINGS };
}

function isCliEntry() {
  if (!process.argv[1]) return false;
  return fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}

if (isCliEntry()) {
  const [, , skeleton, animation, outDir] = process.argv;
  if (!skeleton || !animation) {
    console.error('Usage: node tools/skyrim-hkx-bridge/convert-hkx.mjs <skeleton.hkx> <animation.hkx> [outDir]');
    process.exitCode = 2;
  } else {
    try {
      const { target, pruned, settings } = await convertHkx(skeleton, animation, outDir);
      console.log(`wrote ${path.relative(ROOT, target)}  (fps ${settings.sampleRate}, visualize ${settings.visualize}, `
        + `${pruned.keptChannels} channels, ${pruned.removed} foreign tracks pruned)`);
    } catch (error) {
      console.error(error?.message || String(error));
      process.exitCode = 1;
    }
  }
}
