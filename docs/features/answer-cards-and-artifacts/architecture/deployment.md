# Answer cards and artifacts — Deployment

Budget Tier: hobby

No new Fly app, Redis feature, object store, or env var. Pins and
`answer_density` live in the existing Postgres. Calc and voice
compile run on the existing always-on machine.

## Build & Test Commands

Source of truth (keep the Build Manifest identical):

```text
test:         cd web && npm test
test_one:     cd web && npx vitest run <file> [-t "<name>"]
typecheck:    cd web && npm run typecheck
build:        cd web && npm run build
lint:         cd web && npm run lint
ios_test:     cd ios && xcodebuild test -scheme OakApp -only-testing:OakAppTests -destination 'platform=iOS Simulator,name=iPhone 17'
android_test: cd android && ./gradlew --no-daemon :app:testDebugUnitTest
```

Apply schema: `cd web && npm run db:migrate` (or `docker:migrate`).
**No re-ingest.**

After any new npm dependency (this pack expects **none**): refresh
the Docker `node_modules` volume (existing gotcha).

## Infra choices (hobby)

| Concern | Choice | Why this fits hobby |
|---|---|---|
| Hosting | Existing Fly `oak-gowtam` | Calc is a JSON POST; compile is one extra model call per voice turn |
| Database | Existing Postgres | Two additive objects (`answer_density`, pin table) |
| Background jobs | In-process `void compile` + AbortController | Same as `recordTurn` / turn store. Lost on process restart (accepted; Retry remains) |
| Object storage | None | Snapshots are JSON in Postgres |
| Caching | Existing entity viewer cache + no new Redis keys | Calc is cheap enough uncached |
| Observability | Existing logger | Log compile fail / pin_cap / calc unresolved |
| Secrets | Existing `XAI_API_KEY` | Compile uses `activeModelKey()` |
| Environments | Existing local Docker + prod | No staging app |

## Voice compile vs process restart

Hydrate registry and tool-trace are `globalThis`. A deploy mid-
hydrate leaves the thin card; the user taps Retry (needs the trace
— if gone, compile runs on speech only). Document in operator
notes; do not add Redis for this pack.

## Cost

**~$0 extra.** Same machine, same DB. Voice compile adds model
tokens on signed-in voice turns only; it must not increment the
user-visible ask counter (ADR-7).

## Privacy copy

If voice is described as “transcript only,” update
`operator-access-disclosure` / privacy to say a voice turn may
later hold a full structured answer (same operator read as text).
No new public surface.

## Chat QoL test debt

When `/calc` becomes a handled slash, update Chat QoL tests that
assert `/calc` is unknown text (`slash-commands.test.ts`,
`SlashCommandsTests.swift`, `SlashCommandsTest.kt`, and any
fullstack “unknown slash → POST”). This pack owns that flip
(ADR-4).
