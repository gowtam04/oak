import type { GenerationBasis } from "@/components/types";
import { CHAMPIONS_REGULATION } from "@/data/formats";

/**
 * Format the masthead's scope tag from `generation_basis.generation` — the
 * `basisForFormat` tag set: `"champions"` | `"gen-9"` | `"gen-5"`…`"gen-8"`
 * (a pre-Gen-9 fallback, e.g. `"gen-1"`, also flows through here unchanged).
 *
 * The returned string stays mixed-case (e.g. "Champions · Reg M-B", "Gen 9")
 * — `.ilabel` uppercases it for display, same pattern as
 * `CandidateTable`'s `sort-field` label (data stays readable case, CSS does
 * the instrument-voice transform).
 */
export function formatScopeTag(generationBasis: GenerationBasis): string {
  const { generation } = generationBasis;
  if (generation === "champions") {
    const regulation = CHAMPIONS_REGULATION.replace(/^Regulation\s+/i, "Reg ");
    return `Champions · ${regulation}`;
  }
  if (generation.startsWith("gen-")) {
    return `Gen ${generation.slice("gen-".length)}`;
  }
  return generation;
}
