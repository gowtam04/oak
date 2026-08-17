/**
 * /teams — the manual team builder (Phase 9; TEAM-US-1..5, 10, 11).
 *
 * A signed-in account's team workbench: a Pokédex-red header band (just the
 * clickable Oak wordmark + the format select — navigation now lives in the
 * {@link AppNav} rail below it, not the band) over a `teams-page__shell` that
 * puts the shared app rail (nav refactor Part 1 WP3) beside the existing
 * {@link TeamList} rail (create / import / duplicate / delete-with-confirm)
 * and {@link TeamEditor} — a roster strip + focused member editor — for the
 * selected team. The app rail renders for guests too (its "New chat" link and
 * Reference/Privacy footer need no auth); the guest soft-gate below is
 * unchanged. All team data flows through the Wave-4 client layer — `useTeams`
 * for the list + mutations and the teams-client for one-off detail/export — never
 * a raw `/api/teams` call. Guests get a sign-in prompt (BR-T2): no list, no
 * requests.
 *
 * Sprites / types / base stats (for the roster chips, member type badges, and the
 * editor's live final-stat bars) are looked up in one batch from the index
 * (`resolveSprites`, never-throwing) and cached per slug, keyed to the active
 * format. The format selector scopes the list and is the format new/imported
 * teams are created under.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import AppNav from "@/components/nav/AppNav";
import OakWordmark from "@/components/brand/OakWordmark";
import { fetchMe, type MeResult } from "@/lib/api/auth-client";
import { useTeams } from "@/lib/hooks/use-teams";
import type { TeamDetail } from "@/lib/api/teams-client";
import type { TeamMember } from "@/data/teams/team-schema";
import {
  NATDEX_FORMAT,
  SCOPE_PICKER_ORDER,
  type Format,
} from "@/data/formats";
import TeamList from "@/components/teams/TeamList";
import TeamEditor, {
  type TeamEditorHandle,
} from "@/components/teams/TeamEditor";
import TeamsAssistantPanel from "@/components/teams/TeamsAssistantPanel";
import PasteImportDialog from "@/components/teams/PasteImportDialog";
import ExportDialog from "@/components/teams/ExportDialog";
import { formatLabel } from "@/components/teams/display-names";
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
  const { setFormatFilter } = teams;

  // List defaults to ALL formats so a team saved from chat (e.g. Champions) is
  // visible without hunting for a filter. Create/import use the selected format,
  // or national-dex when "All" is selected.
  const [format, setFormat] = useState<Format | "all">("all");
  const createFormat: Format = format === "all" ? NATDEX_FORMAT : format;
  useEffect(() => {
    setFormatFilter(format === "all" ? null : format);
  }, [format, setFormatFilter]);

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

  // Auto-select the first team once per format so the workbench is rarely empty
  // (resets on format switch; never fights a user who closes the editor).
  const autoSelectedRef = useRef(false);
  useEffect(() => {
    autoSelectedRef.current = false;
  }, [format]);
  useEffect(() => {
    if (autoSelectedRef.current) return;
    if (selected) {
      autoSelectedRef.current = true;
      return;
    }
    const first = teams.teams[0];
    if (first) {
      autoSelectedRef.current = true;
      void openTeam(first.id);
    }
  }, [teams.teams, selected, openTeam]);

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
        <div className="teams-page__band-controls">
          <label className="teams-page__format">
            <span className="teams-page__format-text">Format</span>
            <span className="teams-page__select-wrap">
              <select
                data-testid="teams-format"
                className="teams-page__format-select"
                value={format}
                onChange={(e) => {
                  const v = e.target.value;
                  setFormat(v === "all" ? "all" : (v as Format));
                  setSelected(null);
                }}
              >
                <option value="all">All formats</option>
                {SCOPE_PICKER_ORDER.map((f) => (
                  <option key={f} value={f}>
                    {formatLabel(f)}
                  </option>
                ))}
              </select>
              <span className="pill-caret" aria-hidden />
            </span>
          </label>
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
              className={`teams-grid${selected ? " teams-grid--assistant" : ""}`}
            >
              <TeamList
                teams={teams.teams}
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
                    onAnalysisChange={setAnalysis}
                    winCondition={winConditionDraft}
                    onWinConditionChange={setWinConditionDraft}
                  />
                  <TeamsAssistantPanel
                    teamId={selected.id}
                    format={selected.format as Format}
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
