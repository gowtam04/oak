"use client";

/**
 * MetaMonthPicker — a labeled month `<select>` for a `/meta/[format]`
 * leaderboard. Picking a month navigates via `router.push`, appending
 * `?month=YYYY-MM` to the page's base path (the format route itself decides
 * what an unrecognized/unsynced month means — this component only navigates).
 */

import { useRouter } from "next/navigation";

// Re-exported for backward compatibility (this component's own test imports
// it from here) — the actual implementation now lives in the plain,
// non-"use client" ./month-label module so SERVER components (the /meta
// pages) can import it too. A client module's exports (even pure ones) can't
// be called from a server component — see month-label.ts's doc comment.
export { formatMonthLabel } from "./month-label";
import { formatMonthLabel } from "./month-label";

export interface MetaMonthPickerProps {
  months: string[];
  current: string;
  basePath: string;
}

export default function MetaMonthPicker({
  months,
  current,
  basePath,
}: MetaMonthPickerProps) {
  const router = useRouter();

  if (months.length === 0) return null;

  return (
    <label className="ref-meta-month" data-testid="meta-month-picker">
      <span className="ilabel ref-meta-month__label">Month</span>
      <select
        className="ref-meta-month__select"
        data-testid="meta-month-select"
        value={current}
        onChange={(e) => router.push(`${basePath}?month=${e.target.value}`)}
      >
        {months.map((month) => (
          <option key={month} value={month}>
            {formatMonthLabel(month)}
          </option>
        ))}
      </select>
    </label>
  );
}
