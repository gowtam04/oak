/**
 * TeamEditor — the right pane of `/teams`: edit one team's name + up to six
 * members and save (TEAM-US-3/4/5, AC-3.1, AC-5.x). Partial teams are first-class
 * (BR-T4) — Save works with empty slots / incomplete sets.
 *
 * Workbench layout: a {@link RosterStrip} of the (up to six) members sits above a
 * single focused {@link TeamMemberPanel} for the selected slot — so the editor
 * stays roomy and sprite-forward instead of cramming six panels into a grid.
 * Holds a local draft (name + members + selected slot) seeded from the `team`
 * prop and re-seeded whenever a different team is opened (`team.id` changes). Add
 * / remove / reorder act on the draft array and keep the selection sensible; Save
 * hands the draft back to the page (`onSave`) which writes through the
 * never-throwing `useTeams.update`. The returned team carries fresh server
 * `validation`, so the advisory warnings (per-slot inside the focused panel,
 * team-level via {@link TeamWarnings}) reflect the last saved state. Export opens
 * the {@link ExportDialog} via the page.
 *
 * Sprites / types / base stats (for the roster chips, the panel's type badges,
 * and its live-stat bars) come from the page's batch `resolveSprites` lookup in
 * `spriteBySpecies`; a species with no entry just shows no sprite / live bars
 * (still fully editable).
 */

"use client";

import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import {
  applyTeamPatch,
  type TeamPatch,
} from "@/agent/teams-assistant/schemas";

import type { TeamMember } from "@/data/teams/team-schema";
import type { TeamDetail } from "@/lib/api/teams-client";
import { resolveSprites, type SpriteRef } from "@/lib/api/sprites-client";
import { type Format } from "@/data/formats";
import TeamMemberPanel from "./TeamMemberPanel";
import RosterStrip from "./RosterStrip";
import TeamWarnings from "./TeamWarnings";
import { formatLabel } from "./display-names";

/**
 * A team is "incomplete" when it isn't a full, battle-ready six — mirrors the
 * server's `isIncomplete` (team-repo) so the save-bar legality pill reacts to
 * the LIVE draft (< 6 members, or any slot missing a species / its 4th move).
 */
export function isTeamIncomplete(members: TeamMember[]): boolean {
  return (
    members.length < 6 ||
    members.some((m) => m.species === null || m.moves.length < 4)
  );
}

/** A fresh, empty member (partial team allowed — BR-T4). IVs default to 31. */
export function blankMember(): TeamMember {
  return {
    species: null,
    ability: null,
    item: null,
    moves: [],
    nature: null,
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    tera_type: null,
    level: 50,
    nickname: null,
  };
}

/**
 * Imperative handle for out-of-band draft access (the /teams assistant panel).
 * `applyPatch`/`replaceDraft` only ever fire from a user-initiated click
 * (Apply/Undo) — never from an effect — so they cannot race the `team.id`
 * re-seed effect below (which remains the sole authority for "opened a
 * different team").
 */
export interface TeamEditorHandle {
  /** The live, unsaved draft (name + members, in slot order). */
  getDraft(): { name: string; members: TeamMember[] };
  /** Apply an assistant team_patch to the draft (applyTeamPatch semantics). */
  applyPatch(patch: TeamPatch): void;
  /** Replace the whole draft (the Undo path — exact snapshot restore). */
  replaceDraft(draft: { name: string; members: TeamMember[] }): void;
}

export interface TeamEditorProps {
  team: TeamDetail;
  /**
   * Optional seed of species slug → sprite/types/base-stats. The editor also
   * resolves sprites itself for its LIVE (possibly unsaved) members, so this is
   * a pre-warm/override (e.g. tests), not the only source.
   */
  spriteBySpecies?: Record<string, SpriteRef | undefined>;
  /** True while a save is in flight (disables Save). */
  saving?: boolean;
  onSave: (input: { name: string; members: TeamMember[] }) => void;
  onExport: () => void;
  onClose?: () => void;
  /** Optional imperative handle (see {@link TeamEditorHandle}). */
  handleRef?: Ref<TeamEditorHandle>;
}

