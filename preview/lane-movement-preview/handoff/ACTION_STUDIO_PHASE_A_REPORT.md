# Action Studio Phase A Report

## Outcome

Phase A, **Extract Action Character Core**, is implemented as browser-native ES modules. The new Action Studio entry is `tools/action-studio/index.html`; `tools/punch-studio.html` redirects to it. The legacy entry remains available as `tools/punch-studio.legacy.html` and continues to use the untouched `tools/ps/` sources.

## Acceptance coverage

- Procedural Block Character with ROOT, PELVIS, SPINE, HEAD and bilateral shoulder/elbow/wrist/hip/knee/ankle hierarchy.
- Pose application is independent of old game state, avatar, parts and simulation modules.
- `POSE_KEYS` is the single source of truth; carry-only axes exist only in the compatibility report list.
- T-pose, Idle and Slash Test templates.
- Guard, Parry and Counter authoring templates with arbitrary timeline names.
- Timeline scrub, play, slow motion, loop, key select/add/duplicate/delete/rename/frame edit, ease/tag, impact and cancel editing.
- Generic action windows for active, cancel, movement, weapon trail and parry metadata.
- Required `HAND_L`, `HAND_R`, `HEAD`, `BACK`, `HIP_L` and `HIP_R` sockets.
- Debug sword mounted to `HAND_R`, editable local position/rotation/scale calibration and localStorage persistence.
- Weapon-trail, hitstop, camera-shake, dummy-knockback and impact-flash presentation previews.
- Generic local clip library and combo preview.
- Legacy Punch snapshot importer preserves humanoid axes/timeline metadata and reports ignored `carry_*` fields.
- The Action Studio module graph does not load `tools/ps`, `actor-brawler.js` or `state.js`.

## Verification

`npm test` passes 12/12 tests:

- Pose normalization.
- Pose interpolation and limb lag.
- Timeline normalization with arbitrary key/tag names.
- Clip evaluation.
- Action window normalization.
- Required socket existence.
- `HAND_R` weapon attachment and local calibration contract.
- Slash/Parry/Counter template metadata.
- Clip Player / Animation State presentation boundary.
- Legacy carry-axis compatibility behavior.
- No-legacy-import entry/module boundary.
- Three-dependent character module import safety.

Additional checks:

- `node --check tools/action-studio/action-studio.js` passes.
- Local HTTP requests for the Action Studio page, its main module and the action-template module return status 200.

## Environment limitation

The in-app browser automation runtime failed to initialize four times with the host error `windows sandbox failed: helper_unknown_error: setup refresh had errors`. Therefore an automated visual click-through/screenshot was not completed in this session. This is not reported as a visual pass. The deterministic tests, module-boundary test, syntax check and local HTTP checks did complete.

## Recorded source differences

- The legacy executable has 66 pose keys even though comments document 47/51.
- Carry-only keys are excluded from the new humanoid core.
- `actor-brawler.js`, old `state.js`, game runtime/assets and prior tests were absent, so actor-brawler visual cross-checking was not possible.
- The old `applyPose` combines humanoid transforms with carry/jump/avatar/finger preview callbacks; the new core keeps those concerns separate.

See `ACTION_STUDIO_EXTRACTION_PLAN.md` for the full dependency map and compatibility strategy.

