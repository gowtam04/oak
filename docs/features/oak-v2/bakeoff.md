# Oak v2 — model bake-off runbook

Owner doc: docs/features/oak-v2/design.md §7/§8; this doc is the P7 handoff to
whoever runs the LIVE judged suite (the orchestrator, not the eval-expansion
agent — P7 does not run this itself, no real API keys were available to it).

> **Superseded (2026-07):** §4 below ("Ship the decision") describes flipping
> an `ACTIVE_MODEL` Fly secret. That secret is retired — the active production
> model is now an admin-panel **Settings** selection (`/admin/settings`,
> written to Postgres, resolved per turn, fail-soft to `grok-4.3`). Sections 1–3
> (running the judged suite via `eval/run.ts --model=…`) are unaffected.

Decides the final production model between **Grok 4.3**
(current default, `grok-4.3`) and **Claude Sonnet 5** (`claude`) by running the
full 54-case judged golden suite (`web/eval/cases.ts`) against both, live.
Cost was the reason Sonnet 5 was reverted to Grok on 2026-07-02 — this
bake-off is what makes the next model decision data-driven instead of a vibe
check.

The **deterministic 12-case subset** (G1/G3/G5/G6/G8/G11/G15/G26/G32/G35/G44/
G47) already gates every `npm test` run offline (mocked model, fixture DB) —
this runbook is ONLY for the LIVE judged run of all 54 cases.

## 1. Prerequisites

Run everything from `web/`.

**Env keys** (real, not the dummy Vitest placeholders):

