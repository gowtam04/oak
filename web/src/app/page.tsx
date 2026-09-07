"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSseClient } from "@/lib/sse/sse-client";
import { useScreenWakeLock } from "@/lib/hooks/use-screen-wake-lock";
import ChatThread from "@/components/chat/ChatThread";
import Composer from "@/components/chat/Composer";
import CommandPalette from "@/components/chat/CommandPalette";
import ShortcutOverlay from "@/components/chat/ShortcutOverlay";
import ThemeToggle from "@/components/controls/ThemeToggle";
import AuthMenu from "@/components/auth/AuthMenu";
import AuthDialog from "@/components/auth/AuthDialog";
import ConversationList from "@/components/history/ConversationList";
import AppNav from "@/components/nav/AppNav";
import SidebarToggle from "@/components/controls/SidebarToggle";
import OakWordmark from "@/components/brand/OakWordmark";
import ScopeChip from "@/components/controls/ScopeChip";
import VoiceOverlay from "@/components/voice/VoiceOverlay";
import SavedTeamAutoOpen from "@/components/teams/SavedTeamAutoOpen";
import LandingSection from "@/components/landing/LandingSection";
import { ArtifactViewerProvider } from "@/components/artifact/ArtifactViewerProvider";
import ArtifactViewer from "@/components/artifact/ArtifactViewer";
import { useArtifactViewer } from "@/components/artifact/useArtifactViewer";
import PinnedArtifactStrip from "@/components/artifact/PinnedArtifactStrip";
import CalculatorOverlay from "@/components/calc/CalculatorOverlay";
import PlateTuner from "@/components/dev/PlateTuner";
import OrbPlayground from "@/components/dev/OrbPlayground";
import {
  deletePinnedArtifact,
  getPinnedArtifact,
  type PinnedArtifactSummary,
} from "@/lib/api/artifact-pin-client";
import type { CalcScenario } from "@/lib/calc/calc-schema";
import { fetchMe, type MeResult } from "@/lib/api/auth-client";
import { useConversations } from "@/lib/hooks/use-conversations";
import { useTeams } from "@/lib/hooks/use-teams";
import {
  exportConversation,
  forkConversation,
  getConversation,
  importConversation,
  listConversations,
  setMessagePinned,
  type ConversationSummary,
  type ExportFormat,
} from "@/lib/api/history-client";
import { listTeams, type TeamSummary } from "@/lib/api/teams-client";
import { createShare } from "@/lib/api/share-client";
import { parseSlashCommand } from "@/lib/chat/slash-commands";
import type { FollowUpChip } from "@/lib/chat/follow-up-chips";
import { parseMentions } from "@/lib/chat/mentions";
import { isFormat, type Format } from "@/data/formats";
import { scopeLabel } from "@/lib/scope/scope-label";
import type {
  ChatStatus,
  ChatTurn,
  DamageCalc,
  OakAnswer,
  PendingImage,
  SavedTeam,
} from "@/components/types";

const CALC_SCENARIO_KEY = "oak-calc-scenario";
const CALC_EXPLAIN_KEY = "oak-calc-explain";
const GUEST_DENSITY_KEY = "oak-answer-density";

function readGuestDensity(): "full" | "compact" {
  try {
    const value = window.localStorage.getItem(GUEST_DENSITY_KEY);
    return value === "compact" ? "compact" : "full";
  } catch {
    return "full";
  }
}

function ArtifactPinHost({
  signedIn,
  conversationId,
  pins,
  capError,
  onUnpin,
}: {
  signedIn: boolean;
  conversationId: string;
  pins: PinnedArtifactSummary[];
  capError: boolean;
  onUnpin: (id: string) => void;
}) {
  const { openStructured, openTeam } = useArtifactViewer();
  return (
    <PinnedArtifactStrip
      signedIn={signedIn}
      pins={pins}
      capError={capError}
      onOpen={(pin) => {
        void getPinnedArtifact(conversationId, pin.id).then((full) => {
          if (!full) return;
          const snap = full.snapshot as Record<string, unknown> | null;
          if (!snap) return;
          if (full.kind === "comparison") {
            const subjects = (snap.subjects ??
              (snap.kind === "comparison" ? snap.subjects : null)) as
              | import("@/components/types").OakAnswer["subjects"]
              | undefined;
            if (subjects) openStructured({ kind: "comparison", subjects });
            return;
          }
          if (full.kind === "calc") {
            const damageCalc = (snap.damageCalc ??
              (snap.kind === "damage-calc" ? snap.damageCalc : null)) as
              | DamageCalc
              | undefined;
            if (damageCalc) {
              openStructured({ kind: "damage-calc", damageCalc });
            }
            return;
          }
          const team = (snap.team ?? snap) as {
            name?: string;
            format?: string;
            members?: import("@/data/teams/team-schema").TeamMember[];
          };
          if (team?.name && team.format && Array.isArray(team.members)) {
            openTeam({
              team: {
                name: team.name,
                format: team.format,
                members: team.members,
              },
            });
          }
        });
      }}
      onUnpin={onUnpin}
    />
  );
}

function scenarioFromDamageCalc(
  calc: DamageCalc,
  format: Format,
): CalcScenario {
  const a = calc.assumptions as Record<string, unknown>;
  const species = (key: string) =>
    typeof a[key] === "string" ? (a[key] as string) : undefined;
  const move = species("move");
  return {
    format,
    attacker: {
      species: species("attacker"),
      level: typeof a.level === "number" ? a.level : undefined,
      nature: species("nature"),
    },
    defender: {
      species: species("defender"),
      level: typeof a.level === "number" ? a.level : undefined,
    },
    move: { slug: move, name: move },
  };
}

/** localStorage key for the persisted history-sidebar collapsed choice. */
const SIDEBAR_STORAGE_KEY = "oak-sidebar-collapsed";

/** DOM id of the history sidebar — the toggle's `aria-controls` target. */
const SIDEBAR_ID = "history-sidebar";

/** A request stopped within this many ms of being sent wipes the chat. */
const QUICK_STOP_MS = 2000;

