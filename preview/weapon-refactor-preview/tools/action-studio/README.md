# Action Studio entry files

- `index.template.html` and `action-studio.js` are the editable source entry points.
- `index.html` and `action-studio.bundle.js` are generated standalone files.
- Run `npm run build:action-studio` after changing `src/`, `action-studio.js` or the HTML template.

The entry file is a composition root. Its extracted responsibilities live in:

- `studio-preview-runtime.js` — Three.js scene, camera, trail and hit-feel preview.
- `studio-editor-view.js` — editor DOM rendering and animation-binding controls.
- `studio-project.js` — project serialization, local storage and combo-project assembly.
- `studio-motion-guide-editor.js` — semantic whole-body controls and Pose Key baking.
- `studio-motion-guide-overlay.js` — draggable windup, impact, center-of-mass, and foot targets in the Three.js stage.
- `studio-pose-drag-controller.js` — direct hand/foot manipulators, foot pins, live whole-body solving, and selected Pose Key commits.
- `studio-blocking-workflow.js` — one-click next-key capture, adjacent-key onion skins, and sampled palm / sword-tip trajectories.
- `studio-project-io-controller.js` — JSON copy/download/file import plus recoverable local autosaves.
- `studio-motion-constraint-baker.js` — editor-only sword-hand windup fitting and off-hand fitting against the procedural sword's secondary grip.
- `studio-external-animation-controller.js` — KayKit loading plus UAL1/UAL2/Skyrim sword-clip retarget, preview, fit and JSON binding.
- `skyrim-guard-visual-review.html` — G2.3 dedicated first-real-bake review for `SKYRIM_GUARD/shd_blockidle`, including local source-GLB import, Front/3-quarter/Side/Back views, loop-seam metrics, and ADOPT decision gates.

Action motion is driven by `src/animation/action-motion-player.js`. Every action owns a normalized `animationBinding`: `authored` uses Action Studio pose keys, while `kaykit`, `ual1`, `ual2`, and `skyrim` reference a clip by name and deterministically map the action frame to animation time. The JSON never embeds a Three.js `AnimationClip` or GLB data.

The first Whole-Body Motion preset is `advancing_vertical_chop`. Its compact guide data is stored in `clip.metadata.motionGuide`; the editor bakes it into seven ordinary Pose Keys, so runtime playback does not depend on the editor or solver.

Motion guide version 3 adds a draggable overhead windup target. Windup height and pullback stage the sword hand, while windup body load and readability coupling produce explicit anticipation through the torso, center of mass, and legs. Impact, center-of-mass, and plant targets remain draggable; lead-foot locking and the two-hand grip fit are preserved. Both constraint solvers write ordinary Pose Keys and an error report into the clip, so they are never required during playback.

Direct Pose is preset-independent. It solves the selected hand or foot first, caps authored limb stretch at `1.05`, then recruits the torso, pelvis, and support legs when the local chain cannot reach. Optional world-space foot pins are restored during the same live solve. Dragging previews immediately and commits ordinary Pose Keys on pointer release.

Direct Pose V2 adds elbow and knee bend handles. The solver first moves the selected joint, then restores the anchored hand or foot endpoint without recruiting the whole body. Screen, vertical, and ground drag planes make depth placement explicit while retaining the same Pose Key output.

Direct Pose V3 adds a single selection-based XYZ gizmo to every hand, foot, elbow, and knee handle. World axes provide predictable stage-space vertical, horizontal, and depth edits; Local axes inherit the selected joint orientation. Axis targets are locked for the duration of a drag, Shift snaps signed travel to `0.05m`, and the live readout exposes axis, space, and displacement without changing whole-body solving or Pose Key output.

Action Blocking V1 captures the selected pose into a new key at a configurable frame gap. If the next key occupies that gap, later keys shift forward as a group. Previous and next keys render as real procedural-rig onion skins, while both palms and the sword tip are sampled across the authored clip to show motion arcs and key-point spacing.

Project JSON contains the complete normalized clip, combat action metadata, and weapon mount calibration. It can be copied, downloaded as a timestamped `.json` file, opened from disk, or restored from the local autosave written after pose and timeline edits.

The KayKit library currently registers eight `Rig_Medium` packs: general, basic movement, advanced movement, melee, ranged, simulation, special, and tools.

The UAL2 library loads the eight `Animation_Only/No_Root_Motion` sword clips. It samples the 65-node source hierarchy at 30 fps, transfers world-space rotation deltas to 19 procedural targets, scales root/pelvis translation by source-to-target height, and bakes ordinary Three.js clips named `UAL2/<source name>`. This intentionally preserves game-controlled movement while retaining body weight shifts. The source package is CC0 1.0.

The UAL1 split package manifest and Action Studio integration expose the two GLBs that are actually present in this checkout: `Sword_Attack` and `Sword_Idle`. They use the same Quaternius 65-node source skeleton and rest-aware 30 fps retarget path, producing clips named `UAL1/<source name>`. The source package is CC0 1.0.

The Skyrim G2 bridge keeps the Action Studio Blockman rig as the canonical target. A converted source GLB retains the Skyrim source hierarchy and is retargeted to `SKYRIM_GUARD/shd_blockidle` by the repository adapter. The validated `shd_blockidle.source.glb` is the single tracked exception; other converted probe GLBs remain ignored.

The generated `index.html` deliberately loads a classic script so the pose editor can open directly through `file://` without browser ES-module CORS errors. Loading any external animation library or the G2.3 source-GLB review requires serving the repository through local HTTP.

