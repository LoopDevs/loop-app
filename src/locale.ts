export function deviceLocale(): string {
  return Intl.DateTimeFormat().resolvedOptions().locale;
}
