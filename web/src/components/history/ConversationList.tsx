"use client";

/**
 * ConversationList — the signed-in history sidebar (chat-history Phase 6).
 *
 * A search field and the conversations grouped
 * pinned-first then most-recently-active (HIST-US-3, 6, 10, 11). Renders a
 * clear empty state (no conversations yet) and a distinct no-results state
 * (search/filter matched nothing). Purely presentational — all state + data
 * come from the parent (which wires the `useConversations` hook).
 *
 * "New chat" itself lives in `AppNav` now (nav refactor Part 1) — the
 * `onNewChat` prop here only powers the empty-state CTA ("Start your first
 * chat"), not a dedicated button of its own.
 */

import { useState } from "react";

import type { BulkAction, ConversationSummary } from "@/lib/api/history-client";
import type { Folder } from "@/lib/api/folder-client";
import ConversationRow from "./ConversationRow";

export interface ConversationListProps {
  conversations: ConversationSummary[];
  activeId: string | null;
  query: string;
  onQueryChange: (q: string) => void;
  onNewChat: () => void;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onDelete: (id: string) => void;
  folders?: Folder[];
  folderId?: string | null;
  archivedOnly?: boolean;
  includeArchived?: boolean;
  selectedIds?: string[];
  onFolderChange?: (id: string | null) => void;
  onArchivedOnlyChange?: (v: boolean) => void;
  onIncludeArchivedChange?: (v: boolean) => void;
  onToggleSelect?: (id: string) => void;
  onBulk?: (action: BulkAction, folderId?: string | null) => void;
  onArchive?: (id: string, archived: boolean) => void;
  onMoveToFolder?: (id: string, folderId: string | null) => void;
  onCreateFolder?: (name: string) => void;
  onRenameFolder?: (id: string, name: string) => void;
  onDeleteFolder?: (id: string) => void;
  onExport?: (format: "md" | "pdf") => void;
}

