/**
 * month-label.ts — the pure "YYYY-MM" -> "Month Year" formatter shared by the
 * /meta pages and MetaMonthPicker.
 *
 * Split out of MetaMonthPicker.tsx (a `"use client"` module) because React
 * Server Components cannot call ANY export from a client module, even a pure
 * one with no hooks — Next throws "Attempted to call formatMonthLabel() from
 * the server but formatMonthLabel is on the client" the moment a server
 * component (the /meta/[format] and /meta/[format]/[slug] pages) imports it
 * from there. This module carries no "use client" directive, so it's usable
 * from both server components and client components alike.
 */

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** "2026-05" → "May 2026"; an unparseable value passes through unchanged. */
export function formatMonthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  const [, year, monthNum] = match;
  const name = MONTH_NAMES[Number(monthNum) - 1];
  return name ? `${name} ${year}` : month;
}
