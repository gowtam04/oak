"use client";

import { useMemo, useState } from "react";
import type { CandidateTableProps, CandidateRow } from "@/components/types";
import TypeBadge from "@/components/TypeBadge";
import SpriteImg from "@/components/SpriteImg";
import EntityLink from "@/components/artifact/EntityLink";
import { useArtifactViewer } from "@/components/artifact/useArtifactViewer";
import { oakMediaDexSpriteUrl } from "@/lib/sprites";
import { candidatesToTsv } from "@/lib/candidates-tsv";
import AddToTeamPicker from "@/components/teams/AddToTeamPicker";
import { blankMember } from "@/data/teams/place-on-team";
import type { Format } from "@/data/formats";

/** Fixed display order for the six base stats (HP, Attack, Defense, SpA, SpD, Speed). */
const STAT_ORDER = [
  "hp",
  "attack",
  "defense",
  "special_attack",
  "special_defense",
  "speed",
] as const;

/** Short competitive labels for each base stat, in {@link STAT_ORDER}. */
const STAT_LABELS: Record<(typeof STAT_ORDER)[number], string> = {
  hp: "HP",
  attack: "Attack",
  defense: "Defense",
  special_attack: "SpA",
  special_defense: "SpD",
  speed: "Speed",
};

/**
 * Human-readable labels for the query_pokedex sort fields. The raw `sort` value
 * is a technical `"<field> <asc|desc>"` string (e.g. `"base_stat_total desc"`);
 * the chip should read "Base Stat Total", not "BASE_STAT_TOTAL DESC".
 */
const SORT_FIELD_LABELS: Record<string, string> = {
  hp: "HP",
  attack: "Attack",
  defense: "Defense",
  special_attack: "Special Attack",
  special_defense: "Special Defense",
  speed: "Speed",
  base_stat_total: "Base Stat Total",
  national_dex_number: "National Dex No.",
};

/**
 * Turn the raw `sort` string ("base_stat_total desc") into a friendly field
 * label plus a direction arrow (↓ high→low for desc, ↑ low→high for asc).
 * Unknown fields fall back to a Title-Cased version of the slug.
 */
function formatSort(sort: string): { field: string; arrow: string } {
  const [field, direction] = sort.trim().split(/\s+/);
  const label =
    SORT_FIELD_LABELS[field] ??
    field
      .split("_")
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ");
  const arrow = direction === "asc" ? "↑" : direction === "desc" ? "↓" : "";
  return { field: label, arrow };
}

