"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import type { ComposerProps, PendingImage } from "@/components/types";
import {
  filesToPendingImages,
  MAX_ATTACHMENTS,
} from "@/lib/image-attachments";
import MentionAutocomplete, {
  type MentionTeam,
} from "./MentionAutocomplete";
import SlashAutocomplete, { type SlashPick } from "./SlashAutocomplete";
import { parseMentions } from "@/lib/chat/mentions";
import type { DexBind } from "@/lib/chat/slash-commands";
import { parseSlashCommand, slashArg } from "@/lib/chat/slash-commands";
import {
  EMPTY_DEX,
  EMPTY_TEAMS,
  EMPTY_TEAMS_GUEST,
  EMPTY_USAGE,
  bindStillValid,
  insertCommand,
  insertName,
  slashPickerPhase,
  type DexNameRow,
} from "@/lib/chat/slash-picker";
import { searchSlashDex, searchSlashUsage } from "@/lib/chat/slash-search";

/** Max auto-grow height (px) for the textarea before it starts scrolling. */
const MAX_INPUT_PX = 160;

/** Same window as EntityPicker — snappy without spamming GET /api/search. */
const SLASH_SEARCH_DEBOUNCE_MS = 150;

function leadingSlashToken(text: string): string {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("/")) return "";
  return /^\S+/.exec(trimmed)?.[0] ?? "";
}

function livingTeams(teams: MentionTeam[]): MentionTeam[] {
  return teams.filter((team) => {
    const format = "format" in team ? (team as { format?: string }).format : undefined;
    return format == null || format === "champions";
  });
}

/**
 * Composer — the chat input box. Chrome (opaque pill, fade-to-paper dock, no
 * blur) lives in globals.css; this file owns behavior only.
 *
 * Submits via `onSend(message, images)` (and optional `slashMeta` when a
 * Dex/Usage name is bound) and clears the field. A message is sendable when it has non-empty text OR at least one
 * attached image (an image-only "what is this?" upload). Images are picked (the
 * attach button) or pasted, downscaled + re-encoded client-side, shown as
 * removable thumbnails, and capped at {@link MAX_ATTACHMENTS}. While a turn is
 * streaming the input is disabled and Send becomes Stop (`onStop`). A new
 * `prefill` object reloads the text input (used to restore a stopped message).
 *
 * The field is a multi-line textarea that auto-grows up to {@link MAX_INPUT_PX}.
 * Enter submits and Shift+Enter inserts a newline on desktop; on touch devices
 * (coarse pointer) Enter always inserts a newline and Send is the only submit.
 */
/** `@Name` token just before the caret, if the user is mid-mention. */
function activeMention(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(before[at - 1]!)) return null;
  const query = before.slice(at + 1);
  if (query.includes("\n")) return null;
  return { start: at, query };
}

/** Fallback when the caret position is stale (jsdom `change` events). */
function mentionFromAt(
  text: string,
): { start: number; query: string } | null {
  const match = /(^|\s)@([^\s@]*)$/.exec(text);
  if (!match || match.index == null) return null;
  const at = text.lastIndexOf("@");
  return { start: at, query: match[2] ?? "" };
}

