# Component Design (Android)

Layered MVVM: **Composables** → **ViewModels** (`androidx.lifecycle.ViewModel`,
`StateFlow<UiState>`) → **Services** (domain operations, interface + `Live…` + `Fake…`) →
**Networking** (`OakApiClient` + `SseClient` + kotlinx.serialization DTOs). Lower layers
never import upper layers. Services are interfaces so ViewModels unit-test against fakes.
This is the class-for-class Kotlin port of `ios/OakApp/`.

> **No "active team".** Saved teams are referenced **by name in chat** (`list_teams` →
> `get_team`); the composer has no active-team chip, `ChatService.send` carries no
> `activeTeamId`, and `ConversationDetail` has no `activeTeamId`. (Parity with the iOS
> post-2026-06 state.)

## Package tree (single `:app` module, feature packages — DADR-9)

Source root: `android/app/src/main/java/ai/gowtam/oak/`. Tests:
`android/app/src/test/java/ai/gowtam/oak/` (JVM unit) and
`android/app/src/androidTest/java/ai/gowtam/oak/` (Compose instrumentation). Fixtures:
`android/app/src/test/resources/fixtures/` (copied from `ios/OakAppTests/Fixtures/`).

```
ai/gowtam/oak/
├── app/
│   ├── OakApplication.kt          — Application; builds ServiceContainer.live()
│   ├── MainActivity.kt            — single Activity; hosts the Compose NavHost; wake-lock owner
│   ├── AppState.kt                — session/root state (auth, active conv id, in-memory guest thread + scope)
│   ├── RootScaffold.kt            — Material 3 Scaffold + NavigationBar (3 tabs) + NavHost
│   └── ServiceContainer.kt        — composition root (live() + preview()); LocalServices CompositionLocal
├── networking/
│   ├── OakApiClient.kt            — OkHttp; typed suspend requests; Bearer header; error mapping
│   ├── Endpoint.kt                — request descriptor (method, path, query, body, requiresAuth)
│   ├── SseClient.kt               — POST /api/chat & /api/teams/assistant → Flow<…SseEvent>
│   ├── ByteLineSplitter.kt        — pure byte→line splitter, PRESERVES empty lines (0x0A)
│   ├── SseParser.kt               — pure incremental chat SSE frame parser (SseLineParser)
│   ├── BuilderSseParser.kt        — pure incremental teams-assistant SSE parser (SseLineParser)
│   ├── TokenStore.kt              — EncryptedSharedPreferences (Keystore) token CRUD
│   ├── OakError.kt                — typed error domain + HTTP→OakError mapping
│   └── BaseUrl.kt                 — per-variant base URL (OAK_STAGING flag)
├── wire/                          — @Serializable DTOs + the 4 ported pure functions (data-model.md)
│   ├── ChatWire.kt   OakAnswer.kt   JsonScalar.kt   Team.kt   TeamsAssistantWire.kt
│   ├── Conversation.kt   EntityArtifact.kt   DexLookup.kt   AuthDtos.kt   Format.kt
├── services/                      — each = interface + Live… (+ Fake… in test)
│   ├── AuthService.kt   ChatService.kt   HistoryService.kt   TeamService.kt
│   ├── ArtifactService.kt   DexLookupService.kt   TeamsAssistantService.kt   ImageEncoder.kt
├── features/
│   ├── chat/
│   │   ├── ChatViewModel.kt       — the SSE reducer + stream-resilience state machine (DADR-13)
│   │   ├── ChatScreen.kt          — thread + composer (auth-adaptive; history folded in)
│   │   ├── Composer.kt            — text, attach (photo picker/camera), thumbnails, send↔stop
│   │   ├── StreamingStatus.kt     — tool-activity ticker + thinking/using-tools/answering phase
│   │   └── answercard/
│   │       ├── AnswerCard.kt      — orchestrates field-by-field rendering (exact order below)
│   │       ├── StatusBadge.kt  ScopeTag.kt  CaveatStrip.kt  Subjects.kt  ClarifyQuestion.kt
│   │       ├── CandidatesTable.kt  DamageCalc.kt  TeamBlocks.kt  Suggestions.kt
│   │       ├── Reasoning.kt  Citations.kt  Inferences.kt
│   ├── artifact/
│   │   ├── ArtifactViewModel.kt   — bottom-sheet back stack (push/back/dismiss)
│   │   ├── ArtifactSheet.kt       — ModalBottomSheet host
│   │   ├── EntityDetail.kt        — pokemon/move/ability/item/type profiles
│   │   └── ComparisonView.kt      — 2-subject compare
│   ├── auth/
│   │   ├── AuthViewModel.kt   AuthScreen.kt   — email → 6-digit OTP (autofill), resend cooldown
│   ├── account/
│   │   ├── AccountViewModel.kt   AccountScreen.kt   — sign in/out, tier, DELETE account (confirm)
│   ├── history/
│   │   ├── HistoryViewModel.kt   HistoryList.kt   — search/format-filter/pin/rename/delete/resume
│   │   └── (guest→sign-in import handoff lives in AppState + ChatViewModel)
│   └── teams/
│       ├── TeamsListViewModel.kt   TeamsList.kt
│       ├── TeamEditorViewModel.kt  TeamEditor.kt  — full-set editor + entity pickers
│       ├── EntityPickerField.kt    ShowdownImport.kt
│       ├── TeamsAssistantViewModel.kt  TeamsAssistantSheet.kt  — patch apply/undo card
└── ui/
    ├── Theme.kt                   — Material 3 color scheme (Oak tokens, light/dark, dynamic type)
    ├── TypeBadge.kt               — Pokémon type chip (color + label — never color-only)
    ├── SpriteImage.kt             — Coil AsyncImage w/ placeholder/failure
    ├── MarkdownBlocks.kt          — streaming-safe block splitter + renderer incl. GFM tables
    └── ConnectionState.kt         — offline/retry surface
```

