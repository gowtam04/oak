# Slash discovery — Technical Design

Mode: PM
Budget Tier: hobby

Composer discovery on top of existing client-side slash hops. Extend the
portable leading-token parser, add a `/` picker (same neighborhood as `@`
mentions), fan-out existing `GET /api/search` for Dex/Usage names, and hop
with kind-aware Dex URLs plus Usage species drill-in. No new HTTP resource,
no new table, no tool-barrel or `OakAnswer` change, no model turn for a
handled slash.

## Requirements Reference

[`docs/features/slash-discovery/requirements/requirements.md`](../requirements/requirements.md)

IDs: `SD-US-*`, `SD-AC-*`, `SD-BR-*`. Also honors Chat QoL `SLASH-BR-2`,
`SLASH-AC-1.6`, `SLASH-AC-2.5` (edit does not intercept), and Calc
`CALC-US-3` / `CALC-AC-3.1–3.4`.

## Tech Stack

Existing only. No new npm / Gradle / SPM packages. No new env vars.

| Layer | Choice |
|---|---|
| Web | Next.js App Router, existing Composer + `page.tsx` send path |
| Portable parse | `web/src/lib/chat/slash-commands.ts` (oracle) cloned to iOS/Android |
| Name search | Existing public `GET /api/search?kind=&q=&format=champions` (LIMIT 8 typed) |
| Teams | In-memory saved-team list already used by `@` mentions |
| iOS / Android | Existing SwiftUI / Compose clients; existing `DexLookupService` |
| Tests | Vitest unit + jsdom + fullstack; XCTest; JUnit — lockstep oracles |

## Data Model

No persistence. No migration.

| Concept | Where it lives | Lifecycle |
|---|---|---|
| Handled command | Pure parse result | One send |
| Picker model | Derived from composer text each keystroke | Dies when text is not a leading `/` |
| Dex bind | Composer/VM field `{ kind, slug, displayName }` | Set on name-row pick; cleared when the `/dex` argument text no longer equals `displayName` (case-insensitive), when composer clears, or on a non-dex command |
| Search matches | Ephemeral list from 1–4 GETs | Debounced; stale generations discarded |

## Component Design

### 1. Slash send parser (portable oracle)

**Owns:** classifying a composer **send** as hop / calc / help / bare `/` /
message. Does not POST. Does not fetch.

**Files:** `web/src/lib/chat/slash-commands.ts` (+ test). Clones:
`ios/OakApp/Features/Chat/SlashCommands.swift`,
`android/.../features/chat/SlashCommands.kt`.

**Change from today:** case-insensitive command tokens; add `/help` and
bare `/`; keep `hasUsagePage` gate (all three production clients pass
`true`).

### 2. Slash picker model (portable oracle)

**Owns:** command catalog + hints, command-vs-arg **phase**, prefix filter,
insert strings, Dex-row merge + cap 8, bind-still-valid. Pure. No I/O.

**Files:** `web/src/lib/chat/slash-picker.ts` (+ test). Clones:
`SlashPicker.swift`, `SlashPicker.kt`.

### 3. Web Composer + SlashAutocomplete

**Owns:** showing the picker, keyboard (web), inserting picks, passing
`dexBind` on send. Mentions stay as today; if the slash picker is visible,
do not show `@` autocomplete.

**Does not own:** navigation, calc overlay, chat POST.

### 4. Web send path (`page.tsx`)

**Owns:** intercepting handled slashes (existing place), kind-aware Dex
URLs, Usage `/usage` and `/usage/{slug}`, `/help` + bare `/` via
`prefill`, calc overlay (unchanged), restoring images after a hop
(**SD-AC-5.9**).

### 5. iOS ChatViewModel + ComposerView + AppDestination

**Owns:** native picker, send intercept, `.dexHop` for kind, existing
`.usage(slug:)`, composer text `/` for help/bare, keep pending images on
hops.

### 6. Android ChatViewModel + Composer + AppState

**Owns:** same as iOS. **Must** change `SurfaceRequest.Usage` from a
bare object to `Usage(slug: String?)` and open Dex → Usage section →
`UsageLeaderboardViewModel.openSpecies(slug)` when slug resolves.

### 7. Search fan-out (per client, not a new API)

Web: small helper next to Composer (or `slash-search.ts`) calling
`searchEntities` four times. iOS/Android: `DexLookupService.search` four
times. Merge via portable `mergeDexNameRows`. Faults fold to `[]` per
kind (existing never-throw search clients).

