# Oak for iPad — Architecture Overview

Mode: PM
Budget Tier: hobby
Backend Topology: existing Next.js monolith (Fly.io, **unchanged**) + existing native iOS client (`ios/`), iPad idiom added

## Vision

A **distinct iPad UI** inside the **one existing Oak iOS app**. Same accounts,
same HTTP/SSE backend, same view models and leaf widgets. iPhone
`RootView` / `OakTabDock` / push-and-sheet navigation **do not change**.
On iPad, `PadRootView` is the shell: enamel sidebar, custom columns,
companion chat, inspector, centered panels, portrait and landscape.

This is not a second binary, not a web view, and not a scaled iPhone
layout. No new agent tools, endpoints, or data stores.

## Requirements Reference

- Product: `docs/features/ipad-app/requirements/` (`P-*` IDs)
- Shared capability behavior: shipping iPhone app + `docs/features/iphone-app/requirements/` (`M-*`)
- iPhone architecture (stack to fit, not to reopen): `docs/features/iphone-app/architecture/`
- Champions-first product identity: `docs/features/champions-first/`
- Visual language: shipping iOS chrome (enamel / paper). Do not implement from the retired `docs/design-system/design-system.md`.

## Tech Stack

**No new stack.** Fit the iPhone client:

| Layer | Choice | Why |
| --- | --- | --- |
| Language | Swift 6, strict concurrency | Existing `ios/` |
| UI | SwiftUI, iOS 18.0 | Existing; custom columns not `NavigationSplitView` |
| Architecture | MVVM + Observation | Existing ADR-3 |
| Networking | `OakAPIClient` + `SSEClient` | Unchanged |
| Auth | Bearer + Keychain | Unchanged |
| Dependencies | Apple frameworks only | Existing ADR-5 |
| Testing | Swift Testing + XCUITest | Existing; add iPad destinations |
| Backend | Existing Fly Next.js | **Zero** new endpoints (P-API-BR-3) |

**Project change (not a new stack):** `TARGETED_DEVICE_FAMILY` `"1"` → `"1,2"`. iPhone orientations stay portrait-only; iPad lists all four orientations.

## High-Level System Diagram

```text
OakApp WindowGroup
        │
        ├── userInterfaceIdiom == .phone → RootView (UNCHANGED)
        │     OakTabDock + ChatTabView / Teams / Usage / Dex / Settings
        │
        └── userInterfaceIdiom == .pad  → PadRootView (NEW)
              PadSidebar
              PadColumnStack (measured width → regular | medium | compact)
              destinations:
                Chat    → list | thread | inspector
                Teams   → library | canvas | slot inspector
                Usage   → ladder | species
                Dex     → index | profile (+ usage section)
                Settings→ list | detail
                Calc    → workspace (not a sidebar item)
              optional companion (ChatViewModel, off by default)
              centered panels (auth, import, add-to-team, companion artifacts)

Views  →  existing @Observable ViewModels  →  existing Services  →  OakAPIClient
                ▲
                └── PadShellModel (iPad chrome only: destination, companion
                    open/closed, context chip, split fractions)
```

The client still never sees repos, the agent loop, or Postgres.

## Design System / UI Reference

- Follow **existing iOS Oak chrome** (`Theme`, `OakChrome`, enamel nav, paper surfaces, answer-card tree).
- iPad adds **structure** (sidebar, columns, inspector, centered panels), not a new brand.
- iPhone screenshots / portrait-only Info.plist orientations stay.

## Document Map

- `decisions.md` — ADRs for isolation, columns, companion, context chip
- `data-model.md` — session UI state only (no new persisted entities)
- `api-design.md` — existing chat send + how the context chip maps onto it
- `component-design.md` — Pad components, file ownership, seams
- `implementation-plan.md` — phases, checkpoints, Build Manifest
- `deployment.md` — device family, TestFlight, iPad screenshots, commands

PM mode: no `conventions.md` / `testing-strategy.md`. Inherit `docs/features/iphone-app/architecture/conventions.md` and `testing-strategy.md`.
