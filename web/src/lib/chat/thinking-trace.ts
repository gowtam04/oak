/**
 * Copy + row mapping for the live thinking trace (Beautiful UI "Steps"
 * pattern). Pure — no React / DOM. Web, iOS (`ToolTrail` +
 * `ThinkingTraceCopy`), and Android (`thinkingHeader` / `traceRows`) stay
 * lock-step on this vocabulary.
 */

export type TraceActivity = {
  tool: string;
  label: string;
};

export type TraceRow = {
  tool: string;
  primary: string;
  secondary: string | null;
  active: boolean;
};

export type ThinkingHeader = {
  live: boolean;
  text: string;
};

/** Tools that are loop plumbing, not user-visible work. */
const HIDDEN_TOOLS = new Set([
  "reasoning",
  "submit_answer",
  "submit_builder_answer",
]);

const INSTRUMENT_TOKENS: Record<string, string> = {
  resolve_entity: "Identifying",
  query_pokedex: "Searching Pokédex",
  get_pokemon: "Looking up Pokémon",
  get_move: "Looking up move",
  get_ability: "Reading ability",
  get_item: "Looking up item",
  get_type_matchups: "Checking matchups",
  type_matchup: "Checking matchups",
  get_type_chart: "Checking matchups",
  get_evolution_chain: "Tracing evolution",
  compute_stat: "Computing stats",
  estimate_damage: "Calculating damage",
  get_usage_stats: "Checking live usage",
  get_learnset: "Checking learnset",
  lookup_box: "Looking up box",
  get_team: "Reading team",
  list_teams: "Listing teams",
  save_team: "Saving team",
  submit_answer: "Answer",
  submit_builder_answer: "Teams",
};
const UNKNOWN_INSTRUMENT_TOKEN = "Looking up";

/**
 * Tool id → action label. Pinned by the canonical cross-platform copy
 * table. A raw `GET_*` id must never reach the screen.
 */
export function instrumentToken(tool: string): string {
  return INSTRUMENT_TOKENS[tool] ?? UNKNOWN_INSTRUMENT_TOKEN;
}

/** Strips leading emoji / pictographs / variation selectors from a server label. */
export function stripLeadingEmoji(label: string): string {
  return label
    .replace(/^(?:[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D]|\s)+/u, "")
    .trim();
}

/**
 * Subject entity from a cleaned server label. Lock-step with iOS
 * `ToolTrail.subject` and Android `subjectFromLabel`.
 *
 * Order: quoted phrase, else the clause after the first colon (Pokédex
 * filters), else the first capitalised run after the sentence-initial
 * verb. Trailing `'s` / `’s` is stripped so "Checking Torkoal’s learnset"
 * yields "Torkoal", not "Checking Torkoal's".
 */
export function subjectFromLabel(cleaned: string): string | null {
  const quoted = firstQuoted(cleaned);
  if (quoted !== null) {
    const trimmed = quoted.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  const stripped = cleaned.replace(/[….]+$/u, "").trim();
  if (!stripped) return null;

  const colon = stripped.indexOf(":");
  if (colon >= 0) {
    const after = stripped
      .slice(colon + 1)
      .replace(/[….]+$/u, "")
      .trim();
    return after.length > 0 ? after : null;
  }

  const words = stripped.split(/\s+/u).filter(Boolean);
  const search =
    words[0] && isCapitalized(words[0]) ? words.slice(1) : words;

  const run: string[] = [];
  for (const word of search) {
    if (isCapitalized(word)) {
      run.push(word);
    } else if (run.length > 0) {
      break;
    }
  }
  if (run.length === 0) return null;
  return stripTrailingPossessive(run.join(" "));
}

function isCapitalized(word: string): boolean {
  const first = word[0];
  return Boolean(
    first && first === first.toUpperCase() && first !== first.toLowerCase(),
  );
}

/** `Torkoal's` / `Torkoal’s` (U+2019, as emitted by `describeToolCall`). */
function stripTrailingPossessive(text: string): string {
  return text.replace(/['\u2019]s$/u, "");
}

function firstQuoted(text: string): string | null {
  const pairs: Record<string, string> = {
    "\u201c": "\u201d",
    '"': '"',
    "\u201f": "\u201d",
    "\u2018": "\u2019",
  };
  let closer: string | null = null;
  let buf = "";
  for (const ch of text) {
    if (closer !== null) {
      if (ch === closer) return buf;
      buf += ch;
    } else if (pairs[ch]) {
      closer = pairs[ch]!;
      buf = "";
    }
  }
  return null;
}

/** Visible work rows. Last row is in-flight; earlier rows are done. */
export function traceRows(activity: TraceActivity[]): TraceRow[] {
  const visible = activity.filter((a) => !HIDDEN_TOOLS.has(a.tool));
  return visible.map((a, index) => {
    const cleaned = stripLeadingEmoji(a.label);
    return {
      tool: a.tool,
      primary: instrumentToken(a.tool),
      secondary: subjectFromLabel(cleaned),
      active: index === visible.length - 1,
    };
  });
}

/**
 * Header label. Live shimmer while the model is still working; settled
 * copy freezes the thinking duration once tokens start.
 */
export function thinkingHeader(args: {
  reconnecting: boolean;
  settled: boolean;
  elapsedSeconds: number | null;
}): ThinkingHeader {
  if (args.reconnecting) return { live: true, text: "Reconnecting" };
  if (!args.settled) return { live: true, text: "Thinking" };
  return { live: false, text: thoughtFor(args.elapsedSeconds) };
}

export function thoughtFor(elapsedSeconds: number | null): string {
  const n = elapsedSeconds ?? 0;
  if (n <= 0) return "Thought for a moment";
  if (n === 1) return "Thought for 1 second";
  return `Thought for ${n} seconds`;
}
