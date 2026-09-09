"use client";

/**
 * SharedByMe — Account list of live share links + revoke (SHARE-US-4, ADR-11).
 */

import type { ShareListItem } from "@/lib/api/share-client";

export interface SharedByMeProps {
  shares: ShareListItem[];
  onRevoke: (id: string) => void;
}

export default function SharedByMe({ shares, onRevoke }: SharedByMeProps) {
  if (shares.length === 0) {
    return (
      <div className="shared-by-me" data-testid="shared-by-me">
        <p className="shared-by-me__empty" data-testid="shared-by-me-empty">
          No live share links.
        </p>
      </div>
    );
  }

  return (
    <div className="shared-by-me" data-testid="shared-by-me">
      <ul className="shared-by-me__list">
        {shares.map((share) => (
          <li
            key={share.id}
            className="shared-by-me__item"
            data-testid={`shared-by-me-item-${share.id}`}
          >
            <div className="shared-by-me__meta">
              <span className="shared-by-me__title">
                {share.conversationTitle}
              </span>
              <span className="shared-by-me__url">{share.url}</span>
            </div>
            <button
              type="button"
              className="shared-by-me__revoke"
              onClick={() => onRevoke(share.id)}
            >
              Revoke
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
