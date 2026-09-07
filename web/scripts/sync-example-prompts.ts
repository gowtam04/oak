/**
 * Generate the iOS / Android ExamplePrompts mirrors from the canonical web pool.
 *
 *   cd web && npm run sync:starters          # write Swift + Kotlin
 *   cd web && npm run sync:starters -- --check  # exit 1 if they drifted
 *
 * Do not hand-edit the generated files. Author prompts in
 * `src/lib/example-prompts.ts` and re-run this script.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  STARTER_CATEGORIES,
  STARTER_ENTRIES,
  type StarterCategory,
  type StarterPrompt,
} from "../src/lib/example-prompts";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");

export const SWIFT_PATH = path.join(
  REPO_ROOT,
  "ios/OakApp/Features/Chat/ExamplePrompts.swift",
);
export const KOTLIN_PATH = path.join(
  REPO_ROOT,
  "android/app/src/main/kotlin/ai/gowtam/oak/features/chat/ExamplePrompts.kt",
);

const SWIFT_CATEGORY: Record<StarterCategory, string> = {
  Battle: ".battle",
  Dex: ".dex",
  Rules: ".rules",
  Meta: ".meta",
};

const KOTLIN_CATEGORY: Record<StarterCategory, string> = {
  Battle: "Category.Battle",
  Dex: "Category.Dex",
  Rules: "Category.Rules",
  Meta: "Category.Meta",
};

function escapeSwift(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapeKotlin(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$");
}

export function assertStarterPool(entries: StarterPrompt[]): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!STARTER_CATEGORIES.includes(entry.category)) {
      throw new Error(`unknown category: ${entry.category}`);
    }
    if (!entry.text.trim()) {
      throw new Error("starter text is empty");
    }
    if (!entry.type.trim()) {
      throw new Error(`missing type on: ${entry.text}`);
    }
    const key = entry.text.toLowerCase();
    if (seen.has(key)) {
      throw new Error(`duplicate starter text: ${entry.text}`);
    }
    seen.add(key);
  }
  for (const category of STARTER_CATEGORIES) {
    if (!entries.some((e) => e.category === category)) {
      throw new Error(`STARTER_ENTRIES has no ${category} prompt`);
    }
  }
}

export function renderSwift(entries: StarterPrompt[]): string {
  assertStarterPool(entries);
  const rows = entries
    .map((entry) => {
      const cat = SWIFT_CATEGORY[entry.category];
      return `    FiledStarter(\n      category: ${cat}, typeDot: "${escapeSwift(entry.type)}",\n      prompt: "${escapeSwift(entry.text)}"\n    ),`;
    })
    .join("\n");
  return `/// GENERATED FILE — do not edit.
/// Source: web/src/lib/example-prompts.ts
/// Regenerate: cd web && npm run sync:starters
enum ExamplePrompts {
  struct FiledStarter: Hashable, Identifiable {
    /// The four starter categories — keep labels in sync with web / Android.
    enum Category: String, CaseIterable, Hashable {
      case battle = "Battle"
      case dex = "Dex"
      case rules = "Rules"
      case meta = "Meta"
    }

    var id: String { "\\(category.rawValue)|\\(prompt)" }
    let category: Category
    /// Pokémon type slug driving the colored type-dot (e.g. \`"dragon"\`).
    let typeDot: String
    let prompt: String
  }

  /// Canonical filed-starter pool, generated from web \`STARTER_ENTRIES\`.
  /// \`pickFiledStarters()\` returns one random entry per category.
  static let filedPool: [FiledStarter] = [
${rows}
  ]

  /// One random starter per category, in Battle → Dex → Rules → Meta order.
  static func pickFiledStarters() -> [FiledStarter] {
    FiledStarter.Category.allCases.compactMap { category in
      filedPool.filter { $0.category == category }.randomElement()
    }
  }
}
`;
}

export function renderKotlin(entries: StarterPrompt[]): string {
  assertStarterPool(entries);
  const rows = entries
    .map((entry) => {
      const cat = KOTLIN_CATEGORY[entry.category];
      return `        FiledStarter(${cat}, "${escapeKotlin(entry.type)}", "${escapeKotlin(entry.text)}"),`;
    })
    .join("\n");
  return `package ai.gowtam.oak.features.chat

/**
 * GENERATED FILE — do not edit.
 * Source: web/src/lib/example-prompts.ts
 * Regenerate: cd web && npm run sync:starters
 *
 * Starter prompts for the fresh-thread empty state ([EmptyState]).
 * [pickFiled] returns one prompt per category (Battle → Dex → Rules → Meta).
 */
object ExamplePrompts {

    /** Filed-starter categories — fixed labels, sync across web/iOS/Android. */
    enum class Category(val label: String) {
        Battle("Battle"),
        Dex("Dex"),
        Rules("Rules"),
        Meta("Meta"),
    }

    /**
     * One filed starter: mono category label, type-dot (Pokémon type slug),
     * and the prompt text sent on tap.
     */
    data class FiledStarter(
        val category: Category,
        /** Type slug for the colored dot (e.g. \`"dragon"\`). */
        val typeDot: String,
        val prompt: String,
    )

    /** Canonical filed-starter pool, generated from web \`STARTER_ENTRIES\`. */
    val filedPool: List<FiledStarter> = listOf(
${rows}
    )

    /**
     * One filed starter per category (Battle → Dex → Rules → Meta), each
     * sampled at random from that category's entries in [filedPool].
     */
    fun pickFiled(): List<FiledStarter> =
        Category.entries.map { category ->
            filedPool.filter { it.category == category }.random()
        }
}
`;
}

export function writeGenerated(entries: StarterPrompt[] = STARTER_ENTRIES): void {
  fs.writeFileSync(SWIFT_PATH, renderSwift(entries), "utf8");
  fs.writeFileSync(KOTLIN_PATH, renderKotlin(entries), "utf8");
}

export function checkGenerated(
  entries: StarterPrompt[] = STARTER_ENTRIES,
): { ok: boolean; message: string } {
  const swift = fs.readFileSync(SWIFT_PATH, "utf8");
  const kotlin = fs.readFileSync(KOTLIN_PATH, "utf8");
  const expectedSwift = renderSwift(entries);
  const expectedKotlin = renderKotlin(entries);
  const mismatches: string[] = [];
  if (swift !== expectedSwift) mismatches.push(SWIFT_PATH);
  if (kotlin !== expectedKotlin) mismatches.push(KOTLIN_PATH);
  if (mismatches.length === 0) {
    return { ok: true, message: "iOS/Android ExamplePrompts match STARTER_ENTRIES" };
  }
  return {
    ok: false,
    message:
      `Generated starter files are stale:\n${mismatches.join("\n")}\n` +
      `Run: cd web && npm run sync:starters`,
  };
}

function isMain(): boolean {
  const invoked = process.argv[1];
  if (!invoked) return false;
  return path.resolve(invoked) === fileURLToPath(import.meta.url);
}

function main(): void {
  const check = process.argv.includes("--check");
  if (check) {
    const result = checkGenerated();
    if (!result.ok) {
      console.error(result.message);
      process.exit(1);
    }
    console.log(result.message);
    return;
  }
  writeGenerated();
  console.log(`Wrote ${path.relative(REPO_ROOT, SWIFT_PATH)}`);
  console.log(`Wrote ${path.relative(REPO_ROOT, KOTLIN_PATH)}`);
}

if (isMain()) {
  main();
}
