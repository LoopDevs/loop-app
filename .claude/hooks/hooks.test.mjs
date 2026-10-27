import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { GitPolicy } from './git-safety.mjs';
import { ShellScript } from './shell-script.mjs';

const hooksDir = dirname(fileURLToPath(import.meta.url));

function fakeProbe({ branch = 'feature', branches = {}, staged = false, aliases = {}, prBase = 'post-hackathon' } = {}) {
  return {
    branchOf: (dir) => branches[dir] ?? branch,
    hasStaged: () => staged,
    alias: (_dir, name) => aliases[name] ?? '',
    prBase: () => prBase,
  };
}

function verdict(command, probeOptions) {
  const result = GitPolicy.evaluate(command, fakeProbe(probeOptions), '/repo');
  if (result.denies.length > 0) {
    return 'deny';
  }
  return result.asks.length > 0 ? 'ask' : 'allow';
}

function expectAll(expected, commands, probeOptions) {
  for (const command of commands) {
    assert.equal(verdict(command, probeOptions), expected, command);
  }
}

test('shell parsing keeps quoted text inside one word', () => {
  const { commands } = ShellScript.parse('git commit -m "a && b; c" && echo \'x | y\'');
  assert.deepEqual(commands, [['git', 'commit', '-m', 'a && b; c'], ['echo', 'x | y']]);
});

test('shell parsing drops redirects and splits pipelines, subshells and newlines', () => {
  const { commands } = ShellScript.parse('git push origin x 2>&1 | tail -1\n(cd a; ls) > out.txt');
  assert.deepEqual(commands, [['git', 'push', 'origin', 'x'], ['tail', '-1'], ['cd', 'a'], ['ls']]);
});

test('shell parsing extracts substitutions and skips quoted heredoc bodies', () => {
  const quoted = ShellScript.parse("git commit -F - <<'EOF'\ngit push --force\nEOF\ngit status");
  assert.deepEqual(quoted.commands, [['git', 'commit', '-F', '-'], ['git', 'status']]);
  assert.deepEqual(quoted.nested, []);
  const expanded = ShellScript.parse('cat <<EOF\n$(git push -f)\nEOF');
  assert.deepEqual(expanded.nested, ['git push -f']);
  const inline = ShellScript.parse('echo "$(git reset --hard)" `git clean -f`');
  assert.deepEqual(inline.nested, ['git reset --hard', 'git clean -f']);
});

test('read-only and ordinary git commands pass', () => {
  expectAll('allow', [
    'git status',
    'git log --grep="git push origin main" --oneline -5',
    'git diff main...HEAD',
    'git show HEAD',
    'git fetch origin main',
    'git branch -vv',
    'git push',
    'git push -u origin feature',
    'git push origin feature:feature',
    'git push -n origin feature',
    'git commit -m "push to main with --force"',
    'git commit -am "fix: tidy"',
    'git commit -m "-n"',
    'git commit -mn',
    'git checkout -b feat/x origin/main',
    'git checkout feature',
    'git restore --staged src/a.ts',
    'git stash list',
    'git stash show -p',
    'git stash',
    'git clean -n',
    'git clean -nfd',
    'git reset --soft HEAD~1',
    'git reset HEAD src/a.ts',
    'git merge main',
    'git pull',
    'echo "git push --force"',
    'ls && git status | head',
    "git commit -m \"$(cat <<'EOF'\nfix: x\n\ngit push --force\nEOF\n)\"",
    'gh pr create --base main --title x --body y',
    'gh pr merge 12',
    'gh api repos/o/r/pulls',
    'gh pr view 3 --json baseRefName',
  ]);
});

test('force and delete pushes need approval in every spelling', () => {
  expectAll('ask', [
    'git push --force',
    'git push -f',
    'git push -fu origin x',
    'git push -uf origin x',
    'git push origin x -f',
    'git push --force-with-lease',
    'git push --force-with-lease=x:abc origin x',
    'git push --force-if-includes',
    'git push origin +feature',
    'git push --mirror',
    'git push origin --delete x',
    'git push origin x --delete y',
    'git push -d origin x',
    'git push origin :x',
    'git push --prune origin',
    'git -C . push -f',
    'git -c color.ui=always push -f',
    'git --no-pager push -f',
    'git push origin x 2>&1 && git push -f',
  ]);
});

