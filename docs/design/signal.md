# Signal — Oak design guide

> **SUPERSEDED.** Do not implement from this file. The visual language to
> implement is [`enamel-paper.md`](enamel-paper.md) (Enamel & Paper). This
> document is history (cool daylight, Figtree + IBM Plex Mono, red as a 2px
> LED). Do not re-apply Signal.

> **Authority (historical).** This file is no longer the language to implement.
> It once superseded `soul.md`, `fable-ui-strategy.md`, and
> `docs/design-system/design-system.md`. Those files and this one stay as
> history. Do not re-apply them. Implement from [`enamel-paper.md`](enamel-paper.md).
>
> **Lab.** The approved mock is `docs/design/theme-lab/` · world **Signal**
> (`#sig/answer/web`, `#sig/answer/ios`). Open that if a token here and a
> screenshot disagree: the mock wins on feel, this file wins on completeness.
>
> **Status.** Strategy + tokens + screen recipes. No product UI has been
> restyled yet. Implementation is a separate pass, on all three clients
> together (web, iOS, Android).
>
> **Picked.** 2026-08-16, after two theme-lab rounds. Daylight + Index,
> leaning Daylight, with true Pokéball red as a signal.

---

## 0. How to use this

A new agent should:

1. Read **§1 Thesis** and **§2 Refuse** before touching CSS or Swift.
2. Land **§3 Foundation** as tokens on all three clients first.
3. Restyle screens in **§6** order (empty chat is the first visible win).
4. Use **§8 File map** so you do not invent a fourth token source.
5. Stop when **§10 Acceptance** is true. Do not add a metaphor.

Do not change the wire contract, `OakAnswer` field names, tool names, or
the answer-card *data* order (lead → body → subjects → table → reasoning →
inferences → uncertainty → citations). You are restyling, not redesigning
the agent.

---

## 1. Thesis

Oak is a **calm daylight app that reasons on top of data.**

The chrome is a consumer product: cool gray canvas, white plates, native
tabs, a lot of air. The brand is a **signal**, not a costume. True Pokéball
red (`#E3350D`) appears only where something acts or is live. Pokémon
content (sprites, the 18 type colors) is the other color in the room.

Mechanics answers get a small fact table under the lead. That is the Index
habit. Everything else is Daylight.

It is not a red Pokédex toy. It is not a lab instrument. It is not cream
paper. It is not indigo SaaS.

**References (what to borrow, not copy):**

- **iOS Settings / Things 3** — native chrome, large titles, no costume.
- **Linear** — one accent, hairline rules, numbers that sit still.
- **The official Pokédex red** — the ball, not the anime clamshell.

---

## 2. Refuse

If a change would reintroduce any of these, reject it.

### Discarded directions (do not revive)

| Direction | Why it lost |
|-----------|-------------|
| Field notes / specimen desk | Cream, grain, dashed plates, Fredoka. 2025 craft cliché. |
| Instrument / chassis | Teenage Engineering Pokédex. Over-machined. Owner passed. |
| Night Shift, Climate, Press Box, Night Garden | Too much world. |
| The Dex (lab) | Accurate to the show. Too much costume for daily use. |
| Box One as the whole app | Palette was liked. The PC-box metaphor was not the product. |
| Daylight as-is | Right bones. Indigo made it anonymous. |
| Index as-is | Right data habit. Felt like an admin table. |

### Hard bans

1. Cream, taupe, cocoa, grain, noise, graph-grid, dashed chrome.
2. Fredoka, Space Grotesk as the voice of the app, Inter as a *new* default
   (Figtree replaces it). Do not add a third sans.
3. Red header slab. Red user bubbles. Red fill on any large surface
   (sidebar, canvas, answer plate, tab bar background).
4. Clamshell / LCD / blue hardware buttons / yellow HT-WT strip / Dexter
   ding / scanlines / “POKÉDEX” silkscreen.
5. Indigo (`#3D4C7A`) or azure as the brand. Azure may stay as a *focus
   ring only* if red-on-red focus fails AA. It is not a second accent.
