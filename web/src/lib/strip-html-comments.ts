/**
 * Remove HTML comments (`<!-- … -->`) from markdown so citation-span
 * markers (`<!-- span:c0 -->…<!-- /span:c0 -->`) never appear as visible
 * text. Fenced code interiors are left intact. A trailing unclosed `<!--`
 * outside a fence is dropped (streaming-safe). Newlines are normalized
 * to `\n`.
 *
 * Display-time only — stored `answer_markdown` keeps the marks so
 * citation highlight (CIT-BR-2) still works.
 */

function fenceInfo(
  trimmed: string,
): { char: "`" | "~"; language: string | null } | null {
  const first = trimmed[0];
  if (first !== "`" && first !== "~") return null;
  let count = 0;
  while (count < trimmed.length && trimmed[count] === first) count += 1;
  if (count < 3) return null;
  const rest = trimmed.slice(count).trim();
  return { char: first, language: rest.length === 0 ? null : rest };
}

function isClosingFence(trimmed: string, char: "`" | "~"): boolean {
  if (trimmed.length < 3 || trimmed[0] !== char) return false;
  return [...trimmed].every((c) => c === char);
}

function fencedRanges(source: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  let lineStart = 0;
  let fenceStart: number | null = null;
  let fenceChar: "`" | "~" | null = null;

  const considerLine = (end: number) => {
    const trimmed = source.slice(lineStart, end).trim();
    if (fenceChar !== null && fenceStart !== null) {
      if (isClosingFence(trimmed, fenceChar)) {
        ranges.push({ start: fenceStart, end });
        fenceChar = null;
        fenceStart = null;
      }
    } else {
      const info = fenceInfo(trimmed);
      if (info) {
        fenceStart = lineStart;
        fenceChar = info.char;
      }
    }
  };

  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === "\n") {
      considerLine(i);
      lineStart = i + 1;
    }
  }
  considerLine(source.length);
  if (fenceStart !== null) {
    ranges.push({ start: fenceStart, end: source.length });
  }
  return ranges;
}

export function stripHtmlComments(source: string): string {
  const text = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const fences = fencedRanges(text);
  let out = "";
  let i = 0;
  while (i < text.length) {
    const inFence = fences.some((r) => i >= r.start && i < r.end);
    if (!inFence && text.startsWith("<!--", i)) {
      const close = text.indexOf("-->", i + 4);
      if (close < 0) break;
      i = close + 3;
      continue;
    }
    out += text[i];
    i += 1;
  }
  return out;
}
