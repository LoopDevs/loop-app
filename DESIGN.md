# Design

Source of truth is the code. Tokens live in `src/constants/theme.ts`. Read them in components through `useTheme()` (`src/hooks/use-theme.ts`).

## Principles

- Calm, white, blue. One accent, lots of air, soft shadows.
- Show money first. Balances and cashback are the largest text on a screen.
- Speak to a casual shopper. Say what happens to their money in plain words.
- One brand across iOS, Android and web. Native tabs, haptics and back gesture stay native.
- Light mode only. `app.json` sets `userInterfaceStyle: light` and `src/global.css` sets `color-scheme: light`.

## Colour tokens

`Colors.light` in `src/constants/theme.ts`.

- `text` #0F1B2D: body and headings.
- `textSecondary` #5A6577: details, captions, inactive icons.
- `background` #FFFFFF: page. `backgroundElement` #FFFFFF: cards, rows, tab bar.
- `backgroundSubtle` #F7F8FA: quiet bands and placeholders.
- `backgroundSelected` #EEF1F5: pressed rows, selected buttons, skeleton and badge fills.
- `border` #E6EAF0: card and divider lines. `borderStrong` #D3DBE6: secondary button outline.
- `accent` #2F6BFF: primary buttons, links, active tab, rate pills.
- `accentPressed` #1A56DB: pressed accent. `accentSoft` #EAF0FF: tinted hero and icon chips.
- `onAccent` #FFFFFF: text on accent.
- `danger` #B42318 and `success` #11734B: Notice tone and status text.
- `inverse` #0F1B2D, `onInverse` #FFFFFF, `onInverseMuted` #C3CAD5: toast and brand-coloured surfaces.
- `chrome` (white at 92%) is for translucent bars. `scrim` is for modal backdrops.

Rules:
- Hex and rgba literals are banned outside the theme file (`eslint.config.js`). Import `Colors` only in the theme hooks.
- `hsl(...)` strings are allowed. They are used for per-merchant hues only.
- Shadows come from `Elevation` (`card`, `raised`, `badge`, `sheet`), never ad-hoc.

## Type scale

Font is Fira Sans in four weights: regular, medium, semibold, bold (`FontFamily`). The same family loads on web (`src/global.css`, `--font-display`). Body text uses tabular numerals on web.

`ThemedText` (`src/components/ui/themed-text.tsx`), size/line:
- `title` 40/46 bold. Page and hero balance on wide screens.
- `subtitle` 28/34 semibold. Hero on phones.
- `heading` 20/26 semibold.
- `default` 16/24 regular.
- `small` 14/20, `smallBold` 14/20 semibold. Details and row labels.
- `caption` 12/16 medium.
- `linkPrimary` 14/24 semibold in accent.

Screens also set a few fixed sizes in their own styles (section titles 17, field text 17, tab label 11, pills 13). Text scales with the system up to 1.6x (`maxFontSizeMultiplier`).

## Spacing and radius

- `Spacing`: half 2, one 4, two 8, three 16, four 24, five 32, six 64.
- Cards pad `three` or `four`. Heroes pad `four`, and `five` on wide screens. Stacks gap `three` or `four`.
- `Radius`: small 8, medium 14, large 22, pill 999.
- Inputs, notices and list groups use medium. Cards and heroes use large. Buttons, pills, discs and toasts use pill.
- Cards use a hairline border. Controls are at least 44 high; buttons and fields are 50; list rows 52.

## Layout

- Page max width 1240 (`Layout.pageMaxWidth`). Gutter 16, and 32 once wide.
- Wide means web at 960px or more (`PageMetrics.wideMinWidth`, `src/hooks/page-layout.ts`). Below that, web shows the phone layout.
- Reading pages (shop, merchant page) cap at 800 (`MaxContentWidth`). Forms cap at 420. Sheets are 440 wide.
- Grid columns step 2, 3, 4, 5, 6 by content width.
- Tabs: Home, Shop, Savings, Wallet, Profile. Labels always sit under icons.
  - Native: `src/components/app-tabs.tsx`, labelled native tabs, 11pt labels, accent when selected.
  - Web: `src/components/app-tabs.web.tsx`. Below 960px a sticky bottom bar with icon over label. At 960px and up a top header with the wordmark, search and text tabs.
