/**
 * Box-build classifier (BOX-BR-1, BOX-AD-3). Pure heuristic — no DB, no dex.
 * The runtime uses this to pick the iteration cap before the first model call.
 */

/** English verbs / function words that are never species tokens. */
const NAME_STOPWORDS = new Set([
  "build",
  "make",
  "party",
  "team",
  "box",
  "keep",
  "drop",
  "create",
  "craft",
  "suggest",
  "propose",
  "rebuild",
  "put",
  "back",
  "required",
  "please",
  "here",
  "also",
  "what",
  "whats",
  "where",
  "who",
  "how",
  "when",
  "why",
  "can",
  "learn",
  "show",
  "list",
  "catch",
  "location",
  "wiki",
  "weather",
  "hello",
  "professor",
  "help",
  "want",
  "need",
  "give",
  "gimme",
  "with",
  "from",
  "these",
  "those",
  "this",
  "that",
  "your",
  "my",
  "me",
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "for",
  "to",
  "on",
  "in",
  "is",
  "it",
  "do",
  "not",
  "dont",
  "again",
  "now",
  "just",
  "use",
  "using",
  "include",
  "including",
  "around",
  "about",
]);

/** Forme prefixes that bind to the following Capitalized name (comma-field or whitespace). */
const FORM_PREFIXES = new Set([
  "mega",
  "alolan",
  "galarian",
  "hisuian",
  "paldean",
  "gigantamax",
  "gmax",
  "primal",
  "origin",
  "therian",
  "incarnate",
  "ultra",
  "shadow",
  "eternamax",
]);

const HANGUL = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7A3]/;

const SPECIES_WORD = /^[A-Z][A-Za-z0-9']*(?:-[A-Za-z0-9']+)*$/;

function stripPunct(word: string): string {
  return word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9']+$/g, "");
}

function isSpeciesWord(word: string): boolean {
  if (!word || HANGUL.test(word)) return false;
  if (!SPECIES_WORD.test(word)) return false;
  if (NAME_STOPWORDS.has(word.toLowerCase())) return false;
  return true;
}

/** Comma/newline field is one token when it is a single name or a forme-prefix phrase. */
function isSpeciesPhrase(field: string): boolean {
  if (!field || HANGUL.test(field)) return false;
  const words = field
    .trim()
    .split(/\s+/)
    .map(stripPunct)
    .filter(Boolean);
  if (words.length === 0 || words.length > 4) return false;
  if (!words.every(isSpeciesWord)) return false;
  if (words.length === 1) return true;
  return FORM_PREFIXES.has(words[0]!.toLowerCase());
}

/**
 * Display-name / slug → PokeAPI-style slug. "Mega Kangaskhan" → "kangaskhan-mega"
 * so named-for-party matching lines up with proposed_team member species.
 */
export function normalizeBoxSpecies(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  const megaXY = trimmed.match(/^mega\s+(.+?)(?:\s+([xy]))?$/i);
  if (megaXY?.[1]) {
    const base = toSlug(megaXY[1]);
    return megaXY[2] ? `${base}-mega-${megaXY[2].toLowerCase()}` : `${base}-mega`;
  }
  const prefixes: Array<[RegExp, string]> = [
    [/^alolan\s+(.+)$/i, "alola"],
    [/^galarian\s+(.+)$/i, "galar"],
    [/^hisuian\s+(.+)$/i, "hisui"],
    [/^paldean\s+(.+)$/i, "paldea"],
    [/^gigantamax\s+(.+)$/i, "gmax"],
    [/^g-?max\s+(.+)$/i, "gmax"],
    [/^primal\s+(.+)$/i, "primal"],
    [/^ultra\s+(.+)$/i, "ultra"],
    [/^origin\s+(.+)$/i, "origin"],
    [/^shadow\s+(.+)$/i, "shadow"],
    [/^therian\s+(.+)$/i, "therian"],
    [/^incarnate\s+(.+)$/i, "incarnate"],
    [/^eternamax\s+(.+)$/i, "eternamax"],
  ];
  for (const [re, suffix] of prefixes) {
    const match = trimmed.match(re);
    if (match?.[1]) return `${toSlug(match[1])}-${suffix}`;
  }
  return toSlug(trimmed);
}

