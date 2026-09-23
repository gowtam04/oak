# Oak — App Store Screenshot Guide (iOS)

The 1.2 resubmission uses captures of build 63, not the generated Enamel
frames. Guideline 4.1(a) rejected those frames because the phone UI showed
character art and species names. The upload set lives in
`generated-screenshots/listing-1.2/`:

- `iphone-67/` — 1290×2796 (`APP_IPHONE_67`)
- `iphone-65/` — 1284×2778 (`APP_IPHONE_65`)
- `ipad-13/` — 2752×2064 landscape plus one 2064×2752 portrait (`APP_IPAD_PRO_3GEN_129`)

Frames show the real tab bar or the iPad enamel sidebar. They do not include
character art or species names. The older Enamel and Signal sets stay in this
folder as history and are not uploaded. Live 1.0.2 screenshots are untouched.

No trademarked wording in marketing headlines. In-app UI may show species names, as the product does.

Do not re-upload the old cream HTML set at `generated-screenshots/render.html`
(pre-Champions: EVs, IVs, Tera, “Switch Formats Instantly”).

## Global style notes (apply to every frame)

- **Enamel & Paper**: lid `#EE5A5A` through the status bar, canvas `#FBF7F4` with a faint 4% coral wash, plates `#FFFFFF`, hairline `#E9E0D8`, warm umber shadow. Composer is an opaque white pill with coral send.
- **Typography**: Fredoka 600 headlines / chrome titles. Nunito Sans 400–500 body. JetBrains Mono only in fact tables.
- **Mood**: hard enamel Pokédex lid over rag-paper pages. Not Signal cool gray, not Figtree, not a 2px `#E3350D` LED, not cream without the lid.
- **Device**: generic black iPhone with Dynamic Island, no tilt, centered on a quiet cream/coral wash.
- **Tabs**: Chat / Teams / Usage / Dex / Settings — match `OakAppTab` / `OakTabDock` (opaque paper shelf, selected coral).
- **Chip**: display-only `Champions · Reg M-B` (not a National Dex / gen picker), inset white-on-coral on the lid.
- **In-app mark**: white Fredoka “Oak” (optional 32px coral tile with white O). Not `Oak.` with a red period.

## Screenshot dimensions

iPhone (existing 1.2 set — keep):

- **1290×2796** — 6.7" (`APP_IPHONE_67`)
- **1284×2778** — 6.5" (`APP_IPHONE_65`)
- App preview: **886×1920**, 15–30s, H.264 High 4.0, AAC stereo

iPad (required once the binary is iPhone+iPad — `P-SUCCESS-5`):

