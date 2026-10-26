# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

iOS, Android and web are all first-class. One Loop brand across them; each platform keeps its own native tabs, haptics and back gesture.

## Users

Everyday consumers in the US, UK, Europe and Canada who already shop at big-name retailers and want their spending to save them money. They open Loop on their phone at the moment of buying (in a queue, at a checkout, on a sofa) and between purchases to check what they have and what they have earned.

## Product Purpose

Loop is a gift-card cashback and savings wallet. Users buy gift cards from retailers at face value, earn cashback on every card, pay from a self-custodied Stellar smart wallet, and hold balances in USDC, EURC and GBPLOOP, with a savings balance that earns yield. Success: a purchase feels as quick and safe as a card tap, and the user can see at a glance how much they hold and how much they have earned.

## Positioning

The cashback, the wallet and the savings live in one place the user owns: a passkey-secured smart wallet, not a points scheme or a custodial account. Gift cards are paid from that wallet and the money left over earns yield.

## Operating Context

- Sign-in by email code (proxied CTX auth), then wallet creation with a passkey.
- Home, top to bottom: a full-width balance hero with earnings (cashback earned, savings yield) and pill actions, then an activity card of recent gift cards, then the gift card shop further down the scroll. Founder reference: the Monzo home screen (bold coloured balance card, white rounded activity card with merchant rows, soft tinted page ground, bottom tabs).
- Gift card purchase: search merchant, pick amount, pick pay-with token, see price, pay, wait for fulfilment.
- Orders: list of purchased gift cards; detail with barcode, number, PIN, redeem link.
- Savings: savings (vault) value, yield earned, withdraw.
- Releases: `eas build --profile production` builds the store binary (`preview` builds go to testers, both on EAS-managed signing). A JS-only fix ships with `eas update --channel production`; it downloads in the background and applies on the next cold start. A critical update (must apply at once) is the same command after raising `extra.criticalIndex` in `app.json`, which only ever increases and does not change the runtime fingerprint; running binaries reload as soon as they fetch it, waiting for any payment being sent. To stop an old binary from paying, check out its release tag, replace `GiftCardPurchase` with a blocking "Update Loop" view that links to the store listing, raise `criticalIndex`, and publish with `eas update --channel production`; Orders stays usable so bought codes remain reachable.
- Environments: `EXPO_PUBLIC_LOOP_ENV` is `staging` (CTX staging + Stellar testnet) or `production` (CTX production + Stellar mainnet); any other value or none fails at startup. `EXPO_PUBLIC_CTX_CLIENT_ID` is separate. Staging passkeys are named `<email> (test)`.
- Staging builds expose a "fund with testnet XLM" action; production has no friendbot, so no funding button.
- Production release checklist (compare values, record them in the release PR):
  - CTX production `crypto.xlm.smartWallet` `factory`, `ed25519Verifier` and `webauthnVerifier` equal the mainnet infrastructure deploy; relayer and system accounts are funded.
  - The mainnet USDC DeFindex vault is `active` for `mainnet` in CTX, and `usdcVault` in `src/stellar/network.ts` equals its `ContractId`.
  - The mainnet factory is the v2 deploy and its `config()` has `account_wasm_hash` = audited v2 account, both verifiers, `vaults` containing the active vault, `tokens` = XLM, USDC and EURC SACs, `payee` = CTX production payee, `recovery` = CTX production recovery address.
  - `src/stellar/network.ts` mainnet `factory`, `payee`, `tokens`, `accountWasmHash`, `webauthnVerifier`, `ed25519Verifier` and `usdcVault` equal the values above. GBPLOOP stays testnet-only.

## Capabilities and Constraints

- Expo 58 / React Native 0.88 app with expo-router native tabs, reanimated and gesture-handler, also shipped to web.
- Offer model: cashback and savings only. Gift cards sell at face value; there is no discount at purchase. Each gift card tile leads with its cashback rate, and the hero's earnings line shows cashback earned and savings yield.
- Terminology: "gift card", "order", "cashback", "savings", "wallet", "balance". Tokens are USDC, EURC, GBPLOOP, XLM.
- Greenfield: no backwards compatibility owed.
- Code rules for every builder (project CLAUDE.md): no code comments; no before/after framing in code, names or copy; edit files with Edit/Write, never sed; no screenshot or browser-automation QA of the app code; no git commits unless asked; do not touch `android/`, `ios/`, `.env` or `../loop-landing`.

## Brand Commitments

- Name: Loop. Domain: loopfinance.io.
- The geometric "Loop" wordmark from the previous app (`../loop-app-bkup/apps/web/public/loop-logo.svg`, white variant beside it) is fixed. Colours are open; the previous blue (#2F6BFF / #1A56DB on #0F1B2D) is one option.
- Founder direction (pinned): "fintech vibes, Revolut inspired, as per the last Loop. Really good microtransitions and animations so it feels really good and interactive as you use it." Premium, confident, tactile.
- Voice: plain, confident, money-literate, like Revolut or Monzo. Short sentences, exact numbers, no hype.
- Touch points in scope: app icon, Android adaptive icon, splash, favicon, tab icons. The landing page is redesigned later from the design doc.

## Evidence on Hand

- Previous Loop wordmark SVGs and splash PNGs in `../loop-app-bkup`.
- No testimonials, user counts, savings totals or press. Do not fabricate them.

## Product Principles

1. Money first: the user's balance and earnings are the clearest thing on screen.
2. Every tap answers back: each action gets immediate, physical feedback.
3. Show exact numbers: amounts, cashback and fees are never rounded away or hidden.
4. Self-custody without jargon: passkeys and wallets are explained in everyday words.
5. Calm under failure: errors say what happened and what to do next.

## Accessibility & Inclusion

Respect system text size, Reduce Motion and light/dark appearance on every platform.
