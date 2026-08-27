# Blocky Sword Battle Royale

Phase A introduces **Action Studio** and a clean procedural block-character animation core for a multiplayer-oriented 3D action game.

## Action Studio

Start any static HTTP server from the repository root. For example:

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Then open:

- `http://127.0.0.1:4173/tools/action-studio/`
- The former `tools/punch-studio.html` URL redirects to the same page.

The Phase A page provides T-pose, idle, Slash Test, Guard, Parry and Counter templates; arbitrary timeline keys; impact/cancel markers; scrub/play/slow/loop; pose sliders; generic action windows; a `HAND_R` v3 procedural longsword rig with saved mount calibration; weapon-trail and combat-feel previews; and a local clip library/combo preview.

## Runtime boundaries

- `src/animation/` owns pose normalization/interpolation, clips, timeline evaluation and presentation playback.
- `src/character/` owns the procedural hierarchy, pose application, grounding and stable equipment sockets.
- `src/combat/action-definition.js` owns authoring metadata windows only.
- Network/combat simulation remains authoritative for hit, block, parry and counter outcomes.

Action Studio does not load the legacy Punch Studio modules. The preserved old entry is `tools/punch-studio.legacy.html`; its classic-script sources remain under `tools/ps/` for visual cross-checking only.

See [ACTION_STUDIO_EXTRACTION_PLAN.md](handoff/ACTION_STUDIO_EXTRACTION_PLAN.md) for the dependency map, extraction boundary, compatibility strategy and recorded source/spec differences.

## Branch previews

GitHub Pages serves one site per repository, so per-branch preview URLs come from
subdirectories of a single `gh-pages` branch rather than from separate sites:

| Branch | URL |
| --- | --- |
| `main` | `https://<owner>.github.io/<repo>/` |
| anything else | `https://<owner>.github.io/<repo>/preview/<slug>/` |

`<slug>` is the branch name lowercased with every character outside `a-z0-9._-`
replaced by `-`, so `agent/external-impact-preview` publishes to
`preview/agent-external-impact-preview/`. `/preview/` lists everything currently
published.

Publishing is automatic for `main` and for any `**-preview` branch. Any other
branch can be published on demand by running the **Deploy GitHub Pages** workflow
against it (`workflow_dispatch`). Deleting a branch removes its preview.

Root and preview directories never overwrite each other, so several branches stay
live at once. Git stores blobs by content, so previews that share the ~35&nbsp;MB of
animation assets cost almost nothing extra.

`main` is still blocked by the Guard Runtime browser gate. Previews report a gate
failure without blocking, because a preview exists in order to look at work in
progress.

To publish by hand, or to check the result before pushing:

```bash
GH_PAGES_DRY_RUN=1 build/publish-gh-pages.sh publish <branch>
```

### Local preview

Tuning iterations are faster locally, and no deploy is involved:

```bash
python -m http.server 4173 --bind 127.0.0.1
```

- `http://127.0.0.1:4173/tools/action-studio/shield-driven-contact-coupling-lab.html`
- Add `?debug=1` for the low-stance tuning sliders.

A static HTTP server is required either way; the labs are ES modules and fetch GLB
animation packs, so `file://` does not work.

## Tests

```powershell
npm test
```

The tests cover pose normalization, pose interpolation, timeline normalization, clip evaluation, action metadata, socket existence, the `HAND_R` weapon attachment contract, legacy snapshot compatibility, template metadata and the no-legacy-import boundary.

## Procedural KayKit default character

The default-character factory now builds the KayKit Rig_Medium hierarchy, v3 line-avatar presentation and stable equipment sockets procedurally. The source Knight scene is not a runtime dependency. Four extracted KayKit GLB packs provide 61 animation clips and are loaded only as animation data.

Run `npm run extract:kaykit` to regenerate the versioned rig definition and animation packs from the checked-in Combat Lab source. KayKit animation preview requires the local HTTP server because browsers do not fetch external GLB files from a `file://` page. The authored Pose Editor remains available as a fallback and editing surface.

### V3 line-avatar appearance

The procedural KayKit character has one presentation path: `v3-rig-line`. It reproduces the Combat Lab v3 language with animated skeleton connectors, gold bone nodes, an octagonal camera-facing head outline, and procedural chest/pelvis contours. Block and Hybrid render modes, including their hidden grounding meshes, are no longer created. KayKit animation clips and stable equipment sockets continue to drive the same 23-bone hierarchy.


### V3 procedural weapon rig

Action Studio mounts an 11-node procedural longsword rig to `HAND_R`. The exact 358-vertex / 300-triangle `sword_1handed` topology embedded by v3 is extracted into a versioned geometry definition; runtime creates only Three.js `EdgesGeometry` lines and never loads or renders the source sword Mesh. Stable `SECONDARY_GRIP`, `PARRY_POINT`, `TRAIL_BASE` and `TRAIL_TIP` nodes support future two-handed IK, parry presentation, trail rendering and segment/capsule sweep previews without making presentation geometry authoritative for damage.
