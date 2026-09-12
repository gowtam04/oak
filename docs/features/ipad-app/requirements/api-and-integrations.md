# Oak for iPad — API and Integrations

> Product-level integrations only. iPad is a **client of the existing
> Oak backend**. This project does not add product integrations
> (Showdown ladder beyond T15, social login, push, iCloud, etc.).

## Backend

- **P-API-BR-1** — **No second backend.** Web, iPhone, Android, and
  iPad share one backend, one data store, one account namespace. The
  iPad UI holds **no LLM keys and no database**.
- **P-API-BR-2** — **Reuse first.** Chat SSE, auth OTP, history, teams,
  Dex, live usage, calc, artifacts, pins, Voice token/tool/transcript,
  and account deletion use the **same** APIs the iPhone app already
  uses.
- **P-API-BR-3** — This redesign **must not require new product-facing
  endpoints** to ship. If architecture discovers a missing client
  payload for the context chip, it must be an additive, web-safe
  equivalent of existing “ask about this” / team-in-context behavior —
  not a new agent tool.

## Context chip (not a new integration)

Sending with a context chip includes the open object **the same way**
iPhone already includes an object from “ask about this in chat” or
Teams Assistant. No third-party service.

## Images

Library, camera, and drag-and-drop all feed the **existing** image
upload pipeline (≤4, validation, consume-on-turn). Drag-and-drop is
an iPad input to that pipeline, not a new backend feature.

## Usage

Dex-profile Usage section and the Usage destination read the **same
live Champions usage** integration iPhone already uses (T15). Fail-
soft when it is down. No second usage provider.

## Shares and deep links

Existing Oak URLs (`/a/{id}`, Dex hops, etc.) open the **iPad layout**
of the matching destination. No new URL schemes in this project.

## Explicitly not integrated here

Push/APNs, widgets, Spotlight index, Share extension, Sign in with
Apple, Mac Catalyst, third-party keyboards as a product feature,
Apple Pencil services, Game Controller, iCloud Drive as a team store.

## Cross-links

- Constraints: `operational.md`
- Context chip: `shell-and-adaptation.md`
