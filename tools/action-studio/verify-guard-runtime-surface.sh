#!/usr/bin/env bash
set -euo pipefail

BROWSER="${BROWSER:-$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)}"
if [[ -z "$BROWSER" ]]; then
  echo 'Guard Runtime browser gate requires Chrome/Chromium.' >&2
  exit 1
fi

PORT="${ACTION_STUDIO_GATE_PORT:-4173}"
DOM_FILE="${ACTION_STUDIO_GATE_DOM:-/tmp/action-studio-guard-runtime-dom.html}"
HTTP_LOG="${ACTION_STUDIO_GATE_HTTP_LOG:-/tmp/action-studio-guard-runtime-http.log}"
BASE="http://127.0.0.1:${PORT}/tools/action-studio/"

python3 -m http.server "$PORT" >"$HTTP_LOG" 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" >/dev/null 2>&1 || true' EXIT
sleep 2

"$BROWSER" --headless --no-sandbox --disable-gpu --enable-unsafe-swiftshader --hide-scrollbars \
  --window-size=1440,1000 --virtual-time-budget=20000 --dump-dom \
  "${BASE}?pagesGuardGate=1" >"$DOM_FILE"

fail() {
  echo "Action Studio Guard Runtime browser gate failed: $1" >&2
  echo '--- Guard Runtime DOM excerpt ---' >&2
  grep -n -A30 -B5 'guardRuntimePanel' "$DOM_FILE" >&2 || true
  echo '--- Root runtime attributes ---' >&2
  grep -o 'data-action-studio-[^ >]*\|data-pages-guard-[^ >]*' "$DOM_FILE" >&2 || true
  echo '--- HTTP log ---' >&2
  cat "$HTTP_LOG" >&2 || true
  exit 1
}

grep -q 'id="guardRuntimePanel"' "$DOM_FILE" || fail 'static #guardRuntimePanel is missing'
grep -q 'data-guard-runtime-static="true"' "$DOM_FILE" || fail 'panel is not authored as static HTML'
grep -q 'data-controller-bound="true"' "$DOM_FILE" || fail 'Guard Runtime controller did not bind after browser boot'
grep -q 'data-guard-runtime-button-count="5"' "$DOM_FILE" || fail 'controller did not validate all five Guard actions'

grep -q 'data-stage="G3.6.5"' "$DOM_FILE" || fail 'main Guard Runtime surface is not labeled G3.6.5'
grep -q 'data-g365-ready="true"' "$DOM_FILE" || fail 'G3.6.5 Skyrim Full Source Living Guard did not load'
grep -q 'data-living-guard="skyrim-full-source"' "$DOM_FILE" || fail 'Guard Runtime does not declare Skyrim Full Source Living Hold'
grep -q 'data-living-guard-stage="G3.6.5"' "$DOM_FILE" || fail 'Living Guard stage is not G3.6.5'

grep -q 'data-g363-ready="true"' "$DOM_FILE" || fail 'G3.6.3 promoted D production clips did not load'
grep -q 'data-parry-stage="G3.6.3"' "$DOM_FILE" || fail 'Parry production stage is not preserved as G3.6.3'
grep -q 'data-parry-presentation="blockhit-powerbash-full-recovery"' "$DOM_FILE" || fail 'Guard Runtime does not declare full-recovery D presentation'
grep -q 'data-parry-motion-family="g363-blockhit-powerbash-full-recovery"' "$DOM_FILE" || fail 'Guard Runtime does not expose G3.6.3 D motion family'
grep -q 'Guard Hold = Skyrim Full Source · Guard Block = Block Hit · Parry = D Power Bash → Full Recovery' "$DOM_FILE" || fail 'Guard Runtime does not describe G3.6.5 Hold + G3.6.3 D semantics'

grep -q 'data-action-studio-entry="bundle-http"' "$DOM_FILE" || fail 'HTTP Action Studio is not exercising the versioned standalone bundle path'
grep -q 'data-action-studio-boot="pass"' "$DOM_FILE" || fail 'HTTP Action Studio bundle did not boot successfully'
grep -q 'data-pages-guard-gate="pass"' "$DOM_FILE" || fail 'normal Action Studio did not remain in promoted D production Parry at 820ms'
grep -q 'data-pages-guard-state="guard_parry"' "$DOM_FILE" || fail 'deterministic G3.6.3 probe left guard_parry before recovery completed'
grep -q 'data-pages-guard-clip="SKYRIM_GUARD/power_parry_g363"' "$DOM_FILE" || fail 'Action Studio Parry is not using G3.6.3 production clip'

SOURCE_MS="$(grep -o 'data-pages-guard-source-ms="[0-9]*"' "$DOM_FILE" | head -1 | grep -o '[0-9]*' || true)"
[[ -n "$SOURCE_MS" ]] || fail 'Action Studio did not report deterministic G3.6.3 source sample'
(( SOURCE_MS >= 810 && SOURCE_MS <= 830 )) || fail "Action Studio sampled outside expected promoted D recovery checkpoint: ${SOURCE_MS}ms"

for mode in hold block parry perfect counter; do
  grep -q "data-guard-runtime=\"${mode}\"" "$DOM_FILE" || fail "missing ${mode} Guard Runtime button"
done
BUTTON_COUNT="$(grep -o 'data-guard-runtime="[^"]*"' "$DOM_FILE" | wc -l | tr -d ' ')"
[[ "$BUTTON_COUNT" == '5' ]] || fail "expected exactly 5 Guard Runtime buttons, found ${BUTTON_COUNT}"
if grep -Eq 'data-template="(guard|parry|counter)"' "$DOM_FILE"; then
  fail 'legacy Phase A Guard/Parry/Counter template buttons are still rendered'
fi

echo "Action Studio Guard Runtime browser gate passed · bundle-http · G3.6.5 Skyrim Full Source Hold + G3.6.3 D recovery ${SOURCE_MS}ms · 5 static buttons · controller bound."

# --- R19G.1 parry composition gate -------------------------------------------------------------
# The R19F regression sailed through a fully green unit suite: every module held its constants
# while the composed exchange broke (TOP unparryable at the shipping stance, chaotic release
# directions). This section replays the composition: the shield lab boots with ?parryGate=1, its
# probe plays one parry per direction at the calibrated stance and stamps verdicts judged by
# src/combat/parry-gate-verdict.js onto the DOM. The lab simulates continuously on
# requestAnimationFrame, which Chrome's --virtual-time-budget --dump-dom stops pumping shortly
# after load, so this gate runs in real time through playwright-core against the same browser.
node tools/action-studio/verify-shield-parry-gate.mjs "$BROWSER" "$BASE" \
  || fail 'shield parry composition gate did not pass'
