# Oak Mobile Theme Translation — web vibe → iOS + Android

*Fable UI design pass, 2026-07-05. Method note: the web app was reviewed from a
live screenshot plus `web/src/app/globals.css` (the single source of truth); the
native apps were critiqued from source (`ios/OakApp/`, `android/app/`) — they were
not screenshotted for this pass, so pixel-level claims about them are inferred
from code. This doc is the implementation spec for the mobile re-theme; the web
app's own strategy lives in `docs/design/fable-ui-strategy.md` and is untouched.*

---

## 1. Diagnosis — why the mobile apps don't carry the vibe

The good news first: **neither app is a stock platform app underneath.** Both
carry an Oak token layer explicitly ported from `globals.css` — coral accent,
warm surfaces, pill radii, spring motion, the 18 type solids, full dark ramps.
The bubbles, chips, answer cards, composers, and markdown renderers are already
custom. What's missing is the *finishing coat*: the parts of the web identity
that make Oak read as Oak the moment the screen lights up.

### The four systemic tells (both platforms)

1. **No brand typography.** Web = **Fredoka** (display), **Nunito Sans** (body),
   **JetBrains Mono** (instrument). iOS is 100% SF (SF Rounded approximates
   Fredoka but isn't it); Android is 100% Roboto. Typography is the single
   loudest carrier of the web app's personality — the rounded, friendly Fredoka
   wordmark and headings against precise mono data labels IS "playful chrome,
   precise data." Without the faces, everything else reads as a tinted system app.
2. **The cream paper never reaches the screen edge.** The web's `#FBF7F4` canvas
   is everywhere. On iOS the token exists but the chat scroll view and every
   `List`/`Form` screen sit on Apple's default background; on Android the
   `background` slot is right but stock `TopAppBar`/`NavigationBar` surfaces and
   Material container colors interrupt it.
3. **Platform chrome bleeds through at the highest-visibility points.** iOS: default
   translucent nav-bar/tab-bar material, Apple `.bordered` capsule buttons,
   stock grouped-List/Form chrome. Android: stock `NavigationBar`,
   five stock `TopAppBar`s, default `OutlinedTextField` outline/label colors,
   `FilterChip`, default buttons/dialogs/sheets/snackbars, and
   `MaterialTheme.shapes` never overridden so Material's default corner family
   leaks wherever a `shape=` isn't passed.
4. **Cool-gray ink on warm paper (iOS).** `Theme.swift` maps text/separator to
   Apple's system semantics (`label`, `secondaryLabel`, `tertiaryLabel`,
   `.separator`) — cool grays with blue undertones — while the web's ink ramp is
   warm (`#3D362F` text, `#6E625A` muted, `#E9E0D8` hairlines). The temperature
   clash is subtle but constant; it's a big part of "uses our colors but doesn't
   feel like our app." (Android already uses the warm ink ramp.)

### Token drift found (fix during implementation)

| Token | Web (truth) | iOS today | Android today |
|---|---|---|---|
| canvas / bg light | `#FBF7F4` | `#FBF9F7` ✗ | `#FBF7F4` ✓ |
| canvas / bg dark | `#161311` | `#171412` ✗ | `#161311` ✓ |
| surface dark | `#211C19` | `#211D1A` ✗ | `#211C19` ✓ |
| surface-raised dark | `#2A2420` | `#26211D` ✗ | `#2A2420` ✓ |
| surface-sunken light | `#F7F1EB` | `#F4F0EC` ✗ | `#F7F1EB` ✓ |
| surface-sunken dark | `#12100E` | `#121009` ✗ | `#12100E` ✓ |
| text/border ramp | warm ink ramp | system semantics ✗ | ✓ |
| soft tints (`*-soft`) | 8 tokens | missing ✗ | only `accentSoft` — 7 missing ✗ |

### Component-level divergences from the web recipe

- **User chat bubble**: web is *soft* — `color-mix(--poke-red-soft 55%, --surface)`
  fill, red-tinted hairline border, **dark text**, lg radius with a sm
  bottom-trailing tail corner, raised shadow. Both apps render a **flat coral
  bubble with white text** — louder and less paper-like than the brand.
- **Focus color**: web reserves **azure** for interaction focus (input focus
  border + glow, links, focus rings) and red for brand/primary/live. The native
  composers focus red. Red-on-focus makes the live/streaming red state
  meaningless.
- **Suggestion chips**: web empty-state chips hover red-soft, in-thread chips
  hover azure-soft; native chips are close but should adopt the press-scale
  grammar (see §4.6).

---

## 2. Direction

