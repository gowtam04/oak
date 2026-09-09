"use client";

/**
 * FollowUpChipRow — render derived hop chips (CHIP-US-1, ADR-9).
 * Caps / kinds live in `deriveFollowUpChips`; this row only renders.
 */

import type { FollowUpChip } from "@/lib/chat/follow-up-chips";

export interface FollowUpChipRowProps {
  chips: FollowUpChip[];
  onSelect: (chip: FollowUpChip) => void;
  disabled?: boolean;
}

export default function FollowUpChipRow({
  chips,
  onSelect,
  disabled = false,
}: FollowUpChipRowProps) {
  if (chips.length === 0) return null;

  return (
    <div
      className="follow-up-chips"
      data-testid="follow-up-chip-row"
      role="group"
      aria-label="Follow-up"
    >
      {chips.map((chip) => (
        <button
          key={`${chip.kind}:${chip.target}`}
          type="button"
          className="follow-up-chips__chip"
          disabled={disabled}
          onClick={() => {
            if (!disabled) onSelect(chip);
          }}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
