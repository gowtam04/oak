# Oak for iPad — Data and Entities

> Business-level data only. **No new entities** are introduced. iPad is
> a new placement of objects the current iPhone app already uses.
> Personas: guest and signed-in.

## Entities (inherited)

| Entity | Ownership | Lifecycle on iPad |
| --- | --- | --- |
| **Account** | User, identified by verified email | Same as iPhone/web. OTP session. Deletion is in-app. |
| **Guest session** | Device/session, not an account | Ephemeral chat only. Imported on sign-in. |
| **Conversation** | Account (signed-in) | Auto-saved. List column on Chat. Same thread as companion. |
| **Turn / OakAnswer** | Belongs to a conversation | Rendered in the thread; images consume-on-turn, not stored. |
| **Pinned artifact** | Signed-in, per conversation, max 5 | Strip on the thread; opens inspector. |
| **Team** | Account | Living Champions vs archive by existing format rule. Edited on the workbench. |
| **Team slot / set** | Belongs to a team | Canvas + slot inspector. Warn-but-allow. |
| **Dex entity** | Public Champions index | Index \| profile. |
| **Usage snapshot** | Public, live, dated | Usage destination and Pokémon profile section. Fail-soft. |
| **Calc scenario** | Ephemeral unless pinned via existing pin rules | Calc workspace. |
| **Artifact (viewer)** | Session (except pins) | Inspector on Chat; centered panel from companion. Back stack. |

There is **no iPad-specific store**, no extra “tablet layout” flag in
user data, and no new share type.

## Relationships

- One **live conversation** per client session is shown in Chat and in
  companion (`P-SHELL-BR-2`).
- The **context chip** does not create an entity. It is a UI handle on
  an existing team, Dex entity, usage species, or calc scenario,
  attached to the next send the same way iPhone “ask about this”
  already attaches an object.
- Add-to-team writes the existing Team/slot; then the Teams
  destination shows that team.

## What iPad must not persist

- Companion open/closed may be **session UI state**. It is not a
  syncable account preference unless architecture later chooses to
  persist it locally — product does not require it to sync to iPhone
  or web.
- Split ratios (companion width, portrait split) may be local UI
  state. They must not become server fields.
- Inspector back stack is session-only.

## Business rules

- **P-DATA-BR-1** — iPad **must not** create a second copy of
  conversations or teams. Web, iPhone, Android, and iPad share one
  account namespace.
- **P-DATA-BR-2** — Images remain **consume-on-turn**.
- **P-DATA-BR-3** — No new artifact types, pin kinds, or team fields.
- **P-DATA-BR-4** — Usage on a Dex profile is the **same usage
  snapshot** as the Usage destination for that species, not a cached
  second product.

## Cross-links

- Auth ownership: `auth-and-permissions.md`
- Backend: `api-and-integrations.md`
