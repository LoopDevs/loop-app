# CLAUDE.md

## Testing

- No UI tests for now. We're iterating fast and QA by hand.
- Don't use browser automation or screenshots to check UI work. The
  user checks the UI and sends a screenshot if something is off.
- CI runs the automated tests. Don't run the full suite or simulate CI
  locally (no docker rehearsals) unless asked.
- If typecheck or lint already fails before your change, report "no new
  errors in the files I touched", not "passes".

## Git

Flow: feature branch → staging → main.

- Commit, push and merge when the user asks. Keep it fast: no test runs
  before committing or pushing. CI handles that.
- Use Conventional Commits (`feat:`, `fix:`, `chore:` ...).
- Always pull the branch you're on (feature, staging or main) before
  pushing, so remote changes are included. Do the same for the target
  branch before merging into it. If the pull brings conflicts, handle them
  as below.
- NEVER add a `Co-Authored-By` trailer or any other AI attribution to
  commits or PRs, even if the tooling suggests one.
- Before starting work, run `git status`, check which branch you're on, and
  pull the latest changes. Start new work on a feature branch.
- After any git action, say in one or two plain sentences what happened and
  where things stand. For example: "Committed and pushed to
  feature/login. It's not on staging yet."
- Merging to main: say what's about to go live and wait for a yes.
- Merge conflicts: explain what clashes in plain terms and ask how to
  resolve it. Don't guess.
- Never run destructive or history-rewriting commands without explicit
  confirmation: force push, `reset --hard`, deleting branches, rebasing or
  amending anything already pushed, or `git stash` while changes are
  staged. Uncommitted work can be lost.
- Never commit `.env` files, secrets, keys or certificates.


## Code style

- NEVER add comments to code. Write self-explanatory code instead (clear
  names, small functions). If a comment seems genuinely necessary (a
  non-obvious pitfall, a subtle invariant), don't add it yourself. Suggest
  the terse wording to the user and let them decide. This is a hard rule
  with no exceptions.
- No before/after framing in code, test names, log/error messages or docs
  ("instead of X", "no longer Y"). Describe current behaviour.
- Don't write facts that go stale (counts, "one request", "all X today").
  Describe the mechanism, or leave it out.
- Prefer multi-line code over long one-liners so diffs stay line-readable.
- Prefer methods on the relevant type over loose module-level functions.
- Pick one term per concept and use it everywhere: types, config keys,
  logs, docs.
- Constants, event names and key whitelists live beside the entity they
  describe, not in endpoint/handler files.

## Design and security

- Treat all frontend input as hostile. Field-level authz and user-chosen
  query/sort keys use explicit whitelists; unlisted fields are ignored.
  Never blacklists, so new fields are blocked by default.
- Keep provider/adapter interfaces thin and reference-based (pass an id,
  not whole entities).
- Logic that depends on runtime config belongs on the component that owns
  that config, not in global switch helpers.
- Greenfield project: no migrations, no backwards-compat shims. Change the
  schema in place.
- Never hardcode secrets. The example config file is the authoritative
  reference; keep it in sync.

## Working together

- A question about a design ("why do we have X?", "isn't this overkill?")
  is not an instruction. Lay out what exists and what each part buys,
  recommend, and let the user choose. Only delete what they name.
- When a task names a layer, touch only that layer. Report dangling
  couplings elsewhere as findings; ask before extending scope.
- Don't create files, scripts or helpers nobody asked for. Propose first.
- When asked to continue from existing work, make minimal additions. Don't
  restructure the user's code; raise concerns in prose.
- If you break a rule in this file, fix it immediately, then say so. Don't
  hand the fix back to the user.
- Answer yes/no questions about tool behaviour directly. Don't run
  commands to demonstrate.
- For security/auth changes, state the resulting behaviour (who sends
  what, where it's set) before editing.
- Edit files with Edit/Write, not `sed -i` / `perl -pi` / long bash chains.
- Prefer shell + CLI tools (jq, curl) over Python for scripting.
