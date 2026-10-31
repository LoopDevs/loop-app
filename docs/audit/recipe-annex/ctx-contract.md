# Annex: CTX customer contract

What CTX spend-api does with each call the app makes. Read from `git -C ../spend-api show origin/staging:<path>` at `189b9409` (2026-10-31; 86 commits since `8d0242b6`). Paths are under `internal/` in spend-api; line numbers are at that commit. CTX staging moves daily: re-read before relying on any line. Items marked **unverified** were not traced to a code path.

## Routes and authorization

- Customer role: `service_rbac.go:167-200`. It includes wallet deploy, sponsor, list, update and unlink, backup, recovery start and finish, bank-withdrawal create/get, and payment-method create/list/delete. Every customer permission is scoped `User=self`, except merchant get/list.
- IDOR guard: the token's user id must equal the path user id; `GET /gift-cards/:id` targets the card's owner; the list forces `UserId` to the caller.
- A customer cannot create a sponsored link: `Sponsored = true` is set only in deploy (`http_ep_user_wallet_smart.go:135`).
- Sponsor and build take `walletId` from the path (`http_ep_user_wallet_smart.go:253-269`). Inactive links → 404; non-sponsored or non-XLM → `ErrSmartWalletNotSponsored`.
- Recovery cancel has no customer permission (`http_router.go:253`).
- Maintenance mode blocks everything except `/status`, `/me` and `/system/trigger` (`http_router.go:158`).
- Customer-reachable endpoints the app does not call: wallet link CRUD, backup, recovery start/finish, payment methods, bank withdrawals, transfers, `/2fa/*`, the `send` intent. Attack surface a customer token reaches regardless of the app.

## Sessions

- Access token 8 h, refresh 90 days (`http_auth.go:149,154`). `X-Client-Id` must match the token's client on bearer requests.
- Refresh rotates on every call with a 30 s grace window (`http_auth.go:93`, 271-297); reuse inside the window revokes the successor chain. Whether `/refresh-token` checks `X-Client-Id` for non-legacy tokens: **unverified** at this SHA (the previous read said it does not).
- `POST /login`: 200 for an existing user, 201 for a new one (`http_ep_auth_login.go:131,147`): an account-existence oracle. Any error sleeps 5 s. An `X-Signature` header takes the key-only path.
- OTP: expires after 20 min, locks after 5 failed guesses (`entity_verification_code.go:15-17,97-147`, `Err2FATooManyAttempts` 429). A locked code clears only at expiry. A live code is not re-sent within 1 min (`emailer.go:266-268`).
- `/login/oauth` body `{provider, idToken, nonce?}`; the nonce is verified only when sent (`http_ep_auth_login_oauth.go:13-98`). Signup requires a verified email; an existing email gets the identity linked (`:112-128`).
- `/logout` revokes the session; needs a bearer token.

## WebSocket `/ws`

- Authenticates once, at upgrade, from request headers (`http_ws.go:89-96`). No later expiry re-check was found, so a socket can outlive the 8 h access token (**unverified** beyond reading). A browser cannot set those headers (recipe trap 22).
- Commands `subscribe`, `unsubscribe`, `list`; replies `{type:"ok"|"error", action, subscriptions}`; events `{type:"event", topic, event, data}`; errors `not authorized` / `unknown topic`.
- Ping every 20 s; closes after 60 s without a pong and on a backlog overflow of 256 events (`:149-231`).
- `giftcard` topic (`http_ws_topic_giftcard.go`): `system.giftcard.created|paid|fulfilled|rejected|refunded|expired|display_status_updated`, own cards only, payload without details or secrets. The client must `GET /gift-cards/:id` for codes. No cashback events here.
- `account` topic (`http_ws_topic_account.go`): `system.account.balances.updated`, `system.wallet.holdings.updated`, `system.payout.held|submitted|queued|completed|failed`, `user.profile.updated`.

## Smart wallet

