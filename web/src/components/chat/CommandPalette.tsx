"use client";

/**
 * CommandPalette — web ⌘K overlay (NAV-US-1, ADR-10). Native has none.
 */

import { useEffect, useMemo, useRef } from "react";

export interface PaletteConversation {
  id: string;
  title: string;
}

export interface PaletteTeam {
  id: string;
  name: string;
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  signedIn: boolean;
  query?: string;
  onQueryChange?: (q: string) => void;
  conversations?: PaletteConversation[];
  teams?: PaletteTeam[];
  onNewChat: () => void;
  onOpenConversation?: (id: string) => void;
  onOpenDex: (q?: string) => void;
  onOpenTeam?: (id?: string) => void;
  onOpenUsage: () => void;
}

function matches(haystack: string, needle: string): boolean {
  if (!needle) return true;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

export default function CommandPalette({
  open,
  onClose,
  signedIn,
  query = "",
  onQueryChange,
  conversations = [],
  teams = [],
  onNewChat,
  onOpenConversation,
  onOpenDex,
  onOpenTeam,
  onOpenUsage,
}: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const q = query.trim();
  const showNew = matches("new chat", q);
  const showDex = matches("dex pokedex", q);
  const showUsage = matches("usage meta", q);
  const convoHits = useMemo(
    () =>
      signedIn
        ? conversations.filter((c) => matches(c.title, q))
        : [],
    [signedIn, conversations, q],
  );
  const teamHits = useMemo(
    () => (signedIn ? teams.filter((t) => matches(t.name, q)) : []),
    [signedIn, teams, q],
  );

  if (!open) return null;

  function run(fn: () => void) {
    fn();
    onClose();
  }

  return (
    <div className="cmd-palette-backdrop" onClick={onClose}>
      <div
        className="cmd-palette"
        data-testid="command-palette"
        role="listbox"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="cmd-palette__input"
          type="search"
          value={query}
          onChange={(e) => onQueryChange?.(e.target.value)}
          placeholder="Jump to…"
          aria-label="Filter commands"
        />
        <div className="cmd-palette__list">
          {showNew && (
            <button
              type="button"
              role="option"
              className="cmd-palette__option"
              onClick={() => run(onNewChat)}
            >
              New chat
            </button>
          )}
          {showDex && (
            <button
              type="button"
              role="option"
              className="cmd-palette__option"
              onClick={() => run(() => onOpenDex(q || undefined))}
            >
              Pokédex
            </button>
          )}
          {showUsage && (
            <button
              type="button"
              role="option"
              className="cmd-palette__option"
              onClick={() => run(onOpenUsage)}
            >
              Usage / Meta
            </button>
          )}
          {convoHits.map((c) => (
            <button
              key={c.id}
              type="button"
              role="option"
              className="cmd-palette__option"
              onClick={() => run(() => onOpenConversation?.(c.id))}
            >
              {c.title}
            </button>
          ))}
          {teamHits.map((t) => (
            <button
              key={t.id}
              type="button"
              role="option"
              className="cmd-palette__option"
              onClick={() => run(() => onOpenTeam?.(t.id))}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
