/**
 * Unit tests for `toMarkdown` / `toPdfBuffer` (chat-qol Phase 5).
 *
 * The builder is the source of truth for export content (ADR-7): Markdown first,
 * then a simple text/table PDF via pdfkit. Input is the `getMessages` shape
 * (`role`, `textContent`, `answerJson`) — questions + assistant OakAnswers.
 *
 * Requirement refs: EXP-US-1, EXP-US-2, EXP-AC-1.1, EXP-AC-1.2, EXP-AC-2.1,
 * EXP-BR-1, EXP-BR-2.
 */

import { inflateSync } from "node:zlib";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { OakAnswer } from "@/agent/schemas";

import { toMarkdown, toPdfBuffer } from "./conversation-export";

/** Distinctive live-trace string that must never appear in an export. */
const TOOL_TRACE = "tool_activity: resolve_entity → get_pokemon (fetching Garchomp…)";

const Q1 = "What beats Garchomp in SV OU?";
const A1 = "Use a bulky Ice-type such as Baxcalibur.";
const Q2 = "Give me a steel wall";
const A2 = "Skarmory is the classic.";

const ANSWER_WITH_TABLE: OakAnswer = {
  status: "answered",
  answer_markdown: A1,
  reasoning_markdown: `Called tools then reasoned. ${TOOL_TRACE}`,
  citations: [
    {
      source: "pokemon/baxcalibur",
      detail: "base speed: 87",
      endpoint_url: "https://example.test/baxcalibur",
    },
  ],
  inferences: [],
  generation_basis: { generation: "gen-9", fallback: false },
  candidates: {
    total_count: 1,
    truncated: false,
    sort: "speed desc",
    shown: [
      {
        name: "Baxcalibur",
        dex_number: 998,
        types: ["ice", "dragon"],
        base_stats: {
          hp: 115,
          attack: 145,
          defense: 92,
          special_attack: 75,
          special_defense: 86,
          speed: 87,
        },
      },
    ],
  },
};

const ANSWER_WITH_GFM: OakAnswer = {
  status: "answered",
  answer_markdown: `${A2}

| Wall | Role |
| --- | --- |
| Skarmory | Steels |`,
  reasoning_markdown: "—",
  citations: [],
  inferences: [],
  generation_basis: { generation: "gen-9", fallback: false },
};

/**
 * Stored-message shape the builder consumes (conversation-repo `StoredTurn`).
 * Extra `toolActivity` is a live-SSE field that must be ignored (EXP-BR-1).
 */
function userMsg(
  text: string,
  seq: number,
  extra?: Record<string, unknown>,
) {
  return {
    id: `u-${seq}`,
    role: "user" as const,
    seq,
    textContent: text,
    answerJson: null,
    createdAt: seq,
    ...extra,
  };
}

function asstMsg(
  answer: OakAnswer,
  seq: number,
  extra?: Record<string, unknown>,
) {
  return {
    id: `a-${seq}`,
    role: "assistant" as const,
    seq,
    textContent: answer.answer_markdown,
    answerJson: JSON.stringify(answer),
    createdAt: seq,
    ...extra,
  };
}

function sampleMessages() {
  return [
    userMsg(Q1, 0, {
      toolActivity: [{ tool: "get_pokemon", label: TOOL_TRACE }],
    }),
    asstMsg(ANSWER_WITH_TABLE, 1, {
      toolActivity: [{ tool: "get_pokemon", label: TOOL_TRACE }],
    }),
    userMsg(Q2, 2),
    asstMsg(ANSWER_WITH_GFM, 3),
  ];
}

/**
 * Search raw + inflated content streams, plus decoded pdfkit TJ hex
 * (`<57686174>` → `What`). Kerned fragments (`Baxcalib` + `ur`) are
 * concatenated so toContain can match the full word.
 */
function pdfHaystack(buf: Buffer): string {
  const raw = buf.toString("latin1");
  const decoded: string[] = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  for (const match of raw.matchAll(re)) {
    const payload = match[1];
    if (!payload) continue;
    let content = payload;
    try {
      content = inflateSync(Buffer.from(payload, "latin1")).toString("latin1");
    } catch {
      // not a flate stream
    }
    if (content.includes("TJ") || content.includes("Tj")) {
      decoded.push(decodeTjHex(content));
    }
  }
  // One string: kerned TJ shards from every page reassemble before toContain.
  return decoded.join("");
}

/** Decode pdfkit `<hex>` TJ operands into WinAnsi/ASCII text. */
function decodeTjHex(content: string): string {
  const parts: string[] = [];
  for (const m of content.matchAll(/<([0-9A-Fa-f\s]+)>/g)) {
    const hex = (m[1] ?? "").replace(/\s+/g, "");
    if (hex.length < 2 || hex.length % 2 !== 0) continue;
    let s = "";
    for (let i = 0; i < hex.length; i += 2) {
      s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    }
    if (s.length > 0) parts.push(s);
  }
  return parts.join("");
}