Ownership rule: one purpose per file; the AnswerCard is split per-field so the
field-by-field renderer can be built in parallel. No two phases' owned paths overlap (see
the Build Manifest in `implementation-plan.md`).

## Networking layer

- **`OakApiClient`** — owns one `OkHttpClient` (no `CookieJar`), the base URL, and one
  kotlinx `Json`. Exposes `suspend fun <T> send(endpoint, deserializer): T` and
  `suspend fun sendNoContent(endpoint)`; attaches `Authorization: Bearer` from `TokenStore`
  when `endpoint.requiresAuth`. Maps every response via `OakError.validate`. Also
  `suspend fun openByteStream(endpoint): Response` for `SseClient` (attaches Bearer + base
  URL, sets `Accept: text/event-stream`, and on a **pre-stream** non-2xx reads the small
  `{ code, message }` body and throws the mapped `OakError`). OkHttp is thread-safe, so this
  is a plain class — no actor needed (the iOS `actor` requirement is a Swift-concurrency
  artifact).
- **`SseClient`** — runs `POST /api/chat` (and `/api/teams/assistant`) and turns the byte
  stream into a cold `Flow<SseEvent>` / `Flow<BuilderSseEvent>`. It reads
  `response.body.source()` as raw bytes, splits with `ByteLineSplitter` (**preserving empty
  lines**), feeds each line through the appropriate parser, and emits decoded events.
  `stream()` and `streamBuilder()` share one generic `openEventStream(endpoint, makeParser)`
  loop. Cancelling the collecting coroutine cancels the OkHttp `Call` (via
  `awaitClose { call.cancel() }` in a `callbackFlow`, or `currentCoroutineContext().isActive`
  checks in a `flow{}`).
- **`ByteLineSplitter`** *(pure)* — emits a line on every `0x0A`, **including the empty
  string** between consecutive newlines. Splitting on the ASCII byte `0x0A` is UTF-8-safe
  (it never appears inside a multi-byte sequence). A trailing `\r` is left on the line for
  the parser to strip. This is the mandatory fix for the #1 parity risk (DADR-6).
