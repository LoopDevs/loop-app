---
version: 1
slug: "src-app-index-tsx"
primary_target: "src/app/index.tsx"
related_targets: []
---

# Home screen

Scope: app home tab (iOS, Android, web). Mode: Operate.
Decision: direction round 5bf6ca6d, founders picked C (Signal Yellow) with the yellow swapped for blue. Blue locked: Royal #1C3FAE (white text 8.9:1, action squares #0A1640). Cobalt and Azure not chosen.
Audience and job: see the balance and what Loop has earned for them, then buy the next gift card.
Constraints: cashback and savings only, no discount anywhere; geometric Loop wordmark only; no "Balance" label; no activity list on home.

## Direction contract

THESIS: Loop as a sign panel. One saturated blue panel, a huge balance, one plain line that says where the user stands. Refuses the Monzo card-plus-activity-list home.
OWN-WORLD: full-bleed blue panel to the top edge; near-square corners (2-4px); deep navy squares for action icons; Fira Sans at sign scale for the balance; tinted cool ground; gift card tiles show cashback as the number only ("3%"); badge style open between A classic Loop card (44px logo + tiny pill), B rate in type under the name, C square Royal corner tag notched into the image's top-right (recommended; pills read as ugly to the founders); the merchant name gets the full tile width and wraps, never truncates.
STORY: the user sees their balance, reads one account-state line (tiered rules, first match wins), and goes straight to the gift cards below.
FIRST VIEWPORT: wordmark top left on the blue panel; balance at 54px; one message line under a 2px rule; four square actions; gift cards start right below the panel.
FORM: sign panel plus odometer balance (pounds roll in as a left-to-right wave, pence follow). Top status-bar scrim: one constant dark see-through blur (deep navy ~50%, strong backdrop blur, soft fall-off) fading in over the first 160px of scroll, same in light and dark; status text stays white, no colour change. seed: none (unavailable)
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