6. Stadium crawl, LIVE split-flap, jersey numbers, night-game chrome.
7. Moon, sap, moths, weather particles, garden serif.
8. Centered logo + four equal hero chips as the empty state.
9. Pastel type *washes* that mute the 18 types. Type chips are solid.
10. Spring bounce, overshoot, blur-in, lid-flip, teletype of raw tool ids.
11. Decoration that does not encode type, status, scope, or an action.

---

## 3. Foundation

Land these as tokens before restyling components. One source per client
(see §8). Hexes below are the contract.

### 3.1 Color

#### Neutrals (cool, not warm)

Light:

| Token | Hex | Use |
|-------|-----|-----|
| `--bg` / canvas | `#F6F7F9` | App ground |
| `--surface` | `#FFFFFF` | Answer plate, composer, list row, sheet |
| `--sunken` | `#EEF0F3` | User note fill, input well |
| `--line` | `#E3E8EF` | Hairline borders |
| `--ink` | `#1B2430` | Titles, lead, nav active |
| `--text` | `#2A3340` | Body |
| `--mute` | `#5B6B7C` | Meta, captions, placeholders |
| `--faint` | `#8A94A0` | Disabled, timestamps |

Dark (cool, not cocoa, not OLED-gimmick):

| Token | Hex | Use |
|-------|-----|-----|
| `--bg` | `#121417` | Canvas |
| `--surface` | `#1A1D22` | Plates |
| `--sunken` | `#0E1013` | User note, wells |
| `--line` | `#2A3038` | Hairlines |
| `--ink` | `#F2F4F6` | Titles |
| `--text` | `#D5DAE0` | Body |
| `--mute` | `#8B949E` | Meta |
| `--faint` | `#6A737D` | Disabled |

No pure `#000` and no cream.

#### Brand (Pokéball red)

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `--red` | `#E3350D` | `#FF4A22` | Send, live pip, active mark, wordmark period |
| `--red-hover` | `#C92E0B` | `#FF5F3C` | Hover on red fills |
| `--red-active` | `#B02A0A` | `#E8431E` | Pressed red fills |
| `--red-soft` | `#FDE8E3` | `#33170F` | Focus halo *behind* red only. Never a card fill. |
| `--on-red` | `#FFFFFF` | `#1B1410` | Text/icon on a solid red fill. Dark red is too bright for white (fails AA). |

#### Red's jobs (exhaustive)

Red may do **only** these:

1. Primary action fill: Send, Save, New chat, confirm-destructive-if-red-is-the-app-action (prefer `--danger` for delete).
2. Live state: 6–7px pip + 2px progress bar while a turn is running; Stop control.
3. Active mark: 2px inset bar on the single selected nav item or the single open history row.
4. Wordmark period: `Oak.` with the period in `--red`.
5. The word **Inferred** (the word only) in the inference line.
6. Scope LED: 6px dot next to the scope label.

Red does **not** fill user bubbles, paint the header, wash the sidebar, color
body copy, or outline every card.

#### Semantic (keep, retint to the cool ramp)

| Token | Light | Role |
|-------|-------|------|
| `--success` | `#1F9D61` | Legal / ok |
| `--warning` | `#E08700` | Estimate, caveat (not inferred) |
| `--danger` | `#D6303F` | Delete, error |
| `--focus` | `#E3350D` at 2px, offset by canvas | Prefer red focus. If a red button + red ring fails, use `#2B7DD1` for focus only. |

#### Type solids (theme-stable, keep existing)

Do not invent a new type palette. Reuse the current 18:

