# Chat quality of life — Architecture Overview

Mode: PM
Budget Tier: hobby
Backend Topology: monolith (existing Next.js App Router app in `web/`)

## Vision

Make daily Oak chat recoverable, organizable, and able to leave the app
without a new product surface. All seventeen Chat QoL requirements land
in the **existing monolith** and the two native API clients. No new
machine, no object store, no 21st tool, no `OakAnswer` schema change.

Recovery (retry / edit / undo) is a **replace-on-success** persist of
the last pair plus the existing Stop path. Share is an **immutable
Postgres snapshot** at an unguessable noindex URL. Mentions are
**server-bound team UUIDs** on `POST /api/chat`. Folders, archive,
pins, and fork are account-scoped columns/rows on the existing
conversation model.

## Requirements Reference

`docs/features/chat-qol/requirements/`

- [overview.md](../requirements/overview.md)
- [turn-recovery.md](../requirements/turn-recovery.md) — REC-*
- [leave-the-app.md](../requirements/leave-the-app.md) — COPY-*, SHARE-*, EXP-*
- [organize.md](../requirements/organize.md) — PIN-*, FORK-*, ORG-*
- [composer-and-navigation.md](../requirements/composer-and-navigation.md) — MEN-*, CHIP-*, SLASH-*, NAV-*, EMPTY-*, SCOPE-*
- [data-and-entities.md](../requirements/data-and-entities.md)
- [auth-and-permissions.md](../requirements/auth-and-permissions.md) — AUTH-*
- [ui-and-experience.md](../requirements/ui-and-experience.md)
- [operational.md](../requirements/operational.md) — CQ-OQ-*

## Tech Stack

Established stack. Additions called out.

| Layer | Choice | Why |
|---|---|---|
| Language / runtime | TypeScript (strict, ESM, `@/` → `web/src/`), Node 20 | Existing |
| Web / API | Next.js App Router, `runtime = "nodejs"` | Existing; public `/a/[id]` is another page |
| Data | Drizzle + Postgres (`schema.ts`, next migration `0019_chat_qol.sql`) | Existing; new tables/columns only |
| State tier | Existing Redis/in-process session store for guests | Guest recovery rewrites the last session pair |
| Auth | Cookie + Bearer `getCurrentAccount()` | Existing; share **view** is unauthenticated |
| Agent | Existing `runOak` / 20 tools | `ctx.boundTeams` only; no new tool |
| PDF | `pdfkit` (or equivalent lightweight text PDF, **not** Puppeteer) | Hobby Fly cannot afford Chromium |
| Share ids | `nanoid` 21 (URL-safe, unguessable) | Not sequential UUIDs |
| iOS / Android | Existing SwiftUI / Compose API clients | Same HTTP/SSE contract |
| Tests | Vitest node + jsdom; XCTest; JUnit | Existing patterns |

**New npm dependencies (web only):** `pdfkit` (+ `@types/pdfkit` if needed), `nanoid`. After add: refresh the Docker `node_modules` volume (existing gotcha).

**No new env vars. No new Fly apps. No object storage.**

## High-Level System Diagram

```text
web / iOS / Android
        │
        ├─ POST /api/chat  { session_id, message, images?, scope_seed?,
        │                    recovery?, mentioned_team_ids? }
        │         → rate limit → startTurn → runTurn → runOak
        │         → persist (append OR replaceLastPair) → answer
        │
        ├─ POST /api/chat/turns/:id/stop     (undo = Stop)
        ├─ PUT  /api/scope                   (chip pick, no message)
        ├─ folders / pins / fork / bulk      (signed-in)
        ├─ POST /api/shares  →  GET /a/:id   (public snapshot, noindex)
        └─ GET  /api/conversations/:id/export?format=md|pdf

Postgres
  conversation (+ folder_id, archived)
  conversation_folder
  conversation_message (+ pinned)
  account_scope_mru
  shared_answer   (immutable snapshot; revoked_at or deleted on account delete)
```

## Design System / UI Reference

- `docs/design-system/design-system.md`
- Requirements UI notes: `docs/features/chat-qol/requirements/ui-and-experience.md`
- Follow existing answer-card / history / scope-chip patterns. Do not invent a visual system.

## Document Map

- [data-model.md](./data-model.md) — tables, columns, caps, migrations
- [component-design.md](./component-design.md) — modules, owners, dependencies
- [api-design.md](./api-design.md) — HTTP/SSE/wire contracts (high detail at seams)
- [implementation-plan.md](./implementation-plan.md) — phases, ownership, Build Manifest
- [decisions.md](./decisions.md) — ADRs
- [deployment.md](./deployment.md) — hobby deploy, commands, cost

PM mode: no `conventions.md` or `testing-strategy.md`.
