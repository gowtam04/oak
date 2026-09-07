# Implement Enamel & Paper — orchestrator prompt

Paste the block below into a **new agent session**. That agent is the parent orchestrator. It must use `spawn_subagent` workers for implementation; it does not restyle every file itself.

---

You are the parent orchestrator for **Enamel & Paper**: restore Oak's July 2026 Pokédex-red header band on **web + iOS + Android together**, under a named material system that is **not Apple Liquid Glass**.

## Authority (read first, in this order)

1. `docs/design/enamel-paper.md` — **the spec**. Tokens, bans, file map, acceptance, Key Decisions 1–19, PR plan. Do not invent a fourth theme.
2. `docs/design/prototypes/red-top-bar.html` — visual contract for the **lid** (opaque coral header, inset white pills, cream paper, composer pill). Open it. The empty **page** in the mock is historical; the spec says paint **current** landing IA (`What do you want to know?`, recents, filed starters, in-plate composer) onto enamel paper. `ChatThread.tsx` / `ChatView.blankSpecimenPlate` / `ChatScreen.EmptyState`, not a centered Oak lockup.
3. July 2026 screenshots in `docs/design/screens/` (`24cc109`) for lid / answer / teams / thinking feel. Product IA in those shots (Champions default, six-format chip, centered lockup) is **not** restored.
4. `AGENTS.md` — worktree off `develop`, one branch, **all three clients per chrome change**. Never commit straight to `develop`.

Do not restyle `web/src/server/auth/email/resend-transport.ts` (`buildOtpEmail`). Do not "correct" the lid to email `#EE1515` or Signal `#E3350D`. Light lid is `#EE5A5A`. Dark lid is `#C44545`.

## What this is / is not

**Is:** visual restore. Enamel = opaque painted coral lid through the status bar. Paper = cream canvas, opaque white plates, warm umber shadow. Depth is stacked paper, not blur.

**Is not:** agent/tools/OakAnswer/SSE/schema work. Not an IA redesign. Not Liquid Glass. Not Signal-with-a-red-bar. Not specimen-desk grain/dashes. Not Instrument chassis.

Hard bans (reject any worker that does these): `ultraThinMaterial`, `thinMaterial`, `regularMaterial`, `glassEffect`, `GlassEffectContainer`, `Material.bar`, `Material.sidebar`, `UIBlurEffect`, `RenderEffect` as chrome, `backdrop-filter` as identity (fade-to-paper gradient on the composer dock is allowed; frosted slabs are not). No cream header without the lid.

## Git

```bash
git fetch origin
git worktree add ../oak-enamel-paper -b agent/enamel-paper origin/develop
```

All edits and commits happen in that worktree. Six stacked commits matching the spec PR plan, **one merge to `develop` at the end**. PR1 is not shippable alone (no `themeColor` / AppIcon in PR1).

## How you work (required)

You coordinate. **Implementation is done by subagents.** Use `spawn_subagent` with `subagent_type: "general-purpose"`. Launch **independent workers in the same turn** (multiple `spawn_subagent` calls together) so they actually run in parallel.

Give every worker:

