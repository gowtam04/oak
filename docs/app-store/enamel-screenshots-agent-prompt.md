# Agent prompt — Enamel App Store screenshots (Imagine)

Paste everything below the line into a **new agent session**. That agent implements. It does **not** submit 1.2 for App Review and does **not** change listing copy.

---

You are replacing Oak's **App Store screenshots** so they match the current **Enamel & Paper** iOS chrome. The listing copy is already Champions-first and must stay. Do not send 1.2 to review.

## Why this exists

Oak is a Pokémon Champions coach (current regulation only). Visual language was Signal (cool gray `#F6F7F9`, Figtree, true Pokéball red `#E3350D` as a 2px LED, no red header). On **2026-09-06** Enamel & Paper was restored on web + iOS + Android (coral lid `#EE5A5A`, cream paper `#FBF7F4`, Fredoka / Nunito Sans / JetBrains Mono). On **2026-09-07** someone still uploaded **Signal** Champions frames to App Store Connect version **1.2**. The app the user opens is Enamel; the store shots are Signal. That is the bug.

Enamel's own spec (`docs/design/enamel-paper.md` Key Decision 5) called store-screenshot regen a **non-goal of the restyle**. That is why they were left Signal. This task is the follow-up. The old enamel HTML set (`docs/app-store/generated-screenshots/render.html` + `1284x2778/`) is the **wrong product** (EVs, IVs, Tera, "Switch Formats Instantly"). Do not re-upload those.

## Hard bans

- Do **not** `PATCH submitted:true` / create a `reviewSubmission` / attach a new build. 1.2 is `DEVELOPER_REJECTED` on purpose. Copy is already on that version.
- Do **not** change App Name, Subtitle, Description, Keywords, What's New, or promotional text.
- Do **not** touch live 1.0.2 screenshots (`READY_FOR_SALE`). Only 1.2's screenshot sets.
- Do **not** rebuild the HTML Signal renderer as the ship path. The owner asked you to use **`/imagine`** (`image_gen` / `image_edit`).
- Do **not** use Signal as the *look*: no cool gray canvas, no Figtree, no `#E3350D` lid, no `Oak.` period wordmark as the in-app mark, no cream-without-the-red-lid.
- Do **not** restore pre-Champions IA: no generation picker, no Tera, no EV/IV sliders, no National Dex default, no "switch formats" headline.
- Do **not** put "Pokémon" / "Pokédex" in **marketing headlines**. In-app UI may show species names (Garchomp, etc.).
- Do **not** invent Pokémon art. Keep official-looking sprites from the Signal reference frames (they already use PokeAPI sprites). `image_edit` those; do not `image_gen` a new dragon.
- Git: worktree off `develop`, branch `agent/enamel-store-screenshots`. Merge to `develop` when done. Never commit straight to `develop`.

```bash
git worktree add ../oak-enamel-store-screenshots -b agent/enamel-store-screenshots develop
```

All files and commits happen in that worktree.

## Read first (in this order)

1. This prompt.
2. `~/.grok/bundled/skills/imagine/SKILL.md` — then use `image_gen` / `image_edit` as below.
3. `docs/design/enamel-paper.md` — tokens, lid vs paper, bans. Ignore Key Decision 5's "don't regen screenshots"; that is superseded by this task.
4. `docs/design/prototypes/red-top-bar.html` — lid feel.
5. `ios/OakApp/UI/Theme.swift` and `ios/OakApp/UI/OakChrome.swift` — **current** native chrome (enamel nav, `OakTabDock` paper shelf, five tabs).
6. `docs/app-store/screenshots.md` — six-frame **story** (keep). Global style notes are Signal and must be rewritten.
7. `docs/app-store/ios.md` — listing copy. Read only. Do not edit fields except a one-line note that screenshots were regenerated in Enamel.
8. `web/src/data/formats.ts` — `CHAMPIONS_REGULATION` (today `"Regulation M-B"`) and `regulationChipLabel()` → `"Champions · Reg M-B"`. If that constant has rotated, use the new chip. Do not hardcode M-B if the file says otherwise.

## What is live in App Store Connect (verified 2026-09-08)

- App id `6786014161`, bundle `ai.gowtam.oak`.
- **1.2** version id `9ec69dc9-92ba-4e87-a0e9-8a33b070261f`, state **`DEVELOPER_REJECTED`**, build **51** attached. Localization id `e9aaaa07-be1e-4c1f-9e77-fcea1f3caedc` (en-US).
- 1.2 already has Champions copy (name `Oak – AI Coach`, Stat Points / Mega / live usage description, keywords with `mega`+`usage`). Leave it.
- 1.2 screenshot sets (replace these):
  - `APP_IPHONE_65` — 1284×2778, six `frame-N.png` (Signal).
  - `APP_IPHONE_67` — 1290×2796, six `frame-N.png` (Signal).
