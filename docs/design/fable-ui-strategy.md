# UI Design Strategy — Oak · "Instrument"

> Fable design pass · 2026-08-12 · commit `c7cfc15`
> Seen via: live production web (oak.gowtam.ai, light + dark, guest session) and a fresh
> simulator build of the iOS app (screenshots below); Android reviewed by parity doctrine
> (`Theme.swift` / theme mirror), not run.
> Interactive comparison prototype (all four candidate directions, phone + web):
> https://claude.ai/code/artifact/b4975a19-d14b-4652-804e-c37c888e9410
> Status: **strategy only — no code changed.** Implementation is a separate pass.
>
> ⚠️ The older captures in `screens/` (`00`–`08`) predate the field-notes reskin
> (red slab header, centered-logo hero — patterns soul.md later banned). Treat only
> `ios-01-home-light.png` / `ios-02-home-dark.png` as current-state evidence.

## TL;DR

- **Diagnosis in one line:** the craft is real (bespoke 6,384-line token system, three-tier
  type, designed uncertainty objects) but the aesthetic thesis — cream paper + grain +
  dashed specimen plates + mono micro-labels + Fredoka — is the "artisanal lab notebook"
  look AI-designed apps converged on in 2025, and it mutes a franchise whose native
  language is saturated color.
- **The direction:** **Instrument** — the Pokédex is canonically a piece of red hardware;
  Oak becomes a precision instrument that shows its work. Chassis neutrals, true Pokéball
  red as a record light, inset readout wells, tabular numerals, full-chroma type color.
  References: Teenage Engineering UI, Nothing OS, Braun.
- **Three highest-impact moves:** (1) token-level palette + typeface swap (cream→chassis,
  salmon→`#E3350D`, Fredoka/Nunito→Space Grotesk/Inter) — reaches ~90% of all three
  clients mechanically; (2) delete the paper metaphor (grain, graph grids, dashed
  borders); (3) replace pastel type *washes* with saturated type *light* (glow + edge)
  so Pokémon content carries the color.

## 1. Diagnosis — why it reads as generic today

Grounding: the theme is not framework defaults. It is a deliberate system (`soul.md`,
`globals.css` with a 12-step warm neutral ramp, motion tokens, custom icon set) that was
itself built as an anti-generic move. The failure is that its *thesis* landed on what has
since become the most recognizable AI-era style cluster. That means the fix is a
**re-skin at the token and signature-object level, not a rebuild** — the structural bones
are good and must be protected (§ Protect).

### Systemic tells (repeat everywhere — fixed once, in the Foundation)

- **The paper-journal cluster.** Cream `#fbf7f4` canvas, fractal-noise "desk grain"
  overlay, 24px graph-grid card backgrounds, 1.5px dashed "blank plate" borders, and
  letterspaced mono micro-labels (`NEW ENTRY`, `FILED STARTERS`, `RECEIPTS · N SOURCES`)
  — visible together on the iOS home (`screens/ios-01-home-light.png`) and the web empty
  state. Each element is fine; the *combination* is the 2025 warm-cream-artisanal cliché.
  (lens: color + consistency — the system is consistent, but consistently on-trend.)
- **Fredoka.** The rounded display face reads kids-app/Duolingo-clone, is one of the most
  common AI-suggested pairings (with Nunito), and fights the scholarly field-desk conceit
  it decorates. Wordmark, screen titles, answer leads all carry it. (lens: typography)
- **Desaturated brand red.** `#ee5a5a` salmon on cream is the "friendly startup" pastel
  take on Pokéball red (`#E3350D`/`#EE1515`). The franchise's own language — games,
  hardware, the Pokédex itself — is saturated and high-contrast. (lens: color)
- **Content muted, chrome dressed.** Type badges are 8–14% pastel washes; sprites sit in
  beige wells; meanwhile the frame gets stamps, grain, and dashed plates. In a Pokémon
  app the content is the color. (lens: hierarchy — the energy points at the wrong layer.)
- **Pill-everything softness.** Pill radii + soft warm shadows + low-contrast borders on
  nearly every control produce the "friendly blob" silhouette shared by template AI UIs.
  (lens: depth/shape)

