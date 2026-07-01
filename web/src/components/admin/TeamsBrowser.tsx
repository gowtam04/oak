"use client";

import type { ReactNode } from "react";

import DataTable, { type Column } from "./DataTable";
import type { TeamDetail, TeamSummary } from "@/lib/admin/admin-types";
import type { StatSpread, TeamMember } from "@/data/teams/team-schema";

/**
 * TeamsBrowser — the render half of the admin Teams screen
 * (`/admin/teams`, ADMIN-US-10 / ADMIN-AC-10.1): a searchable, keyset-paginated,
 * cross-account list of saved teams plus a read-only team-detail panel that
 * shows a selected team's full members (species, item, ability, moves, tera,
 * nature, level, EVs).
 *
 * Deliberately PURE + CONTROLLED (the admin component-test rule): it imports no
 * db/repos/runtime and holds no fetch/network state. The owning thin page
 * (`app/admin/teams/page.tsx`) owns the `fetch('/api/admin/teams')` list
 * orchestration, the keyset cursor, the search/format query, AND the
 * `fetch('/api/admin/teams/[id]')` detail load for the selected team; it threads
 * everything in as props so this view renders identically from fixtures in
 * jsdom. There is no separate `teams/[id]` route (design.md File Structure lists
 * only `teams/page.tsx`), so selection is a master-detail panel on this one page.
 *
 * READ-ONLY (ADMIN-BR-2 / ADMIN-AC-10.1): the cross-account team list and member
 * view exist solely because the admin guard already gated the caller as the
 * single owner (ADMIN-BR-4). EVERY control here is a query refinement or
 * read-only navigation — the search box, the format filter, the clear button,
 * client-side sort, "Load more", the row click (selects a team to view), and the
 * detail "Close" affordance. NOTHING edits, deletes, renames, or otherwise
 * mutates a team or its members.
 *
 * Refs:
 *   - docs/features/admin-panel/architecture/design.md § Component Design §5,
 *     § API Design (`GET /api/admin/teams → TeamsListResponse`; `…/{id} →
 *     TeamDetailResponse`; keyset cursor), § Implementation Phases Phase 8.
 *   - requirements.md ADMIN-US-10, ADMIN-AC-10.1, ADMIN-BR-2/4.
 *
 * Visual styling: the generic admin primitives (`admin-page`, `admin-table`,
 * etc.) carry their own CSS; team-specific elements use inline styles with
 * CSS-token fallbacks (mirroring `UsageExplorer`'s banner approach), so this
 * phase adds nothing to the P6-owned `admin.css`.
 */

// ---------------------------------------------------------------------------
// Display helpers (pure)
// ---------------------------------------------------------------------------

