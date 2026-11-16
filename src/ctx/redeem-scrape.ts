export type CardDetails = {
  number: string;
  pin: string;
};

const maxLabelLength = 40;
const lookahead = 3;
const pinLabel = /\b(pin|security code)\b/i;
const otherLabel = /\b(number|no\.?|#|code|ref(erence)?|date|expir\w*|phone|balance|amount)\s*:?$/i;
const numberLabel = /\b(card|gift ?card|e-?gift|e-?voucher|voucher|gift|claim|redeem|redemption)\s*(number|no\.?|#|code)\b|^(code|number)\b/i;

export function parseCardDetails(lines: readonly string[]): CardDetails | null {
  let number = '';
  let pin = '';
  lines.forEach((raw, index) => {
    const { label, inline } = splitInline(raw.trim());
    if (!label || label.length > maxLabelLength) {
      return;
    }
    const kind = labelKind(label);
    if (!kind) {
      return;
    }
    const candidates = inline ? [inline] : candidatesFor(lines, index);
    const read = kind === 'pin' ? pinValue : numberValue;
    const value = candidates.map((candidate) => read(candidate.trim())).find(Boolean) ?? '';
    if (kind === 'number') {
      number ||= value;
    } else {
      pin ||= value;
    }
  });
  if (!number) {
    return null;
  }
  return { number, pin: pin === number ? '' : pin };
}

export function readPageLines(data: string): string[] {
  try {
    const parsed: unknown = JSON.parse(data);
    const lines = (parsed as { lines?: unknown }).lines;
    return Array.isArray(lines) ? lines.filter((line): line is string => typeof line === 'string') : [];
  } catch {
    return [];
  }
}

function labelKind(label: string): 'pin' | 'number' | null {
  if (pinLabel.test(label)) {
    return 'pin';
  }
  return numberLabel.test(label) ? 'number' : null;
}

function candidatesFor(lines: readonly string[], index: number): string[] {
  const before = cardLabelRun(lines, index, -1);
  const after = cardLabelRun(lines, index, 1);
  if (before + after === 0) {
    return valuesAfter(lines, index);
  }
  const width = before + 1 + after;
  const values = lines.slice(index + after + 1, index + after + 1 + width);
  if (values.length === width && !values.some(isLabelLine)) {
    return [values[before]];
  }
  return after === 0 ? valuesAfter(lines, index) : [];
}

function cardLabelRun(lines: readonly string[], index: number, step: 1 | -1): number {
  let count = 0;
  for (let at = index + step; at >= 0 && at < lines.length && isCardLabel(lines[at]); at += step) {
    count += 1;
  }
  return count;
}

function isCardLabel(line: string): boolean {
  const { label, inline } = splitInline(line.trim());
  return inline === null && label.length <= maxLabelLength && labelKind(label) !== null;
}

function isLabelLine(line: string): boolean {
  const { label } = splitInline(line.trim());
  return label.length <= maxLabelLength && (labelKind(label) !== null || otherLabel.test(label));
}

function valuesAfter(lines: readonly string[], index: number): string[] {
  const values: string[] = [];
  for (const line of lines.slice(index + 1, index + 1 + lookahead)) {
    if (isLabelLine(line)) {
      break;
    }
    values.push(line);
  }
  return values;
}

function splitInline(line: string): { label: string; inline: string | null } {
  const separator = line.indexOf(':');
  if (separator <= 0 || separator > maxLabelLength) {
    return { label: line, inline: null };
  }
  const inline = line.slice(separator + 1).trim();
  return { label: line.slice(0, separator).trim(), inline: inline || null };
}

function numberValue(line: string): string {
  const compact = line.replace(/[\s-]/g, '');
  if (!/^[A-Z0-9]{10,30}$/i.test(compact) || digitCount(compact) < 8 || hasWords(line)) {
    return '';
  }
  return compact;
}

function pinValue(line: string): string {
  if (!/^[A-Z0-9]{3,10}$/i.test(line) || digitCount(line) < 1) {
    return '';
  }
  return line;
}

function hasWords(line: string): boolean {
  const parts = line.split(/\s+/);
  return parts.length > 1 && parts.some((part) => /^[A-Z]?[a-z]{2,}$/.test(part) && (part.length > 4 || /^[A-Z]/.test(part)));
}

function digitCount(value: string): number {
  return value.replace(/\D/g, '').length;
}

export const pageLinesScript = `
(function () {
  if (window.__loopPageLines) {
    return;
  }
  window.__loopPageLines = true;
  var limit = 2000;
  var skipped = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1 };
  var skippedInputs = { hidden: 1, password: 1, submit: 1, button: 1, checkbox: 1, radio: 1 };
  function collect() {
    var out = [];
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode()) && out.length < limit) {
      var text = '';
      if (node.nodeType === 3) {
        var parent = node.parentElement;
        if (!parent || skipped[parent.tagName] || parent.closest('[hidden],[aria-hidden="true"]')) {
          continue;
        }
        text = node.textContent;
      } else if ((node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') && (node.readOnly || node.disabled)) {
        if (
          skippedInputs[(node.getAttribute('type') || 'text').toLowerCase()] ||
          /^cc-/i.test(node.getAttribute('autocomplete') || '')
        ) {
          continue;
        }
        text = node.value || '';
      }
      text = text.replace(/\\s+/g, ' ').trim();
      if (text) {
        out.push(text.slice(0, 200));
      }
    }
    return out;
  }
  var timer = null;
  function send() {
    timer = null;
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({ lines: collect() }));
    } catch (error) {}
  }
  function schedule() {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(send, 500);
  }
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['value', 'hidden', 'aria-hidden', 'class', 'style'],
  });
  schedule();
})();
true;
`;