- **Deploy** (`http_ep_user_wallet_smart.go:77-153`): body `credentialId`, `passkeyPublicKey` (65 bytes), `devicePublicKey` (32 bytes). Address depends on `credentialId` only. New deploy → 201 with `txHash`; a repeat with the same credential id → 200 with the existing link, keys ignored (`:104-110`). Lifetime cap of 5 sponsored links per user (`:122`, `entity_wallet_link.go:27`, `ErrSmartWalletLimit`). Address linked to another user → `ErrSmartWalletLinkedElsewhere`.
- **Build** (`:155-180`): `{transaction, digest, contextRuleIds, expiryLedger}`; expiry = latest + 60 (`crypto/crypto_node_stellar_smartwallet.go:24,252`).
- **Sponsor** (`:182-251`): `passkey` only for passkey intents (`smartwallet.go:43`), otherwise `{signature (64 B), devicePublicKey (32 B)}`. Passkey signatures are folded to low-S (`crypto_node_stellar_smartwallet.go:731-748`). CTX re-derives the call and verifies the transaction against it (`:286`), then attaches the signature as an External signer with the Ed25519 or WebAuthn verifier (`:709-729`). CTX does not verify the signature itself; the chain does. Per-user sponsor rate limit (`ErrRateLimitReached`). Holdings refresh asynchronously afterwards.
- **Intents** (`smartwallet.go:68-314`):
  - `pay {paymentId}`: rule `[1]`. SAC `transfer(wallet, payment muxed address, amount)`. The payment must be the user's, on XLM, status exactly `pending` (part-paid refused, `:149-152`). One in-flight tx per payment (`claimSponsoredPayment`, `:226-245`); a failed tx releases the claim; a pending one returns `ErrPaymentAlreadySubmitted {txId}`.
  - `vault_withdraw {currency, shares}`: rule `[1]`. `withdraw(shares, [min], wallet)`; `shares` a decimal string. Vault lookup keyed by chain-qualified `XLM.USDC|XLM.EURC|XLM.GBPLOOP` (`defindex/defindex.go:39`, `service.go:172`); a missing or unverified vault → `ErrSavingsUnavailable`. Whether a bare `USDC` is normalised: **unverified**.
  - `rotate_device {newDevicePublicKey}` (32 bytes): rule `[0]` (passkey). Calls `rotate_device(bytes)` on the wallet (`smartwallet.go:289-304`). The sponsor body must carry `passkey`. CTX stores no device key on the link, so nothing to update off chain and deploy cannot repair a device key.
  - Not used by the app: `send` (passkey, rule `[0]`, XLM USDC/EURC to any non-self address), `vault_deposit` (rule `[1,1]`), `recovery_cancel` (device, rule `[1]`).
- **Recovery:** `/stellar/recovery` start (owner; takes `devicePublicKey`, body partly **unverified**), `/recovery/finish`, `/recovery/cancel` (system only).
- Nothing in CTX pins rule 0 or the wasm hash; the app's `WalletRules.check` is the only check. Rule-1 `device_allows` is a factory matter.

## Gift cards

- **Create** (`http_ep_giftcard_create.go:17-25`): `cryptoCurrency, fiatAmount, fiatCurrency, merchantId, locationId, operatorReference, rewardType`. Amount rules by denomination type; errors `ErrAmountDenominationInvalid|BelowMinimum|AboveMaximum|Fractional`, `ErrNoDiscountsAvailable`.
- **`Idempotency-Key` is not implemented:** no handler in `internal/` reads it. A retried `POST /gift-cards` creates a second card. Whether `operatorReference` is unique and could dedupe: **unverified**.
- **No `paymentMethod` request field.** Empty `cryptoCurrency` = fiat. The server picks `plaid-vrp` when recurring is enabled, else `plaid-uk-eu` (`config.go:105-110`, create `:610-620`). Production accepts fiat in GBP only (`:600-608`).
  - VRP (`:647-659`): needs an authorised, unexpired payment method, else `ErrBankLinkRequired` (402); executes immediately; no `paymentUrl` returned (`http_json.go:330-337`).
  - UK/EU (`payment_plaid.go:262-312`): returns `paymentUrl` and `paymentUrlExpiration`. `ErrBankPaymentIdentityRequired` (400) when the user lacks given/family name or email; fix via `PUT /users/:id {legalName}`.
