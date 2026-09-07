/**
 * Fredoka wordmark — "Oak" with no period identity. Lid CSS paints it white
 * and `.chat-page__title::before` supplies the 32px coral tile. On paper
 * (auth / other surfaces) it is `--text-strong`. Presentational; callers wrap
 * it in a button/link and own the accessible name.
 */
export default function OakWordmark({ className }: { className?: string }) {
  return (
    <span className={className ? `oak-wordmark ${className}` : "oak-wordmark"}>
      Oak
    </span>
  );
}