## API Design

**No new endpoints.** Do not change `GET /api/search` query params.

Reuse:

```
GET /api/search?kind=pokemon|move|ability|item&q=<arg>&format=champions
Authorization: none (public read, existing `pub:<ip>` limiter)
200 { matches: { slug, display_name, kind, sprite_url? }[] }
400 invalid_kind | invalid_format
429 rate_limited
```

Typed `q` is already capped at 8 matches server-side. Blank `q` still
returns the full kind (existing browse). Clients **must** slice each
kind to 8 **before** merge, then cap the merge at 8 (**SD-BR-10**).
Accepted tradeoff of fan-out (decision 2A): empty `/dex ` may download
four browse lists once; debounce 150ms (same as `EntityPicker`) and
drop stale generations so typing stays live.

`/usage ` uses **one** call: `kind=pokemon` only.

Teams: no search HTTP; filter the in-memory list like mentions.

Handled slashes never call `POST /api/chat`.

## File Structure

New vs modified. One purpose each.

### New — portable + web

| File | Purpose | Owner |
|---|---|---|
| `web/src/lib/chat/slash-picker.ts` | Catalog, phase, filter, insert, merge, bind-valid | picker-oracle |
| `web/src/lib/chat/slash-picker.test.ts` | Lockstep oracle for phase/filter/insert/merge | picker-oracle |
| `web/src/lib/chat/slash-search.ts` | Fan-out `searchEntities` + merge; never-throw | web-search |
| `web/src/lib/chat/slash-search.test.ts` | Merge cap, kind order, empty/fault → [] | web-search |
| `web/src/components/chat/SlashAutocomplete.tsx` | Listbox UI (commands + names + empty + caption) | web-ui |
| `web/src/components/chat/SlashAutocomplete.test.tsx` | jsdom: rows, empty copy, caption, pick | web-ui |
| `web/test/page-slash-discovery.fullstack.test.tsx` | Picker + intercept + hops + help/bare + images | web-page |

### New — iOS

| File | Purpose |
|---|---|
| `ios/OakApp/Features/Chat/SlashPicker.swift` | Clone of `slash-picker.ts` |
| `ios/OakApp/Features/Chat/SlashAutocomplete.swift` | Picker UI above composer |
| `ios/OakAppTests/SlashPickerTests.swift` | Clone of picker oracle cases |
| `ios/OakAppTests/Chat/SlashDiscoveryViewModelTests.swift` | help/bare, usage slug, dex kind, images kept |

### New — Android

| File | Purpose |
|---|---|
| `android/.../features/chat/SlashPicker.kt` | Clone of `slash-picker.ts` |
| `android/.../features/chat/SlashAutocomplete.kt` | Picker UI |
| `android/.../features/chat/SlashPickerTest.kt` | Clone of picker oracle cases |
| `android/.../chat/SlashDiscoveryViewModelTest.kt` | Same VM cases as iOS |

### Modified — web

| File | What changes |
|---|---|
| `web/src/lib/chat/slash-commands.ts` | Case-insensitive tokens; `help`; `bare`; export `slashArg` |
| `web/src/lib/chat/slash-commands.test.ts` | Those cases; keep `/newish` → message; `/usage` gated |
| `web/src/components/chat/Composer.tsx` | Picker, keyboard, `dexBind`, help/bare vs clear, keep images on handled send |
| `web/src/components/types.ts` | `onSend` optional `slashMeta?: { dexBind?: DexBind }` |
| `web/src/app/page.tsx` | Parse `help`/`bare`; kind-aware Dex; `/usage` + slug; prefill restore |
| `web/src/app/globals.css` | `.slash-ac` cloned from `.mention-ac` + selected row + caption + kind hint |
| `web/test/page-chat-qol.fullstack.test.tsx` | Only if an existing slash case would fail (case / `/` send). Prefer **new** fullstack file; do not restripe QoL tests |

### Modified — iOS

| File | What changes |
|---|---|
| `ios/.../SlashCommands.swift` | Same parse as web oracle |
| `ios/OakAppTests/SlashCommandsTests.swift` | Clone new send cases |
| `ios/.../ChatViewModel.swift` | Picker state, search fan-out, intercept help/bare, dexHop, keep images |
| `ios/.../ComposerView.swift` | Mount picker; insert; hide mentions when slash visible |
| `ios/OakApp/App/AppState.swift` | No destination enum change (`.dexHop` and `.usage(slug:)` exist) |
| `ios/.../Dex/DexSection.swift` | `PendingDexHop` stays for query-only; kind hops use existing `.dexHop` |

