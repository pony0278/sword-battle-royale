import { POSE_KEYS } from '../../src/animation/pose-schema.js';
import { normalizeAnimationBinding } from '../../src/animation/animation-binding.js';
import { clipMarkerSummary } from '../../src/animation/animation-clip.js';
import { ACTION_WINDOW_TYPES } from '../../src/combat/action-definition.js';

const RAD_TO_DEG = 180 / Math.PI;

const POSE_GROUPS = Object.freeze([
  ['ROOT / TORSO / HEAD', (key) => key.startsWith('root_') || ['sq', 'body_scale', 'squat', 'spine_x', 'spine_y', 'pelvis_y', 'head_y', 'head_x', 'head_pz'].includes(key)],
  ['ARM L · SHOULDER / ELBOW / WRIST', (key) => key.startsWith('aL_') && !key.includes('_f')],
  ['ARM R · SHOULDER / ELBOW / WRIST', (key) => key.startsWith('aR_') && !key.includes('_f')],
  ['LEG L · HIP / KNEE / ANKLE', (key) => key.startsWith('lL_')],
  ['LEG R · HIP / KNEE / ANKLE', (key) => key.startsWith('lR_')],
  ['OPTIONAL FINGER POSE', (key) => key.startsWith('aL_f') || key.startsWith('aR_f')],
]);

function sliderSpec(key) {
  if (key === 'body_scale' || key.endsWith('_scale')) return [0.3, 3, 0.01];
  if (key.endsWith('_stretch')) return [0.4, 3, 0.01];
  if (key.endsWith('_idle')) return [0, 1, 0.01];
  if (key.endsWith('_contact')) return [0, 2, 1];
  if (key === 'root_pz') return [-0.4, 1.4, 0.01];
  if (key === 'root_py' || key === 'head_pz') return [-0.8, 0.8, 0.01];
  if (key === 'sq') return [-0.4, 0.4, 0.01];
  if (key === 'squat') return [0, 80, 1];
  if (key.includes('_f')) return [-120, 30, 1];
  return [-180, 180, 1];
}

export function renderTimelineView({ clip, frame, selectedKeyIndex, onSelect }) {
  const bar = document.getElementById('timelineBar');
  bar.querySelectorAll('.timeline-marker').forEach((node) => node.remove());
  const keysHost = document.getElementById('timelineKeys');
  keysHost.innerHTML = '';
  const duration = Math.max(1, clip.durationFrames);
  clip.timeline.forEach((key, index) => {
    const marker = document.createElement('button');
    marker.className = `timeline-marker${key.impact ? ' impact' : ''}${key.cancel ? ' cancel' : ''}${index === selectedKeyIndex ? ' selected' : ''}`;
    marker.style.left = `${(key.frame / duration) * 100}%`;
    marker.title = `${key.name} @ ${key.frame}f · ${key.tag}`;
    marker.innerHTML = `<span>${index}</span>`;
    marker.addEventListener('click', () => onSelect(index));
    bar.appendChild(marker);

    const button = document.createElement('button');
    button.className = `${index === selectedKeyIndex ? 'on ' : ''}${key.impact ? 'impact ' : ''}${key.cancel ? 'cancel' : ''}`;
    button.textContent = `${key.frame}f ${key.name}`;
    button.addEventListener('click', () => onSelect(index));
    keysHost.appendChild(button);
  });
  const markers = clipMarkerSummary(clip);
  document.getElementById('timelineSummary').textContent = `${clip.durationFrames}f · Impact ${markers.impacts.join(', ') || '—'} · Cancel ${markers.cancels.join(', ') || '—'}`;
  const scrub = document.getElementById('timelineScrub');
  scrub.max = Math.max(1, clip.durationFrames);
  scrub.value = frame;
  updateTimelineReadoutView(clip, frame);
}

export function updateTimelineReadoutView(clip, frame) {
  const duration = Math.max(1, clip?.durationFrames || 1);
  document.getElementById('timelineScrub').value = frame;
  document.getElementById('frameNow').textContent = `${Number(frame).toFixed(2)}f`;
  document.getElementById('timelinePlayhead').style.left = `${Math.min(100, (frame / duration) * 100)}%`;
}

export function renderKeyEditorView(clip, selectedKeyIndex) {
  const key = clip.timeline[selectedKeyIndex];
  document.getElementById('keyName').value = key.name;
  document.getElementById('keyFrame').value = key.frame;
  document.getElementById('keyEase').value = key.ease;
  document.getElementById('keyTag').value = key.tag;
  document.getElementById('keyImpact').checked = key.impact;
  document.getElementById('keyCancel').checked = key.cancel;
  document.getElementById('deleteKey').disabled = clip.timeline.length <= 1;
}

