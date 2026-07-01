import fs from "node:fs";
import path from "node:path";
import { searchForWorkspaceRoot } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Shared config consumed by every project in vitest.config.ts via
// `extends: true`. vite-tsconfig-paths makes the `@/` alias resolve in tests
// exactly as it does under tsc/next.
//
// oxc.jsx enables the React 17+ automatic JSX transform so .tsx test files
// (and .tsx source files) don't need `import React from 'react'` and Vite 8 /
// Rolldown won't error on JSX syntax.
//
// Vite 8 uses oxc for transforms (not esbuild). The correct JsxOptions shape
// is an object with `runtime: 'automatic'`; jsxImportSource defaults to
// 'react', which is correct for React 19.

// `server.fs.allow` widening for worktree checkouts. In a git worktree the
// local `node_modules` is a symlink to the primary checkout's `node_modules`
// (avoids a duplicate install). Vite resolves symlinks to their realpath, so an
// inlined dependency loaded as a setup module — e.g. the jsdom project's
// `@testing-library/jest-dom/vitest` entry — ends up at a realpath OUTSIDE this
// worktree's root, which the default file-serving allow list (rooted at the
// worktree) then refuses to serve ("Cannot find module '/@fs/.../node_modules/
// .../vitest.mjs'"). Adding the realpath of `node_modules` to the allow list
// fixes serving from the symlink target. This is purely ADDITIVE — it only
// permits serving more files, never fewer — and is a no-op for a normal,
// non-symlinked install (the realpath equals the in-tree path). The workspace
// root is kept via `searchForWorkspaceRoot` so the in-tree default coverage is
// preserved.
const projectRoot = process.cwd();
const realNodeModules = (() => {
  try {
    return fs.realpathSync(path.join(projectRoot, "node_modules"));
  } catch {
    return path.join(projectRoot, "node_modules");
  }
})();

export const shared = {
  plugins: [tsconfigPaths()],
  oxc: {
    jsx: { runtime: "automatic" as const },
  },
  server: {
    fs: {
      allow: [searchForWorkspaceRoot(projectRoot), realNodeModules],
    },
  },
};
