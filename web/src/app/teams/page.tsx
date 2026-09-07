/**
 * /teams — the manual team builder (Phase 9; TEAM-US-1..5, 10, 11).
 *
 * A signed-in account's team workbench: a Pokédex-red header band (clickable
 * Oak wordmark — navigation lives in the {@link AppNav} rail, not the band)
 * over a `teams-page__shell` that puts the shared app rail beside
 * {@link TeamList} (living Champions + optional Archived) and {@link TeamEditor}.
 * Living teams are Champions (no format picker). Archived other-format teams
 * are view+delete only. Guests get a sign-in prompt (BR-T2 / CF-AS-11).
 *
 * All team data flows through the Wave-4 client layer — `useTeams` for the
 * living list + mutations and `listTeams({ archived: true })` for the archive
 * — never a raw `/api/teams` call.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import AppNav from "@/components/nav/AppNav";
import OakWordmark from "@/components/brand/OakWordmark";
import { fetchMe, type MeResult } from "@/lib/api/auth-client";
import { useTeams } from "@/lib/hooks/use-teams";
import {
  listTeams,
  type TeamDetail,
  type TeamSummary,
} from "@/lib/api/teams-client";
import type { TeamMember } from "@/data/teams/team-schema";
import { CHAMPIONS_FORMAT, type Format } from "@/data/formats";
import TeamList from "@/components/teams/TeamList";
import TeamEditor, {
  type TeamEditorHandle,
} from "@/components/teams/TeamEditor";
import TeamsAssistantPanel from "@/components/teams/TeamsAssistantPanel";
import PasteImportDialog from "@/components/teams/PasteImportDialog";
import ExportDialog from "@/components/teams/ExportDialog";
import type { TeamAnalysisOk } from "@/lib/teams/team-analysis";
import { analysisSuggestionChips } from "@/lib/teams/role-inventory";
import {
  presetsForFormat,
  type ArchetypePreset,
} from "@/lib/teams/archetype-presets";

export default function TeamsPage() {
  const [auth, setAuth] = useState<MeResult>({ signedIn: false });
  useEffect(() => {
    let active = true;
    void fetchMe().then((me) => {
      if (active) setAuth(me);
    });
    return () => {
      active = false;
    };
  }, []);

  const teams = useTeams(auth.signedIn);
  // Share import lands on `/teams?team=<id>`. Read from location (not
  // useSearchParams) so jsdom page tests don't need a Next router mock.
  const [deepLinkTeamId, setDeepLinkTeamId] = useState<string | null>(null);
  useEffect(() => {
    setDeepLinkTeamId(new URLSearchParams(window.location.search).get("team"));
  }, []);

  // Living list comes from useTeams (GET /api/teams). Archive is a second
  // fetch (`?archived=1`) so other-format teams never mix into living.
  const [archivedTeams, setArchivedTeams] = useState<TeamSummary[]>([]);
  useEffect(() => {
    if (!auth.signedIn) {
      setArchivedTeams([]);
      return;
    }
    let active = true;
    void listTeams({ archived: true }).then((list) => {
      if (active) setArchivedTeams(list);
    });
    return () => {
      active = false;
    };
  }, [auth.signedIn, teams.teams]);

  const createFormat: Format = CHAMPIONS_FORMAT;

  // Selected team detail (full members + validation), loaded on demand.
  const [selected, setSelected] = useState<TeamDetail | null>(null);

  // Imperative access to the editor's unsaved draft for the assistant panel
  // (read at send/apply time — never a render-time data flow).
  const editorRef = useRef<TeamEditorHandle>(null);
  const [analysis, setAnalysis] = useState<TeamAnalysisOk | null>(null);
  const [winConditionDraft, setWinConditionDraft] = useState("");
  const [assistantSeed, setAssistantSeed] = useState<string | null>(null);
  const [archetypeOpen, setArchetypeOpen] = useState(false);
  const openTeam = useCallback(
    async (id: string) => {
      const detail = await teams.get(id);
      if (detail) {
        setSelected(detail);
        setWinConditionDraft(detail.winCondition ?? "");
        setAnalysis(null);
      }
    },
    [teams],
  );

  // Auto-select the first living team so the workbench is rarely empty
  // (never fights a user who closes the editor).
  const autoSelectedRef = useRef(false);
  // `/teams?team=<id>` — share import (and any other deep link) wins over the
  // first-team auto-select so the just-created team is the one that opens.
  const openedDeepLink = useRef<string | null>(null);
  useEffect(() => {
    if (!auth.signedIn || !deepLinkTeamId) return;
    if (openedDeepLink.current === deepLinkTeamId) return;
    openedDeepLink.current = deepLinkTeamId;
    autoSelectedRef.current = true;
    void openTeam(deepLinkTeamId);
  }, [auth.signedIn, deepLinkTeamId, openTeam]);
  useEffect(() => {
    if (autoSelectedRef.current) return;
    if (deepLinkTeamId) {
      autoSelectedRef.current = true;
      return;
    }
    if (selected) {
      autoSelectedRef.current = true;
      return;
    }
    const first = teams.teams[0];
    if (first) {
      autoSelectedRef.current = true;
      void openTeam(first.id);
    }
  }, [teams.teams, selected, openTeam, deepLinkTeamId]);

  // Sprites/types/base-stats are resolved inside TeamEditor for its LIVE members
  // (so a just-added/edited Mega or alternate form shows immediately) — the page
  // no longer pre-resolves the saved roster.

  const [saving, setSaving] = useState(false);
  const handleSave = useCallback(
    async (input: { name: string; members: TeamMember[] }) => {
      if (!selected) return;
      setSaving(true);
      const updated = await teams.update(selected.id, {
        ...input,
        winCondition: winConditionDraft.trim() || null,
      });
      setSaving(false);
      if (updated) {
        setSelected(updated);
        setWinConditionDraft(updated.winCondition ?? "");
      }
    },
    [selected, teams, winConditionDraft],
  );

  const handleNew = useCallback(async () => {
    setArchetypeOpen(true);
  }, []);

  const createBlank = useCallback(async () => {
    const created = await teams.create({
      format: createFormat,
      name: "New team",
      members: [],
    });
    if (created) {
      setSelected(created);
      setWinConditionDraft("");
      setAnalysis(null);
      setAssistantSeed(null);
    }
    setArchetypeOpen(false);
  }, [teams, createFormat]);

  const createFromArchetype = useCallback(
    async (preset: ArchetypePreset) => {
      const created = await teams.create({
        format: createFormat,
        name: `${preset.label} team`,
        members: [],
      });
      if (created) {
        setSelected(created);
        setWinConditionDraft("");
        setAnalysis(null);
        setAssistantSeed(preset.seedPrompt);
      }
      setArchetypeOpen(false);
    },
    [teams, createFormat],
  );

  const suggestionChips = analysis
    ? analysisSuggestionChips({
        roles_missing: analysis.roles_missing,
        defense_weak_counts: analysis.defense
          .filter((r) => r.weak.length > 0)
          .map((r) => ({ type: r.type, count: r.weak.length })),
        uncovered: analysis.offense.uncovered,
        unanswered_threats: analysis.threats
          .filter((t) => t.status === "unanswered")
          .map((t) => t.display_name),
      })
    : undefined;

  const handleDuplicate = useCallback(
    async (id: string) => {
      const dup = await teams.duplicate(id);
      if (dup) setSelected(dup);
    },
    [teams],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      setArchivedTeams((prev) => prev.filter((t) => t.id !== id));
      await teams.remove(id);
      setSelected((prev) => (prev && prev.id === id ? null : prev));
    },
    [teams],
  );

  // Import + export dialogs.
  const [importOpen, setImportOpen] = useState(false);
  const [exportState, setExportState] = useState<{
    open: boolean;
    paste: string | null;
    loading: boolean;
    name: string;
  }>({ open: false, paste: null, loading: false, name: "" });

  const handleExport = useCallback(async () => {
    if (!selected) return;
    setExportState({
      open: true,
      paste: null,
      loading: true,
      name: selected.name,
    });
    const paste = await teams.exportPaste(selected.id);
    setExportState((prev) => ({ ...prev, paste, loading: false }));
  }, [selected, teams]);

  return (
    <main className="teams-page" data-testid="teams-page">
      <header className="teams-page__band">
        <div className="teams-page__brand">
          <Link
            href="/"
            className="teams-page__wordmark"
            aria-label="Oak — back to chat"
          >
            <OakWordmark />
          </Link>
        </div>
      </header>

      <div className="teams-page__shell">
        <aside className="teams-page__rail" data-testid="teams-rail">
          <AppNav pathname="/teams" />
        </aside>
        <div className="teams-page__body">
          {!auth.signedIn ? (
            <div className="teams-page__guest" data-testid="teams-guest">
              <span className="teams-page__guest-icon" aria-hidden />
              <h2 className="teams-page__guest-title">
                Sign in to build teams
              </h2>
              <p className="teams-page__guest-text">
                Saved teams, the team builder, and Showdown import/export unlock
                with a free account — sign in from the chat page to get started.
              </p>
              <Link
                href="/"
                className="tm-btn tm-btn--primary teams-page__guest-cta"
              >
                Go to chat to sign in
              </Link>
            </div>
          ) : (
            <div
              className={`teams-grid${selected && selected.format === CHAMPIONS_FORMAT ? " teams-grid--assistant" : ""}`}
            >
              <TeamList
                teams={teams.teams}
                archivedTeams={archivedTeams}
                selectedId={selected?.id ?? null}
                onSelect={(id) => void openTeam(id)}
                onNew={() => void handleNew()}
                onImport={() => setImportOpen(true)}
                onDuplicate={(id) => void handleDuplicate(id)}
                onDelete={(id) => void handleDelete(id)}
              />

              {archetypeOpen && (
                <div
                  className="teams-archetype-modal"
                  data-testid="archetype-picker"
                  role="dialog"
                  aria-label="Start from archetype"
                >
                  <div className="teams-archetype-modal__card">
                    <h3>Start from an archetype</h3>
                    <p className="teams-archetype-modal__hint">
                      Creates an empty team and seeds the assistant with a build
                      brief. You still Apply patches and Save.
                    </p>
                    <ul className="teams-archetype-modal__list">
                      {presetsForFormat(createFormat).map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            className="tm-btn tm-btn--secondary"
                            onClick={() => void createFromArchetype(p)}
                          >
                            <strong>{p.label}</strong>
                            <span>{p.blurb}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <div className="teams-archetype-modal__actions">
                      <button
                        type="button"
                        className="tm-btn tm-btn--ghost"
                        onClick={() => void createBlank()}
                      >
                        Blank team
                      </button>
                      <button
                        type="button"
                        className="tm-btn tm-btn--ghost"
                        onClick={() => setArchetypeOpen(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {selected ? (
                <>
                  <TeamEditor
                    team={selected}
                    saving={saving}
                    onSave={(input) => void handleSave(input)}
                    onExport={() => void handleExport()}
                    onClose={() => setSelected(null)}
                    handleRef={editorRef}
                    onAnalysisChange={
                      selected.format === CHAMPIONS_FORMAT
                        ? setAnalysis
                        : undefined
                    }
                    winCondition={winConditionDraft}
                    onWinConditionChange={
                      selected.format === CHAMPIONS_FORMAT
                        ? setWinConditionDraft
                        : undefined
                    }
                  />
                  {selected.format === CHAMPIONS_FORMAT && (
                    <TeamsAssistantPanel
                      teamId={selected.id}
                      format={CHAMPIONS_FORMAT}
                      getDraft={() => {
                        const d = editorRef.current?.getDraft();
                        return {
                          name: d?.name ?? selected.name,
                          members: d?.members ?? selected.members,
                          win_condition: winConditionDraft.trim() || null,
                        };
                      }}
                      applyPatch={(patch) => {
                        editorRef.current?.applyPatch(patch);
                        if (patch.win_condition !== undefined) {
                          setWinConditionDraft(patch.win_condition ?? "");
                        }
                      }}
                      replaceDraft={(draft) =>
                        editorRef.current?.replaceDraft(draft)
                      }
                      suggestionChips={suggestionChips}
                      seedMessage={assistantSeed}
                      onSeedConsumed={() => setAssistantSeed(null)}
                    />
                  )}
                </>
              ) : (
                <div
                  className="teams-page__placeholder"
                  data-testid="teams-no-selection"
                >
                  <span className="teams-page__placeholder-icon" aria-hidden />
                  <p className="teams-page__placeholder-text">
                    Select a team to edit, or create a new one.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <PasteImportDialog
        open={importOpen}
        format={createFormat}
        onClose={() => setImportOpen(false)}
        onImport={teams.importPaste}
        onImported={(team) => {
          setSelected(team);
          setImportOpen(false);
        }}
      />

      <ExportDialog
        open={exportState.open}
        paste={exportState.paste}
        loading={exportState.loading}
        teamName={exportState.name}
        onClose={() => setExportState((prev) => ({ ...prev, open: false }))}
      />
    </main>
  );
}
