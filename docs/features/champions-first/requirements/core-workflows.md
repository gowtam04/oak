# Champions-first — Core Workflows

Personas: Champions player (guest or signed-in), returning account holder. Entities: see `data-and-entities.md`. Depends on: `auth-and-permissions.md` for guest vs signed-in gates.

Every acceptance criterion is observable on **web, iOS, and Android** unless a criterion names a single surface (there are none in this file that are web-only).

---

## Chat — new conversation

- **CF-CHAT-US-1** — As a player, I want a new chat to be Pokémon Champions for the current regulation, so that I never have to pick a game.
  - **CF-CHAT-AC-1.1** — Given I open a new chat (guest or signed-in), when the empty state renders, then there is no generation / National Dex / Scarlet-Violet scope picker.
  - **CF-CHAT-AC-1.2** — Given that empty state, then a regulation chip shows the **current** Champions regulation name (display only; it is not a menu of games or past regulations).
  - **CF-CHAT-AC-1.3** — Given that empty state, then starter prompts are all valid Champions questions (battle, Dex, rules, meta). None mention other generations, Mystery Dungeon, glitches, catch locations, Tera, or Smogon OU.
  - **CF-CHAT-AC-1.4** — Given I send a Champions-legal question (e.g. a Stat Point spread, a roster species’ matchup, “build a rain team”), then Oak answers from Champions data and the regulation chip still shows the current regulation.

- **CF-CHAT-US-2** — As a player, I want off-roster and other-game questions declined clearly, so that I am not given another game’s facts by mistake.
  - **CF-CHAT-AC-2.1** — Given I name a Pokémon, move, ability, or item that is **not** on the current Champions roster, when Oak replies, then the reply **names that entity** and **says it is not in the Champions roster**, and does not include other-game stats, learnsets, usage, or locations for it.
  - **CF-CHAT-AC-2.2** — Given I ask about another game or generation (e.g. “in Gen 5”, “Scarlet and Violet”, “National Dex”, “Mystery Dungeon”, a named mainline title), when Oak replies, then it declines: Oak covers Pokémon Champions (current regulation) only, and does not answer from that other game.
  - **CF-CHAT-AC-2.3** — Given I ask a franchise-media question (anime, movies, TV, manga), when Oak replies, then it declines (games-only, and this product is Champions-only).
  - **CF-CHAT-AC-2.4** — Given I ask where to catch a species in a mainline game, when Oak replies, then it declines (no catch/location product).
  - **CF-CHAT-AC-2.5** — Given a decline in CF-CHAT-AC-2.1–2.4, then Oak may offer to help with a Champions question (e.g. a legal substitute while team-building) but must not fetch or display non-Champions reference data.

**Empty:** empty chat shows starters + regulation chip (CF-CHAT-US-1).  
**Failure:** if Champions reference data is unavailable, Oak says it cannot answer from data right now — it does not silently fall back to another game.

---

## Chat — existing threads

- **CF-CHAT-US-3** — As a returning user, I want old threads to keep their written answers, and new messages to be Champions, so that history is not rewritten.
  - **CF-CHAT-AC-3.1** — Given a conversation that previously ran in another game (e.g. Gen 7, National Dex), when I open it, then the existing user and assistant messages render as stored (not regenerated).
  - **CF-CHAT-AC-3.2** — Given that conversation, when I send a **new** message, then that turn is answered as Champions (current regulation), including the decline rule in CF-CHAT-US-2.
  - **CF-CHAT-AC-3.3** — Given I send that new message, then the conversation is treated as a Champions thread from then on (no sticky other-game scope).
  - **CF-CHAT-AC-3.4** — Given I @mention a team, then only **living Champions teams** are offered. Archived other-format teams do not appear and cannot be bound.

---

## Teams — living Champions teams