**The web app is the taste thesis — "Playful chrome, precise data" — and the
native apps are its faithful print editions.** Oak first, platform second:
every visible surface speaks Oak (paper canvas, Fredoka voice, engraved mono
instruments, pill chrome, the red thread), while *interaction* stays native
(swipe-back, sheets, haptics, Dynamic Type / font scale, pull-to-refresh).
Reference feel: Things 3's discipline about owning every pixel of chrome while
remaining unmistakably native in hand-feel, with Oak's warmer, more playful
temperature.

Dark mode: both apps keep following the OS appearance (decided with the owner).
The web's dark palette is the dark palette; there is no in-app toggle on mobile.

---

## 3. Foundation — the token translation

### 3.1 Typefaces (net-new on both platforms)

Bundle static TTFs (Google Fonts, OFL — ship the license files):

| Family | Weights | Role |
|---|---|---|
| **Fredoka** | 500 Medium, 600 SemiBold | Display: wordmark, screen titles, markdown headings, sprite/entity names |
| **Nunito Sans** | 400/500/600/700 | Body: all prose, buttons, chips, rows (answer lead = 700) |
| **JetBrains Mono** | 500, 600 | Instrument: `.ilabel` engraved labels, dex numbers, stat/damage numerals (tabular), tool-trail tokens, code |

- **iOS**: `ios/OakApp/Resources/Fonts/*.ttf` (picked up by the directory source
  glob), register in `Info.plist` `UIAppFonts` (hand-edit — plist is authoritative),
  re-run `xcodegen generate`. Rewire the existing chokepoints in
  `UI/Theme.swift`: `display()`, `body()`, `mono()`, `answerLead()`,
  `instrument()` become `Font.custom(name, size:, relativeTo:)` so Dynamic Type
  keeps scaling. Verify PostScript names at runtime (`UIFont.familyNames`) —
  Nunito Sans statics are typically `NunitoSans-Regular` etc. but Google's
  10pt-optical statics can differ (`NunitoSans10pt-Regular`).
- **Android**: `android/app/src/main/res/font/` (lowercase_underscore filenames)
  + `FontFamily` vals; set `fontFamily` per role in `OakTypography`, and use a
  `FredokaFamily` for display roles (`displaySmall`, `headlineMedium/Small`,
  `titleLarge`), `NunitoSansFamily` for body/label roles, `JetBrainsMonoFamily`
  replacing the current `FontFamily.Monospace` usages.

**Web type scale → native roles** (web sizes in px; iOS scales via
`relativeTo`, Android via sp):

| Role | Web | iOS (`Font.custom` relativeTo) | Android (`OakTypography`) |
|---|---|---|---|
| Wordmark / hero | Fredoka 600 · 28/34 | Fredoka SemiBold 28 rel `.largeTitle` | Fredoka 600 · `displaySmall` 28sp |
| Screen/section titles | Fredoka 600 · 18–22 | Fredoka SemiBold rel `.title2`/`.title3` | Fredoka 600 · `headlineSmall`/`titleLarge` 18sp |
| Answer lead (verdict) | Nunito Sans **700** · 22 | NunitoSans Bold 22 rel `.title3` | Nunito Sans 700 · `headlineMedium` 22sp |
| Body prose | Nunito Sans 400 · 15–16 / lh 1.55 | NunitoSans Regular 16 rel `.body` | Nunito Sans 400 · `bodyLarge` 16sp |
| Secondary / rows | Nunito Sans 600 · 13–14 | NunitoSans SemiBold rel `.subheadline` | Nunito Sans 600 · `bodyMedium`/`titleSmall` 14sp |
| Instrument label | JBM 600 · 11 · caps · +0.08em | JetBrainsMono SemiBold 11 rel `.caption2` + tracking 0.8 + uppercase (existing `instrumentLabel()`) | JBM 600 · `labelSmall` 11sp, `letterSpacing 0.88sp`, uppercase |
| Mono numerals | JBM 500 tabular | JetBrainsMono Medium + `.monospacedDigit` semantics | JBM 500 + tabular feature |

### 3.2 Color (authoritative table — reconcile every token)

Values are web truth; **iOS adopts the warm ink ramp** (drop `label`/
`secondaryLabel`/`tertiaryLabel`/`.separator` for themed adaptive colors — keep
Dynamic Type via fonts, contrast was designed into the ramp) and **both apps add
the missing soft tints**:

