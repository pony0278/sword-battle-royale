# Weapon source meshes

Static meshes that mount to a character socket. Not skinned, not animated: a weapon is parented to
`HAND_R` and posed by the hand, so a rig inside the file would be ignored — see
`src/character/character-sockets.js` and `src/combat/weapon-mount-policy.js`.

| file | extracted to | by |
|---|---|---|
| `sword_E.glb` | `src/character/v3-greatsword-geometry-definition.js` | `npm run extract:greatsword` |

The longsword is not here. It is still embedded in
`tools/kaykit_combat_lab_v3_procedural_character_generator.html#EMBED.sword` and extracted by
`npm run extract:kaykit`; both extractors share `build/gltf-accessors.mjs`.

## sword_E.glb

User-supplied, and KayKit-shaped: its material is named `weapons` and its texture
`weapons_bits_texture`, matching the KayKit package this repository's rig already comes from. 818
vertices, 616 triangles, one primitive, no skin, no animations.

**Its texture is not in the file.** The material references `weapons_bits_texture.png` by external
URI and that PNG was not supplied, so the mesh renders untextured. This costs nothing that is
measured: contact is read off the blade polyline, which is geometry, and the weapon is drawn as
edges rather than shaded surfaces. Supplying the PNG is a look decision, not a blocker.

Before public redistribution, retain and verify the license and provenance supplied with the
original KayKit asset package, the same as `assets/kaykit/README.md` records for the animations.
