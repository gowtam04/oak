# Champions regulation cutover

Runbook for moving Oak onto the **next** Pokémon Champions regulation. Not a
product spec. Do not bump npm `@pkmn/mods` as the roster clock.

## Source of truth

The Champions roster (species, abilities, items, moves, learnsets, FormatsData
legality) is a **pinned Pokémon Showdown git SHA**.

| What | Where |
|------|--------|
| Pin constant | `web/src/data/pkmn/showdown-pin.ts` → `SHOWDOWN_PIN` (`sha`, `dateUtc`, `regulation`, `reason`) |
| Vendored bytes | `web/vendor/pokemon-showdown/` (data-only) |
| License | MIT — `web/vendor/pokemon-showdown/LICENSE` |
| Fetch script | `web/scripts/sync-showdown-pin.sh` (the **only** network fetch; ingest and tests stay offline) |

Live pin (update this table when the pin moves):

```
sha:        524413e8415fe179781e9bbcc7c79a85543b3409
dateUtc:    2026-09-10T20:11:44Z
regulation: Regulation M-C
```

Never pin `master`. Always a 40-char SHA. Always record `dateUtc` in UTC.

## What `@pkmn` npm is now

- **`@pkmn/dex`** is the overlay engine: `Dex.mod` (Champions) and `Dex.forGen`
  (historical gen-scope). It is **not** the regulation clock.
- **`@pkmn/mods`** is **not** how Oak learns a new regulation. Do not
  `npm update @pkmn/mods` to “stay current.”
- **Champions bytes** come from the Showdown pin, loaded through
  `web/src/data/pkmn/gen-provider.ts`.
- **T15 / championsbattledata.com** is **usage only**. It does not define the
  roster.

## How to detect the next regulation (example: M-D)

Inspect **smogon/pokemon-showdown** (GitHub), not npm and not wiki lists.
`config/formats.ts` is **not** vendored — look at Showdown itself.

A new current regulation is ready to pin when all of these are true:

1. **`config/formats.ts`** — a format named like
   `[Gen 9 Champions] VGC 2026 Reg M-D` with `mod: 'champions'`.
2. **Previous current formats move off the live mod.** M-C ladders become
   `mod: 'championsregmc'`. (When M-C was current, M-B was snapshotted as
   `championsregmb`.)
3. **`data/mods/champions/formats-data.ts`** unbans the new ids (`isNonstandard`
   falsy). That file is the legality list, not the species bytes.
4. **Species bytes exist** for those ids: `data/pokedex.ts`, `data/abilities.ts`,
   `data/items.ts`, and Champions learnsets (`data/mods/champions/learnsets.ts`)
   for new formes.

If FormatsData unbans an id but pokedex/ability/item/learnset bytes are missing,
that is a **half-mod**. Do not pin it.

Prefer a SHA **after same-day hotfixes** (ability swaps, tier tags). The pin
date is the commit time, not the announcement day.

## Cutover steps

Work in this repo’s worktree. Commands that start with `./scripts` or `npx`
run from **`web/`**. Do not flip `CHAMPIONS_REGULATION` until step 6.

### 1. Identify the Showdown SHA

```bash
# On GitHub: smogon/pokemon-showdown commits that land the new regulation.
# Prefer a commit after same-day hotfixes, not the first formats.ts bump.
# Record the 40-char SHA and the commit date as UTC.
```

### 2. Update pin / vendor files

```bash
cd web
./scripts/sync-showdown-pin.sh <40-char-sha>
```

Then set `SHOWDOWN_PIN` in `src/data/pkmn/showdown-pin.ts` to that SHA, the pin
date UTC, the new regulation name, and a short reason. Confirm
`vendor/pokemon-showdown/SHA` matches.

### 3. Run gate tests

```bash
cd web
npx vitest run src/data/pkmn/gen-provider.test.ts src/data/pkmn/champions-pin.test.ts
```

Offline — no Docker, no Postgres. If these fail, stop.

### 4. Confirm every legal FormatsData id has non-empty species data (the gate)

Legal ⟺ `FormatsData[id].isNonstandard` is falsy. Each such id must resolve
through `Dex.mod` to a real species (`exists`, `num > 0`, types, ability,
non-zero base stats except Shedinja HP).

The pin tests encode this (roster size hundreds, not the full dex; named new
formes have real stats; no leftover Z-A abilities). When new formes land,
extend those id / ability assertions. A FormatsData-only unban is a **half-mod**.

### 5. Ingest

```bash
cd web && npm run ingest
# or, in Docker: npm run docker:ingest
```

Needs reachable Postgres. Default is Champions-only.

### 6. Set `CHAMPIONS_REGULATION`

In `web/src/data/formats.ts`, set `CHAMPIONS_REGULATION` to the new regulation
string (chip + prompts). Flip this **only** after steps 3–5 pass.

### 7. Grep the old regulation in tests and prompts

```bash
cd web
rg -n "Regulation M-C|Reg M-C" src test eval ../docs ../AGENTS.md ../CLAUDE.md ../README.md
```

Replace the previous regulation string (example above is M-C → M-D). Update
hardcoded pin-test ids/abilities. Do not leave chip, prompts, and pin
disagreeing.

### 8. Merge to `develop`

Merge the worktree branch into `develop`. **Deploy is a separate human step**
(`cd web && fly deploy` after prod ingest). This runbook does not deploy.

## Do not chip-flip if gates fail

`CHAMPIONS_REGULATION` is a product claim. If the pin tests fail, ingest fails,
or any legal FormatsData id lacks species data, **do not** change the chip.
A half-mod is a lie: Oak would coach a roster Showdown has not actually
published bytes for.

## Usage (T15) does not block roster cutover

Live usage stays **championsbattledata.com**. That feed may lag a season
behind the new regulation. Roster cutover still proceeds. Usage pages/T15
fail-soft (`available: false`) until the community source catches up. Do not
wait on usage to pin Showdown.

## If Showdown is late

Wait on **Showdown**, not Kirk / npm `@pkmn/mods`. Do not fill the roster from
wiki lists, Victory Road, Serebii, Bulbapedia, or PokeAPI. Keep the current
pin until Showdown’s `champions` mod has formats + FormatsData + species bytes.

## Pin policy

- Never a floating `master` (or branch name). Always a 40-char SHA.
- Always record `SHOWDOWN_PIN.dateUtc` as UTC (`YYYY-MM-DDTHH:MM:SSZ`).
- Always keep `vendor/pokemon-showdown/LICENSE` (MIT) next to the data files.
- Ingest never fetches; only `sync-showdown-pin.sh` does.
