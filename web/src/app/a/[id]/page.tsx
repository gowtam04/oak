/**
 * `GET /a/[id]` — public share HTML (SHARE-US-2, SHARE-BR-4/6, ADR-6, ADR-13).
 *
 * Live snapshot: question + existing AnswerCard + Open in Oak + human copy.
 * Revoked / unknown: dedicated unavailable page (not the app shell).
 * `robots: noindex`. Render is the frozen row — no live conversation read.
 */

import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { connection } from "next/server";

import AnswerCard from "@/components/answer-card/AnswerCard";
import OakWordmark from "@/components/brand/OakWordmark";
import { SITE_ORIGIN } from "@/lib/site";
import ShareUnavailable from "./unavailable";
import ShareActions from "./share-actions";
import ShareProposedTeam from "./share-proposed-team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const loadLiveShare = cache(async (id: string) => {
  const { getLiveShare } = await import("@/data/repos/share-repo");
  return getLiveShare(id);
});

function excerpt(text: string, max = 160): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

type Ctx = { params: Promise<{ id: string }> };

const UNAVAILABLE_TITLE = "Share unavailable";
const UNAVAILABLE_DESCRIPTION =
  "This share is unavailable. The link may have been revoked or never existed.";

export async function generateMetadata({ params }: Ctx): Promise<Metadata> {
  const { id } = await params;
  const share = await loadLiveShare(id);
  const robots = { index: false, follow: false } as const;
  const url = `${SITE_ORIGIN}/a/${id}`;
  if (share === null) {
    return {
      title: UNAVAILABLE_TITLE,
      description: UNAVAILABLE_DESCRIPTION,
      robots,
      openGraph: {
        title: UNAVAILABLE_TITLE,
        description: UNAVAILABLE_DESCRIPTION,
        url,
      },
    };
  }
  const description = excerpt(share.questionText);
  return {
    title: share.conversationTitle,
    description,
    robots,
    openGraph: {
      title: share.conversationTitle,
      description,
      url,
    },
  };
}

export default async function SharePage({ params }: Ctx) {
  // Opt into per-request rendering so revoke is immediate (ADR-6).
  await connection();
  const { id } = await params;
  const share = await loadLiveShare(id);
  if (share === null) return <ShareUnavailable />;

  return (
    <div className="share-page" data-testid="share-page">
      <header className="share-page__header">
        <div className="share-page__header-inner">
          <Link
            href="/"
            className="share-page__wordmark"
            aria-label="Oak — home"
          >
            <OakWordmark />
          </Link>
          <p className="share-page__kicker">Shared answer</p>
        </div>
      </header>
      <main className="share-page__main">
        <p className="share-page__question" data-testid="share-question">
          {share.questionText}
        </p>
        <AnswerCard
          answer={{
            ...share.answer,
            // Hide Save/Apply and the owner's SavedTeamCard (ADR-12 / ADR-13).
            proposed_team: undefined,
            saved_team: undefined,
          }}
          disabled
        />
        {share.answer.proposed_team && (
          <ShareProposedTeam
            proposedTeam={share.answer.proposed_team}
            warnings={share.answer.proposed_team_warnings}
          />
        )}
        <ShareActions
          shareId={share.id}
          answer={share.answer}
          hasProposedTeam={share.answer.proposed_team !== undefined}
        />
      </main>
    </div>
  );
}
