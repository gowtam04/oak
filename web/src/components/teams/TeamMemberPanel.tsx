/**
 * TeamMemberPanel — the focused editor for ONE team slot (set).
 *
 * Renders every competitive field of a {@link TeamMember}. The living Champions
 * editor (CF-TEAM-AC-1.2–1.3) is species / ability / item / 4 moves / nature /
 * Stat Points — no Tera, no IV knobs, no level knob (level is 50). Other formats
 * keep the historical EV / Tera / level fields for tests and archive display
 * when those knobs are not hidden. Slugs are stored,
 * `null` = empty (BR-T4); a partial member is valid. The free-text slug inputs
 * are now {@link EntityPicker} autocompletes — but each still keeps its
 * `data-testid` and commits the typed/selected value verbatim via `onChange`, so
 * a typed slug behaves exactly as before.
 *
 * When the species' base stats are supplied (`baseStats`, looked up by the page
 * from the sprite/entity index) the panel shows LIVE final stats computed by the
 * PURE `compute-stat` formula — the exact in-game per-step flooring, including
 * the nature ±10% — as relative bars that react as the user types EVs/IVs/level.
 * No base stats ⇒ the live bars are simply omitted (fields stay editable). A
 * `spriteRef` adds the sprite header + type badges. Per-slot validity warnings
 * (already filtered to this slot) render inline via {@link TeamWarnings}.
 *
 * Reorder (up/down) and remove are parent-driven callbacks; the panel never
 * mutates the team array itself.
 */

"use client";

import { useEffect, useState } from "react";

import {
  computeStat,
  computeStatChampions,
} from "@/agent/formulas/compute-stat";
import type { TeamMember } from "@/data/teams/team-schema";
import type { TeamWarning } from "@/lib/api/teams-client";
import type { SpriteRef } from "@/lib/api/sprites-client";
import { type Format } from "@/data/formats";
import { fetchLearnset, type LearnsetOption } from "@/lib/api/learnset-client";
import {
  guessOakMediaSpriteUrl,
  rewriteLegacyMediaUrl,
} from "@/lib/sprites";
import EntityPicker from "./EntityPicker";
import {
  evBudgetFor,
  NATURE_EFFECTS,
  NATURE_OPTIONS,
  TYPE_OPTIONS,
  type PickerOption,
  type SpreadKey,
} from "./dex-constants";
import { titleizeSlug } from "./display-names";
import TeamWarnings from "./TeamWarnings";

/** Base-stat spread as exposed by the entity/sprite index (`base_stats`). */
export interface MemberBaseStats {
  hp: number;
  attack: number;
  defense: number;
  special_attack: number;
  special_defense: number;
  speed: number;
}

interface StatRow {
  spread: SpreadKey;
  base: keyof MemberBaseStats;
  label: string;
  isHp: boolean;
}

const STAT_ROWS: StatRow[] = [
  { spread: "hp", base: "hp", label: "HP", isHp: true },
  { spread: "atk", base: "attack", label: "Atk", isHp: false },
  { spread: "def", base: "defense", label: "Def", isHp: false },
  { spread: "spa", base: "special_attack", label: "SpA", isHp: false },
  { spread: "spd", base: "special_defense", label: "SpD", isHp: false },
  { spread: "spe", base: "speed", label: "Spe", isHp: false },
];

const OFF_ROSTER_CODES = new Set([
  "species_illegal",
  "ability_not_for_species",
  "item_illegal",
  "move_not_in_learnset",
]);

function natureEffectFor(
  nature: string | null,
  stat: SpreadKey,
): "boosted" | "neutral" | "hindered" {
  if (!nature) return "neutral";
  const mod = NATURE_EFFECTS[nature.toLowerCase()];
  if (!mod) return "neutral";
  if (mod.plus === stat) return "boosted";
  if (mod.minus === stat) return "hindered";
  return "neutral";
}

/**
 * Compute one live final stat, or `null` if inputs are out of formula range.
 *
 * Champions uses its own Level-50 Stat-Point formula (`computeStatChampions`,
 * where 1 Stat Point = +1 to the final stat; IV/level are fixed and ignored),
 * matching the chat artifact card and the agent's `compute_stat` tool. Every
 * other format uses the mainline `computeStat` with the member's real IVs/level.
 */
