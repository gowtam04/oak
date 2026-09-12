# Oak for iPad — Shell and Adaptation

> Top-level information architecture, companion chat, orientation, compact
> width, and input methods. Personas: guest and signed-in. Depends on
> `overview.md`. Companion context chips also appear in
> `teams-workbench.md` and `reference-and-tools.md`.

## Destinations

The iPad app is organized as a **persistent leading sidebar** of
destinations. This replaces the iPhone bottom tab dock **on iPad only**.

Sidebar items, in order:

| Destination | Who | What it opens |
| --- | --- | --- |
| Chat | Everyone | Conversation list \| thread (see `chat-and-artifacts.md`) |
| Teams | Everyone (signed-in content) | Team workbench (`teams-workbench.md`) |
| Usage | Everyone | Live ladder (`reference-and-tools.md`) |
| Dex | Everyone | Champions Dex (`reference-and-tools.md`) |
| Settings | Everyone | Account / appearance / about (`reference-and-tools.md`) |

**Calculator is not a sidebar item.** It is a workspace the user **opens**
from existing entry points (slash `/calc`, a damage block’s “open in
calculator”, an “explain/expand calc” control). Closing Calc returns to
the destination that was current before Calc opened.

- **P-SHELL-US-1** — As any user, I want the five destinations reachable
  without a phone-style tab bar, so the app uses iPad’s leading-navigation
  pattern.
  - **P-SHELL-AC-1.1** — Given a full-screen landscape iPad, when the app
    is showing any destination, then a leading sidebar lists Chat, Teams,
    Usage, Dex, and Settings, and the selected item is visually distinct.
  - **P-SHELL-AC-1.2** — Chat is the default destination on launch
    (matching iPhone: chat is the primary surface).
  - **P-SHELL-AC-1.3** — Calculator is reachable from the existing calc
    entry points and is **absent** from the sidebar.
  - **P-SHELL-AC-1.4** — Switching sidebar destination does not destroy
    in-memory work in the destination you left (open team, Dex profile,
    Usage species, Chat thread) — returning shows that work still there
    for the session, consistent with iPhone tab persistence.

## Companion chat

Companion chat is **the Chat destination’s current thread**, placed beside
(or below) another workspace. It is **not** a second chat product.

- **P-SHELL-US-2** — As any user, I want to keep talking to Oak while I
  look at a team, Dex profile, usage row, or calc, so I stop flipping
  destinations.
  - **P-SHELL-AC-2.1** — Given I am in Teams, Usage, Dex, or Calc, when I
    first arrive, then companion chat is **closed** and the workspace
    uses the full canvas beside the sidebar.
  - **P-SHELL-AC-2.2** — A control on those destinations **reveals**
    companion chat. Revealing it shows the **same conversation** that is
    current in the Chat destination (the live thread, including a new
    empty thread).
  - **P-SHELL-AC-2.3** — If I leave companion open and switch among
    Teams, Usage, Dex, and Calc, it **stays open** and keeps that same
    thread. If I close it, it **stays closed** until I reveal it again.
  - **P-SHELL-AC-2.4** — Opening the Chat destination is full Chat (list
    | thread | optional inspector). Companion is not a duplicate pane
    there.
  - **P-SHELL-AC-2.5** — Opening **Teams Assistant** in the team editor
    **is** revealing companion chat while a team is open — not a second
    overlay. See `teams-workbench.md`.
  - **P-SHELL-AC-2.6** — Guests can use companion chat (chat is not
    signed-in-gated). Voice does not become available to guests.

### Context chip

- **P-SHELL-US-3** — As any user, I want the open workspace object
  attached to my next send the same way “ask about this” already works
  on iPhone, and I want to see that and dismiss it.
  - **P-SHELL-AC-3.1** — When companion is open in the team editor, the
    composer shows a dismissible chip for the **open team**.
  - **P-SHELL-AC-3.2** — When companion is open on a Dex profile, Usage
    species, or Calc workspace, the composer shows a dismissible chip
    for that **Pokémon / move / ability / item / species / calc**.
  - **P-SHELL-AC-3.3** — Sending with the chip present includes that
    object in the turn the same way iPhone “ask about this in chat”
    does. Dismissing the chip sends a general message in the same
    thread with no attached object.
  - **P-SHELL-AC-3.4** — Switching the open object (another Dex profile,
    another team, another calc) **replaces** the chip; it does not start
    a new conversation.

### Landscape vs portrait companion

- **P-SHELL-US-4** — As any user, I want companion to use width in
  landscape and height in portrait, so neither pane is a skinny strip.
  - **P-SHELL-AC-4.1** — Landscape: companion is a **leading or trailing
    column beside** the workspace (beside = not covering it). Both panes
    are independently scrollable.
  - **P-SHELL-AC-4.2** — Portrait: the **workspace is on top** and keeps
    the **larger share** of height. Companion is a **solid bottom pane**
    (not a thin bar) with the composer at the bottom of that pane.
  - **P-SHELL-AC-4.3** — The portrait split is **draggable**. The
    workspace must remain large enough to use (team slots or a profile
    still visible); the chat pane must remain large enough to show at
    least the composer plus one message.
  - **P-SHELL-AC-4.4** — A hardware keyboard must not hide the composer;
    the chat pane shrinks/scrolls so the composer sits above the
    keyboard.

### Artifacts from companion

