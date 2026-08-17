"use client";

/**
 * MentionAutocomplete — `@` team picker (MEN-US-1). Parent mounts this only
 * for signed-in users; guests never see it (MEN-AC-1.5, MEN-BR-4).
 */

export interface MentionTeam {
  id: string;
  name: string;
}

export interface MentionAutocompleteProps {
  query: string;
  teams: MentionTeam[];
  onSelect: (team: MentionTeam) => void;
}

export default function MentionAutocomplete({
  query,
  teams,
  onSelect,
}: MentionAutocompleteProps) {
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? teams.filter((t) => t.name.toLowerCase().includes(needle))
    : teams;

  return (
    <div
      className="mention-ac"
      data-testid="mention-autocomplete"
      role="listbox"
      aria-label="Mention a team"
    >
      {matches.length === 0 ? (
        <div className="mention-ac__empty" data-testid="mention-empty">
          No saved teams match.
        </div>
      ) : (
        matches.map((team) => (
          <button
            key={team.id}
            type="button"
            role="option"
            className="mention-ac__option"
            onClick={() => onSelect(team)}
          >
            {team.name}
          </button>
        ))
      )}
    </div>
  );
}
