/**
 * The privacy-policy disclosure required by the admin panel (ADMIN-BR-7, AD-3).
 *
 * Single source of truth for the operator-access / usage-recording copy: the
 * public privacy page (`src/app/privacy/page.tsx`) embeds this markdown verbatim,
 * and `operator-access-disclosure.test.tsx` pins that the load-bearing facts are
 * present. Keeping it here — next to the admin code whose behavior it discloses —
 * means the disclosure can't silently drift away from what the panel actually does.
 *
 * It is a plain string constant (no React, no `server-only`, no env/db imports),
 * so it is safe to import into the public, statically-rendered privacy page.
 *
 * What it must disclose (honest, plain copy):
 *  - Oak persists ONE record per chat turn — the user's message text AND Oak's
 *    answer — for EVERY turn, signed-in AND guest (ADMIN-BR-6/7, AD-3).
 *  - Oak persists one record per auth event (code requested/verified/failed).
 *  - These records are retained INDEFINITELY (no prune job — AD-3).
 *  - The single owner/operator can READ them, including guest and account
 *    conversations, through a private admin-only dashboard (ADMIN-BR-4).
 */
export const OPERATOR_ACCESS_DISCLOSURE_MARKDOWN = `## Operational records and operator access

To run Oak reliably — to understand how it is being used, what it costs, and
where it is failing — Oak keeps an internal operational record of activity:

- **One record per chat turn.** Each time you send a message and Oak replies,
  Oak stores a record of that turn: your message text and Oak's answer, the model
  and game format used, token counts, timing, and the tools Oak called. This
  happens for every turn, whether you are signed in or using Oak as a guest. (The
  images themselves are never stored — Oak keeps only a count of how many images a
  message included.)
- **One record per sign-in event.** When a one-time sign-in code is requested,
  verified, or fails to send, Oak stores a small record of that event — the email
  involved and the outcome.

These operational records are retained **indefinitely** and can be read by Oak's
**operator** — the single owner who runs the service — through a private,
administrator-only dashboard. For this purpose the operator can read the
conversations and questions of both signed-in and guest users. This information
is never shown to any other user, and Oak still does not sell your personal
information or use it for advertising.`;
