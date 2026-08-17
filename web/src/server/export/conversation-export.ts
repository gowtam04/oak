/**
 * Conversation export builder (chat-qol Phase 5 / ADR-7).
 *
 * Markdown is the source of truth: each user question plus the assistant
 * human-copy projection (prose, fact tables, caveats, proposed team). The PDF
 * is a simple pdfkit text render of that same markdown — default wrapping and
 * continueOnNewPage, no Chromium, no tool-activity (EXP-BR-1).
 */

import "server-only";

import PDFDocument from "pdfkit";

import type { OakAnswer } from "@/agent/schemas";
import { oakAnswerToHumanMarkdown } from "@/lib/oak-answer-human-md";

/** Stored-message shape the builder consumes (`getMessages` / `StoredTurn`). */
export interface ExportMessage {
  role: "user" | "assistant";
  textContent: string;
  answerJson: string | null;
}

/**
 * Readable Markdown for one conversation: questions, answers, and tables, in
 * turn order. Extra live-SSE fields (e.g. `toolActivity`) are ignored.
 */
export function toMarkdown(messages: readonly ExportMessage[]): string {
  const blocks: string[] = [];
  for (const msg of messages) {
    if (msg.role === "user") {
      const question = msg.textContent.trim();
      if (!question) continue;
      blocks.push(`### You\n\n${question}`);
    } else {
      const body = assistantBody(msg);
      if (!body) continue;
      blocks.push(`### Oak\n\n${body}`);
    }
  }
  return blocks.join("\n\n");
}

/**
 * Same content as {@link toMarkdown}, as a printable PDF buffer.
 * `title` is written as the document Title/Subject (not the body).
 */
export function toPdfBuffer(
  messages: readonly ExportMessage[],
  title?: string,
): Promise<Buffer> {
  return renderPdf(toMarkdown(messages), title);
}

function assistantBody(msg: ExportMessage): string {
  if (msg.answerJson) {
    try {
      const parsed = JSON.parse(msg.answerJson) as OakAnswer;
      if (parsed && typeof parsed.answer_markdown === "string") {
        return oakAnswerToHumanMarkdown(parsed).trim();
      }
    } catch {
      // Stored JSON can be missing or partial (voice / thin transcript).
    }
  }
  return msg.textContent.trim();
}

function renderPdf(markdown: string, title?: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const heading = title?.trim() || "Oak conversation";
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: 56, bottom: 56, left: 56, right: 56 },
      info: { Title: heading, Subject: heading },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    doc.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on("error", reject);

    // Default lineBreak + width: LineWrapper wraps and calls continueOnNewPage.
    if (title?.trim()) {
      doc.font("Helvetica-Bold").fontSize(14).text(title.trim());
      doc.moveDown(0.6);
    }
    doc.font("Helvetica").fontSize(11).text(markdown);
    doc.end();
  });
}
