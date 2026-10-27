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
- UK bank payment: on a GBP merchant, a user whose cashback currency is GBPLOOP sees "UK bank account" first under Pay with. The order is placed in GBP with no token, CTX returns a Plaid hosted link, the app opens it (automatically on native, by tap on web), the user approves in their banking app, and the app polls the order until it is paid and fulfilled. CTX needs the user's legal name for the bank identity, so the app asks for it once before the first bank order. Cashback lands in GBPLOOP.
- Savings: savings (vault) value, yield earned, withdraw.
- Releases: native builds and OTA updates run only from the GitHub `Release` workflow (`.github/workflows/release.yml`), on a clean `npm ci` checkout, with every `EXPO_PUBLIC_*` value read from the EAS environment named after the channel (`preview` or `production`), never from a local `.env`. Pick a channel and a kind: `build` starts the EAS binary (`production` for the stores, `preview` for testers, both on EAS-managed signing) and `update` publishes a JS-only OTA with `eas update --environment <channel>`. Production runs only from a `v*` release tag, preview from `post-hackathon` or a `v*` tag. `EXPO_PUBLIC_LOOP_ENV` comes from the `eas.json` profile for the channel, and the run stops if the EAS environment holds a different value or, for `production`, an empty `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `EXPO_PUBLIC_APPLE_SIGN_IN`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` or `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`. The ref check inside the workflow only catches mistakes, because a run uses the workflow file from the ref it is dispatched on; GitHub settings do the enforcing: the `production` environment allows deployments only from `v*` tags, `preview` only from `post-hackathon` and `v*` tags, `EXPO_TOKEN` (an EAS robot token) and `EXPO_UPDATES_PRIVATE_KEY` are stored only as secrets of those two environments and never as repository secrets, and a tag ruleset limits who can create `v*` tags. Each of those environments also holds the `LOOP_CRITICAL_INDEX` variable; `production` adds the `SENTRY_AUTH_TOKEN` secret and the `SENTRY_ORG` and `SENTRY_PROJECT` variables for OTA source maps, and the EAS `production` environment holds `SENTRY_ORG`, `SENTRY_PROJECT` and `SENTRY_AUTH_TOKEN` for the store-build source map upload. The run also stops when `app.json` has no `extra.eas.projectId` or `certs/certificate.pem` is missing. Updates are signed with `EXPO_UPDATES_PRIVATE_KEY` and binaries accept only updates that verify against `certs/certificate.pem`; production updates upload their source maps to Sentry. An update downloads in the background and applies on the next cold start. A critical update (must apply at once) is an `update` run after raising the `LOOP_CRITICAL_INDEX` variable of the channel's GitHub environment, which only ever increases and does not change the runtime fingerprint; running binaries reload as soon as they fetch it, waiting for any payment being sent. Store builds embed index 0 (`LOOP_CRITICAL_INDEX` in `eas.json`), so a fresh install reloads into any critical update already on its runtime. On web, `npm run deploy:web` publishes `extra.criticalIndex` from `app.json` as `/app-version.json`; open tabs check it at launch and on return to the foreground, and reload once the same way. To stop an old binary from paying, branch from its release tag, replace `GiftCardPurchase` with a blocking "Update Loop" view that links to the store listing, raise the production `LOOP_CRITICAL_INDEX`, push the result as a new `v*` tag and run a production `update` from that tag; Wallet stays usable so bought codes remain reachable.
- Environments: `EXPO_PUBLIC_LOOP_ENV` is `staging` (CTX staging + Stellar testnet) or `production` (CTX production + Stellar mainnet); any other value or none fails at startup. The environment also carries the CTX client id. Staging passkeys are named `<email> (test)`. Local development (`npm start`, `npm run web` on localhost) reads `.env`, copied from `.env.example`, so `EXPO_PUBLIC_CATALOG_URL` and the other values stay configurable per machine. Native builds and OTA updates never read it; `npm run deploy:web` builds web on the publisher's machine from its `node_modules` and reads `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` and `EXPO_PUBLIC_APPLE_SIGN_IN` from its `.env`.
- Staging builds expose a "fund with testnet XLM" action; production has no friendbot, so no funding button.
- Production release checklist (compare values, record them in the release PR):
  - `public/.well-known/assetlinks.json` lists the SHA-256 of both the EAS upload key and the Play App Signing key from Play Console, so app links and passkeys verify on installs from Play.
  - CTX production `crypto.xlm.smartWallet` `factory`, `ed25519Verifier` and `webauthnVerifier` equal the mainnet infrastructure deploy; relayer and system accounts are funded.
  - Every vault in `vaults` in `src/stellar/network.ts` is a DeFindex vault that is `active` for `mainnet` in CTX, keyed by the currency of its underlying asset and mapped to its `ContractId`. Savings is per currency: the app reads every configured vault and withdraws from the vault of the currency it needs.
  - The mainnet factory is the v2 deploy and its `config()` has `account_wasm_hash` = audited v2 account, both verifiers, `vaults` containing the active vaults, `tokens` = XLM, USDC and EURC SACs, `payee` = CTX production payee, `recovery` = CTX production recovery address.
  - `src/stellar/network.ts` mainnet `factory`, `payee`, `tokens`, `accountWasmHash`, `webauthnVerifier`, `ed25519Verifier` and `vaults` equal the values above. The mainnet GBPLOOP token is the GBPLOOP vault's underlying asset.

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
