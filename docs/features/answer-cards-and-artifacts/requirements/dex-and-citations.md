# Open in Dex, and citation highlights

Depends on: existing Dex pages / native Dex profiles, existing
artifact viewer, [auth-and-permissions.md](./auth-and-permissions.md).

Personas: guest and signed-in.

## Why

Structured entities already open the in-chat artifact. That is the
inspect path. Dex is the **durable page**. Citations already open a
source artifact; they still do not show **which claim** they back.

## Open in Dex

- **DEX-US-1** — As a guest or signed-in user, I want to open the Dex
  profile of the entity I am inspecting so I can leave the thread
  for the durable page.
  - **DEX-AC-1.1** — Given a Pokémon, move, ability, or item artifact
    is open, when I choose **Open in Dex**, then the matching Dex
    profile opens (web route or native Dex push).
  - **DEX-AC-1.2** — Tapping a structured entity in an answer still
    opens the **artifact viewer**. There is no extra Open in Dex
    button on every sprite or row. The only Dex control added by
    this pack is on the artifact viewer.
  - **DEX-AC-1.3** — Type artifacts / type badges have **no** Open
    in Dex in this pack. Types stay artifact-only.
  - **DEX-AC-1.4** — Open in Dex is available to guests and signed-in
    users.

- **DEX-US-2** — As a guest or signed-in user, I want that Dex hop to
  keep the same generation/format the artifact is tagged with, so
  Gen 5 Garchomp does not become a National Dex page by surprise.
  - **DEX-AC-2.1** — Given the open artifact is tagged Gen 5 (or
    Champions, or any of the eleven scopes), when I Open in Dex,
    then the Dex profile is that same scope.
  - **DEX-AC-2.2** — If Dex cannot show that scope for that entity,
    the hop lands on an honest Dex empty / not-in-format state for
    that scope. It does not silently substitute another format.

### Rules

- **DEX-BR-1 — Viewer first, Dex second.** Click-to-artifact does not
  change. Dex is an explicit action on the open artifact.
- **DEX-BR-2 — Four kinds only.** Pokémon, move, ability, item.
- **DEX-BR-3 — Scope follows the artifact.** Not the user’s current
  Dex browse scope, and not a forced national-dex profile.

Chat QoL may still offer an “Open {entity} in Dex” follow-up chip
from an answer. That chip is not this file. This file does not
remove those chips if they exist.

## Citation highlights the claim

- **CIT-US-1** — As a guest or signed-in user, I want tapping a
  citation to show which sentence or fact-table row it supports, and
  still open that source.
  - **CIT-AC-1.1** — Given a new answer linked a citation to a
    sentence or fact-table row, when I tap that citation, then that
    sentence or row is highlighted **and** the source artifact opens
    leading with the cited datum (existing AV-3.3 behavior, kept).
  - **CIT-AC-1.2** — Given there is no link (old answer, voice card
    not yet hydrated, or the model omitted the link), when I tap the
    citation, then **no** highlight is invented. The source artifact
    still opens.
  - **CIT-AC-1.3** — Highlight is visible on the answer card behind
    / beside the viewer (desktop) or is visible if I dismiss the
    overlay and look at the card (mobile). The highlight is on the
    originating answer, not on a different turn.

- **CIT-US-2** — As a guest or signed-in user, I want new answers to
  try to attach each citation to a claim so highlights usually work.
  - **CIT-AC-2.1** — New text-chat answers attempt a link from each
    citation to at least one sentence in the answer body or one
    fact-table row. Missing links are allowed; they are not a
    failed turn and they do not block `submit_answer`.
  - **CIT-AC-2.2** — Historical answers stored before this pack are
    not rewritten. Their citations behave as CIT-AC-1.2.
  - **CIT-AC-2.3** — A voice turn that has not finished hydrating
    has no links. After a successful hydrate, CIT-US-2 applies to
    that card the same as a text answer.

### Rules

- **CIT-BR-1 — One tap: highlight if linked, always open source.**
- **CIT-BR-2 — Never fake a highlight.** No whole-body highlight
  fallback. No guessing a sentence by string-matching citation
  `detail` unless a real link exists on that answer.
- **CIT-BR-3 — Best-effort on new answers, not a validity gate.**
  An answer with unmapped citations is still a valid Oak answer.
- **CIT-BR-4 — Highlight is per-tap.** Tapping a different citation
  moves the highlight to that citation’s claim (or clears it if
  unmapped). Dismissing the viewer does not require clearing the
  last highlight immediately; a new tap or a new answer may replace
  it.

## Edge, empty, and failure states

- **No Dex page for a kind we claimed:** does not apply to the four
  kinds; types are excluded.
- **Artifact failed to load:** Open in Dex is disabled or explains
  that there is no entity to open. It does not route to a blank Dex
  home.
- **Citation with no entity (generic source):** open whatever the
  existing source-tap does today; still no fake highlight.

## Out of this file

Making free-prose entity names clickable, a Dex type page, and
requiring citation maps for a valid turn are out of scope.