test('pushes that reach main need approval however the target is spelled', () => {
  expectAll('ask', [
    'git push origin main',
    'git push -u origin main',
    'git push origin HEAD:main',
    'git push origin feature:main',
    'git push origin feature:refs/heads/main',
    'git push origin refs/heads/main',
    'git push origin x main',
    'git push origin "refs/heads/*:refs/heads/*"',
    'git push origin "$BRANCH"',
    'git push --all',
    'git -C . push origin main',
    'git push origin HEAD:master',
  ]);
  expectAll('ask', ['git push', 'git push origin', 'git push origin HEAD', 'git push -u origin HEAD', 'git merge feature'], { branch: 'main' });
  expectAll('allow', ['git push origin feature', 'git merge --abort', 'git merge --quit'], { branch: 'main' });
});

test('merge-and-push shapes are judged by the branch they end on', () => {
  expectAll(
    'ask',
    [
      'git checkout main && git push',
      'git checkout main && git merge feature && git push',
      'git switch main; git push origin',
      'git checkout main\ngit merge feature',
      'git checkout main && git pull && git merge feature --no-ff && git push origin HEAD',
      'cd /other && git push',
    ],
    { branches: { '/other': 'main' } },
  );
  expectAll('allow', ['git checkout -b feat && git push -u origin feat', 'git switch -c feat && git push'], { branch: 'main' });
});

test('wrappers, subshells and nested shells are unwrapped', () => {
  expectAll('ask', [
    "bash -c 'git push --force'",
    'sh -lc "git push origin main"',
    'eval "git push -f"',
    '(git push -f)',
    '{ git push -f; }',
    'echo hi | git push -f',
    'FOO=1 git push -f',
    'env GIT_X=1 git push -f',
    'env -u HOME git push -f',
    'command git push -f',
    'sudo -u root git push -f',
    'nohup git push -f &',
    'timeout 10 git push -f',
    'xargs -n1 git push -f',
    '/usr/bin/git push -f',
    '\\git push -f',
    'echo $(git push -f)',
    'echo `git push -f`',
    'if true; then git push -f; fi',
    'time git push -f',
  ]);
});

test('git aliases expand before matching', () => {
  expectAll('ask', ["git -c alias.p='push --force' p", 'git p', 'git up'], {
    aliases: { p: 'push --force', up: '!git push -f' },
  });
  expectAll('allow', ['git st', 'git unknown-thing'], { aliases: { st: 'status' } });
});

test('discarding or rewriting work needs approval', () => {
  expectAll('ask', [
    'git reset --hard',
    'git reset --hard HEAD~1',
    'git reset --ha',
    'git branch -D x',
    'git branch -d x',
    'git branch -df x',
    'git branch --delete x',
    'git clean -f',
    'git clean -fd',
    'git clean -xdf',
    'git clean --force',
    'git checkout -- .',
    'git checkout .',
    'git checkout -- src/a.ts',
    'git checkout HEAD -- src/a.ts',
    'git checkout -f main',
    'git restore .',
    'git restore src/a.ts',
    'git restore --source=HEAD~1 src/a.ts',
    'git restore --worktree --staged src/a.ts',
    'git switch -f other',
    'git rebase main',
    'git pull --rebase',
    'git pull -r',
    'git commit --amend',
    'git commit --amend --no-edit',
    'git commit -a --amend -m x',
    'git filter-branch --all',
  ]);
});

test('stash with staged work needs approval, including work staged earlier in the same command', () => {
  expectAll('ask', ['git stash', 'git stash push -m x', 'git stash pop', 'git -C ../other stash'], { staged: true });
  expectAll('ask', ['git add src/a.ts && git stash', 'git rm -r --cached x; git stash push']);
  expectAll('allow', ['git stash list', 'git stash show'], { staged: true });
});

test('hook bypasses are denied outright', () => {
  expectAll('deny', [
    'git commit --no-verify -m x',
    'git commit -n -m x',
    'git commit -anm x',
    'git commit -nm x',
    'git commit -m x --no-verif',
    'git push --no-verify',
    'git merge --no-verify feature',
    'git rebase --no-verify main',
    'git -c core.hooksPath=/dev/null commit -m x',
    'git -c core.hooksPath=/dev/null status',
    'HUSKY=0 git commit -m x',
    'export HUSKY=0',
    'git config core.hooksPath /dev/null',
    "git commit -m x && bash -c 'git push --no-verify'",
  ]);
});