### Modified — Android

| File | What changes |
|---|---|
| `android/.../SlashCommands.kt` | Same parse as web oracle |
| `android/.../SlashCommandsTest.kt` | Clone new send cases |
| `android/.../ChatViewModel.kt` | Picker state, fan-out, intercept, `requestDex(query, kind)`, `requestUsage(slug)` |
| `android/.../Composer.kt` | Mount picker |
| `android/.../app/AppState.kt` | `SurfaceRequest.Usage(val slug: String? = null)` replacing `data object Usage` |
| `android/.../app/OakApp.kt` | Consume Usage slug: Dex tab + Usage section + `openSpecies` |
| `android/.../dex/DexScreen.kt` / `DexRoute.kt` | Accept one-shot usage slug / dex kind hop |
| `android/.../chat/ChatViewModelReducerTest.kt` | Slash calc still no POST; add help/bare/usage slug |

Do **not** modify: `GET /api/search` route, agent tools, `OakAnswer`,
CommandPalette, empty desk, composer placeholder, voice.

## Interface Definitions

Multi-worker seam — lockstep these shapes. Web tests are the oracle;
natives clone cases, not vibes.

### Send parse (`slash-commands.ts`)

```ts
export type SlashNavigateTarget = "new" | "team" | "dex" | "usage";

export type DexBind = {
  kind: "pokemon" | "move" | "ability" | "item";
  slug: string;
  displayName: string;
};

export type SlashCommandResult =
  | { type: "navigate"; target: SlashNavigateTarget }
  | { type: "calc"; rest: string }
  | { type: "help" }
  | { type: "bare" }
  | { type: "message" };

export function parseSlashCommand(
  text: string,
  { hasUsagePage }: { hasUsagePage: boolean },
): SlashCommandResult;

/** Remainder after the first token, trimmed. Empty string if none. */
export function slashArg(text: string): string;
```

Rules:

- `firstToken` = first `\S+` after leading whitespace.
- Compare `firstToken.toLowerCase()` to `/new` `/team` `/dex` `/usage`
  `/calc` `/help`.
- `/newish` → `message` (token is not exactly `/new`).
- After trim, text `=== "/"` → `bare` (optional surrounding whitespace
  already trimmed by send path; parser should treat `trim()` of the
  whole string `=== "/"` as `bare` **before** token match, or: token is
  `/` and `slashArg` is empty).
- `/help` with extra words → `help` (still handled; extra words ignored).
- `/calc` rest = substring after the token, trimmed (existing).
- `/usage` is `navigate usage` only when `hasUsagePage`; else `message`.
- Mid-sentence: first token does not start with `/` → `message`.

iOS/Android enums add `.help` and `.bare` (or equivalent).

### Picker model (`slash-picker.ts`)

```ts
export const SLASH_COMMANDS = [
  { token: "/new", hint: "New empty chat", trailingSpace: false, arg: "none" },
  { token: "/team", hint: "Open Teams", hintGuest: "Open Teams · sign in to save", trailingSpace: true, arg: "team" },
  { token: "/dex", hint: "Open Dex", trailingSpace: true, arg: "dex" },
  { token: "/usage", hint: "Open live usage", trailingSpace: true, arg: "usage" },
  { token: "/calc", hint: "Open calculator", trailingSpace: true, arg: "none" },
  { token: "/help", hint: "Show these commands", trailingSpace: false, arg: "none" },
] as const;

export type SlashPickerPhase =
  | { phase: "hidden" }
  | { phase: "commands"; prefix: string; rows: typeof SLASH_COMMANDS[number][] }
  | { phase: "args"; command: "dex" | "team" | "usage"; query: string }
  | { phase: "rest"; command: "calc" | "new" | "help" };

export function slashPickerPhase(text: string): SlashPickerPhase;

export function filterCommands(prefix: string): CommandRow[];
// commandToken.toLowerCase().startsWith(prefix.toLowerCase())
// prefix "/" → all six. "/newish" → [].

export function insertCommand(token: string): string; // trailing space iff catalog says so
export function insertName(commandToken: string, displayName: string): string;
// `"/dex Garchomp"` — single spaces, no trailing space required

export type DexNameRow = {
  kind: "pokemon" | "move" | "ability" | "item";
  slug: string;
  displayName: string;
  spriteUrl?: string;
};

/** Pokémon, then move, then ability, then item. Within a kind, keep input order.
 *  Dedupe kind+slug. Cap `limit` (default 8). */
export function mergeDexNameRows(
  byKind: { kind: DexNameRow["kind"]; matches: DexNameRow[] }[],
  limit?: number,
): DexNameRow[];

export function bindStillValid(bind: DexBind, composerText: string): boolean;
// parse is dex navigate AND slashArg equals bind.displayName (case-insensitive)

export const PICKER_CAPTION = "Insert, then send";
export const EMPTY_DEX = "No Dex matches";
export const EMPTY_USAGE = "No usage matches";
export const EMPTY_TEAMS = "No saved teams match";
export const EMPTY_TEAMS_GUEST = "Sign in to save teams";
```