/** Undo-send window on the just-sent user bubble (REC-US-3, ADR-3). */
const UNDO_MS = 3000;

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function slashArg(text: string): string {
  const trimmed = text.trim();
  const space = trimmed.search(/\s/);
  return space === -1 ? "" : trimmed.slice(space).trim();
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function downloadExport(file: {
  bytes: Uint8Array;
  filename: string;
}): void {
  const blob = new Blob([file.bytes as BlobPart], {
    type: file.filename.endsWith(".pdf")
      ? "application/pdf"
      : "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.filename;
  a.click();
  URL.revokeObjectURL(url);
}

function replaceLastPair(
  prev: ChatTurn[],
  kind: "retry" | "edit",
  userText: string,
  answer: OakAnswer,
): ChatTurn[] {
  const next = [...prev];
  let lastAsst = -1;
  let lastUser = -1;
  for (let i = next.length - 1; i >= 0; i--) {
    if (lastAsst < 0 && next[i]!.role === "assistant") lastAsst = i;
    if (lastUser < 0 && next[i]!.role === "user") lastUser = i;
    if (lastAsst >= 0 && lastUser >= 0) break;
  }
  if (lastAsst >= 0) {
    next[lastAsst] = { ...next[lastAsst]!, role: "assistant", answer };
  }
  if (kind === "edit" && lastUser >= 0) {
    const user = next[lastUser]!;
    if (user.role === "user") {
      next[lastUser] = { ...user, content: userText };
    }
  }
  return next;
}

/** Generate a stable id (session id + turn ids). Falls back when crypto.randomUUID is absent. */
function makeId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Home — the Oak chat page (design.md § Phase 7).
 *
 * Owns the conversation surface: a stable `session_id`, the committed `turns[]`
 * (user + assistant), and the in-flight turn via `useSseClient` (the manual SSE
 * client hook — NOT EventSource). When a turn's terminal answer lands it is
 * committed as an assistant turn (in-domain failures included — they arrive as a
 * normal answer). Suggestion/candidate follow-ups are plain `send` calls reusing
 * the same `session_id` (ux-design.md). Visuals deferred to `frontend-design`.
 */
export default function Home() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string>(() => makeId());
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  // Session-only thumbnails for user turns that attached images, keyed by turn id
  // (a client side-channel — the turn + persisted history stay text-only).
  const [imagePreviews, setImagePreviews] = useState<Record<string, string[]>>(
    {},
  );
  const {
    status,
    turnId,
    scope,
    activities,
    answer,
    streamingMarkdown,
    error,
    reconnecting,
    send,
    resume,
    stop,
    reset,
    retry,
  } = useSseClient();

  // Keep the screen awake while a turn is in flight. On a phone the screen
  // otherwise auto-locks during a long (image) turn, suspending the page and
  // killing the SSE connection — the root cause of the mobile "stream error".
  // `status === "thinking"` spans the whole in-flight window, including an
  // automatic reconnect (status stays "thinking" throughout).
  useScreenWakeLock(status === "thinking");

  // Auth identity (account-creation design.md § API "/api/auth/me"; AUTH-US-1 /
  // AC-1.2). Auth is a SEPARATE concern from the conversation: it lives in a
  // cookie/account, never in `sessionId`/`turns[]`, so signing in or out must
  // leave the on-screen thread untouched (BR-A10 / AUTH-US-6 — enforced below).
  // Declared above scope-mirroring so the signed-in gate for lastUsedScope can
  // read it without a temporal-dead-zone reference.
  const [auth, setAuth] = useState<MeResult>({ signedIn: false });
  const [guestDensity, setGuestDensity] = useState<"full" | "compact">("full");
  const [meReady, setMeReady] = useState(false);
  const [listsReady, setListsReady] = useState(false);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  // Voice mode (signed-in only). Guests tapping the mic get the sign-in dialog
  // — the app's existing gate for signed-in-only features — instead of the
  // overlay. The endpoints 401 regardless, so this is UX, not the security line.
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcRest, setCalcRest] = useState("");
  const [calcScenario, setCalcScenario] = useState<CalcScenario | undefined>(
    undefined,
  );
  const [artifactPins, setArtifactPins] = useState<PinnedArtifactSummary[]>(
    [],
  );
  const [pinCapError, setPinCapError] = useState(false);
  const [hydrate, setHydrate] = useState<{
    status: "running" | "failed";
    assistant_message_id?: string;
  } | null>(null);

  // Server-resolved format for the conversation. The hook's `scope` is the
  // per-turn `scope` SSE frame — `null` on a fresh send and until that frame
  // lands — so mirror it into page-level state that STICKS between turns (and is
  // seeded from a saved conversation's stored format in `handleOpenConversation`
  // below). Empty UIs default Champions (CF-CHAT-US-1); the header chip is
  // display-only and always paints the current regulation.
  const [resolvedScope, setResolvedScope] = useState<Format | null>(null);
  // Signed-in account's last-used format for NEW chats (from GET /api/auth/me +
  // every subsequent `scope` event). Survives New Chat. Guests leave this null
  // so New Chat falls back to champions.
  const [lastUsedScope, setLastUsedScope] = useState<Format | null>(null);
  useEffect(() => {
    if (scope) {
      setResolvedScope(scope.format);
      if (auth.signedIn) setLastUsedScope(scope.format);
    }
  }, [scope, auth.signedIn]);

  // Track the active request so Stop can decide between a quick-stop reset and a
  // plain stop, and restore the stopped message into the composer.
  const requestStartRef = useRef<number>(0);
  const inFlightMessageRef = useRef<string>("");
  const inFlightImagesRef = useRef<PendingImage[]>([]);
  const lastUserTextRef = useRef<string>("");
  const lastUserImagesRef = useRef<PendingImage[]>([]);
  const lastUserTurnIdRef = useRef<string | null>(null);
  const recoveryRef = useRef<"retry" | "edit" | null>(null);
  const [undoTurnId, setUndoTurnId] = useState<string | null>(null);
  const [imagesMissing, setImagesMissing] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [mentionedTeam, setMentionedTeam] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pending durable turn per conversation (background-turns/design.md §6.1:
  // "keep pending turn id per session"). A conversation whose turn keeps running
  // server-side after we detach (switched away, or backgrounded) records its
  // turn id here, keyed by session id, so reopening it can reattach. A ref (not
  // state) — it never drives render, only the reopen decision. The authoritative
  // reopen path for a signed-in thread is `active_turn` from the conversation
  // GET (server-side, survives an app relaunch); this map is the same-session
  // hint that complements it.
  const pendingTurnsRef = useRef<Map<string, string>>(new Map());
  // Record the current turn's id against its conversation once the `turn` frame
  // lands (§6.1). Only ADDS — a detach (reset on switch) must NOT drop another
  // conversation's pending pointer, so removal is handled on terminal only.
  useEffect(() => {
    if (turnId) pendingTurnsRef.current.set(sessionId, turnId);
  }, [turnId, sessionId]);
  // Clear the pending pointer when the ACTIVE conversation's turn reaches a
  // terminal state (the hook only streams the active thread, so a `done`/`error`
  // here belongs to `sessionId`). A stopped turn is cleared in `handleStop`.
  useEffect(() => {
    if (status === "done" || status === "error") {
      pendingTurnsRef.current.delete(sessionId);
    }
  }, [status, sessionId]);
  // A fresh object pushed into the Composer to reload its input after a quick
  // stop (identity change is what triggers the reload).
  const [prefill, setPrefill] = useState<{
    text: string;
    images?: PendingImage[];
  } | null>(null);

  // One-time cleanup: the Champions toggle (and its localStorage-persisted
  // choice) is gone — the header chip is a display-only regulation indicator,
  // and every new turn is Champions. Clear any stale value left by a previous
  // build so it can't linger unread forever.
  useEffect(() => {
    try {
      localStorage.removeItem("oak-champions-mode");
    } catch {
      /* storage unavailable (private mode) — nothing to clean up */
    }
  }, []);

  // Reference-page CTA prefill (B4): a `?q=` param (from an AskOakCta link)
  // seeds the composer once, then is stripped from the URL so a reload doesn't
  // re-prefill and the shared link stays clean. Runs once on mount.
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("q");
      if (q) {
        setPrefill({ text: q });
        history.replaceState(null, "", window.location.pathname);
      }
    } catch {
      /* URL/history unavailable — no prefill, no harm */
    }
  }, []);

  // App-rail collapsed state. The rail is now visible to everyone (guests get
  // nav + a sign-in hint where history would go), so it's present in SSR
  // markup from the start — default expanded there is deterministic and
  // matches the eventual desktop resolution for the common case. Resolve the
  // real choice after mount: a stored explicit choice wins; absent one,
  // narrow screens (≤768px) start collapsed (decided once, like the artifact
  // viewer's CSS breakpoint). `railBoot` suppresses the collapse transition
  // until this resolution lands, so an SSR-expanded rail that mount-corrects
  // to collapsed (mobile) doesn't visibly slide shut on first paint.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [railBoot, setRailBoot] = useState(true);
  useEffect(() => {
    try {
      // On a phone the sidebar is an overlay drawer, so it must NEVER start open
      // (it would cover the chat). Force-collapse there regardless of a stored
      // desktop preference — without persisting, so the desktop choice survives.
      const isMobile =
        window.matchMedia?.("(max-width: 768px)").matches ?? false;
      if (isMobile) {
        setSidebarCollapsed(true);
        return;
      }
      const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (stored === "true" || stored === "false") {
        setSidebarCollapsed(stored === "true");
      }
      // else: keep the default (expanded) on desktop.
    } catch {
      /* storage/matchMedia unavailable — keep the default (expanded) */
    } finally {
      setRailBoot(false);
    }
  }, []);

  const setSidebarCollapsedPersisted = useCallback((next: boolean) => {
    setSidebarCollapsed(next);
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
    } catch {
      /* storage unavailable (private mode) — fall back to in-session only */
    }
  }, []);

  // Narrow-viewport flag (fable-ui §4 screen 01). On desktop the empty-state
  // composer is promoted into the centered hero; on a phone (≤640px) it stays
  // bottom-docked for thumb reach. Default `false` (desktop-first) so the SSR /
  // first-client render places the empty composer in the hero with no hydration
  // mismatch and no flash for the common (desktop) case; a phone corrects to
  // docked once this resolves post-mount. Kept in sync on resize.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(max-width: 640px)");
    if (!mq) return;
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Durable chat history (chat-history B-3). The hook lists/searches/filters and
  // mutates the signed-in account's conversations; it stays empty + makes no
  // fetch for guests (`enabled = auth.signedIn`). The conversation `sessionId`
  // below IS the conversation id (HIST-AD-1), so opening / new-chat / import all
  // hang off it. `refresh`/`remove` are stable, so we use them in deps directly.
  const conversations = useConversations(auth.signedIn);
  const { refresh: refreshConversations, remove: removeConversation } =
    conversations;
  const teams = useTeams(auth.signedIn);
  const [deskConvos, setDeskConvos] = useState<ConversationSummary[]>([]);
  const [deskTeams, setDeskTeams] = useState<TeamSummary[]>([]);
  useEffect(() => {
    if (!auth.signedIn) {
      setDeskConvos([]);
      setDeskTeams([]);
      setListsReady(true);
      return;
    }
    setListsReady(false);
    let active = true;
    void Promise.all([listConversations(), listTeams()]).then(([c, t]) => {
      if (!active) return;
      setDeskConvos(c);
      setDeskTeams(t);
      setListsReady(true);
    });
    return () => {
      active = false;
    };
  }, [auth.signedIn]);

  // Resolve auth state on mount so the header renders guest vs signed-in. The
  // page is a client component, so this runs after hydration; `fetchMe` never
  // throws (a guest / unknown cookie / transport fault all resolve to
  // `{ signedIn: false }`), so no error path is needed (BR-A11).
  useEffect(() => {
    let active = true;
    void fetchMe().then((me) => {
      if (!active) return;
      setAuth(me);
      // Seed the new-chat default chip from the account preference (signed-in
      // only). Guests and never-chatted accounts leave lastUsedScope null →
      // champions display fallback.
      if (me.signedIn) {
        if (typeof me.lastUsedScope === "string" && isFormat(me.lastUsedScope)) {
          setLastUsedScope(me.lastUsedScope);
        }
        setListsReady(false);
      } else {
        setListsReady(true);
        setGuestDensity(readGuestDensity());
      }
      setMeReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  // Sign-in completed in the dialog. Close it and re-resolve identity (to pick up
  // the account email for the menu). CRITICAL: we do NOT touch `sessionId` or
  // `turns[]` — the conversation visible before sign-in stays visible and usable
  // (BR-A10 / AC-6.1, AC-6.2). The `created` flag (new account vs returning
  // login) is intentionally not surfaced here; both paths land in the same UI.
  const handleSignedIn = useCallback(() => {
    setAuthDialogOpen(false);
    void fetchMe().then((me) => {
      setAuth(me);
      if (me.signedIn) {
        if (typeof me.lastUsedScope === "string" && isFormat(me.lastUsedScope)) {
          setLastUsedScope(me.lastUsedScope);
        }
      }
      // BR-H10 / HIST-US-12: the on-screen guest thread's full-fidelity turns
      // live only on the client at this moment, so save them into the new
      // account (idempotent import), then surface it in the now-enabled history
      // list. An empty thread imports nothing (AC-12.2 — repo returns null).
      if (me.signedIn && turns.length > 0) {
        // Import under the resolved format, falling back to Champions
        // (CF-CHAT-US-1). No other-format seed is sent as a product control.
        const importFormat: Format = resolvedScope ?? "champions";
        void importConversation(sessionId, turns, importFormat).then(() =>
          refreshConversations(),
        );
      }
    });
  }, [sessionId, turns, refreshConversations, resolvedScope]);

  // Sign-out completed (current device only — AC-5.2). Revert to the guest tier
  // WITHOUT resetting `sessionId` or clearing `turns[]`: the thread persists
  // across the user→guest transition exactly as it does across guest→user
  // (BR-A10). Clear lastUsedScope so a later guest new-chat doesn't inherit a
  // signed-in preference.
  const handleSignedOut = useCallback(() => {
    setAuth({ signedIn: false });
    setLastUsedScope(null);
    setPinnedIds([]);
    setSelectedIds([]);
  }, []);

  // Commit each terminal answer exactly once (guard against effect re-runs /
  // React strict-mode double-invoke by tracking the committed object identity).
  const committedAnswerRef = useRef<OakAnswer | null>(null);
  // A team the agent JUST saved (save_team, T13) — set only from a fresh answer
  // so the viewer auto-opens on arrival, never when reloading history.
  const [savedTeamToOpen, setSavedTeamToOpen] = useState<SavedTeam | null>(null);
  useEffect(() => {
    if (status === "done" && answer && committedAnswerRef.current !== answer) {
      committedAnswerRef.current = answer;
      const kind = recoveryRef.current;
      recoveryRef.current = null;
      setUndoTurnId(null);
      if (kind === "retry" || kind === "edit") {
        setTurns((prev) => replaceLastPair(prev, kind, lastUserTextRef.current, answer));
      } else {
        setTurns((prev) => [
          ...prev,
          { id: makeId(), role: "assistant", answer },
        ]);
      }
      if (answer.saved_team) setSavedTeamToOpen(answer.saved_team);
      if (auth.signedIn) {
        refreshConversations();
        void getConversation(sessionId).then((detail) => {
          if (!detail) return;
          setTurns(detail.turns);
          if (detail.pinnedMessageIds) setPinnedIds(detail.pinnedMessageIds);
        });
      }
    }
  }, [status, answer, auth.signedIn, refreshConversations, sessionId]);

  const navigateTo = useCallback(
    (href: string) => {
      try {
        router.push(href);
      } catch {
        if (typeof window !== "undefined") window.location.assign(href);
      }
    },
    [router],
  );

  // Start a brand-new conversation (AC-6.1): a fresh session id + empty thread.
  // lastUsedScope is intentionally kept so a signed-in New chat keeps the
  // last-used chip (scope-chip-seed).
  const handleNewChat = useCallback(() => {
    reset();
    committedAnswerRef.current = null;
    recoveryRef.current = null;
    setUndoTurnId(null);
    setSessionId(makeId());
    setTurns([]);
    setImagePreviews({});
    setResolvedScope(null);
    setPinnedIds([]);
    setArtifactPins([]);
    setPinCapError(false);
    setHydrate(null);
    setCalcOpen(false);
    setImagesMissing(false);
    setSelectedIds([]);
    setMentionedTeam(null);
  }, [reset]);

  const handleSlash = useCallback(
    (target: "new" | "team" | "dex" | "usage", text: string) => {
      const arg = slashArg(text);
      if (target === "new") {
        handleNewChat();
        return;
      }
      if (target === "dex") {
        navigateTo(arg ? `/pokedex/${slugify(arg)}` : "/pokedex");
        return;
      }
      if (target === "usage") {
        navigateTo("/meta");
        return;
      }
      if (arg) {
        const match = teams.teams.find(
          (t) => t.name.toLowerCase() === arg.toLowerCase(),
        );
        navigateTo(match ? `/teams?team=${encodeURIComponent(match.id)}` : "/teams");
      } else {
        navigateTo("/teams");
      }
    },
    [handleNewChat, navigateTo, teams.teams],
  );

  const handleSend = useCallback(
    (message: string, images: PendingImage[] = []) => {
      const slash = parseSlashCommand(message, { hasUsagePage: true });
      if (slash.type === "navigate" && recoveryRef.current !== "edit") {
        handleSlash(slash.target, message);
        return;
      }
      if (slash.type === "calc" && recoveryRef.current !== "edit") {
        setCalcRest(slash.rest);
        setCalcScenario(undefined);
        setCalcOpen(true);
        return;
      }

      const parsedMentions = auth.signedIn
        ? parseMentions(message, teams.teams)
        : { ids: [] as string[], bound: [], dead: [] as string[] };
      if (parsedMentions.dead.length > 0) return;
      if (parsedMentions.bound[0]) setMentionedTeam(parsedMentions.bound[0]);
      else if (parsedMentions.ids.length === 0) setMentionedTeam(null);

      const pendingRecovery = recoveryRef.current;
      const hasPair = turns.some((t) => t.role === "assistant");
      const useRecovery =
        (pendingRecovery === "retry" || pendingRecovery === "edit") && hasPair;

      // Ignore unrelated sends while a turn is in flight. Edit of the last
      // user message Stops the in-flight turn first (REC-AC-2.2).
      if (status === "thinking" && pendingRecovery !== "edit") return;
      if (status === "thinking" && pendingRecovery === "edit") {
        stop();
        pendingTurnsRef.current.delete(sessionId);
      }

      requestStartRef.current = Date.now();
      inFlightMessageRef.current = message;
      inFlightImagesRef.current = images;
      committedAnswerRef.current = null;
      setImagesMissing(false);

      if (!useRecovery) {
        recoveryRef.current = null;
        const userTurnId = makeId();
        lastUserTurnIdRef.current = userTurnId;
        lastUserTextRef.current = message;
        lastUserImagesRef.current = images;
        setTurns((prev) => [
          ...prev,
          { id: userTurnId, role: "user", content: message },
        ]);
        if (images.length > 0) {
          setImagePreviews((prev) => ({
            ...prev,
            [userTurnId]: images.map((img) => img.previewUrl),
          }));
        }
        setUndoTurnId(userTurnId);
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
        undoTimerRef.current = setTimeout(() => {
          setUndoTurnId((id) => (id === userTurnId ? null : id));
        }, UNDO_MS);
      } else if (pendingRecovery === "edit") {
        lastUserTextRef.current = message;
        lastUserImagesRef.current = images;
        setUndoTurnId(null);
      } else {
        setUndoTurnId(null);
      }

      const body = {
        session_id: sessionId,
        message,
        ...(images.length > 0
          ? { images: images.map((img) => ({ mimeType: img.mimeType, data: img.data })) }
          : {}),
        ...(useRecovery ? { recovery: pendingRecovery } : {}),
        ...(parsedMentions.ids.length > 0
          ? { mentioned_team_ids: parsedMentions.ids }
          : {}),
      };
      send(body);
    },
    [
      auth.signedIn,
      handleSlash,
      send,
      sessionId,
      status,
      stop,
      teams.teams,
      turns,
    ],
  );

  const sendRef = useRef(handleSend);
  sendRef.current = handleSend;
  useEffect(() => {
    try {
      const message = window.sessionStorage.getItem(CALC_EXPLAIN_KEY);
      if (!message) return;
      window.sessionStorage.removeItem(CALC_EXPLAIN_KEY);
      sendRef.current(message);
    } catch {
      /* private mode */
    }
  }, []);

  // Open a saved conversation (HIST-US-4): load its full-fidelity turns, make it
  // the live thread (its id becomes the session id, so the composer continues
  // it), and follow its stored format (AC-5.4).
  const handleOpenConversation = useCallback(
    (id: string) => {
      void getConversation(id).then((detail) => {
        if (!detail) return;
        // Detach from whatever thread was on screen — a pure unsubscribe now
        // (durable turns keep generating server-side; §6.1). Its pending pointer
        // survives in `pendingTurnsRef` so it can be reattached later.
        reset();
        committedAnswerRef.current = null;
        setSessionId(detail.id);
        setTurns(detail.turns);
        setImagePreviews({}); // session-only thumbnails don't survive a reload
        lastUserImagesRef.current = [];
        // Follow the conversation's stored scope so the chip + artifact scope
        // reflect it immediately, before the first resumed turn re-emits `scope`.
        setResolvedScope(detail.format as Format);
        setPinnedIds(detail.pinnedMessageIds ?? []);
        const extra = detail as typeof detail & {
          pinnedArtifacts?: PinnedArtifactSummary[];
          hydrate?: {
            status: "running" | "failed";
            assistant_message_id?: string;
          };
        };
        setArtifactPins(extra.pinnedArtifacts ?? []);
        setPinCapError(false);
        setHydrate(extra.hydrate ?? null);
        setUndoTurnId(null);
        recoveryRef.current = null;
        setImagesMissing(false);
        // Reopening mid-generation: reattach to the still-running turn and
        // rebuild the in-flight UI from the server's replay (§6.1). `active_turn`
        // from the conversation GET is authoritative (survives an app relaunch);
        // fall back to the same-session pending pointer if the GET didn't carry
        // one. A finished turn is already in `detail.turns`, and the server
        // returns `active_turn: null` for it — so there is no double-render.
        const resumeTurnId =
          detail.active_turn?.turn_id ?? pendingTurnsRef.current.get(detail.id);
        if (resumeTurnId) resume(resumeTurnId, detail.id);
      });
    },
    [reset, resume],
  );

  // Delete a conversation (HIST-US-8). If it is the one currently on screen,
  // reset to a fresh empty chat so we never show a broken/empty thread (AC-8.2).
  const handleDeleteConversation = useCallback(
    (id: string) => {
      void removeConversation(id);
      if (id === sessionId) handleNewChat();
    },
    [removeConversation, sessionId, handleNewChat],
  );

  // Stop the in-flight turn. With durable turns, stopping is an EXPLICIT API call
  // (background-turns/design.md §6/BT-4): `stop()` POSTs the stop endpoint and
  // tears down the local stream to idle (a disconnect no longer halts generation
  // — only this does). Clear the conversation's pending pointer since the turn is
  // discarded server-side. If stopped within QUICK_STOP_MS, wipe the conversation
  // to a brand-new session and restore the message into the composer for an easy
  // redo; otherwise leave the (now answer-less) turn in the thread.
  const handleStop = useCallback(() => {
    const elapsed = Date.now() - requestStartRef.current;
    const recovering = recoveryRef.current;
    stop();
    pendingTurnsRef.current.delete(sessionId);
    committedAnswerRef.current = null;
    setUndoTurnId(null);
    if (recovering) {
      // REC-BR-2: keep the previous pair; restore the attempted text.
      recoveryRef.current = recovering === "edit" ? "edit" : null;
      setPrefill({
        text: inFlightMessageRef.current,
        images: inFlightImagesRef.current,
      });
      return;
    }
    recoveryRef.current = null;
    if (elapsed < QUICK_STOP_MS) {
      setTurns([]);
      setImagePreviews({});
      setSessionId(makeId());
      setPrefill({
        text: inFlightMessageRef.current,
        images: inFlightImagesRef.current,
      });
    }
  }, [stop, sessionId]);

  const handleUndo = useCallback(() => {
    stop();
    pendingTurnsRef.current.delete(sessionId);
    committedAnswerRef.current = null;
    recoveryRef.current = null;
    setUndoTurnId(null);
    const text = inFlightMessageRef.current;
    const images = inFlightImagesRef.current;
    const undoId = lastUserTurnIdRef.current;
    setTurns((prev) =>
      undoId ? prev.filter((t) => t.id !== undoId) : prev.slice(0, -1),
    );
    if (undoId) {
      setImagePreviews((prev) => {
        const next = { ...prev };
        delete next[undoId];
        return next;
      });
    }
    setPrefill({ text, images });
  }, [stop, sessionId]);

  const handleRetryLast = useCallback(() => {
    if (status === "thinking") return;
    const lastUser = [...turns].reverse().find((t) => t.role === "user");
    if (!lastUser || lastUser.role !== "user") return;
    recoveryRef.current = "retry";
    const images = lastUserImagesRef.current;
    const hadPreview = Boolean(imagePreviews[lastUser.id]?.length);
    if (hadPreview && images.length === 0) setImagesMissing(true);
    lastUserTextRef.current = lastUser.content;
    handleSend(lastUser.content, images);
  }, [handleSend, imagePreviews, status, turns]);

  const handleEditLast = useCallback(() => {
    const lastUser = [...turns].reverse().find((t) => t.role === "user");
    if (!lastUser || lastUser.role !== "user") return;
    recoveryRef.current = "edit";
    const images = lastUserImagesRef.current;
    const hadPreview = Boolean(imagePreviews[lastUser.id]?.length);
    if (hadPreview && images.length === 0) setImagesMissing(true);
    lastUserTextRef.current = lastUser.content;
    setPrefill({ text: lastUser.content, images });
  }, [imagePreviews, turns]);

  const handleExport = useCallback(
    async (id: string, format: ExportFormat) => {
      const file = await exportConversation(id, format);
      if (file) downloadExport(file);
    },
    [],
  );

  const handleShareTurn = useCallback(
    (assistantId: string) => {
      void createShare(sessionId, assistantId).then((created) => {
        if (!created?.url) return;
        if (navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText(created.url);
        }
      });
    },
    [sessionId],
  );

  const handlePinTurn = useCallback(
    (id: string) => {
      void setMessagePinned(sessionId, id, true).then((ids) => {
        if (ids) setPinnedIds(ids);
        else setPinnedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      });
    },
    [sessionId],
  );

  const handleUnpinTurn = useCallback(
    (id: string) => {
      void setMessagePinned(sessionId, id, false).then((ids) => {
        if (ids) setPinnedIds(ids);
        else setPinnedIds((prev) => prev.filter((x) => x !== id));
      });
    },
    [sessionId],
  );

  const handleForkTurn = useCallback(
    (id: string) => {
      void forkConversation(sessionId, id).then((forked) => {
        if (forked) handleOpenConversation(forked.id);
      });
    },
    [handleOpenConversation, sessionId],
  );

  const handleFollowUpChip = useCallback(
    (chip: FollowUpChip) => {
      if (chip.kind === "scope") {
        return;
      }
      if (chip.kind === "dex") {
        navigateTo(`/pokedex/${slugify(chip.target)}`);
        return;
      }
      navigateTo(`/teams?team=${encodeURIComponent(chip.target)}`);
    },
    [navigateTo],
  );

  const handleJumpToPin = useCallback((id: string) => {
    document.getElementById(`turn-${id}`)?.scrollIntoView?.({
      block: "start",
    });
  }, []);

  const focusComposer = useCallback(() => {
    const el = document.querySelector<HTMLTextAreaElement>(
      '[data-testid="composer-input"]',
    );
    el?.focus();
  }, []);

  const focusHistorySearch = useCallback(() => {
    setSidebarCollapsed(false);
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLInputElement>('[aria-label="Search conversations"]')
        ?.focus();
    });
  }, []);

  const openScopePicker = useCallback(() => {
    document.querySelector<HTMLButtonElement>('[data-testid="scope-chip"]')?.click();
  }, []);

  const openPalette = useCallback(() => {
    setPaletteQuery("");
    if (auth.signedIn && !listsReady) {
      void Promise.all([listConversations(), listTeams()]).then(([c, t]) => {
        setDeskConvos(c);
        setDeskTeams(t);
        setListsReady(true);
        setPaletteOpen(true);
      });
      return;
    }
    setPaletteOpen(true);
  }, [auth.signedIn, listsReady]);

  const pinCurrentConversation = useCallback(() => {
    if (!auth.signedIn) return;
    const current = conversations.conversations.find((c) => c.id === sessionId);
    if (!current) return;
    void conversations.pin(sessionId, !current.pinned);
  }, [auth.signedIn, conversations, sessionId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      const typing = isTypingTarget(e.target);
      const key = e.key.toLowerCase();

      if (meta && key === "k" && !e.shiftKey) {
        e.preventDefault();
        openPalette();
        return;
      }
      if (meta && key === "o" && e.shiftKey) {
        e.preventDefault();
        handleNewChat();
        return;
      }
      if (meta && key === "j" && e.shiftKey) {
        e.preventDefault();
        focusComposer();
        return;
      }
      if (meta && key === "." && !e.shiftKey) {
        e.preventDefault();
        if (status === "thinking") handleStop();
        return;
      }
      if (meta && key === "f" && e.shiftKey) {
        e.preventDefault();
        focusHistorySearch();
        return;
      }
      if (meta && key === "s" && e.shiftKey) {
        e.preventDefault();
        openScopePicker();
        return;
      }
      if (meta && key === "p" && e.shiftKey) {
        e.preventDefault();
        pinCurrentConversation();
        return;
      }
      if (e.key === "?" && !meta && !typing) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [
    focusComposer,
    focusHistorySearch,
    handleNewChat,
    handleStop,
    openPalette,
    openScopePicker,
    pinCurrentConversation,
    status,
  ]);

  const chatStatus: ChatStatus =
    status === "thinking" ? "streaming" : status === "error" ? "error" : "idle";

  const emptyReady = meReady && listsReady;

  // Empty state = no committed turns and nothing in flight. On desktop the
  // composer is promoted into the hero then (screen 01); on mobile, or once a
  // turn exists, it stays bottom-docked. `heroComposer` decides which of the two
  // DOM slots renders the SINGLE composer instance.
  const showEmptyState = turns.length === 0 && chatStatus === "idle";
  // Keep the composer in one slot for the whole empty state so typing `@`
  // (or a starter tap) is not lost when recents finish loading.
  const heroComposer = showEmptyState && !narrow;

  // The format in effect for the conversation. Empty UIs default to Champions
  // (CF-CHAT-US-1). The header chip is display-only and always paints the
  // current regulation; this value still seeds the artifact viewer / calc.
  const displayFormat: Format =
    resolvedScope ?? lastUsedScope ?? "champions";

  // Mic button tapped. Signed in → open the voice overlay at the current
  // display scope; guest → the sign-in dialog (the existing signed-in gate).
  const handleOpenCalculator = useCallback(
    (calc: DamageCalc, hopFormat: Format) => {
      setCalcRest("");
      setCalcScenario(scenarioFromDamageCalc(calc, hopFormat));
      setCalcOpen(true);
    },
    [],
  );

  const handleHydrateRetry = useCallback(
    (turnId: string) => {
      if (!auth.signedIn) return;
      setHydrate({ status: "running", assistant_message_id: turnId });
      void fetch("/api/voice/hydrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          conversation_id: sessionId,
          assistant_message_id: turnId,
        }),
      }).then(async (res) => {
        if (!res.ok) {
          setHydrate({ status: "failed", assistant_message_id: turnId });
          return;
        }
        setHydrate({ status: "running", assistant_message_id: turnId });
      });
    },
    [auth.signedIn, sessionId],
  );

  useEffect(() => {
    if (!hydrate || hydrate.status !== "running" || !hydrate.assistant_message_id) {
      return;
    }
    const asstId = hydrate.assistant_message_id;
    const timer = window.setInterval(() => {
      void fetch(
        `/api/voice/hydrate?conversation_id=${encodeURIComponent(sessionId)}&assistant_message_id=${encodeURIComponent(asstId)}`,
        { credentials: "same-origin" },
      ).then(async (res) => {
        if (res.status === 404) {
          const detail = await getConversation(sessionId);
          if (detail) setTurns(detail.turns);
          setHydrate(null);
          return;
        }
        if (!res.ok) return;
        const body = (await res.json()) as { status?: string };
        if (body.status === "failed") {
          setHydrate({ status: "failed", assistant_message_id: asstId });
        }
      });
    }, 2000);
    return () => window.clearInterval(timer);
  }, [hydrate, sessionId]);

  const handleVoiceClick = useCallback(() => {
    if (!auth.signedIn) {
      setAuthDialogOpen(true);
      return;
    }
    setVoiceOpen(true);
  }, [auth.signedIn]);

  // Overlay closed. Voice turns were persisted server-side during the session,
  // so reload the thread (and re-list conversations) — the same refresh path a
  // normal answer triggers — so the spoken turns appear in the chat.
  const handleVoiceClose = useCallback(() => {
    setVoiceOpen(false);
    if (auth.signedIn) {
      void getConversation(sessionId).then((detail) => {
        if (detail) setTurns(detail.turns);
      });
      refreshConversations();
    }
  }, [auth.signedIn, sessionId, refreshConversations]);

  // The single composer element, placed in either the hero slot or the bottom
  // dock (never both) — see `heroComposer` at the render site.
  const lastConversation =
    [...deskConvos].sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
  const lastTeam =
    [...deskTeams].sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;

  const composer = (
    <Composer
      onSend={handleSend}
      disabled={status === "thinking"}
      streaming={status === "thinking"}
      onStop={handleStop}
      prefill={prefill}
      onVoice={handleVoiceClick}
      voiceReady={auth.signedIn}
      signedIn={auth.signedIn}
      teams={deskTeams.length > 0 ? deskTeams : teams.teams}
    />
  );

  // Header overflow menu (mobile): below 640px the secondary controls (theme +
  // the signed-in team controls) collapse behind a single gear button so they
  // stop overflowing the red band off-screen. Desktop renders them inline and
  // never shows the gear. Close on outside-tap / Escape.
  const [menuOpen, setMenuOpen] = useState(false);
  const headerClusterRef = useRef<HTMLDivElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!headerClusterRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        // Return focus to the trigger — the focused control inside the panel is
        // about to be display:none'd, which would otherwise drop focus to <body>.
        moreBtnRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  // Mobile history drawer is a modal overlay (covers the chat behind a scrim), so
  // let Escape dismiss it too — parity with the popover + artifact viewer. Uses
  // the NON-persisting setter + a viewport guard so it never collapses the
  // in-flow desktop sidebar or clobbers the stored desktop preference.
  useEffect(() => {
    if (sidebarCollapsed) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        (window.matchMedia?.("(max-width: 768px)").matches ?? false)
      ) {
        setSidebarCollapsed(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [sidebarCollapsed]);

  return (
    <main className="chat-page" data-testid="chat-page">
      <header className="chat-page__header">
        <div className="chat-page__title-cluster">
          <SidebarToggle
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsedPersisted(!sidebarCollapsed)}
            controlsId={SIDEBAR_ID}
          />
          <button
            type="button"
            className="chat-page__title"
            aria-label="Oak — reload"
            onClick={() => window.location.reload()}
          >
            <OakWordmark />
          </button>
        </div>
        <div className="chat-page__header-cluster" ref={headerClusterRef}>
          {/* Display-only regulation chip (CF-UI-US-2). Rendered OUTSIDE the
              collapsible controls so it stays visible on mobile. Not a game
              picker — click does not switch formats. */}
          <ScopeChip format={displayFormat} />
          {/* Collapsible group: inline on desktop, a popover under the gear on
              mobile (≤640px). Holds the secondary controls AND the auth control
              (AuthMenu) — the auth pill (guest "Sign in" or the wider signed-in
              email/"Sign out" cluster) was the element overflowing the 390/360px
              header, so it collapses into the gear popover on mobile too. Mobile
              header = logo + scope chip + gear; desktop is unchanged (this group
              is inline there, in the same visual order as before). */}
          <div
            id="header-controls"
            className={
              "chat-page__controls" +
              (menuOpen ? " chat-page__controls--open" : "")
            }
          >
            <ThemeToggle />
            <AuthMenu
              signedIn={auth.signedIn}
              email={auth.email}
              onSignInClick={() => setAuthDialogOpen(true)}
              onSignedOut={handleSignedOut}
              answerDensity={
                auth.signedIn ? auth.answerDensity : guestDensity
              }
              onAnswerDensityChange={(density) => {
                if (auth.signedIn) {
                  setAuth((prev) => ({ ...prev, answerDensity: density }));
                  return;
                }
                setGuestDensity(density);
                try {
                  window.localStorage.setItem(GUEST_DENSITY_KEY, density);
                } catch {
                  /* private mode */
                }
              }}
            />
          </div>
          {/* Mobile-only trigger for the control popover (CSS hides it ≥640px). */}
          <button
            ref={moreBtnRef}
            type="button"
            className="chat-page__more"
            aria-label="More settings"
            aria-haspopup="true"
            aria-expanded={menuOpen}
            aria-controls="header-controls"
            data-testid="header-more"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <SlidersIcon />
          </button>
        </div>
      </header>

      <div className="chat-page__body">
        <ArtifactViewerProvider format={displayFormat}>
          {/* App rail — visible to everyone (nav refactor Part 1): New chat +
              Teams + a quiet Reference footer for all users, with the
              signed-in conversation list (or a guest sign-in hint) in the
              middle slot. Collapses to width 0 via the toggle; the inner
              wrapper keeps its fixed width so content doesn't reflow
              mid-slide, and goes `inert` when collapsed so its controls leave
              the tab + a11y trees. `railBoot` suppresses the collapse
              transition until the mount-resolution effect above has run, so a
              mobile correction from the SSR-expanded default can't flash. */}
          <aside
            id={SIDEBAR_ID}
            data-testid={
              meReady && (!auth.signedIn || listsReady)
                ? "history-sidebar"
                : undefined
            }
            className={
              "chat-page__sidebar" +
              (sidebarCollapsed ? " chat-page__sidebar--collapsed" : "") +
              (railBoot ? " chat-page__sidebar--boot" : "")
            }
          >
            <div
              className="chat-page__sidebar-inner"
              inert={sidebarCollapsed ? true : undefined}
            >
              <AppNav pathname="/" onNewChat={handleNewChat}>
                {auth.signedIn ? (
                  <ConversationList
                    conversations={
                      conversations.conversations.length > 0
                        ? conversations.conversations
                        : deskConvos
                    }
                    activeId={sessionId}
                    query={conversations.query}
                    onQueryChange={conversations.setQuery}
                    onNewChat={handleNewChat}
                    onOpen={handleOpenConversation}
                    onRename={conversations.rename}
                    onPin={conversations.pin}
                    onDelete={handleDeleteConversation}
                    folders={conversations.folders}
                    folderId={conversations.folderId}
                    archivedOnly={conversations.archivedOnly}
                    includeArchived={conversations.includeArchived}
                    selectedIds={selectedIds}
                    onFolderChange={conversations.setFolderId}
                    onArchivedOnlyChange={conversations.setArchivedOnly}
                    onIncludeArchivedChange={conversations.setIncludeArchived}
                    onToggleSelect={(id) =>
                      setSelectedIds((prev) =>
                        prev.includes(id)
                          ? prev.filter((x) => x !== id)
                          : [...prev, id],
                      )
                    }
                    onBulk={(action, folderId) => {
                      void conversations.bulk(selectedIds, action, folderId);
                      setSelectedIds([]);
                    }}
                    onArchive={conversations.archive}
                    onMoveToFolder={conversations.moveToFolder}
                    onCreateFolder={(name) => {
                      void conversations.createFolder(name);
                    }}
                    onRenameFolder={(id, name) => {
                      void conversations.renameFolder(id, name);
                    }}
                    onDeleteFolder={(id) => {
                      void conversations.deleteFolder(id);
                    }}
                    onExport={(format) => {
                      void handleExport(sessionId, format);
                    }}
                  />
                ) : (
                  <div
                    className="chat-page__signin-hint"
                    data-testid="history-signin-hint"
                  >
                    <p className="chat-page__signin-hint-text">
                      Sign in to save chat history{" "}
                      <button
                        type="button"
                        className="chat-page__signin-hint-cta"
                        onClick={() => setAuthDialogOpen(true)}
                      >
                        Sign in
                      </button>
                    </p>
                  </div>
                )}
              </AppNav>
            </div>
          </aside>

          {/* Mobile drawer scrim: tap to dismiss the app rail. Only rendered
              when the drawer is open; CSS shows it as a full-screen overlay
              below 768px and hides it on desktop (where the rail is an
              in-flow column, not an overlay). */}
          {!sidebarCollapsed && (
            <div
              className="chat-page__scrim"
              data-testid="sidebar-scrim"
              aria-hidden="true"
              // Non-persisting: dismissing the mobile overlay must not overwrite
              // the stored DESKTOP sidebar preference (mount force-collapses on
              // mobile without persisting for the same reason).
              onClick={() => setSidebarCollapsed(true)}
            />
          )}

          <div className="chat-page__main">
            <ArtifactPinHost
              signedIn={auth.signedIn}
              conversationId={sessionId}
              pins={artifactPins}
              capError={pinCapError}
              onUnpin={(id) => {
                void deletePinnedArtifact(sessionId, id).then((remaining) => {
                  if (remaining) setArtifactPins(remaining);
                });
              }}
            />
            <ChatThread
              turns={turns}
              activity={activities}
              status={chatStatus}
              streamingMarkdown={streamingMarkdown}
              transportError={status === "error" ? error : null}
              reconnecting={reconnecting}
              onRetry={retry}
              onFollowUp={handleSend}
              imagePreviews={imagePreviews}
              composerSlot={heroComposer ? composer : undefined}
              signedIn={auth.signedIn}
              undoTurnId={undoTurnId}
              onUndo={handleUndo}
              onRetryLast={handleRetryLast}
              onEditLast={handleEditLast}
              onPinTurn={auth.signedIn ? handlePinTurn : undefined}
              onUnpinTurn={auth.signedIn ? handleUnpinTurn : undefined}
              onForkTurn={auth.signedIn ? handleForkTurn : undefined}
              pinnedIds={auth.signedIn ? pinnedIds : []}
              onJumpToPin={handleJumpToPin}
              onShareTurn={auth.signedIn ? handleShareTurn : undefined}
              onFollowUpChip={handleFollowUpChip}
              currentFormat={displayFormat}
              mentionedTeam={auth.signedIn ? mentionedTeam : null}
              density={
                auth.signedIn ? (auth.answerDensity ?? "full") : guestDensity
              }
              hydrate={hydrate}
              onHydrateRetry={
                auth.signedIn ? handleHydrateRetry : undefined
              }
              onOpenCalculator={handleOpenCalculator}
              emptyReady={emptyReady}
              emptyDesk={
                auth.signedIn
                  ? {
                      lastConversation: lastConversation
                        ? {
                            id: lastConversation.id,
                            title: lastConversation.title,
                          }
                        : null,
                      lastTeam: lastTeam
                        ? { id: lastTeam.id, name: lastTeam.name }
                        : null,
                      scopeLabel: scopeLabel(displayFormat),
                      onContinue: lastConversation
                        ? () => handleOpenConversation(lastConversation.id)
                        : undefined,
                      onOpenLastTeam: lastTeam
                        ? () =>
                            navigateTo(
                              `/teams?team=${encodeURIComponent(lastTeam.id)}`,
                            )
                        : undefined,
                    }
                  : undefined
              }
            />

            {imagesMissing && (
              <p className="chat-page__images-missing" role="status">
                Pictures from that turn aren’t attached.
              </p>
            )}

            {showEmptyState && <LandingSection />}

            {!heroComposer && composer}
          </div>

          {/* Headless: auto-opens a just-saved team in the viewer on arrival. */}
          <SavedTeamAutoOpen savedTeam={savedTeamToOpen} />

          {/* Docked side panel (full-screen overlay on mobile); hidden until an
              artifact is opened, at which point the chat reflows (AV-US-7). */}
          <ArtifactViewer
            signedIn={auth.signedIn}
            conversationId={auth.signedIn ? sessionId : undefined}
            onPinResult={(result) => {
              if (result.ok) {
                setArtifactPins(result.pins);
                setPinCapError(false);
              } else {
                setPinCapError(true);
              }
            }}
          />
        </ArtifactViewerProvider>
      </div>

      <AuthDialog
        open={authDialogOpen}
        onClose={() => setAuthDialogOpen(false)}
        onSignedIn={handleSignedIn}
      />

      {/* Voice mode (signed-in only) — opens at the current display scope; on
          close the thread reloads so persisted spoken turns appear. */}
      <VoiceOverlay
        open={voiceOpen}
        onClose={handleVoiceClose}
        sessionId={sessionId}
        format={displayFormat}
      />

      <CalculatorOverlay
        open={calcOpen}
        format={displayFormat}
        slashRest={calcRest}
        scenario={calcScenario}
        onExplain={(message) => handleSend(message)}
        onDismiss={() => setCalcOpen(false)}
        onExpand={(scenario) => {
          try {
            window.sessionStorage.setItem(
              CALC_SCENARIO_KEY,
              JSON.stringify(scenario),
            );
          } catch {
            /* private mode */
          }
          setCalcOpen(false);
          navigateTo("/calc");
        }}
      />



      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        signedIn={auth.signedIn}
        query={paletteQuery}
        onQueryChange={setPaletteQuery}
        conversations={
          deskConvos.length > 0 ? deskConvos : conversations.conversations
        }
        teams={deskTeams.length > 0 ? deskTeams : teams.teams}
        onNewChat={handleNewChat}
        onOpenConversation={handleOpenConversation}
        onOpenDex={(q) =>
          navigateTo(q ? `/pokedex/${slugify(q)}` : "/pokedex")
        }
        onOpenTeam={(id) =>
          navigateTo(id ? `/teams?team=${encodeURIComponent(id)}` : "/teams")
        }
        onOpenUsage={() => navigateTo("/meta")}
      />

      <ShortcutOverlay
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />

      {/* Dev-only plate wash dials (Phase 3). Hidden in prod unless ?plateTuner=1. */}
      <PlateTuner />
      <OrbPlayground />
    </main>
  );
}

/** Sliders / settings glyph for the mobile header overflow trigger. */
function SlidersIcon() {
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
      <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h10M18 18h2" />
      <circle cx={16} cy={6} r={2} />
      <circle cx={8} cy={12} r={2} />
      <circle cx={16} cy={18} r={2} />
    </svg>
  );
}
