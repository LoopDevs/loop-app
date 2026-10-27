const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=/;
const HEREDOC = /^<<(-?)[ \t]*(?:'([^']*)'|"([^"]*)"|\\?([A-Za-z_][A-Za-z0-9_-]*))/;
const KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'do', 'while', 'until', '!', '{', '}', 'fi', 'done', 'esac', 'time', 'coproc']);

const WRAPPERS = new Map([
  ['env', { value: ['-u', '-C', '-S', '--unset', '--chdir'], assignments: true }],
  ['command', {}],
  ['builtin', {}],
  ['exec', { value: ['-a'] }],
  ['nohup', {}],
  ['nice', { value: ['-n'] }],
  ['stdbuf', {}],
  ['sudo', { value: ['-u', '-g', '-h', '-p', '-C', '-r', '-t', '-U', '-D'] }],
  ['doas', { value: ['-u', '-C'] }],
  ['timeout', { value: ['-s', '-k'], positionals: 1 }],
  ['xargs', { value: ['-n', '-I', '-L', '-P', '-s', '-E', '-d', '-a', '-J'] }],
]);

export function basename(word) {
  return word.split('/').pop();
}

export class ShellScript {
  constructor(source) {
    this.source = source;
    this.commands = [];
    this.nested = [];
    this.words = [];
    this.word = '';
    this.inWord = false;
    this.skipNextWord = false;
    this.pendingHeredocs = [];
    this.index = 0;
  }

  static parse(source) {
    const script = new ShellScript(source);
    script.run();
    return { commands: script.commands, nested: script.nested };
  }

  static unwrap(words) {
    const assignments = new Map();
    const rest = [...words];
    for (;;) {
      while (rest.length > 0 && KEYWORDS.has(rest[0])) {
        rest.shift();
      }
      if (rest.length === 0) {
        break;
      }
      const assignment = ASSIGNMENT.exec(rest[0]);
      if (assignment) {
        assignments.set(assignment[1], rest[0].slice(assignment[0].length));
        rest.shift();
        continue;
      }
      const wrapper = WRAPPERS.get(basename(rest[0]));
      if (!wrapper) {
        break;
      }
      rest.shift();
      ShellScript.skipWrapperArguments(rest, wrapper, assignments);
    }
    return { assignments, words: rest };
  }

  static skipWrapperArguments(rest, wrapper, assignments) {
    let positionals = wrapper.positionals ?? 0;
    while (rest.length > 0) {
      const word = rest[0];
      const assignment = ASSIGNMENT.exec(word);
      if (word.startsWith('-') && word.length > 1) {
        rest.shift();
        if (wrapper.value?.includes(word)) {
          rest.shift();
        }
      } else if (wrapper.assignments && assignment) {
        assignments.set(assignment[1], word.slice(assignment[0].length));
        rest.shift();
      } else if (positionals > 0) {
        rest.shift();
        positionals -= 1;
      } else {
        break;
      }
    }
  }

  static substitutions(text) {
    const found = [];
    let i = 0;
    while (i < text.length) {
      const ch = text[i];
      if (ch === '\\') {
        i += 2;
      } else if (ch === '$' && text[i + 1] === '(') {
        const end = ShellScript.closingParen(text, i + 2);
        found.push(text.slice(i + 2, end));
        i = end + 1;
      } else if (ch === '`') {
        const end = ShellScript.closingBacktick(text, i + 1);
        found.push(text.slice(i + 1, end));
        i = end + 1;
      } else {
        i += 1;
      }
    }
    return found;
  }