- **1.0.2** `READY_FOR_SALE` still shows the public store. Do not upload to that localization (`76205c64-3912-4c1b-8d12-da3ff6fc91ce`).
- Auth: `APP_STORE_CONNECT_API_KEY_KEY_ID`, `APP_STORE_CONNECT_API_KEY_ISSUER_ID`, `APP_STORE_CONNECT_API_KEY_KEY_FILEPATH`. JWT ES256 like `ios/scripts/asc-feedback.mjs`.

ASC screenshot replace (do not invent a different flow): list sets on the 1.2 localization, delete the six Signal files in each set (or the whole set if Apple requires it), create/upload new PNGs with the reservation + commit dance (`appScreenshots` POST reservation → PUT bytes → PATCH `uploaded: true`). Keep display types `APP_IPHONE_65` and `APP_IPHONE_67` only. iPhone only, no iPad.

## How to generate (owner: use `/imagine`)

Load the Imagine skill. Tools: **`image_gen`** (no source) and **`image_edit`** (has source). The owner wants Imagine, not the HTML renderer.

**Pipeline (do this, not six independent `image_gen`s):**

1. **Content master = Signal Champions frames** (wrong theme, right product). Read them before generating:
   - `docs/app-store/generated-screenshots/signal/flat-1290/frame-1.png` … `frame-6.png`
   - Same story in `signal/render.html`
2. **Style masters = Enamel**, not Signal:
   - `docs/design/prototypes/red-top-bar.html` (open / screenshot if needed)
   - July 2026 feel: `docs/design/screens/prod-01-chat-answer-artifact.png`, `prod-02-chat-empty.png`, `prod-03-team-builder.png`, `10-mobile-chat.png`
   - Current iOS chrome in code: opaque coral lid through the status bar, white Fredoka wordmark + 32px coral tile with white O, cream canvas, white plates, coral-soft user bubble, paper tab dock
3. For **each of the six frames**, call **`image_edit`** with:
   - `image`: the matching Signal `flat-1290/frame-N.png` (composition + species + copy)
   - optional extra refs: one Enamel still (lid/paper) if the tool accepts multiple `image` entries
   - `aspect_ratio`: **`9:16`**
   - `prompt`: describe the Enamel restyle (see per-frame prompts below). Keep the same phone mockup, headlines, and in-app copy. Paint the **lid** coral through the status bar. Canvas cream. Plates white. Tabs: Chat / Teams / Usage / Dex / Settings. Selected tab coral.
4. **Anchor consistency:** edit frame 1 first. Then `image_edit` frames 2–6 using **both** the Signal content frame **and** the accepted frame-1 Enamel result so lid, phone, type, and paper match across the set.
5. **Verify every PNG by reading it back** (image understanding). Check:
   - Headlines/subheads are the exact strings below (no garble)
   - In-app strings: Stat Points not EVs; no Tera; chip `Champions · Reg M-B` (or current `regulationChipLabel()`); five tabs including **Usage**
   - Lid is opaque `#EE5A5A` (coral), not `#E3350D`, not cream-only
   - No Figtree / cool gray Signal canvas
6. If a word or number is garbled: **one** targeted `image_edit` that only fixes that text. If it is still wrong, composite the **marketing headline/subhead** in HTML/CSS over the generated phone art (Imagine skill: discrete text that the model cannot hold must be set in code). Do not ship misspelled "Champions" or invented stats.
7. Rasterize/resize to Apple's exact pixels (do not upload 9:16 at random size):
   - 6.7" `APP_IPHONE_67` = **1290×2796**
   - 6.5" `APP_IPHONE_65` = **1284×2778**
   - Use `sips` or similar. No extra UI chrome, no watermark.

Save working files under the worktree, e.g.:

```
docs/app-store/generated-screenshots/enamel/
  render-notes.md          # which Imagine calls, which refs
  1290x2796/frame-1.png … frame-6.png
  1284x2778/frame-1.png … frame-6.png
```

Do not put new masters only under `generated-screenshots/signal/`. Leave the Signal folder as history.

### Imagine look (every frame)

Enamel & Paper, light mode only (store shots are light):

