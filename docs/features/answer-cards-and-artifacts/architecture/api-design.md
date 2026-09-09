# Answer cards and artifacts — API Design

Auth: existing cookie + Bearer unless noted. Error envelope stays
the current `{ error: string, ... }` JSON. In-domain calc/entity
misses stay **200 with a status field** (never throw to the user).

## `citation.anchor` (chat body, not a new route)

`POST /api/chat` request body is unchanged. New answers may include
`citations[].anchor`. Runtime:

```ts
function sanitizeCitationAnchors(answer: unknown): unknown
```

- Drop `anchor` if `target` not in `answer_span|fact_row`.
- Drop if `id` missing, not a string, or fails
  `/^[A-Za-z0-9_.:#-]{1,64}$/`.
- Leave the citation otherwise intact.
- Run **before** `oakAnswerSchema.safeParse` and before persist.

Clients highlight only when both the sanitized anchor **and** the
matching span/row exist.

## `POST /api/calc`

Public (guest + signed-in). `runtime = "nodejs"`,
`dynamic = "force-dynamic"`. Dynamic-import the engine (same
env-throw avoidance as `/api/chat`). Rate limit: existing public
`pub:<ip>` (same family as `/api/entity`).

**Request**

```ts
{
  format: Format; // required, isFormat()
  attacker: CalcSide;
  defender: CalcSide;
  move: {
    slug?: string;
    name?: string;
    power?: number;       // used only if species/move miss and power given
    type?: string;
    category?: "physical" | "special" | "status";
  };
  field?: {
    weather?: "none" | "sun" | "rain" | "sand" | "snow";
    reflect?: boolean;
    light_screen?: boolean;
  };
}

type CalcSide = {
  species: string;        // slug or display name
  ability?: string | null;
  item?: string | null;
  nature?: string | null;
  evs?: Partial<Record<StatKey, number>>;
  ivs?: Partial<Record<StatKey, number>>;
  tera?: string | null;
  level?: number;         // omitted → defaultCalcLevel(format)
};
```

Missing species on a side or missing move identity → **200**
`{ ok: false, error: "incomplete", detail }`. Do not invent a 0
roll (**CALC-BR-8**).

**Success 200**

```ts
{
  ok: true;
  format: Format;
  estimate: {
    min_damage: number;
    max_damage: number;
    percent_min: number;  // vs computed defender HP
    percent_max: number;
    ko: { hits: number }; // 1 = OHKO range guaranteed if min >= hp, etc.
    is_estimate: true;
  };
  breakdown: string;
  applied: {
    stab: boolean;
    type_effectiveness: number;
    other_modifier: number;
    weather?: string;
    screens?: string[];
    item?: string;
    unsupported: string[]; // named ability/item/knob not in catalog
  };
  common_spreads?: Array<{
    label: "min" | "bulky" | "max";
    estimate: { min_damage: number; max_damage: number; percent_min: number; percent_max: number; ko: { hits: number } };
  }>;
  caveat?: string; // set for gen-1..gen-4 (CALC-BR-6)
}
```

`common_spreads` is present **only** when the defender’s EVs were
omitted / still the format default (**CALC-AC-5.2**). Default EV
spread for that purpose: all 0 except the defensive stat under
test at 0 / 252 / 252+nature as the three labels — document the
exact numbers in `calc-engine.ts` and lock them with tests.

**Other 200 errors:** `unresolved` (species/move not in format,
include `suggestions` if `/api/search` would), `index_unavailable`,
`status_move` (no damage range).

**400:** `invalid_format`, malformed JSON.
**429:** existing public limiter.

No model. No `OakAnswer`.

## Teams — add-to-team (existing endpoints)

| Step | Call |
|---|---|
| List | `GET /api/teams` (optional `?format=` does not hide other formats — picker shows all) |
| Load | `GET /api/teams/:id` |
| Write | `PUT /api/teams/:id` `{ members }` |
| Create | `POST /api/teams` `{ name?, format, members }` |

Guest: these stay **401**. UI hides the verb (**AUTH-BR-1**).

Portable helper (not an HTTP API):

```ts
placeSpeciesOnTeam(
  members: TeamMember[],
  incoming: TeamMember,          // species + copied fields; rest blankMember()
  target: { type: "first_empty" } | { type: "replace"; index: 0|1|2|3|4|5 },
): { ok: true; members: TeamMember[]; slotIndex: number }
 | { ok: false; error: "full" }
```

**First empty** = lowest index `0–5` whose `species` is null/empty
(**ADD-BR-1**). Full → `{ error: "full" }` so the client opens the
replace sheet. Do not auto-replace.

## Showdown one-tap

No new route (**ADR-10**). Client:

```ts
proposedTeamToShowdownPaste(team: ProposedTeam): string
```

already exists as the Showdown section of human copy / native
lockstep. New UI calls it and copies **only** that string.

## Pins

All signed-in, conversation owner. Guest **401**. Foreign
conversation **404**.

### `GET /api/conversations/:id`

Additive fields (old clients ignore):

