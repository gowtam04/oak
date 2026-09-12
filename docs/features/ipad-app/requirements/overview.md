# Oak for iPad — Business Requirements: Overview

> A **tablet layout of the existing native iOS Oak app**. Same product, same
> accounts, same backend, same capabilities as the current iPhone client. This
> document set defines **what** the iPad experience must do and **why**, for
> handoff to a solution architect. It does not make technical decisions;
> technology preferences are recorded as constraints in `operational.md`.
>
> **ID scoping.** Every user story, acceptance criterion, and business rule in
> this doc set is prefixed **`P-`** (iPad) to keep it distinct from iPhone
> `M-` IDs, Android `D-` IDs, and web IDs. IDs are stable — append, never
> renumber.
>
> **Capability source of truth.** Functional behavior (what Oak can *do*) is
> whatever the **current iPhone app** already does — chat, guest/OTP, history,
> teams + Teams Assistant, Dex, Usage, Calculator, artifacts, pins, Voice,
> images, Showdown import/export, add-to-team, compare, regulation chip,
> settings, account deletion, shares. These docs specify the **iPad
> information architecture, layout, and interaction** of those capabilities.
> They do not add agent tools, artifact types, scopes, or features iPhone
> lacks. Where iPhone requirement docs are stale (six-scope chip, active
> team), **the shipping iPhone app and Champions-first product win**.

## What we're building

A **distinct iPad user interface** inside the **one existing Oak iOS app**
(same App Store listing, same binary family, same accounts). iPhone layouts
**do not change**. On iPad, every current screen is redesigned around the
larger canvas in **both landscape and portrait**. This is not a scaled-up
iPhone app and not a second product.

Landscape at a desk is the **primary posture**. Portrait, iPad Mini, Split
View, and Stage Manager remain first-class: the iPad shell **collapses and
stacks**; it never swaps to the iPhone UI.

## Why this exists

Three reasons, treated equally:

1. **Workbench** — iPad is where people actually edit teams, compare usage,
   and run calcs. Phone is for quick questions; tablet should feel like a
   desk.
2. **Chat + reference on screen together** — stop flipping tabs between Oak
   chat and Dex / a team / a calc.
3. **App Store iPad presence** — the app currently runs as an iPhone
   compatibility experience on iPad. It must look and behave like a real
   tablet product (including an iPad screenshot set).

If we don't build it, Oak on iPad remains a letterboxed or stretched phone
app: usable, but not a tablet product.

## Scope

**In scope:** iPad-native layout and interaction for every current iPhone
capability, including:

- App shell (sidebar destinations, companion chat, orientation, compact
  width) — `shell-and-adaptation.md`
- Chat destination (list | thread), answers, inspector artifacts, pins,
  Voice, images, empty canvas — `chat-and-artifacts.md`
- Teams workbench (library | canvas | slot inspector); Teams Assistant is
  companion chat — `teams-workbench.md`
- Dex, Usage, Calculator, Settings — `reference-and-tools.md`
- End-to-end journeys and edge states — `core-workflows.md`

**Out of scope** is listed in `operational.md` (no new capabilities, no
iPhone redesign, no Mac, no shortcut suite, no Pencil/multi-window/widgets/
push/Watch, no Android or web tablet pass in this project).

## Users and personas

**Same as iPhone** (`docs/features/iphone-app/requirements/overview.md`
§Users and personas), unchanged in kind:

- **Guest.** Full chat, Dex, and Usage at the guest rate limit. Ephemeral
  thread. Teams and durable history are visible as sign-in-gated upgrades,
  not broken screens. Voice remains signed-in only (same as iPhone).
- **Registered user.** Email-OTP account, long-lived session, higher limit,
  durable history and teams. The **same account** works across web, iPhone,
  Android, and iPad.

The user is a competitively-literate Pokémon fan using Oak as a Champions
coach — now at a desk or on the couch with an iPad, not only on a phone.

There is **no admin role** on this client.

