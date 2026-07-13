# Oak soul — visual source of truth

> Operational contract for **every** UI surface (web, iOS, Android).  
> Agents and humans must obey this when touching chrome.  
> Full strategy: [`beyond-generic-ai.md`](./beyond-generic-ai.md) · Prototype: [`prototypes/specimen-desk.html`](./prototypes/specimen-desk.html)

Oak is a **field desk and Pokédex**, not a chatbot skin. Answers are **specimen plates**. Chrome is a quiet lab desk. Red is a **record light**, not wallpaper.

---

## We are

- Warm paper desk + content-colored plates  
- Honest about uncertainty (flags are designed objects)  
- Instrument voice for data (mono labels, tabular numerals)  
- Editorial calm for prose (measured lead, comfortable measure)

## We never

1. Center a logo / concentric rings + “Ask Oak” / “Ask …” + **four equal chips** as the empty hero  
2. Use solid brand-red user bubbles (iMessage / ChatGPT twin)  
3. Use a **red left selection rail** (or any brand-color rail) for “selected” list rows  
4. Let two answers about different types share an identical beige/white shell  
5. Ship dashed wireframe callouts as the final inference/credibility treatment  
6. Add decoration that doesn’t encode **type, status, scope, or tool work**

## Signature objects (must appear)

| Object | Where |
|--------|--------|
| **Blank specimen plate** | Empty chat — dashed/grid plate, scope stamp, filed starters |
| **Type-reactive answer plate** | Finalized answer — wash/edge from `subjects[].types` |
| **Receipts footer** | Plate foot — `RECEIPTS · N SOURCE(S)`, expands to reasoning + citations |
| **Desk chrome** | Header/sidebar/tab — quiet; red = record light + primary actions only |

## Plate wash rules

| Case | Treatment |
|------|-----------|
| 1 subject, 1–2 types | Primary → wash (~8–14% type into surface); secondary → edge / second radial |
| Multiple subjects | Neutral-ish plate + light multi accent (don’t fight full dual washes) |
| No subjects (mechanics) | **Ink plate**: sunken paper, stronger border, no type wash |
| Dark mode | Higher mix (~18–28%) so wash still reads |

Web: set `--plate-a` / `--plate-b` on `.answer-card` from first subject types (map to `--type-*`).  
Native: `Theme.plateWash(primary, secondary?)` / `OakType` helpers.

## History selection

**Not** left accent rail.  
**Yes** lifted mini-plate: surface + hairline border + raised shadow; mono **`OPEN`** stamp on the active row only.

## Empty desk copy

- Ilabel: `NEW ENTRY`  
- Prompt: `What are we looking up?`  
- Scope stamp from active format (e.g. `CHAMPIONS · REG M-B`)  
- **Filed starters** — category + optional type-dot + prompt text (not equal beige pills)

### Starter categories (sync across clients)

Use these four labels everywhere:

| Category | Role | Example type-dot |
|----------|------|------------------|
| `Battle` | Competitive / nature / damage | dragon / fighting |
| `Dex` | Species / typing / immunity lists | ground / normal |
| `Rules` | Mechanics / abilities / gen rules | ghost / dark |
| `Meta` | Usage / role / format niche | steel / water |

## User note

Sunken/neutral paper + thin border + **small red corner pip**. Not accent-filled bubble.

## Receipts

Full-width plate footer tab: `RECEIPTS · N SOURCE(S)` (tool count optional if client already has it).  
Expand inline: reasoning markdown + citation list.  
Do not present credibility only as free-floating filter chips.

## Red’s jobs (exhaustive)

1. Primary actions (send, save, new chat / new entry)  
2. Live/recording (stop, spinner)  
3. Record-light accents (header thread, OPEN stamp border, user pip)  

Red does **not** fill user bubbles, paint selection rails, or wash entire headers.

## Protect (do not undo)

- Paper header + 2px red thread (not red slab banner)  
- Warm neutral ramp + 18 type solids  
- Type-badge recipe  
- Field-notes tool trail while streaming  
- Answer lead typography + structured OakAnswer field order  
- Wire contract / tool names  
- Dynamic Type, reduce-motion, layout stability  

## Phase 1 checklist (implementation)

- [ ] Empty = blank plate + filed starters  
- [ ] Answer shell type-reactive (or ink plate)  
- [ ] Sprite well type-glow  
- [ ] Receipts footer  
- [ ] User desk note + pip  
- [ ] History OPEN plate (no red rail)  
- [ ] Web + iOS + Android parity on the above  
