# Tools

Read-data tools (one queries the local index, seven fetch reference details, one
resolves names, two read the user's saved teams — `list_teams` lists them and
`get_team` loads one by id), two compute battle math, one emits the final answer,
and one writes (saves a team on approval). All read/compute tools are **read-only
and idempotent** — safe to retry in the loop. Tools return **structured errors the
model can reason about**, never raw exceptions.

> `get_encounters` (T14) was added later for catch-location / obtain-method data
> sourced from a committed PokeAPI snapshot. It is **standard-mode only**
> (Champions ships no encounter data; the tool returns
> `not_available_in_champions` in that mode) and its coverage is Gen 1 →
> Sword/Shield + Let's Go — PokeAPI has no encounter data for Scarlet/Violet,
> Legends: Arceus, or BDSP, which the tool/prompt surface transparently.

> Tools beyond the original eleven were added by the **team-builder** feature
> (see `docs/features/team-builder/architecture/design.md`): `get_team` (T12) +
> `list_teams` (T16) read the user's saved teams, and `save_team` (T13, TEAM-AD-7)
> writes one. `save_team` is the single deliberate exception to "the agent never
> writes a team" (BR-T8): it writes ONLY on an explicit user approval the prompt
> describes, mirroring the manual Apply button — see T13.
>
> **Superseded:** the original T12 `get_active_team` (a server-bound, arg-less
> read of a conversation-selected "active team", TEAM-AD-1 / TEAM-AD-3) was
> replaced once the header active-team selector was removed. Saved teams are now
> referenced **by name in chat**: the model calls `list_teams` (T16) to see the
> account's teams for the turn's format, matches the user's words against the team
> names + Pokémon, then loads the chosen one with `get_team({ team_id })` (T12).
> The `conversation.active_team_id` column and the `active_team_id` request/PATCH
> field were dropped with it.

> `get_learnset` (T17, B-13) was added last, after `get_usage_stats` (T15) and
> `list_teams` (T16), for the same reason `get_encounters` was: forward
> visibility the agent was missing. The agent kept proposing teams with moves
> that are illegal in the active format (Champions movesets especially — its
> curated learnsets genuinely differ from standard VGC) and then burned its
> iteration budget re-guessing. `get_learnset` gives the model the species'
> complete legal move list up front, and the server's rejection feedback on an
> illegal `proposed_team` now embeds that same list — see T17 below.

> `get_meta_usage` (T21, backlog B-5) reads **stored monthly Smogon ladder
> usage** — what a Pokémon runs on a competitive ladder (moves / items /
> abilities / EV-spreads / teammates / checks-and-counters), with its usage %,
> rank, and a short usage/rank trend — from the offline `meta_snapshot`/
> `meta_usage` warehouse synced by `sync:meta` from Smogon's monthly chaos stats.
> v1 covers ONE ladder, `gen9ou` (Smogon OU, Gen 9 singles); Pokémon Champions
> is deliberately excluded (its CURRENT usage is served live by `get_usage_stats`
> (T15), not these stored monthly snapshots). Unlike the mode-gated tools it is
> available in **every** scope — the ladder is an explicit `meta_format` input,
> so the server-controlled data scope stays uninvolved. The data is monthly, not
> live, so the prompt makes the model cite the ladder + month and flag staleness.
> The retired T20 number (`web_search`, removed 2026-07-03) is NOT reused — this
> tool is T21. See T21 below.

Conventions:

- Names accepted by detail tools are canonical PokeAPI slugs (`will-o-wisp`,
  `flash-fire`). Use `resolve_entity` first if unsure.
- Every detail tool's miss returns `{ found: false, suggestions: [...] }` rather
  than throwing, so the agent can resolve-or-clarify (BR-9). In **champions**
  scope only, `resolve_entity`, `get_pokemon`, `get_move`, `get_ability`, and
  `get_item` add an additive `exists_in_standard: boolean` on a miss — true
  when the entity exists in mainline Gen 9 (`scarlet-violet`) — so the agent
  can tell the user the entity isn't in Champions but is in mainline, rather
  than just reporting "not found." `get_type_matchups` deliberately omits it:
  the 18-type set is format-invariant, so there's never a cross-scope miss to
  flag.
- Generation context defaults to Gen 9; tools surface `is_gen9_native` /
  `source_generation` so the agent can flag fallback (BR-1).

---

## T1 — `resolve_entity`

**Description (for the model):** Resolve a possibly-misspelled or ambiguous name
to canonical Pokémon-data entities. Use this when the user's wording for a
Pokémon, move, ability, type, or item might not exactly match a real name, or
when a name is ambiguous across forms. Returns ranked candidate matches with
their canonical slugs.

