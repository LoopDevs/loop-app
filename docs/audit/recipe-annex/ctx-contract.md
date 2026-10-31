# Annex: CTX customer contract

What CTX spend-api does with each call the app makes. Read from `git -C ../spend-api show origin/staging:<path>` at `8d0242b6` (2026-10-26). Paths below are under `internal/` in spend-api. Line numbers are at that commit. CTX staging moves daily: re-read before relying on any line. Items marked **unverified** were reported by the extraction pass without a traced code path.

## Routes and authorization

- Routes: `http_router.go:155-322`. Customer role: `service_rbac.go:157-192`. Every customer permission is scoped `User=self`, except merchant get/list.
- IDOR guard: `validateUserScope` (`service_rbac.go:530-561`) via `resolveAccountUser` (`http_ep_user_account.go:112-131`) requires the token's user id to equal the path user id. `GET /gift-cards/:id` sets the target user to the card's owner, so a non-owner gets `ErrNotAuthorized`. The list forces `UserId` to the caller.
- Customer-reachable endpoints the app does not call: `POST/PUT/DELETE /users/:id/wallets` (link an arbitrary address), wallet-backup and recover, payment-methods, transfers, protected-requests, gift-card view/barcode/redeem, `/merchant-links`, `/2fa/*`, `/logout`. Any of these is attack surface a customer token can reach even though the app never calls it. Whether a customer can create a link with `sponsored: true` is **unverified**; it matters because `SmartWallet.load` takes the first link that is sponsored, XLM and active.
- Blocked for customers: `GET /payments`, `GET /users/:id`, changing `stableCurrency` after it is set, gift-card archive and status update.

## Sessions

- Bearer auth: `getRequestAuthScope` (`http_router.go:443-519`). Tokens are looked up in the DB (revocable). Claims required: `cid`, `tid`. `X-Client-Id` must equal the client name (`485-502`), else `ErrTokenInvalid`. A `?token=` query parameter is also accepted (`http_auth.go:116-130`); the app does not use it.
- Claims: `iat, exp, tid, ttp, cid, jti` (`http_auth.go:191-198`). `tid` is the user id the app puts in `/users/{tid}` paths.
- TTLs: access 8 h, refresh 90 days (`http_auth.go:149-154`).
- Refresh rotates on every call (`http_auth.go:271-297`) with a 30 s grace window (line 93). Reusing a refresh token inside the window revokes the successor chain. After the window the old token returns `ErrTokenInvalid`. Consequence for the app: two JS contexts (two web tabs, or app plus a second process) refreshing the same stored token both lose the session.
- `/refresh-token` does not check `X-Client-Id` for non-legacy tokens (`http_ep_auth_refresh.go:24-177`).
- `/login` sleeps 5 s on any error (`http_ep_auth_login.go:21-28`); returns 200 for an existing user and 201 for a new one (113-157), which is an account-existence oracle.
- OTP: 6 digits (`emailer.go:242-285`); resend deduped for 20 min; no explicit expiry, cleared on first successful login (`http_auth.go:415-453`); no per-code attempt cap on `/verify-email` (`http_ep_auth_verify_email.go:54-57`). Only the global limiter applies (burst 100, 2 rps; `http_router.go:57-68`). This is a CTX-side account-takeover risk; record it as a dependency, not a finding against this repo.

## Smart wallet

- Deploy (`http_ep_user_wallet_smart.go:40-116`): body `credentialId`, `passkeyPublicKey` (65 bytes), `devicePublicKey` (32 bytes). Address = factory `wallet_address(credentialId)` (`crypto_node_stellar_smartwallet.go:121-135`): it depends on the credential id only. Deploy call `deploy(sponsor, credentialId, passkeyPk, devicePk)` (137-174).
- Deploy is idempotent per user: a repeat call returns 200 with the existing link and ignores the keys sent. Consequence: after `deviceSigner.create` replaces the device key, a second deploy cannot register the new key; `verify()` then fails on the rule-1 key and the user cannot sign. Address linked to another user → 409. At most 5 sponsored links per user (`entity_wallet_link.go:21`); how that squares with per-user idempotency is **unverified**.
- Build (`http_ep_user_wallet_smart.go:118-143`, `crypto_node_stellar_smartwallet.go:58-126`): response `{transaction, digest (hex), contextRuleIds, expiryLedger}`. Both intents use rule ids `[1]`. Transaction source is the relayer; simulated; signature expiry = latest ledger + 60 (lines 20, 205), about 5 min.
  - Pay: payment must belong to the user, be on XLM, status pending or part-paid (`payment_walletconnect.go:573-575`). Call: SAC `transfer(wallet, payment.CryptoAddresses[0].Address, amount)` (`entity_payment.go:259-269`). Destination is a per-payment muxed M-address.
  - Vault withdraw: `withdraw(shares, [minAmount], wallet)` (`defindex/service.go:341-366`); minimum computed server-side from the vault value.
  - Digest: `sha256(ScMap{account, context_rule_ids, signature_payload})`, `signature_payload` = sha256 of the Soroban authorization preimage (`crypto_node_stellar_smartwallet.go:462-498`). Matches the app's `authDigest` structurally.
