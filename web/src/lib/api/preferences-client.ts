/**
 * preferences-client — typed `fetch` helper over
 * `PATCH /api/account/preferences` (COMPACT-US-2, ADR-9).
 *
 * Never throws: guest 401, 400, or a transport fault fold to `null`.
 */

export type AnswerDensity = "full" | "compact";

const JSON_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
};

async function readJsonBody(res: Response): Promise<Record<string, unknown>> {
  try {
    const data: unknown = await res.json();
    if (data !== null && typeof data === "object") {
      return data as Record<string, unknown>;
    }
  } catch {
    /* non-JSON or empty body */
  }
  return {};
}

/**
 * `PATCH /api/account/preferences` — persist compact/full for this account.
 * Guests have no server row (COMPACT-BR-4); they stay on device storage.
 */
export async function updateAnswerDensity(
  density: AnswerDensity,
): Promise<AnswerDensity | null> {
  try {
    const res = await fetch("/api/account/preferences", {
      method: "PATCH",
      headers: JSON_HEADERS,
      credentials: "same-origin",
      body: JSON.stringify({ answer_density: density }),
    });
    if (!res.ok) return null;
    const body = await readJsonBody(res);
    return body.answerDensity === "full" || body.answerDensity === "compact"
      ? body.answerDensity
      : null;
  } catch {
    return null;
  }
}
