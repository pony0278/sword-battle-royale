# Action Studio Extraction Plan

## Scope

Phase A extracts an Action Character Core from the current Punch Studio without importing the old game's gameplay state or making animation/rendering authoritative for combat. The existing Punch Studio remains a behavior reference while the new Action Studio is introduced behind a separate module boundary.

## Current architecture

The repository currently contains a browser-only Punch Studio under `tools/punch-studio.html` and `tools/ps/`. It has no build step and loads Three.js r128 plus nine classic scripts in a fixed order. Those scripts share one global scope:

```text
tools/punch-studio.html
  -> ps/sockets-data.js       full modular-part/socket snapshot
  -> ps/pose-data.js          pose keys, presets, timeline data, editor slider data, editor state
  -> ps/rig.js                Three scene/camera, procedural mesh, applyPose, interpolation,
                               playback, serialization, undo/autosave and editor state
  -> ps/hitfeel.js            preview effects and the only requestAnimationFrame loop
  -> ps/editor-ui.js          timeline/keyframe/slider/import-export UI
  -> ps/parts.js              15-part loader, equipment, props, carry preview and rigged hands
  -> ps/avatar.js             imported-avatar retargeting
  -> ps/slim.js               imported-avatar export/slimming
  -> ps/game-bridge.js        clip library, combo preview, game camera and global test hooks
```

Important dependency edges in the executable code are:

- `pose-data -> rig`: `POSE_KEYS`, defaults, phases, timeline and limb lag.
- `rig -> editor-ui`: state restoration calls UI rebuild functions.
- `rig -> parts/avatar`: `applyPose` calls optional finger/avatar consumers; character rebuild detaches and reattaches parts.
- `hitfeel -> rig/editor-ui/parts`: the render loop advances the clip, applies poses, invokes preview effects and updates carry ghosts.
- `editor-ui -> pose-data/rig/parts/hitfeel`: editor operations mutate global phases/timeline, use renderer/camera, and call optional part helpers.
- `parts -> rig/avatar/sockets-data`: legacy equipment resolves `bow` and `hand_r` to `armR.wr` or an avatar hand bone.
- `game-bridge -> all prior globals`: snapshots, camera state, UI, avatar, part maps and clip playback.

This is a working monolith with cross-file cycles hidden by classic-script globals. Converting the old files mechanically to ESM would not create the required clean architecture.

### Observed specification differences

- `tools/ps/pose-data.js` comments and README say 47 or 51 axes, but the executable `POSE_KEYS` array currently has 66 entries. The extra set includes eight optional finger axes and five carry-only axes.
- `carry_*` axes are read by `rig.js` only to feed a carry-ghost preview; they are not humanoid joint axes.
- `applyPose` also reaches into optional avatar/finger systems and computes tag-driven jump preview height, so it is not currently a pure humanoid pose applier.
- The old `guard` tag is normalized to `idle` by `tagFromName`, despite `guard` existing in the allowed tag list. New Action Studio tags must remain arbitrary strings.
- The requested `actor-brawler.js`, old `state.js`, game runtime, assets and prior automated tests are not present in this repository. Cross-checking against `actor-brawler.js` cannot be performed in Phase A unless that file is later supplied.
- The entire current `tools/` tree is untracked on the initial `master` worktree. It is treated as user-provided source reference and will not be discarded or overwritten wholesale.

When the written specification and executable source disagree, Phase A preserves the executable humanoid transforms and records the difference here. It does not invent behavior for missing files.

## Pure runtime versus editor-only boundary

### Extract from `ps/pose-data.js`

Pure runtime:

- Humanoid `POSE_KEYS` and default-value rules.
- Pose normalization.
- Timeline normalization with absolute frames, arbitrary key names, ease, impact, cancel and tag values.
- Ease evaluation and pose interpolation.

Editor/legacy only:

- Mutable globals (`PHASES`, `SEQ`, active key, playback toggles).
- Punch presets and the forced `GOOFY_IDLE` policy.
- DOM helpers and timeline-drag helpers.
- Slider labels/ranges.
- `carry_*` compatibility fields.

