# iOS UI Polish — Design Plan

Owner: Fable orchestrator session, 2026-07-03. Integration branch: `agent/ios-polish`
(orchestrator-owned — implementation agents must NEVER edit, build, or commit in its
worktree). Each phase runs in its own dedicated worktree/branch named in that phase's
delegation brief; the brief's paths win over anything here. All `ios/…` paths below are
relative to the repo root of whichever worktree you were assigned.

## Goal

The app is functionally excellent but visually generic: everything sits flat on system
backgrounds with 1pt separator strokes, zero shadows/materials/gradients, no motion beyond
a default scroll animation, and no haptics. This plan layers a cohesive "first-class iOS"
treatment — depth, micro-animation, haptics, and brand moments — **on top of** the existing
architecture without changing any behavior, view-model API, or wire contract.

## Hard constraints (every phase)

1. **NO trademarked imagery.** Never draw a Pokéball (no red/white bisected circle with a
   center button — not even abstracted), no Pokémon character artwork, no game logos. Oak's
   own brand motif is botanical/scholarly: **an oak leaf / sprig (SF Symbol `leaf`,
   `laurel.leading`/`laurel.trailing`, `sparkles`) and abstract geometry (concentric
   "scanner" rings, orbiting dots)**. Backend-served sprite URLs are data and stay as-is.
   SF Symbols are fine everywhere.
2. **Accessibility bar stays.** Dynamic Type styles only (no fixed point sizes for text),
   semantic colors, icon+text pairing for meaning (M-AC-UI9.3), combined VoiceOver elements.
   Every new animation must respect `@Environment(\.accessibilityReduceMotion)`: when true,
   replace movement/scale with opacity crossfade or nothing. Shimmer/loop animations stop.
3. **No behavior changes.** View-model APIs, `AnswerCardView.sections` (pinned by
   `OakAppTests/AnswerCard/AnswerCardViewTests.swift`), tool/SSE handling, navigation
   structure all stay. This is chrome + motion only.
4. **Swift 6 strict concurrency** (`SWIFT_STRICT_CONCURRENCY: complete`). Keep everything
   `@MainActor`-safe; `UIImpactFeedbackGenerator` etc. are MainActor-bound.
5. **iOS 18 deployment target** — you may freely use iOS 17/18 APIs: `.symbolEffect`,
   `.contentTransition`, `.scrollTransition`, `PhaseAnimator`, `.presentationBackground`,
   spring parameterization, `.animation(_:value:)`.
