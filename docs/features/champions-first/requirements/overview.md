# Champions-first — Business Requirements: Overview

Oak becomes a **Pokémon Champions competitive coach** for the **current regulation**. It is no longer a multi-generation games assistant.

This package is a change to the existing product (web, iOS, Android). It defines **what** the product must do and **why** after the cut — not how it is built.

**ID scoping.** Every story, criterion, and rule in this folder is prefixed **`CF-`**. Append; never renumber. Existing IDs in other feature folders (e.g. `TEAM-US-1`) stay valid for historical docs; **this folder supersedes them** wherever they conflict (generation scope, National Dex, Tera/EV team fields, Smogon `/meta`, wiki/locations).

## Document map

| File | Contents |
|------|----------|
| `overview.md` | Vision, personas, goals, success criteria, priorities, Assumptions |
| `core-workflows.md` | Primary journeys, edge/empty/failure/permission states (`CF-CHAT-*`, `CF-TEAM-*`, `CF-USAGE-*`, `CF-DEX-*`, `CF-CALC-*`, `CF-VOICE-*`, `CF-BOX-*`, `CF-HIST-*`) |
| `data-and-entities.md` | Business entities, ownership, lifecycle (`CF-DATA-*`) |
| `auth-and-permissions.md` | Guest, signed-in, operator (`CF-AUTH-*`) |
| `api-and-integrations.md` | External data and interchange in product terms (`CF-INT-*`) |
| `ui-and-experience.md` | Screens, chrome, copy, three-client parity (`CF-UI-*`) |
| `operational.md` | Non-functionals, constraints, Out of Scope (`CF-OPS-*`) |

## What is changing

**Today:** Oak defaults to National Dex, exposes eleven game scopes, answers whole-games questions (wiki, locations, Mystery Dungeon, other generations), and treats Champions as one format among many. `/meta` is Smogon Gen 9 OU. The team editor is a mainline Showdown editor (EVs, IVs, Tera) with Champions rules bolted on.

**After:** Oak is **only** Pokémon Champions. Every new chat turn, Dex page, item/move/ability list, calculator, living team, usage view, voice turn, box paste, and screenshot parse is Champions for the **current regulation**. Other games are declined. Reference data in the app is **only** Champions-roster species, moves, abilities, and items.

## Why this exists

The distinctive product is already Champions (Stat Points, Megas, live usage, curated roster). Eleven-scope chrome, National Dex default, and whole-games knowledge make Oak feel like a Pokédex with a chat box. Cutting that mass makes the coach honest and makes new work (usage, Stat Points, live meta) the product instead of side quests.

## Goals

1. A new user lands in Champions with no generation picker and no other-game data.
2. Asking about something not on the current Champions roster is declined, and the answer **names it and says it is not in the Champions roster**.
3. Team building, calc, Dex, and usage are native to Champions (Stat Points, level 50, no Tera, live Doubles/Singles usage).
4. Existing chat transcripts are not rewritten. Other-format teams are archived, not living.
5. Web, iOS, and Android ship the same product surface in this change.

## Users and personas

- **Champions player (primary).** Comfortable with VGC/Champions concepts (Stat Points, Megas, regulation). Uses Oak to build and rate teams, check the live ladder, calc at 50, and ask legality/set questions. May start as a **guest** and sign in to save teams and history.
- **Returning account holder.** May have old multi-game chats and teams from before this change. Expects old transcripts to remain readable and old non-Champions teams not to appear as living teams.
- **Operator.** The existing private admin: usage, cost, accounts, and the **Champions item allowlist** for the rolling item pool. Not an end-user role.

There is no separate “National Dex user” or “Gen 7 VGC user” persona after this change.

## Success criteria

- **CF-SC-1** — A guest opening a new chat on web, iOS, or Android sees a Champions empty state (Champions starters, current-regulation chip) and no control that switches generation or National Dex.
- **CF-SC-2** — Asking “Was Excadrill good in Gen 5?” (or any other non-Champions game/Pokémon/move/item) yields a decline that names the entity and says it is not in the Champions roster, with no other-game facts.
- **CF-SC-3** — Pokédex, moves, abilities, and items lists contain **only** current Champions-roster entities. A direct URL for a non-Champions species/move/ability/item is not found (404).
- **CF-SC-4** — A new team uses Stat Points (66 total, max 32 per stat), level 50, no Tera field, and no IV/level knobs. Saving an over-budget spread succeeds with a warning (warn-but-allow).
- **CF-SC-5** — Usage is a first-class public surface on web, iOS, and Android: live Champions ladder, Doubles default, Singles as a second view, leaderboard plus species drill-in, dated as live.
- **CF-SC-6** — “Apply this Champions set” is offered from the team editor, usage drill-in, Dex, Pokémon artifact, place-on-team, and a chat proposed team. A filled slot asks for confirmation, then replaces the slot.
- **CF-SC-7** — After cutover, the app’s reference data does not include species, moves, abilities, or items that are not on the current Champions roster. Smogon OU usage is gone; `/meta` reaches Champions usage.

## Priority

Ship as **one product change** on web, iOS, and Android together: identity cut, Champions-only data, native team/calc/Dex, usage page, apply-set, threat board, archive, decline rule, copy.

Do not stagger “web Champions-first” while mobile still has an eleven-scope chip.

## Assumptions

Confirmed with the requester (speed-path leftovers after the interview). Treat as requirements unless a later change supersedes them.

- **CF-AS-1** — Usage is **public** (no account required), like today’s `/meta`.
- **CF-AS-2** — Doubles/Singles on the usage surface **defaults to Doubles each visit** (not a saved preference).
- **CF-AS-3** — Apply-set confirmation is **replace yes/no**, not a field-by-field diff.
- **CF-AS-4** — Opening an archived other-format team shows **stored names**; anything not on the Champions roster is labeled not in the Champions roster. No other-game lookup.
- **CF-AS-5** — **Teams Assistant** is Champions-only (same rules as chat).
- **CF-AS-6** — **App Store and site copy** update in this same change.
- **CF-AS-7** — **Operator Champions item allowlist** stays so the rolling item pool can be curated.
- **CF-AS-8** — Visual language (Enamel & Paper) is unchanged. This is not a visual redesign.
- **CF-AS-9** — The product name stays **Oak**.
- **CF-AS-10** — Voice remains **signed-in only** (existing rule).
- **CF-AS-11** — Guests must **sign in** to apply a set onto a saved team or save a team (existing rule).
- **CF-AS-12** — No new onboarding tutorial. Empty chat is the first-run.

## Out of scope (summary)

Full list in `operational.md`. Not in this change: other games as a mode, wiki/Mystery Dungeon/catch locations, Smogon OU, a standalone type-chart page, live battle co-pilot, historical regulations as a picker, renaming Oak, a visual redesign.