function toSlug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function addUnique(out: string[], seen: Set<string>, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const key = trimmed.toLowerCase();
  if (seen.has(key)) return;
  if (NAME_STOPWORDS.has(key)) return;
  seen.add(key);
  out.push(trimmed);
}

/** Join a forme prefix with the following Capitalized name (and optional X/Y). */
function takeFormePhrase(
  words: string[],
  start: number,
): { phrase: string; consumed: number } | null {
  const first = stripPunct(words[start] ?? "");
  if (!FORM_PREFIXES.has(first.toLowerCase()) || !isSpeciesWord(first)) {
    return null;
  }
  const next = stripPunct(words[start + 1] ?? "");
  if (!isSpeciesWord(next) || FORM_PREFIXES.has(next.toLowerCase())) return null;
  let phrase = `${first} ${next}`;
  let consumed = 2;
  const maybeXY = stripPunct(words[start + 2] ?? "");
  if (/^[XY]$/.test(maybeXY)) {
    phrase = `${phrase} ${maybeXY}`;
    consumed = 3;
  }
  return { phrase, consumed };
}

function capitalizedLatinTokens(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const forme = takeFormePhrase(words, i);
    if (forme) {
      out.push(forme.phrase);
      i += forme.consumed - 1;
      continue;
    }
    const cleaned = stripPunct(words[i]!);
    if (FORM_PREFIXES.has(cleaned.toLowerCase())) continue;
    if (isSpeciesWord(cleaned)) out.push(cleaned);
  }
  return out;
}

