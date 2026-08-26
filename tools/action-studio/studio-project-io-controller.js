import { importLegacyPunchSnapshot } from '../../src/animation/legacy-punch-import.js';
import {
  createStudioAutosave,
  readStoredJson,
  serializeStudioProject,
  studioProjectFilename,
  writeStoredJson,
} from './studio-project.js';

export const ACTION_STUDIO_AUTOSAVE_KEY = 'ACTION_STUDIO_AUTOSAVE_V1';

function describeSavedAt(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : 'unknown time';
}

export function createStudioProjectIoController(options) {
  const {
    getProject,
    applyProject,
    onStatus,
    storage = localStorage,
  } = options;
  let autosaveTimer = 0;

  function setStatus(message, error = false) {
    onStatus?.(message, error);
  }

  function updateAutosaveStatus() {
    const host = document.getElementById('autosaveStatus');
    if (!host) return;
    const autosave = readStoredJson(storage, ACTION_STUDIO_AUTOSAVE_KEY, null);
    host.textContent = autosave?.project
      ? `Auto backup · ${describeSavedAt(autosave.savedAt)} · ${autosave.reason}`
      : 'Auto backup starts after your first edit or Capture.';
  }

  function syncText() {
    const text = serializeStudioProject(getProject());
    const textarea = document.getElementById('projectJson');
    textarea.value = text;
    return text;
  }

  function saveAutosave(reason = 'edit') {
    const autosave = createStudioAutosave(getProject(), reason);
    writeStoredJson(storage, ACTION_STUDIO_AUTOSAVE_KEY, autosave);
    updateAutosaveStatus();
    return autosave;
  }

  function scheduleAutosave(reason = 'edit', delay = 320) {
    window.clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(() => saveAutosave(reason), delay);
  }

  function importData(input, sourceLabel = 'JSON text') {
    let data = input;
    if (data?.format === 'action-studio-autosave' && data.project) data = data.project;
    if (data?.format === 'action-studio-project' && data.clip) {
      applyProject(data);
    } else if (data?.format === 'action-studio-clip' || (data?.timeline && data?.poses)) {
      applyProject({ clip: data });
    } else if (data?.seq || data?.SEQ || data?.phases || data?.PHASES) {
      const result = importLegacyPunchSnapshot(data);
      applyProject({ clip: result.clip });
      setStatus(`Imported legacy Punch snapshot from ${sourceLabel}. Ignored editor-only keys: ${result.report.ignoredPoseKeys.join(', ') || 'none'}.`);
      return result;
    } else {
      throw new Error('Unknown project shape');
    }
    setStatus(`Imported Action Studio project from ${sourceLabel}.`);
    return data;
  }

  function importText(text, sourceLabel) {
    try {
      return importData(JSON.parse(text), sourceLabel);
    } catch (error) {
      setStatus(`Import failed: ${error.message}`, true);
      return null;
    }
  }

  document.getElementById('exportProject')?.addEventListener('click', () => {
    const text = syncText();
    document.getElementById('projectJson').select();
    navigator.clipboard?.writeText(text).catch(() => {});
    setStatus('Project JSON copied and shown below.');
  });
  document.getElementById('downloadProject')?.addEventListener('click', () => {
    const project = getProject();
    const text = serializeStudioProject(project);
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = studioProjectFilename(project);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    syncText();
    saveAutosave('download JSON snapshot');
    setStatus(`Downloaded ${anchor.download}.`);
  });
  document.getElementById('importProject')?.addEventListener('click', () => {
    importText(document.getElementById('projectJson').value, 'JSON text');
  });
  document.getElementById('openProjectFile')?.addEventListener('click', () => {
    document.getElementById('projectFileInput').click();
  });
  document.getElementById('projectFileInput')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    importText(await file.text(), file.name);
    event.target.value = '';
  });
  document.getElementById('restoreAutosave')?.addEventListener('click', () => {
    const autosave = readStoredJson(storage, ACTION_STUDIO_AUTOSAVE_KEY, null);
    if (!autosave?.project) {
      setStatus('No Action Studio auto backup exists yet.', true);
      return;
    }
    applyProject(autosave.project);
    syncText();
    setStatus(`Restored auto backup from ${describeSavedAt(autosave.savedAt)}.`);
  });

  updateAutosaveStatus();
  return { syncText, saveAutosave, scheduleAutosave, importData, updateAutosaveStatus };
}
