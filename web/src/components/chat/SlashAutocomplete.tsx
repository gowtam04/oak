"use client";

/**
 * SlashAutocomplete — composer `/` picker listbox. Presentational only:
 * command rows OR name rows OR an empty line, plus the insert caption.
 */

import {
  PICKER_CAPTION,
  type CommandRow,
  type DexNameRow,
} from "@/lib/chat/slash-picker";
import { CALC_SKIP_MOVE, CALC_SKIP_MOVE_HINT } from "@/lib/chat/slash-calc";

export type SlashPick =
  | { type: "command"; token: string }
  | { type: "name"; row: DexNameRow }
  | { type: "calc-skip-move" };

export interface SlashAutocompleteProps {
  commands?: readonly CommandRow[];
  names?: DexNameRow[];
  empty?: string | null;
  guest?: boolean;
  highlightedIndex?: number;
  /** When false, name rows omit the kind hint (saved-team arg phase). */
  showKind?: boolean;
  caption?: string;
  /** Pinned skip-move row at the top of a `/calc` move-slot list. */
  skipMove?: boolean;
  onPick: (pick: SlashPick) => void;
}

function commandHint(row: CommandRow, guest: boolean): string {
  if (guest && row.token === "/team") return row.hintGuest;
  return row.hint;
}

export default function SlashAutocomplete({
  commands,
  names,
  empty = null,
  guest = false,
  highlightedIndex = -1,
  showKind = true,
  caption = PICKER_CAPTION,
  skipMove = false,
  onPick,
}: SlashAutocompleteProps) {
  const nameOffset = skipMove ? 1 : 0;
  return (
    <div
      className="slash-ac"
      data-testid="slash-autocomplete"
      role="listbox"
      aria-label="Slash commands"
    >
      <div className="slash-ac__caption">{caption}</div>
      {commands?.map((row, index) => (
        <button
          key={row.token}
          type="button"
          role="option"
          className={
            "slash-ac__option" +
            (index === highlightedIndex ? " slash-ac__option--selected" : "")
          }
          aria-selected={index === highlightedIndex}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick({ type: "command", token: row.token })}
        >
          <span className="slash-ac__token">{row.token}</span>
          <span className="slash-ac__hint">{commandHint(row, guest)}</span>
        </button>
      ))}
      {skipMove ? (
        <button
          type="button"
          role="option"
          data-testid="slash-ac-skip-move"
          className={
            "slash-ac__option" +
            (highlightedIndex === 0 ? " slash-ac__option--selected" : "")
          }
          aria-selected={highlightedIndex === 0}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick({ type: "calc-skip-move" })}
        >
          <span className="slash-ac__name">{CALC_SKIP_MOVE}</span>
          <span className="slash-ac__kind">{CALC_SKIP_MOVE_HINT}</span>
        </button>
      ) : null}
      {names?.map((row, index) => (
        <button
          key={`${row.kind}:${row.slug}`}
          type="button"
          role="option"
          className={
            "slash-ac__option" +
            (index + nameOffset === highlightedIndex
              ? " slash-ac__option--selected"
              : "")
          }
          aria-selected={index + nameOffset === highlightedIndex}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick({ type: "name", row })}
        >
          <span className="slash-ac__name">{row.displayName}</span>
          {showKind && <span className="slash-ac__kind">{row.kind}</span>}
        </button>
      ))}
      {empty ? <div className="slash-ac__empty">{empty}</div> : null}
    </div>
  );
}
