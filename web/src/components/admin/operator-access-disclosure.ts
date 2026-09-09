/**
 * Privacy-policy disclosures that must stay lock-step with product behavior.
 *
 * Single source of truth for:
 *  - operator-access / usage-recording copy (ADMIN-BR-7, AD-3)
 *  - user-published public snapshots (SHARE-BR-4, AUTH-BR-2, CQ-OQ-1)
 *
 * The public privacy page (`src/app/privacy/page.tsx`) embeds these markdown
 * strings verbatim, and `operator-access-disclosure.test.tsx` pins that the
 * load-bearing facts are present. Keeping them here — next to the admin code
 * whose behavior the operator-access copy discloses, and as the one module the
 * privacy page already imports — means the disclosure can't silently drift.
 *
 * They are plain string constants (no React, no `server-only`, no env/db
 * imports), so they are safe to import into the public, statically-rendered
 * privacy page.
 *
 * Operator-access copy must disclose (honest, plain copy):
 *  - Oak persists ONE record per chat turn — the user's message text AND Oak's
 *    answer — for EVERY turn, signed-in AND guest (ADMIN-BR-6/7, AD-3).
 *  - A voice turn may later hold a full structured answer (same operator
 *    read as text chat). Do not describe voice as transcript-only.
 *  - Oak persists one record per auth event (code requested/verified/failed).
 *  - These records are retained INDEFINITELY (no prune job — AD-3).
 *  - The single owner/operator can READ them, including guest and account
 *    conversations, through a private admin-only dashboard (ADMIN-BR-4).
 *
 * Public-snapshot copy must disclose (do not invent extra policy):
 *  - A signed-in user can publish a snapshot of one question + Oak's answer
 *    to anyone with the link (AUTH-BR-2).
 *  - The page is noindex (SHARE-BR-4).
 *  - The owner can revoke.
 *  - Live shares are deleted with the account (CQ-OQ-1).
 *  - Operator visibility of turns is unchanged.
 */
export const OPERATOR_ACCESS_DISCLOSURE_MARKDOWN = `## Operational records and operator access

To run Oak reliably — to understand how it is being used, what it costs, and
where it is failing — Oak keeps an internal operational record of activity:

- **One record per chat turn.** Each time you send a message and Oak replies,
  Oak stores a record of that turn: your message text and Oak's answer, the model
  and game format used, token counts, timing, and the tools Oak called. This
  happens for every turn, whether you are signed in or using Oak as a guest. (The
  images themselves are never stored — Oak keeps only a count of how many images a
  message included.) A voice turn may later hold a full structured answer, which
  the operator can read the same way as a text-chat answer.
- **One record per sign-in event.** When a one-time sign-in code is requested,
  verified, or fails to send, Oak stores a small record of that event — the email
  involved and the outcome.

These operational records are retained **indefinitely** and can be read by Oak's
**operator** — the single owner who runs the service — through a private,
administrator-only dashboard. For this purpose the operator can read the
conversations and questions of both signed-in and guest users. This information
is never shown to any other user, and Oak still does not sell your personal
information or use it for advertising.`;

export const PUBLIC_SNAPSHOT_DISCLOSURE_MARKDOWN = `## Public share links

If you are signed in, you can publish a snapshot of one turn — your question
and Oak's answer — to a public link. Anyone with that link can view the
snapshot; they do not need an Oak account.

- **Question and answer.** The public page shows the question you asked and
  Oak's answer. The page is marked **noindex** so search engines are asked not
  to list it.
- **You can revoke a link.** As the owner, you can revoke a share at any time.
  The page then becomes unavailable.
- **Deleted with your account.** If you delete your account, your public share
  links are deleted with it and become unavailable.

Publishing a snapshot does not change the operator's access to chat turns
described above.`;
