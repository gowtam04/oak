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
  get_meta_usage: "Checking ladder usage",
  get_encounters: "Finding locations",
  get_learnset: "Checking learnset",
  get_team: "Reading team",
  list_teams: "Listing teams",
  save_team: "Saving team",
  run_sql: "Querying game data",
  search_wiki: "Searching wiki",
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
 * Subject entity from a cleaned label: a quoted phrase, else the last
 * capitalised word-run that isn't the sentence-initial verb.
 */
export function subjectFromLabel(cleaned: string): string | null {
  const quoted = firstQuoted(cleaned);
  if (quoted !== null) {
    const trimmed = quoted.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  const words = cleaned
    .replace(/[….]+$/u, "")
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
  let lastRun: string[] = [];
  let lastRunStart = -1;
  let currentRun: string[] = [];
  let currentStart = -1;
  words.forEach((word, index) => {
    const first = word[0];
    if (first && first === first.toUpperCase() && first !== first.toLowerCase()) {
      if (currentRun.length === 0) currentStart = index;
      currentRun.push(word);
      lastRun = currentRun;
      lastRunStart = currentStart;
    } else {
      currentRun = [];
    }
  });
  if (lastRun.length === 0) return null;
  if (lastRun.length === 1 && lastRunStart === 0) return null;
  return lastRun.join(" ");
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
