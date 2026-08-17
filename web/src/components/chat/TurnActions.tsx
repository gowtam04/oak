"use client";

/**
 * TurnActions — last-turn recovery plus signed-in organize on a card
 * (REC-US-1/2, PIN-US-1, FORK-US-1). Guests keep Retry/Edit and hide Pin/Fork.
 */

export interface TurnActionsProps {
  role: "user" | "assistant";
  isLast: boolean;
  signedIn?: boolean;
  streaming?: boolean;
  pinned?: boolean;
  onRetry?: () => void;
  onEdit?: () => void;
  onPin?: () => void;
  onUnpin?: () => void;
  onFork?: () => void;
}

export default function TurnActions({
  role,
  isLast,
  signedIn = false,
  streaming = false,
  pinned = false,
  onRetry,
  onEdit,
  onPin,
  onUnpin,
  onFork,
}: TurnActionsProps) {
  const showRetry = role === "assistant" && isLast && !streaming && onRetry;
  const showEdit = role === "user" && isLast && onEdit;
  const showOrganize = role === "assistant" && signedIn;
  const showPin = showOrganize && !pinned && onPin;
  const showUnpin = showOrganize && pinned && onUnpin;
  const showFork = showOrganize && onFork;

  if (!showRetry && !showEdit && !showPin && !showUnpin && !showFork) {
    return null;
  }

  return (
    <div className="turn-actions" data-testid="turn-actions">
      {showRetry && (
        <button type="button" className="turn-actions__btn" onClick={onRetry}>
          Retry
        </button>
      )}
      {showEdit && (
        <button type="button" className="turn-actions__btn" onClick={onEdit}>
          Edit
        </button>
      )}
      {showPin && (
        <button type="button" className="turn-actions__btn" onClick={onPin}>
          Pin
        </button>
      )}
      {showUnpin && (
        <button type="button" className="turn-actions__btn" onClick={onUnpin}>
          Unpin
        </button>
      )}
      {showFork && (
        <button type="button" className="turn-actions__btn" onClick={onFork}>
          Fork
        </button>
      )}
    </div>
  );
}