test('the old approval prefix no longer approves anything', () => {
  expectAll('ask', ['LOOP_GIT_APPROVED=1 git reset --hard', 'LOOP_GIT_APPROVED=1 git push -f', 'LOOP_GIT_APPROVED=1 git push origin main']);
  expectAll('deny', ['LOOP_GIT_APPROVED=1 git commit --no-verify -m x']);
});

test('every risky segment is reported, not only the first', () => {
  const result = GitPolicy.evaluate('git push origin feature && git reset --hard && git branch -D x', fakeProbe(), '/repo');
  assert.deepEqual(result.asks, ['reset --hard discards uncommitted work', 'this deletes a branch']);
});

test('gh pr merge asks unless the base is a non-main branch', () => {
  expectAll('ask', ['gh pr merge 12', 'gh pr merge --squash 12 --delete-branch', 'gh pr merge -R o/r 12'], { prBase: 'main' });
  expectAll('ask', ['gh pr merge 12'], { prBase: 'unknown' });
  expectAll('allow', ['gh pr merge 12 --squash'], { prBase: 'post-hackathon' });
});

test('gh api writes to merge, ref and protection endpoints need approval', () => {
  expectAll('ask', [
    'gh api -X PUT repos/o/r/pulls/1/merge',
    'gh api --method PATCH repos/o/r/git/refs/heads/main -f sha=abc',
    'gh api repos/o/r/git/refs -f ref=refs/heads/main -f sha=abc',
    'gh api -X PUT repos/o/r/branches/main/protection --input p.json',
    'gh api -X PUT repos/o/r/contents/a.txt -f message=x',
  ]);
  expectAll('allow', ['gh api repos/o/r/branches/main', 'gh api -X GET repos/o/r/git/refs', 'gh api repos/o/r/pulls/1/comments -f body=x']);
});

function repoWithStagedFile() {
  const dir = mkdtempSync(join(tmpdir(), 'git-safety-'));
  const run = (...args) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  run('init', '-q', '-b', 'main');
  run('config', 'user.email', 'dev@example.com');
  run('config', 'user.name', 'Dev');
  writeFileSync(join(dir, 'a.txt'), 'a\n');
  run('add', 'a.txt');
  run('commit', '-q', '-m', 'init');
  writeFileSync(join(dir, 'b.txt'), 'b\n');
  run('add', 'b.txt');
  return dir;
}

function runHook(script, payload) {
  return spawnSync('bash', [join(hooksDir, script)], { input: JSON.stringify(payload), encoding: 'utf8' });
}

function bashPayload(command, extra = {}) {
  return { tool_name: 'Bash', tool_input: { command }, ...extra };
}

test('git-safety asks in interactive modes and blocks otherwise', () => {
  const cwd = repoWithStagedFile();
  const interactive = runHook('git-safety.sh', bashPayload('git push origin feature --force', { cwd, permission_mode: 'default' }));
  assert.equal(interactive.status, 0);
  const decision = JSON.parse(interactive.stdout).hookSpecificOutput;
  assert.equal(decision.permissionDecision, 'ask');
  assert.match(decision.permissionDecisionReason, /force push/);

  for (const mode of ['bypassPermissions', 'dontAsk', undefined]) {
    const blocked = runHook('git-safety.sh', bashPayload('LOOP_GIT_APPROVED=1 git push origin feature --force', { cwd, permission_mode: mode }));
    assert.equal(blocked.status, 2, String(mode));
    assert.match(blocked.stderr, /force push/);
    assert.equal(blocked.stdout, '');
  }
});

test('git-safety reads the real branch and staged state from the working directory', () => {
  const cwd = repoWithStagedFile();
  const onMain = runHook('git-safety.sh', bashPayload('git push', { cwd, permission_mode: 'default' }));
  assert.match(JSON.parse(onMain.stdout).hookSpecificOutput.permissionDecisionReason, /pushing to main/);
  const stash = runHook('git-safety.sh', bashPayload('git stash', { cwd, permission_mode: 'default' }));
  assert.match(JSON.parse(stash.stdout).hookSpecificOutput.permissionDecisionReason, /staged/);
  const status = runHook('git-safety.sh', bashPayload('git status', { cwd, permission_mode: 'bypassPermissions' }));
  assert.equal(status.status, 0);
  assert.equal(status.stdout, '');
});