| Type | Hex | Ink on solid chip |
|------|-----|-------------------|
| normal | `#A8A77A` | `#16181A` |
| fire | `#EE8130` | `#16181A` |
| water | `#6390F0` | `#16181A` |
| electric | `#F7D02C` | `#16181A` |
| grass | `#7AC74C` | `#16181A` |
| ice | `#96D9D6` | `#16181A` |
| fighting | `#C22E28` | `#FFFFFF` |
| poison | `#A33EA1` | `#FFFFFF` |
| ground | `#E2BF65` | `#16181A` |
| flying | `#A98FF3` | `#16181A` |
| psychic | `#F95587` | `#16181A` |
| bug | `#A6B91A` | `#16181A` |
| rock | `#B6A136` | `#16181A` |
| ghost | `#735797` | `#FFFFFF` |
| dragon | `#6F35FC` | `#FFFFFF` |
| dark | `#705746` | `#FFFFFF` |
| steel | `#B7B7CE` | `#16181A` |
| fairy | `#D685AD` | `#16181A` |

The lab used 16% tinted chips as a sketch. **Ship solid chips** with the ink
column above. That matches Signal's own line: types are the other color in
the room.

### 3.2 Typography

| Role | Face | Weight | Size / line | Tracking |
|------|------|--------|-------------|----------|
| Wordmark | Figtree | 600 | 18 / 1 | −0.03em. Period is `--red`. |
| Screen title (iOS large) | Figtree | 600 | 28 / 1.15 | −0.03em |
| Answer lead | Figtree | 600 | 22 / 1.25 (iOS 22, web 22) | −0.02em |
| Section heading | Figtree | 600 | 16 / 1.3 | 0 |
| Body | Figtree | 400 | 15 / 1.5 | 0. Measure ≤ 62ch. |
| Meta / caption | Figtree | 500 | 13 / 1.4 | 0. `--mute`. |
| Starter / row title | Figtree | 500 | 15 / 1.35 | 0 |
| Fact table label | IBM Plex Mono | 500 | 12 / 1.3 | 0. `--mute`. |
| Fact table value | IBM Plex Mono | 400 | 13 / 1.3 | 0. Tabular nums. |
| Scope / LED label | Figtree | 500 | 12 / 1 | 0. `--mute`. |

Web: `next/font` for Figtree and IBM Plex Mono. Do not `<link>` Google Fonts
in production.

iOS: add the Figtree and IBM Plex Mono variable (or static 400/500/600)
faces to the target. Keep `Font.custom(_:size:relativeTo:)` so Dynamic Type
still scales. Drop Space Grotesk and Inter as the brand pair. Inter may
remain as a system fallback only.

Android: same two families in `res/font`. Compose `Typography` mirrors the
table.

One sans. One mono. Mono appears **only** in fact tables, damage breakdowns,
and source keys. Not in nav. Not in the empty headline.

### 3.3 Space

Keep the 4px scale already in the app:

`4, 8, 12, 16, 20, 24, 32, 40, 48, 64`

- Web sidebar: 200px.
- Web thread padding: 22px horizontal.
- Answer plate padding: 16px.
- Composer inset: 12px 16px, 16px from the canvas edge (8/12 on iOS).
- iOS safe area: standard. Tab bar ~49pt + home indicator. Touch 44pt min.

### 3.4 Radius

| Token | Value | Use |
|-------|-------|-----|
| `--radius-sm` | 8px | Type chips, small buttons |
| `--radius-md` | 10px | List rows, starters |
| `--radius-lg` | 12px | Answer plate, composer, sheets (web) |
| `--radius-xl` | 16px | iOS artifact sheet |
| `--radius-pill` | 999px | Type chips if they read better as pills; scope chip |

Do not pill the composer, the answer plate, or primary buttons. Send is
8–12px, not a capsule the width of the bar.

### 3.5 Elevation

Default to **hairline**, not shadow.

- Plates and rows: `1px solid var(--line)` on `--surface`. No drop shadow
  on the resting answer.
- Composer: same. Focus = 2px `--red` ring, 2px canvas offset.
- Floating (menus, toasts, artifact on iOS): one cool-tinted shadow
  `0 12px 32px -16px rgba(27, 36, 48, 0.18)`.
- No inset “wells” as a device metaphor. User notes may use `--sunken` fill
  plus a hairline. That is paper, not a chassis.

### 3.6 Motion