- The worktree cwd (`../oak-enamel-paper` or the absolute path).
- A **disjoint file list** (no two live workers edit the same file).
- The relevant slice of `enamel-paper.md` (tokens, bans, their PR's file map, acceptance for their surface).
- "Do not use Liquid Glass. Do not add `backdrop-filter` except `none`. Do not change product IA."
- "Commit nothing. You implement; the parent commits."

After each wave: you review the diff against the spec, fix collisions, run the checks below, then commit as that PR.

Suggested worker model: **grok-4.6** for implementers. Use `explore` only for read-only inventory.

## Wave plan (parallel inside each wave)

### Wave 0 — inventory (optional, parallel, read-only)

Three `explore` agents: web chrome (`globals.css` tokens, `layout.tsx`, `page.tsx` header, `ChatThread.tsx` empty, `Composer`, `OakWordmark`), iOS (`Theme.swift`, `OakChrome.swift`, `ChatView`, `ComposerView`, `RootView`, fonts), Android (`Theme.kt`, `Type.kt`, `Chrome.kt`, `OakApp.kt`, `ChatScreen`, `Composer`). They return file paths + current token/font/header facts. You do not wait to start Wave 1 if you already have the spec file map.

### Wave 1 — PR1 tokens + typefaces (3 parallel implementers)

Not shippable. No AppIcon, no launcher, no `themeColor`.

| Worker | Owns (only) |
| --- | --- |
| **web-tokens** | `web/src/app/globals.css` token block + `--sunflower*`; `web/src/app/layout.tsx` (Fredoka + Nunito_Sans + JetBrains_Mono variables **and** `className` join; do not change `themeColor`); `web/src/components/admin/TimeSeriesChart.tsx` hardcoded Signal hex → tokens |
| **ios-tokens** | `ios/OakApp/UI/Theme.swift`; static OFL TTFs into `ios/OakApp/Resources/Fonts/` (Fredoka, Nunito Sans; exact filenames + PostScript names from the spec); `Info.plist` `UIAppFonts`; `BrandFontsTests.swift` / `ThemeFoundationTests.swift`. Not AppIcon. |
| **android-tokens** | `Theme.kt`, `Type.kt`, `res/font/fredoka_*` + `nunito_sans_*`, point `JetBrainsMonoFamily` at existing `jetbrains_mono_*`. Not launcher. |

Commit: `style: Enamel & Paper tokens and typefaces (web, iOS, Android)`

### Wave 2 — PR2 lid + empty landing + composer + marks (3 parallel)

First visible identity. `themeColor` / AccentColor / AppIcon land **here**.

| Worker | Owns (only) |
| --- | --- |
| **web-lid** | Header/empty/composer CSS in `globals.css` (not the token block unless a one-line fix); `ChatThread.tsx` empty landing; `OakWordmark.tsx`; `Composer.tsx`; `ScopeChip.tsx`; `AuthMenu.tsx`; `layout.tsx` `themeColor` only; `icon.svg`, `apple-icon.png`, `web/public/oak-app-icon.*`, `opengraph-image.tsx`. Mark assets: `docs/design/prototypes/red-top-bar-assets/`. In-app tile = 32px rounded square + ring. |
| **ios-lid** | `OakChrome.swift` (nav **enamel** + tab **paper**); `oakEnamelNav()` on **every** `NavigationStack`; `OakBrandMark.swift`; `ChatView.swift` (lid + empty landing, not answer internals); `ChatTabView.swift` (white `onRed` titles); `ComposerView.swift` (opaque pill, delete `canvas.opacity(0.92)`); `AppIcon.appiconset` **1024 full-bleed `#EE5A5A`, no alpha, white O in ~20% safe zone** (not the 32px tile); `AccentColor.colorset`. |
| **android-lid** | `Chrome.kt`; Compose `SideEffect` `enableEdgeToEdge` (status always `SystemBarStyle.dark(enamel)`; nav `light(paper)` in light / `dark(paper)` in dark); `OakApp.kt` bottom nav opaque paper; `ChatScreen.kt` top bar + EmptyState (not user-bubble/answer internals); `Composer.kt`; adaptive icon = color background + ring-only foreground. |

Commit: `style: Enamel lid, paper empty landing, composer pill`

### Wave 3 — PR3 + PR4 + PR5 in parallel (9 workers, disjoint files)

PR3/4/5 all depend only on Wave 1–2. Run them together. Split by **platform × surface** so files do not overlap.

**PR3 — answer / artifact / thinking / badges / user bubble**

| Worker | Owns |
| --- | --- |
| **web-answer** | Answer/user/type/inference/`.ball` CSS; `web/src/components/answer-card/*`; thinking orb → 22px ball (`ThinkingTrace` / `ThinkingOrbMark` as spec'd); artifact CSS plates |
| **ios-answer** | `AnswerCardView` tree, `TypeBadge` + `TypeBadgeChrome`, `OakCard`; `ArtifactSheetView` / `EntityDetailView` / `ComparisonArtifactView` / `DexEntityDetailContainer` (kill `oakSpecimenPlate`); `StreamingStatusView` 22pt ball; **`ChatView.UserMessageView`** red-soft bubble |
| **android-answer** | `answercard/*`, `TypeBadge` / `OakType.badge*`, artifact/Dex plates, streaming 22dp ball, **`ChatScreen.UserMessageRow`** |

**PR4 — teams + auth**

| Worker | Owns |
| --- | --- |
| **web-teams** | `web/src/app/teams/page.tsx`, teams/auth CSS, `.chat-page__scrim` (opaque, no 1px blur) |
| **ios-teams** | `TeamEditorView.swift`, `TeamsListView.swift`, `AuthView.swift`. Keep `ToolbarSpacer` as layout split, not glass. 2px red party ring. |
| **android-teams** | `features/teams/*`, `AuthScreen.kt` |

**PR5 — remaining surfaces** (tab dock already paper from Wave 2)

| Worker | Owns |
| --- | --- |
| **web-rest** | `AppNav.tsx`, `ReferenceHeader.tsx`, `reference.css` (`--ref-header-h`), `reference-explorer.css`, `calculator.css`, `calc/page.tsx`, `share.css`, voice overlay CSS, `admin.css` (retoken, **no coral lid**) |
| **ios-rest** | `DexView.swift`, `HistoryListView.swift`, `AccountView.swift`, `CalculatorView.swift`, `ShareSnapshotView.swift`, `VoiceOverlayView.swift` (no blur) |
| **android-rest** | Dex / history / account / calc screens |

If 9 concurrent workers is too many for the host, run **three platform agents** instead, each doing PR3+4+5 on their platform only (still parallel across web / iOS / Android). Do not serialize platforms.

Commits (you make three commits from the combined diff, or one commit per PR if the diffs separate cleanly):

- `style: enamel answer plates, type badges, thinking ball`
- `style: enamel teams lid and auth paper dialog`
- `style: enamel remaining surfaces (calc, reference, dex, voice)`

### Wave 4 — PR6 you + one worker

One worker greps the worktree for banned APIs (`backdrop-filter` except `none`, `ultraThinMaterial`, `thinMaterial`, `regularMaterial`, `glassEffect`, `GlassEffectContainer`, `Material.bar`, `Material.sidebar`, `UIBlurEffect`, `RenderEffect`). Kill leftovers. Flip authority banners on `docs/design/signal.md`, `soul.md`, `docs/plans/ios-ui-polish.md` to point at `enamel-paper.md`. Remove leftover Figtree/Plex/Inter/SpaceGrotesk if unused. Update tests in Acceptance (`ChatThread.test.tsx` still forbids centered `"Oak"` lockup).

Commit: `style: ban leftover glass; point design authority at Enamel & Paper`

## Checks (parent runs these; do not merge on red)

From `web/`: `npm run typecheck`, `npm run lint`, and the component tests the spec names (`ChatThread`, ThemeToggle, ScopeChip, Composer, AnswerCard). Node `npm test` needs Docker — run if the daemon is up; do not skip typecheck/lint.

iOS: `BrandFontsTests` + `ThemeFoundationTests` at minimum; `xcodebuild test -scheme OakApp -only-testing:OakAppTests` if feasible.

Android: `compileDebugKotlin` + `testDebugUnitTest`.

Acceptance checklist is at the bottom of `enamel-paper.md`. Tick it. Visual QA: lid vs mock + `03`/`04`/`07`/`10` screenshots; empty page vs **current** landing, not `01-chat-empty.png`.

## Merge

Only when Waves 1–4 are committed, checks pass, and the grep is clean:

```bash
git checkout develop && git pull
git merge agent/enamel-paper
git worktree remove ../oak-enamel-paper
git branch -d agent/enamel-paper
```

If something is blocked (font licensing, AppIcon export, iOS 26 `oakEnamelNav()` failing the screenshot test), stop and ask. Do not silently fall back to Liquid Glass or a paper header.

## Non-negotiables to put in every worker prompt

- Enamel lid is opaque `#EE5A5A` (light) / `#C44545` (dark) through the status bar.
- Paper is `#FBF7F4`. Plates are opaque white, hairline `#E9E0D8`, warm shadow.
- Fredoka + Nunito Sans + JetBrains Mono. Static OFL on native, not variable.
- Current IA: national-dex default, eleven scopes, AppNav includes Calculator, iOS tabs Chat/Teams/Dex/Account.
- Empty landing stays current IA, restyled.
- Thinking mark = 22px Poké Ball, not the orb.
- `oakSpecimenPlate` dies on artifacts and Dex.
- In-app mark ≠ home-screen glyph.
- Admin: retoken only, no coral lid.
- OTP email: do not touch.