Phase rules:

- Hidden unless the first non-space char is `/`.
- No space after first token → `commands` with that token as prefix
  (including `/`).
- Space after a known command with `arg: dex|team|usage` → `args`.
- Space after `/calc` `/new` `/help` → `rest` (no name rows).
- Unknown first token (`/foo`) → `hidden` (not an empty command list).

### Web search helper

```ts
export async function searchSlashDex(query: string, signal?: AbortSignal): Promise<DexNameRow[]>;
// Promise.all of searchEntities(kind, query, CHAMPIONS_FORMAT) for
// pokemon, move, ability, item. Per-kind slice 8. mergeDexNameRows(..., 8).
// Any kind fault → that kind []. Never throw.

export async function searchSlashUsage(query: string, signal?: AbortSignal): Promise<DexNameRow[]>;
// kind=pokemon only, cap 8.
```

Debounce 150ms in the Composer/VM, not inside the helper.

### Composer → parent

Keep `onSend(message, images)` and add optional meta:

```ts
onSend: (
  message: string,
  images: PendingImage[],
  slashMeta?: { dexBind?: DexBind },
) => void;
```

Composer `submit()`:

1. Always call `onSend(trimmed, pendingImages, { dexBind? })`.
2. Then `setValue("")` and `setPendingImages([])` (today’s clear).
3. Parent restores via existing `prefill` identity bump.

Parent `handleSend` (skip all hops when `recoveryRef === "edit"` — existing):

| Result | Parent action |
|---|---|
| `bare` or `help` | `setPrefill({ text: "/", images })` — new object identity. No POST. |
| `navigate new` | `handleNewChat()`. Prefill `{ text: "", images }` so images remain. |
| `navigate dex` | URL below. Prefill images. |
| `navigate team` | existing team match. Prefill images. |
| `navigate usage` | URL below. Prefill images. |
| `calc` | existing overlay + `rest`. Prefill images. |
| `message` | existing POST path. No prefill (Composer already cleared). |

Web Dex URL:

| Condition | `navigateTo` |
|---|---|
| no arg | `/pokedex` |
| `dexBind` valid | `/pokedex\|moves\|abilities\|items/${encodeURIComponent(bind.slug)}` |
| no bind: first `searchSlashDex(arg)` hit (await; if this is too slow on Send, use last picker results cached on Composer — **prefer last picker rows + bind**; if user typed without picking, fan-out once on send, Pokémon-first, first hit). Timeout/fault → `/pokedex` |
| nothing resolves | `/pokedex` |

Do **not** slugify into `/pokedex/{guess}` for unmatched names (avoids a
wrong-section 404). Kind map: pokemon→`/pokedex`, move→`/moves`,
ability→`/abilities`, item→`/items`.

Web Usage URL: no arg → `/usage` (not `/meta`). Species →
`/usage/${encodeURIComponent(slug)}`. Unresolved species → `/usage`.
Use last usage picker row if bind-equivalent (slug from the pokemon
search hit). Doubles remains default (no `?ladder=`).

Send-time Dex resolve for unpicked names: same merge order as picker
(**SD-BR-17**). Cache the last arg-phase rows on the Composer so Send
does not have to wait on network when the user picked or the list is
on screen. If the list is stale/empty, one fan-out on Send is allowed;
never block with a toast (**SD-BR-11**).

### Web keyboard (Composer)

Picker visible:

- ArrowDown / ArrowUp: move highlight; preventDefault.
- Enter (desktop, not composing, not shift): insert highlighted row;
  preventDefault; **do not** `submit()`. After insert of `/new` or
  `/help` (no arg phase), a **second** Enter may submit (picker now
  commands-phase with exact token, still visible — **first Enter
  already inserted**; if the highlighted row is that same command,
  Enter would insert again). Spec: if phase is `commands` and the
  composer text **exactly** matches `insertCommand(token)` with no
  extra arg **and** the user hits Enter, **submit** (hop / help).
  If phase is `args` or `rest`, Enter inserts or (rest) submits
  current text (`/calc foo` Send).
- Simpler rule builders must implement: **Enter inserts when a row is
  highlighted and the insertion would change the text; otherwise
  Enter submits.** Send button always submits current text
  (**SD-AC-8.3**).
- Escape: hide picker for this keystroke session (`pickerDismissed`
  flag) until the text’s leading token changes; keep text.
- Click outside: same dismiss flag.

Native: tap inserts; no arrow-key requirement. Back / tap outside
dismisses.

### iOS hops

- `/dex` no arg → `pendingDestination = .dex(query: nil)`
- `/dex` with bind or resolved kind → `.dexHop(DexArtifactHop(kind:, query: slug or displayName, format: .champions))`
- `/usage` → `.usage(slug: resolvedSlug or nil)` — already consumed in `UsageView`
- `/team` → existing `.teams` / `.team(id:)`
- `/help` / bare → `composerText = "/"`; do not clear `pendingImages`
- Other hops: `composerText = ""`; keep `pendingImages`

### Android hops

```kotlin
// AppState.SurfaceRequest
data class Usage(val slug: String? = null)  // replaces data object Usage
fun requestUsage(slug: String? = null)

// OakApp LaunchedEffect
is SurfaceRequest.Usage -> {
  selectedTab = OakTab.Dex
  pendingUsageSlug = req.slug
  pendingSelectDexSection = DexSection.Usage
}
is SurfaceRequest.Dex -> {
  selectedTab = OakTab.Dex
  // existing query/kind
}
```

`DexListScreen` / `DexRoute`: if pending section is Usage, `selectSection(Usage)`
then if slug non-null `usageViewModel.openSpecies(slug)` (existing).
Consume the one-shot so rotating the tab does not re-open.

`requestDex(query, kind)` already exists — slash must pass `kind` when
known; `query = null` for Dex index.

## Implementation Phases

Pinned commands (also Build Manifest + Deployment):

```text
test:        cd web && npm test
test_one:    cd web && npx vitest run <file> [-t "<name>"]
typecheck:   cd web && npm run typecheck
build:       cd web && npm run build
lint:        cd web && npm run lint
ios_test:    cd ios && xcodebuild test -scheme OakApp -only-testing:OakAppTests -destination 'platform=iOS Simulator,name=iPhone 17'
android_test: cd android && export JAVA_HOME=/opt/homebrew/opt/openjdk@17 && ./gradlew --no-daemon :app:testDebugUnitTest
```

jsdom/oracle tests: no Docker. Fullstack jsdom: no Docker. Do not run
the whole node Testcontainers suite for this pack unless a touched
file already requires it (none should).

Worktree: implement off `develop` per `AGENTS.md`
(`git worktree add ../oak-slash-discovery -b agent/slash-discovery develop`).
Three-client lockstep in **one** branch.

### P1 — Portable send parse + picker oracle

- **What:** Expand `slash-commands.ts` (`help`, `bare`, case-insensitive,
  export `slashArg`). Add `slash-picker.ts` catalog/phase/filter/insert/merge/bind.
  Tests are the native clone oracle (comment the case matrix like today’s
  slash-commands tests).
- **Depends on:** nothing
- **Produces:** stable parse + picker functions
- **Parallel:** none — sequential
- **Test focus:** `/DEX` → dex; `/` → bare; `/help extra` → help; `/newish`
  → message; `/de` filters to `/dex`; `/newish` prefix hides; merge order
  Pokémon→move→ability→item cap 8; bind drops on edit
- **Requirement refs:** SD-BR-1, SD-BR-4, SD-BR-5, SD-BR-6, SD-BR-10,
  SD-BR-17, SD-BR-18, SD-AC-1.2, SD-AC-1.3, SD-AC-1.4, SD-AC-4.3, SD-AC-7.1
  (classify only)

### P2 — Web picker, keyboard, hops

- **What:** `SlashAutocomplete`, Composer wiring, `slash-search.ts`,
  `page.tsx` intercept + URLs, `.slash-ac` CSS, fullstack tests.
- **Depends on:** P1
- **Produces:** web-complete feature
- **Parallel:** none within P2. **After P1**, P2 may run in parallel
  with P3 and P4 (disjoint globs).