- **`SseParser` / `BuilderSseParser`** *(pure, `SseLineParser`)* — accumulate `event:`/`data:`
  field lines, emit one event per blank-line-terminated frame, ignore `:`-comment
  heartbeats and unknown fields. A recognized event whose `data:` JSON fails to decode
  throws `OakError.Decoding(...)`; an **unknown event name is ignored** (forward-compatible —
  e.g. `BuilderSseParser` ignores a stray `scope` frame). Both are unit-tested against
  recorded `.sse` fixtures.
- **`TokenStore`** — the only component that touches secure storage. Reads/writes/clears the
  token in `EncryptedSharedPreferences` (Keystore-backed `AES256_GCM`). Never logs the
  token; failures log a code only.
- **`OakError`** — the one error domain: `Transport(underlying)`, `Http(status, code,
  message)`, `RateLimited(retryAfter)`, `Unauthorized`, `Decoding(typeName)`,
  `ImageRejected(reason)` where `reason ∈ { TooMany, PerImageTooLarge, TotalTooLarge,
  UnsupportedType }`. `validate(response) → Result<ResponseBody, OakError>` maps 2xx→ok,
  401→Unauthorized, 429→RateLimited(parse `Retry-After`), else→Http(envelope).

## Services layer (interface + `Live…`; `Fake…` in test) — signatures ported from iOS

```kotlin
interface AuthService {
  suspend fun requestCode(email: String)
  suspend fun verify(email: String, code: String): Account          // stores token on success
  suspend fun me(): AuthState                                         // Guest / SignedIn(email)
  suspend fun signOut()                                              // best-effort revoke, then always clear
  suspend fun deleteAccount()                                        // DELETE, then clear token (401 ⇒ still clear)
}
data class Account(val email: String, val created: Boolean)
sealed interface AuthState { data object Guest : AuthState; data class SignedIn(val email: String) : AuthState }

interface ChatService {   // returns the stream immediately; encodes images BEFORE opening it
  fun send(sessionId: String, message: String, images: List<Bitmap>, scopeSeed: Format?): Flow<SseEvent>
}

interface HistoryService {   // signed-in only; list() returns [] for guests
  suspend fun list(query: String?, format: Format?): List<ConversationSummary>
  suspend fun get(id: String): ConversationDetail
  suspend fun rename(id: String, title: String)
  suspend fun setPinned(id: String, pinned: Boolean)
  suspend fun delete(id: String)
  suspend fun importGuestThread(sessionId: String, format: Format, turns: List<ChatTurn>): String?
}

interface TeamService {
  suspend fun list(format: Format?): List<TeamSummary>               // projection, not full teams
  suspend fun get(id: String): Pair<Team, List<TeamWarning>>
  suspend fun create(format: Format, name: String?, members: List<TeamMember>?): Pair<Team, List<TeamWarning>>
  suspend fun update(id: String, name: String?, members: List<TeamMember>?): Pair<Team, List<TeamWarning>>
  suspend fun delete(id: String)
  suspend fun duplicate(id: String): Pair<Team, List<TeamWarning>>
  suspend fun importPaste(format: Format, paste: String): Triple<Team, List<TeamWarning>, List<ImportNote>>
  suspend fun exportPaste(id: String): String
}

interface ArtifactService {   // NEVER throws — every fault folds to null (the one exception to DADR-8)
  suspend fun entity(kind: EntityKind, q: String, format: Format): EntityArtifact?
  suspend fun savedTeam(id: String): Pair<Team, List<TeamWarning>>?
}

interface DexLookupService {  // public/read-only; never throws — folds faults to empty
  suspend fun search(kind: EntityKind, query: String, format: Format): List<SearchMatch>
  suspend fun learnset(pokemon: String, format: Format): List<LearnsetMove>
  suspend fun sprites(names: List<String>, format: Format): Map<String, DexSpriteRef>   // empty names ⇒ {}
}

interface TeamsAssistantService {   // signed-in only; 401 ⇒ Unauthorized thrown from the flow
  fun send(sessionId: String, message: String, draft: TeamsAssistantDraft): Flow<BuilderSseEvent>
}
```

