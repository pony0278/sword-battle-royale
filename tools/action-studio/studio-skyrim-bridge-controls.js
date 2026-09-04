// The Skyrim packs the page can load. Added here rather than written into index.template.html so
// the option list cannot drift from the sources the controller actually knows how to fetch.
const SKYRIM_PACK_OPTIONS = Object.freeze([
  Object.freeze({ value: 'skyrim', label: 'Skyrim Guard Probe' }),
  Object.freeze({ value: 'greatsword', label: 'Skyrim Greatsword' }),
]);

export function installStudioSkyrimBridgeControls() {
  const sourceSelect = document.getElementById('animationPackSource');
  if (sourceSelect && typeof sourceSelect.querySelector === 'function') {
    for (const { value, label } of SKYRIM_PACK_OPTIONS) {
      if (sourceSelect.querySelector(`option[value="${value}"]`)) continue;
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      sourceSelect.appendChild(option);
    }
  }

  if (document.getElementById('importSkyrimConverted')) return;
  const loadButton = document.getElementById('loadKayKitAnimations');
  const parent = loadButton?.parentElement;
  if (!loadButton || !parent || typeof parent.insertBefore !== 'function') return;

  const importButton = document.createElement('button');
  importButton.id = 'importSkyrimConverted';
  importButton.type = 'button';
  importButton.textContent = 'Import converted Skyrim GLB';
  importButton.title = 'G2.2: load a local self-contained Skyrim source GLB, retarget it to the Action Studio Blockman rig, and keep the experimental asset out of Git.';

  const fileInput = document.createElement('input');
  fileInput.id = 'skyrimConvertedFile';
  fileInput.type = 'file';
  fileInput.accept = '.glb,model/gltf-binary';
  fileInput.hidden = true;

  parent.insertBefore(importButton, loadButton.nextSibling);
  parent.insertBefore(fileInput, importButton.nextSibling);
}
