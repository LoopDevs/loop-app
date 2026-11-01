import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ShellScript, basename } from './shell-script.mjs';

const PROTECTED_BRANCHES = new Set(['main', 'master']);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh']);
const MAX_DEPTH = 6;
const PROMPTABLE_MODES = new Set(['default', 'acceptEdits', 'plan']);
const NO_VERIFY = /^--no-veri(?:f(?:y)?)?$/;
const GITHUB_WRITE_ENDPOINT = /\/(?:merges?|git\/(?:refs|commits|trees)|branches|protection|rulesets?|contents)(?:\/|$)/;

const READ_ONLY = new Set([
  'status',
  'log',
  'diff',
  'show',
  'blame',
  'describe',
  'rev-parse',
  'rev-list',
  'ls-files',
  'ls-tree',
  'ls-remote',
  'cat-file',
  'shortlog',
  'grep',
  'fetch',
  'remote',
  'reflog',
  'whatchanged',
]);

const KNOWN = new Set([
  ...READ_ONLY,
  'add',
  'apply',
  'branch',
  'checkout',
  'clean',
  'commit',
  'config',
  'filter-branch',
  'merge',
  'mv',
  'pull',
  'push',
  'rebase',
  'reset',
  'restore',
  'rm',
  'stash',
  'switch',
]);

const SPECS = {
  commit: {
    valueShort: 'mFCct',
    attachedShort: 'uS',
    valueLong: ['message', 'file', 'reuse-message', 'reedit-message', 'template', 'author', 'date', 'cleanup', 'fixup', 'squash', 'trailer', 'pathspec-from-file'],
  },
  push: { valueShort: 'o', valueLong: ['repo', 'push-option', 'receive-pack', 'exec'] },
  merge: { valueShort: 'mFsX', valueLong: ['message', 'file', 'strategy', 'strategy-option', 'into-name'] },
  pull: { valueShort: 'sX', valueLong: ['strategy', 'strategy-option', 'depth', 'deepen', 'shallow-since', 'shallow-exclude', 'jobs'] },
  branch: {
    valueShort: 'u',
    valueLong: ['set-upstream-to', 'contains', 'no-contains', 'merged', 'no-merged', 'points-at', 'sort', 'format', 'column', 'abbrev'],
  },
  clean: { valueShort: 'e', valueLong: ['exclude'] },
  checkout: { valueShort: 'bB', valueLong: ['orphan', 'conflict', 'pathspec-from-file', 'unified'] },
  switch: { valueShort: 'cC', valueLong: ['create', 'force-create', 'orphan', 'conflict'] },
  restore: { valueShort: 's', valueLong: ['source', 'pathspec-from-file'] },
  stash: { valueShort: 'm', valueLong: ['message', 'pathspec-from-file'] },
};

const GIT_VALUE_GLOBALS = new Set(['--git-dir', '--work-tree', '--namespace', '--super-prefix']);
const HOOKS_PATH_KEY = /^core\.hookspath$/i;

class Options {
  constructor() {
    this.shorts = new Set();
    this.shortValues = new Map();
    this.longs = new Map();
    this.positionals = [];
    this.rest = [];
    this.hasSeparator = false;
  }

  static scan(args, spec = {}) {
    const valueShort = spec.valueShort ?? '';
    const attachedShort = spec.attachedShort ?? '';
    const valueLong = spec.valueLong ?? [];
    const options = new Options();
    for (let i = 0; i < args.length; i += 1) {
      const arg = args[i];
      if (arg === '--') {
        options.hasSeparator = true;
        options.rest = args.slice(i + 1);
        break;
      }
      if (arg.startsWith('--')) {
        const equals = arg.indexOf('=');
        const name = equals === -1 ? arg.slice(2) : arg.slice(2, equals);
        let value = equals === -1 ? true : arg.slice(equals + 1);
        if (equals === -1 && valueLong.includes(name)) {
          i += 1;
          value = args[i] ?? '';
        }
        options.longs.set(name, value);
      } else if (arg.startsWith('-') && arg.length > 1) {
        i = options.cluster(arg, args, i, valueShort, attachedShort);
      } else {
        options.positionals.push(arg);
      }
    }
    return options;
  }

