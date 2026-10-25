#!/usr/bin/env bash
set -euo pipefail

input=$(cat)
cmd=$(jq -r '.tool_input.command // ""' <<<"$input")
cwd=$(jq -r '.cwd // "."' <<<"$input")
approval='LOOP_GIT_APPROVED=1'

deny() {
  echo "Blocked: $1." >&2
  exit 2
}

needs_yes() {
  [[ $cmd == *"$approval"* ]] && return 0
  {
    echo "Blocked: $1."
    echo "Explain to the user what this does and wait for an explicit yes."
    echo "Only after that yes, rerun the exact command prefixed with $approval."
  } >&2
  exit 2
}

current_branch() {
  git -C "$cwd" symbolic-ref --short HEAD 2>/dev/null || true
}

segments=$(sed -E 's/(\&\&|\|\||;|\|)/\n/g' <<<"$cmd")

while IFS= read -r seg; do
  if grep -qE '\bgit\b.*--no-verify|\bgit\b.*\bcommit\b.*\s-n\b' <<<"$seg"; then
    deny "bypassing git hooks (--no-verify) is never allowed"
  fi

  if grep -qE '\bgit\b.*\bpush\b' <<<"$seg"; then
    grep -qE '\s(-f|--force|--force-with-lease\S*|--force-if-includes|--mirror)\b|\s\+\S' <<<"$seg" && needs_yes "force push rewrites remote history"
    grep -qE '\s(-d|--delete)\b|\s\S+\s+:\S' <<<"$seg" && needs_yes "this deletes a remote branch"
    if grep -qE '(\s|:)main\b' <<<"$seg" || { [[ $(current_branch) == main ]] && ! grep -qE '\s\S+\s+\S+' <<<"${seg#*push}"; }; then
      needs_yes "pushing to main puts changes live; state what's going live first"
    fi
  fi

  grep -qE '\bgit\b.*\breset\b.*--hard' <<<"$seg" && needs_yes "reset --hard discards uncommitted work"
  grep -qE '\bgit\b.*\bbranch\b.*\s(-d|-D|--delete)\b' <<<"$seg" && needs_yes "this deletes a branch"
  grep -qE '\bgit\b.*\bclean\b.*\s-[a-zA-Z]*f' <<<"$seg" && needs_yes "git clean deletes untracked files"
  grep -qE '\bgit\b.*\b(checkout|restore)\b.*\s(--\s+)?\.(\s|$)' <<<"$seg" && needs_yes "this discards uncommitted changes"
  grep -qE '\bgit\b.*\brebase\b' <<<"$seg" && needs_yes "rebasing rewrites history"
  grep -qE '\bgit\b.*\bcommit\b.*--amend' <<<"$seg" && needs_yes "amending rewrites the last commit"

  if grep -qE '\bgit\b.*\bstash\b' <<<"$seg" && ! grep -qE '\bstash\s+(list|show)\b' <<<"$seg"; then
    git -C "$cwd" diff --cached --quiet 2>/dev/null || needs_yes "git stash with staged changes can lose work"
  fi

  if grep -qE '\bgit\b.*\bmerge\b' <<<"$seg" && [[ $(current_branch) == main ]]; then
    needs_yes "merging into main puts changes live; state what's going live first"
  fi

  if grep -qE '\bgh\s+pr\s+merge\b' <<<"$seg"; then
    pr=$(grep -oE 'merge\s+[^-[:space:]]\S*' <<<"$seg" | awk '{print $2}' || true)
    base=$(cd "$cwd" && gh pr view $pr --json baseRefName -q .baseRefName 2>/dev/null || echo unknown)
    [[ $base == main || $base == unknown ]] && needs_yes "merging this PR puts changes live on main (base: $base)"
  fi
done <<<"$segments"

exit 0
