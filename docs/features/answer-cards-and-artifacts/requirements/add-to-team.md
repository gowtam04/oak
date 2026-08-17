# Add this Pokémon to a team

Depends on: [auth-and-permissions.md](./auth-and-permissions.md),
[data-and-entities.md](./data-and-entities.md). Touches saved **Team**
and **Team slot** from the team-builder spec.

Personas: signed-in user only.

## Why

The hop from a structured Pokémon on an answer to a slot on a saved
team does not exist. The user has to leave chat, open Teams, and
re-find the species.

## User stories

- **ADD-US-1** — As a signed-in user, I want to add a Pokémon I am
  looking at to a saved team so I do not retype the species in the
  editor.
  - **ADD-AC-1.1** — Given I am signed in and a sprite card, candidate
    row, comparison cell, proposed-team member, or Pokémon artifact
    shows Garchomp, when I choose **Add to team** and pick a team that
    has an empty slot, then Garchomp is written into the first empty
    slot (slot 1–6 order) and the team editor opens focused on that
    slot.
  - **ADD-AC-1.2** — Given I am a guest, when I view those same
    surfaces, then **Add to team** is not visible and there is no
    equivalent control.
  - **ADD-AC-1.3** — Given the structured object already names set
    fields (ability, item, moves, nature, EVs, IVs, Tera, level), when
    I add, then those named fields are copied onto the slot. Fields
    the object does not name stay empty / default the same way a
    newly picked species does in the editor.
  - **ADD-AC-1.4** — Given the object is only a species (sprite or
    candidate row with no set), when I add, then the slot contains
    that species and an otherwise empty set.

- **ADD-US-2** — As a signed-in user, I want to pick which team
  receives the Pokémon, or create a new one, so I am not forced onto
  the wrong roster.
  - **ADD-AC-2.1** — Given I have one or more saved teams, when I
    choose Add to team, then I see those teams with an honest empty /
    full indication and a **Create new team** action.
  - **ADD-AC-2.2** — Given I choose Create new team, when I confirm,
    then a new team is saved on my account in the **current
    conversation scope** (the format the header chip / sticky scope
    is on), the species is written in slot 1 with ADD-AC-1.3/1.4
    fields, and the editor opens on slot 1. If I do not type a name,
    the existing team-builder default name is used.
  - **ADD-AC-2.3** — Given I have zero saved teams, when I choose Add
    to team, then the picker still opens and Create new team is
    available. I am not sent to an empty Teams page as the only path.
  - **ADD-AC-2.4** — Given I dismiss the picker without choosing, when
    I return to the answer, then no team has changed.

- **ADD-US-3** — As a signed-in user, I want a full team to offer
  replacement, not a silent refusal or an overwrite I did not pick.
  - **ADD-AC-3.1** — Given the chosen team has six members, when I
    pick that team, then I see the six members and must choose one to
    replace, or cancel.
  - **ADD-AC-3.2** — Given I pick a member to replace, when I confirm,
    then that slot is overwritten with the new species and copied
    fields, the previous member is gone from that slot, and the
    editor opens on that slot.
  - **ADD-AC-3.3** — Given I cancel the replace sheet, when I return,
    then the team is unchanged.

- **ADD-US-4** — As a signed-in user, I want format mismatches to
  warn, not block, consistent with the team builder.
  - **ADD-AC-4.1** — Given I add Miraidon to a Gen 5 team (or a Mega
    to a Scarlet/Violet team), when the write succeeds, then the
    editor opens on that slot and the existing legality / validity
    warnings are visible. The add is not refused.
  - **ADD-AC-4.2** — Given the species is legal in the team’s format,
    when I add, then no extra format warning is invented beyond what
    the editor already shows for that set.

## Functional requirements

- **Add to team** appears on every **structured Pokémon**: subject
  sprite cards, candidate-table rows, comparison cells, proposed-team
  members, and the open Pokémon artifact. It does not appear on
  unstructured names in prose.
- The action is **signed-in only** and **hidden** for guests
  (**AUTH-BR-1**).
- Picker lists **the caller’s teams only**, plus Create new team.
- Write path is the same team the user already edits on the Teams
  page. This pack does not add a second team store.
- After a successful write or replace, **navigate to the team editor
  focused on that slot**. Chat is left (native: push the editor;
  web: go to the team editor for that team/slot). The user finishes
  the set there.
- Add to team does **not** apply the proposed team as a whole and
  does **not** save a proposed team as a new team unless the user
  chose Create new team (one species) or later uses existing apply /
  import paths.

## Business rules

- **ADD-BR-1 — First empty slot.** “Next empty slot” means the lowest
  index in 1–6 that has no species. If none, the replace path
  (**ADD-US-3**) is required.
- **ADD-BR-2 — Copy only what the surface already has.** Do not invent
  a random legal set, a usage set, or Hidden Power at add time.
- **ADD-BR-3 — Warn-but-allow on format.** A species that is illegal
  or absent in the team’s format still writes. The editor shows the
  existing warnings. Do not auto-switch the team’s format.
- **ADD-BR-4 — Create-new uses current scope.** The new team’s format
  is the conversation’s current scope at tap time, not a guess from
  the species’ origin game.
- **ADD-BR-5 — One team write per confirm.** Cancel at any sheet
  leaves all teams unchanged.
- **ADD-BR-6 — Replace is explicit.** A full team is never mutated
  until the user names the slot to overwrite.

## Edge, empty, and failure states

- **No teams:** picker with only Create new team (**ADD-AC-2.3**).
- **Save / write fails:** stay on the picker or chat; show an honest
  “couldn’t add” message; no editor navigation; no partial slot that
  the Teams page does not also show.
- **Team deleted in another session between picker open and confirm:**
  honest “team is gone” state; no write; picker can be dismissed.
- **Turn still running:** Add to team on an already-rendered card
  remains available; it does not wait for or cancel the active turn.
- **Proposed-team member:** copies that member’s fields onto a
  **saved** team slot. It does not mutate the answer’s proposed team.

## Out of this file

Guest local teams, adding into the in-answer proposed team, and
“always fill a legal starter set” are out of scope (see
[overview.md](./overview.md)).
