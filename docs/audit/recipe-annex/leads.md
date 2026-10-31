# Annex: cold leads

Seeds for the next audit. Each is a hypothesis from recipe derivation, not a verified finding; every lead goes through the normal finder and skeptic before it is reported. Cites are `path:symbol` at `95aec37`. L1–L24 carry over from earlier derivations; leads whose code is gone or changed are noted in the last section.

## Open

| ID | Lead | Where | Dim | Source |
|---|---|---|---|---|
| L2 | No recovery when the passkey is lost. The passkey now signs `rotate_device`, so a lost device is recoverable, but a lost passkey leaves only the device key (rule 1, restricted). CTX has recovery routes the app does not call. | `wallet/device-link.ts`, `wallet/passkey.ts` | REL MNY UXP | carried |
| L3 | Unpinned, `WalletPin.choose` takes the first usable link and `WalletRules.check` skips the passkey key compare. Address not derived from factory + `credentialId`; rule policies not checked. | `wallet/wallet-pin.ts:choose`, `wallet/wallet-rules.ts` | SEC MNY | carried, narrowed |
| L4 | Quote independence: `BuyPrice.check` compares against rates.ctx.com, the same operator as the order book. A hostile CTX controls both. | `ctx/buy-price.ts`, `ctx/rates.ts` | MNY | carried, narrowed |
| L5 | Destination pinned to `giftCard.paymentCryptoAddress` (CTX data), not to a muxed id derived from `paymentId`. | `wallet/smart-wallet.ts:requirePayment` | MNY | carried, narrowed |
| L6 | Web: any same-origin script can sign with the IndexedDB CryptoKey (no gesture) and read the refresh token, pin and records from `localStorage`. | `device-signer.web.ts`, `token-store.web.ts`, `wallet-pin.ts:pinStorage` | SEC | carried |
| L7 | Withdraw floor and every chain check come from an RPC, now one of two with failover and no cross-check. | `wallet/holdings.ts:floorOf`, `stellar/soroban.ts` | MNY SEC | carried |
| L10 | `userIdFrom` decodes the JWT payload with `atob`, no padding or validation. | `ctx/client.ts:userIdFrom` | COR REL | carried |
| L11 | `sendRefreshToken` retries a network error with the same refresh token; if the first call rotated, the retry is a reuse inside CTX's 30 s window. Native has no cross-process lock. | `session/session-auth.ts:sendRefreshToken`, `token-store.ts:exclusive` | CON REL | carried |
| L16 | `authDigest` and the passkey challenge must match OZ exactly; check whether `sponsored-call.test.ts` pins an external known vector or round-trips the app's own formula. | `wallet/sponsored-call.ts:authDigest` | COR TST | carried |
| L17 | CTX error bodies rendered verbatim and `selectable`; web has no capture protection. | `ctx/ctx-error.ts`, `components/message-screen.tsx`, `native/screen-privacy*.ts` | PRV SEC | carried |
| L19 | `PasskeySite.forHost` maps every non-localhost web host to `loopfinance.io`; a staging or preview host not covered by the RP's related origins fails passkey ops. Check AASA/`assetlinks.json` cover the app ids and fingerprints. | `wallet/passkey-site.ts`, `public/.well-known/*` | MBL SEC | carried |
| L22 | `PRODUCT.md` and the marketing pages claim self-custody and yield; check against the code (yield display, recovery). | `PRODUCT.md`, `app/(site)/security.tsx`, `how-it-works.tsx` | DOC | carried |
| L24 | TOFU: before a pin exists, link order decides the wallet. CTX now forbids customer-created sponsored links, which narrows it to CTX itself. | `wallet/wallet-pin.ts:choose` | SEC DAT | carried, narrowed |
| L25 | `Idempotency-Key` is ignored by CTX. `sessionRequest` replays `POST /gift-cards` after a token refresh, a user can retry after a timeout, and `OneTapBuy` re-creates on price expiry: each can leave duplicate unpaid orders, and `activeGiftCard` (perPage 5) may resume the wrong one. | `ctx/client.ts:orderGiftCard`, `ctx/order-request.ts:OrderKeys`, `session/session-auth.ts:sessionRequest`, `ctx/one-tap-buy.ts` | MNY API CON | CTX |
| L26 | Bank `paymentUrl` is opened with `openBrowserAsync` with no scheme or host check. A hostile or broken CTX can open any URL in the in-app browser inside the pay flow. | `components/gift-card-purchase.tsx` (bank branch), `ctx/bank-payment.ts` | SEC MNY | new |
| L27 | The app models `plaid-uk-eu` vs `plaid-vrp`, but CTX picks the method from config and returns no `paymentUrl` for VRP; check the VRP and `ErrBankLinkRequired` paths. | `ctx/bank-payment.ts` | API INT | CTX |
| L28 | Web socket auth: the browser `WebSocket` ignores the headers argument, so `/ws` on web connects unauthenticated (or fails). The socket also outlives the access token, and CTX closes on backlog overflow. Check reconnect on session change and token refresh. | `ctx/client.ts:watchOrder`, `watchAccount`, `hooks/use-account-changes.ts` | SEC REL API | new |
| L29 | `PasskeyAssertion.requireSigned` checks type, challenge and p256 signature but not `origin` or `rpIdHash`. | `wallet/passkey-assertion.ts` | SEC | new |
| L30 | Edge image proxy: on resize failure it falls back to `fetch(image.src)`; check redirects off the S3 prefix, response type and size, and cache keys built from the raw query. | `edge/catalog.ts:CatalogImage`, `functions/api/catalog/image.ts` | SEC INF | new |
| L31 | Edge catalog cache: 7-day stale window on prices and discounts; check the cache key matches the whitelisted query, and that `slug`/`name` regex values are not passed through unescaped (CTX treats them as regexes). | `edge/catalog.ts:CatalogQuery`, `storefront.tsx` | SEC COR | new |
| L32 | The signed-out merchant page looks up `?slug=`, a regex on CTX; a partial match can show a different merchant. | `ctx/client.ts:merchant` | COR API | CTX |
| L33 | Cash-out mock collects UK name, sort code and account number. Check it never persists, logs, reports to Sentry or leaves the component, and that the copy says it is a preview. | `app/wallet/cash-out.tsx` | PRV UXP | new |
| L34 | `transferMatches(value, null)` returns true: with no surviving sent record, any wallet → payee transfer of the amount in the window counts as paid. | `ctx/payment-state.ts:transferMatches`, `wallet/payment-search.ts:orderPaid` | MNY | carried from INV-6 |
| L35 | Web refresh token key `ctx.refreshToken` is not env-scoped while native keys are; a staging and a production build on the same origin would share it. | `session/token-store.web.ts` | CFG DAT | new |
| L36 | Wallet ids from CTX are interpolated unencoded into `/wallets/${walletId}/stellar/*`. | `ctx/client.ts` | SEC | carried from L9 |
| L37 | Account deletion is a `mailto:` request plus a local favourites clear; CTX has an erase route. Check App Store deletion requirements and what local state remains. | `components/account-deletion.tsx` | PRV MBL | new |
| L38 | Google sign-in sends no nonce (Apple does). | `native/social-sign-in.ts:googleCredential` | SEC | new |
| L39 | App lock unlocks on `not_enrolled` / `passcode_not_set`. | `session/app-lock.ts` | SEC | carried from INV-13 |
| L40 | Release workflow: check the ref gate, secret exposure to PRs, Actions pinning, and that `certs/certificate.pem` matches the signing key; `npm audit` does not block PRs. | `.github/workflows/release.yml`, `ci.yml` | CID | new |

## Closed or changed at `95aec37` (re-verify, then drop)

- **L1** device key overwrite: `deviceSigner.create` returns an existing key; keys are per user.
- **L8** `redeemUrl` now checked with `externalUrl.isWeb`; the bank URL part moved to L26, `website` remains in INV-17.
- **L9** `giftCard(id)` now encoded; wallet ids moved to L36.
- **L12** sign-out state: session generation and `useSessionOwner` reset screens; per-user records remain under INV-7.
- **L13** timeouts: `Deadline` on CTX calls, RPC timeouts, bounded polls.
- **L14** env pairing: `LoopEnvironment` fixes CTX + network and throws otherwise.
- **L15** expiry bound: `(latest, latest + 120]`.
- **L18** reinstall: `InstallScopedToken` drops the token when the install marker is missing.
- **L20** root `ErrorBoundary` exists.
- **L21** `external-link.tsx` comment gone.
- **L23** deletion request, terms and privacy exist (see L37).
