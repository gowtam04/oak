import { defineConfig } from "vitest/config";
import { shared } from "./vitest.shared";

// Two projects (the supported replacement for the deprecated `workspace`
// config): a Node project for backend/unit tests and a jsdom project for
// React component tests. Both extend the shared config so `@/` resolves.
//
// A dummy XAI_API_KEY (the now-required primary key) is injected for every test
// run so unit tests can import src/env.ts (which rejects a missing key) and can
// never reach the API. A dummy ANTHROPIC_API_KEY is also injected so Claude code
// paths (the optional provider) stay configured/selectable under test.
export default defineConfig({
  ...shared,
  test: {
    passWithNoTests: true,
    env: {
      XAI_API_KEY: "test-dummy-xai-key",
      ANTHROPIC_API_KEY: "test-dummy-anthropic-key",
      NODE_ENV: "test",
    },
    projects: [
      {
        extends: true,
        test: {
          name: "pkmn",
          environment: "node",
          // Showdown pin / gen-provider gates — fully offline, no Testcontainers.
          include: [
            "src/data/pkmn/**/*.test.ts",
            "src/data/formats.test.ts",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: [
            "src/**/*.test.ts",
            "test/**/*.test.ts",
            "eval/**/*.test.ts",
          ],
          exclude: [
            "src/components/**",
            // Portable chat oracles (slash parse/picker/search) are Docker-free
            // jsdom unit tests — slash-discovery architecture.
            "src/lib/chat/**/*.test.ts",
            // Offline pin/loader gates — `pkmn` project (no Postgres).
            "src/data/pkmn/**/*.test.ts",
            "src/data/formats.test.ts",
            "node_modules/**",
          ],
          // One shared Postgres container AND one shared Redis container for the
          // whole node run (Testcontainers → needs a Docker daemon). The jsdom
          // project below has none, so component tests still run without Docker.
          globalSetup: [
            "./test/support/pg-global-setup.ts",
            "./test/support/redis-global-setup.ts",
          ],
          // Placeholder so `@/env` validates in workers; the @/data/db singleton
          // is injected by the test harness and never connects with this value.
          env: {
            DATABASE_URL: "postgres://oak:oak@127.0.0.1:5432/placeholder",
          },
        },
      },
      {
        extends: true,
        test: {
          name: "jsdom",
          environment: "jsdom",
          // Component tests render OakAnswer fixtures only — never import
          // db/repos/runtime (native better-sqlite3 fails under jsdom).
          // `test/**/*.test.tsx` is the full-stack-e2e AnswerCard checkpoint
          // (test/answercard.fullstack.test.tsx) — same jsdom constraints.
          // `src/lib/**/*.test.tsx` covers hook tests colocated with pure client
          // modules (e.g. the useSseClient durable-turn hook) that render a hook
          // but likewise never import db/repos/runtime — the node project globs
          // only `*.test.ts`, so there is no overlap.
          include: [
            "src/components/**/*.test.tsx",
            "src/lib/**/*.test.tsx",
            "src/lib/chat/**/*.test.ts",
            "test/**/*.test.tsx",
          ],
          setupFiles: ["@testing-library/jest-dom/vitest"],
        },
      },
    ],
  },
});
