type SameShape<Native, Web> = [Native] extends [Web] ? ([Web] extends [Native] ? true : false) : false;

type WebCoversNative<Native, Web> = [keyof Native] extends [keyof Web] ? true : false;

export const platformParity: [
  SameShape<typeof import('./ctx/payment-lock.ts'), typeof import('./ctx/payment-lock.web.ts')>,
  SameShape<typeof import('./native/haptics.ts'), typeof import('./native/haptics.web.ts')>,
  SameShape<typeof import('./native/screen-privacy.ts'), typeof import('./native/screen-privacy.web.ts')>,
  SameShape<typeof import('./native/social-sign-in.ts'), typeof import('./native/social-sign-in.web.ts')>,
  SameShape<typeof import('./session/token-store.ts'), typeof import('./session/token-store.web.ts')>,
  SameShape<typeof import('./updates/update-checker.ts'), typeof import('./updates/update-checker.web.ts')>,
  SameShape<typeof import('./wallet/device-signer.ts'), typeof import('./wallet/device-signer.web.ts')>,
  WebCoversNative<typeof import('./components/app-lock.tsx'), typeof import('./components/app-lock.web.tsx')>,
  WebCoversNative<typeof import('./components/app-tabs.tsx'), typeof import('./components/app-tabs.web.tsx')>,
  WebCoversNative<typeof import('./components/page-title.tsx'), typeof import('./components/page-title.web.tsx')>,
] = [true, true, true, true, true, true, true, true, true, true];