When companion is open **outside** the Chat destination, tapping an
entity or rich block in an answer does **not** create a fourth column.

- **P-SHELL-AC-4.5** — Given companion is open beside Teams/Dex/Usage/
  Calc, when I tap an openable entity or rich block, then a **centered
  panel** opens over the workspace with that artifact and the existing
  back stack. Companion stays visible. Dismissing the panel returns to
  the workspace. (In the Chat destination, artifacts use the inspector
  column — `chat-and-artifacts.md`.)

## Compact width, Mini, Split View, Stage Manager

The app **never switches to the iPhone UI** on iPad, including iPad Mini
and a skinny Stage Manager / Split View window.

- **P-SHELL-US-5** — As any user, I want Oak to remain an iPad app when
  the window is narrow, so resize does not swap chrome.
  - **P-SHELL-AC-5.1** — On every iPad that runs the app’s minimum iOS
    version, **including Mini**, the shell is the iPad shell.
  - **P-SHELL-AC-5.2** — When width is insufficient for a persistent
    sidebar, the sidebar becomes a **compact rail or overlay** that can
    be revealed and dismissed. Destinations remain the same five items.
  - **P-SHELL-AC-5.3** — When width is insufficient for two columns,
    list | detail (or canvas | inspector, or companion | workspace)
    **stacks** using the portrait rule (primary work on top, secondary
    below).
  - **P-SHELL-AC-5.4** — Chat’s three panes drop in this order: **hide
    the conversation list first** (reachable via a control / overlay),
    keep thread | inspector; then **stack the inspector under the
    thread** (thread keeps the larger share). Never require horizontal
    panning across three skinny columns.
  - **P-SHELL-AC-5.5** — Resize, rotate, Split View, and Stage Manager
    **do not reset** the open conversation, team, Dex profile, Usage
    species, Calc scenario, inspector back stack, companion
    open/closed state, or composer draft.
  - **P-SHELL-AC-5.6** — There is **no dedicated external-display
    layout**. Extra windows the system may create are out of scope to
    design (`operational.md`); a single Oak window always follows these
    collapse/stack rules.

## Overlay / panel lifetime

Centered panels: sign-in, OTP, Showdown import, add-to-team, compare
picker, update prompt, artifact-from-companion, and equivalent dialogs.

- **P-SHELL-US-6** — As any user, I want overlays to get out of the way
  when I change destination, but not when I merely rotate.
  - **P-SHELL-AC-6.1** — Switching Chat / Teams / Usage / Dex / Settings
    / Calc **dismisses** the open centered panel. Underlying work and
    companion open/closed state remain.
  - **P-SHELL-AC-6.2** — Rotation and resize **do not** dismiss the
    panel; it reflows.
  - **P-SHELL-AC-6.3** — System dismiss (tap outside, swipe, Escape on
    a hardware keyboard) dismisses the panel without applying a pending
    destructive action (same as cancelling today’s sheets).

## Inputs

- **P-SHELL-US-7** — As a desk user, I want keyboard, trackpad, and
  drag-and-drop to drive existing actions, so I am not stuck in
  phone-only gestures.
  - **P-SHELL-AC-7.1** — A hardware keyboard types into the focused
    field (composer, search, OTP, editors). OTP supports system
    one-time-code autofill as on iPhone.
  - **P-SHELL-AC-7.2** — Trackpad/pointer: primary click performs the
    same action as a tap; secondary click performs the same action as
    the existing long-press / context menu. Scrolling works on every
    scrollable pane. **No hover-only action** exists (hover may
    highlight; it must not be the only way to reach a control).
  - **P-SHELL-AC-7.3** — Dragging one or more photos onto the chat
    composer attaches them, subject to the existing **≤4 images per
    turn** cap and the same type/size rejection messages as the library
    picker (`chat-and-artifacts.md`).
  - **P-SHELL-AC-7.4** — Dropping a non-image, or a fifth image, is
    **rejected with a visible message**. Nothing is silently attached.
  - **P-SHELL-AC-7.5** — Keyboard **shortcuts** (New Chat, toggle
    companion, search Dex, etc.) are **out of scope**. Return-to-send
    in the composer follows the same rule the iPhone composer already
    uses; this is not a new shortcut suite.

Apple Pencil: system scribble in text fields may work if the OS provides
it. **No Pencil-specific features** are designed.

## Business rules

- **P-SHELL-BR-1** — **Chat is the default destination** on launch.
- **P-SHELL-BR-2** — **One live conversation** is shared between the Chat
  destination and companion chat. Companion never silently starts a
  second thread.
- **P-SHELL-BR-3** — Companion is **off by default** when entering
  Teams, Usage, Dex, or Calc. Open/closed is remembered across those
  destinations until the user changes it or the session ends.
- **P-SHELL-BR-4** — **Never use the iPhone UI** on iPad idiom, at any
  size or orientation.
- **P-SHELL-BR-5** — **Calculator is a workspace**, not a sixth
  destination in the sidebar.
- **P-SHELL-BR-6** — Sign-in-gated destinations stay **visible** in the
  sidebar for guests (see `auth-and-permissions.md`).
- **P-SHELL-BR-7** — Destination switches dismiss centered panels;
  orientation/size changes do not.

## Cross-links

- Chat inspector vs companion artifact panel: `chat-and-artifacts.md`
- Teams Assistant = companion: `teams-workbench.md`
- Pointer, chrome, a11y: `ui-and-experience.md`