- **Test focus:** type `/` shows six rows + caption; pick inserts
  trailing space; Enter inserts; Send hops without `fetch('/api/chat')`;
  `/usage garchomp` → `/usage/garchomp`; unmatched `/dex zzq` →
  `/pokedex`; `/help` prefills `/`; lone `/` no POST; edit last still
  POSTs `/new`; images remain on hop; guest `/team ` empty copy;
  `@` hidden while slash picker visible
- **Requirement refs:** SD-US-1, SD-US-2, SD-US-3, SD-US-4, SD-US-5,
  SD-US-6, SD-US-7, SD-US-8 (web), SD-AC-5.9, SD-BR-2, SD-BR-3,
  SD-BR-7, SD-BR-8, SD-BR-9, SD-BR-11, SD-BR-12, SD-BR-13, SD-BR-14,
  SD-BR-16

### P3 — iOS lockstep

- **What:** Clone oracles; picker UI; VM search fan-out; hops via
  `.dexHop` / `.usage(slug:)`; help/bare composer `/`; keep images.
- **Depends on:** P1
- **Produces:** iOS-complete feature
- **Parallel:** with P2 and P4 (no shared files)
- **Test focus:** clone P1 cases; VM: help/bare no stream; usage slug
  destination; dexHop kind; images not cleared; edit last still sends
- **Requirement refs:** same user-facing ACs as P2 except web keyboard
  (SD-AC-8.1–8.4). SD-AC-8.6, SD-AC-9.1

### P4 — Android lockstep

- **What:** Clone oracles; picker UI; VM fan-out; **Usage surface
  request gains slug**; Dex section Usage + `openSpecies`; kind on
  `requestDex`.
- **Depends on:** P1
- **Produces:** Android-complete feature
- **Parallel:** with P2 and P3
- **Test focus:** clone P1; VM hops; `requestUsage("garchomp")`;
  unmatched usage → `requestUsage(null)`; AppState Usage sealed change
  does not break existing `requestUsage()` call sites
- **Requirement refs:** same as P3. SD-AC-5.7 on Android is the gap
  today (`requestUsage()` ignores args).

### P5 — Three-client checkpoint

- **What:** No new product behavior. Confirm lockstep comments still
  match; grep that web fullstack, iOS, and Android all cover help/bare/
  usage-slug/dex-kind/images. Fix only drift found. Do not add palette
  rows or placeholder copy.
- **Depends on:** P2, P3, P4
- **Produces:** shippable branch
- **Parallel:** none
- **Test focus:** run P2 jsdom/fullstack + P3 `OakAppTests` slash + P4
  unit tests listed above
- **Requirement refs:** SD-US-9, SD-BR-15, SD-BR-19

### Integration checkpoints

| After | Name | Verifies |
|---|---|---|
| P1 | oracle-stable | Natives can clone without guessing phase/parse |
| P2 | web-hops | No `/api/chat` on handled slashes; Dex/Usage URLs; prefill `/` |
| P3 | ios-hops | Tab + path: Dex kind, Usage slug |
| P4 | android-hops | Dex Usage section + species detail; Dex kind |
| P5 | lockstep | Same commands, same empty copy, same “unknown = message” |

## Build Manifest

