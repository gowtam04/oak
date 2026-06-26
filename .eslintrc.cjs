/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  extends: [
    "next/core-web-vitals",
    "next/typescript",
    // Keep eslint-config-prettier last so it disables stylistic rules that
    // would conflict with Prettier.
    "prettier",
  ],
  ignorePatterns: [
    "node_modules/",
    ".next/",
    "out/",
    "dist/",
    "build/",
    "coverage/",
    "data/",
    "drizzle/",
    "next-env.d.ts",
  ],
};