## Success criteria

- **P-SUCCESS-1 — Capability parity.** An iPad user can do **everything**
  the current iPhone app can do: reasoned/cited chat, guest or signed-in,
  history, teams + Assistant, Dex, Usage, Calculator, artifacts, pins,
  images, Voice (signed-in), Showdown import/export, add-to-team, compare,
  settings, account deletion. No current iPhone capability is missing
  except items listed in `operational.md` §Out of Scope.
- **P-SUCCESS-2 — Tablet quality, not a scaled phone.** Every destination
  has a **distinct landscape layout and a distinct portrait layout**. A
  screenshot of any primary screen must not be recognizable as the iPhone
  UI with extra margin. Sidebar, split panes, inspector, and companion
  chat are the iPad grammar.
- **P-SUCCESS-3 — Answer fidelity.** Answers still render with full
  structural fidelity: reasoning, citations, inference/uncertainty flags,
  format/regulation tag, sprites, tables. Prose stays readable; data
  blocks use the width.
- **P-SUCCESS-4 — Continuity under resize.** Rotate, Split View, Stage
  Manager, and Mini never lose the open conversation, team, Dex profile,
  calc, inspector contents, or companion open/closed state. The shell
  stays the iPad shell (stacked/collapsed as needed).
- **P-SUCCESS-5 — Store-credible iPad listing.** The existing Oak iOS
  listing gains a complete **iPad screenshot set** that shows the tablet
  layouts (not iPhone screenshots letterboxed). Listing copy does not
  claim new agent capabilities.

Adoption signals (iPad sessions, rating) are aspirational, not the launch
bar.

## Priority guidance for the architect

Build-order only; each file stands on its own.

1. **Shell** — iPad idiom detection, sidebar destinations, compact
   collapse/stack, orientation, state preservation. Nothing else is
   reachable without this.
2. **Chat destination** — list | thread, wide data blocks, inspector,
   pins, composer (keyboard, library, drag-and-drop), empty workbench.
3. **Companion chat** — off-by-default pane, context chip, portrait stack,
   Teams Assistant unification.
4. **Teams workbench** — library | canvas | slot inspector.
5. **Dex, Usage, Calc, Settings** — index | profile / attacker | defender
   / list | detail.
6. **Voice workspace, overlays, App Store iPad screenshots.**

iPhone visual/IA must not change as a side effect of shared code.

## Relationship to existing docs

- iPhone requirements (`docs/features/iphone-app/requirements/`) describe
  shared product behavior (personas, `OakAnswer`, auth, history, team
  semantics). This set **does not copy those rules**; it cites them and
  specifies the iPad surface.
- Champions-first (`docs/features/champions-first/`) and the shipping app
  win over stale iPhone passages (generation-scope chip, active team).
- Design language: current iOS Oak chrome (enamel lid, paper, type
  badges), adapted to iPad density — not a new brand. See
  `ui-and-experience.md`.

## Document map

| File | Contents |
| --- | --- |
| `overview.md` | This file |
| `shell-and-adaptation.md` | Sidebar, companion chat, orientation, compact width, inputs |
| `chat-and-artifacts.md` | Chat destination, answers, inspector, pins, Voice, images |
| `teams-workbench.md` | Team library, canvas, slot inspector, Assistant-as-companion |
| `reference-and-tools.md` | Dex, Usage, Calculator, Settings |
| `core-workflows.md` | Primary journeys with empty, fail, permission, and conflict states |
| `data-and-entities.md` | Business entities; no new data products |
| `auth-and-permissions.md` | Guest vs signed-in on the iPad shell |
| `api-and-integrations.md` | Same backend; no new product integrations |
| `ui-and-experience.md` | Tone, chrome, pointer, accessibility |
| `operational.md` | NFRs, constraints, out of scope, open questions |

## Assumptions

None. Discovery was completed without a speed path.

## Open questions

See `operational.md` §Open questions — documentation notes only, not
product blockers.
