# Champions-first — Data and Entities

Business-level entities only. No storage design. Personas: all. Workflows: `core-workflows.md`.

## Entities

### Current regulation

The **current Champions regulation** is a named, product-wide fact (e.g. the regulation string shown on the chip). There is one current regulation at a time. Users cannot pick a past regulation.

- **CF-DATA-BR-1** — All new turns, living teams, Dex lists, calc pickers, usage, voice, box, and screenshots are for the **current** regulation.
- **CF-DATA-BR-2** — When the current regulation changes, the chip and new work follow the new name. Existing living teams are not deleted. Newly illegal pieces are **warnings** (warn-but-allow), not silent removal.

### Champions roster entity

A **roster entity** is a species (including a Mega as its own species), move, ability, or item that is available in the current Champions regulation. Items may be further restricted by the operator allowlist (CF-AS-7).

- **CF-DATA-BR-3** — After this change, the app’s **reference data** contains only Champions roster entities. It must not contain other-generation species, moves, abilities, or items, National Dex extras, Smogon OU usage rows, wiki/location/Mystery Dungeon text, or mainline encounter tables.
- **CF-DATA-BR-4** — A name that is not a roster entity is **not in the Champions roster**. That phrase is the user-facing label in declines, Dex search misses, import warnings, archive views, and box misses.
- **CF-DATA-BR-5** — Oak must not retrieve, cache, or display **other-game** Pokédex facts to “help” with an off-roster name (no Scarlet/Violet fallback, no National Dex profile, no “exists in mainline”).

### Conversation

A conversation is an ordered list of stored turns (user + assistant). Signed-in conversations persist; guest threads are per-session (existing).

- **CF-DATA-BR-6** — Stored messages are **immutable history**. Cutover does not rewrite old assistant answers.
- **CF-DATA-BR-7** — Every **new** turn after cutover is a Champions turn, including on conversations that used to be another game (CF-CHAT-AC-3.2, CF-CHAT-AC-3.3).
- **CF-DATA-BR-8** — Conversations no longer have a user-facing generation/format to filter or switch.

### Living team

A living team is a signed-in user’s Champions team of up to six slots. Slot fields: species, ability, held item, up to four moves, nature, Stat Points per stat. Level is always 50. Tera is not a field. IVs are not a field (fixed 31 in the game).

- **CF-DATA-BR-9** — New teams are living Champions teams only.
- **CF-DATA-BR-10** — Warn-but-allow: incomplete teams and legality/validity problems can be saved; each problem is visible (CF-TEAM-AC-1.6).
- **CF-DATA-BR-11** — A living team is account-scoped. Other accounts never see it.

### Archived team

An archived team is a team that existed in a **non-Champions** format before cutover.

- **CF-DATA-BR-12** — Cutover moves every non-Champions team into Archived. The user does not have to act.
- **CF-DATA-BR-13** — Archived teams stay account-scoped. They are view + delete only (CF-TEAM-US-5).
- **CF-DATA-BR-14** — Deleting an archived team is permanent after confirm. It does not delete chat transcripts that mentioned it.
- **CF-DATA-BR-15** — Champions teams are never placed in Archived just because they have warnings.

### Usage snapshot (live)

A usage snapshot is the current Champions ladder view: ladder kind (Doubles or Singles), as-of/season/fetched time, ranked species, and per-species set pieces (moves, items, abilities, natures, spreads, teammates) as the source provides.

- **CF-DATA-BR-16** — Usage in the product is **live Champions** usage only. Smogon monthly OU (and any other non-Champions ladder) is not a product entity after cutover.
- **CF-DATA-BR-17** — If the live source is missing or down, the entity is **unavailable**. Oak does not invent percentages or substitute another ladder.

### Public share snapshot

A share is an immutable public copy of one question + answer (existing).

- **CF-DATA-BR-18** — Shares created before cutover remain viewable as frozen snapshots without other-game reference data (CF-HIST-AC-1.3).
- **CF-DATA-BR-19** — New shares are Champions answers.

### Operator item allowlist

The operator maintains which held items are treated as available in Champions (rolling pool).

- **CF-DATA-BR-20** — An item excluded by the operator is **not in the Champions roster** for Dex, pickers, agent proposals, and legality warnings — even if a player has heard of it in the game.

### Account preference: last used game

- **CF-DATA-BR-21** — After cutover, there is no last-used **generation** preference that can reopen National Dex or Gens 1–8. New chats are Champions. Historical last-used other-game values must not restore an other-game mode.

## Relationships

```
Account (optional)
  ├── Conversations (signed-in)
  │     └── Turns (stored text; new turns always Champions)
  ├── Living teams (Champions)
  ├── Archived teams (former other-format)
  └── Shares (optional, frozen)

Current regulation ── applies to ── roster entities, living teams, new turns, Dex, calc, usage

Usage snapshot ── optional enrichment on ── roster species, living-team analysis, apply-set

Operator allowlist ── restricts ── item roster entities
```

## Lifecycle

| Entity | Created | Updated | Removed |
|--------|---------|---------|---------|
| Roster entity | When the current regulation’s Champions data is refreshed | On regulation / data refresh | Dropped from the app when no longer on the roster (CF-DATA-BR-3) |
| Living team | User create / import / apply proposal | User edit / apply set | User delete |
| Archived team | Cutover from non-Champions teams | Never (read-only) | User delete |
| Conversation | First message / new chat | New Champions turns appended | User delete (existing) |
| Usage snapshot | Fetched live when viewed or when analysis/apply needs it | Replaced by a newer live fetch | Not stored as a user object |
| Share | User share action | Revoke only (existing) | Revoke / existing retention |
