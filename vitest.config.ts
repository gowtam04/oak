import { defineConfig } from "vitest/config";
import { shared } from "./vitest.shared";

// Two projects (the supported replacement for the deprecated `workspace`
// config): a Node project for backend/unit tests and a jsdom project for
// React component tests. Both extend the shared config so `@/` resolves.
//
// A dummy ANTHROPIC_API_KEY is injected for every test run so unit tests can
// import src/env.ts (which rejects a missing key) and can never reach the API.
export default defineConfig({
  ...shared,
  test: {
    passWithNoTests: true,
    env: {
      ANTHROPIC_API_KEY: "test-dummy-anthropic-key",
      NODE_ENV: "test",
    },
    projects: [
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
          exclude: ["src/components/**", "node_modules/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "jsdom",
          environment: "jsdom",
          // Component tests render PokebotAnswer fixtures only — never import
          // db/repos/runtime (native better-sqlite3 fails under jsdom).
          // `test/**/*.test.tsx` is the full-stack-e2e AnswerCard checkpoint
          // (test/answercard.fullstack.test.tsx) — same jsdom constraints.
          include: ["src/components/**/*.test.tsx", "test/**/*.test.tsx"],
          setupFiles: ["@testing-library/jest-dom/vitest"],
        },
      },
    ],
  },
});
