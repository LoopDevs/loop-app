export const redeemCaptureStages = ['loaded', 'read', 'asked'] as const;

export type RedeemCaptureStage = (typeof redeemCaptureStages)[number];

export type RedeemCapturePage = {
  stage: RedeemCaptureStage;
  html: string;
};

export class RedeemCapture {
  static readonly enabled = process.env.EXPO_PUBLIC_REDEEM_CAPTURE === 'true';
  static readonly pageLimit = 1_500_000;

  private static readonly emptied = /<(script|style|svg|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi;
  private static readonly comment = /<!--[\s\S]*?-->/g;
  private static readonly tagOrText = /<(?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+/g;
  private static readonly attribute = /([\w:-]+)\s*=\s*("[^"]*"|'[^']*')/g;
  private static readonly token = /[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*/g;
  private static readonly keptAttributes: ReadonlySet<string> = new Set([
    'class',
    'id',
    'type',
    'name',
    'role',
    'for',
    'rel',
    'lang',
    'dir',
    'autocomplete',
    'inputmode',
  ]);
  private static readonly linkAttributes: ReadonlySet<string> = new Set([
    'href',
    'src',
    'srcset',
    'action',
    'formaction',
    'poster',
    'content',
  ]);
  private static readonly codeLength = 6;
  private static readonly opaqueSegmentLength = 16;

  static script(stage: RedeemCaptureStage): string {
    return `
(function () {
  try {
    var fields = document.querySelectorAll('input,textarea');
    for (var i = 0; i < fields.length; i += 1) {
      var field = fields[i];
      if (field.readOnly || field.disabled) {
        field.setAttribute('value', field.value || '');
      } else {
        field.removeAttribute('value');
      }
    }
    window.ReactNativeWebView.postMessage(
      JSON.stringify({
        capture: document.documentElement.outerHTML.slice(0, ${RedeemCapture.pageLimit}),
        stage: ${JSON.stringify(stage)},
      })
    );
  } catch (error) {}
})();
true;
`;
  }

  static read(data: string): RedeemCapturePage | null {
    try {
      const message: unknown = JSON.parse(data);
      if (typeof message !== 'object' || message === null) {
        return null;
      }
      const { capture, stage } = message as { capture?: unknown; stage?: unknown };
      const known = redeemCaptureStages.find((candidate) => candidate === stage);
      return typeof capture === 'string' && known ? { stage: known, html: capture } : null;
    } catch {
      return null;
    }
  }

  static mask(html: string): string {
    return html
      .replace(RedeemCapture.emptied, '<$1></$1>')
      .replace(RedeemCapture.comment, '')
      .replace(RedeemCapture.tagOrText, (part) =>
        part.startsWith('<') ? RedeemCapture.maskTag(part) : RedeemCapture.maskText(part),
      );
  }

  static maskLink(link: string): string {
    if (/^\s*data:/i.test(link)) {
      return 'data:masked';
    }
    const [beforeFragment = ''] = link.split('#');
    const [location = '', query] = beforeFragment.split('?');
    const path = location
      .split('/')
      .map((segment) =>
        segment.length >= RedeemCapture.opaqueSegmentLength && !segment.includes('.')
          ? segment.replace(/[A-Za-z]/g, 'X').replace(/\d/g, '0')
          : RedeemCapture.maskText(segment),
      )
      .join('/');
    return query === undefined ? path : `${path}?masked`;
  }

  static fileName(host: string, page: RedeemCapturePage, order: number, now = Date.now()): string {
    const safeHost = host.replace(/[^A-Za-z0-9.-]/g, '_');
    return `${new Date(now).toISOString().replace(/[:.]/g, '-')}-${safeHost}-${order}-${page.stage}.html`;
  }

  static document(host: string, merchantName: string, page: RedeemCapturePage): string {
    const note = `<!-- loop redeem capture: host=${host} merchant=${merchantName.replace(/--/g, '-')} stage=${page.stage} -->`;
    return `${note}\n${RedeemCapture.mask(page.html)}`;
  }

  private static maskText(text: string): string {
    return text.replace(RedeemCapture.token, (token) => {
      if (!/\d/.test(token)) {
        return token;
      }
      const digitsHidden = token.replace(/\d/g, '0');
      return token.length >= RedeemCapture.codeLength ? digitsHidden.replace(/[A-Za-z]/g, 'X') : digitsHidden;
    });
  }

  private static maskTag(tag: string): string {
    return tag.replace(RedeemCapture.attribute, (whole, name: string, quoted: string) => {
      const key = name.toLowerCase();
      if (RedeemCapture.keptAttributes.has(key)) {
        return whole;
      }
      if (key === 'style') {
        return `${name}=""`;
      }
      const quote = quoted[0];
      const value = quoted.slice(1, -1);
      const masked = RedeemCapture.linkAttributes.has(key)
        ? RedeemCapture.maskLink(value)
        : RedeemCapture.maskText(value);
      return `${name}=${quote}${masked}${quote}`;
    });
  }
}
