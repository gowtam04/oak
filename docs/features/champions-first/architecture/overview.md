# Champions-first — Architecture Overview

Mode: PM
Budget Tier: startup
Backend Topology: modular-monolith (existing Next.js app + native clients)

## Vision

Oak becomes a Pokémon Champions competitive coach for the **current regulation**. The existing modular monolith and three clients stay; we **force Champions on every new turn**, **remove other-game tools and reference data**, and add native Champions surfaces (regulation chip, Stat Point editor, live usage, apply-set, team archive). Trace: `docs/features/champions-first/requirements/overview.md` CF-SC-1–7.

## Requirements Reference

- `docs/features/champions-first/requirements/overview.md`
- `docs/features/champions-first/requirements/core-workflows.md`
- `docs/features/champions-first/requirements/data-and-entities.md`
- `docs/features/champions-first/requirements/auth-and-permissions.md`
- `docs/features/champions-first/requirements/api-and-integrations.md`
- `docs/features/champions-first/requirements/ui-and-experience.md`
- `docs/features/champions-first/requirements/operational.md`

This folder **supersedes** conflicting older feature docs (generation-scope, oak-v2 wiki/SQL, Smogon `/meta`, eleven-scope chip).

## Tech Stack

No new languages, hosts, or datastores. Brownfield only.

| Layer | Choice | Why |
|-------|--------|-----|
| Language / runtime | TypeScript (Node 20+), Swift 6, Kotlin 2.1 | Existing |
| Web / API | Next.js App Router monolith | Existing |
| Data store | Fly Postgres (Drizzle) | Existing; **less** data after cutover |
| Cache / sessions | Existing Redis dual-backend | Unchanged; usage stays **in-process TTL** (startup) |
| Auth | Email OTP + cookie/Bearer | Unchanged |
| Agent | Provider-agnostic tool loop, Grok 4.6 default | Same loop; **fewer tools**, Champions prompt |
| Live usage | championsbattledata.com via `usage-client` | Existing T15 client, now also the usage **page** |
| Native | iOS SwiftUI, Android Compose | Same HTTP/SSE API |
| Visual | Enamel & Paper (`docs/design/enamel-paper.md`) | CF-AS-8; do not redesign |

**Additions:** public Usage HTTP API + pages/screens; `listLeaderboard` on the usage client; living vs archived team list; Drizzle migration that **deletes** non-Champions reference data.

**Removals (product data / model surface):** T14 `get_encounters`, T18 `run_sql`, T19 `search_wiki`, T21 `get_meta_usage`; wiki/natdex/PMD/encounters/Smogon tables; eleven-scope picker; `detect-scope` as a turn router.

## High-Level System Diagram

```text
Web / iOS / Android
  ├─ Chat (SSE) ──────────────► POST /api/chat
  │                               always ctx.mode = "champions"
  │                               tools: T1–T13, T15, T16, T17, T22  (no T14/T18/T19/T21)
  ├─ Usage (public) ──────────► GET /api/usage?ladder=
  │                             GET /api/usage/:slug?ladder=
  │                               └─ usage-client ──► championsbattledata.com
  ├─ Dex / entity (public) ───► GET /api/entity?format=champions
  │                             GET /api/search (champions index only)
  ├─ Calc ────────────────────► existing /api/calc, L50 / Stat Points
  └─ Teams (signed-in) ───────► GET/POST /api/teams
                                GET /api/teams?archived=1
                                POST /api/teams/set-template  (live Champions usage)
                                POST /api/teams/import        (Tera drop, EVs→SP)
                                      │
                                      ▼
                             Postgres
                               pokemon/learnset/reference/searchable  format='champions' only
                               team.format = 'champions'  → living
                               team.format ≠ 'champions'  → archived (read/delete)
                               conversation messages kept as written
                               wiki / natdex / meta / encounters DROPPED
```

## Design System / UI Reference

- Implement from `docs/design/enamel-paper.md` (and `enamel-paper-implement.md`).
- Do **not** use superseded `docs/design-system/design-system.md`, `signal.md`, or `soul.md`.
- Follow existing component patterns (answer card, Dex explorers, team editor). This change is copy, chrome, and data — not a new visual system.

## Document Map

- `data-model.md` — entities, cutover SQL, what stays vs drops
- `component-design.md` — modules and ownership
- `api-design.md` — HTTP + agent-tool + prompt seams
- `implementation-plan.md` — phases, file map, Build Manifest
- `decisions.md` — ADRs
- `deployment.md` — commands, ops, cost (startup)
- [`../regulation-cutover.md`](../regulation-cutover.md) — how to pin the next Champions regulation (Showdown SHA, not npm `@pkmn/mods`)

PM mode: no `conventions.md`, no `testing-strategy.md`. Tests are specified per phase (`test_focus`).
