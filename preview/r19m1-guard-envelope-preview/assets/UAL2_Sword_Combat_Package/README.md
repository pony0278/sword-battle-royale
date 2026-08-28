# UAL2 Sword Combat Extracted Package

Source: **Universal Animation Library 2 [Standard]** by Quaternius.
License: **CC0 1.0 Universal / Public Domain Dedication**. See `License.txt`.

## Selected animations
- Sword_Regular_A — 0.433 s
- Sword_Regular_B — 0.533 s
- Sword_Regular_C — 2.000 s
- Sword_Regular_Combo — 3.000 s
- Sword_Heavy_Combo — 4.333 s
- Sword_Dash — 1.567 s
- Sword_Block — 1.233 s
- Hit_Knockback — 0.833 s

## Which folder should I use?

### `Rigged_Source/` (recommended for inspection / retargeting)
Each GLB keeps the Quaternius mannequin mesh + skeleton and contains only the named animation. You can open it directly in a GLB viewer or import it into Blender/engine tools, then retarget the motion to your own character. Each Root Motion folder also includes a combined `UAL2_Sword_Combat_8.glb`.

### `Animation_Only/` (recommended for a Three.js runtime after your rig mapping is known)
Compact files with render mesh removed. The named hierarchy and animation channels remain. Useful if your runtime binds animation tracks to an existing compatible/retargeted rig.

## Root motion choice
- `No_Root_Motion`: movement stays under game/controller code. Usually the safer starting point for networked combat.
- `Root_Motion`: forward/back displacement is baked into the animation. Useful as an authoring/reference source or when the engine intentionally consumes root motion.

## Important retargeting note
If your character uses different bone names, hierarchy, rest pose, or proportions, the animation is not plug-and-play. Retarget it to your character skeleton first.
