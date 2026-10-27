#!/usr/bin/env bash
set -euo pipefail

command -v node >/dev/null 2>&1 || { echo "Blocked: git-safety hook needs node." >&2; exit 2; }
exec node "$(dirname "${BASH_SOURCE[0]}")/git-safety.mjs"
