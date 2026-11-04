export type CardDetails = {
  number: string;
  pin: string;
};

const maxLabelLength = 40;
const lookahead = 3;
const pinLabel = /\b(pin|security code)\b/i;
const numberLabel = /\b(card|gift ?card|e-?gift|e-?voucher|voucher|gift|claim|redeem|redemption)\s*(number|no\.?|#|code)\b|^(code|number)\b/i;

export function parseCardDetails(lines: readonly string[]): CardDetails | null {
  let number = '';
  let pin = '';
  lines.forEach((raw, index) => {
    const { label, inline } = splitInline(raw.trim());
    if (!label || label.length > maxLabelLength) {
      return;
    }
    const kind = pinLabel.test(label) ? 'pin' : numberLabel.test(label) ? 'number' : null;
    if (!kind) {
      return;
    }
    const candidates = inline ? [inline] : lines.slice(index + 1, index + 1 + lookahead);
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
  if (!/^[A-Z0-9]{10,30}$/i.test(compact) || digitCount(compact) < 8) {
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
      } else if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') {
        if (skippedInputs[(node.getAttribute('type') || 'text').toLowerCase()]) {
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
