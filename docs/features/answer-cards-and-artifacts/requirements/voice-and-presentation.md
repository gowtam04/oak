# Voice cards, compact/full, and Showdown copy

Depends on: existing voice mode (signed-in only), existing answer
card, existing team-editor Showdown export,
[auth-and-permissions.md](./auth-and-permissions.md).

## Voice turns should render a real answer card

Personas: signed-in voice users (voice remains signed-in only).

- **VOICE-US-1** — As a signed-in user, I want a finished voice turn
  to look like a text-chat Oak answer so history is one product.
  - **VOICE-AC-1.1** — After hydration succeeds, the turn’s card can
    include reasoning, citations, fact table, candidates, damage,
    and a proposed team — whatever that turn earned — not only
    spoken text.
  - **VOICE-AC-1.2** — A **mic glyph** on the turn (and on the
    conversation if any turn used voice) marks origin. The card is
    otherwise the same tree as text chat.

- **VOICE-US-2** — As a signed-in user, I want to hear the answer
  first and see the card fill in after, so speech is not blocked.
  - **VOICE-AC-2.1** — When speech ends, history already shows the
    spoken answer. If I am still on the thread, a visible
    “finishing card…” (or equivalent) state is shown until hydrate
    completes.
  - **VOICE-AC-2.2** — When hydrate completes, the same turn
    upgrades in place to the full card. It does not append a second
    assistant turn.
  - **VOICE-AC-2.3** — If I leave the thread, hydration still
    completes on the server/history path. When I return, I see the
    full card if it succeeded, or the spoken fallback if it did
    not.

- **VOICE-US-3** — As a signed-in user, I want a failed hydrate to
  keep what I heard and let me retry.
  - **VOICE-AC-3.1** — Given hydration fails (timeout, model error),
    when I look at the turn, then the spoken text and mic glyph
    remain, an honest “couldn’t build the full card” state is
    visible, and **Retry** is offered.
  - **VOICE-AC-3.2** — Retry never invents citations or tables on
    the failed card. A successful retry upgrades in place.
  - **VOICE-AC-3.3** — There is no automatic retry loop beyond what
    Retry starts.

### Voice rules

- **VOICE-BR-1 — Speech first, card second.** Hydration must not
  delay end-of-speech playback or force the user to wait before
  leaving.
- **VOICE-BR-2 — Same card contract as text.** A hydrated voice
  answer is a real `OakAnswer`, validated the same way. Thin
  transcripts are only the pre-hydrate and failed states.
- **VOICE-BR-3 — Origin is visible.** Mic glyph on the turn.
- **VOICE-BR-4 — Failure is spoken + retry.** Never fabricate
  structure.
- **VOICE-BR-5 — One active turn still wins.** If a new turn starts
  on that conversation while hydration is in flight, that hydration
  is cancelled and must not overwrite the new turn. The interrupted
  voice turn stays as spoken text + retry if it never landed a
  card.
- **VOICE-BR-6 — Voice stays signed-in only.** This pack does not
  add guest voice.

## Compact / full answer toggle

Personas: both. Preference storage differs.

- **COMPACT-US-1** — As a user, I want a compact default that keeps
  facts visible and tucks reasoning and sources away.
  - **COMPACT-AC-1.1** — In compact mode, the answer body, sprite
    cards, candidate table, damage readout, proposed team, and
    caveat / uncertainty / inference chrome stay visible.
    **Reasoning** and the **sources list** are collapsed.
  - **COMPACT-AC-1.2** — In full mode, reasoning and sources are
    expanded. This is **today’s** behavior.
  - **COMPACT-AC-1.3** — Someone who has never set a preference sees
    **full**.
  - **COMPACT-AC-1.4** — Signed-in preference is per-account and
    applies to every thread on every client after it syncs. Guest
    preference is **device-only** and dies with the session/app
    data the guest already has — it is not an account.
  - **COMPACT-AC-1.5** — A per-card override still expands or
    collapses reasoning/sources on that card without changing the
    account/device default.

- **COMPACT-US-2** — As a user, I want to set the default in Account
  (or the existing settings place for appearance).
  - **COMPACT-AC-2.1** — The compact/full default is a named
    preference, not a hidden gesture. Changing it updates the next
    (and already-rendered) cards on that client.

### Compact rules

- **COMPACT-BR-1 — Compact hides reasoning + sources only.** It must
  not hide the bottom-line answer, tables, calc, proposal, or
  caveat/uncertainty flags. Trust stays on the remaining card.
- **COMPACT-BR-2 — Default is full.** Compact is opt-in.
- **COMPACT-BR-3 — Per-card override does not write the default.**
- **COMPACT-BR-4 — Guests do not get a durable server preference.**

## Copy proposed team as Showdown paste

Personas: guest and signed-in.

- **PASTE-US-1** — As a guest or signed-in user, I want one tap on
  the proposal card to copy a Showdown paste so I do not open Teams.
  - **PASTE-AC-1.1** — Given an answer has a `proposed_team`, when I
    activate the copy control on that proposal card, then the
    clipboard receives the **same** Showdown text the team editor
    already exports for that roster.
  - **PASTE-AC-1.2** — Success is confirmed (toast or equivalent).
    The team is **not** saved. The Teams page is not opened.
  - **PASTE-AC-1.3** — Illegal / warned sets still copy
    (warn-but-allow). There is no blocking confirm in this pack.
  - **PASTE-AC-1.4** — This control is in addition to Chat QoL’s
    answer-level human copy, which may also include a Showdown
    paste. Both may exist.

### Paste rules

- **PASTE-BR-1 — Copy is not save.**
- **PASTE-BR-2 — Same paste as the editor.** No second dialect.
- **PASTE-BR-3 — Available to guests.** They can leave with the
  text; they still cannot save a team.

## Edge, empty, and failure states

- **Voice hydrate vs Stop:** if the user stops the voice turn before
  speech finishes, there is no card to hydrate (existing stop
  discards). If they stop after speech but during hydrate, the
  spoken turn remains and hydrate cancels; Retry may still be
  offered if the turn was persisted as spoken.
- **Compact on a voice spoken-only fallback:** there is no reasoning
  or sources to collapse; the spoken text stays visible.
- **Clipboard permission denied:** honest “couldn’t copy”; team
  still not saved.
- **No proposed team:** no Showdown control.

## Out of this file

Guest voice, voice picker/speed, push-to-talk, and saving the
proposed team from this copy control are out of scope.