export default function Composer({
  onSend,
  disabled = false,
  streaming = false,
  onStop,
  prefill = null,
  onVoice,
  voiceReady = false,
  signedIn = false,
  teams = [],
}: ComposerProps & {
  /** Open voice mode; when absent the mic button is not rendered. The parent
   *  decides signed-in (open overlay) vs signed-out (sign-in nudge). */
  onVoice?: () => void;
  /** True when voice is available (signed in) — tunes the button's label. */
  voiceReady?: boolean;
  /** Signed-in @mention list (MEN-US-1). Guests omit this. */
  signedIn?: boolean;
  teams?: MentionTeam[];
}) {
  const [value, setValue] = useState("");
  const [caret, setCaret] = useState(0);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [deadMentions, setDeadMentions] = useState<string[]>([]);
  const [pickerDismissed, setPickerDismissed] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [nameRows, setNameRows] = useState<DexNameRow[]>([]);
  const [argReady, setArgReady] = useState(false);
  const [dexBind, setDexBind] = useState<DexBind | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastArgRowsRef = useRef<DexNameRow[]>([]);
  const lastArgCommandRef = useRef<"dex" | "usage" | null>(null);
  const lastArgQueryRef = useRef<string | null>(null);
  const searchGen = useRef(0);

  // Reload the input whenever the parent pushes a fresh `prefill` object (e.g.
  // restoring the message after a quick Stop / Undo). Keyed on object identity
  // so the same text can be re-applied across separate stops.
  useEffect(() => {
    if (prefill) {
      setValue(prefill.text);
      if ("images" in prefill && Array.isArray(prefill.images)) {
        setPendingImages(prefill.images);
      }
    }
  }, [prefill]);

  // Auto-grow the textarea to fit its content, capped at MAX_INPUT_PX (past
  // which it scrolls). Runs on every value change so typing, prefill, and the
  // post-send reset all re-measure. Collapsing to "auto" first lets it shrink
  // back down when text is deleted. A CSS min-height floors the single-line
  // case (and keeps jsdom, where scrollHeight is 0, at its resting height).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_PX)}px`;
  }, [value]);

  const slashPhase = slashPickerPhase(value);
  const slashVisible =
    !pickerDismissed &&
    (slashPhase.phase === "commands" || slashPhase.phase === "args");
  const leadingToken = leadingSlashToken(value);

  // Re-open the picker once the leading token changes after Escape / outside click.
  useEffect(() => {
    setPickerDismissed(false);
  }, [leadingToken]);

  // Drop a Dex/Usage bind if the argument text no longer matches the pick.
  useEffect(() => {
    if (!dexBind) return;
    const parsed = parseSlashCommand(value, { hasUsagePage: true });
    const arg = slashArg(value);
    const nameOk = arg.toLowerCase() === dexBind.displayName.toLowerCase();
    if (parsed.type === "navigate" && parsed.target === "dex" && nameOk) return;
    if (
      parsed.type === "navigate" &&
      parsed.target === "usage" &&
      dexBind.kind === "pokemon" &&
      nameOk
    ) {
      return;
    }
    setDexBind(null);
  }, [value, dexBind]);

  const argCommand = slashPhase.phase === "args" ? slashPhase.command : null;
  const argQuery = slashPhase.phase === "args" ? slashPhase.query : "";

  // Drop Dex/Usage rows when the arg command changes (dex↔usage). Do not
  // clear on every query keystroke — the in-flight list stays until the
  // next search lands.
  useEffect(() => {
    setNameRows([]);
    lastArgRowsRef.current = [];
    lastArgCommandRef.current = null;
    lastArgQueryRef.current = null;
  }, [argCommand]);

  // Debounced Dex / Usage name fan-out. Teams stay in-memory (no HTTP).
  useEffect(() => {
    if (argCommand !== "dex" && argCommand !== "usage") {
      setArgReady(true);
      return;
    }
    setArgReady(false);
    const gen = ++searchGen.current;
    const ac = new AbortController();
    const timer = window.setTimeout(() => {
      const run =
        argCommand === "dex"
          ? searchSlashDex(argQuery, ac.signal)
          : searchSlashUsage(argQuery, ac.signal);
      void run.then((rows) => {
        if (gen !== searchGen.current) return;
        setNameRows(rows);
        lastArgRowsRef.current = rows;
        lastArgCommandRef.current = argCommand;
        lastArgQueryRef.current = argQuery;
        setArgReady(true);
      });
    }, SLASH_SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [argCommand, argQuery]);

  const teamNameRows: DexNameRow[] =
    argCommand === "team" && signedIn
      ? livingTeams(teams)
          .filter((team) => {
            const needle = argQuery.trim().toLowerCase();
            return !needle || team.name.toLowerCase().includes(needle);
          })
          .slice(0, 8)
          .map((team) => ({
            kind: "pokemon",
            slug: team.id,
            displayName: team.name,
          }))
      : [];

  const pickerNames: DexNameRow[] =
    argCommand === "team"
      ? teamNameRows
      : argCommand === "dex" || argCommand === "usage"
        ? nameRows
        : [];
  const pickerEmpty =
    slashPhase.phase === "args"
      ? argCommand === "team" && !signedIn
        ? EMPTY_TEAMS_GUEST
        : argCommand === "team" && teamNameRows.length === 0
          ? EMPTY_TEAMS
          : argCommand === "dex" && argReady && nameRows.length === 0
            ? EMPTY_DEX
            : argCommand === "usage" && argReady && nameRows.length === 0
              ? EMPTY_USAGE
              : null
      : null;
  const pickerOptionsCount =
    slashPhase.phase === "commands"
      ? slashPhase.rows.length
      : pickerEmpty
        ? 0
        : pickerNames.length;

  useEffect(() => {
    setHighlightedIndex(pickerOptionsCount > 0 ? 0 : -1);
  }, [pickerOptionsCount, slashPhase.phase, argCommand, argQuery, leadingToken]);

  // Dismiss on pointer outside the picker (and not on a row). The composer
  // input itself is excluded so typing can continue after a click-to-focus.
  useEffect(() => {
    if (!slashVisible) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (inputRef.current?.contains(target)) return;
      if (
        target instanceof Element &&
        target.closest("[data-testid='slash-autocomplete']")
      ) {
        return;
      }
      setPickerDismissed(true);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [slashVisible]);

  // Keep the dock above the iOS on-screen keyboard. iOS does NOT shrink the
  // layout viewport (or dvh/svh) when the keyboard opens, so a `bottom:0` sticky
  // dock ends up hidden behind it. We measure the occluded height via
  // visualViewport and expose it as --kb-inset; the .composer rule translates
  // up by that amount. The whole thing is a no-op on desktop (no visualViewport
  // resize → inset stays 0 → identity transform).
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    // Touch only. On desktop, trackpad pinch-zoom shrinks visualViewport too, so
    // running this there would set --kb-inset > 0 and shove the sticky dock
    // off-screen. Gating on a coarse pointer keeps desktop fully inert.
    if (!window.matchMedia?.("(pointer: coarse)").matches) return;
    const root = document.documentElement;
    const update = () => {
      const occluded = Math.max(
        0,
        window.innerHeight - vv.height - vv.offsetTop,
      );
      root.style.setProperty("--kb-inset", `${occluded}px`);
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      root.style.removeProperty("--kb-inset");
    };
  }, []);

  // Decode + downscale picked/pasted files, capping the total at MAX_ATTACHMENTS
  // and surfacing any per-file decode failures (e.g. an unsupported HEIC).
  async function addFiles(files: File[]) {
    if (files.length === 0 || disabled) return;
    setAttachError(null);
    const room = Math.max(0, MAX_ATTACHMENTS - pendingImages.length);
    const accepted = files.slice(0, room);
    const overflow = files.length - accepted.length;
    const { images, errors } = await filesToPendingImages(accepted);
    if (images.length > 0) {
      setPendingImages((prev) =>
        [...prev, ...images].slice(0, MAX_ATTACHMENTS),
      );
    }
    const msgs = [...errors];
    if (overflow > 0)
      msgs.push(`You can attach up to ${MAX_ATTACHMENTS} images.`);
    if (msgs.length > 0) setAttachError(msgs.join(" "));
  }

  function handleFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : [];
    void addFiles(files);
    e.target.value = ""; // allow re-selecting the same file
  }

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of items) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault(); // don't also paste the image's name as text
      void addFiles(files);
    }
  }

  function removeImage(id: string) {
    setPendingImages((prev) => prev.filter((img) => img.id !== id));
    setAttachError(null);
  }

  function submit() {
    if (disabled) return;
    const trimmed = value.trim();
    if (trimmed.length === 0 && pendingImages.length === 0) return;
    if (signedIn) {
      const parsed = parseMentions(trimmed, teams);
      if (parsed.dead.length > 0) {
        setDeadMentions(parsed.dead);
        return;
      }
      setDeadMentions([]);
    }
    const bind = resolveSlashBind(trimmed);
    const argRows = cachedArgRows(trimmed);
    if (bind || argRows) {
      onSend(trimmed, pendingImages, {
        ...(bind ? { dexBind: bind } : {}),
        ...(argRows ? { argRows } : {}),
      });
    } else {
      onSend(trimmed, pendingImages);
    }
    setValue("");
    setPendingImages([]);
    setAttachError(null);
    setDexBind(null);
    setPickerDismissed(false);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    submit();
  }

  function applySlashPick(pick: SlashPick) {
    if (pick.type === "command") {
      setValue(insertCommand(pick.token));
      setDexBind(null);
      setPickerDismissed(false);
      return;
    }
    const command =
      slashPhase.phase === "args" ? slashPhase.command : "dex";
    setValue(insertName(`/${command}`, pick.row.displayName));
    if (command === "dex" || command === "usage") {
      setDexBind({
        kind: pick.row.kind,
        slug: pick.row.slug,
        displayName: pick.row.displayName,
      });
    } else {
      setDexBind(null);
    }
    setPickerDismissed(false);
  }

  function highlightedPick(): SlashPick | null {
    if (!slashVisible || highlightedIndex < 0) return null;
    if (slashPhase.phase === "commands") {
      const row = slashPhase.rows[highlightedIndex];
      return row ? { type: "command", token: row.token } : null;
    }
    if (slashPhase.phase === "args") {
      const row = pickerNames[highlightedIndex];
      return row ? { type: "name", row } : null;
    }
    return null;
  }

  function insertionFor(pick: SlashPick): string {
    if (pick.type === "command") return insertCommand(pick.token);
    const command =
      slashPhase.phase === "args" ? slashPhase.command : "dex";
    return insertName(`/${command}`, pick.row.displayName);
  }

  function cachedArgRows(text: string): DexNameRow[] | undefined {
    const parsed = parseSlashCommand(text, { hasUsagePage: true });
    if (parsed.type !== "navigate") return undefined;
    if (parsed.target !== "dex" && parsed.target !== "usage") return undefined;
    if (lastArgCommandRef.current !== parsed.target) return undefined;
    if (lastArgQueryRef.current !== slashArg(text)) return undefined;
    return lastArgRowsRef.current;
  }

  function resolveSlashBind(text: string): DexBind | undefined {
    const parsed = parseSlashCommand(text, { hasUsagePage: true });
    const arg = slashArg(text);
    if (dexBind) {
      if (parsed.type === "navigate" && parsed.target === "dex" && bindStillValid(dexBind, text)) {
        return dexBind;
      }
      if (
        parsed.type === "navigate" &&
        parsed.target === "usage" &&
        dexBind.kind === "pokemon" &&
        arg.toLowerCase() === dexBind.displayName.toLowerCase()
      ) {
        return dexBind;
      }
    }
    if (parsed.type !== "navigate" || !arg) return undefined;
    if (parsed.target === "dex") {
      const hit = lastArgRowsRef.current.find(
        (row) =>
          row.displayName.toLowerCase() === arg.toLowerCase() ||
          row.slug.toLowerCase() === arg.toLowerCase(),
      );
      return hit
        ? { kind: hit.kind, slug: hit.slug, displayName: hit.displayName }
        : undefined;
    }
    if (parsed.target === "usage") {
      const hit = lastArgRowsRef.current.find(
        (row) =>
          row.kind === "pokemon" &&
          (row.displayName.toLowerCase() === arg.toLowerCase() ||
            row.slug.toLowerCase() === arg.toLowerCase()),
      );
      return hit
        ? { kind: hit.kind, slug: hit.slug, displayName: hit.displayName }
        : undefined;
    }
    return undefined;
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (slashVisible) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (pickerOptionsCount === 0) return;
        setHighlightedIndex((index) => {
          const start = index < 0 ? -1 : index;
          return Math.min(start + 1, pickerOptionsCount - 1);
        });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (pickerOptionsCount === 0) return;
        setHighlightedIndex((index) => Math.max(index < 0 ? 0 : index - 1, 0));
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setPickerDismissed(true);
        return;
      }
    }
    if (e.key !== "Enter") return;
    // Shift+Enter always inserts a newline (the textarea default).
    if (e.shiftKey) return;
    // Don't submit mid-IME-composition (e.g. an unconfirmed CJK candidate);
    // the Enter is committing the candidate, not the message.
    if (e.nativeEvent.isComposing) return;
    // On touch devices the on-screen return key inserts a newline; Send is the
    // only way to submit. On desktop, a bare Enter sends.
    if (window.matchMedia?.("(pointer: coarse)").matches) return;
    e.preventDefault();
    if (slashVisible) {
      const pick = highlightedPick();
      if (pick) {
        const next = insertionFor(pick);
        if (next !== value) {
          applySlashPick(pick);
          return;
        }
      }
    }
    submit();
  }

  const atCapacity = pendingImages.length >= MAX_ATTACHMENTS;
  const nothingToSend = value.trim().length === 0 && pendingImages.length === 0;
  const mentionCaret = inputRef.current?.selectionStart ?? caret;
  const mention = signedIn
    ? (activeMention(value, mentionCaret) ??
      activeMention(value, value.length) ??
      mentionFromAt(value))
    : null;

  function insertMention(team: MentionTeam) {
    if (!mention) return;
    const before = value.slice(0, mention.start);
    const after = value.slice(mention.start + 1 + mention.query.length);
    const next = `${before}@${team.name} ${after}`;
    setValue(next);
    setCaret(before.length + team.name.length + 2);
    requestAnimationFrame(() => {
      const pos = before.length + team.name.length + 2;
      inputRef.current?.setSelectionRange(pos, pos);
      inputRef.current?.focus();
    });
  }

  return (
    <form className="composer" data-testid="composer" onSubmit={handleSubmit}>
      {pendingImages.length > 0 && (
        <div
          className="composer__attachments"
          data-testid="composer-attachments"
        >
          {pendingImages.map((img) => (
            <div key={img.id} className="composer__thumb">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="composer__thumb-img"
                src={img.previewUrl}
                alt={img.name}
              />
              <button
                type="button"
                className="composer__thumb-remove"
                onClick={() => removeImage(img.id)}
                aria-label={`Remove ${img.name}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {attachError && (
        <div className="composer__attach-error" role="alert">
          {attachError}
        </div>
      )}
      {deadMentions.length > 0 && (
        <div
          className="composer__dead"
          data-testid="mention-dead"
          role="alert"
        >
          Unknown team{" "}
          {deadMentions.map((token) => `@${token}`).join(", ")}. Fix or
          remove it to send.
        </div>
      )}
      <div
        className={
          "composer__field" +
          (streaming ? " composer__field--live" : "") +
          (deadMentions.length > 0 ? " composer__field--dead-mention" : "")
        }
      >
        <button
          className="composer__attach"
          data-testid="composer-attach"
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || atCapacity}
          aria-label="Attach an image"
          title={
            atCapacity
              ? `Up to ${MAX_ATTACHMENTS} images`
              : "Attach an image"
          }
        />
        <input
          ref={fileInputRef}
          className="composer__file-input"
          data-testid="composer-file-input"
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/*"
          multiple
          hidden
          onChange={handleFiles}
        />
        {onVoice && (
          <button
            className="composer__voice"
            data-testid="composer-voice"
            type="button"
            onClick={onVoice}
            // Never open voice mid-text-stream (the field is disabled then too).
            disabled={disabled || streaming}
            aria-label={voiceReady ? "Start voice mode" : "Sign in to use voice mode"}
            title={voiceReady ? "Talk to Oak" : "Sign in to use voice mode"}
          >
            <MicIcon />
          </button>
        )}
        <textarea
          ref={inputRef}
          className="composer__input"
          data-testid="composer-input"
          rows={1}
          enterKeyHint="enter"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setCaret(e.target.selectionStart ?? e.target.value.length);
            if (deadMentions.length > 0) setDeadMentions([]);
          }}
          aria-invalid={deadMentions.length > 0 || undefined}
          onSelect={(e) => {
            setCaret(e.currentTarget.selectionStart ?? 0);
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onFocus={() => {
            // Fallback for browsers without visualViewport handling: nudge the
            // field into view once the keyboard has had a moment to open.
            setTimeout(
              () => inputRef.current?.scrollIntoView?.({ block: "center" }),
              100,
            );
          }}
          placeholder="Ask Oak"
          aria-label="Ask Oak"
          disabled={disabled}
        />
        {streaming ? (
          <button
            className="composer__stop"
            data-testid="composer-stop"
            type="button"
            onClick={onStop}
            aria-label="Stop the current response"
          >
            Stop
          </button>
        ) : (
          <button
            className="composer__send"
            data-testid="composer-send"
            type="submit"
            disabled={disabled || nothingToSend}
          >
            Send
          </button>
        )}
      </div>
      {slashVisible && (
        <SlashAutocomplete
          commands={
            slashPhase.phase === "commands" ? slashPhase.rows : undefined
          }
          names={
            slashPhase.phase === "args" && pickerNames.length > 0
              ? pickerNames
              : undefined
          }
          empty={slashPhase.phase === "args" ? pickerEmpty : null}
          guest={!signedIn}
          highlightedIndex={highlightedIndex}
          showKind={argCommand !== "team"}
          onPick={applySlashPick}
        />
      )}
      {mention && !slashVisible && (
        <MentionAutocomplete
          query={mention.query}
          teams={teams}
          onSelect={insertMention}
        />
      )}
    </form>
  );
}

/** Microphone glyph for the voice-mode button. */
function MicIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x={9} y={2} width={6} height={12} rx={3} />
      <path d="M5 10a7 7 0 0 0 14 0M12 17v5" />
    </svg>
  );
}