/** "rough-skin" → "Rough Skin"; null/empty → an em-dash placeholder. */
function prettySlug(slug: string | null | undefined): string {
  if (slug == null || slug === "") return "—";
  return slug
    .split("-")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Friendly label for a stored format string. */
function formatLabel(format: string): string {
  if (format === "scarlet-violet") return "Scarlet/Violet";
  if (format === "champions") return "Champions";
  return format;
}

/** The owning account's display handle (email preferred, id fallback). */
function ownerLabel(t: { accountEmail: string | null; accountId: string }): string {
  return t.accountEmail ?? t.accountId;
}

/** Compact epoch-ms → local datetime; tolerant of a 0/NaN value. */
function formatTimestamp(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Stat display order + short labels for an EV summary. */
const STAT_FIELDS: { key: keyof StatSpread; label: string }[] = [
  { key: "hp", label: "HP" },
  { key: "atk", label: "Atk" },
  { key: "def", label: "Def" },
  { key: "spa", label: "SpA" },
  { key: "spd", label: "SpD" },
  { key: "spe", label: "Spe" },
];

/** "HP 252 / Spe 252 / Atk 4" for non-zero EVs; "No EVs" when all zero/absent. */
function evSummary(evs: StatSpread | null | undefined): string {
  if (evs == null) return "No EVs";
  const parts = STAT_FIELDS.filter((s) => (evs[s.key] ?? 0) > 0).map(
    (s) => `${s.label} ${evs[s.key]}`,
  );
  return parts.length > 0 ? parts.join(" / ") : "No EVs";
}

/** True when a slot has no species chosen (an empty/unfilled member). */
function isEmptySlot(m: TeamMember): boolean {
  return m.species == null || m.species === "";
}

// ---------------------------------------------------------------------------
// Small read-only presentational pieces
// ---------------------------------------------------------------------------

/** A row of small pills (species chips, move chips). */
function Chips({
  items,
  testId,
  empty = "—",
}: {
  items: string[];
  testId?: string;
  empty?: string;
}) {
  if (items.length === 0) {
    return <span style={{ color: "var(--text-muted, #6e625a)" }}>{empty}</span>;
  }
  return (
    <span
      data-testid={testId}
      style={{ display: "inline-flex", flexWrap: "wrap", gap: "4px" }}
    >
      {items.map((it, i) => (
        <span
          key={`${it}-${i}`}
          style={{
            display: "inline-block",
            padding: "1px 7px",
            borderRadius: "var(--radius-sm, 6px)",
            background: "var(--surface-sunken, #f5efe8)",
            border: "1px solid var(--border, #e9e0d8)",
            fontSize: "var(--text-xs, 12px)",
            lineHeight: 1.5,
          }}
        >
          {it}
        </span>
      ))}
    </span>
  );
}

/** One member card inside the team-detail panel (read-only). */
function MemberCard({ member, index }: { member: TeamMember; index: number }) {
  const empty = isEmptySlot(member);
  return (
    <div
      data-testid={`team-member-${index}`}
      style={{
        border: "1px solid var(--border, #e9e0d8)",
        borderRadius: "var(--radius-md, 8px)",
        padding: "var(--space-3, 12px)",
        background: "var(--surface, #fffdfb)",
        opacity: empty ? 0.6 : 1,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "8px",
          marginBottom: "6px",
        }}
      >
        <strong data-testid={`team-member-${index}-species`}>
          {empty ? "Empty slot" : prettySlug(member.species)}
        </strong>
        <span
          style={{
            fontSize: "var(--text-xs, 12px)",
            color: "var(--text-muted, #6e625a)",
          }}
        >
          Lv {member.level}
        </span>
      </div>

      {!empty && (
        <>
          <dl
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              columnGap: "8px",
              rowGap: "2px",
              margin: 0,
              fontSize: "var(--text-sm, 13px)",
            }}
          >
            <dt style={{ color: "var(--text-muted, #6e625a)" }}>Ability</dt>
            <dd style={{ margin: 0 }}>{prettySlug(member.ability)}</dd>
            <dt style={{ color: "var(--text-muted, #6e625a)" }}>Item</dt>
            <dd style={{ margin: 0 }}>{prettySlug(member.item)}</dd>
            <dt style={{ color: "var(--text-muted, #6e625a)" }}>Tera</dt>
            <dd style={{ margin: 0 }}>{prettySlug(member.tera_type)}</dd>
            <dt style={{ color: "var(--text-muted, #6e625a)" }}>Nature</dt>
            <dd style={{ margin: 0 }}>{prettySlug(member.nature)}</dd>
            <dt style={{ color: "var(--text-muted, #6e625a)" }}>EVs</dt>
            <dd
              style={{ margin: 0 }}
              data-testid={`team-member-${index}-evs`}
            >
              {evSummary(member.evs)}
            </dd>
          </dl>

          <div style={{ marginTop: "8px" }}>
            <span
              style={{
                color: "var(--text-muted, #6e625a)",
                fontSize: "var(--text-sm, 13px)",
                marginRight: "6px",
              }}
            >
              Moves
            </span>
            <Chips
              testId={`team-member-${index}-moves`}
              items={member.moves.map((m) => prettySlug(m))}
              empty="No moves set"
            />
          </div>
        </>
      )}
    </div>
  );
}

