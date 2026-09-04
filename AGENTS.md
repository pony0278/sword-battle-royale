# Project Instructions

This repository contains a browser-based multiplayer sword combat game.

Before implementing gameplay features, read:

- handoff/00_project_index.md
- handoff/02_technical_stack_architecture.md
- handoff/05_combat_actions_and_controls.md

For weapon-related work, also read:

- handoff/06_weapons_skills_and_items.md

For networking or multiplayer work, also read:

- handoff/03_network_topology_and_sre.md

For art, animation, camera, VFX, or UI work, also read:

- handoff/04_visual_style_and_art_direction.md

## Current development rule

Do not implement online multiplayer yet.

Current milestone:
Phase 1 — Combat Lab

Priority:
1. Blocky procedural character
2. Third-person movement
3. Lock-on
4. Combat strafe
5. Longsword
6. Attack
7. Guard
8. Perfect Guard / Parry
9. Dodge
10. Hit feel

Do not introduce Redis, PostgreSQL, Kubernetes, matchmaking,
or production infrastructure until a later phase.

Run tests and verify the browser game after meaningful changes.

## The code graph

`.claude/skills/graphify` builds a knowledge graph of this repository; `graphify update .`
regenerates it into the gitignored `graphify-out/`.

Two limits, both measured against this repository in `handoff/39_s0_weapon_seam_scan.md`:

- **Filter `confidence == "EXTRACTED"` before trusting an edge.** The graph mixes those with
  `INFERRED` `indirect_call` edges matched by function name alone. Seven of them join `src/` to
  `tools/`, which `game-does-not-import-the-lab-r20z4.test.js` forbids outright.
- **It carries no comments, and no initialiser expressions.** The measurements in this repository
  live in the `//` blocks above declarations, and a constant bound at import time appears in the
  graph with no outgoing edge at all. Use the graph to find every call site; read the source to
  learn what a number means.
