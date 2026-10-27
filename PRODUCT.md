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
- Home, top to bottom: a full-width blue panel with the total balance and round actions, a next-step card, Spending balance and Savings cards, recent gift cards, then a Top cashback strip. Shop is a discovery feed: category tiles, strips of photo cards, then every gift card. Founder references: a Revolut-style money overview and the Too Good To Go Discover feed.
- Gift card purchase: search merchant, pick amount, pick pay-with token, see price, pay, wait for fulfilment.
- Orders: list of purchased gift cards; detail with barcode, number, PIN, redeem link.
- Savings: savings (vault) value, yield earned, withdraw.
- Releases: native builds and OTA updates run only from the GitHub `Release` workflow (`.github/workflows/release.yml`), on a clean `npm ci` checkout, with every `EXPO_PUBLIC_*` value read from the EAS environment named after the channel (`preview` or `production`), never from a local `.env`. Pick a channel and a kind: `build` starts the EAS binary (`production` for the stores, `preview` for testers, both on EAS-managed signing) and `update` publishes a JS-only OTA with `eas update --environment <channel>`. Production builds run from a `v*` release tag cut on `main`, production updates from `main` or a `v*` tag, preview runs from `post-hackathon` or a `v*` tag. `EXPO_PUBLIC_LOOP_ENV` comes from the `eas.json` profile for the channel, and the run stops if the EAS environment holds a different value. Updates are signed with the key in the `EXPO_UPDATES_PRIVATE_KEY` secret and binaries accept only updates that verify against `certs/certificate.pem`; production updates upload their source maps to Sentry. An update downloads in the background and applies on the next cold start. A critical update (must apply at once) is an `update` run after raising the `LOOP_CRITICAL_INDEX` variable of the channel's GitHub environment, which only ever increases and does not change the runtime fingerprint; running binaries reload as soon as they fetch it, waiting for any payment being sent. Store builds embed index 0, so a fresh install reloads into any critical update already on its runtime. On web, `npm run deploy:web` publishes `extra.criticalIndex` from `app.json` as `/app-version.json`; open tabs check it at launch and on return to the foreground, and reload once the same way. To stop an old binary from paying, branch from its release tag, replace `GiftCardPurchase` with a blocking "Update Loop" view that links to the store listing, raise the production `LOOP_CRITICAL_INDEX`, push the result as a new `v*` tag and run a production `update` from that tag; Orders stays usable so bought codes remain reachable.
- Environments: `EXPO_PUBLIC_LOOP_ENV` is `staging` (CTX staging + Stellar testnet) or `production` (CTX production + Stellar mainnet); any other value or none fails at startup. The environment also carries the CTX client id. Staging passkeys are named `<email> (test)`. Local development (`npm start`, `npm run web` on localhost) reads `.env`, copied from `.env.example`, so `EXPO_PUBLIC_CATALOG_URL` and the other values stay configurable per machine; release runs never read it.
- Release access: the ref check inside the workflow only catches mistakes, because a dispatch runs the workflow file of the chosen ref. The GitHub environments enforce it: `production` accepts deployments only from `main` and `v*` tags, `preview` only from `post-hackathon` and `v*` tags, and a tag ruleset lets only maintainers create `v*` tags. `EXPO_TOKEN` and `EXPO_UPDATES_PRIVATE_KEY` are secrets of those environments, never repository secrets. Each environment also holds the `LOOP_CRITICAL_INDEX` variable; `production` adds the `SENTRY_AUTH_TOKEN` secret and the `SENTRY_ORG` and `SENTRY_PROJECT` variables for OTA source maps. The EAS environment of each channel holds `EXPO_PUBLIC_SENTRY_DSN`; the EAS `production` environment also holds `SENTRY_ORG`, `SENTRY_PROJECT` and `SENTRY_AUTH_TOKEN` (secret), which store builds need for the source map upload. Production runs stop early when the DSN, org or project is missing.
- Staging builds expose a "fund with testnet XLM" action; production has no friendbot, so no funding button.
- Production release checklist (compare values, record them in the release PR):
  - `public/.well-known/assetlinks.json` lists the SHA-256 of both the EAS upload key and the Play App Signing key from Play Console, so app links and passkeys verify on installs from Play.
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