| Token | Value | Use |
|-------|-------|-----|
| `--ease` | `cubic-bezier(0.2, 0, 0, 1)` | All chrome |
| `--motion-fast` | 180ms | Hover, press, tab, pip |
| `--motion-enter` | 280ms | Answer plate rise (8px → 0, fade) |
| Press | `scale(0.98)` | Red buttons only |

Honor `prefers-reduced-motion` / `UIAccessibility.isReduceMotionEnabled`:
instant opacity, no rise, no pip blink (pip stays solid).

Do not: blur-in, lid hinge, scanline, split-flap, bounce, count-up numbers.

Streaming motion is a **2px red bar** that eases from ~24% to ~72% width
and a **7px red pip** that steps blink at 1.2s. Status text is mute Figtree,
not a mono teletype of tool ids. Friendly nouns are fine
(`Looking up Farigiraf, Fake Out, Armor Tail`).

---

## 4. Signature objects

These must appear. If a screen is missing its object, the skin is unfinished.

| Object | Spec |
|--------|------|
| **Wordmark `Oak.`** | Figtree 600, 18px. The period is `--red`. Never a logo mark, never concentric rings. |
| **Scope LED** | 6px `--red` dot + mute label (`National Dex`). Header only. Do not repeat it on the answer plate. |
| **Answer plate** | White / dark surface, 12px radius, hairline. Lead 22/600. Body mute. Then optional fact table, then subject row (sprite + name + caption). |
| **Fact table** | Two columns, hairline between rows. Mono 12/13. Use on mechanics, damage, and comparisons. Omit on pure lore / location prose if there is nothing tabular. Never decorate it. |
| **Inferred line** | One sentence under the body. Only the word `Inferred` is `--red` 600. Rest is mute. Not a banner, not a stamp. |
| **Send** | Solid `--red`, `--on-red` label, 8–12 radius, 44pt tall on native. |
| **Active mark** | 2px `--red` inset on the *one* selected sidebar item or the *one* open history row. Not a rail down a list. |
| **User note** | Sunken fill, hairline, ink text. No red bubble. No corner pip. |
| **Starters** | Four full-width rows on `--surface`, 10px radius. Text only. No equal hero chips. |

Uncertainty / generation fallback stays a designed strip (warning, not red)
above or below the lead when `uncertainty_flags` or `generation_basis.fallback`
is set. Do not bury it.

Reasoning and citations stay collapsible, under the plate or as a second
block. Label them `Why` and `Sources`, not `RECEIPTS` and not `STANDBY`.

---

## 5. Component recipes

### 5.1 Type chip

Solid `--type-*` fill, contrast ink from §3.1, radius 8, padding 2×8, Figtree
600, 11px. No 16% wash.

### 5.2 Composer

Surface plate, hairline, radius 12. Placeholder mute. Trailing Send. Image
attach and voice sit as mute icons to the left of Send. Focus ring per §3.5.

### 5.3 Sidebar (web)

200px. Wordmark at top. Items: Chat, History, Teams, Account (plus existing
reference links if they already live here). Active item: white row + 2px red
inset. Inactive: mute, no fill. No red thread on the header.

### 5.4 Tabs (iOS / Android)

System tab bar. Selected label + icon `--red`. Unselected `--mute`.
Bar background is canvas / material, **not** red.

Items stay the product's current IA (Chat, Teams, History, You / Account).
Do not invent Dex / Party / Wall labels.

### 5.5 Artifact

Web: 320px right sheet, surface, left hairline. iOS/Android: 16px sheet
from the bottom, ~52–62% height. Same type chips, same fact table recipe.
No dossier spine, no LCD.

### 5.6 Voice

A 14px `--red` pip and the word `Listening`. No orb, no moths, no VU
stadium number. The thread stays visible behind.

---

## 6. Screen-by-screen

Map every change to the three clients. Analogous files: web component ↔
iOS view ↔ Android composable. Do not ship a web-only restyle.

### 6.1 Chat empty