  cluster(arg, args, index, valueShort, attachedShort) {
    let next = index;
    for (let k = 1; k < arg.length; k += 1) {
      const letter = arg[k];
      this.shorts.add(letter);
      if (valueShort.includes(letter)) {
        if (k === arg.length - 1) {
          next += 1;
          this.shortValues.set(letter, args[next] ?? '');
        } else {
          this.shortValues.set(letter, arg.slice(k + 1));
        }
        break;
      }
      if (attachedShort.includes(letter)) {
        break;
      }
    }
    return next;
  }

  hasLong(name, minLength = name.length) {
    for (const key of this.longs.keys()) {
      if (key.length >= minLength && name.startsWith(key)) {
        return true;
      }
    }
    return false;
  }

  hasShort(letter) {
    return this.shorts.has(letter);
  }

  get paths() {
    return [...this.positionals, ...this.rest];
  }
}

export class GitProbe {
  git(dir, args) {
    return spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 4000 });
  }

  branchOf(dir) {
    const result = this.git(dir, ['symbolic-ref', '--short', 'HEAD']);
    return result.status === 0 ? result.stdout.trim() : '';
  }

  hasStaged(dir) {
    return this.git(dir, ['diff', '--cached', '--quiet']).status === 1;
  }

  knowsRef(dir, name) {
    const commit = this.git(dir, ['rev-parse', '--verify', '--quiet', `${name}^{commit}`]);
    if (commit.status === 0) {
      return true;
    }
    const remote = this.git(dir, ['for-each-ref', '--count=1', '--format=%(refname)', `refs/remotes/*/${name}`]);
    return remote.status === 0 && remote.stdout.trim() !== '';
  }

  alias(dir, name) {
    const result = this.git(dir, ['config', '--get', `alias.${name}`]);
    return result.status === 0 ? result.stdout.trim() : '';
  }

  prBase(dir, selector, repo) {
    if (selector.includes('$')) {
      return 'unknown';
    }
    const args = ['pr', 'view'];
    if (selector) {
      args.push(selector);
    }
    if (repo) {
      args.push('--repo', repo);
    }
    args.push('--json', 'baseRefName', '-q', '.baseRefName');
    const result = spawnSync('gh', args, { cwd: dir, encoding: 'utf8', timeout: 6000 });
    const base = result.status === 0 ? result.stdout.trim() : '';
    return base || 'unknown';
  }
}

export class GitPolicy {
  constructor(probe, cwd) {
    this.probe = probe;
    this.cwd = cwd;
    this.branches = new Set();
    this.stages = false;
    this.asks = [];
    this.denies = [];
    this.addBranch(probe.branchOf(cwd));
  }

  static evaluate(command, probe, cwd) {
    const policy = new GitPolicy(probe, cwd);
    policy.check(command, 0);
    return { asks: policy.asks, denies: policy.denies };
  }

  ask(reason) {
    if (!this.asks.includes(reason)) {
      this.asks.push(reason);
    }
  }

  deny(reason) {
    if (!this.denies.includes(reason)) {
      this.denies.push(reason);
    }
  }

  addBranch(name) {
    if (name) {
      this.branches.add(name);
    }
  }

  currentBranches(dir) {
    const branches = new Set(this.branches);
    if (dir !== this.cwd) {
      const branch = this.probe.branchOf(dir);
      if (branch) {
        branches.add(branch);
      }
    }
    return branches;
  }

  touchesProtected(names) {
    for (const name of names) {
      if (PROTECTED_BRANCHES.has(name)) {
        return true;
      }
    }
    return false;
  }

  check(source, depth) {
    if (depth > MAX_DEPTH) {
      this.ask('this command nests too deeply to inspect');
      return;
    }
    const parsed = ShellScript.parse(source);
    if (parsed.unterminated) {
      this.ask('this command has an unclosed quote or bracket, so it cannot be inspected');
    }
    for (const words of parsed.commands) {
      this.command(words, depth);
    }
    for (const nested of parsed.nested) {
      this.check(nested, depth + 1);
    }
  }

  command(words, depth) {
    const { assignments, words: rest } = ShellScript.unwrap(words);
    if (rest.length === 0) {
      return;
    }
    const program = basename(rest[0]);
    const args = rest.slice(1);
    if (program === 'git') {
      this.checkHookSkipEnvironment(assignments);
      this.git(args, depth);
    } else if (program === 'gh') {
      this.gh(args);
    } else if (program === 'cd' || program === 'pushd') {
      this.changeDirectory(args[0]);
    } else if (program === 'export') {
      this.checkHookSkipEnvironment(new Map(args.map((arg) => arg.split(/=(.*)/s))));
    } else if (program === 'eval') {
      this.check(args.join(' '), depth + 1);
    } else if (SHELLS.has(program)) {
      this.shellCommand(args, depth);
    }
  }

