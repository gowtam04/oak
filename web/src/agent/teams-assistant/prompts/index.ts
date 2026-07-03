/**
 * Team-builder assistant — prompt assembly (the builder twin of
 * @/agent/prompts/index.ts).
 *
 * Same two orthogonal axes as the main agent: MODE selects the domain body
 * (mainline templated from gen-info; Champions standalone) and PROVIDER selects
 * authoring + style. The style wrappers are REUSED UNCHANGED from the main
 * prompt layer — they are generic over {@link PromptDomain}.
 *
 * No SDK/env imports — safe for the runtime to import.
 */

import { builderDomainForMode } from "@/agent/teams-assistant/prompts/domain";
import { grokBuilderDomainForMode } from "@/agent/teams-assistant/prompts/domain-grok";
import { buildClaudeSegments } from "@/agent/prompts/style-claude";
import { buildGrokSegments } from "@/agent/prompts/style-grok";
import { buildOpenAISegments } from "@/agent/prompts/style-openai";
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
  switch (provider) {
    case "openai":
      return buildOpenAISegments(builderDomainForMode(mode));
    case "xai":
      // Grok runs on its own XML-sectioned body, not the shared Markdown one.
      return buildGrokSegments(grokBuilderDomainForMode(mode));
    case "anthropic":
    default:
      return buildClaudeSegments(builderDomainForMode(mode));
  }
}
