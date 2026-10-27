#!/usr/bin/env bash
set -euo pipefail

input=$(cat)
jq -e 'type == "object"' >/dev/null 2>&1 <<<"$input" || { echo "Blocked: no-code-comments hook needs jq and a JSON object on stdin." >&2; exit 2; }
path=$(jq -r '.tool_input.file_path // ""' <<<"$input")

case $path in
  *.ts | *.tsx | *.mts | *.cts | *.js | *.jsx | *.mjs | *.cjs | *.css | *.scss | *.swift | *.kt | *.kts | *.java | *.go | *.m | *.h)
    style=slash ;;
  *.sh | *.bash | *.zsh | *.py | *.rb)
    style=hash ;;
  *) exit 0 ;;
esac

new=$(jq -r '[.tool_input.content, .tool_input.new_string, (.tool_input.edits // [] | .[].new_string)] | map(select(. != null)) | join("\n")' <<<"$input")
old=$(jq -r '[.tool_input.old_string, (.tool_input.edits // [] | .[].old_string)] | map(select(. != null)) | join("\n")' <<<"$input")
if [[ -z $old && -f $path ]]; then
  old=$(cat -- "$path")
fi

added=$(grep -vxF -f <(printf '%s\n' "$old" | grep -v '^$' || true) <<<"$new" || true)

if [[ $style == slash ]]; then
  allowed='//[[:space:]]*(@ts-|eslint-|prettier-ignore|biome-ignore|istanbul )|/// <reference|/\*[[:space:]]*(eslint|global |@vite|webpack|istanbul )|^[[:space:]]*"use (client|server|strict)"'
  found='(^|[[:space:];{}(),])//|(^|[[:space:];{}(),])/\*|^[[:space:]]*\*([[:space:]]|/|$)|\*/[[:space:]]*\}?[[:space:]]*$'
else
  allowed='^#!|^[[:space:]]*#[[:space:]]*(shellcheck|type: ignore|noqa|pragma|-\*-)'
  found='^[[:space:]]*#|[[:space:]]#[[:space:]]'
fi

hit=$(grep -E "$found" <<<"$added" | grep -vE "$allowed" | head -3 || true)
if [[ -n $hit ]]; then
  {
    echo "Blocked: this edit adds code comments to $path. CLAUDE.md forbids comments in code."
    echo "Make the code self-explanatory. If a comment really seems needed, suggest the wording to the user instead."
    echo "Offending lines:"
    echo "$hit"
  } >&2
  exit 2
fi
exit 0
