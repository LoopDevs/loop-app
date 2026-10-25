#!/usr/bin/env bash
set -euo pipefail

input=$(cat)
tool=$(jq -r '.tool_name // ""' <<<"$input")
pattern='co-authored-by|claude-session|claude\.ai/code|generated (with|by) .{0,40}(claude|ai\b)|with the help of claude|assisted-by|written by (an )?ai|🤖'

block() {
  echo "Blocked: AI attribution ($1). Commits, PRs, issues, docs and code never credit Claude or AI. Remove it and retry." >&2
  exit 2
}

referenced_files() {
  local cmd=$1 next=0 word
  read -ra words <<<"$cmd"
  for word in "${words[@]}"; do
    if [[ $next == 1 ]]; then
      word=${word#\"}
      word=${word%\"}
      [[ -f $word ]] && cat -- "$word"
      next=0
    fi
    case $word in
      -F | --file | --body-file) next=1 ;;
      --file=* | --body-file=*) f=${word#*=}; [[ -f $f ]] && cat -- "$f" ;;
    esac
  done
}

case $tool in
  Bash)
    cmd=$(jq -r '.tool_input.command // ""' <<<"$input")
    grep -qE '\bgit\b.*\b(commit|tag|notes)\b|\bgh\b.*\b(pr|issue|release|api)\b' <<<"$cmd" || exit 0
    text="$cmd"$'\n'"$(referenced_files "$cmd")"
    ;;
  Write | Edit | MultiEdit)
    path=$(jq -r '.tool_input.file_path // ""' <<<"$input")
    case $path in
      */.claude/hooks/* | */CLAUDE.md | */AGENTS.md) exit 0 ;;
    esac
    text=$(jq -r '[.tool_input.content, .tool_input.new_string, (.tool_input.edits // [] | .[].new_string)] | map(select(. != null)) | join("\n")' <<<"$input")
    ;;
  *) exit 0 ;;
esac

match=$(grep -oiE "$pattern" <<<"$text" | head -1 || true)
[[ -n $match ]] && block "$match"
exit 0
