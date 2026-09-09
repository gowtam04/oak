/**
 * Infer a hop-to scope from a finalized answer (CHIP-AC-1.1).
 * Used when Champions misses exist in Scarlet/Violet, or the answer names
 * another of the eleven formats. Returns undefined when nothing different
 * is implied.
 */

import type { OakAnswer } from "@/agent/schemas";
import { isFormat, type Format } from "@/data/formats";

const NAMED: { re: RegExp; format: Format }[] = [
  { re: /\bscarlet[\s/-]*violet\b|\bgen(?:eration)?\s*9\b|\bpaldea\b/i, format: "scarlet-violet" },
  { re: /\bchampions\b/i, format: "champions" },
  { re: /\bnational\s*dex\b|\ball\s+gens?\b/i, format: "national-dex" },
  { re: /\bgen(?:eration)?\s*8\b|\bsword\s*(?:and|&|\/)\s*shield\b|\bgalar\b/i, format: "gen-8" },
  { re: /\bgen(?:eration)?\s*7\b|\busum\b|\bultra\s*sun\b/i, format: "gen-7" },
  { re: /\bgen(?:eration)?\s*6\b|\boras\b|\bkalos\b/i, format: "gen-6" },
  { re: /\bgen(?:eration)?\s*5\b|\bblack\s*(?:and|&|\/)\s*white\b|\bunova\b/i, format: "gen-5" },
  { re: /\bgen(?:eration)?\s*4\b|\bsinnoh\b/i, format: "gen-4" },
  { re: /\bgen(?:eration)?\s*3\b|\bhoenn\b/i, format: "gen-3" },
  { re: /\bgen(?:eration)?\s*2\b|\bjohto\b/i, format: "gen-2" },
  { re: /\bgen(?:eration)?\s*1\b|\bkanto\b/i, format: "gen-1" },
];

const EXISTS_IN_STANDARD =
  /exists in (?:standard|scarlet|violet|gen\s*9)|not (?:legal |available )?in champions|try scarlet/i;

export function impliedFormatFromAnswer(
  answer: OakAnswer,
  current?: Format,
): Format | undefined {
  const basis = formatFromBasis(answer.generation_basis.generation);
  if (answer.generation_basis.fallback && basis && basis !== current) {
    return basis;
  }

  const text = [
    answer.answer_markdown,
    answer.generation_basis.note ?? "",
    ...(answer.uncertainty_flags ?? []),
  ].join("\n");

  if (current === "champions" && EXISTS_IN_STANDARD.test(text)) {
    return "scarlet-violet";
  }

  for (const rule of NAMED) {
    if (rule.re.test(text) && rule.format !== current) return rule.format;
  }

  return undefined;
}

function formatFromBasis(generation: string): Format | undefined {
  if (generation === "gen-9") return "scarlet-violet";
  return isFormat(generation) ? generation : undefined;
}
