/**
 * ArtifactViewer — the panel shell (B-4, Phase 5). Renders the open artifact
 * (top of the back-stack): a header (title, format/generation tag, back,
 * close) and a body that dispatches by view type and load state. Hidden when
 * nothing is open (the chat reflows to full width, AV-US-7).
 *
 * Honest states throughout (BR-AV-5, AV-US-11): loading, transport error,
 * `not_found` (+ suggestions), and `unavailable` each render a clear message
 * rather than a blank or a crash. Esc closes (NFR-4).
 */

"use client";

import { useEffect, useRef, useState } from "react";

import CaveatStrip from "@/components/answer-card/CaveatStrip";
import AddToTeamPicker from "@/components/teams/AddToTeamPicker";
import EntityPicker from "@/components/teams/EntityPicker";
import { blankMember } from "@/data/teams/place-on-team";
import { FORMATS, isFormat, type Format } from "@/data/formats";
import { createPinnedArtifact } from "@/lib/api/artifact-pin-client";
import { fetchEntityArtifact } from "@/lib/api/entity-client";
import type { EntityArtifactOk } from "@/lib/entity-artifact";
import {
  plateFromSubjects,
  plateFromTypes,
  type PlateVars,
} from "@/lib/plate-types";
import type { Subject } from "@/agent/schemas";
import {
  diffPokemonProfiles,
  type PokemonCompareProfile,
} from "@/lib/pokemon-compare";

import { useArtifactViewer } from "./useArtifactViewer";
import type { ArtifactView } from "./types";
import ArtifactSources from "./ArtifactSources";
import PokemonArtifact from "./PokemonArtifact";
import MoveArtifact from "./MoveArtifact";
import AbilityArtifact from "./AbilityArtifact";
import ItemArtifact from "./ItemArtifact";
import TypeMatchupsArtifact from "./TypeMatchupsArtifact";
import ComparisonArtifact from "./ComparisonArtifact";
import DamageCalcArtifact from "./DamageCalcArtifact";
import TeamArtifact from "./TeamArtifact";

const DEX_PATH: Record<"pokemon" | "move" | "ability" | "item", string> = {
  pokemon: "/pokedex",
  move: "/moves",
  ability: "/abilities",
  item: "/items",
};

function dexHref(
  kind: "pokemon" | "move" | "ability" | "item",
  slug: string,
  format: string,
): string {
  return `${DEX_PATH[kind]}/${encodeURIComponent(slug)}?format=${encodeURIComponent(format)}`;
}

/**
 * Specimen-plate wash for the artifact shell (soul.md Phase 2 — continuation
 * of the answer plate, not a second product). Typed when types are known;
 * ink for mechanics / loading / ability / item.
 */
function plateForView(view: ArtifactView): PlateVars {
  if (view.type === "structured") {
    if (view.artifact.kind === "comparison") {
      return plateFromSubjects(view.artifact.subjects);
    }
    return plateFromTypes([]);
  }

  if (view.type === "team") {
    const refs = view.spriteRefs;
    if (!refs) return plateFromTypes([]);
    const members = view.detail?.members ?? [];
    const typeLists = members
      .map((m) => (m.species ? refs[m.species]?.types : undefined))
      .filter((t): t is string[] => Array.isArray(t) && t.length > 0);
    if (typeLists.length === 0) return plateFromTypes([]);
    if (typeLists.length === 1) return plateFromTypes(typeLists[0]!);
    return plateFromSubjects(typeLists.map((types) => ({ types })));
  }

  // Entity view.
  if (view.phase === "done" && view.response?.status === "ok") {
    const r = view.response;
    switch (r.kind) {
      case "pokemon":
        return plateFromTypes(r.data.types);
      case "move":
        return plateFromTypes([r.data.type]);
      case "type":
        return plateFromTypes(r.data.types);
      default:
        return plateFromTypes([]);
    }
  }
  return plateFromTypes([]);
}

function formatLabel(format: string): string {
  if (format === "champions") return "Champions";
  if (format === "scarlet-violet") return "Scarlet/Violet";
  if (format === "national-dex") return "National Dex";
  if (format.startsWith("gen-")) return `Gen ${format.slice("gen-".length)}`;
  return format;
}

interface HeaderInfo {
  title: string;
  formatTag: string;
}