- **2064×2752** portrait / **2752×2064** landscape — 13" (`APP_IPAD_PRO_3GEN_129`, iPad Pro M4/M5 and iPad Air 13")
- Alternate accepted: **2048×2732** / **2732×2048** (12.9" class)
- Landscape is the **primary** iPad set. Include **at least one portrait**.
- Show the **tablet shell**: enamel sidebar and a split (Chat list|thread or Teams workbench). **Not** letterboxed iPhone frames, **not** the iPhone tab dock with extra margin.
- Listing copy in `docs/app-store/ios.md` stays Champions coach. Do **not** claim new agent capabilities (same chat, teams, usage, Dex, calc — iPad layout only).

---

### Frame 1 of 6 — Hook: reasoned, cited answers

**Headline:** "Answers, with the why"
**Subheadline:** "Champions reasoning, sources, and a clear flag when something is inferred."
**App screen featured:** Chat thread with a Garchomp vs Dragapult Speed answer, Stat Points (not EVs), `Inferred` flag, and the `Champions · Reg M-B` chip.

### Frame 2 of 6 — Core feature: Champions team builder

**Headline:** "Build a Champions team"
**Subheadline:** "Species, item, moves, nature, Stat Points — then save it for chat."
**App screen featured:** Teams list titled `Reg M-B Doubles`, six Champions slots, Teams tab selected.

### Frame 3 of 6 — Core feature: retry / share

**Headline:** "Retry, share, keep going"
**Subheadline:** "Edit a typo, copy a clean answer, or share a public link."
**App screen featured:** Mega Garchomp vs Flutter Mane answer with copy/share/pin/retry.

### Frame 4 of 6 — Core feature: live usage

**Headline:** "Live Champions usage"
**Subheadline:** "Doubles by default, Singles as a second view — dated as a snapshot."
**App screen featured:** Usage tab leaderboard (Kingambit #1), `Doubles · Regulation M-B`.

### Frame 5 of 6 — Core feature: artifact viewer drill-down

**Headline:** "See the math"
**Subheadline:** "Open a species, move, or calc without leaving the thread."
**App screen featured:** Chat dimmed behind a raised sheet: Choice Band Outrage vs Flutter Mane, roll 108–128%, OHKO after rocks, `Inferred` Stat Points at level 50.
**Composition and device:** Device centered; sheet occupies the lower half.
**Background and color treatment:** Cream canvas `#FBF7F4` — same as the rest of the set.
**Mood and energy:** Detailed, satisfying — the "aha, now I get it" moment.

### Frame 6 of 6 — CTA: guest first

**Headline:** "Start now. Sign in later."
**Subheadline:** "Ask as a guest. Save chats and teams when you want them."
**App screen featured:** Empty Chat with the `Champions · Reg M-B` chip and four starters (Battle / Teams / Rules / Usage), including Stat Points and Mega Garchomp legality.
**Composition and device:** Device centered, same mockup as frames 1–4.
**Background and color treatment:** Cream canvas `#FBF7F4`. No gold wash.
**Mood and energy:** Welcoming, low-friction — closing CTA.

---

## iPad screenshot set (13")

Same Enamel & Paper rules as the iPhone frames (lid, canvas, plates, Fredoka / Nunito Sans, display-only `Champions · Reg M-B` chip). **Device:** generic iPad bezel, no tilt. Landscape frames are the store-front; portrait proves the shell is a real tablet layout (`P-SUCCESS-2`), not a scaled phone.

Do not reuse iPhone PNGs in the iPad slot. Do not show `OakTabDock`. Headlines below repeat existing capabilities — they are not new agent features.

### iPad frame 1 of 3 — Landscape primary: Chat list | thread

**Orientation:** landscape **2752×2064**
**Headline:** "Answers, with the why"
**Subheadline:** "Champions reasoning, sources, and a clear flag when something is inferred."
**App screen featured:** iPad Chat destination: leading enamel sidebar (Chat selected), conversation list column, thread column with a Garchomp vs Dragapult Speed answer, Stat Points (not EVs), `Inferred` flag, and the `Champions · Reg M-B` chip. Composer at the bottom of the **thread** column, not a phone-width strip in a void.

### iPad frame 2 of 3 — Landscape: Teams workbench

**Orientation:** landscape **2752×2064**
**Headline:** "Build a Champions team"
**Subheadline:** "Species, item, moves, nature, Stat Points — then save it for chat."
**App screen featured:** iPad Teams workbench split: sidebar (Teams selected), library list, six-slot canvas titled `Reg M-B Doubles`. Show the tablet columns, not the iPhone list-then-editor stack.

### iPad frame 3 of 3 — Portrait: sidebar + split

**Orientation:** portrait **2064×2752**
**Headline:** "Retry, share, keep going"
**Subheadline:** "Edit a typo, copy a clean answer, or share a public link."
**App screen featured:** Portrait iPad shell with the enamel sidebar (or rail) still visible and a **split** on screen — Chat list|thread **or** the Teams workbench. Distinct from the landscape frames; still not an iPhone screenshot with padding.

Optional extra (not required for the first upload): Dex index|profile or Calc attacker|defender|result in landscape, same capability copy as iPhone usage/calc frames. Still no “iPad-only Oak features” in headlines.
