# G3.5.1P — Parry Contact → Deflect Presentation Probe

## Goal

Test the revised visual hypothesis for Parry without changing combat authority or the production Parry mapping.

The hypothesis is:

1. the incoming weapon first **contacts the raised shield**;
2. the defender briefly absorbs the impact;
3. the shield then **redirects / brushes the attack line outward**;
4. only after that visual success does the gameplay Parry Advantage matter.

The previous problem was that `shd_blockbash` or `shd_blockbashpower` played by themselves read as Shield Bash. G3.5.1P tests whether those same source motions become readable as a Parry when they are used only after a clear Block Hit contact.

## Probe-only rule

This stage must not silently replace production Parry.

`src/combat/parry-contact-deflect-probe.js` is explicitly:

- `probeOnly: true`;
- `productionEnabled: false`;
- authority: `presentation-probe-only`;
- in-place playback;
- root rotation policy: `lock`.

Production G3.5.1 remains unchanged until visual review is accepted.

## Visual Tuning — T1 Compact Redirect

The first P0 artifact proved that the contact → deflect chain runs correctly, but its late poses still risk reading as a second active Shield Bash:

- Normal P0 exposed almost the full `shd_blockbash` source (`0.040–0.300s`).
- Perfect P0 exposed a large `shd_blockbashpower` displacement (`0.080–0.460s`).
- the P0 contact hold was relatively short, so the eye had less time to register **impact first** before the second motion developed.

T1 therefore does **less**, not more:

- freeze the shield-contact read longer;
- skip more of the bash preparation;
- use only a compact middle redirect segment;
- trim away the late forward follow-through that can look like a body-check / Shield Bash;
- retain bone position lerp + quaternion slerp crossfade;
- keep `rootRotationPolicy: lock`.

The lab keeps **P0 Baseline** available for direct A/B comparison.

## Candidate chains

### Normal Parry — T1 default

`SKYRIM_GUARD/shd_blockhit`

→ readable contact hold

→ longer pose crossfade

→ compact middle segment of `SKYRIM_GUARD/shd_blockbash`

T1 values:

- Block Hit contact end: `0.160s`;
- contact hold: `85ms`;
- crossfade: `70ms`;
- blockbash trim: `0.090–0.220s`;
- blend lead inside blockbash: `0.030s`;
- deflect speed: `1.15x`.

P0 comparison:

- Block Hit contact end: `0.180s`;
- contact hold: `65ms`;
- crossfade: `55ms`;
- blockbash trim: `0.040–0.300s`;
- blend lead: `0.045s`;
- speed: `1.0x`.

### Perfect Parry — T1 default

`SKYRIM_GUARD/shd_blockhit`

→ stronger contact hold

→ longer pose crossfade

→ trimmed middle segment of `SKYRIM_GUARD/shd_blockbashpower`

T1 values:

- Block Hit contact end: `0.160s`;
- contact hold: `95ms`;
- crossfade: `75ms`;
- blockbashpower trim: `0.120–0.280s`;
- blend lead: `0.035s`;
- deflect speed: `1.10x`.

P0 comparison:

- Block Hit contact end: `0.180s`;
- contact hold: `75ms`;
- crossfade: `60ms`;
- blockbashpower trim: `0.080–0.460s`;
- blend lead: `0.060s`;
- speed: `1.0x`.

## Why crossfade matters

A hard switch can make the second clip read as a new attack even if the source itself is useful.

The Action Studio probe captures both bone poses and blends them using:

- local bone position interpolation;
- quaternion slerp;
- local scale interpolation.

This allows us to judge the intended semantic chain instead of judging a clip seam.

## Action Studio lab

`tools/action-studio/parry-contact-deflect-probe.html`

Controls:

- Normal / Power variant;
- **T1 Compact Redirect / P0 Baseline** A/B preset;
- play / restart;
- chain scrubber;
- Block Hit contact end;
- impact hold / hitstop;
- crossfade duration;
- deflect source start / end;
- blend lead;
- deflect playback speed;
- front / 3-quarter / side / back camera.

The lab loads the real converted Skyrim Guard GLBs and uses the accepted Skyrim weapon-bind calibration.

## HAND_L shield movement instrumentation

The first artifact review exposed a visual-testing flaw: the probe mounted the sword but did not have a real shield mesh, so reading “redirect versus bash” from the left-arm rig alone was too ambiguous.

The T1 lab now adds **probe-only shield instrumentation** driven by the existing `HAND_L` socket:

- a live wireframe octagonal shield marker at the current `HAND_L` world position;
- a faint shield ghost frozen at the Block Hit contact position;
- a line from contact position to current position;
- HUD readout of shield-center displacement (`shield Δ`).

This marker is not production shield art and does not change character equipment. It exists only to make the motion path visible during tuning.

### Current visual finding with shield marker

- **Normal T1 is promising:** after clear contact, the shield center moves strongly upward / laterally and the source is trimmed before the late P0 follow-through. This reads closer to a redirect than a second initiated bash.
- **Perfect T1 is improved but not signed off:** the shorter power-bash trim avoids the obvious late P0 body-check, but the side view still suggests a meaningful depth / forward component.
- therefore no production mapping is changed yet.

A sensible next Perfect-Parry comparison is either:

1. reuse the accepted Normal compact deflect and distinguish Perfect through stronger stagger / hitstop / FX; or
2. test one narrower `shd_blockbashpower` trim only if a clean lateral redirect segment can be isolated.

## T1 acceptance criteria

T1 is visually better than P0 only if:

- shield contact is easier to read before outward movement starts;
- the redirect is one compact continuation of the collision, not a second initiated move;
- Normal does not develop into a visible forward Shield Bash follow-through;
- Perfect may have more displacement than Normal, but must still read as a stronger **redirect**, not a body-check;
- shoulders / hands / weapon remain coherent through the longer blend;
- root orientation remains locked;
- the finishing silhouette can hand off immediately into Parry Advantage / normal directional attack.

## Rejection signs

Reject or re-trim T1 if:

- the longer hold makes the animation feel frozen rather than impactful;
- starting later in the bash clip creates an obvious pose jump even with crossfade;
- the shield still drives straight forward instead of moving across / away from the incoming attack line;
- Perfect still reads primarily as a shield strike;
- the compact trim becomes too small to communicate any redirect at all.

## Visual evidence policy

The dedicated G3.5.1P workflow now captures both T1 and P0 evidence.

T1 evidence includes:

- Normal contact;
- Normal hold;
- Normal mid-blend;
- Normal deflect and end pose;
- Perfect deflect in 3/4;
- Perfect deflect from the side and end pose.

P0 comparison frames include later Normal and Perfect source poses so the Shield Bash tail can be compared directly rather than from memory.

## Relationship to G3.5.1

G3.5.1 gameplay semantics remain valid:

`Parry success → opponent stagger / unbalance → defender may use normal Top / Left / Right attack.`

G3.5.1P changes only the possible **presentation** of the Parry success itself.

No dedicated Counter animation is reintroduced.

## Next decision

After T1 visual review:

- if Normal T1 continues to read as **contact → redirect**, promote only that accepted timing into a later production Parry presentation stage;
- keep Perfect under review rather than forcing `shd_blockbashpower` into production;
- if no narrower power trim improves the side-view motion, let Perfect reuse Normal Parry motion and differentiate it through gameplay / presentation accents;
- production remains `shd_blockhit` until this visual decision is explicitly accepted.