| Token | Light | Dark | iOS `Theme.` | Android |
|---|---|---|---|---|
| accent (poke-red) | `#EE5A5A` | `#FF6B6B` | `accent` ✓ | `accent`/`primary` ✓ |
| accentHover | `#E04545` | `#FF7E7E` | ✓ | ✓ |
| accentActive | `#C93B3B` | `#F25C5C` | ✓ | ✓ |
| **accentSoft** | `#FCEBEB` | `#3A1E1E` | **add** | ✓ |
| sunflower / **soft** | `#F5A524` / `#FDF1DC` | `#F8B73E` / `#3A2E14` | soft: **add** | soft: **add** |
| azure / **soft** | `#3AA0E3` / `#E6F2FB` | `#5BB4EF` / `#16263A` | soft: **add** | soft: **add** |
| success / **soft** | `#2FB573` / `#E3F6EC` | `#46C98A` / `#10301F` | soft: **add** | soft: **add** |
| warning / **soft** | `#F08C00` / `#FDEFD9` | `#FBA53B` / `#3A2A0F` | soft: **add** | soft: **add** |
| danger / **soft** | `#E0394A` / `#FCE8EA` | `#FF5C6B` / `#3A1518` | soft: **add** | soft: **add** |
| canvas (bg) | `#FBF7F4` | `#161311` | **fix** | ✓ |
| surface | `#FFFFFF` | `#211C19` | **fix dark** | ✓ |
| surfaceRaised | `#FFFFFF` | `#2A2420` | **fix dark** | ✓ |
| surfaceSunken | `#F7F1EB` | `#12100E` | **fix both** | ✓ |
| border | `#E9E0D8` | `#3A332E` | **add (replaces `.separator`)** | ✓ |
| borderStrong | `#D8CCC1` | `#4E453F` | **add** | ✓ |
| textStrong | `#2A2521` | `#F5EFE9` | **add (replaces `label` for headings)** | ✓ |
| text | `#3D362F` | `#E4DAD0` | **replaces `label`** | ✓ |
| textMuted | `#6E625A` | `#B7A99C` | **replaces `secondaryLabel`** | ✓ |
| textFaint | `#94867A` | `#8A7D72` | **replaces `tertiaryLabel`** | ✓ |
| scrim | `rgba(42,37,33,.4)` | `rgba(8,6,5,.6)` | add | add |

Type solids (18) already match on both platforms — no change.

**Color roles (the discipline that makes it feel designed):**
- **Red** = brand, primary actions, the live/streaming state, active selection
  rail, pinned/danger moments. Never the focus color.
- **Azure** = interaction: text-field focus border + glow, links, secondary
  hover/press tints, "show more" affordances.
- **Sunflower** = estimates/medium confidence. **Semantic** greens/oranges/reds
  only in status contexts.

### 3.3 Shape

Radius scale `6 / 10 / 16 / 24 / pill` exists on both platforms.
- **Android**: pass `shapes = Shapes(extraSmall 6, small 10, medium 16, large 24,
  extraLarge 24)` into `MaterialTheme` so un-parameterized Material components
  inherit Oak corners.
- **User bubble tail**: lg (16) with the **bottom-trailing corner at sm (6)** —
  iOS has this; Android adopts (`RoundedCornerShape(16,16,6,16)`).
- Pills for: chips, composer field, send/stop discs, filter toggles, auth CTAs,
  team buttons (`.tm-btn` equivalents), scope chip.

### 3.4 Elevation

Web's ladder: **raised** (cards, bubbles) → **floating** (composer dock,
popovers) → **overlay** (sheets, drawers); warm-tinted (`rgba(74,53,42,…)`) in
light, deeper black in dark; dark mode prefers hairline borders over shadows.
- iOS `Theme.Shadow` (card/raised/glow + dark-drops-shadow-keeps-stroke) already
  models this — keep; add a `floating` token for the composer if needed.
- Android: zero tonal elevation games — explicit `shadow()` on light /
  hairline `border` on dark, matching the iOS `oakCard` behavior. Dialogs and
  sheets get `surface` containers with hairline borders, never
  `surfaceContainerHigh` tints.

### 3.5 Motion

Web: fast 140ms / base 220ms (cubic-bezier .2,.8,.2,1), spring 260ms with
overshoot; turn-in = 8px rise + fade; press scales 1.06/0.94 (send disc
disabled shrinks to 0.85); reduce-motion strips decoration, keeps feedback.
Both apps already have `snappy`/`smooth` springs + stagger + reduce-motion
gates — **map, don't rebuild**: presses → snappy, entrances → smooth + stagger
(40–60ms), and adopt the send-disc scale choreography (§4.2). No new motion
vocabulary; restraint is the brand.

### 3.6 Signature elements (the "unmistakably Oak" list)

1. **The red thread** — the web page's 2px `--poke-red` top border. Native: a
   full-width 2pt/2dp accent rule pinned at the top of the header band (below
   the status bar) on every root screen. Small, cheap, instantly branded.