  static closingParen(text, start) {
    let depth = 1;
    let i = start;
    while (i < text.length) {
      const ch = text[i];
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === "'") {
        const end = text.indexOf("'", i + 1);
        i = end === -1 ? text.length : end + 1;
        continue;
      }
      if (ch === '"') {
        i = ShellScript.closingDoubleQuote(text, i + 1) + 1;
        continue;
      }
      if (ch === '(') {
        depth += 1;
      } else if (ch === ')') {
        depth -= 1;
        if (depth === 0) {
          return i;
        }
      }
      i += 1;
    }
    return text.length;
  }

  static closingDoubleQuote(text, start) {
    let i = start;
    while (i < text.length) {
      const ch = text[i];
      if (ch === '\\') {
        i += 2;
      } else if (ch === '"') {
        return i;
      } else if (ch === '$' && text[i + 1] === '(') {
        i = ShellScript.closingParen(text, i + 2) + 1;
      } else {
        i += 1;
      }
    }
    return text.length;
  }

  static closingBacktick(text, start) {
    let i = start;
    while (i < text.length) {
      if (text[i] === '\\') {
        i += 2;
      } else if (text[i] === '`') {
        return i;
      } else {
        i += 1;
      }
    }
    return text.length;
  }

  static unescapeDoubleQuoted(raw) {
    return raw.replace(/\\([\\"$`\n])/g, (_, ch) => (ch === '\n' ? '' : ch));
  }

  append(text) {
    this.word += text;
    this.inWord = true;
  }

  endWord() {
    if (!this.inWord) {
      return;
    }
    if (this.skipNextWord) {
      this.skipNextWord = false;
    } else {
      this.words.push(this.word);
    }
    this.word = '';
    this.inWord = false;
  }

  endCommand() {
    this.endWord();
    this.skipNextWord = false;
    if (this.words.length > 0) {
      this.commands.push(this.words);
    }
    this.words = [];
  }

  run() {
    const source = this.source;
    while (this.index < source.length) {
      const ch = source[this.index];
      const next = source[this.index + 1];
      if (ch === '\\') {
        this.escape();
      } else if (ch === "'") {
        this.singleQuoted();
      } else if (ch === '"') {
        this.doubleQuoted();
      } else if (ch === '$' && next === '(') {
        this.dollarParen(this.index + 2);
      } else if (ch === '$' && next === "'") {
        this.ansiQuoted();
      } else if (ch === '$' && next === '{') {
        this.braceExpansion();
      } else if (ch === '`') {
        this.backtick();
      } else if ((ch === '<' || ch === '>') && next === '(') {
        this.dollarParen(this.index + 2);
      } else if (ch === '<' || ch === '>' || (ch === '&' && next === '>')) {
        this.redirect();
      } else if (ch === '\n') {
        this.endCommand();
        this.index += 1;
        this.readHeredocBodies();
      } else if (ch === ' ' || ch === '\t') {
        this.endWord();
        this.index += 1;
      } else if (ch === '#' && !this.inWord) {
        const end = source.indexOf('\n', this.index);
        this.index = end === -1 ? source.length : end;
      } else if ('&|;()'.includes(ch)) {
        this.endCommand();
        this.index += source.startsWith('&&', this.index) || source.startsWith('||', this.index) || source.startsWith('|&', this.index) || source.startsWith(';;', this.index) ? 2 : 1;
      } else {
        this.append(ch);
        this.index += 1;
      }
    }
    this.endCommand();
  }

  escape() {
    const next = this.source[this.index + 1];
    if (next === '\n') {
      this.index += 2;
      return;
    }
    this.append(next ?? '');
    this.index += 2;
  }

  singleQuoted() {
    const end = this.source.indexOf("'", this.index + 1);
    const stop = end === -1 ? this.source.length : end;
    this.append(this.source.slice(this.index + 1, stop));
    this.index = stop + 1;
  }

  ansiQuoted() {
    let i = this.index + 2;
    let text = '';
    while (i < this.source.length && this.source[i] !== "'") {
      if (this.source[i] === '\\') {
        text += this.source[i + 1] ?? '';
        i += 2;
      } else {
        text += this.source[i];
        i += 1;
      }
    }
    this.append(text);
    this.index = i + 1;
  }

  doubleQuoted() {
    const end = ShellScript.closingDoubleQuote(this.source, this.index + 1);
    const raw = this.source.slice(this.index + 1, end);
    this.nested.push(...ShellScript.substitutions(raw));
    this.append(ShellScript.unescapeDoubleQuoted(raw));
    this.index = end + 1;
  }

  dollarParen(start) {
    const end = ShellScript.closingParen(this.source, start);
    this.nested.push(this.source.slice(start, end));
    this.append('$()');
    this.index = end + 1;
  }

  backtick() {
    const end = ShellScript.closingBacktick(this.source, this.index + 1);
    this.nested.push(this.source.slice(this.index + 1, end));
    this.append('$()');
    this.index = end + 1;
  }

  braceExpansion() {
    const end = this.source.indexOf('}', this.index);
    const stop = end === -1 ? this.source.length : end + 1;
    this.append(this.source.slice(this.index, stop));
    this.index = stop;
  }

  redirect() {
    const rest = this.source.slice(this.index);
    const heredoc = HEREDOC.exec(rest);
    if (heredoc) {
      this.endWord();
      this.pendingHeredocs.push({
        delimiter: heredoc[2] ?? heredoc[3] ?? heredoc[4],
        stripTabs: heredoc[1] === '-',
        expands: heredoc[2] === undefined && heredoc[3] === undefined && !rest.startsWith('<<\\'),
      });
      this.index += heredoc[0].length;
      return;
    }
    const operator = /^(?:&>>?|[<>]+&?[0-9]*-?)/.exec(rest)[0];
    if (/^[0-9]+$/.test(this.word)) {
      this.word = '';
      this.inWord = false;
    } else {
      this.endWord();
    }
    this.skipNextWord = !/^[<>]+&[0-9]+-?$/.test(operator);
    this.index += operator.length;
  }

  readHeredocBodies() {
    for (const heredoc of this.pendingHeredocs) {
      const body = [];
      while (this.index < this.source.length) {
        const end = this.source.indexOf('\n', this.index);
        const stop = end === -1 ? this.source.length : end;
        const line = this.source.slice(this.index, stop);
        this.index = Math.min(stop + 1, this.source.length);
        const candidate = heredoc.stripTabs ? line.replace(/^\t+/, '') : line;
        if (candidate === heredoc.delimiter) {
          break;
        }
        body.push(line);
      }
      if (heredoc.expands) {
        this.nested.push(...ShellScript.substitutions(body.join('\n')));
      }
    }
    this.pendingHeredocs = [];
  }
}