### Screen-specific problems (fixed per screen, § 4)

- **iOS home:** the sign-in banner is a full-width band directly under the header —
  competes with the plate for first read; the dashed border + grid gives the hero a
  "wireframe placeholder" feel (soul.md itself flags dashed treatments as non-final
  elsewhere).
- **Web dark mode bug:** header + sidebar do not repaint dark (observed live; already
  chip-filed separately). Dark exists but is warm brown-black — cocoa, not device.
- **Web sidebar:** three sparse text items + a footer link grid — reads unfinished
  rather than quiet.

### What is genuinely fine (protect, do not churn)

Answer-lead hierarchy (bold 22px first paragraph is a real hero moment), the
uncertainty/receipts objects, the streaming tool-trail *behavior*, the 4px spacing scale,
state coverage (skeletons, empty states, reduced-motion handling), 44px touch targets,
Dynamic Type on iOS, and the entire component architecture. None of that is the problem.

## 2. Direction — Instrument

**Oak is a precision instrument that shows its work — a modern Pokédex as hardware.**
The product's differentiator (reasoning on data, with receipts) and the franchise fiction
(the Pokédex is a red handheld device) point at the same aesthetic, which is why this
direction wins over the alternatives considered (sports-data editorial, Nintendo pop,
quiet tool — see the prototype artifact). The user picked it explicitly (2026-08-12).

**Reference points:**
- **Teenage Engineering (OP-1/TP-7 software):** chassis surfaces, machined insets,
  functional labels as silkscreen, one signal color used as a *light*, not a paint.
- **Nothing OS:** mono/dot-matrix data voice on consumer hardware without feeling retro;
  restraint with one red accent.
- **Braun (Rams-era dials):** color codes function; everything else is neutral; depth is
  physical (things sit *in* the panel, not float above paper).

Two consequences worth naming:

1. **The existing mono "instrument voice" survives and gets stronger.** Mono labels on
   *paper* read as a scrapbook affectation; on a *chassis* they read as silkscreen
   printing. Keep `.ilabel`/JetBrains Mono, prune density ~half, and let tabular numerals
   become a first-class object (stat readouts).
2. **Dark mode becomes the flagship.** The current iOS dark home
   (`screens/ios-02-home-dark.png`) is already ~70% of this direction — dark chassis, red
   thread, mono stamps. Light mode is where the paper metaphor lives and where most of
   the change lands.

## 3. Foundation — the cross-cutting system

All three clients read tokens (`web/src/app/globals.css` `:root` + dark block;
`ios/OakApp/UI/Theme.swift`; the Android theme mirror), so this section is most of the
implementation. Values are final unless marked *(tune)*.

### Typography

| Role | Face | Weights | Notes |
|---|---|---|---|
| Display (`--font-display`) | **Space Grotesk** | 500 / 600 / 700 | Replaces Fredoka. Wordmark, screen titles, answer lead, markdown headings. Tracking −0.02em at ≥18px. |
| Body (`--font-body`) | **Inter** | 400 / 500 / 600 | Replaces Nunito Sans. Body stays 15px/1.55. |
| Data (`--font-mono`) | **JetBrains Mono** (kept) | 500 / 600 | `.ilabel` 9.5–10px, +0.16em tracking; `tabular-nums` wherever digits align. |

Size scale is unchanged (11/12/13/15/18/22/28 + 16px input) — the roles were right; the
faces were wrong. iOS bundles SpaceGrotesk/Inter TTFs exactly as Fredoka/Nunito are today
(`Resources/Fonts/`, `Font.custom(_:relativeTo:)` so Dynamic Type keeps scaling); Android
mirrors. Web swaps the two `next/font/google` entries.

### Color

**Neutral ramp — cool "chassis" (replaces the warm brown ramp 1:1, same step names):**

`0 #FFFFFF · 50 #F9FAFA · 100 #EEF0F1 · 200 #E3E6E8 · 300 #D3D7DA · 400 #B9BEC3 ·
500 #8A9096 · 600 #5F656C · 700 #4D5257 · 800 #2E3236 · 900 #1D2023 · 950 #131517`

