/**
 * Signal wordmark — Figtree 600 "Oak" plus a red period. No logo chip, no rings.
 * Presentational; callers wrap it in a button/link and own the accessible name.
 */
export default function OakWordmark({ className }: { className?: string }) {
  return (
    <span className={className ? `oak-wordmark ${className}` : "oak-wordmark"}>
      Oak<span className="oak-wordmark__period">.</span>
    </span>
  );
}
