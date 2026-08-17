# Answer cards and artifacts — Architecture Overview

Mode: PM
Budget Tier: hobby
Backend Topology: monolith (existing Next.js App Router app in `web/`)

## Vision

Turn the existing answer card and artifact viewer into a place that
**does things** — add to a team, open Dex, run an honest damage
calculator, operate a candidate table, keep a two-subject compare
open, highlight the claim a citation supports, pin a few rich
snapshots, hydrate voice into a real card, compact the chrome, and
copy a Showdown paste — without a new product, a new machine, or a
21st chat tool.

All requirements in `docs/features/answer-cards-and-artifacts/requirements/`
land in this monolith and the two native API clients.

## Requirements Reference

`docs/features/answer-cards-and-artifacts/requirements/`

- [overview.md](../requirements/overview.md)
- [add-to-team.md](../requirements/add-to-team.md) — ADD-*
- [calculator.md](../requirements/calculator.md) — CALC-*
- [dex-and-citations.md](../requirements/dex-and-citations.md) — DEX-*, CIT-*
- [tables-and-compare.md](../requirements/tables-and-compare.md) — TBL-*, CMP-*
- [persisted-artifacts.md](../requirements/persisted-artifacts.md) — PIN-*
- [voice-and-presentation.md](../requirements/voice-and-presentation.md) — VOICE-*, COMPACT-*, PASTE-*
- [data-and-entities.md](../requirements/data-and-entities.md)
- [auth-and-permissions.md](../requirements/auth-and-permissions.md) — AUTH-*
- [ui-and-experience.md](../requirements/ui-and-experience.md)
- [operational.md](../requirements/operational.md)

## Tech Stack

Established stack. Additions called out.

| Layer | Choice | Why |
|---|---|---|
| Language / runtime | TypeScript (strict, ESM, `@/` → `web/src/`), Node 20 | Existing |
| Web / API | Next.js App Router, `runtime = "nodejs"` | Existing; Calculator is another reference page + a chat overlay |
| Data | Drizzle + Postgres (`schema.ts`, next migration `0020_answer_card_artifacts.sql`) | Pins + account compact preference only |
| State tier | Existing Redis/in-process; **new in-process voice-trace buffer** | Hobby; compile needs the just-finished voice tool log |
| Auth | Cookie + Bearer `getCurrentAccount()` | Existing; calc / Dex / draft-export / TSV are public hops |
| Agent | Existing `runOak` / 20 tools for **chat**. Calc is **not** a tool. Voice compile is a **bounded `submit_answer`-only** loop | Do not add a 21st chat tool |
| Formulas | Existing portable `formulas/*` + new server-only modifier catalog consumed by `POST /api/calc` | One math surface for three clients |
| iOS / Android | Existing SwiftUI / Compose API clients | Same HTTP contract; Android still has no mic |
| Tests | Vitest node + jsdom; XCTest; JUnit | Existing patterns |

**New npm dependencies:** none.

**No new env vars. No new Fly apps. No object storage. No queue.**

## High-Level System Diagram

```text
web / iOS / Android
        │
        ├─ existing POST /api/chat  (unchanged contract except
        │     citation.anchor on new answers — strip-on-invalid)
        │
        ├─ GET  /api/entity  /  /api/search     (Dex + compare + calc pickers)
        ├─ POST /api/calc                       (estimate; no model)
        ├─ POST /api/teams           PUT /:id   (add-to-team = read-modify-write)
        ├─ GET  /api/teams/:id/export           (saved Showdown)
        │   serializeShowdown locally           (proposed-team one-tap)
        │
        ├─ POST /api/conversations/:id/artifact-pins
        ├─ DELETE …/artifact-pins/:pinId
        ├─ PATCH /api/account/preferences       { answer_density }
        │
        └─ POST /api/voice/transcript
                 → persist thin card
                 → fire voice-compile (same assistant row)
                 → clients see hydrate on GET conversation

Postgres
  account              (+ answer_density)
  conversation
  conversation_message (answer_json now may carry citation.anchor)
  conversation_artifact_pin  (0–5 snapshots / conversation)
```

## Design System / UI Reference

- `docs/design-system/design-system.md`
- Existing answer-card, artifact viewer, Teams editor, Dex / reference
  pages. Calculator chrome is a sibling of Dex + Teams, not a
  Smogon-calc skin.
- Requirements UI notes: [ui-and-experience.md](../requirements/ui-and-experience.md)

## Document Map

- [data-model.md](./data-model.md) — entities, columns, migrations
- [component-design.md](./component-design.md) — modules and owners
- [api-design.md](./api-design.md) — endpoints and wire contracts
- [implementation-plan.md](./implementation-plan.md) — phases, ownership, Build Manifest
- [decisions.md](./decisions.md) — ADRs
- [deployment.md](./deployment.md) — hobby infra, pinned commands

PM mode: no `conventions.md` or `testing-strategy.md`.