- Sponsor (`http_ep_user_wallet_smart.go:145-201`, smartwallet `234-302`, `352-424`): CTX re-derives the expected call from the intent and rejects unless not fee-bumped, source is the relayer, one InvokeHostFunction op, contract/function/args equal (`scEqual`), and exactly one auth entry for this wallet. It attaches the signature as an External signer (ed25519 verifier, device public key, 64-byte signature), re-simulates, signs as relayer, fee-bumps from the system key. Response `{hash, status, error?}`. `sponsoredWallet` (203-219) requires an active, sponsored XLM link owned by the user. Pay intents record the payment tx id (`recordSponsoredPayment`). CTX does not check the device signature itself (**unverified**); the chain does.
- Not found in CTX: anything about rule 0 (passkey) beyond passing the key to the factory; any wasm-hash pinning. Rule-1 restrictions (`device_allows`) are a factory matter, not checked by CTX.

## Gift cards

- Create (`http_ep_giftcard_create.go`): amount rules by denomination type (`fixed` exact; `min-max` in subunits; `min-max-major` whole numbers only). Errors: `ErrAmountDenominationInvalid`, `ErrAmountBelowMinimum`, `ErrAmountAboveMaximum`, `ErrAmountFractional`, `ErrNoDiscountsAvailable`. `fiatCurrency` must be accepted. Crypto amount = `rates.Convert(PaymentFiatAmount, crypto)`.
- XLM payments get a muxed address whose id is the low 8 bytes of the payment UUID (`payment_crypto.go:533-536`). The app could recompute that id from `giftCard.paymentId` and pin it; it does not.
- JSON (`http_json.go:25-402`): unpaid cards carry `paymentCryptoAddress` (M-address) and `paymentUrls`; crypto payments have no `paymentUrlExpiration`. Codes (number, PIN) appear only on `GET /gift-cards/:id` for fulfilled cards. `redeemUrl` and `barcodeUrl` embed 10-year unauthenticated view tokens: anyone holding the URL can see the card. The list carries no codes and no payment addresses.
- Statuses (`entity_gift_card.go:75-80`): `unpaid, paid, fulfilled, rejected, refunded, expired` (matches the app's union).
- `GET /gift-cards/:id?stream=true` is SSE (20 s keepalive, 10 min timeout); the app polls instead.

## Cashback

- `rewardType` defaults to the company default (`discount`); the app always sends `cashback`. With cashback: holding currency must be a stable (`ErrCashbackNotStable`); a fiat payment must match the user's stable (`ErrCashbackStableMismatch`); the user pays full price; `cashbackAmount` is an estimate at create, fixed at settlement (`payment-flows.md:154-201`).
- Crediting is a ledger transfer `system:giftcard` → user wallet (`payment-flows.md:201,258`). Whether that is an on-chain transfer to the smart account or a CTX-internal ledger entry is **unresolved**.
- Refund (`payment-flows.md:369-399`): operator-triggered; refused with `ErrInsufficientBalance` if the wallet holds less than the cashback; otherwise reverses the cashback from the user's wallet. How CTX can debit a non-custodial smart account is **unresolved** and is a contradiction worth chasing.
- `cashbackDestination: savings` gifts vault shares instead (`payment-flows.md:269`).

## Merchants and profile

- `GET /merchants` works without auth; an invalid token falls back to the unauthenticated list, never 401 (`http_ep_merchant_list.go`). The app nonetheless calls it through `sessionRequest`, so signed-out users see no shop.
- `userDiscount` and `savingsPercentage` are the same integer basis points (10000 = 100%). The `link` object can override discount and status. `info` is not in the list response. Denominations are decimal strings; min-max in subunits. `GET /merchants/:idOrSlug` (used by `/shop/[slug]`) was not traced: **unverified**.
- `/me` returns `{user, company, client, permissions}` (`http_ep_me_get.go`), allowed during maintenance.
- `PUT /users/:id` (`http_ep_user_update.go`): customer may set name, timezone, country, `stableCurrency` (only while empty, must be in `company.StableCurrencies`; later change → 403), `cashbackDestination` (`account`|`savings`), `twoFactorEnabled`. Privileged fields are silently ignored for self.

## Contradictions with the app

1. Pay destination is a per-payment muxed M-address; the app pins only its base G-address (`network.payee`). Whether CTX's system G-address equals `network.payee` on each network depends on CTX config, not code: **unverified**.
2. Deploy ignores keys on repeat, so device-key replacement cannot be repaired through deploy.
3. CTX enforces nothing about rule 0 or wasm; the app's `verify()` is the only check.
4. Signature expiry is 60 ledgers; build and sponsor must run back-to-back, and the biometric prompt sits between them.
5. Concurrent refreshes inside 30 s revoke the new tokens.
