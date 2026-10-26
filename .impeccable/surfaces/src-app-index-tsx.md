---
version: 2
slug: "src-app-index-tsx"
primary_target: "src/app/index.tsx"
related_targets: ["src/app/shop/index.tsx", "src/components/home-overview.tsx", "src/components/merchant-card.tsx", "src/components/sign-in.tsx"]
---

# Home and Shop

Scope: app home tab and shop tab (iOS, Android, web). Mode: Operate.
Decision: founder direction 2026-10-26: "we're a fintech app ... we should inspire trust, our two core products are gift cards and savings", and a full redesign toward the Airbnb Explore look. Loop keeps its accent #1A56DB and Fira Sans; the Royal/navy panel is retired.
Audience and job: see what they hold (spending balance, savings, cashback on the way) and what they bought, then find the next gift card.
Constraints: cashback and savings only, no discount anywhere; geometric Loop wordmark only; no wallet, passkey, crypto, token or address words on screen; never invent numbers.

## Direction contract

THESIS: a calm money overview on a white canvas. Near-black ink, cool slate greys, hairline borders, very soft shadows. The accent is rare: primary buttons, links, focus, the cashback pill tint and the active tab.
OWN-WORLD: no coloured hero bands; headers are white with a hairline bottom on scroll; dark mode is near-black, not navy. Round neutral action buttons (56px, grey fill, ink icon). Cards at Radius.card (22) with Elevation.card and a hairline. Full-pill buttons and chips. Section headings bold ink with a round grey arrow button.
HOME (signed in): "Total balance" odometer on white, round actions, the next-step card (grey label row, bold title, grey subline, chevron, thumbnail right), balance rows in a white bordered list, Savings first-class, a promo card (bold two-line title, grey pill button, illustration right), Recent gift cards, Top cashback strip.
SHOP: a big white pill search bar with a soft shadow, category chips (white pills with icons, selected one grey), strips and a grid of merchant cards.
MERCHANT CARD: one component everywhere. Cover photo on top (merchant hue when there is none), round logo overlapping the cover's bottom edge with a white ring and soft shadow, cashback pill on the photo, heart top right, then a one-line name and the category in grey.
SIGN-UP (web): Enter your email, Confirm code, Secure your account, with a step indicator; a centred card on wide web, a sheet on narrow.
FORM: odometer balance; a white status-bar scrim with a hairline fades in on scroll. Motion stays quiet: press scale, short fades.