function statValue(row: CandidateRow, key: (typeof STAT_ORDER)[number]): number {
  if (row.base_stats && typeof row.base_stats[key] === "number") {
    return row.base_stats[key];
  }
  const fallback = row.key_stats?.[key];
  return typeof fallback === "number" ? fallback : 0;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type CandidateTableP6Props = CandidateTableProps & {
  signedIn?: boolean;
  format?: Format;
};

/**
 * CandidateTable — renders the `candidates` result set for filter/superlative
 * answers (US-1/2/3), plus local shown-set tools (TBL-US-1–4).
 */
export default function CandidateTable({
  candidates,
  onShowAll,
  disabled = false,
  signedIn = false,
  format = "national-dex",
}: CandidateTableP6Props) {
  const { total_count, truncated, shown, sort, hidden_rows } = candidates;

  const canExpandLocally = truncated && (hidden_rows?.length ?? 0) > 0;
  const [expanded, setExpanded] = useState(false);
  const [sortKey, setSortKey] = useState<(typeof STAT_ORDER)[number] | null>(
    null,
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [typeFilter, setTypeFilter] = useState("");
  const [nameSearch, setNameSearch] = useState("");
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [copyEmpty, setCopyEmpty] = useState(false);
  const [addIncoming, setAddIncoming] = useState<string | null>(null);

  const baseRows = expanded && hidden_rows ? [...shown, ...hidden_rows] : shown;

  const typesInSet = useMemo(() => {
    const set = new Set<string>();
    for (const row of baseRows) for (const t of row.types) set.add(t);
    return [...set].sort();
  }, [baseRows]);

  const visible = useMemo(() => {
    const working = [...baseRows];
    if (sortKey) {
      working.sort((a, b) => {
        const delta = statValue(a, sortKey) - statValue(b, sortKey);
        return sortDir === "asc" ? delta : -delta;
      });
    }
    const nameQ = nameSearch.trim().toLowerCase();
    const matches = working.filter((row) => {
      if (typeFilter && !row.types.some((t) => t === typeFilter)) return false;
      if (nameQ && !row.name.toLowerCase().includes(nameQ)) return false;
      return true;
    });
    const pinnedRows = working.filter((row) => pinned.has(row.name));
    const rest = matches.filter((row) => !pinned.has(row.name));
    const seen = new Set<string>();
    const out: CandidateRow[] = [];
    for (const row of [...pinnedRows, ...rest]) {
      if (seen.has(row.name)) continue;
      seen.add(row.name);
      out.push(row);
    }
    return out;
  }, [baseRows, sortKey, sortDir, typeFilter, nameSearch, pinned]);

  const countLabel =
    truncated && !expanded
      ? `Showing ${shown.length} of ${total_count}`
      : `${total_count} result${total_count !== 1 ? "s" : ""}`;

  const sortDisplay = sort ? formatSort(sort) : null;

  const hasAbilityColumn = baseRows.some((row) => row.ability != null);
  const hasStats = baseRows.some(
    (row) =>
      row.base_stats != null ||
      (row.key_stats != null && Object.keys(row.key_stats).length > 0),
  );

  const showAllVisible =
    truncated && !expanded && (canExpandLocally || onShowAll != null);
  const handleShowAll = canExpandLocally ? () => setExpanded(true) : onShowAll;

  function toggleSort(key: (typeof STAT_ORDER)[number]) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function togglePin(name: string) {
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function copyTsv() {
    const tsv = candidatesToTsv(visible);
    if (!tsv) {
      setCopyEmpty(true);
      return;
    }
    setCopyEmpty(false);
    void navigator.clipboard?.writeText(tsv);
  }

  return (
    <div className="candidate-table" data-testid="candidate-table">
      <div className="candidate-table__header">
        <span
          className="candidate-table__count"
          data-testid="candidate-table-count"
        >
          {countLabel}
        </span>
        {sortDisplay && (
          <span
            className="candidate-table__sort"
            data-testid="candidate-table-sort"
          >
            sorted by{" "}
            <span className="candidate-table__sort-field">
              {sortDisplay.field}
              {sortDisplay.arrow && (
                <span className="candidate-table__sort-dir">
                  {" "}
                  {sortDisplay.arrow}
                </span>
              )}
            </span>
          </span>
        )}
        {showAllVisible && handleShowAll && (
          <button
            type="button"
            className="candidate-table__show-all"
            data-testid="candidate-table-show-all"
            onClick={handleShowAll}
            disabled={disabled && !canExpandLocally}
          >
            Show all {total_count}
          </button>
        )}
      </div>

      <div className="candidate-table__tools">
        <div className="candidate-table__sorts">
          {STAT_ORDER.map((key) => (
            <button
              type="button"
              key={key}
              className="candidate-table__sort-btn"
              data-testid={`candidate-sort-${key}`}
              onClick={() => toggleSort(key)}
            >
              {STAT_LABELS[key]}
            </button>
          ))}
        </div>
        <label className="candidate-table__filter">
          Type
          <select
            data-testid="candidate-table-type-filter"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">All</option>
            {typesInSet.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="candidate-table__filter">
          Name
          <input
            type="search"
            data-testid="candidate-table-name-search"
            value={nameSearch}
            onChange={(e) => setNameSearch(e.target.value)}
            placeholder="Search names"
          />
        </label>
        <button
          type="button"
          className="candidate-table__tsv"
          data-testid="candidate-table-copy-tsv"
          onClick={copyTsv}
        >
          Copy for spreadsheet
        </button>
        {copyEmpty && (
          <span data-testid="candidate-table-copy-empty">
            No rows to copy.
          </span>
        )}
      </div>

      <div className="candidate-table__scroll">
        <table className="candidate-table__table">
          <thead>
            <tr>
              <th className="ilabel" scope="col">Name</th>
              <th className="ilabel" scope="col">Types</th>
              {hasStats && <th className="ilabel" scope="col">Stats</th>}
              {hasAbilityColumn && (
                <th className="ilabel" scope="col">Ability</th>
              )}
              <th className="ilabel" scope="col">
                Pin
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <CandidateRowView
                key={`${row.name}-${i}`}
                row={row}
                index={i}
                hasStats={hasStats}
                hasAbilityColumn={hasAbilityColumn}
                pinned={pinned.has(row.name)}
                onTogglePin={() => togglePin(row.name)}
                signedIn={signedIn}
                onAdd={() => setAddIncoming(row.name)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {signedIn && addIncoming && (
        <AddToTeamPicker
          incoming={{ ...blankMember(), species: slugify(addIncoming) }}
          format={format}
          onClose={() => setAddIncoming(null)}
        />
      )}
    </div>
  );
}

interface CandidateRowViewProps {
  row: CandidateRow;
  index: number;
  hasStats: boolean;
  hasAbilityColumn: boolean;
  pinned: boolean;
  onTogglePin: () => void;
  signedIn: boolean;
  onAdd: () => void;
}

function CandidateRowView({
  row,
  index,
  hasStats,
  hasAbilityColumn,
  pinned,
  onTogglePin,
  signedIn,
  onAdd,
}: CandidateRowViewProps) {
  const { openEntity } = useArtifactViewer();

  return (
    <tr
      className="candidate-table__row candidate-table__row--clickable"
      onClick={() => openEntity({ kind: "pokemon", q: row.name })}
      data-testid={`candidate-row-${index}`}
    >
      <td className="candidate-table__name-cell">
        <div className="candidate-table__name-inner">
          {row.sprite_url && (
            <SpriteImg
              src={row.sprite_url}
              fallbackSrc={
                row.dex_number != null
                  ? oakMediaDexSpriteUrl(row.dex_number)
                  : undefined
              }
              alt={row.name}
              width={40}
              height={40}
              className="candidate-table__sprite"
            />
          )}
          <EntityLink
            kind="pokemon"
            q={row.name}
            className="candidate-table__name-link"
            testid={`candidate-entity-${index}`}
          >
            {row.name}
            {row.dex_number != null && (
              <span className="candidate-table__dex"> #{row.dex_number}</span>
            )}
          </EntityLink>
        </div>
      </td>
      <td className="candidate-table__types-cell">
        <div className="candidate-table__types-inner">
          {row.types.map((type) => (
            <EntityLink
              key={type}
              kind="type"
              q={type}
              className="entity-link--type"
            >
              <TypeBadge type={type} />
            </EntityLink>
          ))}
        </div>
      </td>
      {hasStats && (
        <td className="candidate-table__stats-cell">
          <div className="candidate-table__stats-grid">
            {row.base_stats != null
              ? STAT_ORDER.map((k) => (
                  <span key={k} className="candidate-table__stat-item mono-num">
                    {STAT_LABELS[k]}: {row.base_stats![k]}
                  </span>
                ))
              : row.key_stats != null &&
                Object.entries(row.key_stats).map(([k, v]) => (
                  <span key={k} className="candidate-table__stat-item mono-num">
                    {k}: {String(v)}
                  </span>
                ))}
          </div>
        </td>
      )}
      {hasAbilityColumn && (
        <td className="candidate-table__ability-cell">{row.ability ?? "—"}</td>
      )}
      <td className="candidate-table__pin-cell">
        <button
          type="button"
          className="candidate-table__row-pin"
          data-testid={`candidate-row-pin-${index}`}
          aria-pressed={pinned}
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin();
          }}
        >
          {pinned ? "Unpin" : "Pin"}
        </button>
        {signedIn && (
          <button
            type="button"
            className="candidate-table__add"
            onClick={(e) => {
              e.stopPropagation();
              onAdd();
            }}
          >
            Add to team
          </button>
        )}
      </td>
    </tr>
  );
}