- **CF-TEAM-US-1** — As a signed-in player, I want to create and edit a Champions team with Stat Points, so that the editor matches the game.
  - **CF-TEAM-AC-1.1** — Given I create a new team, then it is a Champions team for the current regulation. There is no format picker listing other games.
  - **CF-TEAM-AC-1.2** — Given a team slot, I can set species, ability, held item, up to four moves, nature, and Stat Points per stat. There is **no Tera** field, **no IV** knobs, and **no level** knob (level is 50).
  - **CF-TEAM-AC-1.3** — Given Stat Points, the budget is **66 total** and **max 32 in any one stat**. A running total is visible while editing.
  - **CF-TEAM-AC-1.4** — Given I pick species, ability, move, or item, then choices are only current Champions-roster entities (including Megas as their own species).
  - **CF-TEAM-AC-1.5** — Given a Mega species, a held item other than its mega stone is flagged as illegal. A non-Mega holding a mega stone is flagged as illegal.
  - **CF-TEAM-AC-1.6** — Given I save with Stat Points over 66, over 32 in one stat, an incomplete slot, a duplicate species, a duplicate item (item clause), or a move/ability/item not legal for that species in Champions, then **save succeeds** and each problem is a warning on the slot and a team-level summary (warn-but-allow).
  - **CF-TEAM-AC-1.7** — Given the Teams list, then it shows **living Champions teams** by default. Other-format teams are not in this list.

- **CF-TEAM-US-2** — As a signed-in player, I want chat and Teams Assistant to propose Champions teams I apply myself, so that nothing is saved until I say so.
  - **CF-TEAM-AC-2.1** — Given I ask to “build me a rain team” (or similar) in chat or Teams Assistant, then the proposal uses Champions-roster species, Stat Points (not 252 EVs), no Tera, level 50, and Champions-legal moves/items.
  - **CF-TEAM-AC-2.2** — Given a proposal, when I take no action, then no saved team is created or mutated.
  - **CF-TEAM-AC-2.3** — Given a proposal that includes an entity not on the Champions roster, then that entity is not presented as usable; it is flagged not in the Champions roster (the agent must not treat another game as a fallback).

- **CF-TEAM-US-3** — As a signed-in player, I want to paste a Showdown / Scarlet-Violet team and get a Champions team, so that I can bring sets in without a second tool.
  - **CF-TEAM-AC-3.1** — Given I import a paste that includes Tera, when import finishes, then Tera is dropped (not stored, not shown).
  - **CF-TEAM-AC-3.2** — Given the paste has EV numbers, then those numbers are stored as Stat Points. If any stat is over 32 or the total is over 66, the team is saved with warnings naming the rule.
  - **CF-TEAM-AC-3.3** — Given a species, move, ability, or item in the paste that is not on the Champions roster, then it remains on the slot as stored text and is flagged **not in the Champions roster**. The import is not rejected.
  - **CF-TEAM-AC-3.4** — Given I export a living Champions team, then the paste round-trips species/ability/item/moves/nature/Stat Points (Stat Points ride in the EV fields of the paste). Tera is absent. Level is 50.

- **CF-TEAM-US-4** — As a signed-in player, I want a live-meta threat board on a living team, so that analysis matches the current Champions ladder.
  - **CF-TEAM-AC-4.1** — Given I open analysis on a living Champions team and live usage is available, then the threat board is built from **current Champions usage** (Doubles ladder unless the usage surface is showing Singles — default Doubles), not Smogon OU or another game.
  - **CF-TEAM-AC-4.2** — Given live usage is unavailable, then analysis says usage is unavailable. It does not substitute another game’s ladder. Coverage notes that do not need usage may still appear.

**Empty:** no living teams → empty living list plus a way to create or import.  
**Permission:** guest opening Teams is asked to sign in; no team is created.  
**Conflict:** species clause and item clause warnings do not block save (CF-TEAM-AC-1.6).

---

## Teams — archive

