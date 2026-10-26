export const loopLinks = {
  terms: 'https://loopfinance.io/terms' as const,
  privacy: 'https://loopfinance.io/privacy' as const,
  supportEmail: 'hello@loopfinance.io',

  supportMail(subject?: string): string {
    const query = subject ? `?subject=${encodeURIComponent(subject)}` : '';
    return `mailto:${this.supportEmail}${query}`;
  },
};
