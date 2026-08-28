# G3.5.1P-T2 — Perfect Parry: Shared Deflect vs Power Deflect A/B

## Goal

Resolve the remaining Perfect Parry presentation question without changing production combat:

> Should Perfect Parry reuse the cleaner Normal T1 deflect, or keep a dedicated `shd_blockbashpower` deflect?

T2 is intentionally a controlled A/B test. Both candidates keep the **same Perfect contact timing** so the visual comparison is primarily about the deflect source rather than hitstop or pacing.

## Production boundary

T2 remains probe-only:

- `productionEnabled: false`;
- authority remains `presentation-probe-only`;
- `rootRotationPolicy: lock`;
- no Counter state or Counter animation is restored;
- production G3.5.1 still uses the current accepted mapping until a visual decision is explicitly promoted.

Gameplay semantics remain:

`Parry success → opponent stagger / unbalance → defender may use normal Top / Left / Right attack.`

## Locked Perfect contact timing

Both A/B candidates use:

- Block Hit contact end: `0.160s`;
- Perfect contact hold: `95ms`;
- crossfade: `75ms`.

This preserves the heavier Perfect contact read from T1 while isolating the post-contact deflect choice.

## Candidate A — Shared Normal T1 Deflect

Perfect contact timing

→ crossfade

→ reuse Normal T1 compact deflect:

- source: `SKYRIM_GUARD/shd_blockbash`;
- trim: `0.090–0.220s`;
- blend lead: `0.030s`;
- speed: `1.15x`.

Hypothesis:

Perfect Parry does not need a unique shield motion if the shared redirect reads cleaner. Perfect strength can instead come from:

- stronger authoritative attacker stagger;
- stronger hitstop;
- stronger sparks / audio;
- stronger camera response;
- larger follow-up advantage.

## Candidate B — Power T1 Deflect

Perfect contact timing

→ crossfade

→ existing Perfect T1 power deflect:

- source: `SKYRIM_GUARD/shd_blockbashpower`;
- trim: `0.120–0.280s`;
- blend lead: `0.035s`;
- speed: `1.10x`.

Hypothesis:

The power source is worth keeping only if it communicates a stronger redirect **without** reading as a forward Shield Bash / body-check.

## Why this A/B is fair

T1 showed that comparing different source motions while also changing contact timing can blur the result.

T2 therefore locks the Perfect contact phase. The meaningful difference begins after contact:

- A uses the already promising Normal compact redirect;
- B uses the dedicated power-bash trim.

The test is not asking which pose is bigger. It is asking which candidate better communicates:

`incoming weapon hits shield → defender redirects attack line → attacker loses balance`.

## Action Studio lab

`tools/action-studio/perfect-parry-deflect-ab.html`

Controls:

- A · Shared Normal T1;
- B · Power T1;
- play / restart;
- timeline scrubber;
- front / 3-quarter / side / back camera.

The lab retains T1's probe-only HAND_L shield instrumentation:

- live wireframe shield marker;
- contact-position shield ghost;
- contact → current displacement line;
- HUD shield delta vector `(x, y, z)`.

## Acceptance criteria

### Shared wins if

- contact still feels clearly stronger than Normal Parry;
- the post-contact motion reads as a clean redirect;
- reusing Normal T1 does not make Perfect feel visually weak;
- the final pose is clean for immediate Parry Advantage handoff.

### Power wins only if

- it clearly reads as a stronger redirect;
- the side view does not become a forward body-check;
- the shield path does not read as a second initiated attack;
- the extra motion adds semantic value rather than merely amplitude.

### Reject dedicated Power if

- its main difference is forward depth / bash energy;
- Shared is equally readable or cleaner;
- Perfect can be communicated more safely through gameplay outcome, hitstop, FX and audio.

## Visual evidence

The dedicated T2 workflow captures:

- shared contact;
- shared mid-blend;
- shared deflect at `390ms`, 3/4 and side;
- shared end pose;
- power deflect at the same `390ms`, 3/4 and side;
- power end pose.

Matched-time deflect frames are deliberate: they reduce the chance of choosing a candidate simply because one clip was sampled later in its motion.

## Decision after T2

If Shared is cleaner, the recommended production policy is:

- Normal Parry: `blockhit → Normal T1 compact deflect`;
- Perfect Parry: same motion chain;
- Perfect differentiation: stronger authoritative stagger / hitstop / FX / audio / camera response.

If Power genuinely reads as a stronger redirect without Shield Bash semantics, keep the dedicated Perfect source.

No production mapping changes inside T2 itself.
