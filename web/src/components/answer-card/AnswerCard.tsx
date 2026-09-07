"use client";

import { useState } from "react";

import type { AnswerCardProps, Citation, DamageCalc } from "@/components/types";
import Masthead from "@/components/answer-card/Masthead";
import AnswerBody from "@/components/answer-card/AnswerBody";
import SpriteCard from "@/components/answer-card/SpriteCard";
import CandidateTable from "@/components/answer-card/CandidateTable";
import InferenceCallout from "@/components/answer-card/InferenceCallout";
import CaveatStrip from "@/components/answer-card/CaveatStrip";
import DamageReadout from "@/components/answer-card/DamageReadout";
import SuggestionChips from "@/components/answer-card/SuggestionChips";
import QuestionOptions from "@/components/answer-card/QuestionOptions";
import ReceiptsFooter from "@/components/answer-card/ReceiptsFooter";
import ProposedTeamCard from "@/components/teams/ProposedTeamCard";
import SavedTeamCard from "@/components/teams/SavedTeamCard";
import { useArtifactViewer } from "@/components/artifact/useArtifactViewer";
import { parseCitationSource } from "@/components/artifact/parse-citation";
import TypeBadge from "@/components/TypeBadge";
import { plateFromSubjects } from "@/lib/plate-types";
import { isFormat, type Format } from "@/data/formats";

function formatFromAnswer(
  generation: string,
  fallback: Format,
): Format {
  if (generation === "gen-9") return "scarlet-violet";
  return isFormat(generation) ? generation : fallback;
}

/**
 * AnswerCard — the top-level renderer for a single `OakAnswer` (T11 /
 * output-formats.md). It fans each field of the payload out to its mapped leaf
 * component (ux-design.md "Surfaces / Components" table), in the reading order:
 *
 *   1. CaveatStrip       ← uncertainty_flags[] + generation_basis.fallback (prominent, top)
 *   2. AnswerBody        ← answer_markdown (always)
 *   3. QuestionOptions   ← question.options[] — the "stop and ask" CTA; click → follow-up turn
 *   4. SpriteCard[]      ← subjects[]
 *   5. CandidateTable    ← candidates ("N of M" when truncated)
 *   6. DamageReadout     ← damage_calc
 *   7. InferenceCallout  ← inferences[]
 *   8. SuggestionChips   ← suggestions[] (+ status) — click → follow-up turn
 *   9. ReceiptsFooter    ← reasoning_markdown + citations[] (unified expandable)
 *
 * `onFollowUp` is threaded into the interactive leaves (SuggestionChips,
 * QuestionOptions, and CandidateTable's "Show all N"). A suggestion click sends
 * the chosen name verbatim — a plain follow-up turn for the SAME session
 * (ux-design.md UI → Agent Input Map). A candidate row click instead opens that
 * Pokémon's artifact in the viewer (CandidateTable owns that, no follow-up).
 *
 * Enamel paper plate (enamel-paper.md):
 *  - White `--surface` card, 24px pad, radius-lg, umber raised shadow.
 *  - `Masthead` (status + scope tag) leads the card.
 *  - `data-plate` is kept for tests; type-light radials stay off.
 *  - `AnswerBody` + `subjects[]` share an "evidence rail" row so sprite cards
 *    sit beside the prose instead of stranding it (media object, stacks on
 *    narrow viewports).
 *  - Reasoning + sources live in a Why / Sources disclosure.
 */
