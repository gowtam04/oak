# Oak — iOS App Store Listing

Category: **Reference**. Age rating: **4+**. Price: **Free, no in-app purchases.**

Champions-first (CF-INT-BR-10, CF-AS-6): listing copy describes Oak as a
**Pokémon Champions coach**, not a whole-franchise or every-generation Dex. No
National Dex default, no Smogon OU, no generation toggle.

## App Name (30 chars max)

```
Oak – AI Coach
```
**13 / 30 chars.** Home-screen name stays `Oak` (`CFBundleDisplayName`); only
the App Store display name uses this string. Oak *coaches* — it reasons and
explains — rather than just looking up. `battle` lives in Keywords so "battle
calculator" still combines with the subtitle.

## Subtitle (30 chars max)

```
Team Builder & Calculator
```
**25 / 30 chars.** Locks "team builder" into a heavily-weighted field.
"Calculator" combines cross-field with Keywords `battle` → "battle calculator"
and `damage` → "damage calculator". Zero trademarked words.

## Promotional Text (170 chars max, updatable without resubmission)

```
Oak now coaches Pokémon Champions only — Stat Points, Mega Evolution, and live Doubles/Singles usage for the current regulation. Other games are declined.
```
**154 / 170 chars.**

## Description (4000 chars max)

```
Oak is your AI coach for Pokémon Champions — a chat companion for building and reasoning about competitive teams in the current regulation. Ask a question about your roster and get a reasoned, cited answer, not a stat dump.

Most reference apps hand you raw numbers and leave the thinking to you. Oak reasons on top of the data: every answer comes with its reasoning, the sources it's grounded in, and explicit "this part is inferred" flags whenever the data doesn't fully cover your question — so you always know what's fact and what's a best guess.

Oak covers Pokémon Champions only. Other games and a National Dex are out of scope.

WHAT YOU CAN DO

• Build Champions teams — species, ability, held item, moves, nature, and Stat Points (66 total, max 32 per stat) for every slot. Everything is Level 50; Mega Evolution is the gimmick, with no Tera.
• Import and export teams using the popular Showdown text format — Stat Points ride in the EV fields.
• Check live Champions ladder usage (Doubles by default, Singles as a second view) — leaderboard plus per-species sets, dated as a snapshot.
• Ask anything in plain English and get the direct answer plus the reasoning behind it, with cited sources and clear flags when something is uncertain or inferred.
• Attach a photo or screenshot — a Champions stats screen or team sheet — and ask Oak about it directly.
• Drill into any move, ability, type matchup, or damage calculation in a dedicated detail view without losing your place in the conversation.
• Start chatting instantly as a guest, no account required. Sign in with a one-time email code (no password) when you want your chats and teams saved and synced across devices.

Oak is free to use, with no in-app purchases.

ABOUT THIS APP

Oak is an independent, unofficial fan project. It is not affiliated with, endorsed by, sponsored by, or otherwise connected to Nintendo, Game Freak, Creatures Inc., or The Pokémon Company. Game and character names referenced by the underlying data are the property of their respective owners and are mentioned solely to describe what Oak's chat and team builder are compatible with.

Questions or feedback? Reach us at www.gowtam.ai/#contact.
```

## Keywords (100 chars max, hidden, comma-separated, no spaces)

```
type,chart,weakness,coverage,moveset,damage,mega,speed,battle,showdown,import,reasoning,chat,usage
```
**98 / 100 chars.** Dropped `ev` / `iv` / `tera` (mainline knobs Oak no longer
surfaces). Added `mega` (Champions gimmick) and `usage` (live ladder). `battle`
stays so "battle calculator" still combines with the subtitle. Full historical
rationale in `aso-keywords.md` (that file's older Tera/EV notes are superseded
by this listing).

## What's New (this release)

**1.2 (build 51) — Champions-first.** Pair this listing with the 1.2 TestFlight
binary (regulation chip, Usage tab, archive, Stat Point editor). 1.1.1 below is
the previous in-review train and is **not** this listing.

```
What's new

• Oak now coaches Pokémon Champions only — current regulation, no generation picker
• Team builder uses Stat Points and Mega Evolution (no Tera)
• Live Champions usage: Doubles default, Singles as a second view
• Other games are declined; off-roster names are called out honestly
```

**1.1.1 (build 50) — in-review train (not Champions listing)** — submitted
2026-09-07 (`WAITING_FOR_REVIEW`, `releaseType: AFTER_APPROVAL`). ASC version
was the 1.1 record (created 2026-08-16, approved then held as
`PENDING_DEVELOPER_RELEASE` on build 45); that hold was developer-rejected and
retargeted as 1.1.1 so users never got the stale 1.1 binary. What's New covers
everything since 1.0.2 (the last version that shipped). 1.0.3 and 1.1 were
TestFlight / unreleased.

```
What's new in 1.1.1

• Retry an answer, edit a typo, or undo a send — no retyping
• Copy, share, or export a chat; pin turns and organize with folders
• Place a Pokémon on a team, compare, or open the calculator from an answer
• Light, Dark, or System appearance — now in Settings
• A refreshed enamel look, new app icon, and clearer thinking steps
```
**348 / 4000 chars.**

Covered since 1.0.2: Chat QoL (`d718812` — retry/edit/undo, copy/share/export, pins/forks/folders, @mention, follow-up chips); answer-card verbs (place-on-team, compare, calculator, artifact pins); Settings tab + Light/Dark/System; enamel-paper refresh + daylight `O.` icon + thinking steps; Dex list sprites. Omitted as too internal or small: spend-control banners, iOS 26 tab-bar inset, starter-prompt pool, HTML-comment hide, Grok 4.6 default.

**1.1 (build 45)** — approved 2026-08-20, never released (`PENDING_DEVELOPER_RELEASE` cancelled 2026-09-07 so 1.1.1 could submit). Prior What's New:

```
What's new in 1.1

• Retry an answer, edit a typo, or undo a send — no retyping
• Copy answers as readable text, share a public link, or export a chat
• Pin turns, fork a thread, and organize history with folders
• @mention a saved team and tap follow-up chips to keep going
• A calmer look — quieter chrome, clearer answer cards
```

**1.0.3 (build 36)** — TestFlight only; train never submitted.

```
What's new in 1.0.3

• Refreshed Instrument look — type color leads, quieter chrome
• Clearer answer cards, tables, and chat layout
• Same Dex, teams, and calculator — just easier to read
```

**1.0.2 (build 34)** — approved; train closed.

## Submission checklist (not produced by this listing — flagged for the user)

- **Privacy Policy URL** — `AccountView` already links to `oak.gowtam.ai/privacy`. Apple requires a live URL at submission; confirm it resolves before submitting.
- **Support URL** — points to `www.gowtam.ai/#contact` (an existing, live page), referenced above in the Description's contact line. Confirm the `#contact` section is reachable before submission.
- **App Icon** — daylight `O.` lockup in `Assets.xcassets/AppIcon.appiconset` (ink oval + red period on `#F6F7F9`). Same mark as web/Android.
