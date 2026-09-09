/**
 * Parse `@team` tokens in composer text (MEN-US-1 / MEN-BR-1 / MEN-AC-1.3).
 * Mentions resolve to saved-team ids by current name. Unknown `@tokens`
 * (after whitespace or at start) are dead and must block send.
 */

export interface MentionTeamRef {
  id: string;
  name: string;
}

export interface ParsedMentions {
  /** Resolved team ids, unique, longest-name-first match order. */
  ids: string[];
  /** Display names that were bound (same order as ids). */
  bound: MentionTeamRef[];
  /** Unresolved mention tokens (no `@` prefix). */
  dead: string[];
}

/**
 * Collect bound team ids and dead mention tokens from composer text.
 * `user@host` is not a mention (`@` must be at start or after whitespace).
 * A trailing `@` with no token is not dead.
 */
export function parseMentions(
  text: string,
  teams: MentionTeamRef[],
): ParsedMentions {
  const sorted = [...teams].sort((a, b) => b.name.length - a.name.length);
  const ids: string[] = [];
  const bound: MentionTeamRef[] = [];
  const dead: string[] = [];
  const seen = new Set<string>();

  const re = /(^|\s)@/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const at = match.index + match[1]!.length;
    const after = text.slice(at + 1);
    if (!after || /^\s/.test(after)) continue;

    const team = sorted.find((t) => nameMatchesAt(after, t.name));
    if (team) {
      if (!seen.has(team.id)) {
        seen.add(team.id);
        ids.push(team.id);
        bound.push(team);
      }
      re.lastIndex = at + 1 + team.name.length;
      continue;
    }

    const token = /^[^\s@]+/.exec(after);
    if (token) dead.push(token[0]);
  }

  return { ids, bound, dead };
}

function nameMatchesAt(after: string, name: string): boolean {
  if (after.length < name.length) return false;
  if (after.slice(0, name.length).toLowerCase() !== name.toLowerCase()) {
    return false;
  }
  const next = after[name.length];
  return next == null || /[\s.,!?;:]/.test(next);
}
