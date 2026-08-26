export function installStudioSkyrimBridgeControls() {
  const sourceSelect = document.getElementById('animationPackSource');
  if (sourceSelect && typeof sourceSelect.querySelector === 'function'
      && !sourceSelect.querySelector('option[value="skyrim"]')) {
    const option = document.createElement('option');
    option.value = 'skyrim';
    option.textContent = 'Skyrim Guard Probe';
    sourceSelect.appendChild(option);
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
