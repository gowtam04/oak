/**
 * Deterministic per-turn scope detector (generation-scope GS-B / §3.1).
 *
 * Scans a raw user message for an EXPLICIT, high-precision game-scope signal so
 * the server can override the conversation's sticky scope (and the Champions
 * toggle seed) when the user names a generation outright — "analyze my gen 7
 * team", "in scarlet and violet…", "is tera blast good on my champions team".
 *
 * NON-NEGOTIABLE properties:
 *   - PURE / client-safe. The only import is `type Format` from the (pure)
 *     `@/data/formats` module, so a future iOS client can reuse this verbatim.
 *     No `server-only`, no `@/env`, no SDK, no DB.
 *   - DETERMINISTIC lexicon — NO LLM pre-pass. First-match-wins over an ordered
 *     rule list; Champions rules are checked FIRST (an explicit "champions" is
 *     the strongest signal), then explicit "gen N" numbers, then per-format game
 *     / region / mechanic keywords.
 *   - PRECISION OVER RECALL. When in doubt we return `null` and let the caller's
 *     stickiness (conversation scope → toggle seed) win. Ambiguous single English
 *     words ("sun", "sword", "black", "x", "y") never fire alone — they require
 *     their pair or an unambiguous token. Region-form ADJECTIVES ("alolan",
 *     "galarian", "hisuian", "paldean") are deliberately NOT signals (an "Alolan
 *     Ninetales" question in Gen 9 is still Gen 9) — the `\b` word boundary after
 *     the bare region name ("alola", "galar", "paldea") already excludes the
 *     "-n"/"-ian" adjective forms. "mega" is never a signal (Megas exist in
 *     Champions and Gens 6–7).
 *   - Gens 1–4 are out of scope (GS-D1) but still DETECTED, as an `unsupported`
 *     result, so the route can answer honestly ("I don't have Gen 3 data yet")
 *     instead of silently replying from Gen 9 data.
 */

import type { Format } from "@/data/formats";

/**
 * The result of scanning a message for a scope signal:
 *   - `{ kind: "scope", … }`    a supported format was named explicitly.
 *   - `{ kind: "unsupported", … }` a Gen 1–4 game was named (not yet ingested).
 *   - `null`                     no explicit signal — fall back to stickiness.
 * `matched` is the lexicon phrase that fired, kept for structured logging + tests.
 */
export type ScopeDetection =
  | { kind: "scope"; format: Format; matched: string }
  | { kind: "unsupported"; label: string; matched: string }
  | null;

/** What a rule resolves to when it fires. */
type RuleTarget =
  | { kind: "scope"; format: Format }
  | { kind: "unsupported"; label: string };

interface Rule {
  target: RuleTarget;
  /** Returns the matched phrase (for `matched`), or `null` when the rule misses. */
  match: (message: string) => string | null;
}

/** Fire when `re` matches, reporting the exact substring it matched. */
function on(re: RegExp): (message: string) => string | null {
  return (message) => {
    const found = re.exec(message);
    return found ? found[0] : null;
  };
}

/**
 * Fire only when EVERY pattern is present (used for ambiguous words that need a
 * partner — "sun" + "moon", "black" + "white", "sword" + "shield"), reporting a
 * fixed `phrase` since the two matches may be far apart in the message.
 */
function all(phrase: string, ...res: RegExp[]): (message: string) => string | null {
  return (message) => (res.every((re) => re.test(message)) ? phrase : null);
}

function scope(format: Format, match: (m: string) => string | null): Rule {
  return { target: { kind: "scope", format }, match };
}

function unsupported(label: string, match: (m: string) => string | null): Rule {
  return { target: { kind: "unsupported", label }, match };
}

/**
 * Ordered lexicon (first match wins). All patterns are case-insensitive and use
 * `\b` word boundaries over the RAW message. Ordering:
 *   1. Champions (strongest explicit signal — checked before everything else).
 *   2. Explicit "gen N" numbers (unambiguous; a supported gen beats a named
 *      region elsewhere in the same message, and beats an unsupported gen).
 *   3. Per-format game / region / mechanic keywords, Gen 9 → 5.
 *   4. Gen 1–4 (regions + numbers) as `unsupported`.
 *
 * NOTE (known tradeoff, per the plan): a VGC "regulation X" phrase maps to
 * Champions even though Scarlet/Violet has its own regulation letters — the plan
 * treats any "reg(ulation) <letter>" as a Champions signal.
 */
