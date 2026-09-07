"use client";

/**
 * Apply this Champions set — usage drill-in CTA (CF-TEAM-US-6).
 * Guests get the sign-in dialog; signed-in users get AddToTeamPicker.
 */

import { useCallback, useState } from "react";

import AuthDialog from "@/components/auth/AuthDialog";
import AddToTeamPicker from "@/components/teams/AddToTeamPicker";
import { fetchMe } from "@/lib/api/auth-client";
import { CHAMPIONS_FORMAT } from "@/data/formats";
import type { TeamMember } from "@/data/teams/team-schema";

export default function ApplyUsageSet({ species }: { species: string }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [member, setMember] = useState<TeamMember | null>(null);
  const [authOpen, setAuthOpen] = useState(false);

  const loadSet = useCallback(async (): Promise<TeamMember | null> => {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/teams/set-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ species }),
      });
      const body = (await res.json()) as {
        found?: boolean;
        member?: TeamMember;
        notes?: string[];
      };
      if (!body.found || !body.member) {
        setNote(
          body.notes?.[0] ??
            "Usage is unavailable or no set is listed for this species.",
        );
        return null;
      }
      return body.member;
    } catch {
      setNote("Live Champions usage is unavailable.");
      return null;
    } finally {
      setBusy(false);
    }
  }, [species]);

  const handleApply = useCallback(async () => {
    const me = await fetchMe();
    if (!me.signedIn) {
      setAuthOpen(true);
      return;
    }
    const next = await loadSet();
    if (next) setMember(next);
  }, [loadSet]);

  return (
    <div className="ref-meta-set" data-testid="apply-usage-set">
      <button
        type="button"
        className="ref-meta-set__button"
        data-testid="apply-usage-set-button"
        disabled={busy}
        onClick={() => void handleApply()}
      >
        {busy ? "Loading set…" : "Apply this Champions set"}
      </button>
      {note && (
        <p className="ref-intro" role="status">
          {note}
        </p>
      )}
      {member && (
        <AddToTeamPicker
          incoming={member}
          format={CHAMPIONS_FORMAT}
          onClose={() => setMember(null)}
        />
      )}
      <AuthDialog
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onSignedIn={() => {
          setAuthOpen(false);
          void handleApply();
        }}
      />
    </div>
  );
}
