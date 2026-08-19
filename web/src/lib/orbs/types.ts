/**
 * Vendored from thinking-orbs 0.3.1 (MIT © Jakub Antalik).
 * React props stripped — Oak only needs the state/size enums.
 */

export type OrbState =
  | "working"
  | "searching"
  | "solving"
  | "listening"
  | "connecting"
  | "weaving"
  | "composing"
  | "breathing"
  | "shaping";

export const ORB_STATES: readonly OrbState[] = [
  "working",
  "searching",
  "solving",
  "listening",
  "connecting",
  "weaving",
  "composing",
  "breathing",
  "shaping",
] as const;

/** Tuned size presets — separate designs, not a scale factor. */
export type OrbSize = 64 | 20;