function headerFor(view: ArtifactView): HeaderInfo {
  if (view.type === "team") {
    const name = view.detail?.name || view.title;
    return {
      title: name,
      formatTag: formatLabel(view.format),
    };
  }
  if (view.type === "structured") {
    if (view.artifact.kind === "comparison") {
      return {
        title: "Comparison",
        formatTag: formatLabel(view.artifact.format),
      };
    }
    return {
      title: "Damage calculation",
      formatTag: formatLabel(view.artifact.format),
    };
  }
  // Entity view.
  if (view.phase === "done" && view.response?.status === "ok") {
    return {
      title: view.response.resolved.display_name,
      formatTag: view.response.generation,
    };
  }
  return {
    title: view.request.q,
    formatTag: formatLabel(view.request.format),
  };
}

function EntityRenderer({
  response,
}: {
  response: EntityArtifactOk;
}): React.JSX.Element {
  switch (response.kind) {
    case "pokemon":
      return <PokemonArtifact data={response.data} />;
    case "move":
      return <MoveArtifact data={response.data} />;
    case "ability":
      return <AbilityArtifact data={response.data} />;
    case "item":
      return <ItemArtifact data={response.data} />;
    case "type":
      return <TypeMatchupsArtifact data={response.data} />;
  }
}

function profileFromPokemonOk(
  response: Extract<EntityArtifactOk, { kind: "pokemon" }>,
): PokemonCompareProfile {
  const data = response.data;
  const matchups = data.matchups;
  return {
    format: response.format,
    name: data.display_name,
    types: data.types,
    abilities: {
      slot1: data.abilities.slot1,
      slot2: data.abilities.slot2 ?? null,
      hidden: data.abilities.hidden ?? null,
    },
    stats: data.base_stats,
    movepool: data.movepool.flatMap((group) =>
      group.moves.map((move) => move.slug),
    ),
    matchups: {
      defensive: {
        weak_to: matchups.weak_to ?? [],
        resists: matchups.resists ?? [],
        immune_to: matchups.immune_to ?? [],
      },
      offensive: {
        super_effective_against: [],
        not_very_effective_against: [],
        no_effect_against: [],
      },
    },
  };
}

