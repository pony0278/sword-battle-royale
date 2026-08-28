# UAL1 Animation Split Package

Source package: `Universal Animation Library[Standard]`

License: **CC0 1.0 Universal (Public Domain Dedication)**

This checkout contains **2 unique animations**, `Sword_Attack` and `Sword_Idle`, each exported as standalone `.glb` files in four variants.

## Folder structure

```text
UAL1_Animation_Split_Package/
├─ Rigged_Source/
│  ├─ No_Root_Motion/
│  ├─ Root_Motion/
│  └─ each folder includes `Sword_Attack.glb` and `Sword_Idle.glb`
├─ Animation_Only/
│  ├─ No_Root_Motion/
│  ├─ Root_Motion/
│  └─ each folder includes `Sword_Attack.glb` and `Sword_Idle.glb`
├─ manifest.json
├─ README.md
└─ License.txt
```

## Variants

- `Rigged_Source`: keeps the mannequin mesh, skeleton, and the selected animation clip(s).
- `Animation_Only`: removes the render mesh and materials, keeping only the node hierarchy and animation data.
- `No_Root_Motion`: original non-root-motion version.
- `Root_Motion`: baked root-motion version.

## Best use cases

- Use `Rigged_Source/.../<Animation>.glb` if you want to preview in Blender / GLB viewers immediately.
- Use `Animation_Only/.../<Animation>.glb` if you want a lighter file to retarget or inspect in code.

## Original README from source package

```text
The Universal Animation Library comes in two files: the one ending in _RM has root motion baked into every animation, while the other has root motion disabled.

Explore all the animations in the Animation Viewer!
https://quaternius.com/animviewer.html
-------------------------------------------------------
License:
CC0 1.0 Universal (CC0 1.0)
Public Domain Dedication
https://creativecommons.org/publicdomain/zero/1.0/

------------------------------------------------------
Models by @Quaternius
Consider supporting me on Patreon!

https://www.patreon.com/quaternius

-------------------------------------------------------
Join the Discord Server:
https://discord.gg/vJqnRUYRfT
```
