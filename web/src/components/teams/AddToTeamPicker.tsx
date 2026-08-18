/**
 * Add-to-team picker (ADD-US-1–4). Signed-in callers only — guests never mount
 * this (AUTH-BR-1). Writes via existing teams-client + placeSpeciesOnTeam.
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  createTeam,
  getTeam,
  listTeams,
  updateTeam,
  type TeamSummary,
} from "@/lib/api/teams-client";
import {
  blankMember,
  placeSpeciesOnTeam,
} from "@/data/teams/place-on-team";
import type { TeamMember } from "@/data/teams/team-schema";
import { formatLabel, titleizeSlug } from "@/components/teams/display-names";

import "./add-to-team.css";

export interface AddToTeamPickerProps {
  incoming: TeamMember;
  format: string;
  onClose: () => void;
}

function editorHref(teamId: string, slot: number): string {
  return `/teams?team=${encodeURIComponent(teamId)}&slot=${slot}`;
}

function padMembers(members: TeamMember[]): TeamMember[] {
  const next = members.slice(0, 6);
  while (next.length < 6) next.push(blankMember());
  return next;
}

export default function AddToTeamPicker({
  incoming,
  format,
  onClose,
}: AddToTeamPickerProps) {
  const router = useRouter();
  const [teams, setTeams] = useState<TeamSummary[] | null>(null);
  const [replace, setReplace] = useState<{
    id: string;
    name: string;
    members: TeamMember[];
  } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void listTeams().then((list) => {
      if (active) setTeams(list);
    });
    return () => {
      active = false;
    };
  }, []);

  async function writeAndGo(teamId: string, members: TeamMember[], slot: number) {
    setBusy(true);
    const saved = await updateTeam(teamId, { members });
    setBusy(false);
    if (!saved) return;
    router.push(editorHref(teamId, slot));
    onClose();
  }

  async function handlePick(team: TeamSummary) {
    if (busy) return;
    setBusy(true);
    const detail = await getTeam(team.id);
    setBusy(false);
    if (!detail) return;
    const members = padMembers(detail.members);
    const placed = placeSpeciesOnTeam(members, incoming, { type: "first_empty" });
    if (!placed.ok) {
      setReplace({ id: detail.id, name: detail.name, members });
      return;
    }
    await writeAndGo(detail.id, placed.members, placed.slotIndex);
  }

  async function handleReplace(index: 0 | 1 | 2 | 3 | 4 | 5) {
    if (!replace || busy) return;
    const placed = placeSpeciesOnTeam(replace.members, incoming, {
      type: "replace",
      index,
    });
    if (!placed.ok) return;
    await writeAndGo(replace.id, placed.members, placed.slotIndex);
  }

  async function handleCreate() {
    if (busy) return;
    setBusy(true);
    const members = padMembers([]);
    members[0] = incoming;
    const saved = await createTeam({
      format,
      members,
      name: titleizeSlug(incoming.species, "New team"),
    });
    setBusy(false);
    if (!saved) return;
    router.push(editorHref(saved.id, 0));
    onClose();
  }

  return (
    <div
      className="add-to-team"
      data-testid="add-to-team-picker"
      role="dialog"
      aria-modal="true"
      aria-label="Add to team"
    >
      <div className="add-to-team__sheet">
        <header className="add-to-team__header">
          <h2 className="add-to-team__title">Add to team</h2>
          <button
            type="button"
            className="add-to-team__btn"
            aria-label="Close"
            onClick={onClose}
          >
            Close
          </button>
        </header>

        {replace ? (
          <div data-testid="add-to-team-replace">
            <p className="add-to-team__hint">
              {replace.name} is full. Choose a member to replace.
            </p>
            <ol className="add-to-team__replace-list">
              {replace.members.map((m, i) => (
                <li key={i}>
                  <button
                    type="button"
                    className="add-to-team__replace-btn"
                    data-testid={`add-to-team-replace-${i}`}
                    disabled={busy}
                    onClick={() =>
                      void handleReplace(i as 0 | 1 | 2 | 3 | 4 | 5)
                    }
                  >
                    {titleizeSlug(m.species, `Slot ${i + 1}`)}
                  </button>
                </li>
              ))}
            </ol>
            <button
              type="button"
              className="add-to-team__btn"
              onClick={() => setReplace(null)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <ul className="add-to-team__list">
              {(teams ?? []).map((team) => {
                const full = team.memberCount >= 6 || team.incomplete === false;
                return (
                  <li key={team.id}>
                    <button
                      type="button"
                      className="add-to-team__team"
                      data-testid={`add-to-team-team-${team.id}`}
                      disabled={busy}
                      onClick={() => void handlePick(team)}
                    >
                      <span className="add-to-team__team-name">{team.name}</span>
                      <span className="add-to-team__team-meta">
                        {formatLabel(team.format)} ·{" "}
                        {full ? "Full" : `${team.memberCount} open`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              className="add-to-team__btn add-to-team__btn--primary"
              disabled={busy}
              onClick={() => void handleCreate()}
            >
              Create new team
            </button>
          </>
        )}
      </div>
    </div>
  );
}
