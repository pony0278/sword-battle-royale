import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnimationClip } from '../src/animation/animation-clip.js';
import { captureNextBlockingKey } from '../tools/action-studio/studio-blocking-workflow.js';
import {
  createStudioAutosave,
  createStudioProject,
  serializeStudioProject,
  studioProjectFilename,
} from '../tools/action-studio/studio-project.js';

function makeClip() {
  return createAnimationClip({
    id: 'heroic_chop',
    name: 'Heroic Chop',
    fps: 60,
    timeline: [
      { name: 'ready', frame: 0, ease: 'lin' },
      { name: 'windup', frame: 9, ease: 'out' },
      { name: 'impact', frame: 12, ease: 'in', impact: true },
    ],
    poses: {
      ready: { root_py: 0 },
      windup: { root_py: 0.18, aR_sx: -112 },
      impact: { root_py: -0.12, aR_sx: 52 },
    },
  });
}

test('Capture Next Key preserves the current pose and clears gameplay markers', () => {
  const clip = makeClip();
  const result = captureNextBlockingKey(clip, 1, clip.poses.windup, { frameStep: 4 });
  const captured = clip.timeline.find((key) => key.name === result.name);
  assert.equal(result.frame, 13);
  assert.equal(captured.tag, 'blocking');
  assert.equal(captured.impact, false);
  assert.equal(captured.cancel, false);
  assert.equal(clip.poses[result.name].root_py, clip.poses.windup.root_py);
  assert.equal(clip.poses[result.name].aR_sx, clip.poses.windup.aR_sx);
  assert.notEqual(clip.poses[result.name], clip.poses.windup);
});

test('Capture Next Key shifts later keys when the requested blocking gap is occupied', () => {
  const clip = makeClip();
  const result = captureNextBlockingKey(clip, 1, clip.poses.windup, { frameStep: 4 });
  assert.equal(clip.timeline.find((key) => key.name === 'impact').frame, 16);
  assert.equal(clip.timeline[2].name, result.name);
  assert.equal(clip.timeline[3].name, 'impact');
});

test('Action Studio project snapshots serialize all pose and combat authoring data', () => {
  const clip = makeClip();
  const project = createStudioProject({
    clip,
    action: { id: clip.id, clipId: clip.id, windows: { active: [{ startFrame: 10, endFrame: 12 }] } },
    weaponMount: { position: { x: 0, y: 0, z: 0 } },
  });
  const text = serializeStudioProject(project);
  const parsed = JSON.parse(text);
  assert.equal(parsed.format, 'action-studio-project');
  assert.equal(parsed.clip.poses.windup.aR_sx, -112);
  assert.equal(parsed.action.windows.active[0].startFrame, 10);
  assert.equal(
    studioProjectFilename(project, new Date('2026-08-16T03:04:05.000Z')),
    'heroic_chop_2026-08-16_03-04-05-000.json',
  );
  const autosave = createStudioAutosave(project, 'Capture Next Key', '2026-08-16T03:04:05.000Z');
  assert.equal(autosave.project.clip.id, 'heroic_chop');
  assert.equal(autosave.reason, 'Capture Next Key');
  assert.notEqual(autosave.project, project);
});