export default function TeamEditor({
  team,
  spriteBySpecies = {},
  saving = false,
  onSave,
  onExport,
  onClose,
  handleRef,
}: TeamEditorProps) {
  const [name, setName] = useState(team.name);
  const [members, setMembers] = useState<TeamMember[]>(team.members);
  const [selectedSlot, setSelectedSlot] = useState(0);

  // Out-of-band draft access for the assistant panel (user-click only). The
  // handle is created ONCE and stays valid across renders: getDraft reads the
  // live values through a ref (so a caller-captured handle can never see a
  // stale draft), and the mutators use functional updates.
  const draftRef = useRef({ name, members });
  draftRef.current = { name, members };
  useImperativeHandle(
    handleRef,
    (): TeamEditorHandle => ({
      getDraft: () => ({ ...draftRef.current }),
      applyPatch: (patch) => {
        if (patch.name != null) setName(patch.name);
        setMembers((prev) => applyTeamPatch(prev, patch));
        // Focus the first patched slot so the change is visible immediately.
        const first = patch.slots.length
          ? Math.min(...patch.slots.map((s) => s.slot))
          : null;
        if (first !== null) setSelectedSlot(first);
      },
      replaceDraft: (draft) => {
        setName(draft.name);
        setMembers(draft.members);
      },
    }),
    [],
  );
  // Sprites/types/base-stats resolved for the LIVE members (slug → ref;
  // `undefined` = a resolved miss, so we don't refetch). Reset per opened team.
  const [resolved, setResolved] = useState<
    Record<string, SpriteRef | undefined>
  >({});

  // Re-seed the draft whenever a different team is opened. Keyed on id so typing
  // in the same team doesn't clobber the draft on an unrelated re-render.
  useEffect(() => {
    setName(team.name);
    setMembers(team.members);
    setSelectedSlot(0);
    setResolved({});
  }, [team.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The effective sprite map: locally-resolved refs, with the optional prop seed
  // layered on top (the prop wins, e.g. for a test-injected ref).
  const sprites: Record<string, SpriteRef | undefined> = {
    ...resolved,
    ...spriteBySpecies,
  };

  // Resolve sprites for any LIVE member species we don't have yet — this is what
  // makes a just-added/edited Mega or alternate form show its sprite immediately
  // (the saved-only page lookup never saw it). Never-throwing; misses are cached.
  useEffect(() => {
    const wanted = [
      ...new Set(
        members
          .map((m) => m.species)
          .filter(
            (s): s is string =>
              !!s && !(s in resolved) && !(s in spriteBySpecies),
          ),
      ),
    ];
    if (wanted.length === 0) return;
    let active = true;
    void resolveSprites(team.format, wanted).then((refs) => {
      if (!active) return;
      setResolved((prev) => {
        const next = { ...prev };
        for (const s of wanted) next[s] = refs[s];
        return next;
      });
    });
    return () => {
      active = false;
    };
  }, [members, team.format, resolved, spriteBySpecies]);

  // A Mega must hold its stone: once a member's species resolves to a form with a
  // `required_item`, force its item to that stone (idempotent — stops once set).
  useEffect(() => {
    let changed = false;
    const next = members.map((m) => {
      if (!m.species) return m;
      const stone = (resolved[m.species] ?? spriteBySpecies[m.species])
        ?.required_item;
      if (stone && m.item !== stone) {
        changed = true;
        return { ...m, item: stone };
      }
      return m;
    });
    if (changed) setMembers(next);
  }, [resolved, spriteBySpecies, members]);

  const updateMember = (index: number, next: TeamMember) =>
    setMembers((prev) => prev.map((m, i) => (i === index ? next : m)));

  const removeMember = (index: number) => {
    setMembers((prev) => prev.filter((_, i) => i !== index));
    setSelectedSlot((s) => (s > index ? s - 1 : s));
  };

  const addMember = () =>
    setMembers((prev) => {
      if (prev.length >= 6) return prev;
      const next = [...prev, blankMember()];
      setSelectedSlot(next.length - 1);
      return next;
    });

  const moveMember = (index: number, dir: -1 | 1) =>
    setMembers((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target]!, next[index]!];
      // Keep the focus on the member that moved.
      setSelectedSlot((s) =>
        s === index ? target : s === target ? index : s,
      );
      return next;
    });

  // Save-success pulse: when a save finishes (saving true → false) flash the
  // legality pill to --success briefly (motion-safe; see globals.css).
  const [savePulse, setSavePulse] = useState(false);
  const prevSaving = useRef(saving);
  useEffect(() => {
    if (prevSaving.current && !saving) {
      setSavePulse(true);
      const t = setTimeout(() => setSavePulse(false), 1100);
      prevSaving.current = saving;
      return () => clearTimeout(t);
    }
    prevSaving.current = saving;
  }, [saving]);

  const teamLevelWarnings = team.validation.filter((w) => w.slot === undefined);
  const slot = members.length === 0 ? 0 : Math.min(selectedSlot, members.length - 1);
  const focused = members[slot];
  const complete = !isTeamIncomplete(members);

  return (
    <div className="team-editor" data-testid="team-editor">
      <div className="team-editor__header">
        <input
          className="team-editor__name"
          data-testid="team-name"
          aria-label="Team name"
          value={name}
          placeholder="Untitled team"
          onChange={(e) => setName(e.target.value)}
        />
        <div className="team-editor__header-actions">
          <button
            type="button"
            className="tm-btn tm-btn--secondary"
            data-testid="team-export"
            onClick={onExport}
          >
            Export
          </button>
          {onClose && (
            <button
              type="button"
              className="tm-btn tm-btn--ghost"
              data-testid="team-editor-close"
              onClick={onClose}
            >
              Close
            </button>
          )}
        </div>
      </div>

      <TeamWarnings
        warnings={teamLevelWarnings}
        title="Team legality"
        testid="team-level-warnings"
      />

      <RosterStrip
        members={members}
        selectedSlot={slot}
        spriteBySpecies={sprites}
        onSelect={(i) => setSelectedSlot(i)}
        onAdd={addMember}
      />

      {focused ? (
        <TeamMemberPanel
          key={slot}
          slot={slot}
          member={focused}
          format={team.format as Format}
          warnings={team.validation.filter((w) => w.slot === slot)}
          baseStats={
            focused.species ? sprites[focused.species]?.base_stats : undefined
          }
          spriteRef={focused.species ? sprites[focused.species] : undefined}
          onChange={(next) => updateMember(slot, next)}
          onRemove={() => removeMember(slot)}
          onMoveUp={() => moveMember(slot, -1)}
          onMoveDown={() => moveMember(slot, 1)}
          canMoveUp={slot > 0}
          canMoveDown={slot < members.length - 1}
        />
      ) : (
        <p className="team-editor__empty" data-testid="team-editor-empty">
          This team has no Pokémon yet. Add one to start building.
        </p>
      )}

      <div className="team-editor__savebar" data-testid="team-editor-savebar">
        <span
          className="team-editor__savebar-meta"
          data-testid="team-editor-format"
        >
          <span className="ilabel">{formatLabel(team.format)}</span>
          <span className="team-editor__savebar-dot" aria-hidden>
            ·
          </span>
          <span className="mono-num team-editor__savebar-count">
            {members.length}/6
          </span>
        </span>
        <span
          className="team-editor__legality"
          data-testid="team-legality"
          data-state={complete ? "legal" : "incomplete"}
          data-pulse={savePulse ? "true" : "false"}
        >
          <span aria-hidden>{complete ? "✓" : "⚠"}</span>
          {complete ? "Legal" : "Incomplete"}
        </span>
        <button
          type="button"
          className="tm-btn tm-btn--primary team-editor__save"
          data-testid="team-save"
          onClick={() => onSave({ name, members })}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