test('git-safety denies hook bypasses in every mode and rejects bad input', () => {
  const cwd = repoWithStagedFile();
  const denied = runHook('git-safety.sh', bashPayload('git commit -anm x', { cwd, permission_mode: 'default' }));
  assert.equal(denied.status, 2);
  assert.match(denied.stderr, /never allowed/);
  const bad = spawnSync('bash', [join(hooksDir, 'git-safety.sh')], { input: 'not json', encoding: 'utf8' });
  assert.equal(bad.status, 2);
});

function attributionVerdict(payload) {
  return runHook('no-ai-attribution.sh', payload).status === 2 ? 'block' : 'allow';
}

test('attribution is blocked in commit messages and gh bodies in any casing', () => {
  const blocked = [
    'git commit -m "feat: x\n\nCo-Authored-By: Claude <noreply@anthropic.com>"',
    'git commit -m "x" -m "co-authored-by: someone"',
    'git commit -m "CO-AUTHORED-BY: Bot"',
    'git commit -m "Co authored by Claude"',
    'git commit -m "Generated with [Claude Code](https://claude.com/claude-code)"',
    'git commit -m "GENERATED BY AI"',
    'git commit -m "fix 🤖"',
    'git commit -m "Signed-off-by: Claude"',
    'git commit -m "x" --trailer "Assisted-by: Claude"',
    'git -C . commit -m "AI-generated change"',
    'git tag -a v1 -m "written by an AI"',
    'git merge feature -m "with the help of Claude"',
    'gh pr create --title x --body "Summary\n\nGenerated with Claude Code"',
    'gh pr edit 3 --body "Written by Claude"',
    'gh pr edit 3 -b "assisted-by: Claude"',
    'gh pr comment 3 --body "https://claude.ai/code/session_abc"',
    'gh issue create --title x --body "Created with the help of Claude"',
    'gh release create v1 --notes "Generated using Claude"',
    'gh api repos/o/r/issues -f body="Co-Authored-By: Claude"',
  ];
  for (const command of blocked) {
    assert.equal(attributionVerdict(bashPayload(command)), 'block', command);
  }
});

test('attribution is blocked inside files referenced by commit and gh commands', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'attribution-'));
  writeFileSync(join(cwd, 'msg.txt'), 'feat: x\n\nCo-Authored-By: Claude\n');
  writeFileSync(join(cwd, 'body.md'), 'Summary\n\nGenerated with Claude Code\n');
  const blocked = [
    'git commit -F msg.txt',
    'git commit -Fmsg.txt',
    'git commit --file=msg.txt',
    'git commit -m "$(cat msg.txt)"',
    "gh pr create --title x --body-file 'body.md'",
    'gh pr create --title x --body-file=body.md',
    'gh pr edit 3 -F body.md',
    'gh api repos/o/r/issues -F body=@body.md',
    `gh issue create --title x --body-file ${join(cwd, 'body.md')}`,
  ];
  for (const command of blocked) {
    assert.equal(attributionVerdict(bashPayload(command, { cwd })), 'block', command);
  }
});

test('clean commit messages, bodies and unrelated commands pass attribution checks', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'attribution-'));
  writeFileSync(join(cwd, 'clean.md'), 'Adds a guard for force pushes.\n');
  const allowed = [
    'git commit -m "fix: tidy hooks"',
    'git commit -F clean.md',
    'git log --grep=claude --oneline',
    'gh pr create --title x --body "Adds a guard"',
    'gh pr create --title x --body-file clean.md',
    'gh pr view 3 --json title',
    'ls .claude/hooks',
    'echo "Co-Authored-By: someone" > notes.txt',
  ];
  for (const command of allowed) {
    assert.equal(attributionVerdict(bashPayload(command, { cwd })), 'allow', command);
  }
});