export default function ConversationList({
  conversations,
  activeId,
  query,
  onQueryChange,
  onNewChat,
  onOpen,
  onRename,
  onPin,
  onDelete,
  folders,
  folderId = null,
  archivedOnly = false,
  includeArchived = false,
  selectedIds,
  onFolderChange,
  onArchivedOnlyChange,
  onIncludeArchivedChange,
  onToggleSelect,
  onBulk,
  onArchive,
  onMoveToFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onExport,
}: ConversationListProps) {
  const [confirmingBulk, setConfirmingBulk] = useState(false);
  const [confirmingFolderId, setConfirmingFolderId] = useState<string | null>(
    null,
  );
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [folderDraft, setFolderDraft] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const pinned = conversations.filter((c) => c.pinned);
  const recent = conversations.filter((c) => !c.pinned);
  const filtersActive = query.trim().length > 0;
  const selectedCount = selectedIds?.length ?? 0;
  const showOrganize =
    onFolderChange != null ||
    onArchivedOnlyChange != null ||
    (folders != null && folders.length > 0);

  const row = (c: ConversationSummary) => (
    <ConversationRow
      key={c.id}
      conversation={c}
      active={c.id === activeId}
      onOpen={() => onOpen(c.id)}
      onRename={(title) => onRename(c.id, title)}
      onPin={(p) => onPin(c.id, p)}
      onDelete={() => onDelete(c.id)}
      onArchive={onArchive ? (archived) => onArchive(c.id, archived) : undefined}
      onMoveToFolder={
        onMoveToFolder ? (fid) => onMoveToFolder(c.id, fid) : undefined
      }
      onToggleSelect={onToggleSelect ? () => onToggleSelect(c.id) : undefined}
      selected={selectedIds?.includes(c.id)}
      folders={folders}
    />
  );

  const heading = (text: string) => (
    <div className="conv-list__heading">{text}</div>
  );

  return (
    <nav
      className="conv-list"
      data-testid="conversation-list"
      aria-label="Conversation history"
    >
      <input
        type="search"
        className="conv-list__search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search conversations…"
        aria-label="Search conversations"
      />

      {showOrganize && (
        <div className="conv-list__views">
          <button
            type="button"
            className="conv-list__view"
            aria-pressed={folderId == null && !archivedOnly}
            onClick={() => {
              onFolderChange?.(null);
              onArchivedOnlyChange?.(false);
            }}
          >
            All
          </button>
          <button
            type="button"
            className="conv-list__view"
            aria-pressed={folderId === "unfiled" && !archivedOnly}
            onClick={() => {
              onFolderChange?.("unfiled");
              onArchivedOnlyChange?.(false);
            }}
          >
            Unfiled
          </button>
          {(folders ?? []).map((folder) => (
            <span key={folder.id} className="conv-list__folder">
              {renamingFolderId === folder.id ? (
                <input
                  className="conv-list__folder-rename"
                  aria-label={`Rename folder ${folder.name}`}
                  value={folderDraft}
                  onChange={(e) => setFolderDraft(e.target.value)}
                  onBlur={() => {
                    const next = folderDraft.trim();
                    if (next && next !== folder.name) {
                      onRenameFolder?.(folder.id, next);
                    }
                    setRenamingFolderId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setRenamingFolderId(null);
                  }}
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  className="conv-list__view"
                  aria-pressed={folderId === folder.id && !archivedOnly}
                  onClick={() => {
                    onFolderChange?.(folder.id);
                    onArchivedOnlyChange?.(false);
                  }}
                >
                  {folder.name}
                </button>
              )}
              {onRenameFolder && (
                <button
                  type="button"
                  className="conv-list__folder-act"
                  aria-label={`Rename folder ${folder.name}`}
                  onClick={() => {
                    setRenamingFolderId(folder.id);
                    setFolderDraft(folder.name);
                  }}
                >
                  ✎
                </button>
              )}
              {onDeleteFolder &&
                (confirmingFolderId === folder.id ? (
                  <button
                    type="button"
                    className="conv-list__folder-act conv-list__folder-act--danger"
                    aria-label={`Confirm delete folder ${folder.name}`}
                    onClick={() => {
                      onDeleteFolder(folder.id);
                      setConfirmingFolderId(null);
                    }}
                    title="Chats will become unfiled, not deleted."
                  >
                    Unfile chats?
                  </button>
                ) : (
                  <button
                    type="button"
                    className="conv-list__folder-act"
                    aria-label={`Delete folder ${folder.name}`}
                    onClick={() => setConfirmingFolderId(folder.id)}
                  >
                    🗑
                  </button>
                ))}
            </span>
          ))}
          <button
            type="button"
            className="conv-list__view"
            aria-pressed={archivedOnly}
            onClick={() => {
              onArchivedOnlyChange?.(true);
              onFolderChange?.(null);
            }}
          >
            Archive
          </button>
        </div>
      )}

      {onCreateFolder && (
        <form
          className="conv-list__new-folder"
          onSubmit={(e) => {
            e.preventDefault();
            const name = newFolderName.trim();
            if (!name) return;
            onCreateFolder(name);
            setNewFolderName("");
          }}
        >
          <input
            className="conv-list__new-folder-input"
            aria-label="New folder name"
            placeholder="New folder"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
          />
          <button type="submit" className="conv-list__view">
            Create folder
          </button>
        </form>
      )}

      {filtersActive && onIncludeArchivedChange && (
        <label className="conv-list__include">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => onIncludeArchivedChange(e.target.checked)}
          />
          Include archived
        </label>
      )}

      {selectedCount > 0 && onBulk && (
        <div className="conv-list__bulk">
          {confirmingBulk ? (
            <button
              type="button"
              className="conv-list__bulk-btn conv-list__bulk-btn--danger"
              onClick={() => {
                onBulk("delete");
                setConfirmingBulk(false);
              }}
            >
              Confirm
            </button>
          ) : (
            <button
              type="button"
              className="conv-list__bulk-btn"
              onClick={() => setConfirmingBulk(true)}
            >
              Delete selected
            </button>
          )}
          {archivedOnly ? (
            <button
              type="button"
              className="conv-list__bulk-btn"
              onClick={() => onBulk("unarchive")}
            >
              Unarchive selected
            </button>
          ) : (
            <button
              type="button"
              className="conv-list__bulk-btn"
              onClick={() => onBulk("archive")}
            >
              Archive selected
            </button>
          )}
          <span className="conv-list__bulk-move">
            <button
              type="button"
              className="conv-list__bulk-btn"
              aria-expanded={bulkMoveOpen}
              onClick={() => setBulkMoveOpen((o) => !o)}
            >
              Move selected
            </button>
            {bulkMoveOpen && (
              <div className="conv-list__bulk-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="conv-list__bulk-item"
                  onClick={() => {
                    onBulk("move", null);
                    setBulkMoveOpen(false);
                  }}
                >
                  Unfiled
                </button>
                {(folders ?? []).map((folder) => (
                  <button
                    key={folder.id}
                    type="button"
                    role="menuitem"
                    className="conv-list__bulk-item"
                    onClick={() => {
                      onBulk("move", folder.id);
                      setBulkMoveOpen(false);
                    }}
                  >
                    {folder.name}
                  </button>
                ))}
              </div>
            )}
          </span>
        </div>
      )}

      {onExport && activeId && (
        <div className="conv-list__export">
          <button
            type="button"
            className="conv-list__bulk-btn"
            onClick={() => onExport("md")}
          >
            Export Markdown
          </button>
          <button
            type="button"
            className="conv-list__bulk-btn"
            onClick={() => onExport("pdf")}
          >
            Export PDF
          </button>
        </div>
      )}

      <div className="conv-list__scroll">
        {conversations.length === 0 ? (
          <div data-testid="history-empty" className="conv-list__empty">
            {filtersActive ? (
              <p className="conv-list__empty-text">
                No conversations match your search.
              </p>
            ) : (
              <>
                <p className="conv-list__empty-text">No conversations yet.</p>
                <button
                  type="button"
                  className="conv-list__empty-cta"
                  data-testid="history-empty-cta"
                  onClick={onNewChat}
                >
                  Start your first chat
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {pinned.length > 0 && (
              <>
                {heading("Pinned")}
                {pinned.map(row)}
              </>
            )}
            {recent.length > 0 && (
              <>
                {pinned.length > 0 && heading("Recent")}
                {recent.map(row)}
              </>
            )}
          </>
        )}
      </div>
    </nav>
  );
}
