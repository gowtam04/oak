# Oak soul — visual source of truth

> **SUPERSEDED.** Do not implement from this file. The visual language to
> implement is [`enamel-paper.md`](enamel-paper.md) (Enamel & Paper). This
> document is history. Do not re-apply Instrument / chassis / specimen-desk
> / Signal from here.

> Historical operational contract (superseded). Do not implement from this
> file or from [`signal.md`](./signal.md). Implement from [`enamel-paper.md`](enamel-paper.md).
>
> Lab mock of the Signal era: `docs/design/theme-lab/` · world **Signal**.
>
> This file once replaced Instrument / chassis (`fable-ui-strategy.md`) and the
> former field-notes / specimen-desk doctrine. Do not reintroduce cream paper,
> grain, dashed chrome, a red Pokédex clamshell, or indigo as the brand.

Oak is a **calm daylight app that reasons on top of data.** Chrome is a
consumer product. Red is a **signal**, not a costume. Pokémon content
(sprites, the 18 type colors) is the other color in the room. Mechanics
answers carry a small fact table.

---

## We are

- Cool daylight neutrals (`#F6F7F9` canvas / `#FFFFFF` plates; dark `#121417`
  / `#1A1D22`). Never cream, never cocoa, never taupe.
- True Pokéball red (`#E3350D` light / `#FF4A22` dark) used only where
  something acts or is live
- Figtree for everything human. IBM Plex Mono only in fact tables and
  damage numbers
- Type chips **solid** (full chroma, contrast-safe ink)
- Hairlines, not device wells. Air, not costume
- Motion: 180ms chrome, 280ms answer rise, `cubic-bezier(0.2, 0, 0, 1)`,
  press `scale(0.98)` on red buttons. No bounce
- Honest about uncertainty (flags stay designed objects)
- Wordmark **`Oak.`** with a red period

## We never

1. Center a logo / rings + "Ask Oak" + four equal chips as the empty hero
2. Use solid brand-red user bubbles
3. Paint a red header slab, red sidebar, or red tab-bar fill
4. Use cream / warm-paper / grain / dashed chrome / graph grids
5. Build a clamshell, LCD, blue hardware buttons, yellow HT/WT strip, or
   Dexter ding
6. Use indigo (`#3D4C7A`) or azure as the brand (azure = focus fallback only)
7. Tint type badges as pastel washes
8. Pill the composer, the answer plate, or Send
9. Ship `STANDBY`, `RECEIPTS`, Space Grotesk, or Fredoka as the voice of
   the app
10. Add decoration that does not encode type, status, scope, or an action

## Signature objects (must appear)

| Object | Where |
|--------|--------|
| **`Oak.`** | Wordmark. Period is `--red`. |
| **Scope LED** | Header only. 6px red dot + mute label. |
| **Answer plate** | White/dark surface, hairline, 12px. Lead 22/600. |
| **Fact table** | Mechanics / damage / comparisons. Mono 12/13. Hairlines. |
| **Inferred** | One line. Only the word is red. |
| **Send** | Solid red, on-red ink. |
| **Active mark** | 2px red inset on the *one* selected nav or history row. |
| **User note** | Sunken + hairline. No red fill, no pip. |
| **Starters** | Four text rows, not equal hero chips. |

## Red's jobs (exhaustive)

1. Primary actions (Send, Save, New chat)
2. Live (pip, 2px bar, Stop)
3. Active mark (single item)
4. Wordmark period
5. The word `Inferred`
6. Scope LED

Red does **not** fill user bubbles, headers, sidebars, or plates.

## History selection

2px red inset on the open row only. No `OPEN` stamp. No lifted mini-plate.

## Empty copy

- Title: `What do you want to know?`
- Sub: `Mechanics, locations, teams, damage. Oak will show its work.`
- Starters: four full-width text rows
- Composer: `Ask Oak` / `Send`

## User note

Sunken fill + hairline + ink. Not an accent-filled bubble.

## Typography

- UI / lead / wordmark: **Figtree** 400/500/600
- Data: **IBM Plex Mono** 400/500, tables only
- Do not introduce a third sans

## Protect (do not undo)

- OakAnswer field set and order
- Solid 18-type chip recipe + contrast ink
- Citations, reasoning, uncertainty as first-class (restyle, do not bury)
- Wire contract / tool names
- Dynamic Type, reduce-motion, 44pt targets, layout stability
- Guest vs signed-in IA, scope model, background turns

## Implement from

[`signal.md`](./signal.md) — tokens, recipes, screen map, file map,
sequence, acceptance.
