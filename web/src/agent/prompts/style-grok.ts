/**
 * Grok 4.3 prompt style.
 *
 * Since Oak v2 P3 (prompt collapse) Grok runs on the SAME single canonical
 * Markdown domain body (`./domain`) as Claude and OpenAI — the separate
 * Grok-native XML body is gone. Grok reads the shared body well, so this builder
 * is a thin pass-through, identical in shape to the Claude style: two segments
 * (system body + few-shot) with ONE ephemeral cache breakpoint on the last
 * segment. xAI caches a stable prefix automatically; we never force tool_choice
 * (Grok reasons natively and submit_answer is driven by the prompt + the
 * iteration cap).
 *
 * Note: xAI streams a tool call as a single chunk, so answer_markdown arrives at
 * once rather than token-by-token — handled transparently by the runtime; no
 * prompt accommodation needed.
 */

import type { PromptDomain } from "@/agent/prompts/domain";
import type { SystemSegment } from "@/agent/providers/types";

export function buildGrokSegments(domain: PromptDomain): SystemSegment[] {
  return [
    { text: domain.systemPrompt },
    { text: domain.fewShot, cacheBreakpoint: true },
  ];
}
