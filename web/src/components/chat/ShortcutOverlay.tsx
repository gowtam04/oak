"use client";

/**
 * ShortcutOverlay — web `?` / Account chord list (NAV-US-2, ADR-15).
 */

import { useEffect } from "react";

export interface ShortcutOverlayProps {
  open: boolean;
  onClose: () => void;
}

const ROWS: { action: string; mac: string; other: string }[] = [
  { action: "Palette", mac: "⌘K", other: "Ctrl+K" },
  { action: "New chat", mac: "⌘⇧O", other: "Ctrl+Shift+O" },
  { action: "Focus composer", mac: "⌘⇧J", other: "Ctrl+Shift+J" },
  { action: "Stop", mac: "⌘.", other: "Ctrl+." },
  { action: "History search", mac: "⌘⇧F", other: "Ctrl+Shift+F" },
  { action: "Pin/unpin conversation", mac: "⌘⇧P", other: "Ctrl+Shift+P" },
];

export default function ShortcutOverlay({
  open,
  onClose,
}: ShortcutOverlayProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="shortcut-overlay-backdrop"
      data-testid="shortcut-overlay"
      onClick={onClose}
    >
      <div
        className="shortcut-overlay"
        role="dialog"
        aria-label="Keyboard shortcuts"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shortcut-overlay__header">
          <h2 className="shortcut-overlay__title">Keyboard shortcuts</h2>
          <button
            type="button"
            className="shortcut-overlay__close"
            onClick={onClose}
            aria-label="Close"
          >
            Close
          </button>
        </div>
        <ul className="shortcut-overlay__list">
          {ROWS.map((row) => (
            <li key={row.action} className="shortcut-overlay__row">
              <span className="shortcut-overlay__action">{row.action}</span>
              <span className="shortcut-overlay__chords">
                <kbd>{row.mac}</kbd>
                <span aria-hidden="true"> / </span>
                <kbd>{row.other}</kbd>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
