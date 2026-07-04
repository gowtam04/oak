/**
 * Prompt assembly — the single entry point the runtime calls to get a turn's
 * system prompt as provider-tuned {@link SystemSegment}s.
 *
 * ONE axis now: PROVIDER. Since Oak v2 P3 (prompt collapse) there is a SINGLE
 * canonical Markdown domain body (`./domain`) for a turn's scope — the
 * per-provider fork (a separate Grok-XML body) and the per-scope body fork
 * (champions vs per-gen) are gone. Scope is a set of FACTS injected into the one
 * body (`domainForMode(mode)`), not a body selector. All three providers wrap the
 * SAME body behind a thin style wrapper:
 *  - anthropic / xai → pass-through (`./style-claude`, `./style-grok`): two
 *    segments, the ephemeral cache breakpoint on the last.
 *  - openai → `./style-openai`: the same body plus its AGENT_CONTRACT /
 *    OUTPUT_CONTRACT segments (four segments, breakpoint on the last).
 *
 * INVARIANT (every provider): exactly ONE cache breakpoint, on the LAST segment.
 *
 * No SDK/env imports — the runtime imports this; nothing here pulls a secret or a
 * client.
 */

import { domainForMode } from "@/agent/prompts/domain";
import { buildClaudeSegments } from "@/agent/prompts/style-claude";
import { buildGrokSegments } from "@/agent/prompts/style-grok";
import { buildOpenAISegments } from "@/agent/prompts/style-openai";
import type { ProviderKind } from "@/agent/models";
import type { SystemSegment } from "@/agent/providers/types";
import type { AgentMode } from "@/agent/types";

export interface BuildSystemSegmentsOptions {
  provider: ProviderKind;
  mode: AgentMode;
}

/** Build the provider-tuned system segments for a turn (single body × provider). */
export function buildSystemSegments({
  provider,
  mode,
}: BuildSystemSegmentsOptions): SystemSegment[] {
  const domain = domainForMode(mode);
  switch (provider) {
    case "openai":
      return buildOpenAISegments(domain);
    case "xai":
      return buildGrokSegments(domain);
    case "anthropic":
    default:
      return buildClaudeSegments(domain);
  }
}
