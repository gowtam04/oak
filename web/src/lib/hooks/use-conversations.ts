/**
 * use-conversations — list-state hook for the history sidebar
 * (docs/features/chat-history § Interface Definitions, Phase 5;
 * chat-qol organize folder / archive / bulk).
 *
 * Owns the conversation list, the debounced search query, folder/archive
 * filters, and the optimistic rename/pin/delete/archive/move/bulk mutations.
 * When `enabled` is false (a guest) it stays empty and never fetches (AC-1.3).
 * All network calls go through the never-throwing history-client (and
 * folder-client for folder CRUD), so the hook itself has no error path.
 */

"use client";

import { useCallback, useEffect, useState } from "react";

import {
  createFolder as apiCreateFolder,
  deleteFolder as apiDeleteFolder,
  listFolders,
  renameFolder as apiRenameFolder,
  type Folder,
} from "@/lib/api/folder-client";
import {
  bulkUpdate as apiBulk,
  deleteConversation as apiDelete,
  listConversations,
  renameConversation as apiRename,
  setArchived as apiSetArchived,
  setFolder as apiSetFolder,
  setPinned as apiSetPinned,
  type BulkAction,
  type BulkUpdateResult,
  type ConversationSummary,
} from "@/lib/api/history-client";

/** Debounce (ms) before a typed search query triggers a re-list. */
const SEARCH_DEBOUNCE_MS = 200;

export interface UseConversationsResult {
  conversations: ConversationSummary[];
  query: string;
  setQuery: (q: string) => void;
  /** Folder filter: uuid, `"unfiled"`, or `null` for every folder (ORG-US-1). */
  folderId: string | null;
  setFolderId: (id: string | null) => void;
  /** Archive view (ORG-US-2). Exclusive of the default list. */
  archivedOnly: boolean;
  setArchivedOnly: (v: boolean) => void;
  /** Search-only: include archived hits (ORG-AC-2.4). */
  includeArchived: boolean;
  setIncludeArchived: (v: boolean) => void;
  folders: Folder[];
  /** Re-list now (call after a completed signed-in turn). */
  refresh: () => void;
  rename: (id: string, title: string) => Promise<void>;
  pin: (id: string, pinned: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
  archive: (id: string, archived: boolean) => Promise<void>;
  moveToFolder: (id: string, folderId: string | null) => Promise<void>;
  bulk: (
    ids: string[],
    action: BulkAction,
    folderId?: string | null,
  ) => Promise<BulkUpdateResult | null>;
  createFolder: (name: string) => Promise<Folder | null>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  /** False for guests → list stays empty, no fetch. */
  enabled: boolean;
}

export function useConversations(enabled: boolean): UseConversationsResult {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [query, setQuery] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [archivedOnly, setArchivedOnly] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);

  // Debounce the search query so each keystroke does not hit the API.
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  // Fetch the list when enabled / the (debounced) query / filters / an explicit
  // refresh changes. Guests stay empty and make no request.
  useEffect(() => {
    if (!enabled) {
      setConversations([]);
      setFolders([]);
      return;
    }
    let active = true;
    void listConversations({
      q: debouncedQuery || undefined,
      ...(folderId ? { folder_id: folderId } : {}),
      ...(archivedOnly ? { archived: true } : {}),
      ...(includeArchived ? { include_archived: true } : {}),
    }).then((list) => {
      if (active) setConversations(list);
    });
    void listFolders().then((list) => {
      if (active) setFolders(list);
    });
    return () => {
      active = false;
    };
  }, [enabled, debouncedQuery, folderId, archivedOnly, includeArchived, refreshTick]);

