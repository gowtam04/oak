# Oak v2 benchmark questions (user-provided, 2026-07-03)

The 28 questions the redesign must handle. Each maps to an answer layer; P7 turns these into golden eval cases (G26+). "Layer" legend: TYPED = existing T1–T17, SQL = T18 run_sql, WIKI = T19 search_wiki, WEB = T20 web_search, POLICY = prompt policy (no tool).

| # | Question | Layer(s) | Expected behavior |
|---|---|---|---|
| 1 | Which pokemon has the same natdex number as BST? | SQL | Query natdex_species where natdex = base_stat_total. |
| 2 | Name all route 1 birds | SQL+WIKI | classic_encounters per version route 1 + species filter; clarify which game if ambiguous. |
| 3 | How many type combinations are unique to a specific pokemon line? | SQL | Aggregation over species/types/evolution lines. |
| 4 | How many signature moves does Pikachu have? | SQL+WIKI | Learnset exclusivity query; define "signature" explicitly (inference flag). |
| 5 | Where do I get HM Fly in HG? | SQL+WIKI | natdex_machines (HGSS version group) + wiki location prose. |
| 6 | Which pokemon game sold the most copies? | WEB (+WIKI) | Live search; cite Nintendo IR/Wikipedia; note figures date. |
| 7 | How many pokemon are purple? | SQL | natdex_species color = purple, count + list. |
| 8 | Which pokemon are based off cats? | WIKI (+inference) | Wiki origin/design prose; flag as design-inspiration inference. |
| 9 | How many gym leaders are fire type? | WIKI | Wiki lists; clarify scope (all games?). |
| 10 | What was the fire fang bug in gen 3? | POLICY (false premise) | Reject premise: Fire Fang is Gen 4+ (natdex_moves proves it). No invented bug. |
| 11 | Which pokemon have led the guild in PMD? | WIKI (pmd) | Wigglytuff's Guild etc.; spin-offs are in scope via wiki. |
| 12 | Speed vs attack boosting nature for Garchomp in champions? | TYPED | Existing competitive path (stats/usage/damage calc). |
| 13 | How many pokemon has Ash caught in the anime? | WIKI | Ash's Pokémon list; note counting ambiguities (inference flag). |
| 14 | Which season of the anime are we on right now? | WEB | Live search; "as of" date in answer. |
| 15 | Movie with an iron marauder? | WIKI | Pokémon 4Ever (Iron-Masked Marauder) — fuzzy recall via wiki search. |
| 16 | Anime episode: island of giant pokemon? | WIKI | EP017 "Island of the Giant Pokémon". |
| 17 | Most populous cities in the mainline games? | WIKI | Wiki location prose; note in-game population is ill-defined (inference flag). |
| 18 | Which legendary is best? | POLICY (opinion) | Criteria-framed answer (BST/usage/format), not a bare opinion. |
| 19 | Pokemon with higher catch rate than pre-evolution? | SQL | capture_rate join across evolution chain. |
| 20 | Combined weight of Wailord and Skitty? | TYPED/SQL | Weights + arithmetic; trivial math shown. |
| 21 | When will winds and waves release? | WEB | Gen 10, announced 2026-02-27, releasing 2027 — must come from live search, dated. |
| 22 | Pokemon that go dual type → monotype on evolution? | SQL | Types across evolution chain comparison. |
| 23 | Is Oak dating Ash's mom? | WIKI (lore) | Fan-theory framing; what canon says; light tone acceptable. |
| 24 | I keep losing connection on Pokemon Champions — what's happening? | WEB | Live search (server status/known issues); honest uncertainty. |
| 25 | Cake recipe | POLICY (off-domain) | Graceful decline, stays in persona. |
| 26 | Which pokemon have been eaten in the anime/games? | WIKI | Prose trivia; cite episodes. |
| 27 | Why does Gamefreak suck? | POLICY (opinion/loaded) | Neutral reframe: common criticisms + counterpoints, no dunking. |
| 28 | Are encounter rates per route constant regardless of day? | SQL+WIKI | Time-of-day encounter mechanics per gen; flag classic_encounters partiality. |
| 29 | Best strategy to catch Feebas in gen 3? | WIKI (+SQL) | Tile mechanics prose (Route 119 changing tiles); Gen 3 now in scope. |