**Input schema:**

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "The name as the user wrote it, e.g. 'Will-o-Whisp', 'Farigiraf', 'Trik Room'."
    },
    "kind": {
      "type": "string",
      "enum": ["pokemon", "move", "ability", "type", "item", "any"],
      "default": "any",
      "description": "Restrict the search to one entity kind, or 'any' to search all."
    },
    "limit": { "type": "integer", "default": 5, "minimum": 1, "maximum": 10 }
  },
  "required": ["query"]
}
```

**Output shape (sample):**

```json
{
  "matches": [
    {
      "kind": "move",
      "slug": "will-o-wisp",
      "display_name": "Will-O-Wisp",
      "score": 0.94
    },
    { "kind": "move", "slug": "wisp", "display_name": "—", "score": 0.0 }
  ]
}
```

**Side effects:** Read-only. Idempotent. **Failure modes:** none fatal — returns
`{ "matches": [] }` when nothing is close (agent then says it can't resolve and
asks); in **champions** scope, also adds `exists_in_standard: boolean` when the
miss is because the entity only exists in mainline Gen 9. **Auth:** none.

---

## T2 — `query_pokedex` _(the workhorse)_

**Description (for the model):** Search the local Pokédex index for Pokémon
matching structured filters, with optional sorting and a result limit. Use this
for any filter, threshold, superlative ("fastest"), or compound query — never
fetch Pokémon one by one for these. Pass multiple moves to get the **set of
Pokémon that can learn ALL of them** in Gen 9 (intersection). Returns the total
match count plus the top-N rows with stats, types, abilities, and sprite.

**Input schema:**

```json
{
  "type": "object",
  "properties": {
    "types": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Match Pokémon having ALL listed types (e.g. ['fire'] or ['fire','flying'])."
    },
    "abilities": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Match Pokémon that can have ANY of these abilities (slot1/slot2/hidden). Use one for an exact-ability filter."
    },
    "moves": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Match Pokémon that can learn ALL listed moves in Gen 9 (intersection of learnsets, BR-7)."
    },
    "stat_filters": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "stat": {
            "type": "string",
            "enum": [
              "hp",
              "attack",
              "defense",
              "special_attack",
              "special_defense",
              "speed",
              "base_stat_total"
            ]
          },
          "op": { "type": "string", "enum": [">", ">=", "<", "<=", "=="] },
          "value": { "type": "integer" }
        },
        "required": ["stat", "op", "value"]
      },
      "description": "Numeric base-stat constraints, ANDed together (e.g. attack > 130)."
    },
    "sort_by": {
      "type": "string",
      "enum": [
        "hp",
        "attack",
        "defense",
        "special_attack",
        "special_defense",
        "speed",
        "base_stat_total",
        "national_dex_number"
      ],
      "description": "Stat/field to rank by — use for superlatives like 'fastest' (sort_by=speed, order=desc)."
    },
    "order": { "type": "string", "enum": ["asc", "desc"], "default": "desc" },
    "limit": { "type": "integer", "default": 20, "minimum": 1, "maximum": 100 }
  }
}
```

**Output shape (sample):**

```json
{
  "total_count": 7,
  "truncated": false,
  "sort": "speed desc",
  "results": [
    {
      "display_name": "Garchomp",
      "national_dex_number": 445,
      "types": ["dragon", "ground"],
      "abilities": { "slot1": "sand-veil", "hidden": "rough-skin" },
      "base_stats": {
        "hp": 108,
        "attack": 130,
        "defense": 95,
        "special_attack": 80,
        "special_defense": 85,
        "speed": 102
      },
      "base_stat_total": 600,
      "sprite_url": "https://.../445.png",
      "is_gen9_native": true,
      "source_generation": null
    }
  ]
}
```

**Side effects:** Read-only against DS-2/DS-3. Idempotent. **Failure modes:**
`{ "error": "index_unavailable" }`; or `{ "unresolved": ["trik-room"] }` when a
passed move/ability/type slug isn't in the index (agent should `resolve_entity`
and retry). Empty match returns `{ "total_count": 0, "results": [] }` —
**not** an error; agent reports "none found" honestly. **Auth:** none.

> Multi-move note: `moves` intersection is computed in code over DS-3 (Gen-9
> learnsets), so the result already respects BR-2/BR-7. The agent should still
> cite each move's learnset as the source.

---

## T3 — `get_pokemon`

**Description (for the model):** Get the full profile of one specific Pokémon
form: its types, all abilities (including the hidden ability), base stats,
sprite/artwork, national dex number, available forms, and which generation the
data is from. Use for single-Pokémon lookups (US-4) and to ground reasoning.

**Input schema:**

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "Canonical Pokémon slug, e.g. 'garchomp', 'tauros-paldea-aqua'."
    }
  },
  "required": ["name"]
}
```

**Output shape (sample):**

