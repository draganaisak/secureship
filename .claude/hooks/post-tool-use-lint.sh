#!/usr/bin/env bash
set -uo pipefail

# Runs the frontend lint after Claude edits a frontend file. Edits elsewhere
# (backend, docs, .claude) are skipped so eslint does not run on unrelated changes.
# Anchor to the project root so the hook works regardless of Claude's cwd.
# Exit 2 on failure so eslint output is fed back to Claude to fix.

payload="$(cat)"

# Best-effort extract of the edited file path from the hook payload (no jq dependency).
file_path="$(printf '%s' "$payload" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"

# Only lint on frontend edits; if the path can't be parsed, lint anyway (safe default).
case "$file_path" in
  *"/frontend/"* | "") ;;
  *) exit 0 ;;
esac

cd "${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}" || exit 0

[ -f "frontend/package.json" ] || exit 0
grep -q '"lint"' frontend/package.json || exit 0

cd frontend || exit 0
npm run lint 1>&2 || exit 2
