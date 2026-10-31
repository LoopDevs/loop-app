import type { SymbolViewProps } from 'expo-symbols';

export const SymbolFont = {
  family: 'LoopSymbols',
} as const;

const codepoints: Record<string, number> = {
  account_balance: 0xe84f,
  account_balance_wallet: 0xe850,
  account_circle: 0xe853,
  add: 0xe145,
  apps: 0xe5c3,
  arrow_forward: 0xe5c8,
  bolt: 0xea0b,
  cancel: 0xe5c9,
  check: 0xe5ca,
  check_circle: 0xe86c,
  checkroom: 0xf19e,
  chevron_right: 0xe5cc,
  close: 0xe5cd,
  content_copy: 0xe14d,
  credit_card: 0xe870,
  devices: 0xe1b1,
  directions_run: 0xe566,
  error: 0xe000,
  favorite: 0xe87d,
  favorite_border: 0xe87e,
  fingerprint: 0xe90d,
  flight: 0xe539,
  help: 0xe887,
  home: 0xe88a,
  info: 0xe88e,
  key: 0xe73c,
  lock: 0xe897,
  logout: 0xe9ba,
  movie: 0xe02c,
  open_in_new: 0xe89e,
  payments: 0xef63,
  public: 0xe80b,
  redeem: 0xe8b1,
  replay: 0xe042,
  restaurant: 0xe56c,
  savings: 0xe2eb,
  schedule: 0xe8b5,
  search: 0xe8b6,
  sell: 0xf05b,
  shopping_bag: 0xf1cc,
  shopping_cart: 0xe8cc,
  south: 0xf1e3,
  spa: 0xeb4c,
  sports_esports: 0xea28,
  sync: 0xe627,
  touch_app: 0xe913,
  trending_up: 0xe8e5,
  verified_user: 0xe8e8,
  visibility: 0xe8f4,
  wifi_off: 0xe648,
};

export function symbolCodepoint(name: SymbolViewProps['name']): number | undefined {
  const webName = typeof name === 'object' ? name.web : undefined;
  return webName ? codepoints[webName] : undefined;
}