- XLM payments get a muxed address whose id is the low 8 bytes of the payment UUID; the app could derive and pin it from `paymentId`.
- **JSON** (`http_json.go`): crypto payments carry `paymentCryptoAddress` and `paymentUrlExpiration` (`:180`). Fields the app reads: `paymentStatus`, `redeemType`, `cashbackCredited`, `cashbackReversed`, and on fulfilled cards with secrets only (`GET /:id`) `barcodeType`, `redeemUrlChallenge`. `redeemUrl` and `barcodeUrl` embed 10-year unauthenticated view tokens (`:369-396`).
- Statuses `unpaid, paid, fulfilled, rejected, refunded, expired`. List query parameters (`status=a,b`, `status!=`, `order`): **unverified** at this SHA.

## Cashback and refunds

- With `rewardType: cashback` the holding currency must be a stable; a fiat payment must match the user's stable; the user pays full price; `cashbackAmount` is fixed at settlement.
- Crediting is a ledger transfer into the user's CTX account wallet (`flow_payment_settlement.go`). On chain only as a threshold payout (`flow_account_threshold.go:311-365`); below the network fee it is held.
- `cashbackDestination: savings` makes that payout a gift of vault shares (`flow_payout.go:823-880`); unsupported currency → balance stays put. Sponsored links pay no network fee out of the payout (commit `c869cf29`).
- Refund reversal is a ledger transfer from the account wallet back to the card (`flow_payment_settlement.go:621-681`), never a chain debit. If the balance was already paid out, `AssertRefundable` refuses the refund.

## Merchants, profile and account

- `GET /merchants` (`http_ep_merchant_list.go:16-45`): `page, perPage, id, slug, ids, name, name!, group, enabled, status, country, currency, category, discount, order`, and more. `name`, `ids`, `slug`, `country`, `currency` are **regex** filters (`:49-52,63-64`): a bare `slug` is a partial match. The unauthenticated route has no company or discount scoping (`:102-132`). Whether an invalid bearer still falls back to it: **unverified**. `group` and `category` fields added.
- `GET /merchants/:id`: not traced.
- `PUT /users/:id` (`http_ep_user_update.go:74-165`): `legalName` trimmed; `country` must be valid and supported by an operator company, and assigns the country's stable if none is set (`entity_user.go:551-561`); `stableCurrency` only while empty and only with an empty wallet (`:134-147`); `cashbackDestination` `account|savings`. All but `legalName` fire `user.profile.updated`.
- `/me` and `/users/:id/account` shapes: **unverified** at this SHA (account now reads indexed holdings, commit `9312bd76`).
- An account-erase route exists (commit list); the app does not call it.

## Contradictions with the app

1. The app sends `Idempotency-Key` on `POST /gift-cards`; CTX ignores it. Retries duplicate orders.
2. The app models bank methods (`plaid-uk-eu`, `plaid-vrp`); CTX picks the method from config. Branch on `paymentUrl` presence and handle `ErrBankLinkRequired`.
3. The app's socket sends auth headers; a browser cannot, and CTX authenticates only at upgrade.
4. The pay destination is a CTX field; the muxed id is derivable from `paymentId` and is not derived.
5. `slug` is a regex on CTX; the signed-out merchant page looks up by `?slug=`.
6. Deploy ignores keys on repeat; only `rotate_device` (passkey) changes the device key.
7. CTX enforces nothing about rule 0 or wasm.
8. Signature expiry is 60 ledgers; the biometric or passkey prompt sits between build and sponsor.
9. Concurrent refreshes inside 30 s revoke the new tokens.
