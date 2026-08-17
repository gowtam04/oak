# Candidate table tools, and keep-open compare

Depends on: existing candidate table and artifact viewer,
[persisted-artifacts.md](./persisted-artifacts.md),
[add-to-team.md](./add-to-team.md).

Personas: guest and signed-in (table tools and in-session compare).
Pin of a compare is signed-in only.

## Candidate table

Filter queries already return a truncated table. Some column sorting
may already exist. This pack makes the **shown set** operable.

- **TBL-US-1** — As a guest or signed-in user, I want to sort the
  rows I can already see so I can rank the preview without another
  question.
  - **TBL-AC-1.1** — Given a candidate table is on the card, when I
    sort a column, then only the currently shown rows reorder. Hidden
    remainder rows are not fetched.
  - **TBL-AC-1.2** — The “N of M” header stays honest after sort
    (same N, same M).

- **TBL-US-2** — As a guest or signed-in user, I want to filter the
  shown rows by type and by name.
  - **TBL-AC-2.1** — Given shown rows include Dragon and non-Dragon
    species, when I filter to Dragon, then only shown rows that have
    Dragon as a type remain visible. Hidden remainder is still not
    fetched.
  - **TBL-AC-2.2** — Given I type a name fragment, when it matches a
    subset of shown rows, then only those rows remain visible.
  - **TBL-AC-2.3** — Type filter and name search compose (AND).
  - **TBL-AC-2.4** — Clearing filters restores the full shown set
    (still not M).

- **TBL-US-3** — As a guest or signed-in user, I want to pin a row so
  it stays visible while I filter.
  - **TBL-AC-3.1** — Given I pin Garchomp’s row and then filter to a
    type Garchomp does not have, when the filter applies, then
    Garchomp’s row stays at the top of the table and the other
    visible rows are the filter matches from the shown set.
  - **TBL-AC-3.2** — Unpinning returns that row to normal filter
    rules. Pin is **in-table only** — it is not an account pin and
    it does not survive reload.

- **TBL-US-4** — As a guest or signed-in user, I want the shown
  (filtered) table on the clipboard as a spreadsheet paste.
  - **TBL-AC-4.1** — Given I choose the copy action, when it
    succeeds, then the clipboard holds **tab-separated** values of
    the columns and rows **as currently visible** (after sort,
    filter, including pinned rows). It pastes as separate columns in
    Sheets / Excel / Numbers.
  - **TBL-AC-4.2** — There is **no** CSV file download in this pack.
  - **TBL-AC-4.3** — Web copies to the clipboard. iOS and Android
    use the system share/copy sheet with the same TSV payload.
  - **TBL-AC-4.4** — An empty filtered set copies nothing useful and
    explains that there are no rows to copy.

### Table rules

- **TBL-BR-1 — Shown set only.** Sort, filter, pin-in-table, and TSV
  never expand `N` toward `M`. Truncation remains an honest preview.
- **TBL-BR-2 — Pin-in-table is not persist.** Unrelated to
  [persisted-artifacts.md](./persisted-artifacts.md).
- **TBL-BR-3 — TSV is the leave-the-app form.** No file, no
  Markdown-table copy as a required action.

Opening a row still opens the Pokémon artifact. Add to team on a row
is [add-to-team.md](./add-to-team.md).

## Keep-open compare

The viewer can already open a comparison **block the agent emitted**.
This pack adds a **user-started** two-subject compare that stays in
the viewer. There is **no** standalone Compare page.

- **CMP-US-1** — As a guest or signed-in user, I want to compare the
  Pokémon I am viewing with another species, optionally in another
  scope, and keep that beside the thread.
  - **CMP-AC-1.1** — Given a Pokémon artifact is open, when I choose
    **Compare with…** and pick a second species (and optionally a
    second scope), then the viewer shows a two-column comparison
    and stays open while I continue chatting.
  - **CMP-AC-1.2** — Picking the second subject does not require a
    chat turn.
  - **CMP-AC-1.3** — I can still open an answer’s comparison block
    into the viewer with the existing per-section control. That
    artifact is the same type.

- **CMP-US-2** — As a guest or signed-in user, I want any two
  species in any two scopes.
  - **CMP-AC-2.1** — Garchomp in Gen 4 vs Garchomp in Gen 9 is
    allowed. Each column shows its format tag.
  - **CMP-AC-2.2** — Garchomp in Scarlet/Violet vs Dragapult in
    Champions is allowed. Each column shows its format tag.
  - **CMP-AC-2.3** — Exactly two subjects. There is no third column
    in this pack. Starting a new compare replaces the current
    compare in the viewer (back stack still holds the previous
    artifact).

- **CMP-US-3** — As a guest or signed-in user, I want the compare to
  show stats, types, abilities, speed, movepool diff, and matchup
  diff.
  - **CMP-AC-3.1** — Both columns show base stats, typing, and
    abilities for that column’s format.
  - **CMP-AC-3.2** — Speed uses a stated default level/nature
    (visible on the artifact) unless a set was already on the
    originating card; then that set’s speed is used and labeled.
  - **CMP-AC-3.3** — Movepool is a **diff**: only A, only B, shared
    — not two dumped full lists.
  - **CMP-AC-3.4** — Offensive and defensive type-matchup diffs are
    shown so coverage holes are visible without a chat turn.

### Compare rules

- **CMP-BR-1 — Exactly two.** 3+ is out of scope.
- **CMP-BR-2 — Any two scopes.** Each column is tagged. Scope is not
  silently unified.
- **CMP-BR-3 — No standalone Compare destination.** Creation is
  Compare with… on a Pokémon artifact, or open-from-answer-block.
- **CMP-BR-4 — Not a chat turn.** Building or opening a compare does
  not call the agent.
- **CMP-BR-5 — One visible artifact still.** Compare uses the existing
  viewer. It does not add a second pane. Pinning a compare is
  [persisted-artifacts.md](./persisted-artifacts.md).

## Edge, empty, and failure states

- **Filter matches nothing (and no pinned row):** empty table state
  with a clear way to clear filters. N of M still refers to the
  unfiltered shown set vs total.
- **Second compare subject unresolved:** picker says so; current
  artifact stays; no half-compare.
- **Index unavailable for one column’s format:** that column shows
  couldn’t-load; the other column may still render.
- **Opening compare from an answer that compared 3+:** render the
  first two named subjects, or the pair the block already presents
  as primary. Do not invent a 3-column viewer.

## Out of this file

Standalone Compare page, `/compare`, CSV files, fetching the hidden
remainder of a truncated table, and 3+ subject compare are out of
scope.
