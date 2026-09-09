/**
 * Prompt assembly — the single entry point the runtime calls to get a turn's
 * system prompt as provider-tuned {@link SystemSegment}s.
 *
 * ONE axis now: PROVIDER. There is a SINGLE canonical Markdown domain body
 * (`./domain`) — Champions-only (`domainForMode` may ignore mode). All three
 * providers wrap the SAME body behind a thin style wrapper:
 *  - anthropic / xai → pass-through (`./style-claude`, `./style-grok`): two
 *    segments, the ephemeral cache breakpoint on the last.
 *  - openai → `./style-openai`: the same body plus its AGENT_CONTRACT /
 *    OUTPUT_CONTRACT segments (four segments, breakpoint on the last).
 *
 * INVARIANT (every provider): exactly ONE cache breakpoint, on the LAST
 * *cached* segment. An optional bound-teams segment may be appended after
 * that prefix and must not take the breakpoint.
 *
 * No SDK/env imports — the runtime imports this; nothing here pulls a secret or a
 * client.
 */

import { boundTeamsSegment } from "@/agent/prompts/bound-teams";
import { domainForMode } from "@/agent/prompts/domain";
import { buildClaudeSegments } from "@/agent/prompts/style-claude";
import { buildGrokSegments } from "@/agent/prompts/style-grok";
import { buildOpenAISegments } from "@/agent/prompts/style-openai";
import type { ProviderKind } from "@/agent/models";
import type { SystemSegment } from "@/agent/providers/types";
import type { AgentMode, BoundTeam } from "@/agent/types";

export interface BuildSystemSegmentsOptions {
  provider: ProviderKind;
  mode: AgentMode;
  /**
   * @mentioned teams for THIS turn. Appended as an extra uncached segment
   * AFTER the cached prefix; omitted when empty. Does not move the
   * cache breakpoint onto the extra segment.
   */
  boundTeams?: BoundTeam[];
}

/** Build the provider-tuned system segments for a turn (single body × provider). */
export function buildSystemSegments({
  provider,
  mode,
  boundTeams,
}: BuildSystemSegmentsOptions): SystemSegment[] {
  const domain = domainForMode(mode);
  let segments: SystemSegment[];
  switch (provider) {
    case "openai":
      segments = buildOpenAISegments(domain);
      break;
    case "xai":
      segments = buildGrokSegments(domain);
      break;
    case "anthropic":
    default:
      segments = buildClaudeSegments(domain);
      break;
  }
  // Extra segment is AFTER the cached prefix and must NOT take the
  // cacheBreakpoint (mentions are per-turn and would bust the prefix).
  if (boundTeams && boundTeams.length > 0) {
    return [...segments, boundTeamsSegment(boundTeams)];
  }
  return segments;
}
