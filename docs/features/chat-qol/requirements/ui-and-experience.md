# Chat QoL — UI and experience

Product-level. Visual language stays the existing Signal / native
chat chrome (`docs/design-system/`). This pack does not introduce a
new look.

**Platforms:** web, iOS, and Android for every surface except the
command palette and keyboard shortcuts (web only).

## Control placement

### Last turn only

| Control | Where |
|---|---|
| Retry | Last **assistant** card |
| Edit | Last **user** message |
| Undo | Just-sent **user** bubble, ~3 seconds |

### Any assistant card

| Control | Who sees it |
|---|---|
| Copy as human text | Guest and signed-in |
| Copy for agents | Unchanged, still present |
| Share | Signed-in |
| Pin / Unpin turn | Signed-in |
| Fork | Signed-in |

Stop remains the in-flight control on the composer/header.

### Suggestion chips

A single modest row under the assistant card when there is something
to hop to. Never a second toolbar of copy/share/retry.

### History (signed-in)

- Default list: non-archived conversations, pinned conversations still
  grouped at the top (**HIST-US-9**).
- Folder views + Unfiled + Archive.
- Multi-select for bulk delete / archive / unarchive / move.
- Per-conversation: existing rename, pin conversation, delete, plus
  folder + archive.

### Thread

- Pin strip only when the open conversation has at least one pin.
  Compact jump list at the top; tap scrolls to the card.
- Fork lands in the new conversation (replaces the open thread).

## Key screens

1. **Chat thread** — recovery, copy/share/pin/fork, chips, undo.
2. **Composer** — `@` autocomplete (signed-in), slash handling, scope
   chip in the header (existing).
3. **Scope picker** — signed-in MRU group then release-date; guests
   release-date only.
4. **Empty desk** — signed-in continue-last / last team / current
   scope + four starters; guests four starters.
5. **History list** — folders, archive, bulk (signed-in).
6. **Shared-by-me** — signed-in list of live links + revoke (Account
   or equivalent).
7. **Public share page** — question + answer card + Open in Oak; no
   app chrome that implies the viewer is in the owner’s thread.
   Human copy may be offered; Share/Pin/Fork/Retry/Edit are not.
8. **Share unavailable** — revoked or unknown URL.
9. **Web palette (`⌘K` / `Ctrl+K`)** and **`?` / Account shortcut
   list**.

## Interaction patterns

- Retry and edit keep the previous pair on screen until success, then
  replace it. Do not flash an empty hole.
- Missing images on retry/edit: a short, specific note on the
  composer or card — not a modal essay.
- Dead `@mention`: highlight in the composer and block send. Do not
  start a turn.
- Unknown slashes: no error toast; they send as text.
- Bulk delete: one confirm for the set. Bulk archive/move: no
  destructive confirm.
- Delete folder: confirm that chats will become unfiled, not deleted.
- Public Open in Oak with a proposed team: sign-in gate for guests,
  then a new team on **their** account. Without a team: land on the
  normal empty desk.

## Responsive and native

- Desktop web: palette + shortcuts + history sidebar folders.
- Narrow web / iOS / Android: same actions in card menus and history
  edit/select mode. No palette, no shortcut overlay.
- Native share: system share sheet for the public URL and for
  exported files. Web: copy URL + file download.
- Three-client rule: a card action that exists on web exists on iOS
  and Android unless this document marks it web-only.

## Empty, error, and deny states (summary)

| Situation | What the user sees |
|---|---|
| No pins | No strip |
| No chips to show | No chip row |
| No live shares | Shared-by-me empty state |
| Revoked share | Dedicated unavailable page |
| Guest on organize/share/export | Controls absent |
| Retry/edit failed or stopped | Previous pair still there |
| Rate limited on retry/edit | Existing limit message; previous pair stays |
| `/usage` on a client without usage | Message sends as text |
| New signed-in user, empty history | Starters only; no continue-last row |

## Tone

Same product: calm, games-only, no new mascot chrome, no “AI sparkle”
treatment on the new controls. Labels are verbs (“Retry”, “Share”,
“Fork”, “Archive”), not feature-brand names.

## Accessibility

- New controls have names that do not read as “button button.”
- Pin strip is a list of jump links, not unlabeled icons.
- Palette and shortcuts are documented and operable by keyboard on
  web. Composer focus must remain typable.
- Human copy and export must not depend on color-only structure;
  tables stay tables in Markdown/PDF.
- Honor existing Reduce Motion / Dynamic Type / semantic color bars
  on native. Do not add motion to undo or retry beyond existing
  answer-card appearance.

## References

Existing chat, answer card, history sidebar, scope chip, Dex, Teams,
and Account. Public share should feel like a **read-only answer
card**, not a second product.