6. **Dark mode parity.** Shadows nearly vanish in dark mode: dark mode keeps a subtle
   stroke + slightly raised surface; light mode drops strokes in favor of shadows (the
   `oakCard` modifier below encapsulates this — use it, don't hand-roll).
7. **File conventions**: follow existing doc-comment style (each view documents what it
   mirrors + a11y notes), kebab-case is web-only — Swift files are PascalCase. New shared
   UI goes in `OakApp/UI/`.

## Verification gate (every phase)

From `ios/` in the worktree:

```bash
xcodegen generate          # required whenever files are added/removed
xcodebuild build -scheme OakApp -destination 'platform=iOS Simulator,name=iPhone 17' -quiet
xcodebuild test -scheme OakApp -only-testing:OakAppTests -destination 'platform=iOS Simulator,name=iPhone 17' -quiet
```

Build and unit tests must pass. Do not run UI tests (slow; not part of the gate).

---

## Phase 1 — Foundation (blocks everything else)

New files in `OakApp/UI/` plus additions to `OakApp/UI/Theme.swift`. This is the shared
vocabulary; later phases only consume it. **API names below are contractual** — later-phase
briefs reference them exactly.

### 1a. `Theme.Elevation` (in Theme.swift) + `OakCardModifier` (new file `OakApp/UI/OakCard.swift`)

- `Theme.Shadow` tokens: `card` (key: y=1 blur=2 @ black 8%; ambient: y=8 blur=24 @ black 6%),
  `raised` (key y=2 blur=6 @ 10%; ambient y=12 blur=32 @ 8%), and an accent-tinted variant
  helper `glow(Color)` (y=2 blur=8 @ 25% of the given color).
- `View.oakCard(radius: CGFloat = Theme.Radius.lg, tint: Color? = nil)` modifier:
  - Light mode: fills `Theme.surfaceRaised` (or a `tint` 12%→4% top-leading→bottom-trailing
    `LinearGradient` wash over it when `tint != nil`), applies the two-layer `card` shadow,
    **no stroke**.
  - Dark mode: same fill/wash, **subtle stroke** (`Theme.separator`), no/minimal shadow.
  - Implement with a dynamic check of `colorScheme` inside the modifier.
- `View.oakPressable()` → applies `OakPressableButtonStyle` behavior for non-Button cards
  is NOT needed; instead export `struct OakPressableButtonStyle: ButtonStyle` — scales to
  0.97 + opacity 0.9 while pressed with `Theme.Motion.snappy`; respects Reduce Motion
  (opacity-only). Later phases use `.buttonStyle(OakPressableButtonStyle())` on tappable
  cards/chips (replacing `.plain` where a card should feel pressable).

### 1b. `Theme.Motion` (in Theme.swift)

- `static let snappy: Animation = .spring(response: 0.28, dampingFraction: 0.8)`
- `static let smooth: Animation = .spring(response: 0.45, dampingFraction: 0.85)`
- `static func staggered(_ index: Int, base: Animation = smooth, step: Double = 0.04) -> Animation`
  (returns `base.delay(step * Double(index))`).

### 1c. `Haptics` (new file `OakApp/UI/Haptics.swift`)

`@MainActor enum Haptics` with `tap()` (light impact), `success()`, `warning()`, `error()`
(notification generator), no-ops in previews/tests if generators unavailable. Trivially
thin — no state, prepare-on-use.

### 1d. `ShimmerModifier` (new file `OakApp/UI/Shimmer.swift`)

`View.shimmer(active: Bool = true)` — an animated linear-gradient mask sweeping repeatedly
(≈1.6s cycle) for "AI is working" text and skeleton placeholders. When Reduce Motion is on
or `active` is false, renders content unmodified (for skeletons: a static 60% opacity).

### 1e. `SkeletonRow` (new file `OakApp/UI/Skeleton.swift`)

Reusable skeleton building blocks: `SkeletonBlock(width:height:)` (rounded rect in
`Theme.textPrimary.opacity(0.08)` with `.shimmer()`), plus `SkeletonListRow()` (circle +
two bars, list-row shaped). Used by lists and the artifact loading state.

### 1f. Type-gradient helper (in Theme.swift)

- `Theme.typeGradient(_ name: String, in scheme: ColorScheme? = nil) -> LinearGradient` —
  diagonal (topLeading→bottomTrailing) wash of `Theme.type(name)` from 12% → 4% opacity
  (dark: 18% → 6%). Used for subject cards / entity hero headers.
- `Theme.typeGradient(primary: String, secondary: String?)` overload blending two type
  colors (primary at topLeading 12%, secondary at bottomTrailing 8%; falls back to the
  single-type version when `secondary` is nil).

### 1g. `OakSpinner` (new file `OakApp/UI/OakSpinner.swift`)

The brand progress indicator replacing bare `ProgressView` in streaming/loading contexts:
two concentric arcs (accent + azure, different sweep lengths) continuously rotating in
opposite directions around a small center dot — an abstract "scanner", NOT a Pokéball (no
horizontal bisecting band, no center ring-button look). `OakSpinner(size: CGFloat = 20)`.
Reduce Motion: renders a static `ProgressView` instead.

### 1h. `OakBrandMark` (new file `OakApp/UI/OakBrandMark.swift`)

The hero/empty-state mark: a soft radial-gradient disc (accent 18% → clear) with a
`leaf.fill` SF Symbol in accent at center and 2 thin concentric rings (separator color).
`OakBrandMark(size: CGFloat = 96)` with a slow (6s) breathing scale 1.0↔1.04 loop, disabled
under Reduce Motion. Views layer sparkles/labels around it themselves.

Phase 1 must compile AND include a tiny smoke test file
`OakAppTests/UI/ThemeFoundationTests.swift` (Swift Testing) asserting e.g. that
`Theme.Motion.staggered(3)` returns an animation and `Theme.typeGradient("fire")` builds —
compile-level guards, nothing pixel-based.

---

## Phase 2 — Chat thread (`OakApp/Features/Chat/ChatView.swift`, `ComposerView.swift`, `StreamingStatusView.swift`)

**Files owned:** `ChatView.swift`, `ComposerView.swift`, `StreamingStatusView.swift` only.
Do NOT touch `AnswerCard/*` (Phase 3 owns those), `ChatViewModel.swift` (behavior frozen;
if you need a derived flag like `isStreaming`, it already exists).

### Empty state (in ChatView)
Replace `ContentUnavailableView` with a branded hero: `OakBrandMark` centered, "Ask Oak"
in `Theme.display(.title)`, the existing description line in `Theme.body(.subheadline)`
secondary, then 3 example-question chips ("What's Garchomp's best moveset?", "Who outspeeds
Dragapult?", "Explain Intimidate vs Defiant") styled like `SuggestionsView` chips
(accent-tinted capsule + border), tapping one sets `model.composerText` and calls
`model.send()` (same mechanism as `sendFollowUp`). Chips stagger-fade in with
`Theme.Motion.staggered`.

### User bubble (`UserMessageView`)
- Vertical gradient fill accent→accentActive; `Theme.Shadow.glow(Theme.accent)`-style soft
  tinted shadow (small).
- Asymmetric corners: use `UnevenRoundedRectangle` — bottom-trailing radius `Radius.sm`,
  others `Radius.lg`.
- Entrance transition: `.transition(.asymmetric(insertion: .scale(0.92, anchor: .bottomTrailing).combined(with: .opacity).combined(with: .offset(y: 8)), removal: .opacity))`
  and wrap turn insertion in `withAnimation(Theme.Motion.smooth)` — the ForEach in `thread`
  needs `.animation(Theme.Motion.smooth, value: model.turns.count)` (Reduce Motion: opacity only).

### Streaming status (StreamingStatusView) — the showpiece
- Replace `ProgressView` with `OakSpinner(size: 18)`.
- Phase label swaps with `.contentTransition(.opacity)` + `.shimmer(active: !reduceMotion)`
  over the label text while streaming.
- Per-tool SF Symbols instead of the universal wrench: map tool name →
  `resolve_entity: magnifyingglass`, `get_pokemon: person.text.rectangle` (or `book`),
  `get_move: bolt`, `get_ability: sparkles`, `get_item: bag`, `type_matchup/get_type_chart:
  shield.lefthalf.filled`, `compute_stat/get_usage_stats: chart.bar`, `estimate_damage:
  function`, `get_learnset/list_*: list.bullet`, `get_team/save_team: person.3`,
  `get_encounters: map`, default `wrench.and.screwdriver`. Keep label text as the primary
  meaning carrier.
- New activity lines insert with `.transition(.move(edge: .bottom).combined(with: .opacity))`
  + `.symbolEffect(.bounce, value:)` on the icon; previous (non-last) activities render
  dimmed (`textMuted`) with a small `checkmark` suffix icon (visual only — the model already
  keeps the full array; "completed" = every activity except the last while phase != answering).
- Card chrome: `.oakCard(radius: Theme.Radius.md)` instead of flat surface fill.

### Composer (ComposerView)
- Bar: keep `.background(.bar)` replaced by `.ultraThinMaterial` + hairline top divider +
  a faint upward shadow in light mode.
- Text field: rounded-rect background as today, plus an animated border — `Theme.separator`
  normally, `Theme.accent.opacity(0.4)` when `isInputFocused` (animate with snappy).
- Send button: filled accent circle (36–40pt) with white `arrow.up` (semibold); disabled →
  40% opacity; press = `OakPressableButtonStyle`; on send fire `Haptics.tap()`. While
  `model.isStreaming`, show white `stop.fill` instead of the arrow via
  `.contentTransition(.symbolEffect(.replace))` — visual morph only; keep it disabled while
  streaming exactly like today (there is no cancel affordance in the VM contract; do NOT
  wire cancelStreaming to it).
- Champions toggle: compact capsule pill — inactive: bordered neutral; active: sunflower
  fill at 18% + sunflower text/border, crown `.symbolEffect(.bounce, value: model.championsMode)`;
  animate the change with snappy. Semantics/labels unchanged.
- Attachment thumbnails: insert/remove with `.transition(.scale.combined(with: .opacity))`
  + `.animation(snappy, value: model.pendingImages.count)`.
- Answer arrival haptic: in ChatView, `.onChange(of: model.turns.count)` already exists for
  scroll — additionally fire `Haptics.success()` when the newest turn is an assistant turn.

### Banners (ChatView)
Error banner + sign-in nudge slide in from the composer seam:
`.transition(.move(edge: .bottom).combined(with: .opacity))` with snappy animation bound to
their presence; error icon one-shot `.symbolEffect(.pulse)`.

---

## Phase 3 — Answer-card blocks (`OakApp/Features/Chat/AnswerCard/*`)

**Files owned:** everything under `Features/Chat/AnswerCard/`. Do NOT touch ChatView/
Composer/StreamingStatus (Phase 2) or `UI/` (Phase 1, done). **`AnswerCardView.sections`
and its ordering are pinned by unit tests — chrome only, no structural changes.**

- **Cascade**: in `AnswerCardView.body`, give each section
  `.transition(.opacity.combined(with: .offset(y: 6)))` and animate appearance with
  `Theme.Motion.staggered(index)` on first render (e.g. a `@State hasAppeared` flipped in
  `.onAppear` inside `withAnimation`; when Reduce Motion, appear instantly). Cards must not
  re-cascade on every scroll (LazyVStack re-instantiation is acceptable; keep it simple —
  animate once per view instance).
- **SubjectCard** (`SubjectsView.swift`): replace flat `surfaceRaised` + stroke with
  `.oakCard(tint: Theme.type(subject.types.first ?? "normal"))` — for dual types use the
  two-color `typeGradient(primary:secondary:)` as the wash (pass through the card's `tint`
  path or apply the gradient background then `.oakCard()` chrome — keep ONE shadow source).
  Sprite tile keeps its wash but tinted by primary type instead of azure. The tap target
  (Button in AnswerCardView) switches to `OakPressableButtonStyle`.
- **CandidatesTableView**: table container `.oakCard(radius: Theme.Radius.md)` (drop the
  always-on stroke; keep header/zebra washes). Sorted-column header + cells get a faint
  accent wash (`Theme.accent.opacity(0.06)`) layered on the existing backgrounds. Add a
  trailing scroll-affordance fade (an overlay gradient from clear to background, ~24pt, on
  the trailing edge, hidden when content fits — simple static overlay is fine). Rows
  stagger-fade on first appear (same one-shot pattern as the cascade).
- **DamageCalcView**: card → `.oakCard(radius: Theme.Radius.md)` with a warning-tinted
  gradient hairline (keep a stroke here in both modes — warning at 40%→15% gradient).
  Result values: `Theme.mono(.title3)` weight semibold for the min/max rows and
  `.contentTransition(.numericText())` + a one-shot count-up on appear (animate from 0 to
  value with `Theme.Motion.smooth`; Int values only — string values like "78–92%" render
  statically). Breakdown disclosure animates open (attach smooth animation to
  `breakdownExpanded`), content in an inset well (`Theme.textPrimary.opacity(0.05)` rounded
  rect, mono font as today).
- **ClarifyQuestionView**: option cards get `.oakCard(radius: Theme.Radius.md)` (keep the
  info-tinted border in both modes at reduced opacity) + `OakPressableButtonStyle` +
  entrance stagger. On tap: `Haptics.tap()` then `onSelect` (flash/collapse is Phase 2's
  turn-insertion animation; don't fake it here).
- **SuggestionsView**: chips `OakPressableButtonStyle` + `Haptics.tap()` on select +
  stagger-in from leading (`.offset(x: -6)` + opacity).
- **ReasoningSection / CitationsView / DisclosureGroups**: attach `Theme.Motion.smooth` to
  their expansion state so unfold animates; tint stays. Citations rows get a small
  `link`/`books.vertical` glyph per source (SF Symbols only).
- **GenerationBasisView / InferencesView / UncertaintyFlagsView / TeamBlocksView**: adopt
  `.oakCard` chrome where they currently use flat surface+stroke; team member rows get
  `OakPressableButtonStyle` where tappable. No layout redesign.

---

## Phase 4 — Artifact viewer + entity detail (`OakApp/Features/Artifact/*`)

**Files owned:** `ArtifactSheetView.swift`, `EntityDetailView.swift`. (`ArtifactViewModel`
frozen.)

- **Sheet chrome**: `.presentationBackground(.thinMaterial)`, `.presentationCornerRadius(24)`,
  keep detents + drag indicator.
- **Loading state**: replace spinner+"Loading…" with a skeleton profile (large
  `SkeletonBlock` header row + bars) using Phase-1 skeleton components.
- **Drill transition**: content(for:) switch wrapped so push (stack depth grows) slides in
  from trailing, back slides from leading: track previous depth in a `@State`, apply
  `.transition(.asymmetric(...))` + `.animation(smooth, value: model.current?.id)`. Reduce
  Motion: crossfade. (The model exposes the back stack — depth = its count; read what
  exists, don't add API.)
- **Pokémon hero header** (EntityDetailView.pokemonBody): a full-width header band with
  `Theme.typeGradient(primary:secondary:)` background (radius `Radius.lg`), artwork sprite
  at 112pt with a soft drop shadow, name in `Theme.display(.title)`, dex number mono,
  type chips. Moves/abilities/items/types get the same band tinted: move → its type color;
  ability/item → accent at low opacity; type → its own color.
- **Animated stat bars** (`StatBar` in EntityDetailView): bars fill from 0 to value with
  `Theme.Motion.smooth` staggered per row on first appear; bar color banded by value
  (<60 danger, 60–89 warning, 90–119 success, ≥120 azure — icon/number still carry the
  value; color is enhancement). Numbers `.contentTransition(.numericText())` count up.
  Reduce Motion: full bars immediately.
- **Movepool rows**: `OakPressableButtonStyle`; method group headers stay (sticky headers
  only if trivial — `Section` inside a `ScrollView` is NOT trivial; skip stickiness).
- **Matchup type chips**: already tappable — add press style + `Haptics.tap()`.

---

## Phase 5 — Lists: conversations + teams (`OakApp/Features/History/HistoryListView.swift`, `OakApp/Features/Teams/*View.swift`)

**Files owned:** `HistoryListView.swift`, `TeamsListView.swift`, `TeamEditorView.swift`,
`ShowdownImportView.swift`. View models frozen.

- **ConversationRow**: leading format medallion — a 34pt circle: Champions → `crown.fill`
  in sunflower on sunflower-12% fill; Standard → `leaf.fill` in azure on azure-12% fill
  (NOT a ball motif). Pinned rows: `Theme.accent.opacity(0.05)` listRowBackground + keep
  the pin glyph. Title `Theme.body(.body).weight(.medium)`.
- **Sections**: pinned conversations group under a "Pinned" header when any exist (pure
  presentation grouping of the already-loaded array; no VM change).
- **Skeletons**: `isLoading && conversations.isEmpty` → 6 `SkeletonListRow`s instead of the
  centered spinner. Same in TeamsListView.
- **List reflow**: `.animation(Theme.Motion.smooth, value: model.conversations)` (summaries
  are Equatable/Identifiable wire structs — verify; if not Equatable, key on `.map(\.id)`).
  Same for teams.
- **Empty states**: smaller `OakBrandMark(size: 64)` + existing copy (keep
  ContentUnavailableView text content but custom layout), one example line.
- **TeamRow** (TeamsListView): show six mini slots — filled members as 28pt `SpriteImage`s,
  empty slots as dashed `Circle().strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [3]))`
  in `textMuted`. Requires member sprite URLs on `TeamSummary` — **check the wire model
  first**; if `TeamSummary` carries no member/sprite data, render slot dots tinted by
  filled-count only (filled = accent 30% solid circle, empty = dashed) and note it in the
  report. Do NOT touch the wire models or services.
- **TeamEditorView**: member cards adopt `.oakCard(tint:)` by first type where type data
  exists (again — read the editor's models first; degrade to plain `.oakCard()` if types
  aren't available). Save success → `Haptics.success()` + a transient checkmark overlay
  (1s, fades). Legality warnings slide in (`.move(edge: .top) + .opacity`, smooth).
- **ShowdownImportView**: on successful parse, member rows stagger in
  (`Theme.Motion.staggered`).
- Swipe actions/context menus/pull-to-refresh: unchanged.

---

## Phase 6 — Auth, Account, app chrome (`OakApp/Features/Auth/AuthView.swift`, `OakApp/Features/Account/AccountView.swift`, `OakApp/App/RootView.swift`)

**Files owned:** `AuthView.swift`, `AccountView.swift`, `RootView.swift`. View models
frozen — `AuthViewModel` drives everything (`model.step`, `model.code`, `model.errorMessage`,
`canSubmit*`, `resendSecondsRemaining`, `signedInEmail`).

### AuthView — full redesign (biggest single-screen change)
Replace the `Form` with a custom `ScrollView` layout:
- Header: `OakBrandMark(size: 72)`, "Sign in to Oak" in `Theme.display(.title2)`, subtitle
  "Save your conversations and teams" secondary.
- **Email step**: floating rounded field (surface fill, `.oakCard(radius: Radius.lg)`-like
  chrome, focus border accent as in the composer), submit button = full-width filled accent
  capsule "Send code" with `OakPressableButtonStyle` + spinner-in-button while busy
  (`model.isBusy`).
- **Code step — six digit boxes**: keep ONE invisible `TextField` bound to `$model.code`
  (`.textContentType(.oneTimeCode)` + `.keyboardType(.numberPad)` must remain so autofill
  works) rendered at near-zero opacity behind an `HStack` of 6 boxes displaying
  `model.code`'s characters. Active box (index == code.count) gets an accent border +
  subtle glow; digits pop in with a scale spring (`.contentTransition` or transition on the
  digit Text). Tapping the boxes focuses the hidden field. The existing auto-submit
  `.onChange(of: model.code)` at 6 digits stays.
- **Error**: on `model.errorMessage` becoming non-nil during the code step, shake the box
  row (offset keyframes / PhaseAnimator, 3 oscillations, ±8pt) + `Haptics.error()`; message
  renders below in danger with the icon as today. Reduce Motion: no shake, just the message.
- **Success**: when `model.signedInEmail` flips non-nil, boxes/section crossfade to a drawn
  checkmark (trimmed-path `Circle` + checkmark stroke animating in, success color) +
  `Haptics.success()`; the presenting sheet already auto-dismisses via AppState — keep that.
- **Step change**: email→code content swaps with a directional slide
  (`.transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity), removal: .move(edge: .leading).combined(with: .opacity)))`).
- Resend countdown: `.contentTransition(.numericText())` on the seconds text.
- Keep: focus management, `.onSubmit` submit, "Use a different email", all a11y labels;
  VoiceOver must read the code entry as one element ("Enter 6 digit code, N of 6 entered").

### AccountView
Keep the `Form`, but insert a **profile header card** above it (in a `List`/Form `Section`
with `listRowInsets(EdgeInsets())` + clear background): gradient surface
(accent 14% → azure 10% diagonal), 56pt avatar circle (initial letter of email in
`Theme.display(.title2)` on accent-20% fill; guest → `person.fill` glyph), tier title in
display face, email/sub-line beneath. Signed-in ↔ guest crossfades (smooth, keyed on
`model.isSignedIn`). The old `tierRow` collapses into this header; the rest of the sections
stay. Delete confirmation adds `Haptics.warning()` when the confirm alert opens.

### RootView / app chrome
- Tab selection: track `@State selection`, on change `Haptics.tap()`; tab icons
  `.symbolEffect(.bounce, value: selection == tab)` — use the `Tab(value:)` initializer.
- Nothing else at root.

---

## Coordination rules

- Each phase = one subagent, all in this ONE worktree, phases 2–6 run in parallel AFTER
  Phase 1 is merged/committed — they consume Phase-1 API and touch disjoint files.
- File ownership is exclusive per phase as listed. If your task seems to need a file
  another phase owns (or `ChatViewModel`/any `*ViewModel`/`Models/Wire/*`/`Services/*`),
  STOP and report back instead of editing it.
- Each phase commits its own work (`git add` only files it owns +
  `git commit` with a `feat(ios-ui): …` message) after its gate passes. Do not push, do not
  merge to develop (the orchestrator does that at the end).
- Report back: files touched, what changed per file (1 line each), gate command results
  (verbatim tail on failure), any degradations taken (e.g. TeamSummary lacked sprites), any
  Reduce Motion fallbacks implemented.
