#!/usr/bin/env bash
# Build the HKX -> glTF converter this repository does NOT ship.
#
# handoff/10 §3 recorded the Havok decoder as an offline authoring dependency, and handoff/45
# re-verified in 2026 that nothing installable exists in npm, PyPI or crates.io. What that check
# missed is that a public GitHub repository CAN be cloned here - the git proxy serves anonymous
# reads - and PredatorCZ/HavokLib implements hkaSplineCompressedAnimation decoding with a glTF
# exporter on top.
#
# LICENSE, and the reason this is a script rather than a vendored copy: HavokLib is GPLv3. It is
# used here the way Blender would be - an offline tool that produces an asset - and nothing it
# builds is linked into the game or shipped to a player. Its source is fetched into /tmp rather
# than committed, so this repository carries a recipe, not GPL code.
#
# VERIFIED: the toolset reproduces the 2025 Blender bake of shd_blockidle exactly - 46 curves
# across the 23 retarget bones, worst absolute difference 0.0. tests/the-hkx-bake-is-reproducible.test.js
# is that comparison, and it is the reason output from this tool can be trusted.
set -euo pipefail

ROOT="${HAVOK_TOOLSET_ROOT:-/tmp/havok-toolset}"
HAVOKLIB_REF="${HAVOKLIB_REF:-ef5d5c6}"

mkdir -p "$ROOT"
if [[ ! -d "$ROOT/HavokLib/.git" ]]; then
  GIT_LFS_SKIP_SMUDGE=1 git clone https://github.com/PredatorCZ/HavokLib "$ROOT/HavokLib"
fi
cd "$ROOT/HavokLib"
git checkout --quiet "$HAVOKLIB_REF"
GIT_LFS_SKIP_SMUDGE=1 git submodule update --init --recursive --depth 1

# Two patches, both to the Spike submodule, both additive and neither changing behaviour - the
# byte-for-byte reproduction of the reference bake is the evidence for that.
#
# 1. <cstdint> for uintptr_t. Newer libstdc++ dropped the transitive include these headers relied
#    on, so they no longer compile anywhere without it.
for header in reflector_class.hpp reflector_enum.hpp; do
  file="3rd_party/spike/include/spike/reflect/detail/$header"
  grep -q '#include <cstdint>' "$file" || sed -i 's|^#include <map>$|#include <cstdint>\n#include <map>|' "$file"
done

# 2. Clang, not GCC. HavokLib's README states Clang 10 / G++10; g++ 13 rejects Spike's reflection
#    templates outright ("union mutate has no member named 'i'"), while clang 18 compiles them.
cmake -B build -DCMAKE_BUILD_TYPE=Release -DPYTHON_MODULE=OFF -DTOOLSET=ON \
  -DCMAKE_C_COMPILER="${CC:-clang}" -DCMAKE_CXX_COMPILER="${CXX:-clang++}" >/dev/null
cmake --build build -j"$(nproc)" >/dev/null

echo "$ROOT/HavokLib/build/spike/havok_toolset"
