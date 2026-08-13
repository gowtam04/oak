# Oak soul — visual source of truth

> Operational contract for **every** UI surface (web, iOS, Android).
> Agents and humans must obey this when touching chrome.
> Strategy: [`fable-ui-strategy.md`](./fable-ui-strategy.md) (the Instrument redesign, 2026-08).
> This file REPLACES the former "field notes / specimen desk" doctrine — do not
> reintroduce cream paper, grain textures, dashed chrome, or pastel type washes.

Oak is a **precision instrument** — a modern Pokédex as hardware — not a chatbot skin.
Chrome is a quiet chassis. Data renders as readouts. Red is a **record light**, not
wallpaper. The Pokémon content (sprites, the 18 type colors) carries the color;
the frame stays neutral.

---

## We are

- Cool chassis neutrals (light "lab white" / dark graphite — never cream, never cocoa)
- True Pokéball red (`#E3350D` light / `#FF4A22` dark) used sparingly as a signal
- Instrument voice for data (mono silkscreen labels, tabular numerals, readouts)
- Type color at **full chroma** where it encodes data (solid chips, type-light glows)
- Machined depth: hairlines, raised panels, and **inset wells** — content sits *in*
  the device, not on floating paper
- Mechanical motion: 120/180ms, `cubic-bezier(.2, 0, 0, 1)`, no overshoot bounce
- Honest about uncertainty (flags are designed objects)
- Editorial calm for prose (Space Grotesk lead, comfortable measure)

## We never

1. Center a logo / concentric rings + "Ask Oak" + **four equal chips** as the empty hero
2. Use solid brand-red user bubbles (iMessage / ChatGPT twin)
3. Use a **red left selection rail** (or any brand-color rail) for "selected" list rows
4. Let two answers about different types share an identical neutral shell
5. Use cream/warm-paper canvases, grain/noise textures, or graph-grid backgrounds
6. Use dashed borders anywhere (empty sockets are **solid hairline** outlines)
7. Tint type badges as pastel washes — type chips are **solid** type color with
   per-type contrast-safe ink
8. Round every control into a pill — pill radius is reserved for **chips and the
   composer**; buttons/cards use the radius scale (5/9/12/16)
9. Add decoration that doesn't encode **type, status, scope, or tool work**

## Signature objects (must appear)

| Object | Where |
|--------|--------|
| **Standby readout** | Empty chat — raised panel, LED scope stamp, starters. No dash, no grid. |
| **Type-lit answer plate** | Finalized answer — saturated glow from the sprite well + leading-edge light from `subjects[].types`; neutral inset "ink plate" for mechanics |
| **LED scope stamp** | Empty state + scope surfaces — mono label + glowing red dot on an inset well |
| **Receipts footer** | Plate foot — `RECEIPTS · N SOURCE(S)`, expands to reasoning + citations (a readout drawer) |
| **Instrument ticker** | Streaming — the tool loop as cascading mono readout lines (friendly nouns, not raw tool ids) |
| **Chassis chrome** | Header/sidebar/tab — quiet; 2px red thread on the header; red = record light + primary actions only |

## Type-light rules (replaces the old plate-wash table)

| Case | Treatment |
|------|-----------|
| 1 subject, 1–2 types | Primary → well glow + leading-edge light; secondary → second edge segment |
| Multiple subjects | Neutral plate + light multi accent (don't fight dual glows) |
| No subjects (mechanics) | **Ink plate**: sunken inset panel, stronger border, no type light |
| Dark mode | Glow intensity rises so the light still reads (graphite ground) |

Web: `--plate-*` vars on `.answer-card` from first subject types. Native:
`Theme.plateWash`/`OakType.plateWash` helpers (retuned to glow + edge, not wash).

## History selection

**Not** a left accent rail. **Yes** lifted mini-plate: surface + hairline + raised
shadow; mono **`OPEN`** stamp on the active row only.

## Empty desk copy

- Ilabel: `STANDBY` · Prompt: `What are we looking up?`
- Scope stamp from active format (e.g. `NATIONAL DEX · ALL GENS`) as an LED stamp
- **Starters** — category + optional type-dot + prompt text (not equal beige pills)
- Categories (sync across clients): `Battle` / `Dex` / `Rules` / `Meta`

## User note

Sunken/neutral inset row + thin border + **small red corner pip**. Not an
accent-filled bubble.

## Red's jobs (exhaustive)

1. Primary actions (send, save, new chat)
2. Live/recording (stop, streaming glow, LED stamps)
3. Record-light accents (header thread, OPEN stamp border, user pip, status dot)

Red does **not** fill user bubbles, paint selection rails, or wash entire headers.

## Typography

- Display: **Space Grotesk** (500/600/700) — wordmark, titles, answer lead, headings;
  tracking −0.02em at ≥18px
- Body: **Inter** (400/500/600/700)
- Data: **JetBrains Mono** (500/600) — ilabels, tabular numerals, readouts

## Protect (do not undo)

- Chassis header + 2px red thread (not a red slab banner)
- Cool neutral ramp + 18 type solids + per-type contrast ink table
- Solid full-chroma type-badge recipe
- Instrument ticker while streaming (friendly nouns — never raw tool ids)
- Answer lead typography + structured OakAnswer field order
- Receipts + uncertainty as designed objects
- Wire contract / tool names
- Dynamic Type, reduce-motion, layout stability, 44pt targets