**`ImageEncoder`** *(pure)* — `Bitmap` → validated `ChatImage` with the exact iOS caps:
`maxImages = 4`, `maxImageBytes = 3_932_160`, `maxTotalBytes = 10_485_760`,
`maxDimension = 1568`. `fun encode(images: List<Bitmap>): List<ChatImage>` (throws
`OakError.ImageRejected(reason)`). Per-image `reencode`: (1) downscale longest edge to
≤1568px; (2) if the image has alpha and its PNG fits `maxImageBytes` → `image/png`;
(3) else a JPEG quality-then-dimension fit loop — step quality down `[0.8, 0.6, 0.45, 0.3]`
picking the highest that fits, up to 4 attempts, shrinking dimensions ×0.8 between attempts;
(4) fall back to the smallest JPEG (caller reports `PerImageTooLarge` if still over) or PNG.
`data` is **raw base64, no `data:` prefix**. Transcodes any decodable source (incl. HEIC via
`BitmapFactory`/`ImageDecoder`) into JPEG/PNG.

## App / session state

- **`AppState`** *(exposed via `LocalAppState` / an `AppStateHolder`)* — the root session
  model: `authState` (`Guest`/`SignedIn(email)`), `activeConversationId`, the in-memory
  guest thread (turns + resolved scope), and the champions/scope default. Coordinates the
  **guest→sign-in handoff**: after `verify`, if a guest thread exists, call
  `HistoryService.importGuestThread(sessionId, guestThreadScope, turns)`; the returned id
  becomes the active conversation. Failure is non-fatal (keep the on-screen thread).
- **`ServiceContainer`** — the composition root (`live()` builds one `TokenStore` + one
  `OakApiClient` shared by every service; `preview()` uses fakes in DEBUG). Provided through
  a `LocalServices` `CompositionLocal` and handed to ViewModels via a
  `ViewModelProvider.Factory` (so ViewModels get **interfaces**, never `Live…` concretes).

## ViewModels

- **`ChatViewModel`** — the SSE reducer + the full stream-resilience state machine (DADR-13):
  `turns`, `streamingText`, `toolActivities`, `isStreaming`, `errorBanner`,
  `resolvedScope`/`resolvedScopeSource`/`scopeSeed` (+ `displayFormat =
  scopeSeed ?? resolvedScope ?? Champions`), `pendingImages`. Reducer: `scope` adopts the
  turn's scope and clears `scopeSeed`; `tool_activity` appends; `answer_start` clears the
  streamed buffer (keeps tool history); `answer_delta` appends; terminal `answer` commits the
  authoritative `OakAnswer` and stops; `error` → recoverable banner (never auto-retried).
  Stop handling: a stop within `QUICK_STOP_MS = 2000` of send **wipes the thread + rotates
  the session + restores the message** (quick-stop); a later stop keeps the answerless turn.
  Screen-off auto-reconnect: a `transport` drop while `hiddenDuringTurn` (armed by
  `ON_STOP`) retries once (`MAX_RETRIES = 1`), immediately if foregrounded else on `ON_START`
  ("Reconnecting…"). Holds `FLAG_KEEP_SCREEN_ON` for the stream duration. Mirrors the FULL
  answer into the guest thread. **Grok delivers the answer in one `answer_delta` — the
  reducer must not assume many.**
- **`AuthViewModel`** — email/OTP entry, 6-digit boxes, SMS/autofill, resend cooldown, error
  surfacing (invalid/expired/rate-limit), sign-out.
- **`HistoryViewModel`** — list (search/format-filter/pin/rename/delete), resume → hands the
  conversation's turns + `format` to `ChatViewModel.loadResumed`.