**Surfaces/text, light:** bg `#EEF0F1`, surface `#F9FAFA`, raised `#FFFFFF`,
sunken `#E3E6E8`, border `#D3D7DA`, border-strong `#B9BEC3`, text-strong `#131517`,
text `#24282B`, muted `#5F656C`, faint `#8A9096`.

**Surfaces/text, dark ("device dark" — graphite, not cocoa):** bg `#101214`,
surface `#16191B`, raised `#1D2124`, sunken `#0B0D0E`, border `#2A2E32`,
border-strong `#3A3F44`, text-strong `#F2F4F5`, text `#DDE1E3`, muted `#9BA1A7`,
faint `#6E747A`.

**Record red:** `--poke-red: #E3350D` light / `#FF4A22` dark *(tune for AA on dark)*;
hover `#C92E0B`, soft `#FBE9E4`. Red's jobs are unchanged from soul.md (primary actions,
live/recording, record-light accents) — the hue is corrected, the discipline stays.

**Semantic:** success `#1F9D61`, warning `#E08700`, danger `#D6303F`, info `#2B7DD1`
(+ soft variants) — cooled to sit on the new neutrals.

**Type colors:** keep the 18 `--type-*` solids, but use them at **full strength**:
badges become solid fills with per-type contrast-safe text (dark text on ground/steel/
electric etc., white on fire/fighting/dragon), and wells/edges use saturated glows.
Delete the 8–14% pastel `color-mix` wash recipe.

**Deleted outright:** the fractal-noise grain overlay, all graph-grid backgrounds, all
dashed borders, `--sunflower`/warm-soft variants that exist only to serve the paper look
*(audit each use; warning-soft callout bg is retained via the new warning soft)*.

### Space & rhythm

Unchanged: 4px scale, `--chat-col-max` 760px, `--measure-prose` 68ch, composer max
680px. Density was never the problem.

### Radius & elevation

- Radius: sm 5 / md 9 / lg 12 / xl 16 / pill 999. Cards 12 (was 16), buttons 9,
  **pill reserved for chips and the composer only** — the blob silhouette goes away.
- Elevation becomes *physical*, 3 levels + 1 new:
  - **resting** — hairline border + `inset 0 1px 0 #fff` top-light (light mode only);
  - **raised** — `0 1px 2px rgba(10,12,14,.05), 0 8px 22px -14px rgba(10,12,14,.18)`;
  - **overlay** — existing overlay shadow, cooled;
  - **NEW: well (inset)** — `inset 0 2px 8px rgba(10,12,14,.16)` + border-strong: for
    sprite wells, stat strips, the scope stamp, and other "machined into the chassis"
    readouts. Depth = into the device, not floating above paper.

### Motion

- Durations: fast 120ms, base 180ms; easing `cubic-bezier(.2, 0, 0, 1)` (mechanical,
  decisive). The overshoot spring curve is retired **except** the Poké Ball spinner,
  which keeps its personality (it is franchise-native, not slop).
- Grammar (kept from the lenses): feedback ≤120ms (press = scale .97), causality
  (tool-trail lines tick in with a 60ms stagger), continuity (screen transitions slide
  14px, no bounce).
- **One signature moment — "the reading latches":** when a turn finalizes, the masthead
  status dot blips red (live) → green (answered) and the plate's type-light fades in over
  ~300ms. Nothing else on the screen animates at that moment. Reduced-motion: colors
  swap with no animation.

### Signature-object remapping (soul.md objects survive, re-skinned)

| soul.md object | Instrument treatment |
|---|---|
| Blank specimen plate (dashed + grid) | **Standby readout:** solid raised panel, hairline, no dash/grid; scope as an **LED stamp** (mono label + glowing red dot, inset well) |
| Type-reactive plate wash (8–14% tint) | **Type-light:** saturated glow radiating from the sprite well + a 3px leading-edge light in the primary type color (secondary type = second edge segment); ink-plate variant keeps a neutral inset instead |
| Receipts footer | Unchanged behavior; restyled as a **readout drawer** (mono summary row, sunken body) |
| Streaming field-notes trail | **Instrument ticker:** same cascade, lines restyled as mono readout rows (`▸ get_learnset · gen-5 · 120ms`), 60ms stagger |
| User desk note + red pip | **Input log row:** sunken inset row, pip stays |
| History OPEN stamp | Stays — it was always an instrument idea |
| Desk chrome / 2px red thread | Stays, at the corrected red |