```yaml
commands:
  test: "cd web && npm test"
  test_one: "cd web && npx vitest run <file> [-t \"<name>\"]"
  typecheck: "cd web && npm run typecheck"
  build: "cd web && npm run build"
  lint: "cd web && npm run lint"
  ios_test: "cd ios && xcodebuild test -scheme OakApp -only-testing:OakAppTests -destination 'platform=iOS Simulator,name=iPhone 17'"
  android_test: "cd android && export JAVA_HOME=/opt/homebrew/opt/openjdk@17 && ./gradlew --no-daemon :app:testDebugUnitTest"
phases:
  - id: p1
    name: Portable send parse + picker oracle
    depends_on: []
    owns:
      - "web/src/lib/chat/slash-commands.ts"
      - "web/src/lib/chat/slash-commands.test.ts"
      - "web/src/lib/chat/slash-picker.ts"
      - "web/src/lib/chat/slash-picker.test.ts"
    shared: []
    requirement_refs: [SD-BR-1, SD-BR-4, SD-BR-5, SD-BR-6, SD-BR-10, SD-BR-17, SD-BR-18, SD-AC-1.2, SD-AC-1.3, SD-AC-1.4, SD-AC-4.3, SD-AC-7.1]
    test_focus: "case-insensitive parse; help/bare; prefix filter; merge cap 8; bind-valid"
    flags: []
  - id: p2
    name: Web picker, keyboard, hops
    depends_on: [p1]
    owns:
      - "web/src/lib/chat/slash-search.ts"
      - "web/src/lib/chat/slash-search.test.ts"
      - "web/src/components/chat/SlashAutocomplete.tsx"
      - "web/src/components/chat/SlashAutocomplete.test.tsx"
      - "web/src/components/chat/Composer.tsx"
      - "web/src/components/types.ts"
      - "web/src/app/page.tsx"
      - "web/src/app/globals.css"
      - "web/test/page-slash-discovery.fullstack.test.tsx"
    shared: []
    requirement_refs: [SD-US-1, SD-US-2, SD-US-3, SD-US-4, SD-US-5, SD-US-6, SD-US-7, SD-US-8, SD-AC-5.9, SD-BR-2, SD-BR-3, SD-BR-7, SD-BR-8, SD-BR-9, SD-BR-11, SD-BR-12, SD-BR-13, SD-BR-14, SD-BR-16]
    test_focus: "picker UI; no POST on hops; /usage slug; /help prefill; images kept"
    flags: [ui]
  - id: p3
    name: iOS lockstep
    depends_on: [p1]
    owns:
      - "ios/OakApp/Features/Chat/SlashCommands.swift"
      - "ios/OakApp/Features/Chat/SlashPicker.swift"
      - "ios/OakApp/Features/Chat/SlashAutocomplete.swift"
      - "ios/OakApp/Features/Chat/ChatViewModel.swift"
      - "ios/OakApp/Features/Chat/ComposerView.swift"
      - "ios/OakAppTests/SlashCommandsTests.swift"
      - "ios/OakAppTests/SlashPickerTests.swift"
      - "ios/OakAppTests/Chat/SlashDiscoveryViewModelTests.swift"
    shared: []
    requirement_refs: [SD-US-1, SD-US-2, SD-US-3, SD-US-4, SD-US-5, SD-US-6, SD-US-7, SD-AC-8.6, SD-AC-9.1]
    test_focus: "oracle clone; VM help/bare/usage slug/dexHop; images kept"
    flags: [ui]
  - id: p4
    name: Android lockstep
    depends_on: [p1]
    owns:
      - "android/app/src/main/kotlin/ai/gowtam/oak/features/chat/SlashCommands.kt"
      - "android/app/src/main/kotlin/ai/gowtam/oak/features/chat/SlashPicker.kt"
      - "android/app/src/main/kotlin/ai/gowtam/oak/features/chat/SlashAutocomplete.kt"
      - "android/app/src/main/kotlin/ai/gowtam/oak/features/chat/ChatViewModel.kt"
      - "android/app/src/main/kotlin/ai/gowtam/oak/features/chat/Composer.kt"
      - "android/app/src/main/kotlin/ai/gowtam/oak/app/AppState.kt"
      - "android/app/src/main/kotlin/ai/gowtam/oak/app/OakApp.kt"
      - "android/app/src/main/kotlin/ai/gowtam/oak/features/dex/DexScreen.kt"
      - "android/app/src/main/kotlin/ai/gowtam/oak/features/dex/DexRoute.kt"
      - "android/app/src/test/kotlin/ai/gowtam/oak/features/chat/SlashCommandsTest.kt"
      - "android/app/src/test/kotlin/ai/gowtam/oak/features/chat/SlashPickerTest.kt"
      - "android/app/src/test/kotlin/ai/gowtam/oak/chat/SlashDiscoveryViewModelTest.kt"
    shared: []
    requirement_refs: [SD-US-1, SD-US-2, SD-US-3, SD-US-4, SD-US-5, SD-US-6, SD-US-7, SD-AC-5.7, SD-AC-8.6, SD-AC-9.1]
    test_focus: "oracle clone; Usage(slug); requestDex kind; images kept"
    flags: [ui]
  - id: p5
    name: Three-client checkpoint
    depends_on: [p2, p3, p4]
    owns: []
    shared:
      - "web/src/lib/chat/slash-commands.ts"
      - "web/src/lib/chat/slash-picker.ts"
      - "ios/OakApp/Features/Chat/SlashCommands.swift"
      - "ios/OakApp/Features/Chat/SlashPicker.swift"
      - "android/app/src/main/kotlin/ai/gowtam/oak/features/chat/SlashCommands.kt"
      - "android/app/src/main/kotlin/ai/gowtam/oak/features/chat/SlashPicker.kt"
    requirement_refs: [SD-US-9, SD-BR-15, SD-BR-19]
    test_focus: "re-run P1–P4 targeted tests; fix lockstep drift only"
    flags: []
integration_checkpoints:
  - { after: [p1], name: oracle-stable, verifies: "parse + picker functions frozen for native clones" }
  - { after: [p2], name: web-hops, verifies: "handled slash does not POST; Dex/Usage URLs; /help prefills /" }
  - { after: [p3], name: ios-hops, verifies: "dexHop kind + usage slug + composer /" }
  - { after: [p4], name: android-hops, verifies: "Usage(slug) opens species; Dex kind hop" }
  - { after: [p5], name: lockstep, verifies: "three clients same commands and unknown=message" }
```

