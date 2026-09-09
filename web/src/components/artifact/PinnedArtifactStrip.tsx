/**
 * Conversation pin strip for rich artifact snapshots (PIN-US-1–3).
 * Distinct from chat PinStrip (pinned assistant cards).
 */

"use client";

import type { PinnedArtifactSummary } from "@/lib/api/artifact-pin-client";

export interface PinnedArtifactStripProps {
  signedIn: boolean;
  pins: PinnedArtifactSummary[];
  capError?: boolean;
  onOpen: (pin: PinnedArtifactSummary) => void;
  onUnpin: (pinId: string) => void;
}

export default function PinnedArtifactStrip({
  signedIn,
  pins,
  capError = false,
  onOpen,
  onUnpin,
}: PinnedArtifactStripProps) {
  if (!signedIn || pins.length === 0) return null;

  return (
    <nav
      className="pinned-artifact-strip"
      data-testid="pinned-artifact-strip"
      aria-label="Pinned artifacts"
    >
      {capError && (
        <p className="pinned-artifact-strip__cap" data-testid="pin-cap-message">
          You can pin 5 artifacts on this conversation. Unpin one to add another.
        </p>
      )}
      <ul className="pinned-artifact-strip__list">
        {pins.map((pin) => (
          <li key={pin.id} className="pinned-artifact-strip__item">
            <button
              type="button"
              className="pinned-artifact-strip__open"
              data-testid={`pinned-artifact-strip-item-${pin.id}`}
              onClick={() => onOpen(pin)}
            >
              {pin.title}
            </button>
            <button
              type="button"
              className="pinned-artifact-strip__unpin"
              data-testid={`pinned-artifact-strip-unpin-${pin.id}`}
              aria-label={`Unpin ${pin.title}`}
              onClick={() => onUnpin(pin.id)}
            >
              Unpin
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