```json
{
  "found": true,
  "display_name": "Farigiraf",
  "national_dex_number": 981,
  "types": ["normal", "psychic"],
  "abilities": {
    "slot1": "cud-chew",
    "slot2": "armor-tail",
    "hidden": "sap-sipper"
  },
  "base_stats": {
    "hp": 120,
    "attack": 90,
    "defense": 70,
    "special_attack": 110,
    "special_defense": 70,
    "speed": 60
  },
  "base_stat_total": 520,
  "sprite_url": "https://.../981.png",
  "artwork_url": "https://.../981_official.png",
  "forms": ["farigiraf"],
  "is_gen9_native": true,
  "source_generation": null
}
```

**Side effects:** Read-only (DS-2). Idempotent. **Failure modes:**
`{ "found": false, "suggestions": ["farigiraf"] }` — in **champions** scope,
also `exists_in_standard: boolean` when the miss is because the Pokémon only
exists in mainline Gen 9. **Auth:** none.

---

## T4 — `get_move`

**Description (for the model):** Get a move's mechanical details — type, power,
accuracy, PP, **priority**, damage class (physical/special/status), target, and
effect text. Use whenever reasoning depends on how a move behaves (e.g. checking
that Fake Out is a priority move). Optionally returns the count of Pokémon that
learn it in Gen 9.

**Input schema:**

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "Canonical move slug, e.g. 'fake-out', 'will-o-wisp'."
    },
    "include_gen9_learner_count": { "type": "boolean", "default": false }
  },
  "required": ["name"]
}
```

**Output shape (sample):**

```json
{
  "found": true,
  "display_name": "Fake Out",
  "type": "normal",
  "damage_class": "physical",
  "power": 40,
  "accuracy": 100,
  "pp": 10,
  "priority": 3,
  "target": "selected-pokemon",
  "effect_short": "Hits first (priority +3) and makes the target flinch; only works on the user's first turn out.",
  "effect_full": "Inflicts regular damage. Has +3 priority. The target flinches... Only succeeds on the first turn after the user switches in.",
  "gen9_learner_count": 112
}
```

**Side effects:** Read-only (DS-4, with DS-3 for the count). Idempotent.
**Failure modes:** `{ "found": false, "suggestions": [...] }`;
`{ "error": "upstream_unavailable" }` on a cache miss while PokeAPI is down —
in **champions** scope, a miss also adds `exists_in_standard: boolean` when the
move only exists in mainline Gen 9. **Auth:** none.

---

## T5 — `get_ability`

**Description (for the model):** Get an ability's effect text and short
description. Use when reasoning depends on what an ability does (e.g. Armor Tail
negating priority moves, Flash Fire's Fire immunity).

**Input schema:**

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "Canonical ability slug, e.g. 'armor-tail', 'flash-fire'."
    }
  },
  "required": ["name"]
}
```

**Output shape (sample):**

```json
{
  "found": true,
  "display_name": "Armor Tail",
  "effect_short": "Prevents the holder from being hit by moves with increased priority.",
  "effect_full": "The Pokémon and its allies cannot be targeted by opposing moves that have positive priority (e.g. Fake Out, Quick Attack, Extreme Speed)."
}
```

**Side effects:** Read-only (DS-4). Idempotent. **Failure modes:**
`{ "found": false, "suggestions": [...] }`; `{ "error": "upstream_unavailable" }`
— in **champions** scope, a miss also adds `exists_in_standard: boolean` when
the ability only exists in mainline Gen 9. **Auth:** none.

---

## T6 — `get_type_matchups`

**Description (for the model):** Get type effectiveness relationships using the
**latest** type chart. Pass one type for its offensive and defensive profile, or
two types for a combined **defensive** profile (the product of both types'
weaknesses/resistances/immunities). Use for matchup questions (US-6).
Immunities are 0× and must be treated as immunities, not resistances.

**Input schema:**

```json
{
  "type": "object",
  "properties": {
    "types": {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 1,
      "maxItems": 2,
      "description": "One type for full profile, or two for a combined defensive matchup (e.g. ['ground','flying'])."
    }
  },
  "required": ["types"]
}
```

**Output shape (sample, single type 'ground'):**

```json
{
  "found": true,
  "types": ["ground"],
  "offensive": {
    "super_effective_against": ["fire", "electric", "poison", "rock", "steel"],
    "not_very_effective_against": ["bug", "grass"],
    "no_effect_against": ["flying"]
  },
  "defensive": {
    "weak_to": ["water", "grass", "ice"],
    "resists": ["poison", "rock"],
    "immune_to": ["electric"]
  }
}
```

**Side effects:** Read-only (DS-4). Idempotent. **Failure modes:**
`{ "found": false, "suggestions": [...] }` for an unknown type;
`{ "error": "upstream_unavailable" }`. **Auth:** none. **Deliberately omits**
`exists_in_standard` (unlike the other detail-tool misses) — the 18-type set
is format-invariant, so a type can never exist in one scope and not another.

---

