# Damage calculator

Depends on: [data-and-entities.md](./data-and-entities.md),
[persisted-artifacts.md](./persisted-artifacts.md),
[auth-and-permissions.md](./auth-and-permissions.md).

Personas: guest and signed-in. No model turn is required to compute.

## Why

The highest-frequency competitive question should not cost a chat
turn. Oak already has a portable damage estimator. Chat is the slow
way to use it. This file specifies the **standalone calculator** and
the hops that prefill it.

This is an **honest subset**, not Smogon-calc parity. Results are
**estimates**. “Explain this calc” is how the model enters.

## User stories

### Reaching the calculator

- **CALC-US-1** — As a guest or signed-in user, I want a first-class
  Calculator screen so I can run a matchup without asking Oak.
  - **CALC-AC-1.1** — Given I open Calculator from app navigation /
    the dedicated destination, when it loads, then I see two empty
    sides (attacker / defender), a move control, documented field
    knobs, and the current **scope** (inherited from the header
    scope chip / last-used scope). I can pick species and proceed
    without sending a chat message.
  - **CALC-AC-1.2** — The dedicated destination exists on web, iOS,
    and Android.

- **CALC-US-2** — As a guest or signed-in user, I want hops from chat
  to open a compact overlay on that thread so I do not lose the
  answer.
  - **CALC-AC-2.1** — Given an answer contains a `damage_calc`
    section, when I choose **Open in calculator**, then a compact
    calculator overlay opens on that conversation, prefilled with
    attacker, defender, move, and the assumptions the answer used
    (species, set fields present in the block, field knobs the block
    named, format tag).
  - **CALC-AC-2.2** — Given I open the calculator from a team slot or
    from a Pokémon artifact, when the overlay opens, then that
    species/set prefills **one side** (attacker if unspecified). The
    other side stays empty until I pick it.
  - **CALC-AC-2.3** — The overlay has an **Expand** control that
    opens the first-class Calculator screen with the same configured
    scenario.
  - **CALC-AC-2.4** — Dismissing the overlay does not send a chat
    turn and does not change the conversation.

- **CALC-US-3** — As a guest or signed-in user, I want `/calc` to open
  the calculator and prefill when the words resolve.
  - **CALC-AC-3.1** — Given I submit `/calc` with no extra words, when
    send would have happened, then the chat overlay opens on the
    current conversation with the current scope. **No chat turn is
    posted.**
  - **CALC-AC-3.2** — Given I submit
    `/calc garchomp earthquake vs gholdengo`, when both species and
    the move resolve in the current scope, then the overlay opens
    with those sides and that move filled. No chat turn is posted.
  - **CALC-AC-3.3** — Given some tokens do not resolve, when I
    submit, then the overlay still opens; unresolved sides/move stay
    empty; nothing is sent to the model; there is no error toast
    that blocks opening.
  - **CALC-AC-3.4** — `/calc` is a **handled slash** in this pack. It
    supersedes Chat QoL’s rule that `/calc` is unknown text
    (`SLASH-BR-1` in that pack). Other slashes are unchanged.

### Configuring and reading a result

- **CALC-US-4** — As a guest or signed-in user, I want to change the
  full set, move, and documented field knobs without another chat
  turn.
  - **CALC-AC-4.1** — Each side exposes species, ability, item,
    nature, EVs, IVs, Tera, and level. The move is separate. Field
    knobs listed in **CALC-BR-3** are exposed.
  - **CALC-AC-4.2** — Changing any exposed knob recomputes the
    result without a model call.
  - **CALC-AC-4.3** — A named ability or item that is **not** on the
    supported list is visible on the set and labeled **not modeled**.
    It does not silently apply a 1.0 modifier as if it had been
    computed.
  - **CALC-AC-4.4** — The result is always labeled an **estimate**.

- **CALC-US-5** — As a guest or signed-in user, I want rolls, percent,
  and KO chance for the configured defender.
  - **CALC-AC-5.1** — Given both sides and a damaging move are
    configured, when the estimate succeeds, then I see the damage
    range (min–max), that range as a percent of the defender’s HP,
    and a KO chance (e.g. OHKO / 2HKO language tied to that range).
  - **CALC-AC-5.2** — Given the defender’s EVs are still the
    calculator’s default spread (user has not edited them), when a
    result is shown, then a short table of common defensive spreads
    (min / bulky / max — the product’s existing common-spread
    convention if one exists, otherwise 0 HP / 252+ HP / 252+ Def or
    SpD as appropriate) is also shown. Editing defender EVs removes
    that extra table and shows only the configured calc.
  - **CALC-AC-5.3** — Given a move deals no damage (status, or 0×
    type), when I compute, then the UI says so honestly. It does not
    invent a damage range.
  - **CALC-AC-5.4** — Given a required input is missing (no species
    on a side, no move), when I look at the result area, then I see
    an empty/incomplete state, not a fabricated 0.

