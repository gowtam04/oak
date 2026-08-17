/**
 * `GET /api/conversations/[id]/export?format=md|pdf` — download one
 * conversation as Markdown or a simple PDF (chat-qol Phase 5; EXP-US-1,
 * EXP-US-2, EXP-BR-1, EXP-BR-2, ADR-7).
 *
 * Signed-in owner only. Body is questions + answers + tables — never a zip of
 * all history, never the live tool-activity trace. The file is produced for
 * the owner and is not published.
 *
 *   md  → 200 text/markdown attachment `{title}.md`
 *   pdf → 200 application/pdf attachment `{title}.pdf`
 *   empty conversation → 400 empty_conversation
 *   guest → 401 unauthenticated; missing / other account → 404
 */

import { json } from "@/app/api/auth/_lib/http";
import { currentAccount, conversationRepo } from "../../_lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function exportError(
  status: number,
  error: string,
  message?: string,
): Response {
  return json(status, message === undefined ? { error } : { error, message });
}

const UNAUTHORIZED = () =>
  exportError(401, "unauthenticated", "You must be signed in.");
const NOT_FOUND = () => exportError(404, "not_found", "Conversation not found.");

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const account = await currentAccount();
  if (account === null) return UNAUTHORIZED();
  const { id } = await ctx.params;

  const format = new URL(req.url).searchParams.get("format");
  if (format !== "md" && format !== "pdf") {
    return exportError(400, "invalid_format", "format must be md or pdf.");
  }

  const repo = await conversationRepo();
  const conv = await repo.getConversation(account.id, id);
  if (conv === null) return NOT_FOUND();

  const messages = await repo.getMessages(account.id, id);
  if (messages.length === 0) {
    return exportError(
      400,
      "empty_conversation",
      "Conversation has no turns to export.",
    );
  }

  const { toMarkdown, toPdfBuffer } = await import(
    "@/server/export/conversation-export"
  );
  const basename = filenameBase(conv.title);

  if (format === "md") {
    const body = toMarkdown(messages);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": attachmentDisposition(`${basename}.md`),
        "Cache-Control": "private, no-store",
      },
    });
  }

  const buf = await toPdfBuffer(messages, conv.title);
  return new Response(Uint8Array.from(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": attachmentDisposition(`${basename}.pdf`),
      "Cache-Control": "private, no-store",
    },
  });
}

/** Keep the title readable in the download name; strip path / header metachars. */
function filenameBase(title: string): string {
  const collapsed = title.trim().replace(/\s+/g, " ");
  const stripped = collapsed.replace(/[/\\?%*:|"<>]/g, "-").replace(/\.+$/g, "");
  return (stripped || "conversation").slice(0, 80);
}

function attachmentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
