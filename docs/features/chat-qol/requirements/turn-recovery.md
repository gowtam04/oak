# Chat QoL — Turn recovery

Retry the last answer, edit the last user message, undo a just-sent
message. Serves guests and signed-in users on web, iOS, and Android.

Depends on: existing background-turns (one in-flight turn per
conversation; Stop discards and does not persist), existing Stop +
restore-typed-message path.

## User stories

### REC-US-1 — Retry / regenerate the last answer

As a guest or signed-in user, I want to regenerate the last assistant
answer so that a thin answer or a bad scope guess does not force me to
retype the question.

- **REC-AC-1.1** — Given the conversation’s last turn is a completed
  assistant answer and no turn is in flight, when I choose Retry on
  that card, then Oak starts a **new** turn with the same user text,
  the same images if they are still attached to that turn, and the same
  scope seed that turn used.
- **REC-AC-1.2** — Given I have tapped Retry, when the new turn is
  running, then the previous assistant card stays visible until the new
  answer is successfully delivered.
- **REC-AC-1.3** — Given a retry succeeds, when the new answer is
  delivered, then that new answer **replaces** the previous assistant
  card for that last question. The thread still has exactly one
  assistant answer for that last user message.
- **REC-AC-1.4** — Given a retry fails (transport fault) or is Stopped,
  when the turn ends, then the previous assistant answer is still
  shown and is still the last answer in the thread. The failed/stopped
  retry is not persisted (inherits chat-history **BR-H2** for signed-in;
  guests keep the same discard rule).
- **REC-AC-1.5** — Given the last assistant turn is a voice turn, when I
  Retry, then the new turn is a **text** turn whose user message is
  that turn’s transcript. It is not a new voice session.
- **REC-AC-1.6** — Given the last turn originally had images and those
  images are no longer available (thread was reopened; images were
  never persisted), when I Retry, then the turn sends the text only and
  the UI states that the pictures will not be attached.
- **REC-AC-1.7** — Given a turn is already in flight on this
  conversation, when I look at the last assistant card, then Retry is
  not offered. Retry is only on the **last** assistant card, never on
  older cards.

### REC-US-2 — Edit last message and resend

As a guest or signed-in user, I want to edit the last user message so
that a typo or a missing generation name does not burn a whole turn.

- **REC-AC-2.1** — Given the conversation has at least one user
  message, when I choose Edit on the last user message, then I can
  change its text (and any images still attached to that turn) and
  resend. Earlier turns are not editable and are not removed.
- **REC-AC-2.2** — Given a turn is in flight on this conversation, when
  I confirm an edit of the last user message, then that in-flight turn
  is Stopped (discarded, not persisted) and a new turn starts with the
  edited message.
- **REC-AC-2.3** — Given the last pair is a completed user message plus
  assistant answer, when I resend an edit, then that pair stays visible
  until the new turn succeeds. On success, the pair is **replaced** by
  the edited user message and the new assistant answer.
- **REC-AC-2.4** — Given an edited turn is Stopped or fails, when it
  ends, then the previous pair is still the last pair in the thread,
  and the composer still holds the edited text (and any images that
  were being sent).
- **REC-AC-2.5** — Given the last user turn is a voice transcript, when
  I Edit and resend, then the new turn is a text turn with the edited
  transcript. It is not a new voice session.
- **REC-AC-2.6** — Given the last user turn had images that are no
  longer available, when I Edit, then I can edit the text only, and
  the UI states that the pictures will not be attached unless I attach
  new ones through the existing attach path.
- **REC-AC-2.7** — Given I am looking at an older user message (not the
  last), when I inspect it, then there is no Edit control. Fork is how
  an alternate line starts from an earlier point (see
  [organize.md](./organize.md)).

### REC-US-3 — Undo send

As a guest or signed-in user, I want a short undo on a just-sent
message so that an accidental send (especially with images on iOS)
does not start a turn I did not want.

- **REC-AC-3.1** — Given I have just sent a user message, when fewer
  than about **three seconds** have passed, then the just-sent user
  bubble offers Undo.
- **REC-AC-3.2** — Given I choose Undo inside that window, when the
  action completes, then the in-flight turn is cancelled via the
  existing Stop path (not persisted, not recorded as a completed
  answer), and the text and images are back in the composer.
- **REC-AC-3.3** — Given more than about three seconds have passed, or
  I have navigated away from the bubble, when I look at that user
  bubble, then Undo is gone. Stop remains available while the turn is
  in flight; Edit remains available after the turn completes.
- **REC-AC-3.4** — Given Undo runs, when the composer is restored, then
  images that were on that send are restored too — they never left the
  composer path.

## Business rules

- **REC-BR-1 — Last-turn-only mutation.** Retry applies only to the
  last assistant answer. Edit applies only to the last user message.
  Older cards are read-only for these actions.
- **REC-BR-2 — Replace-on-success, keep-on-failure.** A retry or an
  edit replaces the last pair only after a successfully delivered
  answer. Stop, transport failure, or in-domain abort of the new turn
  leaves the previous pair in place.
- **REC-BR-3 — One in-flight turn per conversation.** Retry, edit, and
  undo use the existing turn-store rule (one turn per conversation).
  They never start a second concurrent turn on the same thread.
- **REC-BR-4 — Stop and undo are discards.** An undone or stopped turn
  is not persisted and does not become history (inherits **BR-H2**).
  A completed retry or edit **is** a completed ask and appears as the
  current last pair.
- **REC-BR-5 — Same inputs as the original send, when available.**
  Retry resends the same user text, remaining images, and the scope
  seed that turn used. It does not invent a new scope. Edit may change
  text and still-attached images; scope seed is the conversation’s
  current sticky/chip scope unless the edited text contains an
  in-message scope signal (existing resolver precedence unchanged).
- **REC-BR-6 — Voice becomes text.** Retry and edit of a voice turn
  always produce a text turn from the transcript. They do not reopen
  the realtime voice session.
- **REC-BR-7 — Missing images are explicit.** If consume-on-turn images
  are gone, retry/edit proceed as text-only and the user is told the
  pictures will not be attached. The turn is not silently sent as if
  the images were still there.
- **REC-BR-8 — Guests and signed-in both get recovery.** Retry, edit,
  and undo are not gated on an account. Guest durability remains
  session-only (chat-history **BR-H1**).

## Edge, empty, and conflict states

| State | Behavior |
|---|---|
| Empty conversation (no turns) | No Retry, Edit, or Undo. |
| Turn in flight | Undo available ~3s on the just-sent bubble; Stop available; Retry hidden; Edit of last user message Stops then resends. |
| Last turn is an error/stopped with no persisted pair | Nothing to Retry. Composer may still hold restored text from Stop. |
| Conversation 409 `turn_in_progress` from another tab/device | Existing conflict UI. Recovery actions cannot start a second turn. |
| Rate limit on retry/edit | Existing rate-limit error. Previous pair remains (REC-BR-2). |
| Owner concurrency cap (3) | Existing 429. Previous pair remains. |

## Out of this file

Pin, fork, share, and copy on older cards — [organize.md](./organize.md)
and [leave-the-app.md](./leave-the-app.md). Persist-images — out of pack.