- **Hero:** `What do you want to know?` Figtree 600 / 28.
- **Sub:** One mute sentence. `Mechanics, locations, teams, damage. Oak will show its work.`
- **Starters:** four rows (keep the current starter *content* if it already
  exists; restyle to Signal rows). Optional mute prefix (`Battle`, `Dex`,
  `Rules`, `Meta`) is allowed. No category pills as the composition.
- **Chrome:** wordmark + scope LED. Composer at the bottom.
- **Do not** center a logo, rings, or “Ask Oak” as a poster.

### 6.2 Chat streaming

- User note is already in the thread.
- Status: red pip + mute sentence of friendly nouns.
- 2px red bar under that line.
- No instrument ticker of raw tool names.
- Stop is a real control (already in the product). Style it as a mute
  button, or red only if it is the single live action.

### 6.3 Chat answer (the money shot)

Order inside the plate:

1. Type chips (if `subjects[].types`).
2. Lead: first paragraph of `answer_markdown` at 22/600 ink. Rest of
   markdown as 15/400 mute-or-text.
3. Inferred line if `inferences[]` is non-empty.
4. Fact table when the turn is mechanics / damage / a structured
   comparison. Rows come from the payload you already have (`damage_calc`,
   move priority, ability name). Do not invent stats.
5. Subject row: sprite 72, name 600, caption mute (`Armor Tail · #0981`).
6. Uncertainty strip if flagged.
7. Collapsible Why (`reasoning_markdown`) and Sources (`citations[]`).

Candidate tables (`candidates`) stay a real table, restyled to the fact-table
type ramp. Do not turn them into a bento.

### 6.4 Artifact

Entity / move / ability / team / damage / matchup. Surface sheet. Title,
chips, fact table or stat bars, prose. Close is a mute control.

### 6.5 Teams

Quiet list or 6-member rows: sprite, name, types. Active team is one 2px
mark, not a red card. Editor keeps current IA. Teams Assistant panel uses
the same plate + composer. No party-slot wallpaper.

### 6.6 History

Rows: title + mute date/scope. Open row: 2px red inset. Search and pin
stay. No `OPEN` stamp, no mini-plate lift.

### 6.7 Auth

`Sign in` / six-digit code. Same composer recipe. No “researcher access”,
no trainer-ID theater beyond what the product already says.

### 6.8 Voice overlay

§5.6. Signed-in only remains a product rule.

### 6.9 Reference / Pokédex / Meta (web)

Public reference stays. Apply the same canvas, type, chips, and red-as-signal.
Do not give `/pokedex` a second visual language. Scope chips and Ask Oak CTAs
use Send-red only on the actual CTA.

### 6.10 Admin

Out of scope for the consumer skin. Leave `/admin` on its current tokens
unless a change is required to share the red hex. Do not spend the first
pass here.

---

## 7. Dark mode

Ship both. Canvas and plates invert per §3.1. Red lifts to `#FF4A22` and
`--on-red` becomes near-black. Type solids do not change. Hairlines stay
visible (`#2A3038`). Test empty, answer, teams, history, auth, and the
artifact sheet at both themes, desktop and a 390-wide phone.

---

## 8. File map (do not grow a fourth source)

| Client | Tokens | Type | Answer | Chrome |
|--------|--------|------|--------|--------|
| Web | `web/src/app/globals.css` | `web/src/app/layout.tsx` (`next/font`) | `web/src/components/answer-card/*` | `nav/`, `chat/`, `controls/ScopeChip.tsx`, `history/`, `teams/`, `voice/`, `auth/` |
| iOS | `ios/OakApp/UI/Theme.swift` | same + font files in the target | answer-card views under `ios/OakApp/` | `OakChrome`, tabs, composer, `TypeBadge.swift`, `OakBrandMark.swift` |
| Android | theme / `Color.kt` + `Type.kt` (or the existing theme mirror) | `res/font` | `MarkdownBlockView` / answer composables | nav, chat, teams, matching iOS 1:1 |

