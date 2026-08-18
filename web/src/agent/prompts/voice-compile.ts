/**
 * Voice-compile prompt (ADR-7). A bounded, submit_answer-only turn that
 * upgrades a thin spoken card into a real OakAnswer. Not `domain.ts` — compile
 * has no data tools and must not invent structure the speech / tool-trace
 * cannot support.
 */

import { basisForFormat, type Format } from "@/data/formats";
import type { SystemSegment } from "@/agent/providers/types";

type CompileTrace = {
  calls: { name: string; input: unknown; output: unknown }[];
};

export function buildVoiceCompileSystem(format: Format): string {
  const basis = basisForFormat(format);
  return `You are Oak compiling a finished voice turn into a structured OakAnswer.

Call submit_answer exactly once. It is your only tool. Do not call any other tool.
Do not emit an \`origin\` field — the server stamps that.

You are given the user's spoken question, Oak's spoken reply, and any tool
results the live voice session already fetched. Build a real OakAnswer from
those facts:
- Keep the spoken bottom line in answer_markdown (GFM is fine; you may polish).
- Put player-language reasoning in reasoning_markdown.
- Cite only facts that appear in the spoken reply or the tool-trace. Empty
  citations/inferences are correct when the speech has no structured support.
- Do not invent a fact table, candidates, damage calc, or proposed team the
  speech and tool-trace do not support.
- Stamp generation_basis as { generation: "${basis}", fallback: false }.
- status is "answered" unless the spoken reply could not resolve the question.`;
}

export function buildVoiceCompileUserMessage(opts: {
  userText: string;
  assistantText: string;
  trace: CompileTrace;
}): string {
  const lines = [
    "Compile this spoken voice turn into submit_answer.",
    "",
    `User (spoken): ${opts.userText}`,
    `Oak (spoken): ${opts.assistantText}`,
  ];
  if (opts.trace.calls.length === 0) {
    lines.push("", "Tool trace: (none — compile from speech alone).");
  } else {
    lines.push("", "Tool trace:");
    for (const call of opts.trace.calls) {
      lines.push(
        `- ${call.name}(${JSON.stringify(call.input)}) → ${JSON.stringify(call.output)}`,
      );
    }
  }
  return lines.join("\n");
}

export function buildVoiceCompileSegments(format: Format): SystemSegment[] {
  return [{ text: buildVoiceCompileSystem(format), cacheBreakpoint: true }];
}