- **`TeamsListViewModel`** / **`TeamEditorViewModel`** — library + full-set editor. The editor
  holds a fixed `format`, `members` (0–6 `EditableMember`), `warnings` (warn-but-allow),
  transient `spriteRefsBySpecies`/`movepoolByMemberId`, static natures/tera types. Entity
  pickers: `search` (species/item typeahead, scoped to format) → per-member `learnset`
  (the move picker offers ONLY legal moves) → batched `sprites` (fills types/abilities/stats
  and **auto-forces the Mega stone** into the held-item field via `requiredItem`,
  forward-only/idempotent). Ability picker options come from the sprite ref's `abilities`.
  `save` is create-or-update, never blocked by warnings.
- **`TeamsAssistantViewModel`** — holds a live ref to the `TeamEditorViewModel`. Reducer over
  `BuilderSseEvent` (activity/start/delta/answer/error); `send` streams with the LIVE editor
  draft. **Apply/Undo:** `apply(turn)` snapshots the current draft, records the turn id, and
  runs `applyTeamPatch` on the draft (DB untouched — the user still Saves); `undo()` restores
  the snapshot (in-memory) and is offered only on the last-applied turn. `describeTeamPatch`
  renders the proposed-changes card.
- **`ArtifactViewModel`** — the bottom-sheet back stack: `push(entity)`, `back()`, `dismiss()`;
  one artifact visible at a time. Entity fetch returns `null` gracefully; team artifacts use
  the inline `proposed_team` (no fetch).
- **`AccountViewModel`** — sign in/out, tier/limit display, account deletion (confirm flow).

## AnswerCard render order (exact — mirrors `ios/…/AnswerCardView.swift`)

Each block renders only when its field is present (predicate in parens):

1. **status badge** — non-`answered` outcomes only (`status != ANSWERED`)
2. **scope tag** — `generation_basis` masthead (`generation` non-blank)
3. **caveat strip** — merged `uncertainty_flags` + `generation_basis.fallback`/note
4. **answer markdown** — `MarkdownBlocks(answerMarkdown)` (always)
5. **subjects** — per-subject cards (+ "Compare in viewer" when ≥ 2)
6. **clarify question** — options (each `label` sent verbatim on tap)
7. **candidates table** — (+ "Show all N")
8. **damage calc** — (+ "Open in viewer")
9. **team blocks** — proposed/saved team + warnings (+ "Open team in viewer" / "Apply")
10. **suggestions**
11. **reasoning** — collapsible, closed by default
12. **citations** — collapsible "Sources"
13. **inferences**

Entities inside subjects/candidates/team blocks/movepool are tappable and push an artifact.

## Navigation graph (3 tabs — `navigation-compose`)

A single `MainActivity` hosts a `NavHost` inside a Material 3 `Scaffold` with a
`NavigationBar` of **three** destinations. The Artifact sheet is a `ModalBottomSheet`
overlaid on whatever tab is active (co-visible with chat), not a tab.

```
NavigationBar
├── Chat      (route "chat")     — auth-adaptive: guest or signed-in; History is folded IN
│                                   (a history drawer/list surface reachable from the Chat
│                                   top bar → resume opens back into ChatScreen). Scope chip
│                                   in the top bar (six scopes; champions default).
├── Teams     (route "teams")    — signed-in-GATED: a guest sees a sign-in prompt, not a 401.
│                                   TeamsList → TeamEditor (+ TeamsAssistant ModalBottomSheet).
└── Account   (route "account")  — sign in/out, tier, delete account.

Overlays (not tabs):
  Artifact ModalBottomSheet   — pushed from any tappable entity; own back stack; swipe-down
                                dismiss; "Ask about this in chat" prefills the composer.
  Auth screen                 — presented from Account (or a sign-in prompt in Teams/History).
```

Back-gesture / system back: the predictive-back gesture pops the artifact sheet first (if
open), then the nav back stack; on the root of a tab it follows standard Android behavior.
`History` is **folded into the Chat tab** (not its own tab) per the plan — a signed-in user
reaches saved threads from the Chat surface and resuming returns to `ChatScreen`.
</content>
