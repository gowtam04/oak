# Keep artifacts across sessions

Depends on: existing artifact viewer (amends **BR-AV-1** for a
narrow case), [calculator.md](./calculator.md),
[tables-and-compare.md](./tables-and-compare.md),
[auth-and-permissions.md](./auth-and-permissions.md),
[data-and-entities.md](./data-and-entities.md).

Personas: signed-in only.

## Why

Artifacts are ephemeral by design — session-only, not shareable. A
team sheet, compare, or calc the user wants to keep dies on relaunch.
This pack adds a **small per-conversation pin strip of snapshots**.
It is not a second product and not a global library.

## User stories

- **PIN-US-1** — As a signed-in user, I want to pin a rich artifact
  on this conversation so it is still here after I leave and come
  back.
  - **PIN-AC-1.1** — Given a team-sheet, comparison, or calc artifact
    is open, when I choose **Pin**, then it appears on that
    conversation’s pin strip and is still there after a full
    relaunch when I reopen the same conversation.
  - **PIN-AC-1.2** — Entity-detail artifacts (Pokémon, move, ability,
    item, type) have **no** Pin. Dex is their durable page.
  - **PIN-AC-1.3** — Candidate tables are not pinnable as artifacts.
    In-table row pin is unrelated (**TBL-BR-2**).
  - **PIN-AC-1.4** — Guests never see Pin and never get a strip
    after relaunch.

- **PIN-US-2** — As a signed-in user, I want pins to be snapshots, so
  what I saved is what I reopen.
  - **PIN-AC-2.1** — Given I pin a compare or calc, when I reopen it
    later, then I see the data as it was at pin time (inputs and
    displayed result), not a live re-read that might disagree.
  - **PIN-AC-2.2** — The strip sits on **this conversation only**.
    There is no account-wide artifact library.

- **PIN-US-3** — As a signed-in user, I want a small cap and an easy
  unpin.
  - **PIN-AC-3.1** — A conversation may have at most **five** pinned
    artifacts. A sixth Pin is refused with an explanation until I
    unpin one. The existing pin is not silently replaced.
  - **PIN-AC-3.2** — Unpin from the strip or from the open pinned
    artifact removes it immediately. No confirm sheet.
  - **PIN-AC-3.3** — Deleting the conversation deletes its pins.
  - **PIN-AC-3.4** — Tapping a strip item opens that snapshot in the
    viewer (one at a time, existing back-stack rules).

## Functional requirements

- Pin is an action on the open **rich** artifact (team sheet,
  comparison, calc) and a strip on the conversation chrome.
- Reopen after app relaunch, process restart of the **client**, and
  returning to the thread from history. Pins are account- and
  conversation-scoped.
- Live viewer state (unpinned back stack) remains session-only
  (**BR-AV-1** still applies to everything that is not pinned).

## Business rules

- **PIN-BR-1 — Signed-in, this conversation, snapshot.** No guest
  pins. No global library. No live refresh on reopen.
- **PIN-BR-2 — Rich types only.** Team sheet, comparison, calc.
- **PIN-BR-3 — Cap 5, refuse the 6th.** No silent replacement.
- **PIN-BR-4 — Unpin is immediate.** Strip or open artifact.
- **PIN-BR-5 — Conversation delete cascades.** Pins do not outlive
  the thread.
- **PIN-BR-6 — Amends viewer ephemerality only for pins.** Unpinned
  artifacts and the back stack still die with the session. One
  artifact visible at a time is unchanged (**BR-AV-4**).
- **PIN-BR-7 — Pins are not shares.** No public URL, no export of
  the pin strip.

## Edge, empty, and failure states

- **Empty strip:** no chrome that looks like a broken library. The
  strip is absent until the first pin.
- **Pin write fails:** the artifact stays open; an honest “couldn’t
  pin” message; the strip is unchanged.
- **Pinned snapshot cannot be rendered (corrupt / unknown type):**
  the strip item stays, opens an honest couldn’t-load state, and can
  still be unpinned.
- **Account deletion:** pins go with the account, same as teams and
  conversations.

## Out of this file

Account-wide library, sharing/export of artifacts, pinning entity
profiles, more than five pins, and live-refresh pins are out of
scope.
