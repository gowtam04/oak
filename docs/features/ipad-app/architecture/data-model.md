# Oak for iPad — Data Model

Mode: PM
Budget Tier: hobby

**No new persisted entities, no migrations, no new backend tables.**
Account, conversation, team, pin, usage snapshot, and `OakAnswer` stay
exactly as the iPhone client already models them (`docs/features/iphone-app/architecture/data-model.md`).

This file specifies **iPad session UI state** only.

## Textual ERD

```text
PadShellModel (process, @MainActor, @Observable)
  ├── destination: PadDestination          // chat | teams | usage | dex | settings | calc(scenario)
  ├── companionOpen: Bool                  // default false
  ├── companionFraction: CGFloat           // landscape width share / portrait height share
  ├── sidebarOverlayPresented: Bool        // compact overlay
  ├── sidebarCollapsed: Bool               // user hide of persistent enamel
  ├── chatListCollapsed: Bool              // user hide of persistent Chat list
  ├── contextChip: PadContextChip?         // nil when dismissed or Chat destination
  ├── inspector: ArtifactViewModel?        // Chat destination only
  ├── companionArtifact: ArtifactViewModel?// centered panel outside Chat
  └── liveChat: ChatViewModel              // THE current thread (ADR-P3)

PadLayout (pure)
  └── mode(for width) → regular | medium | compact
```

## Entities

### PadDestination

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| kind | enum | yes | `chat`, `teams`, `usage`, `dex`, `settings`, `calc` |
| calcScenario | `CalcScenario?` | no | only for `calc` |
| usageSlug | `String?` | no | optional Usage drill-in |
| dexRoute | `DexEntityRoute?` | no | selected profile |
| teamId | `String?` | no | selected library team |
| slotIndex | `Int?` | no | 0...5 selected canvas slot |

- **Ownership:** `PadShellModel`
- **Lifecycle:** session. Switching to `calc` remembers `previousDestination` so Done returns (P-CALC-AC-1.1).
- **Requirement trace:** P-SHELL-US-1, P-SHELL-BR-5, P-CALC-AC-1.1

### PadContextChip

| Case | Payload | Send mapping (see `api-design.md`) |
| --- | --- | --- |
| `team` | `id`, `name`, `liveShowdown` | `mentionedTeamIds: [id]` + Showdown block if draft non-empty |
| `pokemon` / `move` / `ability` / `item` | `slug`, `name` | prefix line `Regarding {name}.` |
| `usageSpecies` | `slug`, `name` | same prefix |
| `calc` | `CalcScenario` | same as iPhone Explain (`pendingChatSend` shape) — do not invent a new payload |

- **Ownership:** `PadShellModel`; user can dismiss (nil).
- **Lifecycle:** replaced when the open object changes; not a new conversation (P-SHELL-AC-3.4). Cleared when companion closes. Not set on the Chat destination.
- **Permissions:** team chip only when signed-in and a team is open; Dex/Usage/Calc chips for guests too.
- **Requirement trace:** P-SHELL-US-3, P-TEAM-AC-4.1, ADR-P4

### PadLayoutMode

| Case | Typical width | Columns |
| --- | --- | --- |
| `regular` | ≥ 1100 pt | Persistent sidebar 220 + up to 3 content columns |
| `medium` | 700..<1100 | Sidebar rail 72 or overlay; max 2 content columns (Chat drops list if inspector open) |
| `compact` | < 700 | Overlay sidebar; primary stacked above secondary |

Constants live in `PadLayout` (single source). Do not scatter magic numbers.

- **Requirement trace:** P-SHELL-AC-5.2–5.4, P-OQ-2 (resolved here)

### PadShellModel (chrome)

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| companionOpen | Bool | `false` | remembered across Teams/Usage/Dex/Calc only |
| companionFraction | CGFloat | `0.38` | clamp so workspace stays usable (P-SHELL-AC-4.3) |
| sidebarOverlayPresented | Bool | `false` | compact overlay |
| sidebarCollapsed | Bool | `false` | user hide of persistent enamel (P-SHELL-US-8) |
| chatListCollapsed | Bool | `false` | user hide of persistent Chat list (P-CHAT-AC-1.8) |
| previousDestination | PadDestination | `.chat` | Calc Done target |

- **Ownership:** created in `PadRootView`, `@State`, not in `AppState` (keeps iPhone `AppState` free of iPad chrome).
- **Lifecycle:** process memory (ADR-P7). Rotate/Split View keep it. Cold launch resets companion closed and columns expanded.
- **Permissions:** n/a
- **Requirement trace:** P-SHELL-BR-3, P-SHELL-AC-5.5, P-SHELL-US-8, P-CHAT-AC-1.8, P-OQ-1

## Relationships

| From | To | Cardinality | Notes |
| --- | --- | --- | --- |
| PadShellModel | ChatViewModel | 1 | live thread |
| PadShellModel | ArtifactViewModel | 0..2 | inspector and/or companion panel; not both required |
| PadContextChip.team | Team | 0..1 | saved id; liveShowdown may differ from server |
| AppState.pendingDestination | PadShellModel.destination | 1 | PadRootView consumes the existing enum |

## What is not modeled

- No `isIPad` flag on accounts or conversations
- No synced “companion open” preference
- No extra pin type
- No Teams Assistant thread on iPad (ADR-P4)

## Migrations And Seeds

None. No DB. No UserDefaults keys required for launch (optional later; out of this design).
