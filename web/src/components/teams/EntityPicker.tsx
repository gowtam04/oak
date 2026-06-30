/**
 * EntityPicker — the team builder's reusable autocomplete field.
 *
 * Replaces the old free-text "type a slug" inputs: it keeps a plain text
 * `<input>` (so the field stays fully editable and every existing `data-testid`
 * / onChange contract is preserved — a typed value is committed verbatim as the
 * slug on each keystroke) and layers a suggestion dropdown on top.
 *
 * Two suggestion sources:
 *   - `kind` set     → debounced `searchEntities(kind, q, format)` over the
 *                      format index (species / move / ability / item).
 *   - `options` set  → a static, locally-filtered list (natures / tera types).
 *
 * Selecting a suggestion commits its canonical **slug** via `onChange` (the
 * dropdown shows the friendly display name + optional hint/sprite). Keyboard:
 * ↑/↓ move the active row, Enter selects it, Escape closes. Rows use
 * `onMouseDown(preventDefault)` so a click selects before the input blurs.
 */

"use client";

import { useEffect, useId, useRef, useState } from "react";

import { searchEntities, type EntityKind } from "@/lib/api/search-client";
import type { Format } from "@/data/formats";
import { showdownAniSprite, showdownSpriteId } from "@/lib/sprites";
import type { PickerOption } from "./dex-constants";

export interface EntityPickerProps {
  /** Entity kind to search; omit when supplying a static `options` list. */
  kind?: EntityKind;
  format: Format;
  /** Current value (a slug; "" when empty). */
  value: string;
  /** Commit a new value (raw typed text or a selected suggestion's slug). */
  onChange: (value: string) => void;
  placeholder?: string;
  /** Test id + dom id forwarded to the inner input. */
  testid?: string;
  inputId?: string;
  ariaLabel?: string;
  /** Static option list (disables network search). */
  options?: PickerOption[];
  /** Render a sprite thumbnail per row (species pickers). */
  withSprite?: boolean;
  disabled?: boolean;
}

/** Debounce window for network search — snappy without spamming the endpoint. */
const DEBOUNCE_MS = 150;

/** A sprite thumbnail that quietly removes itself if the CDN 404s. */
function SpriteThumb({ slug }: { slug: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) return <span className="entity-picker__thumb entity-picker__thumb--empty" aria-hidden />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- external CDN sprite, not a static asset
    <img
      className="entity-picker__thumb"
      src={showdownAniSprite(showdownSpriteId(slug, null))}
      alt=""
      aria-hidden
      loading="lazy"
      onError={() => setOk(false)}
    />
  );
}

export default function EntityPicker({
  kind,
  format,
  value,
  onChange,
  placeholder,
  testid,
  inputId,
  ariaLabel,
  options,
  withSprite = false,
  disabled = false,
}: EntityPickerProps) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<PickerOption[]>([]);
  const [active, setActive] = useState(-1);
  const reqId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listboxId = useId();

  // Tear down any pending debounce on unmount.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function runSearch(q: string) {
    const query = q.trim();
    setActive(-1);
    if (timer.current) clearTimeout(timer.current);

    // Static list — filter locally, no network.
    if (options) {
      const lower = query.toLowerCase();
      const filtered =
        lower.length === 0
          ? options
          : options.filter(
              (o) =>
                o.display_name.toLowerCase().includes(lower) ||
                o.slug.toLowerCase().includes(lower),
            );
      setResults(filtered);
      return;
    }

    // Network search — debounced, with a stale-response guard.
    if (!kind || query.length === 0) {
      setResults([]);
      return;
    }
    const id = ++reqId.current;
    timer.current = setTimeout(() => {
      void searchEntities(kind, query, format).then((matches) => {
        if (id !== reqId.current) return;
        setResults(
          matches.map((m) => ({ slug: m.slug, display_name: m.display_name })),
        );
      });
    }, DEBOUNCE_MS);
  }

  function select(option: PickerOption) {
    onChange(option.slug);
    setOpen(false);
    setActive(-1);
  }

  function onInputChange(next: string) {
    onChange(next);
    setOpen(true);
    runSearch(next);
  }

  function onFocus() {
    setOpen(true);
    runSearch(value);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        runSearch(value);
      }
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === "Enter") {
      if (open && active >= 0 && active < results.length) {
        e.preventDefault();
        select(results[active]!);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.stopPropagation();
        setOpen(false);
      }
    }
  }

  const showDropdown = open && results.length > 0;

  return (
    <div className="entity-picker">
      <input
        className="entity-picker__input"
        id={inputId}
        data-testid={testid}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={showDropdown}
        aria-autocomplete="list"
        aria-controls={listboxId}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onInputChange(e.target.value)}
        onFocus={onFocus}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {showDropdown && (
        <ul
          className="entity-picker__list"
          id={listboxId}
          role="listbox"
          data-testid={testid ? `${testid}-list` : undefined}
        >
          {results.map((option, i) => (
            <li
              key={`${option.slug}-${i}`}
              role="option"
              aria-selected={i === active}
              className={
                "entity-picker__option" +
                (i === active ? " entity-picker__option--active" : "")
              }
              // Select before the input's blur fires.
              onMouseDown={(e) => {
                e.preventDefault();
                select(option);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {withSprite && <SpriteThumb slug={option.slug} />}
              <span className="entity-picker__option-name">
                {option.display_name}
              </span>
              {option.hint && (
                <span className="entity-picker__option-hint">{option.hint}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
