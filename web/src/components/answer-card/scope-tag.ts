import type { GenerationBasis } from "@/components/types";
import { regulationChipLabel } from "@/data/formats";

/**
 * Format the masthead's scope tag from `generation_basis.generation` — the
 * `basisForFormat` tag set: `"champions"` | `"national-dex"` | `"gen-9"` |
 * `"gen-1"`…`"gen-8"` (mainline generations, including the pre-Gen-9 scopes,
 * all flow through the trailing-digit branch below unchanged).
 *
 * The returned string stays mixed-case (e.g. "Champions · Reg M-B", "Gen 9")
 * — `.ilabel` uppercases it for display, same pattern as
 * `CandidateTable`'s `sort-field` label (data stays readable case, CSS does
 * the instrument-voice transform).
 */
export function formatScopeTag(generationBasis: GenerationBasis): string {
  const { generation } = generationBasis;
  if (generation === "champions") {
    return regulationChipLabel();
  }
  if (generation === "national-dex") {
    return "National Dex";
  }
  if (generation.startsWith("gen-")) {
    return `Gen ${generation.slice("gen-".length)}`;
  }
  return generation;
}
