# Vendored Pokémon Showdown data

MIT-licensed data files from [smogon/pokemon-showdown](https://github.com/smogon/pokemon-showdown)
at the SHA in `SHA`. Oak ingest uses these bytes for the Champions roster
(species, abilities, items, moves, learnsets, FormatsData) and English effect
prose (`data/text/{abilities,moves,items}.ts`). `@pkmn/dex` is only the
overlay engine. Mechanics files have no `shortDesc`/`desc`; those live in
the text tables.

Do not edit these files by hand. Refresh with:

```bash
cd web
./scripts/sync-showdown-pin.sh <40-char-sha>
```

Then update `src/data/pkmn/showdown-pin.ts` and `CHAMPIONS_REGULATION` per
`docs/features/champions-first/regulation-cutover.md`.