### Extract from `ps/rig.js`

Pure character/runtime:

- Procedural block-character proportions.
- ROOT/PELVIS/SPINE/HEAD and bilateral shoulder/elbow/wrist/hip/knee/ankle hierarchy.
- Pose-to-rig transform math, including wrist axes, toe yaw, squash/stretch and foot contact.
- Automatic ground placement using eligible contact feet.
- Generic named equipment sockets.

Editor/legacy only:

- Canvas, renderer, scene lighting, orbit camera and input handlers.
- JSON UI state, localStorage, undo/redo and autosave.
- Mutable global playback state.
- Carry/jump ghost preview.
- Avatar retargeting, finger rig callbacks and part rebuild callbacks.

### Extract from the other reference files

- `ps/editor-ui.js`: retain interaction patterns for arbitrary key creation, rename, duplicate, delete, scrub, impact/cancel editing, clip library and combo preview. The new UI talks to explicit core APIs instead of globals.
- `ps/hitfeel.js`: retain only presentation preview concepts: hitstop, shake, dummy knockback and impact flash. These live in the Action Studio adapter and never feed simulation results.
- `ps/game-bridge.js`: retain local clip library, combo/cancel preview and game-camera ideas. Remove Mini Mage Mayhem labels/constants and all avatar/part globals.
- `ps/parts.js` and `ps/sockets-data.js`: do not port the modular-parts system. Keep only the observed right-hand mount behavior as a small generic `HAND_R` socket contract.

## Target architecture

Phase A uses browser-native ES modules and plain JavaScript so the demo can run without a compiler. Modules remain TypeScript-friendly through explicit data shapes and can move to `.ts` when the project has a build pipeline.

```text
src/
  character/
    block-spec.js             procedural proportions only
    block-rig.js              hierarchy construction + named joints
    block-character.js        character lifecycle and pose application facade
    character-sockets.js      HAND_L/HAND_R/HEAD/BACK/HIP_L/HIP_R contracts
    debug-sword.js            Phase A debug mesh and mount calibration
  animation/
    pose-schema.js            POSE_KEYS single source of truth
    pose-utils.js             normalize/interpolate/ease
    animation-clip.js         arbitrary key timeline + metadata normalization/evaluation
    clip-player.js            non-authoritative playback clock
    animation-state.js        action-to-clip presentation state only
  combat/
    action-definition.js      authoring metadata windows; no hit resolution

tools/action-studio/
  index.html                  Phase A demo/editor page
  action-studio.js            editor adapter and render loop
  action-studio.css

tests/
  action-core.test.js         deterministic core and socket contract tests
```

Dependency direction:

```text
future Network / Combat Simulation
              -> Action State (data only)
              -> Animation State
              -> Clip Player
              -> Pose
              -> Block Character / Rig
              -> Weapon and preview VFX
```

Animation metadata may suggest active, cancel, movement, weapon-trail and parry windows. It cannot resolve hit, block, parry or counter results. Character/render modules do not import a simulation implementation.

## Files to extract

| New responsibility | Primary source reference | Extraction rule |
| --- | --- | --- |
| Pose schema/defaults | `tools/ps/pose-data.js` | Exclude `carry_*`; keep fingers optional; derive all loops from `POSE_KEYS` |
| Pose normalization/interpolation | `tools/ps/pose-data.js`, `tools/ps/rig.js` | Pure functions; no globals or DOM |
| Timeline/clip evaluation | `tools/ps/pose-data.js`, `tools/ps/rig.js` | Arbitrary key/tag names; absolute frames; no forced punch phases |
| Block hierarchy/proportions | `tools/ps/rig.js` | Preserve visible transform math and auto-ground behavior |
| Named sockets | `tools/ps/parts.js` | Small stable socket map only; no parts roster or socket snapshot |
| Action metadata | new, informed by timeline impact/cancel | Serializable windows with validation; authoring data only |
| Action Studio UI | `tools/ps/editor-ui.js` | Preserve the proven interaction model while removing global dependencies |
| Combat-feel preview | `tools/ps/hitfeel.js` | Editor adapter only |
| Clip/combo preview | `tools/ps/game-bridge.js` | Generic action naming and local data only |

