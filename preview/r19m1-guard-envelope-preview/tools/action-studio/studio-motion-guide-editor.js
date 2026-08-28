import { createAdvancingVerticalChopTemplate } from '../../src/animation/action-templates.js';
import {
  createAdvancingVerticalChopGuide,
  isWholeBodyMotionGuide,
  normalizeMotionGuide,
} from '../../src/animation/motion-guide-schema.js';

const CONTROL_DEFINITIONS = Object.freeze([
  { key: 'stepDistance', label: 'Step distance', min: 0, max: 1.2, step: 0.01, suffix: 'm' },
  { key: 'crouchDepth', label: 'Crouch depth', min: 0, max: 60, step: 1, suffix: '°' },
  { key: 'forwardLean', label: 'Forward lean', min: 0, max: 40, step: 1, suffix: '°' },
  { key: 'windupHeight', label: 'Windup height', min: 0.9, max: 2, step: 0.01, suffix: 'm' },
  { key: 'windupPullback', label: 'Windup pullback', min: 0, max: 0.5, step: 0.01, suffix: 'm' },
  { key: 'windupLoad', label: 'Windup body load', min: 0, max: 1, step: 0.01, suffix: '' },
  { key: 'impactHeight', label: 'Impact height', min: 0.5, max: 2, step: 0.01, suffix: 'm' },
  { key: 'cutPlaneOffset', label: 'Cut-plane offset', min: -35, max: 35, step: 1, suffix: '°' },
  { key: 'coupling', label: 'Readability coupling', min: 0, max: 1, step: 0.01, suffix: '' },
  { key: 'secondaryGripWeight', label: 'Off-hand grip weight', min: 0, max: 1, step: 0.01, suffix: '' },
]);

function displayValue(value, definition) {
  const decimals = Number(definition.step) < 1 ? 2 : 0;
  return `${Number(value).toFixed(decimals)}${definition.suffix}`;
}

function renderSlider(definition, guide) {
  return `<label class="motion-guide-control">
    <span>${definition.label}</span><output data-guide-output="${definition.key}">${displayValue(guide[definition.key], definition)}</output>
    <input data-guide-key="${definition.key}" type="range" min="${definition.min}" max="${definition.max}" step="${definition.step}" value="${guide[definition.key]}">
  </label>`;
}

function constraintSummary(guide, report) {
  const parts = [];
  if (guide.windupTarget && report?.windupTarget) parts.push(`Windup ${Math.round(report.windupAfterError * 100)}cm`);
  else parts.push(guide.windupTarget ? 'Windup pending bake' : 'Windup fit off');
  parts.push(guide.footLock ? 'Lead foot locked' : 'Foot lock off');
  if (guide.twoHandGrip && report?.twoHandGrip) parts.push(`2H grip ${Math.round(report.afterError * 100)}cm avg`);
  else parts.push(guide.twoHandGrip ? '2H grip pending bake' : 'Single-hand mode');
  return parts.join(' · ');
}