| Key | Needed for | Notes |
|---|---|---|
| `XAI_API_KEY` | `src/env.ts` import (required at boot regardless of which model you're testing) | Real key even when only testing the Claude side. |
| `ANTHROPIC_API_KEY` | The judge (always Claude — `env.ANTHROPIC_MODEL`) AND the agent side when running `--model=claude` | One key covers both roles. |
| `TAVILY_API_KEY` | `web_search` (T20) cases (G31/G39/G46/G49, + G45's fallback) | Without it, every `web_search` call returns `{error:"search_unavailable"}` and those cases will predictably score low — that's a config problem, not a model signal. Set it before trusting WEB-layer scores. |
| `DATABASE_URL` | The live index (default target unless `--fixture`) | See §2 — must be a FULLY ingested index, not a bare migration. |

**Data**: the WIKI-layer cases (G27/G29/G30/G33/G34/G36/G38/G40/G41/G42/G45/
G48/G51/G53/G54 — anything tagged `"WIKI"` in `covers`) need the Fandom corpus
actually crawled and ingested, not just the schema:

```bash
npm run fetch:wiki   # crawls pokemon.fandom.com into .wiki-cache/ (gitignored, ~1.5s/page)
npm run ingest        # builds wiki_page/wiki_chunk (+ natdex_*, @pkmn) FROM that cache
```

Skipping `fetch:wiki` leaves `wiki_page`/`wiki_chunk` empty — `search_wiki`
then always returns `{results: []}` and every WIKI case fails on missing
citations/facts, regardless of model. Confirm the corpus populated before
trusting any WIKI-layer score:

```bash
npm run docker:psql -c "select count(*) from wiki_chunk;"   # expect > 0
```

The SQL-layer cases (anything tagged `"SQL"`) need the PokeAPI natdex tables,
which the ordinary `npm run ingest` already builds (`natdex_species`,
`natdex_machines`, `natdex_moves`, `classic_encounters`, `pmd_recruits`) — no
extra fetch step beyond the default `DEFAULT_FORMATS` ingest.

## 2. Run the suite once per model

`eval/run.ts` supports `--model=<key>` to A/B the AGENT model for a single
judged run without touching the production model selection (the judge always stays
on Claude, per `env.ANTHROPIC_MODEL` — this avoids same-family
self-preference bias). Valid `--model` keys are `grok-4.3` | `claude` |
`gpt-5.5` (`src/agent/models.ts` — NOT `claude-sonnet-5`, which is the
underlying Anthropic API model id, not the registry key).

```bash
# Grok 4.3 (current production default)
npx tsx eval/run.ts --model=grok-4.3 --json > /tmp/bakeoff-grok.json

# Claude Sonnet 5
npx tsx eval/run.ts --model=claude --json > /tmp/bakeoff-claude.json
```

Both commands default to the LIVE index (`DATABASE_URL`) — pass
`--live-index=<uri>` to point at a specific staging Postgres instead of the
one in your shell env. Add `--repeat=3` (or more) to each run if you also want
run-to-run variance (flaky vs. stable pass) per case — recommended given LLM
judged scoring is not perfectly deterministic itself.

To sanity-check the harness end-to-end on a couple of cases before committing
to a full 54-case run (each case = one live agent turn + one live judge call):

```bash
npx tsx eval/run.ts --model=grok-4.3 --case=G26,G31,G40
```

## 3. Results table (fill in per model)

Per-case pass/fail (`overallPass` in the JSON) and per-dimension rubric score
(0/1/2), for each model. Use `jq` against the `--json` output, e.g.:

```bash
jq -r '.results[] | [.caseId, .overallPass, (.scores | map("\(.dimension)=\(.score)") | join(" "))] | @tsv' /tmp/bakeoff-grok.json
```

| Case | BQ | Layer | Grok 4.3 pass | Grok correctness/inference/mechanics/scope/transparency | Claude pass | Claude correctness/inference/mechanics/scope/transparency |
|---|---|---|---|---|---|---|
| G1..G25 | (pre-v2) | mixed | | | | |
| G26 | BQ-1 | SQL | | | | |
| G27 | BQ-2 | SQL+WIKI | | | | |
| G28 | BQ-3 | SQL | | | | |
| G29 | BQ-4 | SQL+WIKI | | | | |
| G30 | BQ-5 | SQL+WIKI | | | | |
| G31 | BQ-6 | WEB | | | | |
| G32 | BQ-7 | SQL | | | | |
| G33 | BQ-8 | WIKI | | | | |
| G34 | BQ-9 | WIKI | | | | |
| G35 | BQ-10 | POLICY | | | | |
| G36 | BQ-11 | WIKI | | | | |
| G37 | BQ-12 | TYPED | | | | |
| G38 | BQ-13 | WIKI | | | | |
| G39 | BQ-14 | WEB | | | | |
| G40 | BQ-15 | WIKI | | | | |
| G41 | BQ-16 | WIKI | | | | |
| G42 | BQ-17 | WIKI | | | | |
| G43 | BQ-18 | POLICY | | | | |
| G44 | BQ-19 | SQL | | | | |
| G45 | BQ-20 | WIKI/WEB | | | | |
| G46 | BQ-21 | WEB | | | | |
| G47 | BQ-22 | SQL | | | | |
| G48 | BQ-23 | WIKI | | | | |
| G49 | BQ-24 | WEB | | | | |
| G50 | BQ-25 | POLICY | | | | |
| G51 | BQ-26 | WIKI | | | | |
| G52 | BQ-27 | POLICY | | | | |
| G53 | BQ-28 | SQL+WIKI | | | | |
| G54 | BQ-29 | WIKI+SQL | | | | |
| **Total** | | | **_/54** | avg: _/2 each dim | **_/54** | avg: _/2 each dim |

Also record, per model: total judge+agent wall time for the 54-case run, and
(if pricing data is available) an approximate per-run cost, to weigh against
the accuracy delta — this is exactly the cost-vs-accuracy tradeoff
`docs/features/admin-panel` estimates for production traffic
(`src/server/admin/pricing.ts` `MODEL_PRICING`), so pull the per-token rates
from there rather than re-deriving them.

## 4. Ship the decision

Once a model is chosen, set it as the production model in **Admin → Settings**
(`/admin/settings`) — pick the model and save. No redeploy or restart is
required; the selection is written to the `app_setting` table and read fresh
per turn via `factory.activeModelKey()` (fail-soft to `grok-4.3` if the row is
ever missing or invalid).

*(Historical: this used to be `fly secrets set ACTIVE_MODEL=grok-4.3` /
`ACTIVE_MODEL=claude`, validated by `src/env.ts` at boot. That secret is
retired — see the superseded note at the top of this doc.)*