- **CF-TEAM-US-5** — As a returning user, I want other-format teams archived, so that they are not living Champions teams and are not lost.
  - **CF-TEAM-AC-5.1** — Given I had teams whose format was not Champions, after this change those teams appear only in an **Archived** section, not in the living list.
  - **CF-TEAM-AC-5.2** — Given an archived team, I can **view** it and **delete** it (delete still asks for confirmation and is permanent).
  - **CF-TEAM-AC-5.3** — Given an archived team, I cannot edit slots, cannot duplicate it into a living team, cannot apply a usage set onto it, cannot bind it to a new or existing chat, and cannot use it in Teams Assistant.
  - **CF-TEAM-AC-5.4** — Given I view an archived team, then stored names/spreads render. Each species/move/ability/item that is not on the current Champions roster is labeled **not in the Champions roster**. Oak does not look up other-game Dex data for those names.
  - **CF-TEAM-AC-5.5** — Given I have no archived teams, then the Archived section is empty (or omitted). It does not error.

---

## Apply usage set

- **CF-TEAM-US-6** — As a signed-in player, I want to apply a live Champions usage set onto a team slot from every place I already put a Pokémon on a team.
  - **CF-TEAM-AC-6.1** — Given a Champions species that has a usage set, then **Apply this Champions set** is available from: the team editor (empty or filled slot), the usage species drill-in, the Dex species view, a Pokémon artifact, place-on-team, and a chat proposed-team / place-on-team flow.
  - **CF-TEAM-AC-6.2** — Given I apply onto an **empty** slot (and I have chosen a living team), then the slot is filled with species, ability, held item, up to four moves, nature, and Stat Points from the usage set. Level is 50. Tera is not set.
  - **CF-TEAM-AC-6.3** — Given I apply onto a **filled** slot, then Oak asks me to confirm replacing that slot. On confirm, the slot is replaced with the usage set (same fields as CF-TEAM-AC-6.2). On cancel, the slot is unchanged.
  - **CF-TEAM-AC-6.4** — Given I am a guest and I choose Apply, then I am asked to sign in. No team is mutated until I am signed in and complete apply.
  - **CF-TEAM-AC-6.5** — Given that species has **no** usage set (or usage is down), then Apply is not offered as a successful fill; Oak says usage is unavailable or that no set is listed. The slot is not emptied.
  - **CF-TEAM-AC-6.6** — Given the usage set includes a field Oak cannot map (missing item, fewer than four moves), then mapped fields are applied and missing fields are left empty with a warning — not invented from another game.

---

## Usage

- **CF-USAGE-US-1** — As a player, I want a public Champions usage leaderboard and species drill-in on every client, so that I can see the live ladder without chatting.
  - **CF-USAGE-AC-1.1** — Given I open Usage on web, iOS, or Android without signing in, then I see a Champions usage leaderboard. I am not redirected to sign in.
  - **CF-USAGE-AC-1.2** — Given I open Usage, then **Doubles** is selected. I can switch to **Singles**. That choice is not required to persist across visits (CF-AS-2).
  - **CF-USAGE-AC-1.3** — Given the leaderboard, then it is labeled as **live** Champions usage (not a monthly Smogon snapshot), with a visible as-of / season / fetched time.
  - **CF-USAGE-AC-1.4** — Given I open a species on the leaderboard, then I see a drill-in with usage-derived moves, items, abilities, natures, spreads, and teammates to the extent the source provides them, plus Apply (CF-TEAM-US-6) when signed-in paths allow.
  - **CF-USAGE-AC-1.5** — Given a species not on the Champions roster, then it does not appear on the leaderboard. There is no Smogon OU leaderboard.
  - **CF-USAGE-AC-1.6** — Given live usage is down or empty, then Usage shows an honest unavailable / empty state. Chat, Dex, Teams, and Calc still work.
  - **CF-USAGE-AC-1.7** — Given I open a former Smogon `/meta` address, then I reach Champions usage (not OU).

**Empty:** no rows → empty state, not a fake OU list.  
**Failure:** CF-USAGE-AC-1.6.

---

## Dex (Pokédex, moves, abilities, items)