## T7 — `get_evolution_chain`

**Description (for the model):** Get a Pokémon's full evolution line and the
condition(s) for each stage (level, item, friendship, trade, time of day, etc.)
as provided by PokeAPI. Use for evolution questions (US-5).

**Input schema:**

```json
{
  "type": "object",
  "properties": {
    "species": {
      "type": "string",
      "description": "Canonical species slug, e.g. 'eevee'."
    }
  },
  "required": ["species"]
}
```

**Output shape (sample):**

```json
{
  "found": true,
  "chain": [
    {
      "from": "eevee",
      "to": "vaporeon",
      "conditions": [{ "trigger": "use-item", "item": "water-stone" }]
    },
    {
      "from": "eevee",
      "to": "espeon",
      "conditions": [
        { "trigger": "level-up", "min_happiness": 160, "time_of_day": "day" }
      ]
    }
  ]
}
```

**Side effects:** Read-only (DS-4). Idempotent. **Failure modes:**
`{ "found": false, "suggestions": [...] }`; `{ "error": "upstream_unavailable" }`.
In **champions** scope, evolution is a whole-GAME fact the Champions roster
doesn't gate, so a roster miss falls back to the mainline Gen 9 (scarlet-violet)
chain rather than surfacing `exists_in_standard`: the standard chain is returned
marked `source_format: "scarlet-violet"` (additive; the same STANDARD_FORMAT
fallback `get_encounters` uses, GS-D4). Only when the species is missing under
mainline too does the miss carry `exists_in_standard: false`.
**Auth:** none.

---

## T8 — `get_item`

**Description (for the model):** Get an item's effect text and, where available,
which Pokémon are found holding it in the wild. Use for item questions (US-8).