export function createStudioMotionGuideEditor({
  overlay,
  applyProject,
  bakeProject,
  getFrame,
  onStatus,
}) {
  const host = document.getElementById('wholeBodyMotionEditor');
  let guide = null;
  let dirty = false;
  let constraintReport = null;

  function renderInactive() {
    host.innerHTML = `<p class="motion-guide-intro">Create an advancing vertical chop from linked hand, head, center-of-mass, and foot targets.</p>
      <button id="createVerticalChop" class="primary motion-guide-create">Create Advancing Chop</button>`;
    document.getElementById('createVerticalChop').addEventListener('click', () => {
      guide = createAdvancingVerticalChopGuide();
      bakeCurrentGuide(guide.plantFrame, 'Created an advancing vertical chop with draggable whole-body guides.');
    });
  }

  function syncControlValues() {
    if (!guide) return;
    host.querySelectorAll('[data-guide-key]').forEach((control) => {
      const value = guide[control.dataset.guideKey];
      if (control.type === 'checkbox') control.checked = Boolean(value);
      else control.value = value;
    });
    const leadFoot = document.getElementById('motionLeadFoot');
    if (leadFoot) leadFoot.value = guide.leadFoot;
    CONTROL_DEFINITIONS.forEach((definition) => {
      const output = host.querySelector(`[data-guide-output="${definition.key}"]`);
      if (output) output.textContent = displayValue(guide[definition.key], definition);
    });
  }

  function markDirty(message = 'Guides changed · Bake Pose Keys to apply') {
    dirty = true;
    constraintReport = null;
    const status = document.getElementById('wholeBodyMotionStatus');
    if (status) {
      status.textContent = message;
      status.classList.add('pending');
    }
  }

  function acceptGuide(nextGuide, message) {
    guide = normalizeMotionGuide(nextGuide);
    overlay.setGuide(guide);
    syncControlValues();
    markDirty(message);
  }

  function updateGuideFromControls() {
    const next = { ...guide };
    host.querySelectorAll('[data-guide-key]').forEach((control) => {
      next[control.dataset.guideKey] = control.type === 'checkbox' ? control.checked : Number(control.value);
    });
    next.leadFoot = document.getElementById('motionLeadFoot').value;
    acceptGuide(next);
  }

  function bakeCurrentGuide(frame, message) {
    const baseProject = createAdvancingVerticalChopTemplate(guide);
    const baked = bakeProject?.(baseProject, guide) || { project: baseProject, report: null };
    applyProject(baked.project || baked, { seekFrame: frame });
    constraintReport = baked.report || constraintReport;
    dirty = false;
    renderActive();
    onStatus(`${message} ${constraintSummary(guide, constraintReport)}.`);
  }

  function renderActive() {
    host.innerHTML = `<div class="motion-guide-legend" aria-label="Motion guide legend">
        <span><i class="guide-windup"></i>Windup / load</span><span><i class="guide-hand"></i>Sword / impact</span>
        <span><i class="guide-head"></i>Head / gaze</span>
        <span><i class="guide-body"></i>Center of mass</span><span><i class="guide-foot"></i>Lead-foot plant</span>
        <span><i class="guide-grip"></i>Off-hand grip</span>
      </div>
      <p class="motion-guide-drag-hint">Drag the orange windup ring to stage the overhead load. Yellow, pink, and green control impact, center of mass, and foot plant.</p>
      <div class="motion-guide-grid">
        <label class="motion-guide-select"><span>Lead foot</span><select id="motionLeadFoot"><option value="L"${guide.leadFoot === 'L' ? ' selected' : ''}>Left</option><option value="R"${guide.leadFoot === 'R' ? ' selected' : ''}>Right</option></select></label>
        <label class="motion-guide-number"><span>Plant frame</span><input data-guide-key="plantFrame" type="number" min="8" max="${guide.impactFrame - 1}" step="1" value="${guide.plantFrame}"></label>
        <label class="motion-guide-number"><span>Impact frame</span><input data-guide-key="impactFrame" type="number" min="10" max="${guide.durationFrames - 7}" step="1" value="${guide.impactFrame}"></label>
        <label class="motion-guide-number"><span>Duration</span><input data-guide-key="durationFrames" type="number" min="24" max="72" step="1" value="${guide.durationFrames}"></label>
        ${CONTROL_DEFINITIONS.map((definition) => renderSlider(definition, guide)).join('')}
      </div>
      <div class="motion-guide-toggles">
        <label class="check"><input data-guide-key="windupTarget" type="checkbox"${guide.windupTarget ? ' checked' : ''}> Fit sword hand to windup target</label>
        <label class="check"><input data-guide-key="footLock" type="checkbox"${guide.footLock ? ' checked' : ''}> Lock lead foot from plant through follow-through</label>
        <label class="check"><input data-guide-key="twoHandGrip" type="checkbox"${guide.twoHandGrip ? ' checked' : ''}> Fit off-hand to sword secondary grip</label>
        <label class="check"><input data-guide-key="visible" type="checkbox"${guide.visible ? ' checked' : ''}> Show linked targets in the stage</label>
      </div>
      <div class="button-grid two motion-guide-actions"><button id="resetVerticalChop">Reset guides</button><button id="bakeVerticalChop" class="primary">Bake Constraints + Pose Keys</button></div>
      <div id="wholeBodyMotionStatus" class="status-line${dirty ? ' pending' : ''}">${dirty ? 'Guides changed · Bake Pose Keys to apply' : constraintSummary(guide, constraintReport)}</div>`;

    host.querySelectorAll('[data-guide-key]').forEach((control) => {
      control.addEventListener('input', updateGuideFromControls);
      control.addEventListener('change', () => renderActive());
    });
    document.getElementById('motionLeadFoot').addEventListener('change', () => {
      updateGuideFromControls();
      renderActive();
    });
    document.getElementById('resetVerticalChop').addEventListener('click', () => {
      acceptGuide(createAdvancingVerticalChopGuide());
      renderActive();
    });
    document.getElementById('bakeVerticalChop').addEventListener('click', () => {
      bakeCurrentGuide(getFrame(), 'Windup load, whole-body targets, foot lock, and grip constraint baked into Pose Keys.');
    });
  }

  function setClip(clip) {
    const storedGuide = clip?.metadata?.motionGuide;
    guide = isWholeBodyMotionGuide(storedGuide) ? normalizeMotionGuide(storedGuide) : null;
    constraintReport = clip?.metadata?.motionGuideBake || null;
    dirty = false;
    overlay.setGuide(guide);
    if (guide) renderActive();
    else renderInactive();
  }

  overlay.setGuideChangeHandler((nextGuide, details) => {
    const label = details.target === 'windup'
      ? 'Windup target'
      : details.target === 'plant'
        ? 'Plant target'
        : details.target === 'impact'
          ? 'Impact target'
          : 'Center-of-mass target';
    acceptGuide(nextGuide, `${label} moved · Bake Pose Keys to apply`);
  });

  return {
    setClip,
    get guide() { return guide ? { ...guide } : null; },
    get dirty() { return dirty; },
    get constraintReport() { return constraintReport ? { ...constraintReport } : null; },
  };
}
