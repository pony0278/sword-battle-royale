import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { ClipPlayer } from '../src/animation/clip-player.js';
import { AnimationState } from '../src/animation/animation-state.js';
import {
  createCounterTemplate,
  createParryTemplate,
  createSlashTestTemplate,
} from '../src/animation/action-templates.js';
import { importLegacyPunchSnapshot } from '../src/animation/legacy-punch-import.js';
import { createBlockCharacter } from '../src/character/block-character.js';
import { createBlockRig } from '../src/character/block-rig.js';
import { createDebugSword, mountDebugSword } from '../src/character/debug-sword.js';
import { KAYKIT_GUARD_REVIEW_CLIPS } from '../src/combat/kaykit-guard-source-review.js';

test('slash, parry and counter templates expose required authoring metadata', () => {
  const slash = createSlashTestTemplate();
  const parry = createParryTemplate();
  const counter = createCounterTemplate();
  assert.deepEqual(slash.clip.timeline.filter((key) => key.impact).map((key) => key.frame), [14]);
  assert.deepEqual(slash.clip.timeline.filter((key) => key.cancel).map((key) => key.frame), [26]);
  assert.deepEqual(slash.action.windows.weaponTrail[0], {
    startFrame: 9,
    endFrame: 19,
    label: 'sword trail',
  });
  assert.equal(parry.action.windows.parry[0].startFrame, 3);
  assert.equal(counter.clip.timeline.some((key) => key.name === 'counter_impact' && key.impact), true);
});

test('clip player and animation state remain presentation-only consumers', () => {
  const slash = createSlashTestTemplate().clip;
  const player = new ClipPlayer();
  const state = new AnimationState({ [slash.id]: slash });
  const result = state.applyActionState({ actionId: slash.id, frame: 14, playing: false }, player);
  assert.equal(player.clip.id, 'slash_test');
  assert.equal(result.frame, 14);
  assert.equal('hitResult' in result, false);
});

test('legacy importer ignores carry preview axes and preserves arbitrary metadata', () => {
  const result = importLegacyPunchSnapshot({
    version: 4,
    seq: [
      { name: 'guard_enter', frame: 0, tag: 'guard_enter' },
      { name: 'parry_contact', frame: 5, tag: 'parry-window:v1', impact: true },
    ],
    phases: {
      guard_enter: { root_y: 10, carry_tilt: 90 },
      parry_contact: { root_y: 20, carry_ox: 2 },
    },
  });
  assert.deepEqual(result.report.ignoredPoseKeys, ['carry_ox', 'carry_tilt']);
  assert.equal(result.clip.timeline[1].tag, 'parry-window:v1');
  assert.equal('carry_tilt' in result.clip.poses.guard_enter, false);
});