## 4. Screen-by-screen strategy

### 01 — iOS Home (empty chat) — `screens/ios-01-home-light.png`

- **Current read:** cream canvas; dashed grid plate; mono stamps; four starters; pill
  composer; floating tab bar. Sign-in banner is a full-width band competing with the
  plate; the dashed hero reads as a wireframe.
- **Target:** a device at standby. Chassis bg, one raised panel, LED scope stamp.
- **Hero moment:** the prompt — "What are we looking up?" in Space Grotesk 600 — with the
  composer directly below it *inside the visual group*, so the first read is
  question → input, not banner → stamp → grid.
- **Concrete moves:**
  - Plate: dashed 1.5px + grid bg → raised panel (radius 12, hairline, top-light inset).
  - Scope stamp → LED stamp (inset well, mono, red glow dot).
  - Sign-in banner → a single quiet row inside the scroll (muted text + red text-button),
    not a full-width band under the header.
  - Starters: keep category mono labels + type dots; row chrome goes hairline; press =
    scale .97, 120ms.
  - Tab bar: keep iOS-native floating pill (it's fine); active tint = record red.
- **Microinteractions & states:** composer focus lifts 1px + red hairline (record-ready);
  LED dot idles at 60% and brightens while a turn is live.

### 02 — iOS Answer card (mirror of web card; see 05 for shared moves)

- **Current read (from live web parity + `MarkdownBlockView`/answer card port):** same
  specimen plate with pastel wash, mono masthead, receipts footer.
- **Target/hero:** the **answer lead + type-lit subject well** — lead in Space Grotesk,
  well glowing in the subject's primary type color.
- **Concrete moves (shared with web):** masthead gets the status LED; caveat box keeps
  its warning styling on new tokens; **new object: stat readout strip** — when the answer
  cites computed numbers (speed tiers, damage rolls), render them as an inset strip of
  large tabular-num readouts with mono captions (this is the single most "instrument"
  moment in the app and it falls out of data the agent already emits); receipts as
  readout drawer.
- **States:** streaming skeleton keeps shape; the finalize moment runs the
  "reading latches" signature (dot red→green, type-light fades in).

### 03 — iOS chrome: scope picker, Account, Teams tabs

- **Current read:** scope chip opens a sheet (old capture `02-scope-chip-open.png` is
  pre-reskin; current is a plain list). Teams/Account follow the same paper tokens.
- **Target:** scope picker as a **band selector** — each of the eleven scopes a row with
  its mono basis tag (`GEN 5 · BLACK/WHITE`) right-aligned; selected row gets the LED
  dot. No other structural change; tokens do the rest.

### 04 — iOS/web Dark mode — `screens/ios-02-home-dark.png`

- **Current read:** already close to the direction — but warm cocoa, and on web the
  header/sidebar don't repaint at all (bug, chip-filed).
- **Target:** flagship. Graphite ramp above; red lifted to `#FF4A22`; type-light mixes
  rise (soul.md's 18–28% rule becomes glow intensity, not wash %); wells go deeper
  (`sunken #0B0D0E`).
- **Moves:** fix the web repaint bug in the same phase; verify AA for muted text on
  `#16191B`.

### 05 — Web chat (empty + answer) — seen live at oak.gowtam.ai

- **Current read:** faithful web twin of 01/02 plus the 300px sidebar (sparse) and
  header (paper + red thread).
- **Target:** same token swap; header thread stays the signature; **sidebar becomes a
  rail with purpose** — New chat (red), history list (OPEN stamp rows), and the
  reference links promoted from footer-afterthought to a labeled mono group
  (`REFERENCE` silkscreen + rows). Guest state: one quiet sign-in row, not three
  scattered fragments.
- **Hero:** unchanged from 02 (lead + type-lit well; the web answer already runs the
  right hierarchy — this is a re-skin, not a re-layout).
- **States:** streaming ticker per the remap table; `stopped`/error statuses keep their
  designed objects on new tokens.

### 06 — Web reference pages (/pokedex, species, moves…) — seen live

- **Current read:** clean structure (search, type filters, gen sections, species cards
  with pastel pills and `#0001` mono numbers; species page with AVAILABILITY/BASE STATS
  cards). Weakest tells: pastel type chips, beige sprite tiles, orange top-border accent.
- **Target:** the "database mode" of the instrument. Full-chroma solid type chips
  (these are *filters* — encode them honestly); sprite tiles get shallow wells; base-stat
  bars become readouts (tabular value + track in type color); section heads stay mono.
  Density can rise one notch (these are browse surfaces, not prose).
- **Hero (species page):** the sprite well + name block, type-lit like the answer card,
  replacing the current empty beige square.

### 07 — Teams / Teams Assistant

- **Current read:** gated for guests; per soul.md phase 2, party slots already carry
  type edge/glow.
- **Target:** slots read as **six sockets in a device** — inset wells, filled slots
  type-lit, empty slots showing a faint socket outline (solid hairline, not dashed).
  Assistant chat inherits every chat token automatically.

### 08 — Auth / privacy / admin

- **Current read:** simple centered cards; mostly fine.
- **Target:** token swap only. OTP input is a natural readout (mono, tabular, inset) —
  one line of styling, no structural work. Admin keeps its own CSS; retoken when touched,
  not specially.

## 5. Priority & sequencing

Cross-platform rule (CLAUDE.md): every phase lands web + iOS + Android together — one
branch per phase, no staggered half-skins.

- **Phase 1 — token swap + doctrine (the 80/20, ~a day of focused work):**
  new neutral ramp, record red, semantic colors, radius scale, shadow set (incl. the
  well), font swap (web `next/font`, iOS/Android bundled TTFs), delete grain/grids/dash,
  full-chroma type chips with contrast-safe text. Because all three clients style
  through tokens, this alone re-skins ~90% of every surface. **Rewrite `soul.md` in the
  same change** — it is the operational contract agents obey; if it still says "warm
  paper desk," the next agent will regress the theme. (New doctrine: "Oak is a precision
  instrument… chassis, record light, readouts, type-light." Keep its We-never list;
  add: no cream/paper textures, no dashed chrome, no pastel type washes, pill = chips +
  composer only.) Also fold in the dark-mode header/sidebar repaint fix.
- **Phase 2 — signature objects:** type-light plates (glow + edge, replacing washes),
  LED scope stamp, stat readout strip on answer cards, instrument ticker restyle,
  motion-curve swap + the "reading latches" finalize moment, sprite wells (answer,
  dex tiles, team sockets).
- **Phase 3 — per-screen polish & long tail:** reference-page density + stat-bar
  readouts, sidebar rail purpose pass, iOS sign-in row demotion, copy audit (decide
  whether `NEW ENTRY`/`FILED STARTERS`/"Open a specimen" language survives the metaphor
  shift — recommendation: keep the *voice*, drop the file-cabinet nouns: `STANDBY`,
  `STARTERS`, "Every answer carries its receipts" stays), dark-mode elevation tuning,
  prune ~half the `.ilabel` instances, TestFlight/store screenshots refresh.

Stop after Phase 1 and the app already reads as a different (and current) product;
Phase 2 is where it becomes *this* product.

## Protect (carried forward from soul.md — do not undo in the re-skin)

- OakAnswer structured field order, answer-lead hierarchy, receipts + uncertainty as
  designed objects, streaming trail behavior, wire contract / tool names.
- The soul.md "We never" list (no chatbot-twin bubbles, no red selection rails, no
  logo-hero empty states, no four-equal-chips).
- 4px spacing scale, 44px targets, Dynamic Type, reduced-motion/transparency handling,
  layout stability, state coverage.
- The 18 type solids and the three-tier display/body/data type *roles* (faces change,
  roles don't).
