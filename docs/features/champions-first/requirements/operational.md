# Champions-first — Operational, Constraints, Out of Scope

Non-functionals in user terms, cutover expectations, constraints, and hard exclusions. Depends on all other files in this folder.

## Non-functional

- **CF-OPS-BR-1** — Dex, Teams, Calc, and empty chat must work **without** live usage. Usage down never blocks those surfaces (CF-USAGE-AC-1.6).
- **CF-OPS-BR-2** — Live usage should feel like a normal page load when the source is healthy. If it is slow or down, fail to the honest empty/unavailable state rather than spinning indefinitely.
- **CF-OPS-BR-3** — After cutover, loading Dex or creating a team must not depend on other-generation data being present.
- **CF-OPS-BR-4** — Web, iOS, and Android must ship this product change **together**. Users must not see an eleven-scope chip on one client and Champions-only on another.
- **CF-OPS-BR-5** — Existing accessibility expectations remain (labels on the regulation chip, confirm dialogs, archive actions, Doubles/Singles control).
- **CF-OPS-BR-6** — Guest vs signed-in rate limits and spend controls stay as they are; this change does not add a new paid tier.

## Cutover and data removal

- **CF-OPS-US-1** — As a player, I want the app to contain only Champions Pokémon data after this change.
  - **CF-OPS-AC-1.1** — Given cutover has run, then Pokédex, moves, abilities, and items contain only current Champions-roster entities (CF-DEX-US-1, CF-DATA-BR-3).
  - **CF-OPS-AC-1.2** — Given cutover has run, then other-generation indexes, National Dex extras, wiki/location/Mystery Dungeon text, mainline encounter tables, and Smogon OU usage are **not** in the app’s reference data.
  - **CF-OPS-AC-1.3** — Given cutover has run, then non-Champions teams are in Archived (CF-TEAM-US-5) without a manual migration step from the user.
  - **CF-OPS-AC-1.4** — Given cutover has run, then a new chat cannot be answered from deleted other-game data even if the user names that game (CF-CHAT-US-2).
  - **CF-OPS-AC-1.5** — Chat transcripts, account records, and frozen shares are **not** wiped. Only reference data and living-team format are in scope for removal/archive.

## Reliability and honesty

- **CF-OPS-BR-7** — If Champions reference data itself is missing, Oak says it cannot answer from data. It does not guess roster facts.
- **CF-OPS-BR-8** — Usage figures always carry snapshot/uncertainty language (CF-INT-BR-5).
- **CF-OPS-BR-9** — Omni Ring and any other Champions fact not in our data are admitted as missing, not invented.

## Constraints and preferences

- Keep the existing three clients and the existing guest + email-OTP accounts.
- Keep reasoned, cited answers as the chat product (do not replace chat with a silent Dex).
- Keep warn-but-allow on teams.
- Keep operator admin, including item allowlist (CF-AS-7).
- Do not rename the app (CF-AS-9).
- Do not redesign the visual system (CF-AS-8).
- Regulation history as a picker is out (no data); chip is current only.
- Android Voice **mic session** is not added here (CF-UI-BR-5).

## Success / launch bar

This change is launchable when CF-SC-1 through CF-SC-7 in `overview.md` hold on **web, iOS, and Android**, cutover has removed non-Champions reference data (CF-OPS-US-1), and store/site copy matches (CF-INT-BR-10).

## Out of scope

Treat as a hard boundary. A builder must not invent these to fill a gap.

- Other games as a selectable mode (National Dex, Scarlet/Violet, Gens 1–8).
- Answering other-game, wiki, Mystery Dungeon, glitch, walkthrough, or catch-location questions.
- Scarlet/Violet or National Dex fallback for off-roster names (“exists in mainline”).
- Smogon OU (or any non-Champions ladder) as a page, tool, or threat board.
- Historical regulation picker or per-past-reg team formats as a user feature.
- Standalone type-chart page (not requested).
- Live in-battle co-pilot / replay analysis.
- Rewriting or deleting old chat transcripts.
- Converting archived teams into living Champions teams in this change (no “rebuild as Champions” action).
- New onboarding tutorial.
- Visual redesign or rename.
- New voice client on Android.
- Official Pokémon Company usage API (not assumed).
- Tournament standings integrations.
- Making Voice available to guests.

## Open questions

None remaining from discovery. Later regulation-rotation **product** extras (e.g. notifying users that a living team became illegal) are not specified; warn-but-allow on next open/save is the rule (CF-DATA-BR-2).
