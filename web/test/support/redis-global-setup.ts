/**
 * Vitest globalSetup for the NODE project — starts one Redis container for the
 * whole run and publishes its connection URI to the workers.
 *
 * Mirrors test/support/pg-global-setup.ts exactly: runs once in the Vitest main
 * process (before any worker spawns), the only reliable channel to workers is
 * `provide`/`inject`, so we publish the URI as `REDIS_CONN_URI`.
 *
 * IMPORTANT: this does NOT set `process.env.REDIS_URL` anywhere — by default,
 * every test still runs against the in-process (memory) backend. Redis-backed
 * suites opt in explicitly per test via `vi.stubEnv("REDIS_URL", inject(...))`
 * (see src/server/redis.test.ts).
 *
 * Requires a reachable Docker daemon during `npm test` (Testcontainers). The
 * jsdom project has NO globalSetup, so component tests still run without Docker.
 */

import {
  RedisContainer,
  type StartedRedisContainer,
} from "@testcontainers/redis";

// The connection URI for the shared container is published via Vitest's
// `provide`; declare its type here for `inject` (mirrors PG_CONN_URI's
// augmentation living in test/support/pg.ts, a support module, rather than in
// any one consuming test file — so a redis-backend suite typechecks
// regardless of which other suites exist alongside it).
declare module "vitest" {
  interface ProvidedContext {
    REDIS_CONN_URI: string;
  }
}

let container: StartedRedisContainer | undefined;

// Vitest's globalSetup context exposes `provide`; type it inline (the named
// GlobalSetupContext isn't re-exported in this Vitest version).
type SetupContext = { provide: (key: "REDIS_CONN_URI", value: string) => void };

export async function setup({ provide }: SetupContext): Promise<void> {
  container = await new RedisContainer("redis:7-alpine").start();

  provide("REDIS_CONN_URI", container.getConnectionUrl());
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
