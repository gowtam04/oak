# Oak for iPad — Teams Workbench

> iPad layout of the current team builder (library, full competitive sets,
> Showdown import/export, warn-but-allow validation, Teams Assistant,
> add-to-team, living Champions vs archive). Capability rules inherit the
> shipping iPhone Teams surface and `docs/features/iphone-app/requirements/history-and-teams.md`
> except **retired active-team** (M-TEAM-US-5) and except layout specified
> here. Personas: signed-in (content) and guest (gate). Depends on
> `shell-and-adaptation.md`.

## Guest

- **P-TEAM-US-1** — As a guest, I want Teams to look like a real
  destination I can unlock, not a broken empty library.
  - **P-TEAM-AC-1.1** — Teams remains in the sidebar. Opening it shows
    a **sign-in unlock** (centered panel via the existing unobtrusive
    action), not an empty list and not a hidden destination.
  - **P-TEAM-AC-1.2** — No team data from any account is shown.

## Library | canvas | slot inspector

- **P-TEAM-US-2** — As a signed-in user, I want to see my library, the
  open team as six slots, and the selected Pokémon’s full set at once,
  so editing is a workbench rather than a long phone form.
  - **P-TEAM-AC-2.1** — **Wide landscape:** three regions are visible
    together: **library** (saved teams), **team canvas** (up to six
    slots with species identity — sprite/name/item as iPhone already
    shows per slot), and **slot inspector** (the selected slot’s full
    set: ability, held item, four moves, nature, Stat Points / other
    fields the iPhone editor already exposes for that format).
  - **P-TEAM-AC-2.2** — Selecting a library row opens that team on the
    canvas without leaving Teams. Selecting a slot fills the inspector.
    An empty slot is selectable so the user can fill it.
  - **P-TEAM-AC-2.3** — **Portrait / stacked:** the library collapses
    (overlay, back-to-library, or compact column). The **canvas sits
    above** the slot inspector; the canvas keeps enough height that
    all six slots remain identifiable without hunting.
  - **P-TEAM-AC-2.4** — Creating a new team opens an empty canvas in
    the same workbench (not a phone-style pushed form that hides the
    library on wide layouts).
  - **P-TEAM-AC-2.5** — Living Champions teams and **archive** (non-
    Champions) remain distinct as on iPhone. Archive is reachable from
    the library; archived teams stay read-oriented per existing rules
    (including delete confirmation).

### Set completeness (parity, not new fields)

- **P-TEAM-AC-2.6** — Each slot can still specify everything the
  iPhone editor allows for that team’s format. For living Champions
  teams that includes species, ability, held item, four moves, nature,
  and **Stat Points** (66 total, max 32 per stat, Level 50) as the
  shipping product does — not a reduced iPad set.
- **P-TEAM-AC-2.7** — Warn-but-allow validation remains: illegal or
  incomplete details are **flagged in the inspector and/or canvas**
  and the team can still be saved (M-AC-T3.1).
- **P-TEAM-AC-2.8** — Naming, duplicating, deleting, and editing use
  the library and canvas actions. Pointer secondary-click matches
  iPhone context menus.

## Import, export, add-to-team

- **P-TEAM-US-3** — As a signed-in user, I want Showdown import/export
  and add-to-team to keep working, presented as iPad panels rather than
  phone sheets.
  - **P-TEAM-AC-3.1** — Import is a **centered panel** (paste Showdown
    text). A successful import produces a saved team and opens it on
    the canvas.
  - **P-TEAM-AC-3.2** — Any saved team can be exported to Showdown text
    that round-trips; copy/share uses the system share/clipboard as on
    iPhone.
  - **P-TEAM-AC-3.3** — Add-to-team (from an answer, inspector, or Dex
    profile) is a **centered panel**: pick a team, pick/replace a slot.
    After confirm, the app **switches to Teams** with that team on the
    canvas and that slot selected in the inspector.
  - **P-TEAM-AC-3.4** — A full team still offers replace-member; cancel
    does not write.

## Teams Assistant = companion chat

- **P-TEAM-US-4** — As a signed-in user, I want to draft or edit the
  open team conversationally without a second chat overlay.
  - **P-TEAM-AC-4.1** — The Teams Assistant control **reveals companion
    chat** (`P-SHELL-US-2`) with the **open team** on the context chip
    (`P-SHELL-AC-3.1`). There is no separate Assistant sheet/column.
  - **P-TEAM-AC-4.2** — The agent may still **propose** a team or edit
    as it does today. Applying a proposal is an **explicit user
    action** that writes storage (M-AC-T4.2). The canvas/inspector
    update to the written team after apply.
  - **P-TEAM-AC-4.3** — Companion remains the Chat destination’s
    current thread, not a per-team hidden thread (`P-SHELL-BR-2`).
  - **P-TEAM-AC-4.4** — If companion is already open when entering the
    editor, the context chip **switches to the open team**; the thread
    is not reset.

## Team analysis and other existing editor sections

- **P-TEAM-AC-5.1** — Any analysis / coverage / similar section the
  iPhone editor already shows remains available on the workbench
  (canvas or inspector region — it must be reachable without a phone
  scroll-of-death, and must not be dropped).
- **P-TEAM-AC-5.2** — Proposed-team blocks in chat still offer Copy
  Showdown and explicit save/apply, landing on this workbench when the
  user saves.

## Empty and error states

- **P-TEAM-AC-6.1** — Signed-in with **zero teams:** the library shows
  an empty state with New team and Import (same actions, tablet
  layout). The canvas is empty until one exists.
- **P-TEAM-AC-6.2** — Load/save/network failure uses the same
  recoverable error + retry pattern as iPhone Teams; it does not
  blank the sidebar.
- **P-TEAM-AC-6.3** — Offline: no local team cache beyond what iPhone
  already does; show the existing no-connection treatment
  (`operational.md`).

## Business rules

- **P-TEAM-BR-1** — Teams content is **signed-in only** (M-BR-T1
  equivalent). Guests see the unlock, not another account’s teams.
- **P-TEAM-BR-2** — **Per-account isolation.**
- **P-TEAM-BR-3** — **Warn-but-allow** save remains.
- **P-TEAM-BR-4** — **No active-team** selector. Teams are referenced
  by name in chat / via the context chip, consistent with the shipping
  product.
- **P-TEAM-BR-5** — Teams Assistant is **not** a distinct surface on
  iPad; it is companion chat with team context.
- **P-TEAM-BR-6** — Living vs archive remains the existing format
  split (`team.format === "champions"` vs not). No extra “iPad archive”
  product.

## Cross-links

- Companion and context chip: `shell-and-adaptation.md`
- Add-to-team from inspector/Dex: `chat-and-artifacts.md`,
  `reference-and-tools.md`
- Auth gate: `auth-and-permissions.md`