export function renderPoseControlsView({ clip, selectedKeyIndex, onInput }) {
  const host = document.getElementById('poseControls');
  host.innerHTML = '';
  const keyframe = clip.timeline[selectedKeyIndex];
  const pose = clip.poses[keyframe.name];
  for (const [title, matches] of POSE_GROUPS) {
    const keys = POSE_KEYS.filter(matches);
    const details = document.createElement('details');
    details.className = 'pose-group';
    details.open = title.includes('ROOT') || title.includes('ARM R');
    details.innerHTML = `<summary>${title}</summary>`;
    const gridHost = document.createElement('div');
    gridHost.className = 'pose-grid';
    for (const poseKey of keys) {
      const [min, max, step] = sliderSpec(poseKey);
      const label = document.createElement('label');
      label.textContent = poseKey;
      const range = document.createElement('input');
      range.type = 'range';
      range.min = min;
      range.max = max;
      range.step = step;
      range.value = pose[poseKey];
      const output = document.createElement('output');
      output.textContent = Number(pose[poseKey]).toFixed(step < 1 ? 2 : 0);
      range.addEventListener('input', () => {
        const value = Number(range.value);
        output.textContent = value.toFixed(step < 1 ? 2 : 0);
        onInput({ keyframe, poseKey, value });
      });
      gridHost.append(label, range, output);
    }
    details.appendChild(gridHost);
    host.appendChild(details);
  }
}

export function renderWindowEditorView({ action, clip, onChange }) {
  const host = document.getElementById('windowEditor');
  host.innerHTML = '';
  for (const type of ACTION_WINDOW_TYPES) {
    const window = action.windows[type][0] || null;
    const row = document.createElement('div');
    row.className = 'window-row';
    row.innerHTML = `
      <label><input type="checkbox" ${window ? 'checked' : ''}>${type}</label>
      <label>start <input type="number" min="0" max="${clip.durationFrames}" step="1" value="${window?.startFrame ?? 0}"></label>
      <label>end <input type="number" min="0" max="${clip.durationFrames}" step="1" value="${window?.endFrame ?? 0}"></label>`;
    const [enabled, start, end] = row.querySelectorAll('input');
    const commit = () => onChange({
      type,
      enabled: enabled.checked,
      startFrame: Number(start.value),
      endFrame: Number(end.value),
      label: window?.label || '',
    });
    enabled.addEventListener('change', commit);
    start.addEventListener('input', commit);
    end.addEventListener('input', commit);
    host.appendChild(row);
  }
}

export function renderMountEditorView({ mountCalibration, onChange }) {
  const host = document.getElementById('mountEditor');
  host.innerHTML = '<span></span><b>X</b><b>Y</b><b>Z</b>';
  const rows = [
    ['position', mountCalibration.position, 1],
    ['rotation °', mountCalibration.rotation, RAD_TO_DEG],
    ['scale', mountCalibration.scale, 1],
  ];
  rows.forEach(([label, values, factor]) => {
    const rowLabel = document.createElement('span');
    rowLabel.textContent = label;
    host.appendChild(rowLabel);
    ['x', 'y', 'z'].forEach((axis) => {
      const input = document.createElement('input');
      input.type = 'number';
      input.step = label === 'rotation °' ? '1' : '0.01';
      input.value = Number(values[axis] * factor).toFixed(label === 'rotation °' ? 0 : 2);
      input.addEventListener('input', () => {
        const raw = Number(input.value);
        if (Number.isFinite(raw)) onChange({ label, axis, raw });
      });
      host.appendChild(input);
    });
  });
}

export function renderLibraryView({ library, onLoad, onQueue, onDelete }) {
  const host = document.getElementById('clipLibrary');
  host.innerHTML = '';
  const names = Object.keys(library).sort();
  if (!names.length) {
    host.innerHTML = '<div class="status-line">Library is empty. Save the current action to begin.</div>';
    return;
  }
  names.forEach((name) => {
    const row = document.createElement('div');
    row.className = 'library-row';
    row.innerHTML = `<span>${name}</span>`;
    const load = document.createElement('button');
    load.textContent = 'Load';
    load.addEventListener('click', () => onLoad(name, library[name]));
    const queue = document.createElement('button');
    queue.textContent = '+ Combo';
    queue.addEventListener('click', () => onQueue(name, library[name]));
    const remove = document.createElement('button');
    remove.textContent = 'Delete';
    remove.addEventListener('click', () => onDelete(name));
    row.append(load, queue, remove);
    host.appendChild(row);
  });
}

export function renderComboQueueView(comboQueue) {
  const host = document.getElementById('comboQueue');
  host.textContent = comboQueue.length
    ? comboQueue.map((entry, index) => `${index + 1}. ${entry.name}`).join('  →  ')
    : 'queue is empty';
}

export function renderAnimationBindingView({ action, clip, available }) {
  const binding = normalizeAnimationBinding(action.animationBinding, clip.id);
  document.getElementById('animationBindingSpeed').value = binding.speed.toFixed(3);
  document.getElementById('animationBindingOffset').value = binding.startOffsetSeconds.toFixed(3);
  document.getElementById('animationBindingInPlace').checked = binding.inPlace;
  document.getElementById('animationBindingLoop').checked = binding.loop;
  const status = document.getElementById('animationBindingStatus');
  status.classList.toggle('pending', binding.source !== 'authored' && !available);
  status.textContent = binding.source === 'authored'
    ? `Pose keys drive ${clip.id}`
    : `${binding.clipId} · ${binding.speed.toFixed(3)}× · offset ${binding.startOffsetSeconds.toFixed(3)}s · ${available ? 'timeline bound' : 'saved, pack not loaded'}`;
}

export function readAnimationBindingView(source = 'kaykit') {
  return {
    source,
    clipId: document.getElementById('kaykitClip').value,
    speed: Number(document.getElementById('animationBindingSpeed').value),
    startOffsetSeconds: Number(document.getElementById('animationBindingOffset').value),
    inPlace: document.getElementById('animationBindingInPlace').checked,
    loop: document.getElementById('animationBindingLoop').checked,
  };
}
