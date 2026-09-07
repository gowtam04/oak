/**
 * TeamList — the left rail of `/teams`: living Champions teams plus an optional
 * Archived section (CF-TEAM-US-5, CF-UI-US-4). Create / import stay on the
 * living list. Archived rows are view + delete only (no duplicate / edit /
 * apply / use-in-chat).
 *
 * Pure presentational + local confirm state: every mutation is a parent callback
 * (the page wires them to the never-throwing `useTeams` hook). Each row is a card
 * showing the team name, format, member count, and an "incomplete" hint (a
 * partial team is valid — BR-T4) or a "full" badge at 6/6; selecting a row opens
 * it in the editor. Duplicate clones a living team (AC-4.2). Delete is a two-step
 * confirm in place (AC-4.3) so a stray click can't destroy a team. An empty living
 * list renders an inviting empty state with the two primary actions; an empty
 * archive is omitted.
 *
 * Guests never reach this component (the page shows a sign-in prompt instead),
 * so there is no auth branch here.
 */

"use client";

import { useState } from "react";

import type { TeamSummary } from "@/lib/api/teams-client";
import { formatLabel } from "./display-names";

import "./team-list.css";

export interface TeamListProps {
  teams: TeamSummary[];
  /** Other-format teams; omitted/empty ⇒ no Archived section (CF-TEAM-AC-5.5). */
  archivedTeams?: TeamSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onImport: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function TeamList({
  teams,
  archivedTeams,
  selectedId,
  onSelect,
  onNew,
  onImport,
  onDuplicate,
  onDelete,
}: TeamListProps) {
  // Id pending delete confirmation (null = none armed).
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const archived = archivedTeams ?? [];

  function renderRow(team: TeamSummary, archivedRow: boolean) {
    const selected = team.id === selectedId;
    const confirming = confirmingId === team.id;
    const full = team.memberCount === 6 && !team.incomplete;
    return (
      <li
        key={team.id}
        className="team-list__row"
        data-testid={`team-row-${team.id}`}
        data-selected={selected ? "true" : "false"}
        data-archived={archivedRow ? "true" : "false"}
      >
        <button
          type="button"
          className="team-list__open"
          data-testid={`team-open-${team.id}`}
          onClick={() => onSelect(team.id)}
        >
          <span className="team-list__name">
            {team.name || "Untitled team"}
          </span>
          <span className="team-list__meta">
            {formatLabel(team.format)} · {team.memberCount}/6
            {team.incomplete && (
              <span
                className="team-list__flag team-list__flag--incomplete"
                data-testid={`team-incomplete-${team.id}`}
              >
                {" "}
                · incomplete
              </span>
            )}
          </span>
        </button>

        {full && (
          <span className="team-list__badge" aria-label="Full team">
            ✓
          </span>
        )}

        <div className="team-list__row-actions">
          {!archivedRow && (
            <button
              type="button"
              className="tm-btn tm-btn--ghost tm-btn--sm"
              data-testid={`team-duplicate-${team.id}`}
              onClick={() => onDuplicate(team.id)}
            >
              Duplicate
            </button>
          )}
          {confirming ? (
            <>
              <button
                type="button"
                className="tm-btn tm-btn--danger tm-btn--sm"
                data-testid={`team-delete-confirm-${team.id}`}
                onClick={() => {
                  setConfirmingId(null);
                  onDelete(team.id);
                }}
              >
                Confirm
              </button>
              <button
                type="button"
                className="tm-btn tm-btn--ghost tm-btn--sm"
                data-testid={`team-delete-cancel-${team.id}`}
                onClick={() => setConfirmingId(null)}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className="tm-btn tm-btn--ghost tm-btn--sm team-list__delete"
              data-testid={`team-delete-${team.id}`}
              onClick={() => setConfirmingId(team.id)}
            >
              Delete
            </button>
          )}
        </div>
      </li>
    );
  }

  return (
    <div className="team-list" data-testid="team-list">
      <div className="team-list__actions">
        <button
          type="button"
          className="tm-btn tm-btn--primary team-list__new"
          data-testid="team-new"
          onClick={onNew}
        >
          <span aria-hidden>+</span> New team
        </button>
        <button
          type="button"
          className="tm-btn tm-btn--secondary"
          data-testid="team-import"
          onClick={onImport}
        >
          Import paste
        </button>
      </div>

      {teams.length === 0 ? (
        <div className="team-list__empty" data-testid="team-list-empty">
          <span className="team-list__empty-icon" aria-hidden />
          <p className="team-list__empty-text">
            No teams yet. Create one or import a Showdown paste to get started.
          </p>
        </div>
      ) : (
        <ul className="team-list__items" data-testid="team-list-items">
          {teams.map((team) => renderRow(team, false))}
        </ul>
      )}

      {archived.length > 0 && (
        <section
          className="team-list__archived"
          data-testid="team-list-archived"
        >
          <h2 className="team-list__archived-title">Archived</h2>
          <ul className="team-list__items">
            {archived.map((team) => renderRow(team, true))}
          </ul>
        </section>
      )}
    </div>
  );
}