- **Lid:** opaque painted coral `#EE5A5A` through the status bar. White icons and white Fredoka "Oak". Optional 32px rounded coral tile with a white O (in-app mark). Inset white-on-coral pills for the regulation chip.
- **Paper:** canvas `#FBF7F4` with a faint 4% coral wash from the top. White plates `#FFFFFF`, hairline `#E9E0D8`, warm umber shadow. Composer = opaque white pill, coral send.
- **Type:** Fredoka for wordmark and chrome titles; Nunito Sans for body; JetBrains Mono only in fact tables.
- **Tabs:** `OakTabDock` — opaque paper shelf, five items Chat / Teams / Usage / Dex / Settings, selected label coral `#EE5A5A`.
- **Phone:** generic black iPhone, Dynamic Island, no tilt, device centered on a quiet cream/coral wash (not Signal `#F6F7F9`, not a rainbow gold wash).
- **Mood:** Pokédex lid over rag paper. A device, not a daylight browser.

User bubble may be coral-soft (`#FCEBEB` mix). Type badges are tinted pills (July recipe), not Signal solid chips.

### Six frames (story stays; paint changes)

Chip text: read `CHAMPIONS_REGULATION` / `regulationChipLabel()`. Default if unchanged: `Champions · Reg M-B`.

**Frame 1 — Hook.** Headline: `Answers, with the why`. Sub: `Champions reasoning, sources, and a clear flag when something is inferred.` In-app: Garchomp vs Dragapult Speed, **32 Speed Stat Points**, `Inferred` flag, regulation chip on the enamel lid. Chat tab selected.

**Frame 2 — Teams.** Headline: `Build a Champions team`. Sub: `Species, item, moves, nature, Stat Points — then save it for chat.` In-app: Teams list titled like `Reg M-B Doubles`, 6/6 Champions, six named slots (Garchomp, Dragapult, Miraidon, Gholdengo, Kingambit, Meowscarada). Teams tab selected. No EV bars, no Tera.

**Frame 3 — Retry/share.** Headline: `Retry, share, keep going`. Sub: `Edit a typo, copy a clean answer, or share a public link.` In-app: Mega Garchomp vs Flutter Mane, copy/share/pin/retry. Chat tab.

**Frame 4 — Usage.** Headline: `Live Champions usage`. Sub: `Doubles by default, Singles as a second view — dated as a snapshot.` In-app: Usage tab, `Doubles · Regulation M-B` (or current), Kingambit #1 then Garchomp, Gholdengo, Dragapult, Meowscarada, Miraidon. **Usage tab selected** (fifth-tab IA, ADR-6).

**Frame 5 — Artifact sheet.** Headline: `See the math`. Sub: `Open a species, move, or calc without leaving the thread.` In-app: dimmed chat + raised paper sheet, Choice Band Outrage vs Flutter Mane, roll `108 – 128%`, OHKO after rocks, Inferred Stat Points at level 50.

**Frame 6 — Guest CTA.** Headline: `Start now. Sign in later.` Sub: `Ask as a guest. Save chats and teams when you want them.` In-app: empty Chat, enamel lid, four starters (Battle / Teams / Rules / Usage) including Stat Points and Mega Garchomp legality. No generation picker.

Suggested `image_edit` prompt skeleton (adapt per frame; keep it 2–5 sentences, positive):

> Restyle this iPhone App Store screenshot into Oak's Enamel & Paper look. Keep the same layout, headlines, species, and UI copy. Paint an opaque coral #EE5A5A header through the status bar with a white Fredoka Oak wordmark; cream rag-paper canvas #FBF7F4; white answer plates; a paper tab bar with Chat, Teams, Usage, Dex, and Settings. Light mode, centered black iPhone, 9:16 marketing frame.

## Docs to update when the PNGs are real

- `docs/app-store/screenshots.md` — drop Signal palette / Figtree / "no red header". Point at `generated-screenshots/enamel/`. Keep the six-frame story. Note Imagine + Signal content refs + Enamel style.
- `docs/app-store/README.md` — screenshot bullet is Enamel, not Signal.
- `docs/app-store/ios.md` — one factual line that 1.2 screenshots were regenerated in Enamel; still **not submitted**.

## Done when

1. Six Enamel frames exist at both 1290×2796 and 1284×2778.
2. You have read each frame and the chrome is coral lid + cream paper, product is Champions (Stat Points, Usage tab, no Tera/EV/gen picker).
3. Those files are uploaded to **1.2 only**, both display types, replacing the Signal set.
4. Version 1.2 is still `DEVELOPER_REJECTED` / not `WAITING_FOR_REVIEW`.
5. Branch merged to `develop`.

If Imagine cannot hold the UI copy after one repair pass, stop and say so; do not upload garbled screenshots and do not silently fall back to shipping the Signal set.