test('Action Studio entry and module graph do not load legacy Punch scripts', async () => {
  const html = await readFile(new URL('../tools/action-studio/index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../tools/action-studio/action-studio.js', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /(?:src|href)=["'][^"']*\/ps\//i);
  assert.doesNotMatch(app, /tools\/ps|actor-brawler|state\.js/i);
  assert.match(html, /ACTION\s*<span>STUDIO/i);
});

test('combat feel A/B profiles are presentation-only and animation agnostic', async () => {
  const runtime = await readFile(new URL('../tools/action-studio/studio-preview-runtime.js', import.meta.url), 'utf8');
  const controller = await readFile(new URL('../tools/action-studio/studio-combat-feel-controller.js', import.meta.url), 'utf8');
  assert.match(runtime, /Light Slash/);
  assert.match(runtime, /Heavy Slash/);
  assert.match(runtime, /Perfect Parry/);
  assert.match(runtime, /attackerRecoil/);
  assert.match(runtime, /cameraKick/);
  assert.match(runtime, /releasePending/);
  assert.match(controller, /feelProfileA/);
  assert.match(controller, /feelProfileB/);
  assert.doesNotMatch(`${runtime}\n${controller}`, /Sword_Regular|Sword_Heavy_Combo|Sword_Attack|UAL1\/|UAL2\//);
});

test('G1 KayKit Guard Source Review exposes the four source clips and hold comparison modes', async () => {
  assert.deepEqual(KAYKIT_GUARD_REVIEW_CLIPS.map((entry) => entry.clipId), [
    'Melee_Block',
    'Melee_Blocking',
    'Melee_Block_Hit',
    'Melee_Block_Attack',
  ]);
  assert.equal(KAYKIT_GUARD_REVIEW_CLIPS.find((entry) => entry.clipId === 'Melee_Blocking')?.holdStrategy, 'authored-loop-candidate');

  const html = await readFile(new URL('../tools/action-studio/guard-source-review.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../tools/action-studio/guard-source-review.js', import.meta.url), 'utf8');
  assert.match(html, /G1 · KayKit Guard Source Review/);
  assert.match(html, /previewLoop/);
  assert.match(html, /holdEnd/);
  assert.match(html, /sampleTime/);
  assert.match(app, /packIds:\s*\['melee'\]/);
  assert.match(app, /sampleAnimation/);
  assert.doesNotMatch(`${html}\n${app}`, /attackDirection|incomingDirection|guardDirection/);
});

test('G3.6.3 keeps the static Guard surface while production preview exposes approved D full-recovery semantics', async () => {
  const template = await readFile(new URL('../tools/action-studio/index.template.html', import.meta.url), 'utf8');
  const html = await readFile(new URL('../tools/action-studio/index.html', import.meta.url), 'utf8');
  const externalController = await readFile(new URL('../tools/action-studio/studio-external-animation-controller.js', import.meta.url), 'utf8');
  const guardController = await readFile(new URL('../tools/action-studio/studio-guard-runtime-controller.js', import.meta.url), 'utf8');

  assert.match(externalController, /createStudioGuardRuntimeController/);
  for (const surface of [template, html]) {
    assert.equal((surface.match(/id="guardRuntimePanel"/g) || []).length, 1);
    assert.match(surface, /data-guard-runtime-static="true"/);
    assert.match(surface, /data-controller-bound="false"/);
    assert.match(surface, /data-guard-runtime="hold"/);
    assert.match(surface, /data-guard-runtime="block"/);
    assert.match(surface, /data-guard-runtime="parry"/);
    assert.match(surface, /data-guard-runtime="perfect"/);
    assert.match(surface, /data-guard-runtime="counter"/);
    assert.match(surface, /id="powerBashReadabilityLink"/);
    assert.match(surface, /power-bash-readability-lab\.html/);
    assert.match(surface, /Power Bash A\/B\/C|D Production|A\/B\/C\/D/);
    assert.doesNotMatch(surface, /data-template="(?:guard|parry|counter)"/);
  }

  assert.match(guardController, /resolveGuardPanel/);
  assert.match(guardController, /data-controller-bound/);
  assert.match(guardController, /data-guard-runtime-button-count/);
  assert.match(guardController, /PRODUCTION_PARRY_DEFLECT_STAGE/);
  assert.match(guardController, /blockhit-powerbash-full-recovery/);
  assert.match(guardController, /g363-blockhit-powerbash-full-recovery/);
  assert.match(guardController, /D Power Bash/);
  assert.match(guardController, /Full Recovery/);
  assert.match(guardController, /Parry Advantage/);
  assert.match(guardController, /data-guard-runtime-semantic/);
  assert.match(guardController, /freeAttackFollowupOpen/);
  assert.match(guardController, /Top \/ Left \/ Right/);
  assert.doesNotMatch(guardController, /loadKayKitAnimationLibrary/);
  assert.doesNotMatch(guardController, /Melee_Block_Attack/);
  assert.doesNotMatch(guardController, /GUARD_EVENTS\.COUNTER_CONFIRMED/);
  assert.doesNotMatch(guardController, /GUARD_WEAPON_MOUNT_PROFILE_IDS\.KAYKIT_DEFAULT/);
  assert.match(guardController, /GUARD_WEAPON_MOUNT_PROFILE_IDS\.SKYRIM_GUARD/);
});

test('Three-dependent character modules are importable without gameplay globals', () => {
  assert.equal(typeof createBlockCharacter, 'function');
  assert.equal(typeof createBlockRig, 'function');
  assert.equal(typeof createDebugSword, 'function');
  assert.equal(typeof mountDebugSword, 'function');
});
