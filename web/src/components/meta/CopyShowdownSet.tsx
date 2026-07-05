"use client";

/**
 * CopyShowdownSet — the representative-set card on a `/meta/[format]/[slug]`
 * drill-in: the Showdown export text in a `<pre>` block, plus a button that
 * copies it to the clipboard and shows a transient "Copied!" confirmation.
 */

import { useEffect, useRef, useState } from "react";

export interface CopyShowdownSetProps {
  exportText: string;
  label?: string;
}

const COPIED_RESET_MS = 2000;

export default function CopyShowdownSet({
  exportText,
  label = "Copy set",
}: CopyShowdownSetProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(exportText);
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      // Clipboard access denied/unavailable — no confirmation, no crash.
    }
  }

  return (
    <div className="ref-meta-set" data-testid="copy-showdown-set">
      <pre className="ref-meta-set__text" data-testid="copy-showdown-set-text">
        {exportText}
      </pre>
      <button
        type="button"
        className="ref-meta-set__button"
        data-testid="copy-showdown-set-button"
        onClick={handleCopy}
      >
        {copied ? "Copied!" : label}
      </button>
    </div>
  );
}
