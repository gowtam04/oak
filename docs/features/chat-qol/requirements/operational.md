# Chat QoL — Operational, constraints, and open questions

## Non-functional requirements

- **Platform.** Web, iOS, and Android in the **same change** for every
  user-facing behavior except the command palette and keyboard
  shortcuts (web only). Server-only pieces still need a check that
  clients do not reimplement the old “forgotten chip pick” or
  agent-only copy locally.
- **Performance.** Retry/edit/undo must feel like starting or stopping
  an ordinary turn. Share **view** must render from the snapshot
  without a tool loop. History folder/archive/bulk must stay
  responsive at personal scale (same bar as chat-history). Palette
  search should feel instant over the user’s own conversations/teams
  plus the public Dex index.
- **Reliability.** A failed retry/edit must not delete the previous
  pair (**REC-BR-2**). A revoke must make the URL unavailable without
  a cache that keeps serving the card as if live (product: viewers
  must not keep seeing a revoked card as a current document; cache
  lifetime is an architecture concern bounded by that rule).
- **Privacy / security.** Share URLs are unguessable. Pages are
  **noindex**. Creating/revoking is owner-only. Public pages include
  user-authored questions — disclose that in privacy copy. No public
  report inbox in this pack. Existing operator read access to turns
  is unchanged.
- **Accessibility.** See [ui-and-experience.md](./ui-and-experience.md).
- **Scale.** Still one-operator, personal-account volume. Public share
  views must not start a model turn. Do not treat share pages as a
  growth loop that requires horizontal scale in this pack; they are
  read-only snapshots.
- **Compliance.** Account deletion already exists. This pack must say
  what happens to an account’s live shares on deletion (Open
  Question **CQ-OQ-1** if not already covered by deletion). Export is
  an owner download, not a GDPR zip of the whole account (that remains
  a separate catalog item).

## Constraints and preferences

- Existing stack and three clients. Do not add a second app or a
  second agent.
- Do not change the `OakAnswer` contract or the twenty-tool list
  except to **bind `@mention` teams** onto the current turn (same
  class as the former active-team binding).
- Do not persist images. Consume-on-turn stays.
- Do not add `/calc`, `/compare`, add-to-team, or a calculator surface.
- Games-only policy unchanged. A shared page can still show a
  declined-out-of-scope answer if that is what Oak returned.
- Background-turns rules stay: one turn per conversation, Stop
  discards, client disconnect does not cancel. Undo is an explicit
  Stop.
- Chat-history rules stay except where this pack extends them
  (folders, archive, per-turn pins, fork copy). **BR-H8** (permanent
  delete) still applies to bulk delete.
- Scope resolver precedence stays, except a chip pick is persisted
  immediately (**SCOPE-BR-1**).
- Technical preferences stated by the product: snapshot shares (not
  live reads); noindex; OG unfurl; system share sheets on native.

## Rate limits and costing

- A **completed** retry or edit is a completed ask. It counts like any
  other successful turn.
- An **undone or stopped** turn is not history and is not a completed
  answer. Product intent: it should not consume a “successful ask.”
  If today’s limiter decrements at POST time, architecture should
  preserve current behavior or fix it without making undo more
  expensive than Stop — do not invent a second limiter in this pack
  without calling that out.

## Operational expectations

- Privacy policy / operator-access disclosure updated for public
  snapshots (question + answer, noindex, owner revoke).
- Web `?` overlay or Account lists shortcuts when they ship.
- No new email, push, or cron is required for this pack.
- No moderation staffing model. Owner revoke is the control.

## Open questions

- **CQ-OQ-1 — Account deletion vs live shares.** When an account is
  deleted, do its live share URLs become unavailable immediately?
  Product lean: yes — deletion should not leave public user questions
  online with no owner to revoke. Confirm against the existing
  deletion implementation during architecture.
- **CQ-OQ-2 — Exact web key chords.** Actions are fixed
  (**NAV-US-2**). Bindings must be documented and must not steal
  composer typing. Specific chords are an implementation choice.
- **CQ-OQ-3 — Caps.** Max folders, max pins per conversation, max
  live shares per account, folder name length. Not decided in
  discovery. Architecture should pick generous personal-scale caps
  and document them; they are abuse backstops, not product features.
- **CQ-OQ-4 — Shared-by-me location.** Account tab vs a history
  subview. Either is fine if it is signed-in, list+revoke, and
  reachable without the original thread.
- **CQ-OQ-5 — Public-page copy.** Human copy on the public card is
  allowed (content is already public). If architecture wants the
  public page strictly read-only with no clipboard chrome, that is a
  small UX call and does not change share rules.
- **CQ-OQ-6 — Fork title string.** Example `{title} (fork)` is
  illustrative. Must be human-readable and distinct from the source.

## Assumptions

None. Discovery was not on the speed path.

## Out of scope

See [overview.md](./overview.md). Hard exclusions include persist
images, paste detection, saved prompts, semantic search, filter by
kind, visible rate-limit remaining, turn-still-running banner,
calculator/compare/add-to-team, indexable public Q&A, guest
share/export/organize, and native command palettes.