- **CALC-US-6** — As a guest or signed-in user, I want format to
  follow where I came from, and to be changeable.
  - **CALC-AC-6.1** — Opened from a damage block → that answer’s
    format. Opened from a team slot → that team’s format. Opened
    standalone or via `/calc` → current scope chip / last-used
    scope.
  - **CALC-AC-6.2** — The format is visible on the calc. Changing it
    recalculates (and re-resolves species/move against that format).
    A species that does not exist in the new format is an honest
    unresolved state on that side, not a silent keep.
  - **CALC-AC-6.3** — All eleven Oak scopes are offered. For scopes
    whose old-gen formulas are not actually modeled, the calc still
    produces the modern estimate and shows a **loud caveat** that
    the number is not gen-accurate.

- **CALC-US-7** — As a guest or signed-in user, I want a sensible
  default level when the hop did not specify one.
  - **CALC-AC-7.1** — VGC / doubles-style contexts and Champions
    default to **50**. Other mainline / national-dex singles-style
    scopes default to **100**. The control is always visible and
    editable. A hop that named a level wins over the default.

### Explain, artifact, pin

- **CALC-US-8** — As a guest or signed-in user, I want Oak to explain
  the configured scenario in chat.
  - **CALC-AC-8.1** — Given a configured matchup, when I choose
    **Explain this calc**, then a **new chat turn is sent** on the
    **current conversation** whose user message describes the exact
    attacker, defender, sets, move, field knobs, format, and the
    displayed estimate. I do not have to edit the composer first.
  - **CALC-AC-8.2** — The calculator overlay/screen stays as
    configured. Explain does not close or reset it.
  - **CALC-AC-8.3** — Explain is a normal ask: it counts as a turn,
    honors one-turn-per-conversation, and produces a normal answer
    card. If a turn is already running, the existing
    `turn_in_progress` behavior applies (no second silent generate).

- **CALC-US-9** — As a guest or signed-in user, I want a finished calc
  to be an artifact I can keep beside chat (and pin if signed in).
  - **CALC-AC-9.1** — A damage-calc artifact type exists in the
    viewer. Opening a damage block in the viewer still shows the
    read-only breakdown. A calculator result can also sit in the
    viewer with the same configured scenario.
  - **CALC-AC-9.2** — Signed-in pin of a calc follows
    [persisted-artifacts.md](./persisted-artifacts.md). Guests can
    keep a calc open in-session only.

## Functional requirements

- Formulas compute **without a model**. Species / move / ability /
  item pickers use Oak’s existing index for the selected format
  (same class of read as Dex).
- Every result carries the estimate label and the format tag.
- Documented field knobs (**CALC-BR-3**) are first-class toggles, not
  a hidden “other modifier” the user types.
- Prefill from a damage block copies the agent’s stated assumptions
  so the first paint matches the card. The user may then diverge.

## Business rules

- **CALC-BR-1 — No model to compute.** Opening, editing, and
  displaying rolls never calls the agent. Only **Explain this calc**
  starts a turn.
- **CALC-BR-2 — Estimate, never a presented exact.** The 0.85–1.0
  roll range and KO language stay qualified as estimates.
- **CALC-BR-3 — Documented supported field subset.** Supported knobs:
  - Weather: sun, rain, sand, snow (and off).
  - Screens: Reflect, Light Screen (and off).
  - Items that apply a known offensive modifier: Life Orb, Choice
    Band, Choice Specs, Expert Belt.
  Any other item or ability the user can put on a set is **shown
  and labeled not modeled**. It must not be applied as if the math
  included it.
- **CALC-BR-4 — `/calc` is not a chat turn.** Handled `/calc` never
  POSTs a user message. Unparsed leftover words still open the calc.
- **CALC-BR-5 — Format is visible and inherited, then user-owned.**
  Inheritance is CALC-AC-6.1. After the user changes format, the
  calc keeps that format until they change it again or reopen from a
  hop that supplies a different one.
- **CALC-BR-6 — Old-gen is caveated, not blocked.** Every scope is
  offered. Missing old-gen formula variants still show the modern
  estimate with a loud, persistent caveat. They do not fail closed
  and they do not pretend to be gen-accurate.
- **CALC-BR-7 — Default level is format-aware.** Level 50 for
  Champions and VGC/doubles-style; level 100 otherwise; hop-supplied
  level wins.
- **CALC-BR-8 — Incomplete input does not invent damage.** Missing
  species, move, or stats → empty/error state, never a fake 0 HP
  roll presented as a result.

## Edge, empty, and failure states

- **Index unavailable / species unresolved:** that side shows
  couldn’t-load / unresolved, matching Dex/artifact honesty. The
  other side remains editable.
- **Scope change mid-calc:** user-initiated format change as
  CALC-AC-6.2. A header chip change on the conversation does **not**
  silently rewrite an already-open overlay; the overlay keeps its
  own format until the user changes it or reopens a hop.
- **Guest and signed-in:** same calculator. Pin is signed-in only.
- **Overlay + full screen both open conceptually:** Expand replaces
  the overlay with the full screen carrying the same scenario. Back
  from full screen opened via Expand returns to the conversation
  (overlay dismissed).
- **Explain while rate-limited:** existing rate-limit UX; calculator
  stays usable.

## Out of this file

Smogon-calc parity, inverse “what EVs to OHKO,” stat/catch/breed
calculators, `/compare`, and a fifth primary tab if architecture can
reach Calculator without one (see
[ui-and-experience.md](./ui-and-experience.md)) are out of scope.
