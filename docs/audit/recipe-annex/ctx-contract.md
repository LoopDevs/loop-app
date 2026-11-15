# Annex: CTX customer contract

What CTX spend-api does with each call the app makes. Read from `git -C ../spend-api show origin/staging:<path>` at `cba8f2e9` (2026-11-13; 139 commits since `189b9409`). Paths are under `internal/` in spend-api; line numbers are at that commit. CTX staging moves daily: re-read before relying on any line. Items marked **unverified** were not traced to a code path.

## Routes and authorization

- Customer role: `service_rbac.go:165-206`. All scoped `User=self` except merchant get/list: `account:get`, `bankwithdrawal:{create,get}`, `transfer:list`, `protectedrequest:{create,list,get,cancel}`, `wallet:{link,deploy,sponsor,list,update,unlink}`, `wallet:backup:{upload,delete,recover}`, `wallet:recovery:{start,finish}`, `giftcard:{barcode:get,create,get,list,number:update,redeem,view}`, `merchant:{get,list}`, `paymentmethod:{create,list,delete}`, `purchaseallowance:get`, `payment:wallet:pay`, `merchantlink:list`, `user:update`, `user:2fa:toggle`. Since `189b9409`: `giftcard:number:update` and `purchaseallowance:get` added, none removed.
- IDOR guard: the token's user id must equal the path user id; `GET /gift-cards/:id` targets the card's owner; the list forces `UserId` to the caller.
- Wallet deploy, link and unlink stay customer-reachable (five sponsored wallets per user). Once the user has a sponsored wallet, deploy and unlink need a passkey assertion (`passkey` + `signedAt` within 5 min, matching a linked wallet's passkey; `http_ep_user_wallet_passkey.go:14-81`); unlink also refuses with `ErrSmartWalletPayoutLink` or `ErrSmartWalletHoldsFunds` (`:84-111`). A bare customer token can therefore plant a wallet only for a user who has none; the app's pin and `WalletIdentity.prove` remain the client-side defence (INV-4).
- Sponsor and build take `walletId` from the path and need `wallet:sponsor`. Sponsor limiter: burst 10, one token per 3 min, per user (`entity_wallet_link.go:29-30`, `http_router.go:73-77`).
- Recovery: a customer can start and finish. The REST cancel route needs `wallet:recovery:cancel` (system only, `http_ep_user_wallet_recovery.go:202`); a customer cancels through the device-signed sponsor intent `recovery_cancel`.
- Account erase: `DELETE /users/:id` needs `user:delete` (not in the customer role) and refuses self-deletion (`http_ep_user_delete.go:36-44`). A customer has no erase route.
- `DELETE /users/:id/sessions/others` and `DELETE /users/:id/signing-keys/:keyId` are open to the user's own bearer session with fresh auth.
- No customer cancel for gift cards: `DELETE /gift-cards/:id` needs `giftcard:archive`, `PUT /gift-cards/:id/status` needs `giftcard:status:update`; neither is in the customer role. `cancelled`, `expired` and `error` are set by the system.
- Maintenance mode (503 `ErrMaintenanceMode`) blocks everything except `/status`, `/me` and `/system/trigger` (`http_router.go:156-163`). The kill switch (`ErrKillSwitchActive`) blocks gift-card create only. Global limiter: burst 100, 2 rps (`http_router.go:57-59`).
- Customer-reachable endpoints the app does not call: wallet link CRUD, backup, recovery start/finish, payment methods, bank withdrawals, transfers, protected requests, `/2fa/*`, purchase allowance, sessions/others, signing keys, the `send` and `recovery_cancel` intents, the gift-card SSE stream. Attack surface a customer token reaches regardless of the app.

## Sessions

- Access token 8 h, refresh 90 days (`http_auth.go:167,176`). Gift-card view token: a 10-year JWT that is not stored and cannot be revoked (`:30`, `:185-192`).
- Refresh rotates on every call; the old token's expiry is cut to now + 30 s on first use (`http_auth.go:94`, `:297-327`); reuse of an already-rotated token revokes the successor chain (`:306`, `:329-345`). `/refresh-token` does not read `X-Client-Id` on the non-legacy path (`http_ep_auth_refresh.go:138-165`).
- `POST /login`: 200 for an existing user, 201 for a new one: an account-existence oracle. Failures sleep 5 s.
- OTP: 20 min, 5 failed guesses then locked (`entity_verification_code.go:16-17`), re-sent at most once a minute.
- `/login/oauth` body `{provider, idToken, nonce?, givenName?, familyName?}`. The nonce is required for Apple and optional for Google (`oidc/oidc.go:64-66`). Every login stores the claim nonce, or `sha256(idToken)` when there is none, in a unique index; a repeat is `ErrOAuthTokenReplayed` (401) (`:113-128`). Request names are used only when the token carries none.
- `/logout` revokes the session; needs a bearer token.

## WebSocket `/ws`

- Authenticates once, at upgrade (`http_ws.go:89-96`): `Authorization: Bearer`, or `?token=` when there is no bearer header; client id from `X-Client-Id` or `?clientId=` (`http_auth.go:117-141`). A browser handshake works with query parameters; no subprotocol or first-message auth. `CheckOrigin` always returns true (`:111-113`). Token expiry is not re-checked after the upgrade.
- Commands `subscribe`, `unsubscribe`, `list`; topics `merchant`, `giftcard`, `company`, `account`.
- Ping every 20 s; read deadline 60 s; max inbound message 4096 bytes; closes with `CloseTryAgainLater` on a backlog overflow of 256 events (`:19-24`, `:198-201`).
- `giftcard` topic: `system.giftcard.created|paid|fulfilled|rejected|refunded|expired|payment_settled|display_status_updated`, own cards only, payload without secrets, `plaidLinkToken` or `paymentUrl`. No cashback events.
- `account` topic: `system.account.balances.updated`, `system.wallet.holdings.updated`, `system.payout.held|submitted|queued|completed|failed`, `system.bankwithdrawal.status_changed`, `system.paymentmethod.status_changed`, `user.profile.updated`.
- An SSE stream `GET /gift-cards/:id?stream=true` also exists (`http_ep_giftcard_get.go:24-27`, `:130-160`).

## Smart wallet

- **Deploy:** body `credentialId`, `passkeyPublicKey` (65 bytes), `devicePublicKey` (32 bytes). Address depends on `credentialId` only; a repeat with the same credential id returns the existing link, keys ignored.
- **Build:** `{transaction, digest, contextRuleIds, expiryLedger}`; expiry = latest + 60 (`crypto/crypto_node_stellar_smartwallet.go:24,252`).
- **Sponsor:** `passkey` for passkey intents, otherwise `{signature, devicePublicKey}` (`http_ep_user_wallet_smart.go:50-66`). CTX re-derives the call and verifies the transaction against it; the chain verifies the signature.
- **Intents** (`smartwallet.go`; rule ids passkey = 0, device = 1):
  - `pay {paymentId}`: `[1]`. `<SAC>.transfer(wallet, payment muxed address, amount)` (`:133-178`).
  - `vault_deposit {currency, amount}`: `[1, 1]` (`:195-196`). `<vault>.deposit([amount], [min], wallet, true)` (`defindex/service.go:337-358`); the nested token transfer is the vault's pull. `min = amount − slippage`, default 50 bps (`defindex.go:15`, `service.go:796-799`). Extra decimals are truncated.
  - `vault_withdraw {currency, shares}`: `[1]`. `<vault>.withdraw(shares, [minOut], wallet)` with the same slippage on `ValueOf(shares)` (`:360-385`).
  - `rotate_device {newDevicePublicKey}`: `[0]`. `<wallet>.rotate_device(bytes32)` (`:283-298`).
  - Not used by the app: `send {currency, amount, destination}` (`[0]`, XLM.USDC or XLM.EURC to any address), `recovery_cancel` (`[1]`, `<wallet>.recovery_cancel(wallet)`, `:300-308`).
- Vault lookup is keyed by `XLM.USDC|XLM.EURC|XLM.GBPLOOP` (`defindex.go:39`); a bare `USDC` is not normalised and answers `ErrSavingsUnavailable` (`smartwallet.go:186-189`). Code defaults exist for the testnet USDC vault only; mainnet vault ids come from config (**unverified** against the app's pins). A vault is used only after `Verify` (`service.go:172-176`).
- **No GBPLOOP yield job:** nothing in `internal/` tops up or accrues a GBPLOOP vault, and no endpoint exposes a rate or APY (`/status` lists `savingsCurrencies` and `bankPaymentFlows` only). The app's fixed 4% and daily step describe an operation outside this repo.
- Nothing in CTX pins rule 0 or the wasm hash; the app's `WalletRules.check` is the only check.

## Gift cards

- **Create** body (`http_ep_giftcard_create.go:21-32`): `cryptoCurrency, fiatAmount, fiatCurrency, merchantId, locationId, operatorReference, rewardType, platform, chooseBank, idempotencyKey`.
- **Idempotency is a body field.** `idempotencyKey` (≤ 128 chars) with a unique index on `(userid, idempotencykey)` and a body fingerprint: same key and body → 201 with the existing card; same key, different body → `ErrIdempotencyKeyReused` (409); a claim younger than 5 min and unpaid → `ErrIdempotentRequestInFlight` (409) (`:34-40`, `:621`, `:638-647`). No `Idempotency-Key` header is read anywhere. `operatorReference` is length-checked only.
- **Bank method** comes from config (`config.go:127-132`): `payment.plaid.flow` `RECURRING` → `plaid-vrp`, else `plaid-uk-eu` (default).
  - `plaid-uk-eu` (`payment_plaid.go:676-704`): `platform: android` or `ios` with the client configured for it → a native `plaidLinkToken`; otherwise a hosted `paymentUrl` returning to `client.PlaidLinkReturn("orders/<id>")`. Both expire after 30 min (`paymentUrlExpiration`). The remembered `BankInstitutionId` is preset on the token unless `chooseBank` is true, and is cleared server-side if Plaid rejects it (`:586-620`).
  - `plaid-vrp` (`http_ep_giftcard_create.go:717-729`): needs an authorised payment method, else `ErrBankLinkRequired` (402); executes immediately; returns no link fields.
  - Rails by user country (`payment_plaid.go:50-72`): GBP for GB; EUR for euro-area countries on `plaid-uk-eu`; otherwise `ErrBankRailUnavailable`. The live fiat set depends on config (**unverified**).
  - `ErrBankPaymentIdentityRequired` (400) when `LegalName` is not at least two words or the email is empty.
- **Purchase limits:** per-user daily and monthly limits per company, `ErrPurchaseLimitExceeded` (400), `GET /users/:id/purchase-allowance`.
- **`PUT /gift-cards/:id/number`** `{number, pin}` (`http_ep_giftcard_update_number.go`): owner only; for a customer the number must be non-empty and the card must await a code (`fulfilled`, no number, no PIN), so it fills once and cannot overwrite. No length or charset validation, no `redeemType` check, no event, no per-route rate limit. System staff may overwrite.
- XLM payments get a muxed address whose id is the low 8 bytes of the payment UUID; the app could derive and pin it from `paymentId`.
- **JSON** (`http_json.go:26-423`): while unpaid, `paymentUrlExpiration` and `plaidLinkToken` or `paymentUrl`/`paymentUrls`, crypto address and URIs; while fulfilled with secrets, `info`, `pin`, `number`, `barcodeUrl` (only with a number), `barcodeType`, `barcodeContent`, `redeemUrl`, `redeemUrlChallenge`. `redeemUrl` and `barcodeUrl` embed the 10-year view token as `?token=`. `paymentFailureReason` is conditional. The create response carries no secrets.

## Cashback and refunds

- Order-time user discount (`http_ep_giftcard_create.go:327-364`): for a company that prices by formula, `FormulaUserDiscountBasisPointsForLink` capped at the base discount minus the company margin (default 50 bps); otherwise the link override, else the company default, else the merchant's. Stored on the card as `UserDiscountBasisPoints`; settlement splits by the stored value (`flow_payment_settlement.go:413-433`).
- Merchant JSON `userDiscount` applies the formula only for formula companies; for other operators it is the raw merchant value, ignoring the company and link overrides the order path applies (`entity_merchant.go:563-570`). `/me` `company.defaultUserDiscountBasisPoints` is null unless the company sets an override. The app's `CompanyCashback` reproduces the non-formula rule client-side.
- Crediting is a ledger transfer into the user's CTX account wallet; on chain only as a threshold payout; `cashbackDestination: savings` makes that payout a gift of vault shares. Refund reversal is a ledger transfer, never a chain debit.

## Merchants, profile and account

- `GET /merchants`: `name`, `ids`, `slug`, `country`, `currency` are **regex** filters; a bare `slug` is a partial match. The unauthenticated route has no company or discount scoping.
- `PUT /users/:id` (`http_ep_user_update.go`): `name` (no validation); `legalName` trimmed, no length check, feeds the Plaid identity; `country` validated and assigns the country's stable if none is set; `stableCurrency` settable once from empty; `cashbackDestination` `account|savings`; `bankInstitutionId` must match `^ins_[0-9]{1,24}$` or be empty and `bankInstitutionName` ≤ 80 runes (`http_validation.go:191-200`). All but `name` and `legalName` fire `user.profile.updated`.
- `/me` returns `{user, company, client, permissions}`; `company.countries`, `stableCurrencies` and `defaultUserDiscountBasisPoints` appear only for an operator company.

## Contradictions with the app

1. The app sends an `Idempotency-Key` header on `POST /gift-cards`; CTX dedupes on the `idempotencyKey` body field and ignores the header. The client-side lost-answer recovery (`ctx/client.ts:placedOrder`) is still the only protection.
2. The app's cancel is a local hidden list; CTX has no customer cancel, so the order stays unpaid upstream.
3. The app shows a fixed 4% GBP rate with a daily step; spend-api has no top-up job and no rate endpoint.
4. The app opens no socket on web; CTX accepts `?token=&clientId=` (which would put the access token in a URL).
5. The app has no recovery view or cancel; CTX offers a device-signed `recovery_cancel` intent.
6. Account deletion in the app is a `mailto:`; CTX refuses self-deletion, so support must act.
7. The app's rail table is GB/GBP; CTX offers EUR rails. The app maps none of `ErrPurchaseLimitExceeded`, `ErrBankRailUnavailable`, `ErrIdempotencyKeyReused`, `ErrIdempotentRequestInFlight`, `ErrOAuthTokenReplayed`.
8. The app accepts any deposit `min ≤ amount`; CTX builds `amount − 50 bps`.
9. The code write has no server-side shape check; the app's parse heuristics are the only filter on what a redeem page can plant.
10. The app shows the cashback rate from the listed merchant value and the company default; CTX fixes it per order by its own formula.
11. The pay destination is a CTX field; the muxed id is derivable from `paymentId` and is not derived.
12. `slug` is a regex on CTX; the signed-out merchant page looks up by `?slug=`.
13. Deploy ignores keys on repeat; only `rotate_device` (passkey) changes the device key. CTX enforces nothing about rule 0 or wasm.
14. Signature expiry is 60 ledgers; the biometric or passkey prompt sits between build and sponsor. The sponsor limiter allows one call per 3 min after a burst of 10; a top-up plus a pay is two.
15. Concurrent refreshes inside 30 s revoke the new tokens.
