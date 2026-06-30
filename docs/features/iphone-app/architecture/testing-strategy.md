# Testing Strategy

**Developer mode.** How the iOS client is tested. The `web/` Phase 2 changes are tested
with the existing Vitest + Testcontainers setup (`web/CLAUDE.md`) and aren't restated here
beyond their gates.

## Frameworks
- **Swift Testing** (`import Testing`, `@Test`/`#expect`) for unit, decoding, and
  view-model tests — modern, iOS 18/Xcode 16-era (ADR-4).
- **XCUITest** for a thin end-to-end UI suite (the critical chat flow + a couple of
  cross-feature paths).
- Run commands are in `deployment.md` → Build & Test Commands (mirrored in the Build
  Manifest); CI runs the simulator suite on `ios/**` PRs.

## Unit vs integration split
- **Unit (the bulk):**
  - **DTO decoding/round-trip** (Phase 3) — decode committed real-response fixtures for
    every endpoint and every `OakAnswer` status; encode/decode request bodies and
    `JSONScalar`. This is the contract-drift guard against `web/`.
  - **SSEParser** — reconstruct the exact `SSEEvent` sequence from recorded byte streams
    (multi-frame, heartbeat comments, the single-delta Grok case, terminal `answer` and
    `error`).
  - **OakError mapping** — 429+`Retry-After`, 401, 4xx/5xx envelopes, transport.
  - **ViewModels** — every VM against `Fake…` services: chat stream reducer
    (delta/start/answer/error), auth (invalid/expired/cooldown/rate-limit/expiry→guest),
    history (list/search/filter/mutations/resume/import), teams (CRUD/warn-but-allow/
    Showdown round-trip/apply-proposed/active-team), artifact back-stack, account deletion.
  - **ImageEncoder** — cap logic + typed rejection + raw-base64 output.
  - **TokenStore** — Keychain CRUD + survives relaunch + cleared on signout/deletion.
- **Integration (a few, against staging backend):** networking smoke (CP1), auth e2e
  (CP2), signed-in data round-trip (CP4). These hit the real API to catch contract reality
  vs fixtures.
- **E2E (XCUITest, Phase 13 / CP5):** launch → ask a question → tool activity + streamed
  answer renders; guest→sign-in→history; active-team→chat→artifact; offline → retry
  surface (no crash).

## Mocking policy
- **Real:** the SSE parser, error mapping, all DTO decoding (real fixtures, never
  hand-written stubs), Keychain (against the real test Keychain), the structured
  view-model logic.
- **Faked:** service **protocols** are faked for view-model unit tests (`Fake…` returns
  canned DTOs / streams / errors). The network itself is faked at the service seam for
  unit tests — no live calls in the unit suite.
- **Live only in the integration/E2E suites** (CP1/CP2/CP4/CP5), pointed at staging, gated
  so they don't run in the fast PR unit job by default.
- Fixtures are **captured from the real backend** (or reused from `web/`'s test fixtures)
  and committed — they are the source of truth for "what the wire looks like."

## Coverage target
- Bias coverage to the high-risk seams: DTO decoding, SSE parsing/reducing, error mapping,
  and the view-model logic. Aim ~80% on `Networking/`, `Services/`, `Models/Wire/`, and
  the view-model files. Pure SwiftUI view bodies are exempt from a line target (covered by
  snapshot/XCUITest where it matters); `CameraPicker`/system-picker wrappers are exempt.

## Fixture conventions
- Live under `ios/OakAppTests/Fixtures/` as `.json` (REST responses, one per endpoint ×
  status) and `.sse` (raw recorded chat streams). Name by endpoint + scenario
  (`chat_answered_full.sse`, `conversations_list.json`, `oakanswer_clarification.json`).
- Build test DTOs from fixtures, not from inline literals, so a contract change fails
  decoding loudly.
- A `Fixtures.load(_:)` helper reads a named fixture; a "decode every fixture" parameterized
  test ensures none rot.

## Per-phase gates (summary; see implementation-plan.md for detail)
- P2 (backend) and P5/P12 (auth, deletion) additionally require a **security review**
  (auth path, cascade correctness / no cross-account deletion, token handling).
- P7/P11 add a **design review** (brand fidelity, gesture feel).
- P13 is the final integration/parity/accessibility/offline gate before submission.

## What is NOT tested here
- The agent's reasoning quality / the OakAnswer *content* — that's the backend's eval suite
  (`web/eval/`, `docs/agent-design/evaluation.md`), unchanged. The client only tests that
  it faithfully **renders and round-trips** whatever the contract delivers.
