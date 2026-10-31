# Annex: cold leads

Seeds for the first audit. Each is a hypothesis from recipe derivation, not a verified finding. Every lead must go through the normal finder and skeptic before it is reported. Line numbers are at `8ecf7ae`. "Both" means the architecture pass and the blind re-derivation found it independently.

| ID | Lead | Where | Dim | Source |
|---|---|---|---|---|
| L1 | Device key is per install. `deviceSigner.create` deletes and replaces `device.signer.secret`. A second user on the device, or a user whose link is not yet `active`, overwrites the only key that can sign for an existing wallet. CTX deploy is idempotent and ignores new keys, so it cannot be repaired. | `wallet/device-signer.ts:24-33`, `smart-wallet.ts:41-69` | MNY REL DAT | both |
| L2 | No passkey signing or recovery path anywhere in the app. A biometric change invalidates the SecureStore item; a lost phone loses the device key. Funds then need a path the app does not have. | `wallet/passkey.ts`, `device-signer.ts:11` | REL MNY UXP | arch |
| L3 | `verify()` on load skips the passkey key compare, rule context and policies, and address derivation from `credentialId` via the factory. A hostile CTX can present a same-wasm account whose rule 1 is the device key but whose rule 0 is someone else's passkey; the user deposits there. | `smart-wallet.ts:71-90,182-193` | SEC MNY | both |
| L4 | Pay amount and token are pinned to CTX's own `paymentCryptoAmount`/`paymentCryptoCurrency`; no cap against fiat value or the requested currency. | `smart-wallet.ts:111-121,165-180` | MNY | both |
| L5 | Muxed id in the transfer destination is unchecked. CTX derives it from the payment UUID, so the app can pin it. Without that, a signature can pay a different order. | `smart-wallet.ts:158-163,170` | MNY | both |
| L6 | Web: any same-origin script can sign with the IndexedDB CryptoKey (no user gesture) and read the refresh token from `localStorage`. | `device-signer.web.ts`, `token-store.web.ts` | SEC | both |
| L7 | Withdraw floor comes from the same RPC that is being trusted. | `smart-wallet.ts:195-219` | MNY SEC | both |
| L8 | `redeemUrl` opened with no scheme or host allowlist; `barcodeUrl`, `logoUrl`, `cardImageUrl` fetched from any host; `merchant.website` turned into an `https://` link if it lacks a scheme. `redeemUrl` embeds a 10-year view token, so it is a bearer credential for the card. | `gift-card-details.tsx:21-37`, `ctx/merchant.ts` `websiteUrl`, `app/shop/[slug].tsx` | SEC PRV | both |
| L9 | `giftCard(id)` interpolates an unencoded route param (`/orders/[id]`, deep link `loop://orders/...`). `merchant(idOrSlug)` encodes; wallet ids from CTX do not. | `ctx/client.ts:253-255,296-305` | SEC | both |
| L10 | `userIdFrom` decodes base64url with `atob` without padding or validation; a malformed token throws on every user request. | `ctx/client.ts:383-386` | COR REL | both |
| L11 | Refresh single-flight is per JS context; CTX revokes the successor chain on reuse inside 30 s. Two tabs sign each other out. A crash between rotation and `writeRefreshToken` loses the session. | `ctx/client.ts:351-381` | CON REL | arch + CTX |
| L12 | Sign-out clears tokens and home state only. Orders list state, shop profile state and the device key survive into the next user's session. | `ctx/client.ts:211-214`, `app/index.tsx:110-116`, `orders/index.tsx:19`, `shop/index.tsx:25` | PRV DAT | both |
| L13 | No timeout on `fetch` or RPC; `followOrder` swallows every error and retries forever. `busy` can stick. | `client.ts:394`, `soroban.ts`, `gift-card-purchase.tsx:54-76` | REL | both |
| L14 | `EXPO_PUBLIC_STELLAR_NETWORK` typo silently selects testnet; CTX URL is configured separately and defaults to `''` (relative fetch on web). | `network.ts:70`, `client.ts:411-414` | CFG | both |
| L15 | Expiry ledger has no upper bound in the app; a hostile CTX can obtain a long-lived signature and submit it later. | `sponsored-call.ts:22-75` | MNY | arch |
| L16 | `authDigest` must match OZ stellar-accounts exactly (ScMap key order). No test pins it to a known vector. | `sponsored-call.ts:78-98` | COR TST | arch |
| L17 | Codes and errors: CTX error bodies shown verbatim and `selectable`; web has no capture protection; Android app-switcher not protected. | `client.ts` `CtxError`, `screen-privacy*.ts` | PRV SEC | both |
| L18 | iOS Keychain items (refresh token, device public key, secret) survive uninstall; a reinstall resumes the previous session. Android backup rules come from the `expo-secure-store` plugin default. | `token-store.ts`, `app.json` plugins | MBL PRV | arch |
| L19 | Passkey RP id is `window.location.hostname` on web and `loopfinance.io` on native; AASA and `assetlinks.json` must be hosted outside this repo. | `passkey.ts`, `app.json` | MBL SEC | both |
| L20 | No error boundary at the root; a render throw (for example `BigInt` on a non-integer rate) blanks the app. | `app/_layout.tsx`, `ctx/merchant.ts:86-88` | REL | arch |
| L21 | `components/external-link.tsx` carries a code comment, against the project's no-comments rule. | `components/external-link.tsx` | HLT | arch |
| L22 | `PRODUCT.md` describes a passkey-secured wallet and savings yield; the passkey never signs and yield is not shown. | `PRODUCT.md` | DOC | arch |
| L23 | No account deletion, privacy policy or terms in the app; App Store sign-up apps need account deletion. | `src/app/` | PRV MBL | arch |
| L24 | `SmartWallet.load` takes the first matching link. CTX lets a customer add wallet links; if one can be marked sponsored and active, the app's choice is order-dependent. | `smart-wallet.ts:41-52` | SEC DAT | CTX |
