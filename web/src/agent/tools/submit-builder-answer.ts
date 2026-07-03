/**
 * `submit_builder_answer` — the team-builder assistant's terminal action
 * (mirrors T11 `submit_answer` exactly in mechanics; see submit-answer.ts).
 *
 * The tool's input IS the full `BuilderAnswer` object
 * (teams-assistant/schemas.ts). `run` validates against the single-source Zod
 * schema and echoes it back: success → the validated BuilderAnswer; failure →
 * { error: "invalid_input", detail } so the runtime can request a re-emit. It
 * never throws. NOT part of the fixed 17-tool barrel (tools/index.ts) — it is
 * assembled only into the builder assistant's own tool list
 * (teams-assistant/tools.ts).
 */

import type { ToolDef } from "@/agent/types";
import { toJsonSchema } from "@/agent/schemas";
import {
  builderAnswerSchema,
  type BuilderAnswer,
} from "@/agent/teams-assistant/schemas";

const description =
  "Submit your final answer for this team-building turn. Call this exactly " +
  "once, as your last action, every turn — it is the ONLY way to reply. Put " +
  "your conversational reply in answer_markdown. When (and only when) you are " +
  "proposing concrete edits to the on-screen draft, also set team_patch: " +
  "slot-level edits where each edit carries the COMPLETE member payload for " +
  "that slot (or null to remove the slot); slot indices refer to the draft as " +
  "it was sent to you this turn. For pure advice/answers, omit team_patch.";

type SubmitBuilderAnswerResult =
  | BuilderAnswer
  | { error: "invalid_input"; detail: string };

export const submitBuilderAnswerTool: ToolDef = {
  name: "submit_builder_answer",
  description,
  inputSchema: toJsonSchema(builderAnswerSchema),
  run(args): Promise<SubmitBuilderAnswerResult> {
    const parsed = builderAnswerSchema.safeParse(args);
    if (!parsed.success) {
      return Promise.resolve({
        error: "invalid_input",
        detail: parsed.error.issues
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; "),
      });
    }
    return Promise.resolve(parsed.data);
  },
};