- **CF-DEX-US-1** — As a player, I want Dex surfaces to list only Champions-roster entities, so that the reference matches the game I play.
  - **CF-DEX-AC-1.1** — Given I open the Pokédex (web reference pages, iOS Dex tab, Android Dex tab), then every species shown is on the current Champions roster (including Mega formes that are roster entries).
  - **CF-DEX-AC-1.2** — Given I open Moves, Abilities, or Items, then every entity shown is available in current Champions (items respect the operator allowlist / exclusions).
  - **CF-DEX-AC-1.3** — Given I search those lists for a name that is not on the roster, then I get no hit (or an empty result). Oak does not show a National Dex / other-game match.
  - **CF-DEX-AC-1.4** — Given I open a bookmarked URL for a species, move, ability, or item that is not on the roster, then the page is **not found** (404). It does not redirect to another game’s profile.
  - **CF-DEX-AC-1.5** — Given a Champions species page, then stats, types, abilities, and moveset are Champions data. There is no “also in Scarlet/Violet” or other-format chip.
  - **CF-DEX-AC-1.6** — Given a species page and live usage exists for that species, then usage may appear on the page (and Apply per CF-TEAM-US-6). If usage is down, the rest of the profile still renders.

**Empty:** search with no matches → empty results.  
**Edge:** Mega and base form are separate roster entries when both are legal.

---

## Calculator

- **CF-CALC-US-1** — As a player, I want damage and stat math to be Champions (Level 50, Stat Points), so that calcs match the game.
  - **CF-CALC-AC-1.1** — Given I open Calc, then there is no generation/format picker. Attacker and defender species pickers are Champions roster only.
  - **CF-CALC-AC-1.2** — Given a calc, then level is 50 and investment is Stat Points (66 / 32 rules as warnings, not a different formula). IVs are not a user knob (fixed 31).
  - **CF-CALC-AC-1.3** — Given I explain a calc into chat, then that turn is a Champions turn (CF-CHAT-US-1 / US-2).

---

## Voice

- **CF-VOICE-US-1** — As a signed-in player, I want spoken chat to be a Champions coach with the same decline rule.
  - **CF-VOICE-AC-1.1** — Given a guest, then Voice is not available (existing sign-in gate).
  - **CF-VOICE-AC-1.2** — Given a signed-in voice turn about Champions, then answers use Champions data (Stat Points, roster, live usage when asked).
  - **CF-VOICE-AC-1.3** — Given a voice turn that names an off-roster entity or another game, then Oak declines and says it is not in the Champions roster (same substance as CF-CHAT-US-2).
  - **CF-VOICE-AC-1.4** — Given a finished voice turn, then it is stored on the conversation as a Champions turn (readable in the same thread as text).

---

## Box paste and screenshots

- **CF-BOX-US-1** — As a player, I want to paste owned names or attach a Champions stats screenshot and get Champions results only.
  - **CF-BOX-AC-1.1** — Given I paste a list of names, then names on the Champions roster resolve; each name not on the roster is listed as **not in the Champions roster**. Oak does not attach other-game learnsets to those misses.
  - **CF-BOX-AC-1.2** — Given I attach a screenshot (team sheet or Champions stats screen), then Oak reads it as Champions (Stat Points = small column totaling 66; no Tera; Mega slug if Mega). Illegible parts are flagged as uncertainty.
  - **CF-BOX-AC-1.3** — Given a screenshot of another game’s team (Tera, 252 EVs, off-roster species), then Oak still treats the turn as Champions: off-roster names are declined/flagged not in the Champions roster; Tera is ignored; EV numbers are treated as Stat Points with warnings if they break 66/32.

---

## History, shares, search

- **CF-HIST-US-1** — As a signed-in player, I want history without a generation filter, and old public shares to stay frozen.
  - **CF-HIST-AC-1.1** — Given I open History, then there is **no** filter for National Dex, Scarlet/Violet, or Gens 1–8.
  - **CF-HIST-AC-1.2** — Given I search history, then search matches stored text (including old other-game answers). Search does not require other-game Dex data to display those hits.
  - **CF-HIST-AC-1.3** — Given a public share created before this change, when someone opens the share link, then the frozen snapshot still renders. It does not need current other-game reference data.
  - **CF-HIST-AC-1.4** — Given I share a new Champions answer, then the public page is Champions (regulation visible; no other-game scope chip).

**Permission:** guests have no durable history (existing).  
**Edge:** pinned turns, folders, export, fork remain; they do not restore other-game scope.
