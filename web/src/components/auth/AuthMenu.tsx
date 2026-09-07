"use client";

import { useCallback, useEffect, useState } from "react";
import { signOut } from "@/lib/api/auth-client";
import { listShares, revokeShare, type ShareListItem } from "@/lib/api/share-client";
import { updateAnswerDensity } from "@/lib/api/preferences-client";
import SharedByMe from "@/components/account/SharedByMe";
import ShortcutOverlay from "@/components/chat/ShortcutOverlay";

/**
 * AuthMenu — the header auth control (account-creation design.md § File Structure
 * "AuthMenu.tsx"; UI/UX Vision "Sign-in affordance" / "Signed-in state"; Phase 6
 * / p6).
 *
 * Two states, both rendered in the Pokédex-red header band as inset enamel
 * pills (white-on-red, matching `ScopeChip`):
 *
 *   - Guest → a single non-blocking "Sign in" control (AC-1.2) that asks the
 *     parent to open `AuthDialog` via `onSignInClick`. It never gates the chat.
 *   - Signed in → the account email + a "Sign out" button (AUTH-US-5 / AC-5.1).
 *     Sign-out calls `signOut()` (current device only — AC-5.2) and then notifies
 *     the parent via `onSignedOut` so it reverts local state to the guest tier.
 *
 * Stateless w.r.t. auth identity: the parent owns `signedIn` / `email` (resolved
 * from `fetchMe`) and re-renders this control when they change. The only network
 * call here is `signOut`, routed through `@/lib/api/auth-client` — no direct `fetch`,
 * no server imports, so it is a pure jsdom-testable unit.
 */

export interface AuthMenuProps {
  /** Whether a user is currently signed in. */
  signedIn: boolean;
  /** The signed-in account's email (shown beside Sign out). */
  email?: string | null;
  /** Guest taps "Sign in" → parent opens the AuthDialog. */
  onSignInClick: () => void;
  /** Sign-out completed → parent flips local auth state back to guest. */
  onSignedOut: () => void;
  /** Account compact/full default (COMPACT-US-2). Absent ⇒ full. */
  answerDensity?: "full" | "compact";
  onAnswerDensityChange?: (density: "full" | "compact") => void;
}

export default function AuthMenu({
  signedIn,
  email,
  onSignInClick,
  onSignedOut,
  answerDensity,
  onAnswerDensityChange,
}: AuthMenuProps) {
  const [busy, setBusy] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [shares, setShares] = useState<ShareListItem[]>([]);

  const refreshShares = useCallback(() => {
    void listShares().then(setShares);
  }, []);

  useEffect(() => {
    if (accountOpen && signedIn) refreshShares();
  }, [accountOpen, signedIn, refreshShares]);

  function handleDensity(next: "full" | "compact") {
    onAnswerDensityChange?.(next);
    if (signedIn) void updateAnswerDensity(next);
  }

  async function handleSignOut() {
    if (busy) return;
    setBusy(true);
    try {
      await signOut();
    } finally {
      setBusy(false);
      // Notify the parent regardless of the network outcome: sign-out is
      // best-effort and the UI must revert to guest either way.
      onSignedOut();
    }
  }

  if (!signedIn) {
    return (
      <div className="auth-menu" data-testid="auth-menu">
        <button
          type="button"
          className="auth-pill auth-pill--primary"
          data-testid="auth-signin-button"
          onClick={onSignInClick}
        >
          Sign in
        </button>
        <fieldset
          className="auth-menu__density"
          data-testid="guest-answer-density"
        >
          <legend>Answer density</legend>
          <label>
            <input
              type="radio"
              name="guest-answer-density"
              value="full"
              checked={(answerDensity ?? "full") === "full"}
              onChange={() => handleDensity("full")}
            />{" "}
            Full
          </label>
          <label>
            <input
              type="radio"
              name="guest-answer-density"
              value="compact"
              checked={answerDensity === "compact"}
              onChange={() => handleDensity("compact")}
            />{" "}
            Compact
          </label>
        </fieldset>
      </div>
    );
  }

  return (
    <div className="auth-menu" data-testid="auth-menu">
      {email && (
        <span
          className="auth-menu__email"
          data-testid="auth-user-email"
          title={email}
        >
          {email}
        </span>
      )}
      <button
        type="button"
        className="auth-pill"
        data-testid="auth-account-button"
        onClick={() => setAccountOpen((o) => !o)}
        aria-expanded={accountOpen}
      >
        Account
      </button>
      <button
        type="button"
        className="auth-pill"
        data-testid="auth-signout-button"
        onClick={handleSignOut}
        disabled={busy}
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
      {accountOpen && (
        <div className="auth-menu__account" data-testid="account-panel">
          <fieldset className="auth-menu__density" data-testid="answer-density">
            <legend>Answer density</legend>
            <label>
              <input
                type="radio"
                name="answer-density"
                value="full"
                checked={(answerDensity ?? "full") === "full"}
                onChange={() => handleDensity("full")}
              />{" "}
              Full
            </label>
            <label>
              <input
                type="radio"
                name="answer-density"
                value="compact"
                checked={answerDensity === "compact"}
                onChange={() => handleDensity("compact")}
              />{" "}
              Compact
            </label>
          </fieldset>
          <h2 className="auth-menu__account-title">Shared by me</h2>
          <SharedByMe
            shares={shares}
            onRevoke={(id) => {
              void revokeShare(id).then((ok) => {
                if (ok) setShares((prev) => prev.filter((s) => s.id !== id));
              });
            }}
          />
          <button
            type="button"
            className="auth-menu__shortcuts"
            onClick={() => setShortcutsOpen(true)}
          >
            Keyboard shortcuts
          </button>
        </div>
      )}
      <ShortcutOverlay
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
    </div>
  );
}