P5 `shared` is read-mostly drift repair. If a P5 worker must edit an
oracle file, it is **serialized** — do not run P5 in parallel with
anyone.

P2 lists `page.tsx` and `globals.css` and `Composer.tsx` — no other
phase owns them.

If Chat QoL fullstack assertions on `/usage` → `/meta` fail, **update
those few expects in P2** even though the file is not in `owns`. Treat
`web/test/page-chat-qol.fullstack.test.tsx` as **shared on collision**:
P2 may patch slash expects only. Do not reassign the file to two
phases.

## Technical Decisions

- **ADR-1 — Client classifier stays (Chat QoL ADR-10).** Handled slashes
  never hit the agent. Alternative: server dispatch. Rejected: extra
  latency, rate-limit confusion, out of scope.
- **ADR-2 — Fan-out `GET /api/search` (user 2A).** Four kinds in
  parallel, merge Pokémon-first, cap 8. Alternative: multi-kind query or
  `/api/slash-suggest`. Rejected for this pack.
- **ADR-3 — Intercept remains on the send path** (`page.tsx` /
  ViewModels). Composer always `onSend`s; parent prefills `/` for
  help/bare and restores images. Alternative: Composer swallows hops.
  Rejected: would break **edit last** (**SD-AC-2.5**) unless Composer
  learned recovery state.
- **ADR-4 — Dex bind is composer-local.** Same class as `@` tokens but
  not sent to the model. Survives insert-then-send for Metronome
  move vs item.
- **ADR-5 — Kind-aware Dex destinations.** Web section URLs; iOS
  `.dexHop`; Android `requestDex(query, kind)`. Unmatched → Dex index
  not a guessed species slug.
- **ADR-6 — Android `Usage(slug)`.** iOS already has it. Web uses
  `/usage` not `/meta`.
- **ADR-7 — Reuse mention visual language.** `.slash-ac` copies
  `.mention-ac` tokens. No new chrome system.
- **ADR-8 — Search debounce 150ms.** Matches `EntityPicker`. Fail-soft
  empty list, hop still works.

## Deployment & Infrastructure

Budget Tier: **hobby**

**Build & Test Commands:** see Implementation Phases / Manifest.

| Concern | Choice | Why hobby |
|---|---|---|
| Hosting | Existing Fly web machine | Picker is client-side; search GETs already exist |
| Database | Unchanged | No migration |
| Background jobs | None | |
| Object storage | None | |
| Caching | None new | Search remains request-time |
| Observability | Existing | No new events required; optional debug only |
| Secrets | Existing | No new keys |
| Environments | Local Docker + Fly prod | Unchanged |

**Rough monthly cost:** **$0** incremental. Extra `GET /api/search`
while typing uses the existing public-read limiter. Hops save model
turns.

## UI Reference

Follow **Enamel & Paper** plus existing composer/mention patterns:

- [`docs/design/enamel-paper.md`](../../../design/enamel-paper.md)
- Existing `.mention-ac` in `web/src/app/globals.css`
- iOS `MentionAutocomplete.swift` / Android `MentionAutocomplete.kt`

Do not restyle the empty desk or change `Ask Oak`. Caption on the open
picker only: `Insert, then send`.

Picker `role="listbox"`, rows `role="option"`, accessible name **Slash
commands**. Highlighted web row `aria-selected="true"`.

## Unresolved from Requirements

None. Presentation left to builders: optional species sprite on Dex
rows (allowed, not required); wrap vs clamp of arrow-key highlight
(must still have at most one highlighted row).
