/**
 * calc-client — typed `fetch` helper over `POST /api/calc`.
 *
 * Never throws: a transport fault, a non-2xx, or a body that fails
 * `calcResultSchema` all fold to `null`. A 200 in-domain miss (`incomplete`,
 * `unresolved`, `status_move`, `index_unavailable`) is a valid result and is
 * returned as-is. Public endpoint — `credentials: "same-origin"` is enough.
 */

import {
  calcResultSchema,
  type CalcResult,
  type CalcScenario,
} from "@/lib/calc/calc-schema";

export async function postCalc(
  scenario: CalcScenario,
  signal?: AbortSignal,
): Promise<CalcResult | null> {
  try {
    const res = await fetch("/api/calc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(scenario),
      signal,
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const parsed = calcResultSchema.safeParse(data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