test('attribution is blocked in written files except hooks and instruction files', () => {
  const text = 'export const note = "Generated with Claude Code";\n';
  assert.equal(attributionVerdict({ tool_name: 'Write', tool_input: { file_path: '/r/src/a.ts', content: text } }), 'block');
  assert.equal(attributionVerdict({ tool_name: 'Edit', tool_input: { file_path: '/r/README.md', new_string: 'Co-Authored-By: Claude' } }), 'block');
  assert.equal(
    attributionVerdict({ tool_name: 'MultiEdit', tool_input: { file_path: '/r/a.md', edits: [{ new_string: 'ok' }, { new_string: 'written by AI' }] } }),
    'block',
  );
  assert.equal(attributionVerdict({ tool_name: 'Write', tool_input: { file_path: '/r/.claude/hooks/x.sh', content: text } }), 'allow');
  assert.equal(attributionVerdict({ tool_name: 'Write', tool_input: { file_path: '/r/CLAUDE.md', content: text } }), 'allow');
  assert.equal(attributionVerdict({ tool_name: 'Write', tool_input: { file_path: '/r/src/a.ts', content: 'export const a = 1;\n' } }), 'allow');
});

function commentVerdict(filePath, content) {
  const payload = { tool_name: 'Write', tool_input: { file_path: filePath, content } };
  return runHook('no-code-comments.sh', payload).status === 2 ? 'block' : 'allow';
}

const SLASHES = '/' + '/';
const OPEN = '/' + '*';

test('comments are blocked in every form for typescript files', () => {
  const blocked = [
    `${SLASHES} note`,
    `${SLASHES}note`,
    `  ${SLASHES} note`,
    `const a = 1; ${SLASHES} note`,
    `const a = 1;${SLASHES}note`,
    `${OPEN} note */`,
    `${OPEN}note*/`,
    `${OPEN}* doc */`,
    `<View>{${OPEN} note */}</View>`,
    `<View>{${OPEN}note*/}</View>`,
    `${OPEN}\n * note\n */`,
    `foo(${SLASHES} note\n)`,
  ];
  for (const content of blocked) {
    for (const file of ['/r/src/a.ts', '/r/src/a.tsx', '/r/src/a.mts']) {
      assert.equal(commentVerdict(file, `const x = 1;\n${content}\n`), 'block', `${file}: ${content}`);
    }
  }
});

test('code with urls, globs, regexes and tool directives passes', () => {
  const allowed = [
    "const url = 'https://example.com/a';",
    "const cdn = '//cdn.example.com/a.js';",
    "const glob = ['src', '**', '*.ts'].join('/');",
    'const re = /a\\/\\/b/;',
    `${SLASHES} @ts-expect-error legacy`,
    `${SLASHES} eslint-disable-next-line no-console`,
    `${OPEN} eslint-disable react/no-unescaped-entities */`,
    `{${OPEN} eslint-disable-next-line */}`,
    '/// <reference types="node" />',
    'const total = a * b;',
  ];
  for (const content of allowed) {
    assert.equal(commentVerdict('/r/src/a.tsx', `${content}\n`), 'allow', content);
  }
  assert.equal(commentVerdict('/r/README.md', `${SLASHES} note\n`), 'allow');
});

test('comments already in the old text are not flagged again, new ones are', () => {
  const existing = `${SLASHES} legacy`;
  const edit = (newString) => ({
    tool_name: 'Edit',
    tool_input: { file_path: '/r/src/a.ts', old_string: `${existing}\nconst a = 1;`, new_string: newString },
  });
  assert.equal(runHook('no-code-comments.sh', edit(`${existing}\nconst a = 2;`)).status, 0);
  assert.equal(runHook('no-code-comments.sh', edit(`${existing}\nconst a = 2; ${SLASHES} new`)).status, 2);
  const multi = {
    tool_name: 'MultiEdit',
    tool_input: {
      file_path: '/r/src/a.ts',
      edits: [
        { old_string: 'a', new_string: 'b' },
        { old_string: 'c', new_string: `d ${SLASHES} note` },
      ],
    },
  };
  assert.equal(runHook('no-code-comments.sh', multi).status, 2);
});

test('shell scripts block hash comments but allow shebangs and directives', () => {
  assert.equal(commentVerdict('/r/a.sh', '#!/usr/bin/env bash\nset -e\n'), 'allow');
  assert.equal(commentVerdict('/r/a.sh', '# shellcheck disable=SC2086\nls $x\n'), 'allow');
  assert.equal(commentVerdict('/r/a.sh', 'ls # note\n'), 'block');
});