## Files to keep as legacy reference

The following remain unchanged during Phase A and are never loaded by the Action Studio page:

- `tools/ps/pose-data.js`
- `tools/ps/rig.js`
- `tools/ps/editor-ui.js`
- `tools/ps/hitfeel.js`
- `tools/ps/game-bridge.js`
- `tools/ps/parts.js`
- `tools/ps/sockets-data.js`
- `tools/ps/avatar.js`
- `tools/ps/slim.js`
- the original Punch Studio CSS and documentation

`actor-avatar.js`, `ps/avatar.js`, `slim.js`, `parts.js` and the full socket snapshot are legacy/future UGC references, not MVP runtime dependencies. Since `actor-brawler.js` is absent, it is listed as an expected external legacy reference rather than copied or recreated.

## Compatibility strategy

- Action Studio snapshots use a new versioned format and list their `poseKeys` for diagnostics.
- Import accepts old Punch Studio snapshots through a compatibility adapter. Known humanoid values are normalized through the new `POSE_KEYS`; `carry_*` values are ignored and reported, not stored in the core pose.
- Legacy `frame`, `ease`, `impact`, `cancel` and `tag` fields survive. Arbitrary tag strings are preserved rather than sanitized through the old fixed tag list.
- Old `lags` may be accepted by the importer/player as presentation interpolation settings, but they are not part of authoritative action state.
- Mount calibration is saved per weapon as local position/rotation/scale under the stable `HAND_R` socket contract.
- The old Punch Studio sources remain available for visual comparison. The new page must not load any `tools/ps/*.js` script.
- The old `tools/punch-studio.html` entry will point users to Action Studio only after the independent Phase A page passes its core tests. The old source modules remain recoverable as reference.

## Phase A implementation sequence

1. Add pure pose, timeline, clip and action-metadata modules with deterministic tests.
2. Extract the procedural hierarchy and pose application into explicit Three.js character modules.
3. Add required named sockets and validate `HAND_R` parentage.
4. Build a debug sword, local mount calibration and a slash test clip.
5. Build the independent Action Studio demo/editor around the new modules.
6. Add a legacy snapshot compatibility adapter and generic clip library/preview behavior as time permits without weakening the core boundary.
7. Run syntax, unit and browser smoke checks; compare important T-pose/idle/joint behavior to the legacy source where executable inputs exist.

## Phase A acceptance criteria

- A procedural Block Character is created without `state.js`, `actor-brawler.js`, avatar, parts or other gameplay modules.
- T-pose and idle can be selected and rendered.
- Shoulder, elbow, wrist, hip, knee and ankle axes visibly affect the intended hierarchy.
- Pose normalization and interpolation iterate from `POSE_KEYS`; no axis count is hard-coded.
- Automatic ground placement has no obvious regression for T-pose, idle and the slash test.
- `HAND_L`, `HAND_R`, `HEAD`, `BACK`, `HIP_L` and `HIP_R` exist.
- A debug sword mounts through `HAND_R`, follows character/root, shoulder, elbow and wrist transforms, and traces the slash motion correctly.
- Action Studio can play and scrub an arbitrary-key Slash Test clip.
- The timeline exposes its impact frame and cancel point.
- Weapon local position, rotation and scale are editable and saved as mount calibration.
- Action metadata supports active/hit, cancel, movement, weapon-trail and parry windows without resolving combat outcomes.
- The Action Studio page loads no legacy gameplay or `tools/ps/*.js` module.
- Automated tests cover pose normalization, pose interpolation, timeline normalization, clip evaluation, socket existence and the `HAND_R` attachment contract.

## Explicitly deferred

- Six production weapons and their complete move sets.
- Multiplayer transport or authoritative combat simulation.
- Gameplay hit/block/parry/counter resolution.
- UGC avatars, equipment swapping, VRoid, GLB slimming and the 15-part socket system.
- Full visual parity for every legacy Punch Studio preset and every legacy editor panel.

