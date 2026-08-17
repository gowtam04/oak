# Operational, constraints, and open questions

## Non-functional requirements

- **Platform.** Web, iOS, and Android in the **same change** for
  every user-facing behavior in this pack. Server-only pieces
  (citation links on stored answers, pins, voice hydration, account
  compact preference) still need a check that all three clients
  consume them and do not reimplement a thinner local-only version.
- **Performance.** Calculator compute and table sort/filter must
  feel instant on a typical personal result (no model). Opening
  Open in Dex is ordinary Dex navigation. Pin reopen is a snapshot
  read, not a tool loop. Voice hydration must not stall speech
  end (**VOICE-BR-1**). Artifact highlight + open should stay in
  the same snappy band as today’s viewer open.
- **Reliability.** A failed add, pin, copy, hydrate, or calc-index
  read never corrupts the conversation or invents numbers
  (**CALC-BR-8**, **VOICE-BR-4**, **ADD** write-fail). Hydration
  must not overwrite a newer turn (**VOICE-BR-5**).
- **Privacy / security.** Pins and compact preference are
  owner-only. Snapshots stay inside the owner’s conversation —
  same class as thread history, including existing operator read
  access. This pack does not create public artifact URLs.
- **Accessibility.** See [ui-and-experience.md](./ui-and-experience.md).
- **Scale.** Personal-account volume. Calculator traffic is index
  reads + local math, not a new model farm. Voice hydration is one
  follow-on compile per voice turn, still under existing turn /
  rate-limit caps.
- **Compliance.** Account deletion already deletes conversations
  and teams; pins and compact preference go with the account.
  Guest device compact preference is not personal data Oak stores
  server-side.

## Constraints and preferences

- Existing stack and three clients. Do not add a second app or a
  second agent loop for ordinary calc/compare/table work.
- **Do not expand the twenty-tool chat contract** to “run the
  calculator.” The calculator is a UI + formulas + index-read
  surface. Explain-this-calc is a normal user message.
- Citation-to-claim links on **new** answers may require the
  answer payload to carry those links. That is allowed. It must
  not become a `submit_answer` validity gate (**CIT-BR-3**).
- Artifact viewer rules stay except **PIN-BR-6** (pins amend
  session-only for rich snapshots). One-at-a-time and
  user-triggered-only stay.
- Team builder warn-but-allow and Showdown paste dialect stay.
  Add to team does not invent a second validator.
- **Chat QoL supersession:** this pack **owns** `/calc` (handled
  slash, not unknown text) and the calculator / add-to-team
  surfaces Chat QoL listed as out of scope. Do not re-forbid them
  in that pack when implementing this one; update Chat QoL slash
  text so `/calc` is known once this ships.
- Games-only policy unchanged.
- Background-turns rules stay: one turn per conversation; Stop
  discards; disconnect does not cancel. Explain-this-calc is a
  real turn. `/calc` is not.
- Images stay consume-on-turn. This pack does not persist images.
- Technical preferences stated by the product: honest estimate
  subset (weather, screens, listed items); old-gen caveat rather
  than block; snapshot pins; TSV not CSV; Dex scope follows the
  artifact; hops open calc overlay; nav opens full Calculator.

## Rate limits and costing

- Calculator edits, compares, table tools, Dex hops, Add to team,
  Pin, and Showdown copy are **not** asks.
- **Explain this calc** is a completed ask if the turn completes.
- **Voice hydration** is part of finishing a voice turn. Product
  intent: the user already paid for the voice turn; hydration
  should not count as a second guest/signed-in “ask” on the
  visible rate-limit. If implementation must consume model time,
  it still must not look like a second user message in history.
  Architecture should call out the costing choice; do not invent
  a second limiter here.
- A **Retry** on a failed hydrate is user-initiated follow-on work
  on the same turn, not a new conversation row.

## Operational expectations

- No new email, push, or cron is required for this pack.
- No moderation staffing. Pins are private.
- Privacy / operator-access disclosure does not need a new public
  surface; operator read of hydrated voice cards and pins-as-
  conversation-data should match existing thread disclosure. If
  legal copy currently says voice is “transcript only,” update it
  so it is not a lie after hydration.
- Chat QoL slash docs / tests that assert `/calc` is unknown must
  be updated when `/calc` ships.

## Open questions

None that block architecture. The following are implementation
choice, not product unknowns:

- **AA-OQ-1 — Hydration mechanism.** Compile from tools voice
  already called vs a short text compile turn. Product only
  requires a real `OakAnswer` after speech, in place, with retry
  on failure. Architecture picks the path and the costing note
  above.
- **AA-OQ-2 — Common defensive spreads.** Exact three columns
  (min / bulky / max) may reuse an existing analysis convention.
  Product requires a short table only while defender EVs are
  still default.
- **AA-OQ-3 — Add-to-team control chrome.** Row overflow vs
  always-visible verb is a design-system detail as long as the
  action exists on every structured Pokémon without opening the
  viewer first.

If a later review wants to change supported calc items, pin cap,
or old-gen “caveat vs block,” those are product changes — do not
quietly expand toward Smogon-calc parity.

## Out of scope (repeat of the hard boundary)

See [overview.md](./overview.md). In particular: no standalone
Compare page, no artifact library, no CSV file, no guest Add/Pin,
no 3+ compare, no Smogon-calc parity, no entity-profile pins, no
other new slashes, no stat/catch/breed calcs, no public share
links in this pack.