/** The read-only team-detail panel for a selected team. */
function TeamDetailPanel({
  detail,
  loading,
  error,
  onClose,
}: {
  detail: TeamDetail | null;
  loading: boolean;
  error: string | null;
  onClose?: () => void;
}) {
  let body: ReactNode;
  if (loading) {
    body = (
      <p data-testid="team-detail-loading" style={{ color: "var(--text-muted, #6e625a)" }}>
        Loading team…
      </p>
    );
  } else if (error != null && error !== "") {
    body = (
      <p data-testid="team-detail-error" role="alert" style={{ color: "var(--danger, #ee5a5a)" }}>
        {error}
      </p>
    );
  } else if (detail) {
    body = (
      <>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: "8px",
            marginBottom: "6px",
          }}
        >
          <h2
            data-testid="team-detail-name"
            style={{ margin: 0, fontSize: "var(--text-lg, 16px)" }}
          >
            {detail.name}
          </h2>
          {onClose != null && (
            <button
              type="button"
              data-testid="team-detail-close"
              onClick={onClose}
              style={{
                background: "transparent",
                border: "1px solid var(--border, #e9e0d8)",
                borderRadius: "var(--radius-sm, 6px)",
                padding: "2px 8px",
                cursor: "pointer",
                fontSize: "var(--text-sm, 13px)",
              }}
            >
              Close
            </button>
          )}
        </div>
        <p
          data-testid="team-detail-meta"
          style={{
            margin: "0 0 12px",
            color: "var(--text-muted, #6e625a)",
            fontSize: "var(--text-sm, 13px)",
          }}
        >
          {ownerLabel(detail)} · {formatLabel(detail.format)} ·{" "}
          {detail.members.length} member{detail.members.length === 1 ? "" : "s"} ·
          updated {formatTimestamp(detail.updatedAt)}
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: "var(--space-3, 12px)",
          }}
        >
          {detail.members.map((m, i) => (
            <MemberCard key={i} member={m} index={i} />
          ))}
        </div>
      </>
    );
  } else {
    body = (
      <p data-testid="team-detail-empty" style={{ color: "var(--text-muted, #6e625a)" }}>
        No team to display.
      </p>
    );
  }

  return (
    <section
      data-testid="team-detail"
      style={{
        marginTop: "var(--space-4, 16px)",
        padding: "var(--space-4, 16px)",
        border: "1px solid var(--border, #e9e0d8)",
        borderRadius: "var(--radius-md, 8px)",
        background: "var(--surface-sunken, #f5efe8)",
      }}
    >
      {body}
    </section>
  );
}

// ---------------------------------------------------------------------------
// The browser view
// ---------------------------------------------------------------------------

export interface TeamsBrowserProps {
  /** Controlled search text (team-name substring, ilike on the API). */
  query: string;
  /** Emits the next search text on every keystroke. */
  onQueryChange: (next: string) => void;
  /** Controlled format filter ("" = all formats). */
  format: string;
  /** Emits the next format selection. */
  onFormatChange: (next: string) => void;

  /** The team rows fetched for the current query/page. */
  teams: TeamSummary[];
  /** True while the first page is loading. */
  loading?: boolean;
  /** A transport/HTTP error message, or null when healthy. */
  error?: string | null;
  /** True when another keyset page is available. */
  hasMore?: boolean;
  /** Invoked when "Load more" is activated. */
  onLoadMore?: () => void;
  /** True while a load-more fetch is in flight. */
  loadingMore?: boolean;

  /** The currently selected team's id (highlights/keys the detail panel). */
  selectedTeamId?: string | null;
  /** Read-only selection: open a team's member view (never a mutation). */
  onSelectTeam?: (team: TeamSummary) => void;
  /** The resolved detail for the selected team (members), or null. */
  detail?: TeamDetail | null;
  /** True while the detail fetch is in flight. */
  detailLoading?: boolean;
  /** A detail-fetch error message (e.g. 404), or null. */
  detailError?: string | null;
  /** Clears the selection / hides the detail panel. */
  onCloseDetail?: () => void;
}

/** Format-filter options (client-safe; mirrors the stored `format` values). */
const FORMAT_OPTIONS: { value: string; label: string }[] = [
  { value: "scarlet-violet", label: "Scarlet/Violet" },
  { value: "champions", label: "Champions" },
];