export default function AnswerCard({
  answer,
  onFollowUp,
  disabled = false,
  signedIn = false,
  onShare,
  density = "full",
  hydrate,
  onHydrateRetry,
  onOpenCalculator,
  format = "national-dex",
}: AnswerCardProps & {
  signedIn?: boolean;
  onShare?: () => void;
  density?: "full" | "compact";
  hydrate?: { status: "running" | "failed" };
  onHydrateRetry?: () => void;
  onOpenCalculator?: (calc: DamageCalc, format: Format) => void;
  format?: Format;
}) {
  const {
    status,
    answer_markdown,
    reasoning_markdown,
    citations,
    inferences,
    generation_basis,
    subjects,
    candidates,
    damage_calc,
    suggestions,
    question,
    uncertainty_flags,
    proposed_team,
    proposed_team_warnings,
    saved_team,
  } = answer;

  // Stable no-op so the interactive leaves always have a handler even when the
  // host did not pass one (keeps rows/chips clickable in isolation/tests). While
  // a turn is streaming (`disabled`) the alias is inert too — belt-and-suspenders
  // so a mid-stream follow-up can't abort/orphan the in-flight turn even if a
  // leaf were to fire its callback regardless of the `disabled` attribute (U2).
  const followUp = disabled ? () => {} : (onFollowUp ?? (() => {}));

  // Per-section "open in viewer" controls (B-4, AV-US-2). `openStructured` opens
  // a rich block (damage-calc, comparison) from THIS committed payload — no
  // fetch (TD-2). Its no-op default keeps the card renderable without a provider.
  const { openStructured, openEntity } = useArtifactViewer();
  const [highlight, setHighlight] = useState<{
    target: "answer_span" | "fact_row";
    id: string;
  } | null>(null);

  function handleCitationActivate(citation: Citation) {
    setHighlight(citation.anchor ?? null);
    const parsed = parseCitationSource(citation.source);
    if (parsed) openEntity(parsed);
  }

  const plate = plateFromSubjects(subjects);
  const plateClass = ["answer-card"].filter(Boolean).join(" ");
  const subjectTypes = [
    ...new Set((subjects ?? []).flatMap((s) => s.types)),
  ];

  return (
    <div
      className={plateClass}
      data-testid="answer-card"
      data-status={status}
      data-plate={plate.kind}
    >
      {subjectTypes.length > 0 && (
        <div className="answer-card__type-row" data-testid="answer-card-types">
          {subjectTypes.map((type) => (
            <TypeBadge key={type} type={type} />
          ))}
        </div>
      )}

      <Masthead status={status} generationBasis={generation_basis} />

      {answer.origin === "voice" && (
        <span
          className="answer-card__voice-glyph"
          data-testid="voice-origin-glyph"
          role="img"
          aria-label="Voice turn"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            aria-hidden="true"
            focusable="false"
          >
            <path
              fill="currentColor"
              d="M8 1a2.5 2.5 0 0 0-2.5 2.5v4a2.5 2.5 0 1 0 5 0v-4A2.5 2.5 0 0 0 8 1Zm-4 6.5a.75.75 0 0 0-1.5 0 5.5 5.5 0 0 0 4.75 5.45V14H5.75a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5H8.75v-1.05A5.5 5.5 0 0 0 13.5 7.5a.75.75 0 0 0-1.5 0 4 4 0 1 1-8 0Z"
            />
          </svg>
        </span>
      )}

      {hydrate?.status === "running" && (
        <p className="answer-card__hydrate" data-testid="voice-hydrate-banner">
          Finishing card…
        </p>
      )}
      {hydrate?.status === "failed" && (
        <p className="answer-card__hydrate" data-testid="voice-hydrate-banner">
          Couldn&apos;t build the full card.{" "}
          <button
            type="button"
            className="answer-card__hydrate-retry"
            onClick={() => onHydrateRetry?.()}
          >
            Retry
          </button>
        </p>
      )}

      <div
        className="answer-card__evidence-rail"
        data-testid="answer-card-evidence-rail"
      >
        <AnswerBody
          markdown={answer_markdown}
          citations={citations}
          highlighted={highlight}
        />

        {subjects && subjects.length > 0 && (
          <div
            className="answer-card__subjects"
            data-testid="answer-card-subjects"
          >
            {subjects.map((subject, i) => (
              <SpriteCard
                key={`${subject.name}-${i}`}
                subject={subject}
                signedIn={signedIn}
                format={format}
              />
            ))}
            {subjects.length >= 2 && (
              <button
                type="button"
                className="answer-card__open-viewer"
                data-testid="open-comparison"
                onClick={() => openStructured({ kind: "comparison", subjects })}
              >
                Compare in viewer
              </button>
            )}
          </div>
        )}
      </div>

      {question && question.options.length > 0 && (
        <QuestionOptions
          options={question.options}
          onSelect={(label) => followUp(label)}
          disabled={disabled}
        />
      )}

      {proposed_team && (
        <ProposedTeamCard
          proposedTeam={proposed_team}
          warnings={proposed_team_warnings}
          signedIn={signedIn}
        />
      )}

      {saved_team && <SavedTeamCard savedTeam={saved_team} />}

      {candidates && (
        <CandidateTable
          candidates={candidates}
          onShowAll={() =>
            followUp(
              `Show me all ${candidates.total_count} of those, not just the top ${candidates.shown.length}.`,
            )
          }
          disabled={disabled}
          signedIn={signedIn}
          format={format}
        />
      )}

      {damage_calc && (
        <div className="answer-card__damage">
          <DamageReadout
            damageCalc={damage_calc}
            onOpenCalculator={
              onOpenCalculator
                ? (calc) =>
                    onOpenCalculator(
                      calc,
                      formatFromAnswer(generation_basis.generation, format),
                    )
                : undefined
            }
          />
          <button
            type="button"
            className="answer-card__open-viewer"
            data-testid="open-damage-calc"
            onClick={() =>
              openStructured({ kind: "damage-calc", damageCalc: damage_calc })
            }
          >
            Open in viewer
          </button>
        </div>
      )}

      <InferenceCallout inferences={inferences} />

      <CaveatStrip
        uncertaintyFlags={uncertainty_flags ?? []}
        generationBasis={generation_basis}
      />

      {suggestions && suggestions.length > 0 && (
        <SuggestionChips
          suggestions={suggestions}
          status={status}
          onSelect={(suggestion) => followUp(suggestion)}
          disabled={disabled}
        />
      )}

      <ReceiptsFooter
        reasoningMarkdown={reasoning_markdown}
        citations={citations}
        answer={answer}
        signedIn={signedIn}
        onShare={onShare}
        defaultExpanded={density !== "compact"}
        onCitationActivate={handleCitationActivate}
      />
    </div>
  );
}