2. **The engraved instrument label** — JBM 600 · 11 · caps · tracked, `textMuted`.
   Every data label ("TRY ASKING", "BASE STATS", "SOURCES · 2", tool trail).
3. **The pokéball spinner** for in-flight tool notes (iOS `OakSpinner` /
   Android equivalent) — never a bare system spinner on the chat path.
4. **The floating pill composer** — §4.2.
5. **The paper user bubble** — §4.3.
6. **The wordmark lockup** — rounded-square logo (from `web/src/app/icon.svg`
   geometry: `#EE5A5A` square, white ring) + Fredoka "Oak".

---

## 4. Component recipes (both platforms)

### 4.1 Header / top bars
Canvas-colored bar (not system material), hairline `border` bottom, **red thread
top rule on root screens**, Fredoka titles. Chat root gets the wordmark lockup
(24–32pt mark + Fredoka "Oak") leading, scope chip trailing. iOS:
`.toolbarBackground(Theme.canvas, for: .navigationBar)` + custom title views
where needed; tab bar likewise canvas + hairline, red-tinted selected item.
Android: `TopAppBarDefaults.topAppBarColors(containerColor = canvas)`, Fredoka
`titleLarge`; `NavigationBar(containerColor = canvas)` with `accentSoft` pill
indicator, JBM-free Nunito 600 labels.

### 4.2 Composer (the hero of the chat screen)
Floating pill above the keyboard: `surface` fill, `borderStrong` hairline,
**floating** shadow, 44pt min-height input (Nunito 16), leading attach + mic
icons in `textFaint` (→ red on press), trailing **44pt coral send disc** (white
send glyph). States: *empty* → disc scales 0.85 and fills `surfaceSunken`;
*focused* → border turns **azure** + soft azure glow + 1pt lift; *streaming* →
border+glow turn **red**, disc morphs to the stop square (`sm` radius glyph).
Press: scale 0.94 snappy. This one component carries most of the "feels like
the web app" recognition — get it exact.

### 4.3 Chat turns
- **User bubble**: `accentSoft` @55% over `surface` (precompute the mix per
  theme: light ≈ `#FDF2F1`, dark ≈ `#2E1D1B`), red-tinted hairline
  (`accent` @ 25–30%), **`text` ink not white**, radius 16 with 6 tail, raised
  shadow, max-width ~75%.
- **Assistant**: full-width answer card on `surface`, `border` hairline, radius
  16, raised shadow; sections stagger in (existing behavior on both).
- **Tool trail**: mono instrument tokens + pokéball spinner while active,
  success check when done; collapse to the sunken "summary pill" after answer.

### 4.4 Lists & forms (History, Teams, More, Account, editors)
Kill the stock grouped chrome: screens sit on **canvas**; rows/groups are
`surface` cards (radius 16, hairline, raised shadow in light / border in dark)
with Nunito rows, instrument-label section headers, and the **3pt red left rail**
as the active/selection language (transparent when inactive — rows never shift).
iOS: `.scrollContentBackground(.hidden)` + `.background(Theme.canvas)` on every
`List`/`Form`, `.listRowBackground(Theme.surface)`. Android: containers already
controllable — restyle `FilterChip` → Oak pill (sunken fill, azure-soft
selected), search fields → borderless sunken pill with azure focus ring.

### 4.5 Buttons
One shared system, mirroring web `.tm-btn`: **primary** = red fill, white
Nunito 700, pill, subtle red-tinted shadow; **secondary** = `surface` +
`borderStrong` hairline, azure press tint; **ghost** = text-only `textMuted`;
**danger** = `dangerSoft` fill + danger ink. All pill, all snappy press-scale
0.97, 44pt min touch. Replace every iOS `.bordered`/`.borderedProminent` and
Android default `Button`/`OutlinedButton` call site.

### 4.6 Chips
Suggestion/example chips: `surface` fill, `borderStrong` hairline, pill, Nunito
600 13–14. Press: empty-state chips tint `accentSoft` + red border; in-thread
chips tint `azureSoft` + azure border; scale 0.97. "TRY ASKING" label above =
instrument label. Scope chip: sunken pill, instrument-ish 12sp 600, caret;
scope-change pulse = one 300ms red ring pulse (reduce-motion: none).

### 4.7 Dialogs / sheets / menus / toasts (Android-heavy)
`surface` containers, radius 24 (sheets) / 16 (dialogs), hairline border, warm
scrim, Fredoka dialog titles, Oak buttons. `CircularProgressIndicator` always
`accent` (or the pokéball spinner on the chat path). Snackbar: `surfaceRaised`
dark-on-light inversion is NOT the brand — use `textStrong` background with
canvas text in light (web has no toasts; keep quiet and rounded, radius 10).