```ts
{
  // existing fields…
  pinnedArtifacts: PinnedArtifactSummary[];
  hydrate?: { assistant_message_id: string; status: "running" | "failed" };
}

type PinnedArtifactSummary = {
  id: string;
  kind: "team_sheet" | "comparison" | "calc";
  title: string;
  created_at: number;
};
```

Opening a pin: `GET /api/conversations/:id/artifact-pins/:pinId` →
`{ pin: { id, kind, title, snapshot } }`.

### `POST /api/conversations/:id/artifact-pins`

Body: `{ kind, title, snapshot }` where `snapshot` matches
`PinSnapshotV1`. Server validates `kind`/`v`/ownership, counts
existing, **409 `{ error: "pin_cap", max: 5 }`** if already 5
(**PIN-AC-3.1**). **201** `{ pin, pinnedArtifacts }`.

### `DELETE /api/conversations/:id/artifact-pins/:pinId`

**200** `{ pinnedArtifacts }`. Missing pin **404**. Immediate, no
confirm (**PIN-AC-3.2**).

Extend conversation **delete** and account **delete** to remove
pin rows.

## Compact preference

### `GET /api/auth/me`

Additive: `answerDensity?: "full" | "compact"` (omit or `"full"`
when NULL).

### `PATCH /api/account/preferences`

Signed-in. Body `{ answer_density: "full" | "compact" }`.
**200** `{ answerDensity }`. Guest **401**.

## Voice compile

### `POST /api/voice/tool` (existing)

Also `appendVoiceTrace(session_id, { name, input, output })`.
Failure to buffer must not fail the tool response.

### `POST /api/voice/transcript` (existing)

After successful `appendTurnPair`:

1. Set in-process hydrate `{ status: "running", assistant_message_id }`.
2. `void runVoiceCompile(...).catch(log)`.
3. Return the existing 200 **without waiting**.

Compile success: overwrite that assistant row; clear hydrate.
Compile fail: `status: "failed"` (TTL ~30 min).
`POST /api/chat` for that conversation: `abortVoiceCompile(id)`
then proceed (no 409 from hydrate).

### `POST /api/voice/hydrate`

Signed-in. Body `{ conversation_id, assistant_message_id }`.
**200** `{ status: "running" }` and start compile again.
**409** `turn_in_progress` only if a **real** chat turn is running
(do not 409 on another hydrate — replace it). **404** if the
message is not a voice-origin thin/failed card the caller owns.

Voice origin detection: `reasoning_markdown` is the existing voice
disclaimer **or** a new optional `answer.origin?: "voice"` stamped
by `synthesizeVoiceAnswer` (prefer the stamp — additive optional
on `OakAnswer`, server-owned, stripped if the model emits it).
**Do stamp `origin: "voice"`** in `synthesizeVoiceAnswer` and keep
it when compile overwrites (compile output is sanitized to force
`origin: "voice"`). Clients use this for the mic glyph
(**VOICE-AC-1.2**). Strip-on-invalid if the chat model emits it
(server-owned, like `saved_team`).

## Dex hops (existing pages + query)

| Kind | URL |
|---|---|
| Pokémon | `/pokedex/{slug}?format={format}` |
| Move | `/moves/{slug}?format={format}` |
| Ability | `/abilities/{slug}?format={format}` |
| Item | `/items/{slug}?format={format}` |

This pack implements `?format=` on move/ability/item (today they
ignore it). Invalid format soft-falls back the same way the
Pokédex page already does. Native: set Dex tab format, then push
`DexEntityRoute(kind, query)`.

## `/calc` slash (client only)

```ts
type SlashCommandResult =
  | { type: "navigate"; target: SlashNavigateTarget }
  | { type: "calc"; rest: string }
  | { type: "message" };
```

`rest` is the substring after `/calc` trimmed. Empty rest → open
overlay, current scope. Non-empty → parse
`ATTACKER [MOVE] vs DEFENDER` with a case-insensitive `vs|versus`
split; unresolved tokens still open the overlay (**CALC-AC-3.3**).

## Explain this calc

Not a new endpoint. Client `POST /api/chat` with a **deterministic
message** built by portable `explainCalcPrompt(scenario, result)`:

```
Explain this damage estimate (do not re-roll unless needed).
Format: {format}
Attacker: {species} @ {item} / {ability} / {nature} / {evs} / L{level} / Tera {tera}
Defender: …
Move: {move}
Field: {weather}, screens {…}
Estimate: {min}–{max} ({pmin}–{pmax}%); {hits}HKO
Unsupported: {list}
```

This is a normal ask (**CALC-AC-8.3**). Overlay stays open.

## Error / deny matrix (observable)

| Caller | Action | Result |
|---|---|---|
| Guest | Add to team / Pin / PATCH preferences / voice hydrate | Control hidden; stale call 401 |
| Guest | POST /api/calc, Dex, Showdown serialize, table TSV | 200 / local |
| Other account | Pin or team write | 404 |
| Signed-in | 6th pin | 409 `pin_cap` |
| Anyone | calc incomplete | 200 `ok:false` `incomplete` |
| Anyone | real turn while hydrate running | hydrate aborted; turn proceeds |
