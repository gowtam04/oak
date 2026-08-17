/**
 * Client island on the public share page: human copy (CQ-OQ-5 / ADR-13) and
 * Open in Oak (SHARE-US-5). No Share / Pin / Fork / Retry / Edit.
 */

"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import AuthDialog from "@/components/auth/AuthDialog";
import type { OakAnswer } from "@/agent/schemas";
import { oakAnswerToHumanMarkdown } from "@/lib/oak-answer-human-md";
import { fetchMe } from "@/lib/api/auth-client";
import { importTeamFromShare } from "@/lib/api/share-client";

export default function ShareActions({
  shareId,
  answer,
  hasProposedTeam,
}: {
  shareId: string;
  answer: OakAnswer;
  hasProposedTeam: boolean;
}) {
  const router = useRouter();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const [importing, setImporting] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  const handleCopy = useCallback(async () => {
    const md = oakAnswerToHumanMarkdown(answer);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(md);
      } else {
        const ta = document.createElement("textarea");
        ta.value = md;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("failed");
      window.setTimeout(() => setCopyState("idle"), 2200);
    }
  }, [answer]);

  const runImport = useCallback(async () => {
    setImporting(true);
    const teamId = await importTeamFromShare(shareId);
    setImporting(false);
    if (teamId) {
      router.push(`/teams?team=${encodeURIComponent(teamId)}`);
    }
  }, [router, shareId]);

  const handleOpenInOak = useCallback(async () => {
    const me = await fetchMe();
    if (!me.signedIn) {
      setAuthOpen(true);
      return;
    }
    await runImport();
  }, [runImport]);

  return (
    <div className="share-page__actions">
      <button
        type="button"
        className="tm-btn tm-btn--secondary"
        data-testid="share-copy-human"
        onClick={() => void handleCopy()}
      >
        {copyState === "copied"
          ? "Copied"
          : copyState === "failed"
            ? "Copy failed"
            : "Copy as text"}
      </button>
      {hasProposedTeam ? (
        <button
          type="button"
          className="tm-btn tm-btn--primary"
          data-testid="share-open-in-oak"
          disabled={importing}
          onClick={() => void handleOpenInOak()}
        >
          {importing ? "Importing…" : "Open in Oak"}
        </button>
      ) : (
        <Link
          href="/"
          className="tm-btn tm-btn--primary"
          data-testid="share-open-in-oak"
        >
          Open in Oak
        </Link>
      )}
      <AuthDialog
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onSignedIn={() => {
          setAuthOpen(false);
          void runImport();
        }}
      />
    </div>
  );
}
