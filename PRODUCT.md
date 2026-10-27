# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

iOS, Android and web are all first-class. One Loop brand across them; each platform keeps its own native tabs, haptics and back gesture.

## Users

Everyday consumers in the US, UK, Europe and Canada who already shop at big-name retailers and want their spending to save them money. They open Loop on their phone at the moment of buying (in a queue, at a checkout, on a sofa) and between purchases to check what they have and what they have earned.

## Product Purpose

Loop is a gift-card cashback and savings wallet. Users buy gift cards from retailers at face value, earn cashback on every card, pay from a self-custodied Stellar smart wallet, and hold balances in dollar and euro tokens (the set per environment is `offeredTokens` in `src/stellar/network.ts`), with a savings balance that earns yield. Success: a purchase feels as quick and safe as a card tap, and the user can see at a glance how much they hold and how much they have earned.

## Positioning

The cashback, the wallet and the savings live in one place the user owns: a smart wallet unlocked with Face ID or a fingerprint, not a points scheme or a custodial account. Gift cards are paid from that wallet and the money left over earns yield.

## Operating Context

- Sign-in by email code (proxied CTX auth) or social sign-in where enabled, then wallet creation with a passkey (Face ID or fingerprint).
- Tabs: Home, Shop, Savings, Wallet, Profile.
- Home is a balances overview. A signed-in user sees a total-balance card with its actions, a savings nudge, a next-step card and recent gift cards. A signed-out visitor sees the top cashback offers and the brand wall. Shop is a discovery feed: category tiles, strips of photo cards (top cashback, favourites, bought recently), then every gift card. Founder references: a Revolut-style money overview and the Too Good To Go Discover feed.
- Gift card purchase: search merchant, pick amount, pick pay-with token, see price, pay, wait for fulfilment.
- Wallet: spendable balance, add money, purchased gift cards; detail with barcode, number, PIN, redeem link.
- Savings: savings (vault) value, yield earned, withdraw.
- Releases: `eas build --profile production` builds the store binary (`preview` builds go to testers, both on EAS-managed signing). A JS-only fix ships with `EXPO_PUBLIC_LOOP_ENV=production eas update --channel production` (`eas update` reads the local `.env`, not the `eas.json` build env); it downloads in the background and applies on the next cold start. A critical update (must apply at once) is the same command after raising `extra.criticalIndex` in `app.json`, which only ever increases and does not change the runtime fingerprint; running binaries reload as soon as they fetch it, waiting for any payment being sent. On web, `npm run deploy:web` publishes `criticalIndex` as `/app-version.json`; open tabs check it at launch and on return to the foreground, and reload once the same way. To stop an old binary from paying, check out its release tag, replace `GiftCardPurchase` with a blocking "Update Loop" view that links to the store listing, raise `criticalIndex`, and publish with `EXPO_PUBLIC_LOOP_ENV=production eas update --channel production`; Wallet stays usable so bought codes remain reachable.
- Environments: `EXPO_PUBLIC_LOOP_ENV` is `staging` (CTX staging + Stellar testnet) or `production` (CTX production + Stellar mainnet); any other value or none fails at startup. The environment also carries the CTX client id, so an OTA built from any `.env` keeps it. Staging passkeys are named `<email> (test)`.
- Staging builds expose a "fund with testnet XLM" action; production has no friendbot, so no funding button.
- Production release checklist (compare values, record them in the release PR):
  - CTX production `crypto.xlm.smartWallet` `factory`, `ed25519Verifier` and `webauthnVerifier` equal the mainnet infrastructure deploy; relayer and system accounts are funded.
  - The mainnet USDC DeFindex vault is `active` for `mainnet` in CTX, and `usdcVault` in `src/stellar/network.ts` equals its `ContractId`.
  - The mainnet factory is the v2 deploy and its `config()` has `account_wasm_hash` = audited v2 account, both verifiers, `vaults` containing the active vault, `tokens` = XLM, USDC and EURC SACs, `payee` = CTX production payee, `recovery` = CTX production recovery address.
  - `src/stellar/network.ts` mainnet `factory`, `payee`, `tokens`, `accountWasmHash`, `webauthnVerifier`, `ed25519Verifier` and `usdcVault` equal the values above. GBPLOOP stays testnet-only.

## Capabilities and Constraints

- Expo 58 / React Native 0.88 app with expo-router native tabs, reanimated and gesture-handler, also shipped to web.
- Offer model: cashback and savings only. Gift cards sell at face value; there is no discount at purchase. Each gift card tile leads with its cashback rate, and the balance card shows cashback on the way and the savings balance.
- Terminology: "gift card", "order", "cashback", "savings", "wallet", "balance". Token codes come from `src/stellar/network.ts`.
- Greenfield: no backwards compatibility owed.
- Code rules for every builder (project CLAUDE.md): no code comments; no before/after framing in code, names or copy; edit files with Edit/Write, never sed; no screenshot or browser-automation QA of the app code; no git commits unless asked; do not touch `android/`, `ios/`, `.env` or `../loop-landing`.

## Brand Commitments

- Name: Loop. Domain: loopfinance.io.
- The geometric "Loop" wordmark from the previous app (`../loop-app-bkup/apps/web/public/loop-logo.svg`, white variant beside it) is fixed.
- Look: a calm money overview on a white canvas. Accent #1A56DB, used sparingly (primary buttons, links, focus, the cashback pill, the active tab); ink #0F1B2D; cool slate greys; hairline borders; very soft shadows. Fira Sans. Cards use `Radius.card` (22) with `Elevation.card`; buttons and chips are full pills. Headers are white with a hairline on scroll; there are no coloured hero bands. Colour, radius and font tokens live in `src/constants/theme.ts`.
- Merchant card: one component everywhere. Cover photo on top (the merchant hue when there is none), round logo overlapping the cover's bottom edge, cashback pill on the photo, heart top right, then a one-line name and the category in grey.
- Copy: cashback and savings only, never a discount; no passkey, crypto, token or address jargon on screen; never invent numbers.
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
