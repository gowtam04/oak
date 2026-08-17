# Chat QoL — Deployment

Budget Tier: **hobby**

No new hosting. Same Fly web app (`oak-gowtam`), same Postgres, same Redis.
Public share views are extra **read** traffic on the existing machine.
They must never start a model turn.

## Build & Test Commands

Source of truth — keep the Build Manifest identical.

- **test:** `cd web && npm test`
- **test_one:** `cd web && npx vitest run <file> [-t "<name>"]`
- **typecheck:** `cd web && npm run typecheck`
- **build:** `cd web && npm run build`
- **lint:** `cd web && npm run lint`
- **migrate:** `cd web && npm run db:migrate` (or `npm run docker:migrate`)
- **iOS tests:** `cd ios && xcodebuild test -scheme OakApp -only-testing:OakAppTests -destination 'platform=iOS Simulator,name=iPhone 17'`
- **Android tests:** `cd android && export JAVA_HOME=/opt/homebrew/opt/openjdk@17 && ./gradlew --no-daemon :app:testDebugUnitTest`

jsdom/component tests do not need Docker. Node/integration tests need Docker (Testcontainers Postgres + Redis).

## Infra choices (hobby)

| Concern | Choice | Why this fits hobby |
|---|---|---|
| Hosting / runtime | Existing Fly `shared-cpu` web machine | No second process |
| Database | Existing Postgres | Additive migration only |
| Background jobs | None | Undo = Stop; no expiry cron (indefinite shares until revoke/account delete) |
| Object storage | None | Snapshots and PDFs are Postgres / on-the-fly buffers |
| Caching | `Cache-Control: private, no-store` on `/a/[id]` | Revoke must not serve a stale public card |
| Observability | Existing pino | Log share create/revoke/import at info; no PII beyond current turn_record practice |
| Secrets | Existing env | No new keys |
| Environments | Existing local Docker + Fly prod | No staging app |

**New dependencies:** `nanoid`, `pdfkit` (and types if needed). Refresh the anonymous Docker `node_modules` volume after install.

**New env vars:** none.

**Migration:** apply `0019_chat_qol` (or next id) before deploy. Ingest is unchanged. No re-ingest.

**Cost bucket:** **$0** extra beyond the current Fly + Postgres + Redis bill. PDF generation is request-scoped CPU on export only (signed-in, rare).

## Deploy sequence

1. Merge to `develop`.
2. `fly deploy` from `web/` after migrate (existing migrate-on-release path if any; otherwise run `npm run db:migrate` against prod `DATABASE_URL` first).
3. Ship iOS TestFlight only after the API is live (new fields are additive; old clients ignore them).
4. Android same.

Old clients: still chat. They will not see retry/share/folders until updated. Server accepts omitted `recovery` / `mentioned_team_ids`.

## Ops

- No moderation queue.
- Revoke is owner-only; account deletion removes remaining live URLs.
- Watch Fly memory after pdfkit lands; if an export OOM appears, cap export to conversations under a generous message count (e.g. 200 turns) with `413` — document if added, do not add preemptively unless tests show pain.
