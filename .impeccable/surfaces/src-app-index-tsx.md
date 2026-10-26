---
version: 2
slug: "src-app-index-tsx"
primary_target: "src/app/index.tsx"
related_targets: ["src/app/shop/index.tsx", "src/components/home-overview.tsx", "src/components/merchant-card.tsx"]
---

# Home and Shop

Scope: app home tab and shop tab (iOS, Android, web). Mode: Operate.
Decision: founder direction 2026-10-26: "we're a fintech app ... we should inspire trust, our two core products are gift cards and savings." References: a Revolut-style money overview for Home, the Too Good To Go Discover feed for Shop. Brand stays Loop: Royal #1C3FAE panel, navy #0A1640, Fira Sans, cool tinted ground. The reference purple is not adopted.
Audience and job: see what they hold (spending balance, savings, cashback on the way) and what they bought, then find the next gift card.
Constraints: cashback and savings only, no discount anywhere; geometric Loop wordmark only; no wallet, passkey, crypto, token or address words on screen; never invent numbers (no savings rate is shown until the app has one from a real source).

## Direction contract

THESIS: a calm money overview. The blue panel holds "Total balance", the odometer balance, one account-state line and four round actions; everything below sits on white rounded cards with soft shadows and generous space.
OWN-WORLD: full-bleed Royal panel to the top edge; round translucent-navy action buttons (56px) with white icons; section titles in accent colour; white cards at Radius.card (20) with Elevation.card; rows lead with a 40px round disc (currency symbol, merchant logo or icon) and end with right-aligned tabular amounts; the cashback badge stays a rounded pill (decided).
HOME (signed in): panel, next-step card (add money when the total is zero, otherwise the top cashback merchant), Spending balance (one row per held currency, "Other money" valued at today's rate), Savings (savings value, cashback on the way, Withdraw), Recent gift cards (four latest, See all), then a Top cashback strip. Wide web: the money cards in the left column, next step and recent gift cards in the right. Signed out, Home stays the storefront landing.
SHOP (signed in): search in the panel header, category tiles (icon on a rounded square, "All" first, tap filters the list), strips of photo cards (Top cashback, Favourites, Bought recently), then all gift cards as a card grid (2 columns on phones, up to 4 on wide web).
MERCHANT CARD: full-bleed card photo when CTX has one, with a round white logo badge overlapping the photo's bottom-left; without a photo, the logo centred on white, or the initial on the merchant's hue. Cashback pill top right, round white heart top left, then name and category.
FORM: odometer balance (whole units roll in as a left-to-right wave, cents follow). Status-bar scrim: deep navy ~50% with backdrop blur fading in over the first 160px of scroll. Motion stays quiet: press scale, a short fade-down on cards.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict and DESIGN.md.