export default function TeamsBrowser({
  query,
  onQueryChange,
  format,
  onFormatChange,
  teams,
  loading = false,
  error = null,
  hasMore = false,
  onLoadMore,
  loadingMore = false,
  selectedTeamId = null,
  onSelectTeam,
  detail = null,
  detailLoading = false,
  detailError = null,
  onCloseDetail,
}: TeamsBrowserProps) {
  const columns: Column<TeamSummary>[] = [
    {
      key: "name",
      header: "Team",
      sortValue: (r) => r.name.toLowerCase(),
      render: (r) => (
        <span className="teams-browser__name" title={r.name}>
          {r.name}
        </span>
      ),
    },
    {
      key: "owner",
      header: "Owner",
      sortValue: (r) => r.accountEmail ?? r.accountId,
      render: (r) => ownerLabel(r),
    },
    {
      key: "format",
      header: "Format",
      sortValue: (r) => r.format,
      render: (r) => formatLabel(r.format),
    },
    {
      key: "members",
      header: "Members",
      align: "right",
      sortValue: (r) => r.memberCount,
      render: (r) => (
        <span>
          {r.memberCount}
          {r.incomplete && (
            <span
              data-testid={`teams-incomplete-${r.id}`}
              title="Fewer than 6 members, or a missing species / 4th move"
              style={{
                marginLeft: "6px",
                padding: "0 6px",
                borderRadius: "var(--radius-sm, 6px)",
                background: "var(--warn-surface, #fbf0d8)",
                color: "var(--warn, #9a6b00)",
                fontSize: "var(--text-xs, 12px)",
              }}
            >
              incomplete
            </span>
          )}
        </span>
      ),
    },
    {
      key: "species",
      header: "Pokémon",
      render: (r) => (
        <Chips
          testId={`teams-species-${r.id}`}
          items={r.species.map((s) => prettySlug(s))}
          empty="—"
        />
      ),
    },
    {
      key: "updated",
      header: "Updated",
      sortValue: (r) => r.updatedAt,
      render: (r) => (
        <span className="teams-browser__updated">{formatTimestamp(r.updatedAt)}</span>
      ),
    },
  ];

  const emptyMessage = loading
    ? "Loading teams…"
    : error
      ? "Could not load teams."
      : "No teams match this search.";

  const showDetail =
    selectedTeamId != null || detailLoading || (detailError != null && detailError !== "");

  return (
    <section className="admin-page teams-browser" data-testid="teams-browser">
      <h1 className="admin-page__title">Teams</h1>

      {/* Search + format filter (read-only query refinement, ADMIN-AC-10.1). */}
      <div
        className="teams-browser__filters"
        data-testid="teams-filters"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          gap: "var(--space-3, 12px)",
        }}
      >
        <label className="filter-bar__field filter-bar__field--search">
          <span className="filter-bar__label">Search</span>
          <input
            type="search"
            className="filter-bar__search"
            data-testid="teams-search"
            aria-label="Search teams by name"
            placeholder="Search team name…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
          />
        </label>
        <label className="filter-bar__field">
          <span className="filter-bar__label">Format</span>
          <select
            className="filter-bar__select"
            data-testid="teams-format"
            aria-label="Format"
            value={format}
            onChange={(e) => onFormatChange(e.target.value)}
          >
            <option value="">All formats</option>
            {FORMAT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {(query !== "" || format !== "") && (
          <button
            type="button"
            className="filter-bar__clear"
            data-testid="teams-clear"
            onClick={() => {
              onQueryChange("");
              onFormatChange("");
            }}
          >
            Clear
          </button>
        )}
      </div>

      {error != null && error !== "" && (
        <div
          className="teams-browser__error"
          data-testid="teams-error"
          role="alert"
          style={{
            marginTop: "var(--space-3, 12px)",
            padding: "var(--space-3, 12px) var(--space-4, 16px)",
            border: "1px solid var(--danger, #ee5a5a)",
            borderRadius: "var(--radius-md, 8px)",
            color: "var(--danger, #ee5a5a)",
            fontSize: "var(--text-sm, 13px)",
          }}
        >
          {error}
        </div>
      )}

      <DataTable
        columns={columns}
        rows={teams}
        rowKey={(r) => r.id}
        onRowClick={onSelectTeam}
        initialSort={{ key: "updated", dir: "desc" }}
        hasMore={hasMore}
        onLoadMore={onLoadMore}
        loadingMore={loadingMore}
        emptyMessage={emptyMessage}
        caption="Saved teams (all accounts)"
      />

      {showDetail && (
        <TeamDetailPanel
          detail={detail}
          loading={detailLoading}
          error={detailError}
          onClose={onCloseDetail}
        />
      )}
    </section>
  );
}
