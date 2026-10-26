export const loopLinks = {
  terms: 'https://loopfinance.io/terms' as const,
  privacy: 'https://loopfinance.io/privacy' as const,
  supportEmail: 'hello@loopfinance.io',
  supportMail(subject?: string, body?: string): string {
    const params = [
      subject && `subject=${encodeURIComponent(subject)}`,
      body && `body=${encodeURIComponent(body)}`,
    ].filter(Boolean);
    const query = params.length ? `?${params.join('&')}` : '';
    return `mailto:${this.supportEmail}${query}`;
  },
};
