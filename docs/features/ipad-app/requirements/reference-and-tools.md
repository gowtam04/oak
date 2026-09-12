# Oak for iPad — Dex, Usage, Calculator, and Settings

> Tablet layouts for the remaining destinations and the Calc workspace.
> Data and verbs match the current iPhone app. Personas: guest and
> signed-in (Dex/Usage/Calc are public; some Settings rows are
> signed-in). Depends on `shell-and-adaptation.md`.

## Dex

Index | profile. Pokémon profiles include the existing live Usage data
as a **section**, not a new product.

- **P-DEX-US-1** — As any user, I want to browse Pokémon, moves,
  abilities, and items beside a full profile, so Dex is a Pokédex
  spread rather than a pushed phone page.
  - **P-DEX-AC-1.1** — Wide landscape: a leading **index** (existing
    sections Pokémon / Moves / Abilities / Items, existing search) and
    a **profile pane** are visible together. Selecting an index row
    fills the profile in place.
  - **P-DEX-AC-1.2** — The profile shows the same fields the iPhone Dex
    / entity detail already shows for that kind (typing, stats,
    abilities, learnset, evolutions, effect text, etc.). Nothing is
    dropped “because iPad.”
  - **P-DEX-AC-1.3** — Portrait / stacked: index collapses to overlay
    or a compact column; the profile is the primary pane.
  - **P-DEX-AC-1.4** — Empty search: existing empty copy, laid out in
    the index. Failed lookup / index unavailable: existing recoverable
    error, not a blank destination.
  - **P-DEX-AC-1.5** — Open in Dex from an artifact **switches to the
    Dex destination** with that profile selected (and companion
    open/closed unchanged).

### Usage on a Pokémon profile

- **P-DEX-US-2** — As any user, I want live usage on a Pokémon I’m
  already looking at, so I don’t have to hop to the Usage destination
  for the same species.
  - **P-DEX-AC-2.1** — A Pokémon profile includes a **Usage section**
    that shows the **same live Champions usage** the Usage destination
    would show for that species (Doubles default, Singles available as
    on iPhone).
  - **P-DEX-AC-2.2** — If usage is unavailable, the section fail-softs
    with the existing unavailable copy; the rest of the profile still
    works.
  - **P-DEX-AC-2.3** — This does **not** remove the Usage destination.
    The section is a placement of existing usage data.

Existing Dex verbs remain (Add to team when signed-in, Compare with…,
ask via companion context chip when companion is open). Compare picker
is a centered panel; the comparison artifact follows inspector-vs-panel
rules in `chat-and-artifacts.md` / `P-SHELL-AC-4.5`.

## Usage destination

- **P-USE-US-1** — As any user, I want the live ladder and a species’
  usage detail on screen together.
  - **P-USE-AC-1.1** — Wide landscape: **ladder list** (Doubles /
    Singles control as on iPhone) | **species detail**. Selecting a
    row fills the detail in place.
  - **P-USE-AC-1.2** — Species detail matches iPhone Usage species
    content (sets, items, teammates, etc. already shown). Hops to Dex
    entity profiles use the Dex destination or an in-pane profile
    consistent with iPhone’s existing hop, without dropping data.
  - **P-USE-AC-1.3** — Portrait / stacked: list collapses; detail is
    primary. A control returns to the ladder.
  - **P-USE-AC-1.4** — Usage-down: destination-level fail-soft
    (existing copy). Retry remains available.
  - **P-USE-AC-1.5** — Deep link / in-app hop to a species opens Usage
    with that species selected in the detail pane.

## Calculator workspace

Not a sidebar item (`P-SHELL-BR-5`). Same calc engine and fields as
iPhone; layout is attacker | defender | result.

- **P-CALC-US-1** — As any user, I want to edit both Pokémon and see
  the estimate without scrolling the number away.
  - **P-CALC-AC-1.1** — Opening Calc (from `/calc`, a damage block,
    Expand, or any existing entry) shows a **Calc workspace**. The
    sidebar remains. The previous destination is what **Done/Close**
    returns to.
  - **P-CALC-AC-1.2** — Wide landscape: **Attacker** editor and
    **Defender** editor are **side by side**. Field conditions and the
    **damage result stay visible** (trailing column or pinned band) so
    the estimate is on screen while editing sides, move, Stat Points,
    and field knobs the iPhone calc already exposes.
  - **P-CALC-AC-1.3** — Portrait / stacked: attacker and defender
    stack; the **result remains visible** (pinned band or trailing
    region). The user must not have to scroll the result off-screen to
    change a side.
  - **P-CALC-AC-1.4** — **Explain this calc** sends into the current
    Chat thread (revealing companion if the user is still on Calc, or
    using Chat if they return). It does not create a new agent
    capability.
  - **P-CALC-AC-1.5** — Prefill from a damage block / Expand carries
    the scenario (iPhone CALC behavior). Closing without save discards
    nothing the iPhone calc wouldn’t persist (calc is ephemeral unless
    already persisted as an artifact pin).
  - **P-CALC-AC-1.6** — Entity pickers (species, move, item, ability)
    are iPad-sized (centered panel or in-workspace picker), not
    phone-height sheets that waste the canvas.

Companion on Calc uses a **calc context chip** (`P-SHELL-AC-3.2`).
Artifacts tapped in that companion use a centered panel
(`P-SHELL-AC-4.5`).

## Settings

iPad Settings pattern: leading menu | trailing page.

- **P-SET-US-1** — As any user, I want account, appearance, and about
  as pages, not one long phone scroll.
  - **P-SET-AC-1.1** — Wide landscape: a leading **Settings list**
    (the same entries iPhone Settings/Account already has: sign-in or
    account, appearance, about/legal, account deletion when signed-in,
    Shared by me when that iPhone row exists, etc.) and a **detail
    page** for the selected row.
  - **P-SET-AC-1.2** — Portrait / stacked: list then detail with an
    obvious back-to-list control.
  - **P-SET-AC-1.3** — Appearance still follows the **system light/dark**
    (and any in-app appearance control iPhone already offers). No new
    theme product.
  - **P-SET-AC-1.4** — About/legal links (privacy, support) remain
    reachable.

### Sign-in and account operations

- **P-SET-AC-2.1** — Email OTP sign-in is a **centered panel** (email,
  then 6-digit code with system autofill). Same passwordless rules as
  iPhone (`auth-and-permissions.md`).
- **P-SET-AC-2.2** — Sign-out, account deletion, and other
  destructive confirms are centered panels. Deletion remains in-app
  (App Store). Cancel is safe.
- **P-SET-AC-2.3** — Update-available remains a centered panel with
  the existing Update / Not now behavior.

## Regulation chip

- **P-REF-AC-1.1** — The regulation chip stays **display-only** in
  destination chrome (Chat, Teams, Usage, Dex as on iPhone). It is not
  a format menu and does not route turns to another game.

## Business rules

- **P-REF-BR-1** — Dex and Usage are **public** (guest and signed-in).
- **P-REF-BR-2** — Usage-on-profile is the **same live usage payload**
  as the Usage destination, not a second source.
- **P-REF-BR-3** — Calculator is **ephemeral workspace** unless the
  user pins an artifact that iPhone already allows to be pinned.
- **P-REF-BR-4** — Settings must not expose admin-panel features (no
  admin role on this client).

## Cross-links

- Companion, compact stacking: `shell-and-adaptation.md`
- Open in Dex / Open in calculator from Chat: `chat-and-artifacts.md`
- Add-to-team: `teams-workbench.md`
