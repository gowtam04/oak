/**
 * Team-builder assistant — prompt assembly (the builder twin of
 * @/agent/prompts/index.ts).
 *
 * ONE canonical Markdown domain body (`./domain`) for every provider; style
 * wrappers only differ for OpenAI (builder-specific contracts). Claude and Grok
 * are thin pass-throughs via the shared main-agent style modules.
 *
 * No SDK/env imports — safe for the runtime to import.
 */

import { builderDomainForMode } from "@/agent/teams-assistant/prompts/domain";
import { buildBuilderOpenAISegments } from "@/agent/teams-assistant/prompts/style-openai";
import { buildClaudeSegments } from "@/agent/prompts/style-claude";
import { buildGrokSegments } from "@/agent/prompts/style-grok";
import type { ProviderKind } from "@/agent/models";
import type { SystemSegment } from "@/agent/providers/types";
import type { AgentMode } from "@/agent/types";

export interface BuildBuilderSystemSegmentsOptions {
  provider: ProviderKind;
  mode: AgentMode;
}

/** Provider-tuned system segments for a builder-assistant turn. */
export function buildBuilderSystemSegments({
  provider,
  mode,
}: BuildBuilderSystemSegmentsOptions): SystemSegment[] {
  const domain = builderDomainForMode(mode);
  switch (provider) {
    case "openai":
      return buildBuilderOpenAISegments(domain);
    case "xai":
      return buildGrokSegments(domain);
    case "anthropic":
    default:
      return buildClaudeSegments(domain);
  }
}
