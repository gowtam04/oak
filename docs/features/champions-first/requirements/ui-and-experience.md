# Champions-first — UI and Experience

Tone: existing Enamel & Paper language (CF-AS-8). Name: Oak (CF-AS-9). Platforms: web, iOS, Android in the same change. Personas: guest and signed-in player.

## Product tone

- **CF-UI-BR-1** — Oak speaks as a **Champions coach**, not a whole-franchise Pokédex. Empty states, starters, landing, store subtitle, and decline copy all say Pokémon Champions (current regulation).
- **CF-UI-BR-2** — The phrase **“not in the Champions roster”** is the standard label for off-roster entities (declines, import warnings, archive rows, box misses, Dex empty search). Do not say “try Scarlet/Violet” or “switch scope.”

## Chrome that goes away

- **CF-UI-US-1** — As a player, I want no generation picker, so that the app cannot look like a multi-game Dex.
  - **CF-UI-AC-1.1** — Given chat, Dex, Teams, Calc, and Usage on web, iOS, and Android, then there is no control listing National Dex, Scarlet/Violet, or Gens 1–8.
  - **CF-UI-AC-1.2** — Given History, then there is no generation/format filter (CF-HIST-AC-1.1).
  - **CF-UI-AC-1.3** — Given a living team editor, then there is no Tera picker, no IV sliders, and no level slider.

## Regulation chip

- **CF-UI-US-2** — As a player, I want to see which regulation answers and teams are for.
  - **CF-UI-AC-2.1** — Given chat (empty and after a turn), Teams, and Usage, then a chip shows the current regulation name.
  - **CF-UI-AC-2.2** — Given I tap/click that chip, then it does **not** open a list of games or past regulations. It is informational (it may explain “current Champions regulation” in a non-switching affordance such as a tooltip or short note).
  - **CF-UI-AC-2.3** — Given the regulation rotates, then the chip label updates to the new current regulation on all three clients.

## Empty chat (first-run)

- **CF-UI-US-3** — As a new user, I want the empty desk to teach Champions, not “any Pokémon question.”
  - **CF-UI-AC-3.1** — Given a new chat, the empty state headline/supporting line is Champions-oriented (coach / teams / calcs / live usage). It does not mention locations, every generation, or Mystery Dungeon.
  - **CF-UI-AC-3.2** — Given starters, they match CF-CHAT-AC-1.3.
  - **CF-UI-AC-3.3** — There is no tutorial overlay or first-run wizard (CF-AS-12).

## Teams list and archive

- **CF-UI-US-4** — As a signed-in player, I want living teams and archive visually distinct.
  - **CF-UI-AC-4.1** — Given the Teams screen, living Champions teams are the primary list. Archived is a separate section (or equivalent clearly labeled group).
  - **CF-UI-AC-4.2** — Given an archived team row, actions are view and delete only. Edit, duplicate, apply set, and “use in chat” are absent.
  - **CF-UI-AC-4.3** — Given I open an archived team, off-roster names are labeled **not in the Champions roster** in place (CF-TEAM-AC-5.4).

## Apply-set confirmation

- **CF-UI-US-5** — As a signed-in player, I want a clear confirm before a filled slot is replaced.
  - **CF-UI-AC-5.1** — Given I choose Apply on a filled slot, then a confirm asks whether to replace that slot. It is yes/no, not a per-field diff (CF-AS-3).
  - **CF-UI-AC-5.2** — Given I cancel, then I return to the same slot unchanged.
  - **CF-UI-AC-5.3** — Given I confirm, then the slot shows the usage set (species, ability, item, moves, nature, Stat Points) at a glance without Tera.

## Usage surface

- **CF-UI-US-6** — As a player, I want Usage to feel like a live ladder, not Smogon OU.
  - **CF-UI-AC-6.1** — Given Usage, Doubles is the default tab/control; Singles is the other tab/control (CF-USAGE-AC-1.2).
  - **CF-UI-AC-6.2** — Given Usage, a live/as-of label is visible without opening a species.
  - **CF-UI-AC-6.3** — Given usage is down, the empty/unavailable copy is honest and does not show a stale OU board.
  - **CF-UI-AC-6.4** — Given web, iOS, and Android, Usage is a first-class place to go (nav, tab, or equivalent — not buried only as a slash on web).

## Dex and 404

- **CF-UI-US-7** — As a player, I want missing entities to look missing, not like another Dex.
  - **CF-UI-AC-7.1** — Given a 404 for a non-roster species/move/ability/item URL, then the not-found page does not list other-game suggestions.
  - **CF-UI-AC-7.2** — Given Dex search with no hits, then the empty state may say nothing on the Champions roster matched.

## Calc

- **CF-UI-US-8** — As a player, I want Calc to look like Champions, not a multi-format calculator.
  - **CF-UI-AC-8.1** — Given Calc, species fields autocomplete the Champions roster only. Investment controls are Stat Points. Level reads 50 and is not a free knob.

## Copy surfaces that must change

- **CF-UI-BR-3** — Landing / SEO intro, FAQ, and store listing must not claim eleven (or six) scopes, National Dex default, Gens 1–4 out/in, or Smogon OU. FAQ may still explain what Pokémon Champions is, and that Oak is **only** that game.
- **CF-UI-BR-4** — Privacy and disclaimer lines stay: independent fan project, not affiliated with Nintendo / Game Freak / Creatures / TPC.

## Responsive and parity

- **CF-UI-BR-5** — Desktop and mobile web, iOS, and Android show the same capabilities in this change (chat, teams + archive, Dex, calc, usage, apply set, regulation chip, decline). Voice remains signed-in on clients that already have it (web and iOS); Android stays display-only for voice-origin cards if it still has no mic session — **do not** add a new voice client as part of this change.
- **CF-UI-BR-6** — Layout and styling follow the existing design system. Check both compact and wide layouts for: empty chat, usage leaderboard, team editor Stat Points, archive section, apply confirm, 404.

## Answer card

- **CF-UI-BR-7** — Declines still use the normal answer card (reasoning, citations if any, uncertainty). They are not a special error toast that hides the explanation. The regulation chip on the turn is Champions / current regulation, not the other game the user named.
