# Champions-first — Integrations (business level)

What Oak must consume and interchange. Not endpoint or schema design. Depends on `data-and-entities.md`.

## Champions game data (roster and mechanics)

- **CF-INT-BR-1** — Oak’s species, moves, abilities, items, learnsets, and Champions battle math (Stat Points, level 50, fixed 31 IVs, Mega-only gimmick, status-rate differences as reflected in effect text) come from the **current Champions regulation** data the product already uses as its Champions source of truth.
- **CF-INT-BR-2** — When that source updates to a new regulation, the product’s current regulation name, roster, and chip follow it after the operator refreshes data. Historical regulations are not a user-facing integration.
- **CF-INT-BR-3** — Oak must not integrate other-generation Pokédex dumps, a National Dex warehouse, wiki/Mystery Dungeon corpora, or mainline encounter tables as product data after this change (CF-DATA-BR-3).

## Live Champions usage

- **CF-INT-BR-4** — Leaderboard, species drill-in, apply-set, and the living-team threat board use **live Champions ladder usage**, with Doubles as the official default and Singles as a second view.
- **CF-INT-BR-5** — Usage must be **cited and dated** in the UI and in chat answers that rest on it (season / as-of / fetched time, community source named). Numbers are a snapshot, not a guarantee of the next hour.
- **CF-INT-BR-6** — If the live usage source is down, slow, or missing a species, Oak says usage is unavailable or that no set is listed. It does not call a Smogon or other-game usage source as fallback.
- **CF-INT-BR-7** — Smogon monthly OU (or any non-Champions ladder) is **not** an integration after this change. Existing Smogon usage addresses become Champions usage (CF-USAGE-AC-1.7).

## Showdown paste interchange

- **CF-INT-BR-8** — Players can still paste and copy the popular Showdown text format. On the way **in**, Tera is dropped, EV numbers are Stat Points, off-roster names are flagged (CF-TEAM-US-3). On the way **out**, living Champions teams emit that paste with Stat Points in the EV fields, no Tera, level 50.

## Images

- **CF-INT-BR-9** — Attached images on a turn remain consume-on-turn for the model (existing). They are interpreted as Champions (stats screen, team sheet) per CF-BOX-US-1. Oak does not send images to a third-party recognition product beyond the existing chat models.

## Store and site copy

- **CF-INT-BR-10** — App Store listing and public site/landing copy must describe Oak as a Pokémon Champions coach in this same change (CF-AS-6): no “every generation”, no National Dex default, no Smogon OU as a feature.

## What is not an integration

- No live official Pokémon Company usage API is required (none is assumed to exist).
- No tournament-result provider (Limitless, etc.) in this change.
- No Omni Ring data: if asked, Oak says it is not in our data rather than inventing it (existing Champions honesty).
- No other-game wiki crawl.