  checkHookSkipEnvironment(assignments) {
    for (const [name, value] of assignments) {
      const disabled = /^(?:HUSKY|LEFTHOOK)$/.test(name) && value === '0';
      const skipped = /^(?:HUSKY_SKIP_HOOKS|SKIP_SIMPLE_GIT_HOOKS)$/.test(name) && value !== '' && value !== '0';
      const configured = /^GIT_CONFIG_KEY_[0-9]+$/.test(name) ? HOOKS_PATH_KEY.test(value) : name === 'GIT_CONFIG_PARAMETERS' && /core\.hookspath/i.test(value);
      if (disabled || skipped || configured) {
        this.deny('bypassing git hooks is never allowed');
      }
    }
  }

  shellCommand(args, depth) {
    for (let i = 0; i < args.length; i += 1) {
      if (/^-[a-zA-Z]*c[a-zA-Z]*$/.test(args[i]) && args[i + 1] !== undefined) {
        this.check(args[i + 1], depth + 1);
        return;
      }
    }
  }

  changeDirectory(target) {
    if (!target || target === '-' || target.includes('$')) {
      return;
    }
    const expanded = target.startsWith('~') ? homedir() + target.slice(1) : target;
    this.cwd = resolve(this.cwd, expanded);
    this.addBranch(this.probe.branchOf(this.cwd));
  }

  git(initial, depth) {
    const args = [...initial];
    let dir = this.cwd;
    const config = new Map();
    while (args.length > 0 && args[0].startsWith('-')) {
      const flag = args.shift();
      if (flag === '-C') {
        dir = resolve(dir, args.shift() ?? '.');
      } else if (flag === '-c') {
        const [key, value = ''] = (args.shift() ?? '').split(/=(.*)/s);
        config.set(key.toLowerCase(), value);
      } else if (flag === '--config-env' || flag.startsWith('--config-env=')) {
        const pair = flag.includes('=') ? flag.slice(flag.indexOf('=') + 1) : (args.shift() ?? '');
        if (HOOKS_PATH_KEY.test(pair.split('=')[0])) {
          this.deny('bypassing git hooks is never allowed');
        }
      } else if (GIT_VALUE_GLOBALS.has(flag)) {
        args.shift();
      }
    }
    if ([...config.keys()].some((key) => HOOKS_PATH_KEY.test(key))) {
      this.deny('bypassing git hooks is never allowed');
    }
    let sub = args.shift();
    for (let hops = 0; sub && !KNOWN.has(sub) && hops < MAX_DEPTH; hops += 1) {
      const definition = config.get(`alias.${sub}`) ?? this.probe.alias(dir, sub);
      if (!definition) {
        return;
      }
      if (definition.startsWith('!')) {
        this.check(`${definition.slice(1)} ${args.map(shellQuote).join(' ')}`, depth + 1);
        return;
      }
      args.unshift(...(ShellScript.parse(definition).commands[0] ?? []));
      sub = args.shift();
    }
    if (!sub || READ_ONLY.has(sub)) {
      return;
    }
    if (args.some((arg) => NO_VERIFY.test(arg))) {
      this.deny('bypassing git hooks (--no-verify) is never allowed');
    }
    const options = Options.scan(args, SPECS[sub]);
    this.subcommand(sub, options, dir);
  }