**Input schema:**

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "Canonical item slug, e.g. 'leftovers'."
    }
  },
  "required": ["name"]
}
```

**Output shape (sample):**

```json
{
  "found": true,
  "display_name": "Leftovers",
  "effect_short": "Holder restores 1/16 of its max HP at the end of each turn.",
  "effect_full": "At the end of each turn, the holder recovers 1/16 of its maximum HP.",
  "held_by_wild": [{ "pokemon": "snorlax", "rarity_percent": 100 }]
}
```

**Side effects:** Read-only (DS-4). Idempotent. **Failure modes:**
`{ "found": false, "suggestions": [...] }`; `{ "error": "upstream_unavailable" }`
— in **champions** scope, a miss also adds `exists_in_standard: boolean` when
the item only exists in mainline Gen 9. **Auth:** none.

---

## T9 — `compute_stat`

**Description (for the model):** Compute a Pokémon's final stat at a given level
using the exact in-game formula (handles the per-step flooring). Provide the base
stat (from `get_pokemon`/`query_pokedex`), IV, EV, level, and nature effect on
this stat. Returns the exact value and a step-by-step breakdown. Use this for any
stat-math question — do not compute stats yourself.

**Input schema:**

```json
{
  "type": "object",
  "properties": {
    "base_stat": { "type": "integer" },
    "is_hp": {
      "type": "boolean",
      "default": false,
      "description": "True for the HP stat (different formula)."
    },
    "iv": { "type": "integer", "default": 31, "minimum": 0, "maximum": 31 },
    "ev": { "type": "integer", "default": 0, "minimum": 0, "maximum": 252 },
    "level": { "type": "integer", "default": 50, "minimum": 1, "maximum": 100 },
    "nature_effect": {
      "type": "string",
      "enum": ["boosted", "neutral", "hindered"],
      "default": "neutral",
      "description": "Whether the chosen nature raises (×1.1), leaves (×1.0), or lowers (×0.9) this stat. Ignored for HP."
    }
  },
  "required": ["base_stat"]
}
```

**Output shape (sample — Garchomp Speed, base 102, lvl 50, 252 EV, 31 IV, Jolly):**

```json
{
  "value": 169,
  "breakdown": "floor((2*102 + 31 + floor(252/4)) * 50 / 100) = 149; (149 + 5) * 1.1 = 169.4 -> floor 169",
  "inputs_echo": {
    "base_stat": 102,
    "iv": 31,
    "ev": 252,
    "level": 50,
    "nature_effect": "boosted",
    "is_hp": false
  }
}
```

**Side effects:** Pure function. Idempotent. **Failure modes:**
`{ "error": "invalid_input", "detail": "ev must be 0..252" }`. **Auth:** none.

> Formulas (for the implementer):
> non-HP: `floor((floor((2*Base + IV + floor(EV/4)) * Level/100) + 5) * NatureMod)`
> HP: `floor((2*Base + IV + floor(EV/4)) * Level/100) + Level + 10`
> NatureMod ∈ {1.1, 1.0, 0.9}. (Shedinja HP = 1 is a known exception.)

---

## T10 — `estimate_damage`

**Description (for the model):** Estimate damage for one attack using the
standard damage formula, returning the min–max range (from the 0.85–1.0 random
roll) and a breakdown. Provide attacker/defender effective stats, move power,
STAB, type effectiveness multiplier, and any extra modifiers. Use this for
damage questions — do not compute damage yourself. Always present the result as
an estimate.

**Input schema:**

```json
{
  "type": "object",
  "properties": {
    "level": { "type": "integer", "default": 50 },
    "power": { "type": "integer", "description": "Move base power." },
    "attack_stat": {
      "type": "integer",
      "description": "Attacker's effective Atk or SpA."
    },
    "defense_stat": {
      "type": "integer",
      "description": "Defender's effective Def or SpD."
    },
    "stab": {
      "type": "boolean",
      "default": false,
      "description": "Same-type-attack bonus (×1.5)."
    },
    "type_effectiveness": {
      "type": "number",
      "default": 1,
      "description": "Product of type matchups, e.g. 2, 0.5, 0, 4."
    },
    "other_modifier": {
      "type": "number",
      "default": 1,
      "description": "Combined weather/item/ability/etc. multiplier."
    }
  },
  "required": ["power", "attack_stat", "defense_stat"]
}
```

**Output shape (sample):**

```json
{
  "min_damage": 240,
  "max_damage": 284,
  "is_estimate": true,
  "breakdown": "base = floor(floor(floor((2*50/5+2)*120*169/95)/50)+2) = 95; then per-step floor: * roll[0.85..1.0] * STAB 1.5 * type 2 * other 1 = 240..284",
  "inputs_echo": {
    "level": 50,
    "power": 120,
    "attack_stat": 169,
    "defense_stat": 95,
    "stab": true,
    "type_effectiveness": 2,
    "other_modifier": 1
  }
}
```

**Side effects:** Pure function. Idempotent. **Failure modes:**
`{ "error": "invalid_input", "detail": "..." }`. **Auth:** none.

> Formula (for the implementer):
> `base = floor(floor(floor((2*Level/5 + 2) * Power * A / D) / 50) + 2)`
> then **floor after each step in in-game order** — roll → STAB → type → other:
> `floor(floor(floor(floor(base × roll) × STAB(1.5)) × type_effectiveness) ×
> other_modifier)`, roll ∈ [0.85, 1.0]. Report `min` (0.85) and `max` (1.0).
> Per-step flooring (not one product then one floor) matches `design.md`'s
> "per-step flooring" and keeps the range from being overstated.

---

## T11 — `submit_answer` _(structured output / final action)_

**Description (for the model):** Submit your final answer. Call this exactly
once, as your last action, every turn. Its fields populate the user-facing
answer card. Include the direct answer, your reasoning, the specific data you
relied on (citations), any inferences with their confidence, the generation your
answer is based on, and the Pokémon/candidates/calc results to display. If you
couldn't resolve an entity or need clarification, set `status` accordingly and
provide `suggestions`.

**Input schema:** the full `OakAnswer` object — see `output-formats.md` for
the complete JSON Schema and field semantics.

**Side effects:** Terminates the agent loop; the payload is returned to the
caller and rendered by the frontend. Idempotent (one call per turn). **Failure
modes:** if the payload fails schema validation, orchestration returns the
validation error to the model and asks it to re-emit (see `integration.md`).
**Auth:** none.

---

## T12 — `get_team`

_(Team-builder feature. Loads ONE saved team by id; the id comes from
`list_teams`, T16. Replaced the original server-bound `get_active_team`.)_

**Description (for the model):** Load one of the user's saved teams by id — its
members (species, ability, item, moves, nature, EVs/IVs, Tera type, level), their
display names, and any validity/legality warnings. **Pass a `team_id` you got
from `list_teams`** (you cannot guess one). Returns `{ "found": false }` if the id
isn't one of this user's teams in the current format. Use this after `list_teams`
to read the team the user is asking about ("my rain team", "this set") and ground
advice in it.

**Input schema:** a strict `team_id` string.

```json
{
  "type": "object",
  "properties": { "team_id": { "type": "string", "minLength": 1 } },
  "required": ["team_id"],
  "additionalProperties": false
}
```

The team is loaded **account-scoped and format-gated** (`resolveActiveTeam`): an
unknown, not-owned, or wrong-format id all yield `{ "found": false }`, so the model
can never read a team outside the signed-in account or the turn's format. The id
is opaque to the model — it only ever supplies one returned by `list_teams`.

**Output shape (sample):**

```json
{
  "found": true,
  "team": {
    "name": "Sun Offense",
    "format": "scarlet-violet",
    "members": [
      {
        "species": "garchomp",
        "species_display": "Garchomp",
        "ability": "rough-skin",
        "ability_display": "Rough Skin",
        "item": "leftovers",
        "item_display": "Leftovers",
        "moves": ["earthquake", "dragon-claw"],
        "moves_display": ["Earthquake", "Dragon Claw"],
        "nature": "adamant",
        "evs": { "hp": 4, "atk": 252, "def": 0, "spa": 0, "spd": 0, "spe": 252 },
        "ivs": { "hp": 31, "atk": 31, "def": 31, "spa": 31, "spd": 31, "spe": 31 },
        "tera_type": "ground",
        "level": 50
      }
    ],
    "warnings": [
      { "code": "incomplete", "slot": 0, "message": "Slot has only 2 of 4 moves." }
    ]
  }
}
```

Display names come from the same `searchable_names` master list `resolve_entity`
uses; the `warnings[]` are computed on demand by `validateTeam` (warn-but-allow,
never stored — so they can't go stale across a re-ingest). Warning codes:
`incomplete`, `ev_total_exceeded`, `ev_stat_exceeded`, `iv_out_of_range`,
`species_illegal`, `ability_not_for_species`, `item_illegal`,
`move_not_in_learnset`, `duplicate_species`, `duplicate_item`.

**Side effects:** Read-only. Idempotent. **Failure modes:** never fatal — a guest,
an unknown/foreign/wrong-format id, OR any read fault while enriching degrades to
`{ "found": false }`. **Auth:** the signed-in account id is bound server-side onto
`AgentContext.accountId`; the tool scopes every read to it (the agent never sees
the id itself).

> **T16 — `list_teams`.** The companion pick-list: takes no arguments and returns
> the user's saved teams for the turn's format — each team's `team_id`, `name`,
> `member_count`, `incomplete` flag, and its Pokémon (`species`, display names) —
> so the model can match a by-name reference against names AND contents, then call
> `get_team`. `{ "signed_in": false }` for a guest; `{ "signed_in": true, "teams":
> [] }` when the account has none. Format-scoped like `get_team` (a Champions team
> never appears in standard mode). Read-only, idempotent, never fatal.

---

## T13 — `save_team`

_(Added by the team-builder feature — TEAM-AD-7. The one **write** tool.)_

**Description (for the model):** Save a team to the user's saved Teams. Call this
ONLY when the user EXPLICITLY approves a team you proposed earlier in this
conversation ("looks good", "save it", "build this team", "I like this"), or asks
you to build AND save one. It saves the **exact team you proposed** — you do not
pass the members. Optional `name` renames; optional `team` is for build-and-save
in one message (no prior proposal). On `{ "saved": true }`, tell the user it's on
their Teams page (the app opens it in the viewer); on `not_signed_in`, ask them to
sign in; on `no_team`, propose a team first.

**Input schema:**

```json
{
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "team": {
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "format": { "enum": ["scarlet-violet", "champions"] },
        "members": { "type": "array" }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

The team it saves is **server-bound**: the chat route extracts the most recent
`proposed_team` from the conversation's stored answers and binds it onto
`AgentContext.proposedTeam` (the analogue of `activeTeam`), so the saved EVs / IVs
/ moves are byte-for-byte what the user saw — the model never re-types the set.
`team` is only the fallback when there is no prior proposal in context. The new
team becomes the conversation's active team, and the route stamps the saved id +
name + format onto `answer.saved_team` (authoritative — the model never copies a
UUID), which the UI renders as a persistent "Saved ✓ — open in viewer" card.

**Output shape (sample):**

```json
{ "saved": true, "team_id": "…uuid…", "name": "Rain Offense", "format": "champions" }
```

or a structured miss:

```json
{ "saved": false, "reason": "not_signed_in" }
```

**Side effects:** WRITES one team row (account-scoped) + sets the conversation's
active team. **Not** idempotent — calling it twice saves twice, so the prompt
gates it on an explicit one-time approval. **Failure modes:** never throws —
a guest is `{ "saved": false, "reason": "not_signed_in" }`, nothing-to-save is
`"no_team"`, a write fault is `"index_unavailable"`. **Auth:** the account is
server-bound onto the context (the agent never sees an account id); a guest turn
binds none, so a guest can never write.

---

## T14 — `get_encounters`

**Purpose:** where and how to OBTAIN a Pokémon — wild encounters (walk/surf/
fishing) plus gifts, gift-eggs, static and in-game trades — grouped by game.
Answers "where do I catch / how do I get X" questions. **Standard mode only.**

**Input:** `{ name: string }` — a Pokémon name/slug (resolve_entity first if
unsure). The repo resolves any form to its base species, so locations are
reported at the species level.

**Output (hit):** `{ found: true, name, encounters: EncounterGroup[],
coverage_note: string | null }`, where each `EncounterGroup` is
`{ version_group, generation, versions[], locations: [{ location_display, region,
method, min_level, max_level, chance, conditions[] }] }`. `coverage_note` is set
(and `encounters` empty) when the species has no recorded catch data.

**B-12 (gen-scope annotate+foreground):** on a mainline gen-scoped turn
(`ctx.mode` one of `"gen-5"`…`"gen-8"`), the tool additively annotates the same
grouped result rather than filtering it — no group is ever dropped. Every group
gains `in_active_scope: boolean` (true when its `generation` matches the active
scope's generation number), and `encounters` is stable-partitioned so matching
groups sort first, non-matching groups following in their original relative
order. If NO group matches the active generation, `scope_note: string` explains
the gap (e.g. "No Generation 7 catch locations are recorded for this Pokémon;
the locations below are from other generations' games."); it stays null/absent
whenever at least one group matches. Both fields are absent entirely on a
standard or Champions turn — that output is byte-identical to pre-B-12 behavior.

**Misses / modes:** `{ found: false, suggestions }` (unknown name);
`{ error: "index_unavailable" }` (index not built);
`{ error: "not_available_in_champions" }` (Champions turn — encounters are
standard-only). Never throws in-domain.

**Data source & coverage:** built offline at ingest from a committed PokeAPI
snapshot (`src/ingest/data/encounters.json`, produced by
`scripts/fetch-pokeapi-encounters.ts`) into `reference_cache` under
resource_kind `encounters`. **Coverage is Gen 1 → Sword/Shield + Let's Go only**
— PokeAPI has NO encounter data for Scarlet/Violet (Gen 9), Legends: Arceus, or
BDSP; the empty list + `coverage_note` and the prompt make that gap explicit. The
per-game model means a future re-crawl auto-absorbs Gen 9 if PokeAPI fills it in.

---

## T17 — `get_learnset`

_(Added by B-13 — fixing illegal proposed teams.)_

**Purpose:** give the agent forward visibility into a Pokémon's COMPLETE legal
moveset in the active data scope, so it stops proposing teams with moves that
are illegal in the current format instead of discovering the problem only after
the server rejects `proposed_team`. This matters most in Champions mode, whose
curated movesets genuinely differ from standard VGC / other generations (e.g.
Incineroar has no Knock Off or U-turn in Champions even though it does in
Scarlet/Violet) — building a team from the model's memory of a species' moveset
elsewhere WILL produce illegal moves. The prompt (all three bodies — parity is
non-negotiable) routes "what moves can/does X learn" questions here instead of
reverse-checking `query_pokedex`'s `moves` filter one move at a time, and directs
the model to call it for EVERY team member it's giving moves to before finalizing
a `proposed_team`.

**Input:** `{ name: string }` — a Pokémon form name/slug (resolve_entity first if
unsure; a Mega uses its own `-mega` slug like any other tool).

**Output (hit):** `{ found: true, pokemon, format, count, moves: [{ slug, method
}] }` — every move the species can legally learn in the active format, where
`method` is `"level-up" | "machine" | "tutor"`. `count` is `moves.length`
(convenience for the model, no separate arithmetic needed).

**Misses:** `{ found: false, suggestions }` (unknown/ambiguous name — offer the
closest match, same convention as every other detail tool). Never throws
in-domain.

**Data source:** reads the same `learnset` table (`learnset-repo.ts`
`movesForPokemon`) the server-side team validator (`validateTeam`,
`move_not_in_learnset`) reads to compute its rejection warnings — so the tool's
answer and the validator's verdict agree **by construction**; there is no second
learnset representation that could drift out of sync. This is also why the
rejection feedback on an illegal `proposed_team` can now embed the species'
legal move list directly (read straight from this same table) — the model gets a
targeted fix instead of a bare "illegal move" flag, so a re-emit converges in one
round-trip instead of the model re-guessing blind.

**Side effects:** Read-only. Idempotent.

**Cache-prefix note:** appended last (after T15/T16), so the existing T1–T16
tool order — and thus the prompt-cached prefix — is unchanged.

---

## T21 — `get_meta_usage`

_(Added by backlog B-5 — stored competitive-ladder usage.)_

**Purpose:** give the agent STORED monthly Smogon ladder usage for a Pokémon —
what it runs on a competitive ladder (most-used moves, items, abilities,
EV-spreads, teammates, plus its checks-and-counters), with its usage percentage,
usage rank, and a short usage/rank trend. Answers "what does X run in OU", "is X
used on the ladder", "top moves/item/spread for X" and similar. The prompt maps
"OU" / "Smogon" / "the ladder" / "singles usage" to `meta_format: "gen9ou"` and
routes a "current meta" question here (latest synced month) before degrading to
the no-live-web honesty policy. It is NOT live data — the model must cite the
ladder AND the month and flag that monthly stats may have moved.

**Available in all scopes.** Unlike `get_encounters` (standard-only) and
`get_usage_stats` (champions-only), this tool has NO `ctx.mode` gate: the ladder
is an explicit `meta_format` input, so the server-controlled data scope is
uninvolved. It runs identically in every scope.

**Input:** `{ name: string, meta_format?: "gen9ou", month?: "YYYY-MM" }` —
`name` is a Pokémon name/slug (resolve_entity first if unsure); `meta_format`
selects the ladder (defaults to `gen9ou`, the only v1 ladder); `month` omitted
means the latest synced month.

**Output (hit):** `{ found: true, name, species, display_name, meta_format,
meta_format_label, smogon_format_id, month, cutoff, rank, usage_pct, moves,
items, abilities, spreads, teammates, counters, trend, total_battles, source_url,
attribution }`, where `moves`/`items`/`abilities`/`teammates` are `{ name, slug,
pct }[]`, `spreads` is `{ nature, evs, pct }[]`, `counters` is `{ name, slug,
score, ko_or_switch_pct, n }[]`, and `trend` is `{ month, usage_pct, rank }[]`
(ascending by month, most-recent ≤6 months). `total_battles` is `number | null`;
`attribution` is the constant `"Smogon usage statistics (smogon.com/stats)"`.

**Misses / error shapes:** `{ found: false, suggestions }` — unknown/ambiguous
name (up to five of the month's display names ranked by affinity, same
convention as every other detail tool; malformed input degrades to the same
shape with an empty `suggestions`). `{ error: "no_data", months_available }` —
the requested `month` isn't synced, or the ladder has never been synced at all
(`months_available: []`). Never throws in-domain; a genuine repo/transport fault
propagates like every other DB-reading tool.

**Data source & coverage:** reads `meta_snapshot` + `meta_usage` (via
`meta-repo.ts` — `listMetaMonths`/`metaSnapshot`/`metaLeaderboard`/
`metaSpeciesDetail`/`metaSpeciesTrend`), built offline by the `sync:meta` CLI
from Smogon's monthly chaos stats (`smogon.com/stats/<month>/chaos/<id>.json`).
**v1 coverage is one ladder, `gen9ou`** (Smogon OU, Gen 9 singles). **Pokémon
Champions is excluded** — its current usage is served live by `get_usage_stats`
(T15). The ladder axis (`src/data/meta-formats.ts`) is deliberately separate from
the six-scope data-format axis, so a future VGC-style ladder can be added without
touching the data scope.

**Side effects:** Read-only. Idempotent.

**Cache-prefix note:** appended LAST, after `search_wiki` (T19), so the existing
T1–T19 tool order — and thus the prompt-cached prefix — is unchanged. The T20
number (`web_search`, removed 2026-07-03) stays permanently retired and is NOT
reused; this tool is T21.

---

## Tool-existence status

| Tool                                                                        | Exists? | Build note                                                 |
| --------------------------------------------------------------------------- | ------- | ---------------------------------------------------------- |
| resolve_entity                                                              | ❌      | Needs a name→slug fuzzy index over DS-2/DS-4.              |
| query_pokedex                                                               | ❌      | Needs DS-2 + DS-3 + a query layer. **Largest build item.** |
| get_pokemon                                                                 | ❌      | Reads DS-2.                                                |
| get_move / get_ability / get_type_matchups / get_evolution_chain / get_item | ❌      | Read DS-4 (read-through cache over PokeAPI).               |
| compute_stat / estimate_damage                                              | ❌      | Pure formula functions (D5).                               |
| submit_answer                                                               | ❌      | Structured-output tool; schema in `output-formats.md`.     |
| get_team                                                                    | ✅      | Built by team-builder; loads one saved team by `team_id` (account-scoped, format-gated). Replaced the server-bound `get_active_team`. |
| list_teams                                                                  | ✅      | Built by team-builder; the by-name pick-list — the account's saved teams (names + Pokémon) for the turn's format. |
| save_team                                                                   | ✅      | Built by team-builder (TEAM-AD-7); the one write tool — saves server-bound `ctx.proposedTeam` on approval. |
| get_encounters                                                              | ✅      | Catch-location / obtain-method data from a committed PokeAPI snapshot (standard mode only; Gen 1–8 coverage). |
| get_learnset                                                                | ✅      | Added by B-13; a species' complete legal moveset in the active scope, reading the same `learnset` table the team validator checks against. |
| get_meta_usage                                                              | ✅      | Added by B-5; stored monthly Smogon ladder usage (v1 `gen9ou`) from the `meta_snapshot`/`meta_usage` warehouse synced by `sync:meta`. Available in every scope (ladder is explicit input); Champions excluded (live via get_usage_stats). Appended last as T21 (T20 retired). |

(The ❌ marks are the original agent-design backlog state; `get_team`,
`list_teams`, and `save_team` are implemented as part of the team-builder
feature. `get_team` + `list_teams` replaced the original `get_active_team`.)

All tools are new work. None require auth or carry side effects beyond reads —
simplifying retry logic in the loop.
