/**
 * Distill a finalized `OakAnswer` into machine-oriented markdown for agents /
 * external tools ("Copy for agents" — specimen desk Phase 3 / dual surface).
 *
 * Pure: no DOM, no clipboard. The UI layer copies the returned string.
 */

import type { OakAnswer } from "@/agent/schemas";

/**
 * Render a compact, structured markdown export of an OakAnswer.
 * Includes status, scope/basis, answer body, subjects, inferences, citations,
 * and uncertainty flags — the dual-surface "machine strip" of the human plate.
 */
export function oakAnswerToAgentMarkdown(answer: OakAnswer): string {
  const lines: string[] = [];

  lines.push("# Oak answer");
  lines.push("");
  lines.push(`- **Status:** ${answer.status}`);

  const basis = answer.generation_basis;
  const scopeParts = [basis.generation];
  if (basis.fallback) scopeParts.push("fallback");
  lines.push(`- **Scope / basis:** ${scopeParts.join(" · ")}`);
  if (basis.note) {
    lines.push(`- **Basis note:** ${basis.note}`);
  }

  lines.push("");
  lines.push("## Answer");
  lines.push("");
  lines.push(answer.answer_markdown.trim() || "_(empty)_");

  if (answer.subjects && answer.subjects.length > 0) {
    lines.push("");
    lines.push("## Subjects");
    lines.push("");
    for (const s of answer.subjects) {
      const types = s.types.length > 0 ? s.types.join("/") : "unknown";
      const dex = s.dex_number != null ? ` #${s.dex_number}` : "";
      const fallback = s.is_fallback
        ? ` _(fallback${s.source_generation ? `: ${s.source_generation}` : ""})_`
        : "";
      lines.push(`- **${s.name}**${dex} — ${types}${fallback}`);
    }
  }

  if (answer.inferences && answer.inferences.length > 0) {
    lines.push("");
    lines.push("## Inferences");
    lines.push("");
    for (const inf of answer.inferences) {
      lines.push(`- **[${inf.confidence}]** ${inf.claim}`);
      if (inf.note) lines.push(`  - ${inf.note}`);
    }
  }

  if (answer.citations && answer.citations.length > 0) {
    lines.push("");
    lines.push("## Citations");
    lines.push("");
    for (const c of answer.citations) {
      const url = c.endpoint_url ? ` <${c.endpoint_url}>` : "";
      lines.push(`- \`${c.source}\` — ${c.detail}${url}`);
    }
  }

  if (answer.uncertainty_flags && answer.uncertainty_flags.length > 0) {
    lines.push("");
    lines.push("## Uncertainty flags");
    lines.push("");
    for (const f of answer.uncertainty_flags) {
      lines.push(`- ${f}`);
    }
  }

  if (answer.reasoning_markdown?.trim()) {
    lines.push("");
    lines.push("## Reasoning");
    lines.push("");
    lines.push(answer.reasoning_markdown.trim());
  }

  lines.push("");
  return lines.join("\n");
}