Replace Space Grotesk / Inter / JetBrains Mono *as the brand pair*. If
JetBrains Mono is already bundled, IBM Plex Mono is still the Signal face
for tables. Do not leave Space Grotesk on the wordmark.

Existing 4px space scale, type-solid tokens, and `--poke-red: #e3350d`
already match Signal. The work is: retarget neutrals to §3.1, swap the
typefaces, delete instrument objects (ticker, type-lit plate glow, chassis
thread, `RECEIPTS` / `STANDBY` copy), and apply the recipes.

---

## 9. Implementation sequence

Do this in order. Each step should be reviewable on all three clients.

1. **Tokens + typefaces** on web, iOS, Android. No layout yet. Dark + light.
2. **Wordmark `Oak.` + Send + scope LED + active mark.** The brand is now
   visible on a still-instrument layout. That is fine for one commit.
3. **Empty chat + composer.** First “it feels like Signal” screenshot.
4. **Answer plate** (lead, chips, inferred line, fact table, subject row,
   Why/Sources). Kill type-lit glows and the receipts drawer chrome.
5. **Streaming** (pip + bar + nouns). Remove the instrument ticker.
6. **History, teams, artifact, auth, voice.** Same recipes.
7. **Reference** (web) pass so `/pokedex` and `/meta` are not a second app.
8. **Sweep:** no cream, no Space Grotesk, no dashed, no red slab. Reduced
   motion. 44pt. Contrast on `--on-red` in dark.

Do not implement The Dex, Box One wallpaper, or Index as a full layout.

---

## 10. Acceptance

The work is done when all of these are true:

- [ ] A new empty chat on web and iOS reads as Signal, not Instrument and
      not paper. Screenshot against the lab `#sig/empty/ios`.
- [ ] A Fake Out / Farigiraf answer has: type chips, 22px lead, inferred
      word in red, a four-row fact table, subject sprite. No LCD. No hanko.
- [ ] Send is `#E3350D` (or dark `#FF4A22`) with passing `--on-red` contrast.
- [ ] No red header, no red user bubble, no indigo brand.
- [ ] Wordmark is `Oak.` with a red period.
- [ ] Scope is a mute label + 6px red dot, once, in the header.
- [ ] Type chips are solid, contrast-safe, all 18.
- [ ] Dark mode exists and uses the cool ramp in §3.1.
- [ ] iOS and Android match web on the objects in §4 (parity rule).
- [ ] `prefers-reduced-motion` kills the pip blink and the 8px rise.
- [ ] Touch targets ≥ 44pt. Dynamic Type still scales.
- [ ] Wire contract and `OakAnswer` fields unchanged.
- [ ] `docs/design/soul.md` matches this file (short form). No agent can
      read the old Instrument soul and think it is current.

---

## 11. Copy (ship these strings)

| Place | Copy |
|-------|------|
| Empty title | What do you want to know? |
| Empty sub | Mechanics, locations, teams, damage. Oak will show its work. |
| Composer placeholder | Ask Oak |
| Send | Send |
| Streaming | Looking up {friendly nouns} |
| Inferred | Inferred from {short reason}. |
| Reasoning header | Why |
| Citations header | Sources |
| Auth title | Sign in |
| Voice | Listening |
| Wordmark | Oak. |

Do not ship `STANDBY`, `RECEIPTS`, `FILE A QUERY`, `PRESS CREDENTIAL`,
`The Long Neck Pokémon` as UI chrome, or `HANDY505`.

---

## 12. Protect

Do not “clean up” while you skin:

- SSE / background-turn behavior
- Scope resolution and the eleven formats
- OakAnswer validation and field set
- Citation and uncertainty as first-class (restyle, do not bury)
- 44pt targets, Dynamic Type, reduce-motion, contrast
- Account scoping, guest vs signed-in IA
- Admin gating

If a component test asserts Instrument copy (`STANDBY`, `RECEIPTS`) or
Space Grotesk class names, update the test to Signal. Do not keep the old
strings to spare the test.