function liveStat(
  row: StatRow,
  member: TeamMember,
  base: MemberBaseStats,
  format: Format,
): number | null {
  const nature_effect = row.isHp
    ? "neutral"
    : natureEffectFor(member.nature, row.spread);
  const result =
    format === "champions"
      ? computeStatChampions({
          base_stat: base[row.base],
          is_hp: row.isHp,
          ev: member.evs[row.spread], // Stat Points ride in on `ev` (clamped 0..32)
          nature_effect,
        })
      : computeStat({
          base_stat: base[row.base],
          is_hp: row.isHp,
          iv: member.ivs[row.spread],
          ev: member.evs[row.spread],
          level: member.level,
          nature_effect,
        });
  return "value" in result ? result.value : null;
}

function clampInt(raw: string, min: number, max: number): number {
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export interface TeamMemberPanelProps {
  member: TeamMember;
  /** 0-based slot index (for ids + labels). */
  slot: number;
  /** Warnings already filtered to this slot. */
  warnings: TeamWarning[];
  /** Species base stats for the live-stat bars; omit ⇒ no live bars. */
  baseStats?: MemberBaseStats;
  /** Sprite/types for the header chip; omit ⇒ no sprite header. */
  spriteRef?: SpriteRef;
  /** Data scope for the autocomplete pickers. */
  format?: Format;
  /** Archived / view-only: no edits, no apply-set, no remove (CF-TEAM-AC-5.3). */
  readOnly?: boolean;
  onChange: (next: TeamMember) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}

export default function TeamMemberPanel({
  member,
  slot,
  warnings,
  baseStats,
  spriteRef,
  format = "scarlet-violet",
  readOnly = false,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
}: TeamMemberPanelProps) {
  const id = (suffix: string) => `member-${slot}-${suffix}`;
  const locked = readOnly;
  // Living Champions editor: Stat Points 66/32, no Tera/IV/level.
  // Archived readOnly keeps stored spreads (and stored Tera) without that chrome.
  const livingChampions = !locked && format === "champions";
  const offRosterLabel = "not in the Champions roster";
  const warningMarksField = (field: string) =>
    warnings.some((w) => {
      if (w.field !== field && !(field === "species" && w.field == null && w.code === "species_illegal")) {
        return false;
      }
      return (
        OFF_ROSTER_CODES.has(w.code) ||
        /not in the Champions roster/i.test(w.message)
      );
    });
  // Production validateArchivedTeam skips ability/move/item when the species
  // itself misses the roster — those stored names still cannot be Champions-legal.
  const speciesOffRoster =
    locked &&
    (warningMarksField("species") ||
      warnings.some((w) => w.code === "species_illegal"));
  const fieldOffRoster = (field: string) => {
    if (!locked) {
      return warnings.some(
        (w) =>
          w.field === field &&
          /not in the Champions roster/i.test(w.message),
      );
    }
    if (warningMarksField(field)) return true;
    if (!speciesOffRoster) return false;
    if (field === "ability") return Boolean(member.ability);
    if (field === "item") return Boolean(member.item);
    const moveMatch = /^moves\[(\d+)\]$/.exec(field);
    if (moveMatch) {
      const i = Number(moveMatch[1]);
      return Boolean(member.moves[i]);
    }
    return false;
  };

  const budget = evBudgetFor(livingChampions ? "champions" : format === "champions" ? "scarlet-violet" : format);
  const investmentWord = livingChampions ? "Stat Points" : "EV";

  // Legal movepool for the focused species — the Move pickers offer ONLY these
  // (a species' learnset), not the whole move index. Refetched per species.
  // Carries the F1 metadata (type/damage_class/power) alongside slug/name.
  // Archived view-only skips the fetch (no other-game Dex; stored names render).
  const [movepool, setMovepool] = useState<LearnsetOption[]>([]);
  useEffect(() => {
    const species = member.species;
    if (!species || locked) {
      setMovepool([]);
      return;
    }
    let active = true;
    void fetchLearnset(format, species).then((moves) => {
      if (active) setMovepool(moves);
    });
    return () => {
      active = false;
    };
  }, [member.species, format, locked]);

  const set = (patch: Partial<TeamMember>) => {
    if (locked) return;
    onChange({ ...member, ...patch });
  };

  const setSpread = (kind: "evs" | "ivs", key: SpreadKey, raw: string) => {
    if (locked) return;
    // EVs clamp to the format ceiling (32 in Champions, 255 warn-but-allow in SV);
    // IVs to the legal 0..31 superset (the input itself caps at 31).
    const max = kind === "evs" ? budget.clampMax : 255;
    onChange({
      ...member,
      [kind]: { ...member[kind], [key]: clampInt(raw, 0, max) },
    });
  };

  // Metadata (type/damage_class/power) per move slug, for the moves table's
  // read-only columns. Rebuilt from `movepool` on every fetch.
  const moveMeta = new Map<string, LearnsetOption>(
    movepool.map((m) => [m.slug, m]),
  );

  // Moves are edited as four boxes; emit the non-empty slugs in order.
  const moveInputs = [0, 1, 2, 3].map((i) => member.moves[i] ?? "");
  const setMove = (index: number, value: string) => {
    if (locked) return;
    const next = [...moveInputs];
    next[index] = value;
    onChange({ ...member, moves: next.map((m) => m.trim()).filter(Boolean) });
  };

  /** A slot is "filled" when any set field is present (not just species). */
  const slotFilled =
    Boolean(member.ability) ||
    Boolean(member.item) ||
    Boolean(member.nature) ||
    member.moves.length > 0 ||
    STAT_ROWS.some((r) => member.evs[r.spread] > 0);

  // Live stats + a shared max so the bars are relative to this set's spread.
  // Archived view does not compute Champions live stats from stored other-game EVs.
  const lives = STAT_ROWS.map((row) =>
    !locked && baseStats ? liveStat(row, member, baseStats, format) : null,
  );
  const maxLive = Math.max(1, ...lives.map((v) => v ?? 0));

  const evTotal = STAT_ROWS.reduce((sum, r) => sum + member.evs[r.spread], 0);
  const evOver = evTotal > budget.total;
  // Prefer the DB/API sprite_url (Oak media after re-ingest; legacy URLs are
  // rewritten onto the proxy) and fall back to a slug-guessed Oak media URL.
  const staticSpriteUrl = spriteRef?.sprite_url
    ? rewriteLegacyMediaUrl(spriteRef.sprite_url)
    : null;
  const preferredSpriteUrl = member.species
    ? (staticSpriteUrl ?? guessOakMediaSpriteUrl(member.species))
    : null;
  const guessedFallback = member.species
    ? guessOakMediaSpriteUrl(member.species)
    : null;
  const [spriteErrored, setSpriteErrored] = useState(false);
  useEffect(() => {
    setSpriteErrored(false);
  }, [member.species, staticSpriteUrl]);
  const spriteUrl =
    spriteErrored && guessedFallback && guessedFallback !== preferredSpriteUrl
      ? guessedFallback
      : preferredSpriteUrl;
  const types = spriteRef?.types ?? [];
  // A Mega must hold its stone — auto-filled by the editor and locked here.
  const requiredItem = spriteRef?.required_item ?? null;
  const itemLocked = Boolean(requiredItem);
  // The species' legal abilities, as picker options (only these are offered).
  const abilityOptions: PickerOption[] = (spriteRef?.abilities ?? []).map(
    (slug) => ({ slug, display_name: titleizeSlug(slug) }),
  );

  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateNote, setTemplateNote] = useState<string | null>(null);
  const applyChampionsSet = () => {
    if (!member.species || templateLoading || locked) return;
    // Filled slot: yes/no replace, not a field diff (CF-AS-3). Empty fills
    // with no confirm (CF-TEAM-AC-6.2). Confirm is synchronous so the click
    // handler's tests see it before the fetch.
    if (
      slotFilled &&
      !window.confirm("Replace this slot with the Champions usage set?")
    ) {
      return;
    }
    setTemplateLoading(true);
    setTemplateNote(null);
    void fetch("/api/teams/set-template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ species: member.species }),
    })
      .then(async (res) => {
        const body = (await res.json()) as {
          found?: boolean;
          member?: TeamMember;
          attribution?: string;
          notes?: string[];
        };
        if (!body.found || !body.member) {
          setTemplateNote(
            body.notes?.[0] ?? "Usage is unavailable for this species.",
          );
          return;
        }
        onChange({
          ...member,
          ...body.member,
          species: member.species,
          tera_type: null,
          level: 50,
          // Keep cosmetic fields the user may have set.
          nickname: member.nickname,
          gender: member.gender,
          shiny: member.shiny,
        });
        setTemplateNote(body.attribution ?? "Applied Champions set.");
      })
      .catch(() => setTemplateNote("Couldn't load Champions set."))
      .finally(() => setTemplateLoading(false));
  };

  return (
    <div className="team-member-panel" data-testid={id("panel")}>
      <div className="team-member-panel__header">
        <div className="team-member-panel__title">
          <span className="team-member-panel__slot-label">Slot {slot + 1}</span>
          {member.species && (
            <span className="team-member-panel__species-name">
              {titleizeSlug(member.species, "Empty slot")}
            </span>
          )}
        </div>
        <div className="team-member-panel__actions">
          {member.species && !locked && (
            <button
              type="button"
              className="tm-btn tm-btn--ghost tm-btn--sm"
              data-testid={id("apply-set")}
              onClick={applyChampionsSet}
              disabled={templateLoading}
              title="Fill moves/item/nature/Stat Points from live Champions usage"
            >
              {templateLoading ? "Loading…" : "Apply this Champions set"}
            </button>
          )}
          {!locked && (
            <>
              <button
                type="button"
                className="tm-icon-btn"
                data-testid={id("up")}
                aria-label={`Move slot ${slot + 1} up`}
                onClick={onMoveUp}
                disabled={!canMoveUp}
              >
                ↑
              </button>
              <button
                type="button"
                className="tm-icon-btn"
                data-testid={id("down")}
                aria-label={`Move slot ${slot + 1} down`}
                onClick={onMoveDown}
                disabled={!canMoveDown}
              >
                ↓
              </button>
              <button
                type="button"
                className="tm-icon-btn tm-icon-btn--danger"
                data-testid={id("remove")}
                aria-label={`Remove slot ${slot + 1}`}
                onClick={onRemove}
              >
                Remove
              </button>
            </>
          )}
        </div>
      </div>
      {templateNote && (
        <p className="team-member-panel__template-note" data-testid={id("template-note")}>
          {templateNote}
        </p>
      )}

      {member.species && (
        <div className="team-member-panel__identity">
          <span className="team-member-panel__sprite">
            {spriteUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={spriteUrl}
                alt=""
                aria-hidden
                loading="lazy"
                onError={() => {
                  if (
                    !spriteErrored &&
                    guessedFallback &&
                    guessedFallback !== preferredSpriteUrl
                  ) {
                    setSpriteErrored(true);
                  }
                }}
              />
            ) : (
              <span className="team-member-panel__sprite-empty" aria-hidden />
            )}
          </span>
          <div className="team-member-panel__identity-meta">
            <span className="team-member-panel__identity-name">
              {titleizeSlug(member.species, "Empty slot")}
            </span>
            {types.length > 0 && (
              <span className="team-member-panel__types">
                {types.map((t) => (
                  <span key={t} className={`type-badge type-badge--${t}`}>
                    {t}
                  </span>
                ))}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="team-member-panel__fields">
        <PickerField label="Species" htmlFor={id("species")}>
          <EntityPicker
            kind="pokemon"
            format={format}
            value={member.species ?? ""}
            onChange={(v) => set({ species: v || null })}
            testid={id("species")}
            inputId={id("species")}
            ariaLabel="Species"
            placeholder="Search Pokémon…"
            withSprite
            disabled={locked}
          />
          {fieldOffRoster("species") && (
            <span className="team-member-panel__off-roster">
              {offRosterLabel}
            </span>
          )}
        </PickerField>

        <div className="team-member-panel__row2">
          <PickerField label="Ability" htmlFor={id("ability")}>
            <EntityPicker
              options={abilityOptions}
              format={format}
              value={member.ability ?? ""}
              onChange={(v) => set({ ability: v || null })}
              testid={id("ability")}
              inputId={id("ability")}
              ariaLabel="Ability"
              placeholder={
                member.species ? "Search abilities…" : "Select a species first"
              }
              disabled={locked || !member.species}
            />
            {fieldOffRoster("ability") && (
              <span className="team-member-panel__off-roster">
                {offRosterLabel}
              </span>
            )}
          </PickerField>
          <PickerField
            label={itemLocked ? "Item (Mega stone)" : "Item"}
            htmlFor={id("item")}
          >
            <EntityPicker
              kind="item"
              format={format}
              value={member.item ?? ""}
              onChange={(v) => set({ item: v || null })}
              testid={id("item")}
              inputId={id("item")}
              ariaLabel="Item"
              placeholder="Search items…"
              disabled={locked || itemLocked}
            />
            {fieldOffRoster("item") && (
              <span className="team-member-panel__off-roster">
                {offRosterLabel}
              </span>
            )}
          </PickerField>
        </div>
      </div>

      <fieldset className="team-member-panel__moves" data-testid={id("moves")}>
        <legend className="team-member-panel__moves-legend ilabel">Moves</legend>
        <table className="team-member-panel__moves-table">
          <thead>
            <tr>
              <th>Move</th>
              <th>Type</th>
              <th>Category</th>
              <th>Power</th>
            </tr>
          </thead>
          <tbody>
            {[0, 1, 2, 3].map((i) => {
              const meta = moveMeta.get(moveInputs[i]!);
              return (
                <tr key={i}>
                  <td>
                    <EntityPicker
                      options={movepool}
                      format={format}
                      value={moveInputs[i]!}
                      onChange={(v) => setMove(i, v)}
                      testid={id(`move-${i}`)}
                      ariaLabel={`Move ${i + 1}`}
                      placeholder={
                        member.species ? `Move ${i + 1}` : "Select a species first"
                      }
                      disabled={locked || !member.species}
                    />
                    {fieldOffRoster(`moves[${i}]`) && (
                      <span className="team-member-panel__off-roster">
                        {offRosterLabel}
                      </span>
                    )}
                  </td>
                  <td data-testid={id(`move-${i}-type`)}>
                    {meta?.type ? (
                      <span className="tm-move-type">
                        <span
                          className={`tm-move-type__dot type-badge--${meta.type}`}
                          aria-hidden
                        />
                        {meta.type}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td data-testid={id(`move-${i}-category`)}>
                    {meta?.damage_class ? titleizeSlug(meta.damage_class) : "—"}
                  </td>
                  <td
                    className="mono-num"
                    data-testid={id(`move-${i}-power`)}
                  >
                    {meta?.power != null ? meta.power : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </fieldset>

      {/* No group head here (ilabel prune, phase 3): "Nature", "Tera type",
          and "Level" are each already labeled by their own field below —
          the group label just concatenated names that were already visible. */}
      <div className="team-member-panel__group">
        <div className="team-member-panel__meta-grid">
        <PickerField label="Nature" htmlFor={id("nature")}>
          <EntityPicker
            options={NATURE_OPTIONS}
            format={format}
            value={member.nature ?? ""}
            onChange={(v) => set({ nature: v || null })}
            testid={id("nature")}
            inputId={id("nature")}
            ariaLabel="Nature"
            placeholder="Nature"
            disabled={locked}
          />
        </PickerField>
        {/* Living Champions has no Tera. Archived view shows stored Tera if present. */}
        {!livingChampions && (!locked || member.tera_type) && (
          <PickerField label="Tera type" htmlFor={id("tera")}>
            <EntityPicker
              options={TYPE_OPTIONS}
              format={format}
              value={member.tera_type ?? ""}
              onChange={(v) => set({ tera_type: v || null })}
              testid={id("tera")}
              inputId={id("tera")}
              ariaLabel="Tera type"
              placeholder="Tera type"
              disabled={locked}
            />
          </PickerField>
        )}
        {/* Living Champions is fixed at Level 50 — not a user knob. Archive omits it too. */}
        {!livingChampions && !locked && (
          <label className="team-member-panel__field" htmlFor={id("level")}>
            Level
            <input
              id={id("level")}
              data-testid={id("level")}
              className="team-member-panel__level-input"
              type="number"
              min={1}
              max={100}
              value={member.level}
              onChange={(e) => set({ level: clampInt(e.target.value, 1, 100) })}
            />
          </label>
        )}
        </div>
      </div>

      <div className="team-member-panel__stats" data-testid={id("stats")}>
        <div className="team-member-panel__stats-head">
          <span className="team-member-panel__stats-title ilabel">
            {locked ? "Stored spread" : budget.label}
          </span>
          {!locked && (
            <span
              className={
                "team-member-panel__ev-total" +
                (evOver ? " team-member-panel__ev-total--over" : "")
              }
              data-testid={id("ev-total")}
            >
              {evTotal} / {budget.total}
            </span>
          )}
        </div>

        {STAT_ROWS.map((row, i) => {
          const ev = member.evs[row.spread];
          const live = lives[i];
          const effect = row.isHp ? "neutral" : natureEffectFor(member.nature, row.spread);
          return (
            <div className="tm-stat" key={row.spread} data-effect={effect}>
              <span className="tm-stat__label">{row.label}</span>
              {!locked && (
                <input
                  className="tm-stat__slider"
                  type="range"
                  min={0}
                  max={budget.perStat}
                  step={budget.step}
                  value={Math.min(ev, budget.perStat)}
                  aria-label={`${row.label} ${investmentWord} slider`}
                  onChange={(e) => setSpread("evs", row.spread, e.target.value)}
                />
              )}
              <input
                className="tm-stat__ev"
                data-testid={id(`ev-${row.spread}`)}
                aria-label={
                  locked
                    ? `${row.label} stored`
                    : `${row.label} ${investmentWord}`
                }
                type="number"
                min={0}
                max={locked ? undefined : budget.clampMax}
                value={ev}
                disabled={locked}
                onChange={(e) => setSpread("evs", row.spread, e.target.value)}
              />
              {!locked && baseStats && (
                <span className="tm-stat__bar">
                  <span
                    className="tm-stat__bar-fill"
                    // eslint-disable-next-line react/forbid-dom-props -- bar width is a live computed percentage
                    style={{
                      width: `${live ? Math.round((live / maxLive) * 100) : 0}%`,
                    }}
                  />
                  <span
                    className="tm-stat__final"
                    data-testid={id(`stat-${row.spread}`)}
                  >
                    {live ?? "—"}
                  </span>
                </span>
              )}
            </div>
          );
        })}
      </div>

      <details className="team-member-panel__advanced">
        <summary className="team-member-panel__advanced-summary">
          {livingChampions || locked
            ? "Advanced — nickname"
            : "Advanced — IVs & nickname"}
        </summary>
        {/* Living Champions fixes every IV at 31. Archive does not show IV knobs. */}
        {livingChampions ? (
          <p className="team-member-panel__iv-note">
            IVs are fixed at 31 in Champions.
          </p>
        ) : locked ? null : (
          <div className="team-member-panel__iv-grid">
            {STAT_ROWS.map((row) => (
              <label
                key={row.spread}
                className="team-member-panel__iv-field"
              >
                {row.label} IV
                <input
                  data-testid={id(`iv-${row.spread}`)}
                  aria-label={`${row.label} IV`}
                  type="number"
                  min={0}
                  max={31}
                  value={member.ivs[row.spread]}
                  disabled={locked}
                  onChange={(e) => setSpread("ivs", row.spread, e.target.value)}
                />
              </label>
            ))}
          </div>
        )}
        <label className="team-member-panel__field" htmlFor={id("nickname")}>
          Nickname
          <input
            id={id("nickname")}
            data-testid={id("nickname")}
            value={member.nickname ?? ""}
            placeholder="(optional)"
            disabled={locked}
            onChange={(e) => set({ nickname: e.target.value || null })}
          />
        </label>
      </details>

      <TeamWarnings
        warnings={warnings}
        testid={id("warnings")}
        title="Issues"
      />
    </div>
  );
}

/** A labeled wrapper around a picker (label is not a <label> to avoid wrapping
 *  the combobox dropdown — the picker's input carries its own aria-label). */
function PickerField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="team-member-panel__field">
      <label className="team-member-panel__field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}
