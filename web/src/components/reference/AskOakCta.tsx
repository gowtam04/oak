/**
 * AskOakCta — a styled link from a reference page back into chat, prefilling
 * the composer via the `?q=` query param (`page.tsx`'s mount-effect prefill,
 * B4). The prompt is percent-encoded so it survives the URL round-trip
 * unmodified.
 */

export interface AskOakCtaProps {
  prompt: string;
}

export default function AskOakCta({ prompt }: AskOakCtaProps) {
  const href = `/?q=${encodeURIComponent(prompt)}`;
  return (
    <a href={href} className="ref-ask-oak" data-testid="ask-oak-cta">
      <span className="ref-ask-oak__label">Ask Oak about this</span>
      <span className="ref-ask-oak__prompt">{prompt}</span>
    </a>
  );
}