- Native scroll views end with `ScrollEndInset` so content clears the tab bar. Web needs none.

## Components

- `Button` (`ui/form.tsx`): `primary` (accent fill), `secondary` (outlined, default), `quiet` (accent text). One primary per view.
- `Field` (`ui/form.tsx`): labelled text input, medium radius.
- `Notice` (`ui/form.tsx`): bordered message with an optional action. Use for errors and status.
- `ListGroup` and `ListRow` (`ui/list-row.tsx`): grouped settings and detail rows with hairline dividers, trailing chevron, link or check.
- `Skeleton` (`ui/skeleton.tsx`): loading placeholder that pulses. Use for loading content.
- `PressScale` (`ui/press-scale.tsx`): scale-on-press wrapper for tappable cards and tiles.
- `PreviewBadge` (`ui/preview-badge.tsx`): small pill marking screens where nothing is sent.
- `ThemedText`, `ThemedView` (`ui/`): default text and surface wrappers.
- `Collapsible` (`ui/collapsible.tsx`): show/hide block for secondary detail.
- `Toast` (`ui/toast.tsx`): short confirmation pill on the inverse colour.

## Motion

`Motion` in `src/constants/theme.ts`.
- `feedback` 120ms: press in, hover, tab background.
- `state` 220ms: fades, collapses, toasts, press out.
- `transition` 360ms: screen and storefront entrances.
- `exit` 160ms. `stagger` 45ms between items (half that in the merchant grid).
- Easing is `easeOut`, bezier (0.16, 1, 0.3, 1). Press scale is 0.97.
- Entrances are `FadeIn` or `FadeInDown`. Reduced motion turns them off; `PressScale` falls back to a small fade.

## Brand surfaces

- Gift card face (`src/components/gift-card-face.tsx`): credit-card ratio 1.586, large radius, filled with `brandGround`. White logo tile top left, merchant name and amount bottom left, Loop wordmark bottom right. Two faint white glows add depth.
- Merchant disc (`src/components/merchant-mark.tsx`): circle, default 40. With a logo it sits on `brandTint` at 72% size. Without a logo it shows the initial in bold on `brandGround`.
- Hue rules: each merchant has a hue (`tileHue()`, fallback 225).
  - `brandGround` is `hsl(hue, 42%, 34%)`. Dark enough for white text.
  - `brandTint` is `hsl(hue, 45%, 92%)`. Light enough for any logo.
- Hero patterns:
  - Home (`src/components/home-overview.tsx`) and wallet (`src/components/wallet-summary.tsx`): white card, hairline border, large radius, balance in `title`, actions below.
  - Savings (`src/app/savings/index.tsx`): `accentSoft` hero, accent icon chip, accent rate pill, `subtitle`/`title` headline.
  - Welcome (`src/components/welcome.tsx`): full accent ground with `onAccent` text and merchant tiles on `brandTint`. Native first launch only.

## Copy rules

- Plain words and outcomes: "On the way", "Where your cashback goes", "UK bank account".
- Never show passkey, smart account, token, chain or crypto terms. Use "cashback", "balance", "savings", "Face ID".
- Short sentences. Buttons start with a verb.
- Errors say what happened and what to do next. Offer the action in the `Notice`.
- Amounts use the shared `money` formatter (`src/money.ts`), in the user's currency.

## Do / Don't

Do:
- Read colour, spacing, radius and motion from the theme.
- Use `ListGroup` for lists, `Notice` for messages, `Skeleton` for loading.
- Give every tappable thing a role, label and 44pt target.
- Respect reduced motion.

Don't:
- Write hex or rgba literals in components.
- Add a second accent or per-screen colours. Brand hues come from `brandGround` and `brandTint` only.
- Invent shadows, radii or durations.
- Use dark mode values or `useColorScheme` branching.
- Put crypto words in user-facing text.
