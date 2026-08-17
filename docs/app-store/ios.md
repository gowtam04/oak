# Oak — iOS App Store Listing

Category: **Reference**. Age rating: **4+**. Price: **Free, no in-app purchases.**

## App Name (30 chars max)

```
Oak – AI Coach
```
**13 / 30 chars.** Renamed from `Oak – AI Battle Coach` on the 1.1 listing (2026-08-16). Drops "Battle" so in-game / whole-games questions still fit the store name, and keeps the wedge: Oak *coaches* — it reasons and explains — rather than just looking up. The home-screen name stays `Oak` (`CFBundleDisplayName`); only the App Store display name changed. `battle` moved into the Keywords field so "battle calculator" still combines with the subtitle.

## Subtitle (30 chars max)

```
Team Builder & Calculator
```
**25 / 30 chars.** Reworked now that "AI" and "Battle" live in the App Name — the subtitle no longer repeats them and instead carries the next tier of high-intent terms. It locks the exact phrase "team builder" (a Tier-1 search term) into a heavily-weighted field, and "Calculator" combines cross-field with the App Name's "Battle" → "battle calculator" (Tier 1) and with the keyword "damage" → "damage calculator" (Tier 2). Zero trademarked words. (5 chars of headroom remain if you later want to append a term.)

## Promotional Text (170 chars max, updatable without resubmission)

```
New: a one-tap format toggle scopes your whole team chat and battle calculator to the current competitive regulation ruleset — no separate app, no manual rule lookups.
```
**167 / 170 chars.**

## Description (4000 chars max)

```
Oak is your AI battle coach — a chat companion for building and reasoning about competitive creature-battle teams. Ask any question about your roster and get a reasoned, cited answer, not a stat dump.

Most reference apps hand you raw numbers and leave the thinking to you. Oak reasons on top of the data: every answer comes with its reasoning, the sources it's grounded in, and explicit "this part is inferred" flags whenever the data doesn't fully cover your question — so you always know what's fact and what's a best guess.

WHAT YOU CAN DO

• Build full competitive teams — set species, ability, held item, all four moves, nature, EVs, IVs, and Tera type for every slot on your roster.
• Import and export teams using the popular Showdown text format — bring a team in from a calculator or a friend, or take yours out to use elsewhere.
• Ask anything in plain English and get the direct answer plus the reasoning behind it, with cited sources and clear flags when something is uncertain or inferred.
• Switch your entire chat and team builder to the official competitive regulation format with one toggle — no separate app, no manual rule lookups.
• Attach a photo or screenshot — a team sheet, a card, an in-game moment — and ask Oak about it directly.
• Drill into any move, ability, type matchup, or damage calculation in a dedicated detail view without losing your place in the conversation.
• Start chatting instantly as a guest, no account required. Sign in with a one-time email code (no password) when you want your chats and teams saved and synced across devices.

Oak is free to use, with no in-app purchases.

ABOUT THIS APP

Oak is an independent, unofficial fan project. It is not affiliated with, endorsed by, sponsored by, or otherwise connected to Nintendo, Game Freak, Creatures Inc., or The Pokémon Company. Game and character names referenced by the underlying data are the property of their respective owners and are mentioned solely to describe what Oak's chat and team builder are compatible with.

Questions or feedback? Reach us at www.gowtam.ai/#contact.
```
**2,085 / 4000 chars** (well within budget).

## Keywords (100 chars max, hidden, comma-separated, no spaces)

```
type,chart,weakness,coverage,moveset,damage,ev,iv,tera,speed,battle,showdown,import,reasoning,chat
```
**98 / 100 chars.** After the 1.1 rename, `battle` left the App Name so it is back in Keywords (to keep "battle calculator" with the subtitle). `chat` uses the leftover budget. Dropped `regulation` to fit. Full rationale in `aso-keywords.md`.

## What's New (this release)

**1.1 (build 38)** — TestFlight upload 2026-08-16; Dex hop, subject-sprite tap, profile edge, and the incoming thinking plate. ASC version still 1.1 (created with build 37). What's New written from changes since 1.0.2 (the last version that shipped). 1.0.3 was TestFlight-only and never submitted.

```
What's new in 1.1

• Retry an answer, edit a typo, or undo a send — no retyping
• Copy answers as readable text, share a public link, or export a chat
• Pin turns, fork a thread, and organize history with folders
• @mention a saved team and tap follow-up chips to keep going
• A calmer look — quieter chrome, clearer answer cards
```
**~340 / 4000 chars.**

Covered since 1.0.2: Chat QoL (`d718812` — retry/edit/undo, human copy, public share, export, pins/forks/folders, @mention, follow-up chips, slashes, persist scope + MRU) and the Signal visual refresh (supersedes the unshipped 1.0.3 Instrument TestFlight notes). Omitted as too internal or small: Grok 4.6 default, Dex blank-browse fix.

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
- **App Icon** — still a placeholder in `Assets.xcassets/AppIcon.appiconset`; needs a final design before screenshots/marketing assets that show the icon can be finalized.