  subcommand(sub, options, dir) {
    switch (sub) {
      case 'push':
        this.push(options, dir);
        break;
      case 'commit':
        this.commit(options);
        break;
      case 'merge':
        this.merge(options, dir);
        break;
      case 'reset':
        if (options.hasLong('hard', 2)) {
          this.ask('reset --hard discards uncommitted work');
        }
        break;
      case 'branch':
        if (options.hasShort('d') || options.hasShort('D') || options.hasLong('delete', 3)) {
          this.ask('this deletes a branch');
        }
        if (options.hasShort('f') || options.hasShort('M') || options.hasLong('force', 3)) {
          this.ask('this overwrites or renames a branch');
        }
        break;
      case 'clean':
        this.clean(options);
        break;
      case 'checkout':
        this.checkout(options, dir);
        break;
      case 'switch':
        this.switchBranch(options);
        break;
      case 'restore':
        this.restore(options);
        break;
      case 'rebase':
      case 'filter-branch':
        this.ask('rebasing rewrites history');
        break;
      case 'pull':
        if (options.hasShort('r') || options.hasLong('rebase', 6)) {
          this.ask('rebasing rewrites history');
        }
        break;
      case 'stash':
        this.stash(options, dir);
        break;
      case 'add':
      case 'rm':
      case 'mv':
        this.stages = true;
        break;
      case 'apply':
        if (options.hasLong('index', 3) || options.hasLong('cached', 3)) {
          this.stages = true;
        }
        break;
      case 'config':
        if (options.positionals.some((arg) => HOOKS_PATH_KEY.test(arg))) {
          this.deny('bypassing git hooks is never allowed');
        }
        break;
      default:
        break;
    }
  }

  commit(options) {
    if (options.hasShort('n')) {
      this.deny('bypassing git hooks (--no-verify) is never allowed');
    }
    if (options.hasLong('amend', 3)) {
      this.ask('amending rewrites the last commit');
    }
  }

  merge(options, dir) {
    if (options.hasLong('abort') || options.hasLong('quit')) {
      return;
    }
    if (this.touchesProtected(this.currentBranches(dir))) {
      this.ask("merging into main puts changes live; state what's going live first");
    }
  }

  clean(options) {
    const forced = options.hasShort('f') || options.hasLong('force', 3);
    const dryRun = options.hasShort('n') || options.hasLong('dry-run', 3);
    if (forced && !dryRun) {
      this.ask('git clean deletes untracked files');
    }
  }

  checkout(options, dir) {
    const creates = options.hasShort('b') || options.hasShort('B') || options.hasLong('orphan');
    const lone = !creates && !options.hasSeparator && options.positionals.length === 1 ? options.positionals[0] : '';
    const isPath = lone !== '' && lone !== '-' && !this.probe.knowsRef(dir, lone);
    const discards =
      isPath ||
      options.hasShort('f') ||
      options.hasShort('p') ||
      options.hasLong('force', 3) ||
      options.hasLong('patch', 3) ||
      (options.hasSeparator && options.rest.length > 0) ||
      options.positionals.includes('.') ||
      (options.positionals.length >= 2 && !creates);
    if (discards) {
      this.ask('this discards uncommitted changes');
    }
    const created = options.shortValues.get('b') ?? options.shortValues.get('B') ?? options.longs.get('orphan');
    if (typeof created === 'string') {
      this.branches = new Set([created]);
    } else if (lone !== '' && !isPath) {
      this.addBranch(lone);
    }
  }

  switchBranch(options) {
    if (options.hasShort('f') || options.hasLong('force', 3) || options.hasLong('discard-changes', 3)) {
      this.ask('this discards uncommitted changes');
    }
    const target =
      options.shortValues.get('c') ??
      options.shortValues.get('C') ??
      options.longs.get('create') ??
      options.longs.get('force-create') ??
      options.positionals[0];
    if (typeof target === 'string' && target !== '-') {
      this.branches = new Set([target]);
    }
  }

  restore(options) {
    const worktree = options.hasShort('W') || options.hasLong('worktree', 3);
    const staged = options.hasShort('S') || options.hasLong('staged', 3);
    if ((worktree || !staged) && options.paths.length > 0) {
      this.ask('this discards uncommitted changes');
    }
  }

  stash(options, dir) {
    const action = options.positionals[0];
    if (action === 'list' || action === 'show') {
      return;
    }
    if (this.stages || this.probe.hasStaged(dir)) {
      this.ask('git stash with staged changes can lose work');
    }
  }

  push(options, dir) {
    const forced =
      options.hasShort('f') ||
      options.hasLong('force') ||
      options.hasLong('force-with-lease', 7) ||
      options.hasLong('force-if-includes', 7) ||
      options.hasLong('mirror', 3);
    const operands = options.paths;
    const refspecs = options.longs.has('repo') ? operands : operands.slice(1);
    if (forced || refspecs.some((refspec) => refspec.startsWith('+'))) {
      this.ask('force push rewrites remote history');
    }
    const deletes = options.hasShort('d') || options.hasLong('delete', 3) || options.hasLong('prune', 3);
    if (deletes || refspecs.some((refspec) => refspec.startsWith(':'))) {
      this.ask('this deletes a remote branch');
    }
    if (options.hasLong('all', 3) || options.hasLong('mirror', 3) || this.pushTargetsProtected(refspecs, dir)) {
      this.ask("pushing to main puts changes live; state what's going live first");
    }
  }