/** Latin species-like tokens from a comma/newline list (order preserved, deduped). */
export function extractBoxNames(message: string): string[] {
  if (!message.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  const fields = message.split(/[,\n\r]+/);
  for (const field of fields) {
    const trimmed = field.trim();
    if (!trimmed) continue;
    if (isSpeciesPhrase(trimmed)) {
      addUnique(out, seen, trimmed);
      continue;
    }
    for (const token of capitalizedLatinTokens(trimmed)) {
      addUnique(out, seen, token);
    }
  }
  return out;
}

function isMovepoolOrLocationAsk(message: string): boolean {
  const m = message.toLowerCase().replace(/\s+/g, " ").trim();
  if (!m) return false;
  if (/\bwhat can\b.{0,48}\blearn\b/.test(m)) return true;
  if (/\bmovepool\b/.test(m)) return true;
  if (/\blearnset\b/.test(m)) return true;
  if (/\bwhere\b.{0,40}\bcatch\b/.test(m)) return true;
  if (/\blocation\b/.test(m)) return true;
  if (/\bwiki\b/.test(m)) return true;
  return false;
}

function hasPartyVerb(message: string): boolean {
  const m = message.toLowerCase();
  if (/\b(?:build|make|party|team|box)\b/.test(m)) return true;
  if (/파티|팀|만들어|만들어줘|빼지/.test(message)) return true;
  return false;
}

/**
 * Ordinary TEAM-US-6 team-build with no owned list ("build me a rain team").
 * Follow-ups like this after a box paste are a new job, not box-build inherit.
 */
function isOrdinaryTeamBuildWithoutOwnedList(
  message: string,
  names: string[],
): boolean {
  if (names.length > 0) return false;
  const m = message.toLowerCase().replace(/\s+/g, " ").trim();
  if (!m) return false;
  if (
    /\b(build|make|create|craft|suggest|propose)\b.{0,48}\b(team|party)\b/.test(
      m,
    )
  ) {
    return true;
  }
  if (/\bhelp me (build|make)\b/.test(m)) return true;
  if (
    /\b(want|need|give me|gimme)\b.{0,24}\b(a |an )?(team|party)\b/.test(m)
  ) {
    return true;
  }
  if (
    /\b(hyper\s*offense|balanced team|stall team|rain team|sun team|offense team|defensive team)\b/.test(
      m,
    )
  ) {
    return true;
  }
  return false;
}

/**
 * True when this turn is a box-build.
 * `historyTexts` = prior **user** message strings in the thread (for follow-ups).
 */
export function isBoxBuildMessage(
  message: string,
  historyTexts?: string[],
): boolean {
  if (!message.trim()) return false;
  if (isMovepoolOrLocationAsk(message)) return false;
  const names = extractBoxNames(message);
  // BOX-AC-5.2 / BOX-BR-11: follow-ups about that party stay box-build unless
  // the current message is a movepool/location/wiki ask (already returned) or
  // an owned-list-free ordinary team-build.
  if ((historyTexts ?? []).some((h) => isBoxBuildMessage(h))) {
    if (isOrdinaryTeamBuildWithoutOwnedList(message, names)) return false;
    return true;
  }
  if (names.length >= 6) return true;
  if (names.length >= 3 && hasPartyVerb(message)) return true;
  return false;
}

function stripTrailingHangul(word: string): string {
  return word.replace(/[\uAC00-\uD7A3]+$/g, "");
}

/** Last Latin species / forme phrase in `text` (the token adjacent on the left). */
function nameImmediatelyBefore(text: string): string | null {
  const words = text
    .split(/\s+/)
    .map((w) => stripPunct(stripTrailingHangul(w)))
    .filter(Boolean);
  if (words.length === 0) return null;
  if (words.length >= 3) {
    const start = words.length - 3;
    const forme = takeFormePhrase(words, start);
    if (forme && start + forme.consumed === words.length) return forme.phrase;
  }
  if (words.length >= 2) {
    const start = words.length - 2;
    const forme = takeFormePhrase(words, start);
    if (forme && start + forme.consumed === words.length) return forme.phrase;
  }
  const last = words[words.length - 1]!;
  if (isSpeciesWord(last) && !FORM_PREFIXES.has(last.toLowerCase())) return last;
  return null;
}

/** First Latin species / forme phrase in `text` (the token adjacent on the right). */
function nameImmediatelyAfter(text: string): string | null {
  const cleaned = text.replace(/^[^A-Za-z]+/, "");
  const words = cleaned.split(/\s+/).map(stripPunct).filter(Boolean);
  if (words.length === 0) return null;
  const forme = takeFormePhrase(words, 0);
  if (forme) return forme.phrase;
  const first = words[0]!;
  if (isSpeciesWord(first) && !FORM_PREFIXES.has(first.toLowerCase())) {
    return first;
  }
  return null;
}

/**
 * Latin names adjacent to a keep-marker (Korean 빼지), not the whole box list.
 * Mirrors English `don't drop ${name}`.
 */
function namesAdjacentToMarker(message: string, marker: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let from = 0;
  while (from < message.length) {
    const idx = message.indexOf(marker, from);
    if (idx < 0) break;
    const before = nameImmediatelyBefore(message.slice(0, idx));
    if (before) addUnique(out, seen, before);
    const after = nameImmediatelyAfter(message.slice(idx + marker.length));
    if (after) addUnique(out, seen, after);
    from = idx + marker.length;
  }
  return out;
}

function extractKeepNames(message: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const nameGroup = "([A-Z][A-Za-z0-9'\\-]*(?:\\s+[A-Z][A-Za-z0-9'\\-]*)*)";
  const patterns = [
    new RegExp(`\\b(?:don't|dont|do not)\\s+drop\\s+${nameGroup}`, "g"),
    new RegExp(`\\bkeep\\s+${nameGroup}`, "g"),
    new RegExp(`\\b${nameGroup}\\s+is\\s+required\\b`, "g"),
  ];
  for (const re of patterns) {
    for (const match of message.matchAll(re)) {
      const name = match[1]?.trim();
      if (name) addUnique(out, seen, name);
    }
  }
  if (message.includes("빼지")) {
    for (const name of namesAdjacentToMarker(message, "빼지")) {
      addUnique(out, seen, name);
    }
  }
  return out;
}

/**
 * Named-for-party set (BOX-BR-2/4): every extracted name when there are ≤6,
 * plus keep / don't-drop / required names (EN + KR 빼지 마). Follow-ups also
 * scan historyTexts. Order preserved, first-seen wins.
 */
export function namedForParty(
  message: string,
  historyTexts?: string[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const texts = [...(historyTexts ?? []), message];
  for (const text of texts) {
    const extracted = extractBoxNames(text);
    if (extracted.length <= 6) {
      for (const name of extracted) addUnique(out, seen, name);
    }
    for (const name of extractKeepNames(text)) addUnique(out, seen, name);
  }
  return out;
}
