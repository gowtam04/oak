# Oak — AI-Powered Pokémon Pokédex & Strategy App

> **Last updated:** 2026-07-05
> **Website:** [oak.gowtam.ai](https://oak.gowtam.ai)
> **Status:** Live (web, iOS TestFlight, Android in progress)

---

## App Overview

**Oak** is an AI chat agent for the Pokémon **games**. You ask it natural-language
questions — about filters, lookups, mechanics, battle math, in-game locations, events,
and glitches — and it answers with reasoning, cited sources, and the exact
generation/format the answer is based on.

### What makes it unique

- **It reasons on top of data, it doesn't just look things up.** Tools supply raw facts
  (move priority, ability effect text, type charts, base stats, learnsets) and the agent
  *deduces* how they interact. Ask "does my Dragonite outspeed Garchomp after a
  Dragon Dance?" and Oak does the stat math and the priority reasoning, not just a
  stat dump.
- **Every answer is accountable.** Answers carry explicit reasoning, cited sources,
  inference/uncertainty flags, and the generation + format they assume — so you always
  know *why* Oak said something and how much to trust it.
- **One agent, one prompt, the whole games catalog.** Mainline titles across every
  generation, Pokémon Champions, and spin-offs like Pokémon Mystery Dungeon — all
  answered by a single agent.

### Scope — games, not the whole franchise

Oak is a **games** assistant. The anime, movies/films, TV, and manga are intentionally
**out of scope** and are gracefully declined with a games-focused pivot.

### Target users

- **Casual players** who want quick, trustworthy answers about a game they're playing.
- **Competitive battlers** who need damage calcs, speed tiers, ability interactions, and
  team-legality checks.
- **Collectors / completionists** tracking encounters, evolution chains, and locations.

### Key value proposition for trainers

Get a *reasoned*, *sourced* answer to almost any Pokémon-games question in one place —
without stitching together a wiki, a damage calculator, a type chart, and a competitive
usage site yourself.

---

## Core Features

| Feature | What it does for you |
|---|---|
| **Natural-language chat** | Ask anything about the games in plain English; no query syntax to learn. |
| **Reasoned answers** | Every response shows its reasoning, not just a fact — you see *how* Oak got there. |
| **Cited sources + confidence flags** | Answers flag inference vs. fact and mark uncertainty, so you know when to double-check. |
| **Battle math** | Stat calculations, damage estimates, nature effects, and type-chart interactions computed deterministically. |
| **Ability & move reasoning** | Oak reads effect text and deduces interactions (priority, immunities, stat changes). |
| **Team builder** | Signed-in users can save teams; Oak can read them and reason about coverage and legality. |
| **Teams Assistant** | Verifies a species' legal moveset before proposing moves — so suggestions are actually usable in-game. |
| **Encounter / catch data** | Where and how to find Pokémon (locations, methods). |
| **Evolution chains** | Full evolution lines, including cross-scope fallback for whole-game facts. |
| **Learnsets** | A species' complete legal moveset for a given format. |
| **Competitive usage stats** | Live Pokémon Champions ladder usage, plus stored Smogon monthly ladder stats (Gen 9 OU). |
| **Six-scope model** | Switch between Scarlet/Violet (Gen 9), Champions, and mainline Gens 5–8 via a header scope chip. |
| **Image input (vision)** | Attach up to 4 images to a message — Oak can reason over screenshots and photos. |
| **Voice mode** | Real-time spoken conversation with Oak as a Pokédex persona (signed-in only). |
| **Guest & account modes** | Use it instantly as a guest, or sign in via email/OTP for durable history + the team builder. |
| **Durable chat history** | Signed-in conversations persist across sessions and devices. |
| **Background turns** | A generation keeps running even if you navigate away or background the app; reattach to see the result. |
| **Full-text game wiki search** | Retrieval over a self-built corpus of in-game locations, mechanics, glitches, walkthroughs, and Mystery Dungeon content. |
| **SQL-backed aggregations** | Guarded read-only queries over an offline national-dex warehouse for questions the typed tools can't express. |

### Platforms

- **Web** — the primary client at [oak.gowtam.ai](https://oak.gowtam.ai).
- **iOS** — native SwiftUI app (TestFlight).
- **Android** — native Jetpack Compose app (in development; feature parity with web/iOS).

---

## How It Works

### High-level user flow

1. **Ask a question** in the chat — as a guest or signed in.
2. **Oak resolves the scope** (which game/generation the question is about) automatically
   from your message, with a manual **scope chip** override in the header.
3. **The agent calls tools** — looking up Pokémon, moves, abilities, items, type charts,
   learnsets, encounters, usage stats, or searching the game wiki as needed.
4. **Oak reasons over the results** — doing the battle math and deducing interactions.
5. **You get a structured answer** streamed token-by-token, with reasoning, sources,
   uncertainty flags, and the generation/format it assumed.

### Key AI capabilities

- **Inference & confidence flagging** — distinguishes stated facts from deductions and
  surfaces uncertainty rather than bluffing.
- **Deterministic battle math** — stat, damage, nature, and type-effectiveness
  calculations run in tested, pure formula code (not hallucinated by the model).
- **Ability / move interaction reasoning** — reads effect text and works out how things
  combine.
- **Scope awareness** — knows which generation/format applies and answers honestly when
  something is out of the indexed scope.
- **Honest degradation** — for time-sensitive or unindexed facts, Oak degrades honestly
  instead of guessing (it has no live web-search tool).
- **Multimodal** — reasons over attached images alongside text.

### Integration points (data sources)

- **`@pkmn` ecosystem** (`@pkmn/dex`, `@pkmn/data`, `@pkmn/mods`) — the offline source of
  all core game data (dex, moves, abilities, items, types, learnsets). No network crawl.
- **PokeAPI** — encounter/catch data.
- **Pokémon Champions ladder** — live competitive usage stats.
- **Smogon** — stored monthly ladder usage stats (Gen 9 OU), refreshed periodically.
- **Self-built Fandom corpus** — full-text game-content wiki search (games only).

---

## Tech Stack (high-level)

| Layer | Technology |
|---|---|
| **Frontend (web)** | Next.js (App Router), React, TypeScript |
| **Backend / API** | Next.js API routes, Node.js, TypeScript monolith |
| **Agent runtime** | Provider-agnostic tool-loop with a structured output contract |
| **AI models** | Grok (primary/default), with Claude and GPT selectable server-side |
| **Voice** | Real-time voice agent over WebSocket (browser connects directly with a server-minted token) |
| **Data store** | Postgres (via Drizzle ORM + node-postgres) |
| **State tier** | Redis (guest sessions, rate limiting, OTP throttle) with in-process fallback |
| **iOS client** | Swift 6 / SwiftUI |
| **Android client** | Kotlin 2.1 / Jetpack Compose |
| **Hosting / deploy** | Fly.io (app + a small self-run Redis machine) |

*Note: the mobile clients are pure clients of the web API — they hold no AI keys or
database access of their own.*

---

## User Benefits

### For casual players

- Instant, plain-English answers while playing — "where do I catch X?", "what does this
  ability do?", "is this move good?"
- Trustworthy responses that flag when Oak is inferring vs. certain.
- **Example:** Stuck on which starter or evolution path to pick — ask Oak and get a
  reasoned comparison grounded in real stats and movesets.

### For competitive battlers

- Damage calcs, speed tiers, and ability/priority interactions worked out for you.
- Team building with legality-checked movesets and live usage data.
- **Example:** "Does +1 Garchomp OHKO standard Corviknight?" — Oak pulls stats, applies
  the damage formula, and shows the math.

### For collectors / completionists

- Encounter locations and methods, evolution chains, and learnsets in one place.
- **Example:** Building a living dex — ask Oak for the full evolution line and where each
  stage is found.

---

## Current Progress & Roadmap

### Recently completed

- **Six-scope model** — Scarlet/Violet, Champions, and mainline Gens 5–8, with a
  deterministic server-side scope resolver and a UI scope chip.
- **Image input (vision)** across all three clients.
- **Background / durable turns** — generations survive navigation and app relaunch.
- **Voice mode** — real-time spoken chat (signed-in).
- **Teams Assistant + learnset verification** — proposes only legal moves.
- **Stored Smogon usage stats** (Gen 9 OU) alongside live Champions usage.
- **Native iOS app** (TestFlight) with animated sprite support.
- **Read-only admin panel** — operator analytics dashboard.

### In progress

- **Android app** — structural port of the iOS client to Jetpack Compose, at feature
  parity (chat, answer card, auth, history, teams, image input, six-scope model).
- Ongoing TestFlight feedback triage and fixes.

### Future plans / gaps

- Dedicated staging environment (mobile clients currently point at production).
- Play Store listing/signing for Android (debug-signed release only for now).
- Broader spin-off game coverage over time.

---

## Additional Context

### Branding & tone

- **Name:** Oak (after Professor Oak). Persona for voice mode is a Pokédex.
- **Positioning:** a *games* assistant that **reasons on top of data** — the accountable,
  sourced alternative to guessing or juggling multiple wikis and calculators.
- **Tone:** knowledgeable, precise, honest about uncertainty. Never bluffs; degrades
  honestly when data is missing.
- **Hard constraint for public posts:** Oak is **games-only**. Do not market it as an
  anime/movie/TV/manga franchise assistant — that content is explicitly out of scope.
- **Accountability is the selling point.** Emphasize reasoning + citations + confidence
  flags + explicit generation/format, not just "answers questions."

### Links

- **Website:** [oak.gowtam.ai](https://oak.gowtam.ai)
- Pokémon data via the `@pkmn` ecosystem, PokeAPI, Smogon, and Pokémon Champions.

### Notes for an AI assistant helping build in public

- Lead with the **"reasons on top of data"** differentiator — it's the core story.
- Concrete battle-math examples land better than feature lists.
- Highlight the **guest-first** experience (no signup needed to try it) plus the
  **account unlock** (history + team builder).
- When showing scope, mention Oak *tells you* which generation/format an answer assumes —
  a trust feature competitors lack.
- Keep any franchise-media claims out; stay in the games lane.

---

*This document is a living reference. Update the "Last updated" date and relevant sections
as features ship.*
