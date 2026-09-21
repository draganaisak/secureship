#!/usr/bin/env bash
set -uo pipefail

# Runs the frontend lint after Claude edits files.
# Hooks run from the project root; the lint script lives in frontend/.
# Exit 2 on failure so eslint output is fed back to Claude to fix.

[ -f "frontend/package.json" ] || exit 0
grep -q '"lint"' frontend/package.json || exit 0

cd frontend || exit 0
npm run lint || exit 2