function pageCount(buf: Buffer): number {
  return (buf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
}

async function pdfBytes(
  messages: Parameters<typeof toPdfBuffer>[0],
  title?: string,
): Promise<Buffer> {
  const out = await Promise.resolve(toPdfBuffer(messages, title));
  return Buffer.from(out);
}

const LAST_Q = "UNIQUE_PAGE_TWO_QUESTION_zeta";
const LAST_A = "UNIQUE_PAGE_TWO_ANSWER_omega";

/** Enough vertical copy that Letter + 56pt margins must paginate. */
function multiPageMessages() {
  const filler = Array.from(
    { length: 80 },
    (_, i) =>
      `Filler paragraph ${i}. This block exists so the PDF must continue on a new page.`,
  ).join("\n\n");
  return [
    userMsg("Long thread start", 0),
    asstMsg(
      {
        status: "answered",
        answer_markdown: filler,
        reasoning_markdown: "—",
        citations: [],
        inferences: [],
        generation_basis: { generation: "gen-9", fallback: false },
      },
      1,
    ),
    userMsg(LAST_Q, 2),
    asstMsg(
      {
        status: "answered",
        answer_markdown: LAST_A,
        reasoning_markdown: "—",
        citations: [],
        inferences: [],
        generation_basis: { generation: "gen-9", fallback: false },
      },
      3,
    ),
  ];
}

// --- Markdown --------------------------------------------------------------

describe("toMarkdown — Q+A+tables, no tool-activity (EXP-US-1, EXP-BR-1)", () => {
  it("includes each question and answer in turn order (EXP-AC-1.1)", () => {
    const md = toMarkdown(sampleMessages());
    const iQ1 = md.indexOf(Q1);
    const iA1 = md.indexOf(A1);
    const iQ2 = md.indexOf(Q2);
    const iA2 = md.indexOf(A2);
    expect(iQ1).toBeGreaterThanOrEqual(0);
    expect(iA1).toBeGreaterThan(iQ1);
    expect(iQ2).toBeGreaterThan(iA1);
    expect(iA2).toBeGreaterThan(iQ2);
  });

  it("includes the structured candidate table (EXP-AC-1.1)", () => {
    const md = toMarkdown(sampleMessages());
    expect(md).toContain("|");
    expect(md).toContain("Baxcalibur");
    expect(md).toMatch(/ice\/dragon/i);
    expect(md).toContain("115");
    expect(md).toContain("145");
    expect(md).toContain("87");
  });

  it("includes GFM tables from answer_markdown (EXP-AC-1.1)", () => {
    const md = toMarkdown(sampleMessages());
    expect(md).toContain("Skarmory");
    expect(md).toContain("Steels");
    expect(md).toMatch(/\|/);
  });

  it("excludes the live tool-activity trace (EXP-AC-1.2, EXP-BR-1)", () => {
    const md = toMarkdown(sampleMessages());
    expect(md).not.toContain("tool_activity");
    expect(md).not.toContain("tool-activity");
    expect(md).not.toContain(TOOL_TRACE);
    expect(md).not.toContain("fetching Garchomp");
  });

  it("does not dump internal reasoning (EXP-AC-1.1 is Q+A+tables)", () => {
    const md = toMarkdown(sampleMessages());
    expect(md).not.toContain("Called tools then reasoned.");
    expect(md).not.toContain("reasoning_markdown");
  });
});

// --- PDF -------------------------------------------------------------------

describe("toPdfBuffer — same content as Markdown (EXP-US-2, ADR-7)", () => {
  it("returns a %PDF buffer that contains the questions and answers (EXP-AC-2.1)", async () => {
    const buf = await pdfBytes(sampleMessages());
    expect(buf.subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(buf.length).toBeGreaterThan(8);

    const text = pdfHaystack(buf);
    expect(text).toContain(Q1);
    expect(text).toContain(A1);
    expect(text).toContain(Q2);
    expect(text).toContain(A2);
  });

  it("includes table facts and omits the tool-activity trace (EXP-AC-2.1, EXP-BR-1)", async () => {
    const text = pdfHaystack(await pdfBytes(sampleMessages()));
    expect(text).toContain("Baxcalibur");
    expect(text).toContain("115");
    expect(text).toContain("145");
    expect(text).not.toContain("tool_activity");
    expect(text).not.toContain(TOOL_TRACE);
    expect(text).not.toContain("fetching Garchomp");
  });

  it("records the conversation title as Subject, not the markdown body", async () => {
    const title = "OU-lab";
    const buf = await pdfBytes(sampleMessages(), title);
    const raw = buf.toString("latin1");
    expect(raw).toContain(`(${title})`);
    expect(raw).not.toContain(Q1);
    expect(pdfHaystack(buf)).toContain(Q1);
  });

  it("wraps and paginates so a later Q/A still appears (EXP-AC-2.1)", async () => {
    const buf = await pdfBytes(multiPageMessages(), "Long thread");
    expect(pageCount(buf)).toBeGreaterThanOrEqual(2);
    const text = pdfHaystack(buf);
    expect(text).toContain(LAST_Q);
    expect(text).toContain(LAST_A);
  });
});