  const rename = useCallback(
    async (id: string, title: string) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title } : c)),
      );
      const ok = await apiRename(id, title);
      if (!ok) refresh(); // revert to server state on failure
    },
    [refresh],
  );

  const pin = useCallback(
    async (id: string, pinned: boolean) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, pinned } : c)),
      );
      await apiSetPinned(id, pinned);
      refresh(); // re-sort (pinned group ordering is the server's call)
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      const ok = await apiDelete(id);
      if (!ok) refresh(); // restore the row from server state on failure
    },
    [refresh],
  );

  const archive = useCallback(
    async (id: string, archived: boolean) => {
      setConversations((prev) => {
        const leavesView = archivedOnly ? !archived : archived && !includeArchived;
        if (leavesView) return prev.filter((c) => c.id !== id);
        return prev.map((c) => (c.id === id ? { ...c, archived } : c));
      });
      const ok = await apiSetArchived(id, archived);
      if (!ok) refresh();
    },
    [archivedOnly, includeArchived, refresh],
  );

  const moveToFolder = useCallback(
    async (id: string, nextFolderId: string | null) => {
      setConversations((prev) => {
        if (folderId && folderId !== (nextFolderId ?? "unfiled")) {
          return prev.filter((c) => c.id !== id);
        }
        return prev.map((c) => (c.id === id ? { ...c, folderId: nextFolderId } : c));
      });
      const ok = await apiSetFolder(id, nextFolderId);
      if (!ok) refresh();
    },
    [folderId, refresh],
  );

  const bulk = useCallback(
    async (
      ids: string[],
      action: BulkAction,
      nextFolderId?: string | null,
    ): Promise<BulkUpdateResult | null> => {
      const idSet = new Set(ids);
      setConversations((prev) => {
        if (action === "delete") return prev.filter((c) => !idSet.has(c.id));
        if (action === "archive" && !archivedOnly && !includeArchived) {
          return prev.filter((c) => !idSet.has(c.id));
        }
        if (action === "unarchive" && archivedOnly) {
          return prev.filter((c) => !idSet.has(c.id));
        }
        if (action === "move" && folderId && folderId !== (nextFolderId ?? "unfiled")) {
          return prev.filter((c) => !idSet.has(c.id));
        }
        if (action === "move") {
          return prev.map((c) =>
            idSet.has(c.id) ? { ...c, folderId: nextFolderId ?? null } : c,
          );
        }
        if (action === "archive" || action === "unarchive") {
          return prev.map((c) =>
            idSet.has(c.id) ? { ...c, archived: action === "archive" } : c,
          );
        }
        return prev;
      });
      const result = await apiBulk(ids, action, nextFolderId);
      if (!result || result.skipped.length > 0) refresh();
      return result;
    },
    [archivedOnly, folderId, includeArchived, refresh],
  );

  const createFolder = useCallback(
    async (name: string) => {
      const created = await apiCreateFolder(name);
      if (created) {
        setFolders((prev) =>
          [...prev, created].sort((a, b) => a.name.localeCompare(b.name)),
        );
      }
      return created;
    },
    [],
  );

  const renameFolder = useCallback(
    async (id: string, name: string) => {
      setFolders((prev) =>
        prev.map((f) => (f.id === id ? { ...f, name } : f)),
      );
      const ok = await apiRenameFolder(id, name);
      if (!ok) refresh();
    },
    [refresh],
  );

  const deleteFolderFn = useCallback(
    async (id: string) => {
      setFolders((prev) => prev.filter((f) => f.id !== id));
      if (folderId === id) setFolderId(null);
      setConversations((prev) =>
        prev.map((c) => (c.folderId === id ? { ...c, folderId: null } : c)),
      );
      const ok = await apiDeleteFolder(id);
      if (!ok) refresh();
    },
    [folderId, refresh],
  );

  return {
    conversations,
    query,
    setQuery,
    folderId,
    setFolderId,
    archivedOnly,
    setArchivedOnly,
    includeArchived,
    setIncludeArchived,
    folders,
    refresh,
    rename,
    pin,
    remove,
    archive,
    moveToFolder,
    bulk,
    createFolder,
    renameFolder,
    deleteFolder: deleteFolderFn,
    enabled,
  };
}
