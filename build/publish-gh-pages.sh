#!/usr/bin/env bash
# Publish one branch into the single gh-pages site.
#
#   main            -> site root
#   any other ref   -> preview/<slug>/
#
# Root and preview directories never delete each other, so several branches
# stay live at once. Usage:
#
#   build/publish-gh-pages.sh publish <branch>
#   build/publish-gh-pages.sh remove  <branch>
#
# Environment:
#   GH_PAGES_DRY_RUN=1   run everything except the final push
#   GH_PAGES_REMOTE      remote to clone/push (default: origin's URL)
#   GH_PAGES_WORK        scratch directory (default: a mktemp dir)

set -euo pipefail

MODE="${1:-}"
BRANCH="${2:-}"
if [[ "$MODE" != "publish" && "$MODE" != "remove" ]]; then
  echo "usage: $0 {publish|remove} <branch>" >&2
  exit 2
fi
if [[ -z "$BRANCH" ]]; then
  echo "$0: a branch name is required" >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE="${GH_PAGES_REMOTE:-$(git -C "$REPO_ROOT" remote get-url origin)}"
WORK="${GH_PAGES_WORK:-$(mktemp -d)}"
PAGES="$WORK/gh-pages"

slugify() {
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed 's#[^a-z0-9._-]#-#g' \
    | sed 's#^[-.]*##; s#[-.]*$##'
}

if [[ "$BRANCH" == "main" ]]; then
  TARGET_DIR=""
  LABEL="site root"
else
  SLUG="$(slugify "$BRANCH")"
  if [[ -z "$SLUG" ]]; then
    echo "$0: branch '$BRANCH' has no publishable slug" >&2
    exit 1
  fi
  TARGET_DIR="preview/$SLUG"
  LABEL="$TARGET_DIR"
fi

if [[ "$MODE" == "remove" && -z "$TARGET_DIR" ]]; then
  echo "$0: refusing to remove the site root" >&2
  exit 1
fi

# ---------------------------------------------------------------- gh-pages
git config --global --get user.name  >/dev/null 2>&1 || git config --global user.name  'github-actions[bot]'
git config --global --get user.email >/dev/null 2>&1 || git config --global user.email '41898282+github-actions[bot]@users.noreply.github.com'

if git ls-remote --exit-code --heads "$REMOTE" gh-pages >/dev/null 2>&1; then
  git clone --quiet --depth=1 --branch gh-pages "$REMOTE" "$PAGES"
else
  echo "gh-pages does not exist yet; starting an empty history"
  mkdir -p "$PAGES"
  git -C "$PAGES" init --quiet -b gh-pages
  git -C "$PAGES" remote add origin "$REMOTE"
fi

# ------------------------------------------------------------ write target
if [[ "$MODE" == "publish" ]]; then
  DEST="$PAGES${TARGET_DIR:+/$TARGET_DIR}"

  # Clear only this branch's own directory, so the root and each preview stay
  # independent: publishing main never removes preview/, and publishing a
  # preview never touches the root.
  if [[ -z "$TARGET_DIR" ]]; then
    find "$PAGES" -mindepth 1 -maxdepth 1 \
      ! -name '.git' ! -name 'preview' -exec rm -rf {} +
  else
    rm -rf "$DEST"
  fi
  mkdir -p "$DEST"

  tar -C "$REPO_ROOT" \
      --exclude='./.git' \
      --exclude='./.github' \
      --exclude='./node_modules' \
      -cf - . \
    | tar -C "$DEST" -xf -
else
  rm -rf "${PAGES:?}/$TARGET_DIR"
fi

# A branch-sourced Pages site runs Jekyll unless this exists; the Actions
# artifact source skipped Jekyll for us, so this is new and required.
touch "$PAGES/.nojekyll"

# ------------------------------------------------------------ preview index
INDEX="$PAGES/preview/index.html"
if [[ -d "$PAGES/preview" ]]; then
  {
    cat <<'HTML'
<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Branch previews</title>
<style>
  body{margin:0;padding:32px;background:#090e16;color:#e9f0fb;font:15px/1.6 system-ui,sans-serif}
  h1{font-size:20px;margin:0 0 4px}p.note{color:#9eb0c8;font-size:13px;margin:0 0 24px}
  ul{list-style:none;padding:0;margin:0;max-width:760px}
  li{border:1px solid #26354d;border-radius:9px;padding:14px 16px;margin-bottom:10px;background:#0e1521}
  b{display:block;font:600 14px ui-monospace,monospace;color:#ddecff;margin-bottom:8px;word-break:break-all}
  a{display:inline-block;margin-right:14px;color:#7ef0ad;text-decoration:none;font-size:13px}
  a:hover{text-decoration:underline}
  em{color:#9eb0c8;font-style:normal;font-size:13px}
</style>
<h1>Branch previews</h1>
<p class="note">Each entry is one branch published under <code>preview/</code>. The site root is <a href="../">main</a>.</p>
<ul>
HTML
    found=0
    for dir in "$PAGES"/preview/*/; do
      [[ -d "$dir" ]] || continue
      found=1
      name="$(basename "$dir")"
      printf '  <li><b>%s</b>' "$name"
      printf '<a href="./%s/tools/action-studio/shield-driven-contact-coupling-lab.html">Shield parry lab</a>' "$name"
      printf '<a href="./%s/tools/action-studio/">Action Studio</a>' "$name"
      printf '</li>\n'
    done
    [[ "$found" -eq 1 ]] || printf '  <li><em>No previews are published right now.</em></li>\n'
    printf '</ul>\n'
  } > "$INDEX"
fi

# ------------------------------------------------------------------ commit
cd "$PAGES"
git add --all
if git diff --cached --quiet; then
  if [[ "$MODE" == "publish" ]]; then
    echo "gh-pages already matches $LABEL; nothing to publish"
  else
    echo "gh-pages has no $LABEL to remove"
  fi
  exit 0
fi

if [[ "$MODE" == "publish" ]]; then
  git commit --quiet -m "Publish $BRANCH to ${TARGET_DIR:-site root}"
else
  git commit --quiet -m "Remove preview for deleted branch $BRANCH"
fi

if [[ "${GH_PAGES_DRY_RUN:-}" == "1" ]]; then
  echo "DRY RUN · would push $(git rev-parse --short HEAD) to gh-pages"
  echo "DRY RUN · tree under ${TARGET_DIR:-<root>}:"
  git show --stat --oneline HEAD | head -20
  exit 0
fi

git push --quiet origin gh-pages
if [[ "$MODE" == "publish" ]]; then
  echo "Published $BRANCH to $LABEL"
else
  echo "Removed $LABEL for deleted branch $BRANCH"
fi