  pushTargetsProtected(refspecs, dir) {
    const current = this.currentBranches(dir);
    if (refspecs.length === 0) {
      return this.touchesProtected(current);
    }
    return refspecs.some((refspec) => {
      const stripped = refspec.replace(/^\+/, '');
      if (/[$*?[`]/.test(stripped)) {
        return true;
      }
      const colon = stripped.lastIndexOf(':');
      const destination = (colon === -1 ? stripped : stripped.slice(colon + 1)).replace(/^refs\/heads\//, '');
      if (destination === 'HEAD' || destination === '@') {
        return this.touchesProtected(current);
      }
      return PROTECTED_BRANCHES.has(destination);
    });
  }

  gh(args) {
    const options = Options.scan(args, { valueShort: 'R', valueLong: ['repo'] });
    const [group, action] = options.positionals;
    if (group === 'pr' && action === 'merge') {
      this.ghPrMerge(args);
    } else if (group === 'api') {
      this.ghApi(args);
    }
  }

  ghPrMerge(args) {
    const options = Options.scan(args, {
      valueShort: 'RbFtA',
      valueLong: ['repo', 'body', 'body-file', 'subject', 'author-email', 'match-head-commit'],
    });
    const selector = options.positionals[2] ?? '';
    const repo = options.shortValues.get('R') ?? options.longs.get('repo');
    const base = this.probe.prBase(this.cwd, selector, typeof repo === 'string' ? repo : '');
    if (PROTECTED_BRANCHES.has(base) || base === 'unknown') {
      this.ask(`merging this PR puts changes live on main (base: ${base})`);
    }
  }

  ghApi(args) {
    const options = Options.scan(args, {
      valueShort: 'XfFHqt',
      valueLong: ['method', 'field', 'raw-field', 'header', 'jq', 'template', 'input', 'hostname', 'cache', 'preview'],
    });
    const endpoint = options.positionals[1] ?? '';
    const method = String(options.shortValues.get('X') ?? options.longs.get('method') ?? '').toUpperCase();
    const hasFields = options.hasShort('f') || options.hasShort('F') || options.hasLong('field') || options.hasLong('raw-field') || options.hasLong('input');
    const writes = method ? method !== 'GET' : hasFields;
    if (writes && GITHUB_WRITE_ENDPOINT.test(endpoint)) {
      this.ask('this changes branches or merges directly on GitHub');
    }
    const graphqlWrites = options.hasLong('input') || args.some((arg) => /mutation|query=@/i.test(arg));
    if (endpoint === 'graphql' && graphqlWrites) {
      this.ask('this may change branches or merges directly on GitHub through graphql');
    }
  }
}

function shellQuote(word) {
  return `'${word.replaceAll("'", `'\\''`)}'`;
}

function respond(result, mode) {
  if (result.denies.length > 0) {
    process.stderr.write(`Blocked: ${result.denies.join('; ')}.\n`);
    return 2;
  }
  if (result.asks.length === 0) {
    return 0;
  }
  const reason = result.asks.join('; ');
  if (PROMPTABLE_MODES.has(mode)) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'ask',
          permissionDecisionReason: `${reason}. Needs the user's yes for this exact command.`,
        },
      }),
    );
    return 0;
  }
  process.stderr.write(`Blocked: ${reason}.\nThis needs the user's explicit yes and cannot be approved from here. Explain what it does and ask the user to run it themselves (the ! prefix runs a command in the session).\n`);
  return 2;
}

function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    process.stderr.write('Blocked: git-safety hook needs a JSON object on stdin.\n');
    return 2;
  }
  if (input === null || typeof input !== 'object') {
    process.stderr.write('Blocked: git-safety hook needs a JSON object on stdin.\n');
    return 2;
  }
  const command = input.tool_input?.command ?? '';
  const cwd = input.cwd ?? process.cwd();
  return respond(GitPolicy.evaluate(command, new GitProbe(), cwd), input.permission_mode);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`Blocked: git-safety hook failed (${error.message}).\n`);
    process.exitCode = 2;
  }
}
