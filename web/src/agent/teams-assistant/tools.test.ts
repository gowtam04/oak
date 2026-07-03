/**
 * Pure unit tests for the team-builder assistant's scoped tool set + dispatch
 * (tools.ts). SECURITY-RELEVANT per the module header: `builderDispatch` must
 * reject any tool name outside its own subset with the documented in-domain
 * error shape, even for names that ARE real tools in the main 17-tool barrel
 * (save_team/get_team/list_teams/get_encounters/submit_answer).
 */

import { describe, expect, it, vi } from "vitest";

// Importing ./tools pulls in resolve-entity.ts, which does a real (non-type)
// `import { db } from "@/data/db"` at module load — @/data/db unconditionally
// `import "server-only"`, which throws under plain Node unless stubbed (the
// throw only makes sense inside Next's client-bundle resolution).
vi.mock("server-only", () => ({}));

import type { AgentContext } from "@/agent/types";
import { submitBuilderAnswerTool } from "@/agent/tools/submit-builder-answer";
import { builderDispatch, builderTools } from "./tools";

const EXCLUDED_TOOL_NAMES = [
  "save_team",
  "get_team",
  "list_teams",
  "get_encounters",
  "submit_answer",
];

describe("builderTools — the scoped read-only subset", () => {
  it("includes submit_builder_answer", () => {
    expect(builderTools.some((t) => t.name === "submit_builder_answer")).toBe(
      true,
    );
  });

  it("excludes save_team, get_team, list_teams, get_encounters, and submit_answer", () => {
    const names = builderTools.map((t) => t.name);
    for (const excluded of EXCLUDED_TOOL_NAMES) {
      expect(names).not.toContain(excluded);
    }
  });
});

describe("builderDispatch — rejects any name outside the builder subset", () => {
  it.each(EXCLUDED_TOOL_NAMES)(
    'returns {error:"unknown_tool"} for "%s" (a real main-barrel tool, but not offered here)',
    async (name) => {
      const result = await builderDispatch(name, {}, {} as AgentContext);
      expect(result).toEqual({ error: "unknown_tool", detail: name });
    },
  );

  it('returns {error:"unknown_tool"} for a name that is not a tool anywhere', async () => {
    const result = await builderDispatch(
      "definitely_not_a_tool",
      {},
      {} as AgentContext,
    );
    expect(result).toEqual({
      error: "unknown_tool",
      detail: "definitely_not_a_tool",
    });
  });

  it("dispatches a known builder tool by delegating to its run()", async () => {
    const result = await builderDispatch(
      "submit_builder_answer",
      { answer_markdown: "hi" },
      {} as AgentContext,
    );
    expect(result).toEqual({ answer_markdown: "hi" });
  });
});

describe("submitBuilderAnswerTool.run — echo-or-invalid_input", () => {
  it("echoes a valid payload back unchanged", async () => {
    const payload = {
      answer_markdown: "hi",
      team_patch: { slots: [] },
    };
    const result = await submitBuilderAnswerTool.run(
      payload,
      {} as AgentContext,
    );
    expect(result).toEqual(payload);
  });

  it("returns invalid_input with a non-empty detail string for a bad payload", async () => {
    const result = (await submitBuilderAnswerTool.run(
      {},
      {} as AgentContext,
    )) as { error: string; detail: string };
    expect(result.error).toBe("invalid_input");
    expect(typeof result.detail).toBe("string");
    expect(result.detail.length).toBeGreaterThan(0);
  });

  it("never throws on malformed input", async () => {
    await expect(
      submitBuilderAnswerTool.run(null, {} as AgentContext),
    ).resolves.toMatchObject({ error: "invalid_input" });
  });
});
