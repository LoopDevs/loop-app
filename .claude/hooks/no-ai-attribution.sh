#!/usr/bin/env bash
set -euo pipefail

input=$(cat)
jq -e 'type == "object"' >/dev/null 2>&1 <<<"$input" || { echo "Blocked: no-ai-attribution hook needs jq and a JSON object on stdin." >&2; exit 2; }
tool=$(jq -r '.tool_name // ""' <<<"$input")
cwd=$(jq -r '.cwd // "."' <<<"$input")
tools='(^|[^[:alnum:]])(claude|anthropic|chatgpt|openai|copilot|gemini|codex|gpt-?[0-9]+|ai)([^[:alnum:]]|$)'
verbs='generated|written|authored|created|drafted|produced|assisted|signed-off|reviewed|tested|suggested|made|built|powered|crafted|reported|(co-?)?developed|co-?created|co-?written'
pattern="co[ _-]?authored[ _-]?by|claude[ _-]?session|claude\.ai/(code|chat|share)|noreply@anthropic\.com|assisted[ _-]?by|($verbs)[ _-]?(with|by|using)[^[:cntrl:]]{0,20}($tools)|with the help of[^[:cntrl:]]{0,20}($tools)|ai[ _-](generated|assisted|authored|written)|🤖"

block() {
  echo "Blocked: AI attribution ($1). Commits, PRs, issues, docs and code never credit Claude or AI. Remove it and retry." >&2
  exit 2
}

print_file() {
  local file=${1//\"/}
  file=${file//\'/}
  file=${file/#\~/$HOME}
  [[ $file == /* ]] || file=$cwd/$file
  [[ -f $file ]] && cat -- "$file"
  return 0
}

referenced_files() {
  local next=0 word flattened=${1//[\$\(\)\`]/ }
  read -ra words <<<"$flattened"
  for word in "${words[@]}"; do
    if [[ $next == 1 ]]; then
      print_file "${word#*=@}"
      next=0
      continue
    fi
    case $word in
      -F | --file | --body-file | --input | -t | --template | cat) next=1 ;;
      --file=* | --body-file=* | --input=* | --template=*) print_file "${word#*=}" ;;
      -F?*) print_file "${word#-F}" ;;
      *=@*) print_file "${word#*=@}" ;;
    esac
  done
}

case $tool in
  Bash)
    cmd=$(jq -r '.tool_input.command // ""' <<<"$input")
    writes_message='(^|[^[:alnum:]_-])git[^|;&]*[[:space:]](commit|tag|notes|merge|revert|cherry-pick|am|rebase|stash)([[:space:]]|$)'
    runs_gh='(^|[^[:alnum:]_-])gh([[:space:]]|$)'
    grep -qE "$writes_message|$runs_gh" <<<"$cmd" || exit 0
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