const RULES: readonly Rule[] = [
  // ── 1. Champions (first) ────────────────────────────────────────────────
  scope("champions", on(/\bchampions\b/i)),
  scope("champions", on(/\breg(?:ulation)?\s+[a-z](?:-[a-z])?\b/i)),

  // ── 2. Explicit generation numbers ──────────────────────────────────────
  scope("scarlet-violet", on(/\bgen(?:eration)?\s*9\b/i)),
  scope("gen-8", on(/\bgen(?:eration)?\s*8\b/i)),
  scope("gen-7", on(/\bgen(?:eration)?\s*7\b/i)),
  scope("gen-6", on(/\bgen(?:eration)?\s*6\b/i)),
  scope("gen-5", on(/\bgen(?:eration)?\s*5\b/i)),
  unsupported("gen-4", on(/\bgen(?:eration)?\s*4\b/i)),
  unsupported("gen-3", on(/\bgen(?:eration)?\s*3\b/i)),
  unsupported("gen-2", on(/\bgen(?:eration)?\s*2\b/i)),
  unsupported("gen-1", on(/\bgen(?:eration)?\s*1\b/i)),

  // ── 3a. Gen 9 / Scarlet-Violet ──────────────────────────────────────────
  scope("scarlet-violet", on(/\bscarlet\b/i)),
  scope("scarlet-violet", on(/\bviolet\b/i)),
  scope("scarlet-violet", on(/\bsv\b/i)), // own token only ("csv"/"svg" excluded by \b)
  scope("scarlet-violet", on(/\bpaldea\b/i)), // \b excludes the "paldean" form adjective
  scope("scarlet-violet", on(/\btera(?:stal|stallize|stallization|type)?\b/i)),
  // SV box legendaries + DLC legendary — Illegal in the Champions mod
  // (FormatsData isNonstandard "Past"), so they are unambiguous Gen 9 signals.
  scope("scarlet-violet", on(/\bkoraidon\b/i)),
  scope("scarlet-violet", on(/\bmiraidon\b/i)),
  scope("scarlet-violet", on(/\bterapagos\b/i)),
  scope("scarlet-violet", on(/\barea\s+zero\b/i)),
  // Official VGC runs on Scarlet/Violet. Ordering guards: explicit "gen N"
  // (section 2) beats this ("gen 8 vgc" stays gen-8); "champions"/reg-letter
  // (section 1) beats it too.
  scope("scarlet-violet", on(/\bvgc\b/i)),
  // Users echoing the cross-scope hint ("…exists in mainline Gen 9").
  scope("scarlet-violet", on(/\bmainline\b/i)),

  // ── 3b. Gen 8 / Sword-Shield (+ BDSP, Legends: Arceus) ──────────────────
  scope("gen-8", on(/\bswsh\b/i)),
  scope("gen-8", all("sword & shield", /\bsword\b/i, /\bshield\b/i)),
  scope("gen-8", on(/\bgalar\b/i)), // \b excludes "galarian"
  scope("gen-8", on(/\bdynamax\b/i)),
  scope("gen-8", on(/\bgigantamax\b/i)),
  scope("gen-8", on(/\bbdsp\b/i)),
  scope("gen-8", on(/\bbrilliant\s+diamond\b/i)),
  scope("gen-8", on(/\bshining\s+pearl\b/i)),
  scope("gen-8", on(/\blegends:?\s+arceus\b/i)),
  scope("gen-8", on(/\bpla\b/i)),

  // ── 3c. Gen 7 / Sun-Moon-USUM (+ Alola, Z-Moves, Let's Go) ──────────────
  scope("gen-7", on(/\busum\b/i)),
  scope("gen-7", on(/\bultra\s+(?:sun|moon)\b/i)),
  scope("gen-7", all("sun & moon", /\bsun\b/i, /\bmoon\b/i)),
  scope("gen-7", on(/\balola\b/i)), // \b excludes "alolan"
  scope("gen-7", on(/\bz-?moves?\b/i)),
  // "let's go" alone is a common casual phrase — require the game name (precision).
  scope("gen-7", on(/\blet'?s\s+go\s+(?:pikachu|eevee)\b/i)),
  scope("gen-7", on(/\blgpe\b/i)),

  // ── 3d. Gen 6 / XY-ORAS (+ Kalos) ───────────────────────────────────────
  scope("gen-6", on(/\bkalos\b/i)),
  scope("gen-6", on(/\boras\b/i)),
  scope("gen-6", on(/\bomega\s+ruby\b/i)),
  scope("gen-6", on(/\balpha\s+sapphire\b/i)),
  scope("gen-6", on(/\bxy\b/i)), // own token
  scope("gen-6", on(/\bx\s+and\s+y\b/i)),

  // ── 3e. Gen 5 / Black-White (+ Unova) ───────────────────────────────────
  scope("gen-5", on(/\bunova\b/i)),
  scope("gen-5", on(/\bb2w2\b/i)),
  scope("gen-5", on(/\bbw2?\b/i)), // "bw" or "bw2", own token
  scope("gen-5", on(/\bblack\s*2\b/i)),
  scope("gen-5", on(/\bwhite\s*2\b/i)),
  scope("gen-5", all("black & white", /\bblack\b/i, /\bwhite\b/i)),

  // ── 4. Gens 1–4 (out of scope — detected so the route answers honestly) ──
  unsupported("gen-1", on(/\bkanto\b/i)),
  unsupported("gen-2", on(/\bjohto\b/i)),
  unsupported("gen-3", on(/\bhoenn\b/i)),
  unsupported("gen-4", on(/\bsinnoh\b/i)),
  unsupported("gen-4", on(/\bplatinum\b/i)),
  unsupported("gen-4", on(/\bhgss\b/i)),
  unsupported("gen-4", on(/\bheart\s*gold\b/i)),
  unsupported("gen-4", on(/\bsoul\s*silver\b/i)),
  unsupported("gen-3", on(/\bfrlg\b/i)),
  unsupported("gen-3", on(/\bfire\s*red\b/i)),
  unsupported("gen-3", on(/\bleaf\s*green\b/i)),
];

/**
 * Scan a user message for an EXPLICIT, high-precision game-scope signal.
 * Returns the first-matching rule's result, or `null` when no rule fires (the
 * caller then keeps the conversation's sticky scope / toggle seed).
 */
export function detectScopeSignal(message: string): ScopeDetection {
  for (const rule of RULES) {
    const matched = rule.match(message);
    if (matched === null) continue;
    return rule.target.kind === "scope"
      ? { kind: "scope", format: rule.target.format, matched }
      : { kind: "unsupported", label: rule.target.label, matched };
  }
  return null;
}