function ArtifactBody({
  view,
  signedIn,
}: {
  view: ArtifactView;
  signedIn: boolean;
}): React.JSX.Element {
  const { openEntity } = useArtifactViewer();

  if (view.type === "structured") {
    return view.artifact.kind === "comparison" ? (
      <ComparisonArtifact
        subjects={view.artifact.subjects}
        signedIn={signedIn}
        diff={view.artifact.diff}
      />
    ) : (
      <DamageCalcArtifact damageCalc={view.artifact.damageCalc} />
    );
  }

  if (view.type === "team") {
    if (view.phase === "loading") {
      return (
        <div className="artifact-viewer__loading" data-testid="artifact-loading">
          <span className="artifact-viewer__spinner" aria-hidden />
          <span>Loading…</span>
        </div>
      );
    }
    if (view.phase === "error" || view.detail === null) {
      return (
        <div className="artifact-viewer__state" data-testid="artifact-error">
          Couldn’t load this team. It may have been deleted.
        </div>
      );
    }
    return <TeamArtifact view={view} />;
  }

  if (view.phase === "loading") {
    return (
      <div className="artifact-viewer__loading" data-testid="artifact-loading">
        <span className="artifact-viewer__spinner" aria-hidden />
        <span>Loading…</span>
      </div>
    );
  }

  if (view.phase === "error" || view.response === null) {
    return (
      <div className="artifact-viewer__state" data-testid="artifact-error">
        Couldn’t load this. Please try again.
      </div>
    );
  }

  const { response } = view;
  if (response.status === "unavailable") {
    return (
      <div
        className="artifact-viewer__state"
        data-testid="artifact-unavailable"
      >
        Data isn’t available for this format right now.
      </div>
    );
  }
  if (response.status === "not_found") {
    return (
      <div className="artifact-viewer__state" data-testid="artifact-not-found">
        <p>No match found for “{response.query}”.</p>
        {response.suggestions.length > 0 && (
          <p className="artifact-viewer__suggestions">
            Did you mean:{" "}
            {response.suggestions.map((s, i) => (
              <span key={s}>
                {i > 0 && ", "}
                <button
                  type="button"
                  className="artifact-viewer__suggestion"
                  data-testid="artifact-suggestion"
                  onClick={() => openEntity({ kind: response.kind, q: s })}
                >
                  {s}
                </button>
              </span>
            ))}
            ?
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      {response.source_format ? (
        // Cross-scope National-Dex fallback (#2): the requested scope had no
        // exact match, so this profile came from National Dex. Reuse the
        // fallback-banner styling to say so honestly.
        <CaveatStrip
          uncertaintyFlags={[]}
          generationBasis={{
            generation: response.generation,
            fallback: true,
            note: `Not found in ${formatLabel(
              view.request.format,
            )} — showing National Dex data.`,
          }}
        />
      ) : (
        response.is_fallback && (
          <CaveatStrip
            uncertaintyFlags={[]}
            generationBasis={{
              generation: response.generation,
              fallback: true,
              note: response.fallback_note,
            }}
          />
        )
      )}
      <EntityRenderer response={response} />
      <ArtifactSources citations={response.citations} />
    </>
  );
}

export default function ArtifactViewer({
  signedIn = false,
  conversationId,
  onPinResult,
}: {
  signedIn?: boolean;
  conversationId?: string;
  onPinResult?: (
    result:
      | { ok: true; pins: import("@/lib/api/artifact-pin-client").PinnedArtifactSummary[] }
      | { ok: false; error: "pin_cap" },
  ) => void;
} = {}): React.JSX.Element | null {
  const { isOpen, current, canGoBack, back, close, openStructured } =
    useArtifactViewer();
  const panelRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [pinCap, setPinCap] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareQ, setCompareQ] = useState("");
  const [compareFormat, setCompareFormat] = useState<Format | "">("");
  const [compareError, setCompareError] = useState<string | null>(null);

  // Are we in the full-screen-overlay regime (mirrors the CSS 768px breakpoint)?
  // There the panel is a modal dialog; on desktop it's a docked complementary
  // panel that must leave the chat scrollable/focusable.
  const [isMobileOverlay, setIsMobileOverlay] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(max-width: 768px)");
    if (!mq) return;
    const update = () => setIsMobileOverlay(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  // Focus capture/restore keyed on isOpen ALONE, so flipping the mobile/desktop
  // regime mid-open (a resize/rotation) never yanks focus out of the still-open
  // panel. Capture on open; restore to the opener only on an actual close.
  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    return () => {
      previousFocusRef.current?.focus?.();
    };
  }, [isOpen]);

  // Modal behavior for the mobile overlay only: lock the page behind it (so iOS
  // can't scroll the hidden chat), move focus in, and trap Tab so keyboard/AT
  // focus can't escape onto the obscured chat.
  useEffect(() => {
    if (!isOpen || !isMobileOverlay) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = panelRef.current;
    panel?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab" || !panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      // Treat "focus is on the panel container itself (not among focusables)" as
      // an edge to wrap from — otherwise the first Shift+Tab right after open
      // (focus sits on the tabIndex=-1 <aside>) escapes onto the chat behind.
      const inTrap = Array.prototype.includes.call(
        focusables,
        document.activeElement,
      );
      if (e.shiftKey && (document.activeElement === first || !inTrap)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inTrap)) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, isMobileOverlay]);

  if (!isOpen || !current) return null;

  const { title, formatTag } = headerFor(current);
  const plate = plateForView(current);
  const plateClass = ["artifact-viewer", plate.className]
    .filter(Boolean)
    .join(" ");

  const entityOk =
    current.type === "entity" &&
    current.phase === "done" &&
    current.response?.status === "ok"
      ? current.response
      : null;
  const dexKind =
    entityOk &&
    (entityOk.kind === "pokemon" ||
      entityOk.kind === "move" ||
      entityOk.kind === "ability" ||
      entityOk.kind === "item")
      ? entityOk.kind
      : null;
  const showCompare = entityOk?.kind === "pokemon";
  const showAdd = signedIn && entityOk?.kind === "pokemon";
  const pinKind =
    current.type === "team"
      ? "team_sheet"
      : current.type === "structured" && current.artifact.kind === "comparison"
        ? "comparison"
        : current.type === "structured" && current.artifact.kind === "damage-calc"
          ? "calc"
          : null;
  const showPin = signedIn && pinKind !== null && Boolean(conversationId);

  async function handlePin() {
    if (!conversationId || !pinKind || !current) return;
    const snapshot =
      current.type === "structured"
        ? current.artifact
        : current.type === "team"
          ? { team: current.detail, title: current.title }
          : current;
    const result = await createPinnedArtifact(conversationId, {
      kind: pinKind,
      title,
      snapshot,
    });
    if (!result.ok && result.error === "pin_cap") {
      setPinCap(true);
      onPinResult?.({ ok: false, error: "pin_cap" });
    } else if (result.ok) {
      setPinCap(false);
      onPinResult?.({ ok: true, pins: result.pinnedArtifacts });
    }
  }

  async function handleCompare() {
    if (!entityOk || entityOk.kind !== "pokemon") return;
    const q = compareQ.trim();
    if (!q) return;
    const fmt: Format = isFormat(compareFormat)
      ? compareFormat
      : (entityOk.format as Format);
    const other = await fetchEntityArtifact("pokemon", q, fmt);
    if (!other || other.status !== "ok" || other.kind !== "pokemon") {
      setCompareError("Couldn’t resolve that Pokémon.");
      return;
    }
    const left: Subject = {
      name: entityOk.data.display_name,
      types: entityOk.data.types as Subject["types"],
      sprite_url: entityOk.data.sprite_url,
      dex_number: entityOk.data.national_dex_number,
      is_fallback: entityOk.is_fallback,
    };
    const right: Subject = {
      name: other.data.display_name,
      types: other.data.types as Subject["types"],
      sprite_url: other.data.sprite_url,
      dex_number: other.data.national_dex_number,
      is_fallback: other.is_fallback,
    };
    setCompareOpen(false);
    setCompareError(null);
    const diff = diffPokemonProfiles(
      profileFromPokemonOk(entityOk),
      profileFromPokemonOk(other),
    );
    openStructured({ kind: "comparison", subjects: [left, right], diff });
  }

  return (
    <aside
      ref={panelRef}
      className={plateClass}
      style={plate.style}
      data-testid="artifact-viewer"
      data-plate={plate.kind}
      role={isMobileOverlay ? "dialog" : "complementary"}
      aria-modal={isMobileOverlay || undefined}
      aria-label="Artifact viewer"
      tabIndex={-1}
    >
      <header className="artifact-viewer__header">
        <div className="artifact-viewer__topline">
          {canGoBack && (
            <button
              type="button"
              className="artifact-viewer__btn artifact-viewer__back"
              data-testid="artifact-back"
              onClick={back}
            >
              ← Back
            </button>
          )}
          <h2 className="artifact-viewer__title" data-testid="artifact-title">
            {title}
          </h2>
          <div className="artifact-viewer__control-actions">
            <button
              type="button"
              className="artifact-viewer__btn artifact-viewer__close"
              data-testid="artifact-close"
              aria-label="Close artifact viewer"
              onClick={close}
            >
              ✕
            </button>
          </div>
        </div>
        <span
          className="artifact-viewer__format-tag ilabel"
          data-testid="artifact-format-tag"
        >
          {formatTag}
        </span>
        <div className="artifact-viewer__verbs">
          {dexKind && entityOk && (
            <a
              className="artifact-viewer__verb"
              href={dexHref(
                dexKind,
                entityOk.resolved.slug,
                current.type === "entity"
                  ? current.request.format
                  : entityOk.format,
              )}
            >
              Open in Dex
            </a>
          )}
          {showCompare && (
            <button
              type="button"
              className="artifact-viewer__verb"
              onClick={() => {
                setCompareOpen((o) => !o);
                setCompareError(null);
              }}
            >
              Compare with…
            </button>
          )}
          {showAdd && entityOk && (
            <button
              type="button"
              className="artifact-viewer__verb"
              onClick={() => setAddOpen(true)}
            >
              Add to team
            </button>
          )}
          {showPin && (
            <button
              type="button"
              className="artifact-viewer__verb"
              onClick={() => void handlePin()}
            >
              Pin
            </button>
          )}
        </div>
        {pinCap && (
          <p className="artifact-viewer__cap" data-testid="pin-cap-message">
            You can pin 5 artifacts on this conversation. Unpin one to add
            another.
          </p>
        )}
        {compareOpen && entityOk && (
          <div className="artifact-viewer__compare">
            <EntityPicker
              kind="pokemon"
              format={
                isFormat(compareFormat)
                  ? compareFormat
                  : (entityOk.format as Format)
              }
              value={compareQ}
              onChange={setCompareQ}
              placeholder="Other species"
              ariaLabel="Compare with species"
              withSprite
            />
            <label className="artifact-viewer__compare-format">
              Scope
              <select
                value={compareFormat}
                onChange={(e) =>
                  setCompareFormat(
                    isFormat(e.target.value) ? e.target.value : "",
                  )
                }
              >
                <option value="">Same scope</option>
                {FORMATS.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="artifact-viewer__verb"
              onClick={() => void handleCompare()}
            >
              Compare
            </button>
            {compareError && <p>{compareError}</p>}
          </div>
        )}
      </header>

      <div className="artifact-viewer__body" data-testid="artifact-viewer-body">
        <ArtifactBody view={current} signedIn={signedIn} />
      </div>
      {addOpen && entityOk?.kind === "pokemon" && (
        <AddToTeamPicker
          incoming={{
            ...blankMember(),
            species: entityOk.resolved.slug,
          }}
          format={
            current.type === "entity" ? current.request.format : entityOk.format
          }
          onClose={() => setAddOpen(false)}
        />
      )}
    </aside>
  );
}
