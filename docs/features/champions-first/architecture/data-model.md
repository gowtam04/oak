# Champions-first — Data Model

Brownfield. Trace: `data-and-entities.md`. No new datastore.

## Textual ERD (after cutover)

```text
account 1--* conversation 1--* conversation_message
account 1--* team                    -- living if format='champions'
                                     -- archived if format≠'champions'
account 1--* shared_answer           -- frozen snapshots kept
account 1--0..* champions_item_exclusion   -- operator, global

pokemon / learnset / reference_cache / searchable_names / ingest_meta
  PK includes format; AFTER migration every row format='champions'

DROPPED: wiki_page, wiki_chunk, natdex_*, classic_encounters,
         pmd_recruits, meta_snapshot, meta_usage
```

## Entities

### Champions index row (`pokemon`, `learnset`, `reference_cache`, `searchable_names`)

Unchanged columns. **Invariant after migration:** `format = 'champions'` only.

- **Ownership:** global reference (not account-scoped)
- **Lifecycle:** ingest replace-per-format (DELETE champions + INSERT). Other formats are gone.
- **Requirement trace:** CF-DATA-BR-3, CF-DEX-US-1, CF-OPS-US-1

### Ingest meta

One row for `champions`. Other format rows deleted.

### Team

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | uuid text | yes | existing |
| account_id | text | yes | existing isolation |
| format | text | yes | **living** iff `"champions"`; any other stored Format value ⇒ **archived** (ADR-3) |
| name | text | yes | |
| members | JSON text | yes | `TeamMember[]`; living writes `tera_type: null`, `level: 50`, IVs 31; `evs` hold Stat Points |
| win_condition | text | no | unchanged |
| created_at / updated_at | epoch ms | yes | |

- **No `archived_at` column.** Archive is derived (ADR-3).
- **Permissions:** owner only; archived is view+delete (CF-TEAM-US-5).
- **Requirement trace:** CF-DATA-BR-9–15, CF-TEAM-US-1, CF-TEAM-US-5

### Conversation / messages / shares

Unchanged tables. `conversation.format` may still hold historical values; **new turns do not read it to pick a game** (always Champions). Messages are immutable. Shares stay frozen (CF-DATA-BR-18). History **must not** filter the list by `conversation.format` (CF-HIST-AC-1.1).

- **Requirement trace:** CF-DATA-BR-6–8, CF-CHAT-US-3, CF-HIST-US-1

### Account `last_used_scope` / `account_scope_mru`

Columns/tables may remain. **Writers and readers must not restore another game** (CF-DATA-BR-21). `GET /api/auth/me` reports `lastUsedScope: "champions"` (or omits picker data). Prefer stop writing MRU in the chat route.

### Champions item exclusion

Unchanged. Operator allowlist (CF-DATA-BR-20, CF-AS-7).

### Usage snapshot

**Not a Postgres entity.** Live, in-process cache on `usage-client` (ADR-5). Shape for API:

```text
UsageLeaderboard { ladder: "doubles"|"singles", season, fetched_at, available, rows[] }
UsageSpecies     { ...existing UsageData..., available }
```

- **Requirement trace:** CF-DATA-BR-16–17, CF-USAGE-US-1

### Current regulation

Still the constant `CHAMPIONS_REGULATION` in `formats.ts` (not a table). Chip reads it (CF-DATA-BR-1–2).

## Relationships

| From | To | Cardinality | Notes |
|------|-----|-------------|-------|
| account | team | 1..* | living + archived mixed; filter in repo |
| account | conversation | 1..* | no format filter in list API |
| team.members JSON | pokemon.id | logical | living: warn if slug missing from champions index; archive: label not in roster, no other-game lookup |
| usage-client | pokemon | logical | species must be on champions roster to show |

## Migrations And Seeds

**New migration `web/drizzle/0023_champions_only.sql` (name may increment if 0023 is taken — next after current max):**

1. `DELETE FROM pokemon WHERE format <> 'champions';` (repeat for `learnset`, `reference_cache`, `searchable_names`, `ingest_meta`).
2. `DROP TABLE IF EXISTS wiki_chunk;` then `wiki_page;` (chunk first if FK-like deps; these have no physical FKs — drop both).
3. `DROP TABLE IF EXISTS natdex_species, natdex_machines, natdex_moves, classic_encounters, pmd_recruits, meta_usage, meta_snapshot;`
4. Revoke/drop `oak_readonly` grants that named those tables (migration 0009/0012 follow-up) so leftover grants do not fail.
5. **Do not** UPDATE `team.format`. Non-champions rows become archived by definition.
6. **Do not** DELETE conversations, messages, shares, turn_record.

**After migrate in prod:** `npm run ingest -- --formats=champions` (wiki skip is irrelevant; wiki tables are gone).

**Seeds / tests:** `tools` and `eval` fixtures must ship a Champions partition. Remove National Dex / gen-1 / wiki seeds used only for dropped tools. `createPgSchema` still applies all migrations.

**Compatibility:** Old iOS/Android sending `scope_seed: "gen-7"` must still 200; server ignores seed (ADR-3). Old `GET /api/teams?format=scarlet-violet` returns that account’s **archived** SV teams only if we keep `?format=` for one release — **prefer** `?archived=1` as the archive list and treat unknown other-format filters as archive list for that format **or** 400. Spec: see `api-design.md` — `GET /api/teams` living only; `GET /api/teams?archived=1` all non-champions.