---

## 5. Screen-by-screen

Both platforms share the same targets; per-platform mechanics are noted where
they differ. Ordered by user exposure.

### 5.1 Chat — empty state
**Current:** functional, on default background; example chips exist.
**Hero:** the wordmark lockup + composer.
**Target:** centered lockup (48pt mark, radius 12, raised shadow + Fredoka 34
"Oak"), one-line muted tagline, scope chip, then "TRY ASKING" instrument label
over a 2-column chip grid (web parity). Chips press red-soft. First-run feel =
the web landing page in the hand.

### 5.2 Chat — thread
**Hero:** the newest answer card.
**Moves:** canvas behind everything (iOS gap); paper user bubbles (§4.3); answer
lead in Nunito 700 22; markdown headings in Fredoka; tables/code/stat numerals
in JBM; turn-in rise on new turns; streaming caret stays red. Tool trail per
§4.3. Header per §4.1 with red thread.

### 5.3 Composer — §4.2 verbatim. The send-disc shrink on empty and the
azure-focus/red-live split are the microinteractions to get pixel-right.

### 5.4 History
**Current:** stockiest screen on both platforms.
**Hero:** the conversation you're looking for — rows, not chrome.
**Moves:** canvas bg; borderless sunken search pill (azure focus); Oak filter
pills; rows = surface cards w/ red active rail, Nunito 600 titles, instrument
timestamps; swipe actions keep native mechanics, recolor (pin=red, delete=danger);
themed rename/delete dialogs (Android); empty state = pokéball line-art + quiet
copy, never a blank screen.

### 5.5 Auth / OTP
**Hero:** the six digit boxes.
**Moves:** canvas; Fredoka title; sunken digit boxes with azure focus ring and a
snappy pop on fill; primary red pill CTA; error = dangerSoft strip with 3pt
rail (web callout recipe). Android `AuthDialog` → themed per §4.7.

### 5.6 Teams list / editor / import / assistant
**Hero (list):** team cards with the six sprite slots; **(editor):** the roster
strip + legality chip.
**Moves:** canvas + surface cards; `.tm-btn` system everywhere (kill remaining
stock buttons/dropdowns); legality state chip = success/warning soft pills with
the web's pulse-on-change; entity picker rows with sprite + JBM dex numbers;
Showdown import textarea = sunken mono block; assistant sheet = radius-24
surface sheet with its own mini composer per §4.2 (no red thread inside sheets).

### 5.7 More / Account
**Moves:** canvas; grouped surface cards; instrument section headers; red-rail
active states; danger zone = dangerSoft card. Sign-out/delete confirm dialogs
themed. This screen is where "iOS Settings clone" dies.

### 5.8 Artifact viewer / entity detail / comparison
Already the most custom surface. **Moves:** ensure sheet container = surface,
radius 24 top corners, hairline, warm scrim; Fredoka entity names; type-gradient
hero washes stay; JBM stats with tabular numerals; format pill per §4.6.

### 5.9 Voice overlay
Already branded (orb + red pulse). **Moves:** align surfaces to
canvas/surfaceRaised tokens, captions in Nunito, orb ring stays `accent`;
Fredoka for the persona name if shown. Lowest priority.

---

## 6. Prioritized sequence (the 80/20)

**Phase A — the lift (do first, ship-worthy alone):**
1. Fonts on both platforms wired through the existing type chokepoints.
2. Token reconcile: iOS hex drift + warm ink ramp + soft tints (both).
3. Canvas everywhere: iOS scroll/List/Form backgrounds; both apps' top bars +
   iOS tab bar / Android NavigationBar per §4.1, incl. the red thread.
4. Android `MaterialTheme.shapes` override.

**Phase B — the recognizable components:**
5. Composer state choreography (azure focus / red live / disc scale) — both.
6. Paper user bubble — both. 7. Button system replacement — both.
8. Chips + scope chip press grammar.

**Phase C — screen polish:** History (worst offender), Auth, Teams, More/
Account, dialogs/sheets/menus (Android §4.7), artifact/voice alignment.

**Constraints for implementers:**
- Android: `testTag`s (`section:*`), visible strings ("Chat", type names,
  section labels) and `contentDescription`s are load-bearing for tests — keep.
- iOS: hand-edit `Info.plist` for `UIAppFonts`; re-run `xcodegen generate`;
  keep `AnswerCardView.sections` ordering untouched.
- Never regress reduce-motion gates or Dynamic Type/font-scale behavior.
- No web/ changes of any kind.
