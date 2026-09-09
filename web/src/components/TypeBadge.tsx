import type { TypeBadgeProps } from "@/components/types";

/**
 * TypeBadge — a labeled type pill. Chrome is the enamel-paper 16/72/30 mix
 * on `.type-badge` (solids stay on `--type-*`; the badge tints them).
 */
export default function TypeBadge({ type }: TypeBadgeProps) {
  return (
    <span
      className={`type-badge type-badge--${type}`}
      data-testid={`type-badge-${type}`}
    >
      {type}
    </span>
  );
}
