/**
 * Strip invalid `citations[].anchor` and any model-emitted `origin` before
 * OakAnswer parse / persist (ADR-2, CIT-BR-3, VOICE-AC-1.2).
 *
 * A bad anchor is deleted; the rest of the citation (and the answer) stays
 * valid so it can never fail `submit_answer` or burn retries.
 */

const ANCHOR_ID = /^[A-Za-z0-9_.:#-]{1,64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidAnchor(
  anchor: unknown,
): anchor is { target: "answer_span" | "fact_row"; id: string } {
  if (!isRecord(anchor)) return false;
  // Extra keys → strip the whole anchor (ADR-2).
  const keys = Object.keys(anchor);
  if (keys.length !== 2 || !("target" in anchor) || !("id" in anchor)) {
    return false;
  }
  const { target, id } = anchor;
  if (target !== "answer_span" && target !== "fact_row") return false;
  if (typeof id !== "string" || !ANCHOR_ID.test(id)) return false;
  return true;
}

export function sanitizeCitationAnchors(answer: unknown): unknown {
  if (!isRecord(answer)) return answer;

  const hasOrigin = Object.prototype.hasOwnProperty.call(answer, "origin");
  let citationsChanged = false;
  let nextCitations: unknown = answer.citations;

  if (Array.isArray(answer.citations)) {
    nextCitations = answer.citations.map((citation) => {
      if (!isRecord(citation) || !("anchor" in citation)) return citation;
      if (isValidAnchor(citation.anchor)) return citation;
      citationsChanged = true;
      const { anchor: _dropped, ...rest } = citation;
      return rest;
    });
  }

  if (!hasOrigin && !citationsChanged) return answer;

  const out: Record<string, unknown> = { ...answer };
  if (hasOrigin) delete out.origin;
  if (citationsChanged) out.citations = nextCitations;
  return out;
}
