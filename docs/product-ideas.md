# Oak — product ideas and quality-of-life

Written 2026-08-16 as a durable catalog of features and quality-of-life
improvements for **web** and **iOS**. Candidates, not commitments. Android
ships the same product surface; anything that touches shared client UX should
land on all three clients in the same change unless the gap is truly
platform-specific.

Oak is already a complete v1: reasoned, cited chat; teams plus analysis; Dex;
artifacts; vision; voice; eleven generation scopes; durable signed-in history;
background turns. The next gains are not “more chat.” They are making the
daily loops faster, closing friction testers already named, and picking one or
two identity-defining surfaces.

**Through-line.** Oak already *knows* more than it *lets you do without
talking*. Highest-leverage work turns existing data and formulas into instant
surfaces, makes answers leave the app, and gives casual players a place that
isn’t a blank composer.

---

## If you only pick five

These change the product the most for the least new surface.

1. **Interactive damage calculator.** The highest-frequency competitive
   question should not cost a chat turn. Attacker, defender, move, field
   state, KO chance — computed from the existing portable formulas, with an
   “explain this calc” hop into chat.
2. **Shareable answers.** Oak’s answers are the product; they currently die
   in a private scroll. One turn, one public read-only URL, same answer card,
   revoke-able by the sharer.
3. **Push / Live Activity when a background turn finishes.** Generation
   already detaches from the socket. The phone just never tells you the
   answer is ready.
4. **Edit a team’s format in place**, plus weather and terrain in team
   analysis. Testers asked for the format switch. Analysis already admits
   weather, terrain, and dynamic items are unmodeled.
5. **Add-to-team from anywhere** — candidate table, Dex, artifact, usage
   set. The hop from “this Pokémon” to “on my team” is missing.

The bigger bets (replay analysis, playthrough companion, live battle
co-pilot) are real, but they are new products on top of Oak, not quality of
life.

---

## 1. Chat — quality of life

Daily friction of “ask Oak something.”

### Retry / regenerate the last turn

One bad scope guess or a thin answer currently means retyping the question.
A regenerate control on the last assistant turn re-runs the same user
message (same images, same scope seed) as a new turn. Keep the previous
answer until the new one lands, or replace it — decide in the spec. Pairs
with the existing Stop + restore-typed-message path.

**Platform:** web and iOS.

### Edit last message and resend

Same contract as every modern chat app. Editing the last user message stops
any in-flight turn on that conversation, replaces the user text (and
optional attachments), and starts a new turn. Earlier turns stay. Needed
because a typo or a missing generation name currently burns a whole turn.

**Platform:** web and iOS.

### Copy answer as human text

Today the export is “Copy for agents” — machine markdown for pasting into
other tools. People also paste into Discord, Showdown chat, Notes, and
Reddit. Add a human copy: the bottom-line answer plus the fact table, no
internal labels, no citation schema. Keep the agent export.

**Platform:** web and iOS.

### Share this answer as a public read-only link

Answers carry reasoning, citations, and uncertainty flags — genuinely good
content — but they die in a private scroll or a guest’s in-memory session. A
share action snapshots one turn (question + full structured answer) to an
immutable public URL, rendered by the same answer-card tree. No live data
reads on view, no auth required to view. Sharer (signed-in) can revoke.
Open-graph tags so the link unfurls on Discord, X, and iMessage. A shared
proposed team should offer “open in Oak” that imports the team or seeds a
new chat.

Decide in the spec: guests allowed (then no revocation identity) or
signed-in only; whether the public page includes the user-authored question
(moderation surface) or the answer only; indefinite vs expiring links. Not
whole-conversation sharing in v1.

**Platform:** web page plus iOS share sheet.

### Export a conversation as Markdown or PDF

History can be searched, pinned, renamed, filtered by format, and deleted.
It cannot leave the app. Students and VGC players want a record of a
team-build thread. Export one conversation as readable Markdown (question /
answer / tables) or a simple PDF. No tool-activity trace required.

**Platform:** web and iOS.

### Persist attached images in history

Images are consume-on-turn: they ride only on the current user message and
are never stored. On resume, “what is this?” and “rate this team sheet”
threads become unreadable — the answer refers to a picture that is gone.
Store the uploaded images with the signed-in turn (same count/size/MIME
caps as today), render the thumbnail on the user bubble, and keep them out
of the model’s long-term history except as the original turn’s input. Guest
threads can stay ephemeral.

**Platform:** web, iOS, and the chat persistence path.

### Pin a turn inside a conversation

Long team-build threads bury the useful calc or the legal six-mon proposal.
A per-turn pin floats that card to a strip at the top of the thread (or a
jump list). Independent of conversation-level pin in the history sidebar.

**Platform:** web and iOS.

### Branch / fork a conversation

“Same team, try rain instead of sun” currently overwrites the original
line of thought or requires a new chat that forgets context. Fork duplicates
the thread up to a chosen turn into a new conversation, then continues
independently.

**Platform:** web and iOS.

### Undo send

Stop already restores the typed message. Accidental send is still common on
iOS, especially with image attachments. A three-second undo on the just-sent
user bubble cancels the turn (existing stop endpoint) and puts the text and
images back in the composer.

**Platform:** web and iOS.

### @mention a saved team in the composer

The per-conversation active-team chip was removed. Teams are referenced by
name in prose; the agent calls `list_teams` then `get_team`. That is easy to
forget. Autocomplete on `@` lists the account’s teams; inserting one sends
a stable mention the server binds the same way a former active team was
bound — so “is @rain-offense weak to Trick Room?” does not depend on the
model string-matching the name.

**Platform:** web and iOS.

### Paste detection

- A Showdown team paste in the composer offers “Import as team?” (existing
  import path) instead of sending it as a chat message.
- A Showdown replay URL or raw battle log offers “Analyze this replay?”
  (see replay analysis below).
- Web already accepts pasted images. iOS should treat a paste from Photos
  the same way the attach menu does, and dismiss the attach menu when typing
  starts (that last part already shipped).

**Platform:** web and iOS.

### Suggested follow-ups that do work

Today suggestion chips are mostly “tell me more” or entity-disambiguation.
Drive follow-ups from the structured answer: “Add Garchomp to a team,”
“Open this calc,” “Compare to Excadrill,” “Switch to Gen 5.” Each chip is a
real action or a well-formed next message, never a dead-end.

**Platform:** web and iOS.

### Command palette (web)

⌘K opens a palette: new chat, jump to a conversation, a Dex entry, a saved
team, the usage leaderboard, or a saved prompt. Keyboard-first users live
in the composer and never discover Teams or Dex.

**Platform:** web first. iOS equivalent is Spotlight over Dex (below).

### Keyboard shortcuts (web)

New chat, focus composer, Stop, pin conversation, search history, toggle
scope picker. Document them in the Account or a `?` overlay.

**Platform:** web.

### Saved prompts / prompt library

Signed-in users save prompts they reuse: “Build a restricted pair for the
current VGC regulation,” “Explain this Champions screenshot,” “Where do I
catch this in the game I’m playing?” Pick one from the empty state or the
command palette. Not custom instructions — just named text.

**Platform:** web and iOS.

### Slash commands

`/calc`, `/compare`, `/team`, `/usage` route to the matching surface
without burning a twenty-tool turn. `/calc garchomp earthquake vs gholdengo`
can prefill the calculator. Unknown slashes send as normal text.

**Platform:** web and iOS.

### Conversation folders, archive, bulk delete

History is pin / rename / search / format-filter only. Power users will
drown. Add optional folders or tags, an archive that hides a thread from
the default list without deleting it, and multi-select delete.

**Platform:** web and iOS.

### Filter history by kind

Filter by voice vs text, has-image, has-proposed-team, and scope. Threads
are becoming mixed-media and the current format filter is not enough.

**Platform:** web and iOS.

### Semantic search over history

Search is ILIKE on title plus message text. It misses “that rain team from
last week” when the title is auto-derived and the word “rain” only appears
in reasoning. A small embedding index over signed-in conversations, or a
cheap query-expansion pass, would make resume actually work.

**Platform:** web, iOS, and a search API change.

### Better empty state for returning users

The empty desk shows four random starters (Battle / Dex / Rules / Meta).
A returning signed-in user should also see: continue last team, last
scope, last unanswered calc, last conversation. Guests keep the starters.

**Platform:** web and iOS.

### Persist a scope-chip pick with no follow-up message

Today a chip pick only seeds the next message. If the user never sends,
the pick is forgotten. That feels broken. Persist the pick as the
conversation’s sticky scope (and, for signed-in users, as
`account.last_used_scope`) the moment it changes.

**Platform:** web and iOS.

### Most-recently-used scopes at the top

Testers asked for signed-in users to see recently selected games first,
and guests to keep release-date descending. Release-date order shipped.
MRU for signed-in users did not.

**Platform:** web and iOS.

### Cross-scope compare in one turn

“How does Garchomp differ in Gen 4 vs Gen 9?” currently wants two chats
or a lucky `run_sql`. The agent should be able to read two format indexes
in one turn and emit a comparison artifact (stats, typing, abilities,
movepool diff, speed). Scope stays server-controlled; the compare is an
explicit two-format read, not a silent scope widen.

**Platform:** agent plus both clients.

### Visible rate-limit remaining

Guests hit the wall with no countdown. Show remaining asks in the current
window on the composer or Account tab, and a clear “back in Ns” when the
limit fires — not a raw 429.

**Platform:** web and iOS.

### Turn-still-running banner when you come back

Background turns already keep generating after a tab hide or app
background. The UI can still feel like the app forgot you. On resume, if
the conversation has an active turn, show a persistent banner and
reattach — including after a full app relaunch (the conversation payload
already carries `active_turn` for this).

**Platform:** both, especially iOS.

---

## 2. Answer card and artifacts

The answer card is Oak’s signature. It can do more without a new product.

### Add this Pokémon to a team

From subject cards, candidate rows, and artifacts: pick a saved team (or
create one) and drop the species into the next empty slot. Opens the
editor on that slot. The hop from “this Pokémon” to “on my team” is the
missing verb.

**Platform:** web and iOS.

### Open in calculator from a damage block

Any `damage_calc` section offers “Open in calculator,” prefilling
attacker, defender, move, and the assumptions the agent used. The user
can then change EVs, items, or field without another chat turn. “Explain
this calc” hops back into chat with the configured scenario.

**Platform:** web and iOS, once the calculator surface exists.

### Open in Dex from any entity

Web already has `/pokedex/[slug]`, `/moves/[slug]`, `/abilities/[slug]`,
`/items/[slug]`. Every structured entity in an answer should deep-link
there (web) or push the Dex profile (iOS). Same hop from the artifact
viewer.

**Platform:** web and iOS.

### Sort, filter, and export the candidate table

Filter queries already return a truncated table. Let the user sort
columns (some of this exists), filter the shown rows (“only Dragons”),
pin a row, and export the shown set as CSV. Warehouse-style answers
(“which species’ dex number equals its base-stat total?”) especially
need download / open-as-spreadsheet.

**Platform:** web and iOS.

### Compare two subjects as a keep-open artifact

A first-class comparison artifact (two species, any two scopes) that
stays open beside the thread: stats, typing, abilities, speed, movepool
diff. Not just a one-shot table that scrolls away.

**Platform:** web and iOS.

### Citation highlights the sentence it supports

Sources are tappable into the artifact viewer. They still don’t show
*which claim* they back. Tapping a citation should highlight the
matching sentence or fact-table row in the answer, and the artifact
should lead with the cited datum.

**Platform:** web and iOS.

### Keep artifacts across sessions

Artifacts are ephemeral by design — session-only, not shareable. Pinning
a team sheet, a comparison, or a calc so it survives relaunch is the
obvious next step. Pinned artifacts live on the account, reopen from a
strip on the conversation or a small library, and still don’t become a
second product.

**Platform:** web and iOS.

### Voice turns should render a real answer card

Voice currently writes a synthesized minimal answer: spoken text, empty
citations, no tables, no proposed team. After speech, hydrate a real
structured answer (or run a short text turn that compiles the spoken
conclusion against the tools already called) so history matches text
chat. A mic glyph on the turn distinguishes origin.

**Platform:** web and iOS, plus the voice transcript path.

### Compact / full answer toggle

Competitive users want the fact table first. Casual users want the
prose. A per-account “compact / full” default (collapse reasoning and
sources by default vs expand them) is a one-line preference that changes
every thread.

**Platform:** web and iOS.

### Copy a proposed team as Showdown paste in one tap

The proposal card should have the same copy-paste affordance as the team
editor export, without opening the Teams page.

**Platform:** web and iOS.

---

## 3. Teams

The builder is real. The workflow around it is still a filing cabinet plus
an analysis panel.

### Edit a team’s format in place

Testers asked to switch a team between formats without recreating it.
Blocked on cross-format legality re-validation: a Gen 9 set dropped into
Gen 3 will show Absolite Z and Adamant Orb as if they belong. Options:
(a) duplicate-into-new-format as the honest v1, re-running `validateTeam`
and keeping the original; (b) in-place convert with a confirm sheet that
lists every slot that becomes illegal and clears or flags those fields.
Warn-but-allow still applies; the user must see the new warnings before
save.

**Platform:** web and iOS.

### Weather, terrain, and dynamic items in analysis

Team analysis already covers defensive type matrix, offensive coverage,
speed tiers, role/utility inventory, phys/spec balance, a meta threat
board (Gen 9 OU for SV/NatDex), and sample damage lines. The residual
caveat is explicit: abilities and items outside a curated matchup table,
weather, terrain, and dynamic effects are not fully modeled. Extending
the analyzer with rain/sun/sand/snow, terrains, and a larger item table
(Choice items, assault vest, eviolite, boots) makes the threat board
honest.

**Platform:** analysis endpoint plus web and iOS panels.

### Champions threat board from live usage

The Gen 9 OU threat board uses stored monthly ladder stats. Champions
has no stored ladder; it has a live usage tool. The Champions analysis
panel should call that live usage (or a short-TTL cache of it) so the
threat list is real, not empty or borrowed from OU.

**Platform:** analysis endpoint plus both clients.

### EV / IV presets

One tap: 252/0, min-max, 0 Speed, 0 Atk, “copy spread from another
member,” Curious Medicine / Neutralizing Gas aware resets. The running
508 total and leftover pool should be visible while dragging sliders.

**Platform:** web and iOS team editors.

### Better EV sliders

A running 508 total, leftover pool, and snap-to-4. Hitting the cap
should dim the other sliders instead of silently overflowing and warning
on save.

**Platform:** web and iOS.

### Grow the common-set template library

“Apply common set” exists. Grow the library per scope: OU roles, VGC
restricted pairs, Champions roles, in-game “story sweeper” presets. Each
template is a named, format-bound set the user can apply to a slot.

**Platform:** existing set-template endpoint plus both editors.

### Auto-suggest item, ability, and moves from usage

When a species is picked, offer the usage-derived representative set
(already shown on the web usage drill-in) as “Apply OU set” / “Apply
Champions set.” One tap fills the slot; the user can still edit.

**Platform:** web and iOS.

### Fill empty slots from coverage gaps

“You need a Water resist and speed control” should offer two or three
legal species from the team’s format, preferably usage-weighted, that
close the hole. The user picks; the agent does not write the team.

**Platform:** analysis plus both editors.

### Random legal set

For a species in the team’s format, fill a legal ability, item, four
moves, nature, and a sensible EV spread. Useful for experimenting and
for filling a sixth slot.

**Platform:** web and iOS.

### Hidden Power type readout

On old-gen teams, show the Hidden Power type implied by the IV spread.
Pairs with real Gen 1–4 formula work (below).

**Platform:** web and iOS.

### Tera recommendation from coverage holes

Given the other five members and the current Tera types, suggest a Tera
for this slot that covers an unresisted attacking type or a defensive
hole. Label it as a suggestion, not a rule.

**Platform:** analysis plus both editors.

### Item-clause and species-clause visuals

Before save, show a small diagram: two members holding the same item,
or two of the same species, highlighted on the roster strip. Today this
is only a warning string.

**Platform:** web and iOS.

### Duplicate a member

Same species, different set — common in VGC practice. Copies the slot
into the next empty slot.

**Platform:** web and iOS.

### Notes per team and per slot

`win_condition` already exists on the team. Free-text notes do not: why
this set exists, what it answers, what to lead. Per-slot notes too.

**Platform:** web and iOS.

### Team folders, tags, favorites

VGC, ladder, in-game, archive. A star for the two teams you actually
use. The list will not stay small.

**Platform:** web and iOS.

### Compare two saved teams

Side by side: coverage, speed tiers, shared weaknesses, role inventory.
Not a chat turn.

**Platform:** web and iOS.

### Team version history

Don’t lose last week’s spread when you tinker. Snapshot on save (or on
an explicit “save version”), browse diffs per slot, restore.

**Platform:** web and iOS.

### Export as image

Showdown paste is for Showdown. People also share pictures. Render a
six-sprite team card (sets, Tera, item) as a PNG for Discord and X.
Web download; iOS share sheet.

**Platform:** web and iOS.

### Rental codes / QR

If Champions or an official format exposes rental codes, import and
export them. Until then, a QR of the Showdown paste is a cheap stand-in
for passing a team across devices.

**Platform:** web and iOS.

### Bring-6-pick-4 planner

For VGC: mark which four you’d lead into common archetypes, and which
two sit. Store the marks on the team. Analysis can score each subset.

**Platform:** web and iOS.

### Restricted pairing helper

For VGC restricted formats: given one restricted, list legal partners
that cover its holes, usage-weighted when the ladder exists.

**Platform:** web and iOS.

### Import from screenshot as a first-class Teams action

Not only “attach in chat.” A button on the Teams page: camera or photo
library, parse a Champions stats screen or a Showdown box, create or
update a team. Nature-from-red-up/blue-down chevrons is already taught
to the image-reading prompt; wrap it in UI so the user does not have to
know to ask.

**Platform:** web and iOS.

### Usage set → “Use on a team”

From the usage drill-in (web today, iOS when `/meta` is ported): one tap
applies the representative set to a chosen team slot.

**Platform:** web and iOS.

### Ask Oak about this team prefills the composer

Don’t open a blank chat. Prefill with the team name and a one-line
analysis summary (“@rain-offense is weak to Water and Fairy; speed
control is Scarf Dragapult. What do you want to change?”).

**Platform:** web and iOS.

---

## 4. Competitive reference

The public usage section is web-only and Gen 9 OU only. iOS Dex has
Pokémon, moves, abilities, and items — and no usage surface. This is the
biggest web/iOS parity hole.

### Port the usage section to iOS

Leaderboard, per-species drill-in, usage-derived representative set,
Showdown-paste copy, “Ask Oak” into chat. Same data the web `/meta`
pages already read. A fifth tab is too many; put it under Dex as a
Usage segment, or as a first-class screen from the Dex toolbar.

**Platform:** iOS (web already has it).

### More ladders on the same metagame axis

The stored usage tables are config-driven. V1 is exactly one ladder:
Gen 9 OU (Smogon singles, 1695 cutoff). Add VGC (current regulation),
UU / RU / NU, Doubles OU, Battle Stadium Singles. Each new ladder is a
config entry plus a monthly sync, not a redesign. Champions stays on
the live usage tool, not these stored snapshots.

**Platform:** ingest plus web and iOS.

### Month-over-month movement on the leaderboard

Every synced month is already stored. Show rises, drops, and new
entries. A sparkline per species already exists on web; promote
movement as a first-class column and a “movers” view.

**Platform:** web and iOS.

### Checks, counters, and teammates pages

Smogon chaos stats include teammate and check/counter data. Surface
them on the species drill-in: common partners, common answers, common
leads. This is what Pikalytics users come for.

**Platform:** ingest fields plus web and iOS.

### Sample sets as a browsable library

Usage-derived sets exist on the species drill-in. Let people browse
sets without picking a species first: “OU balance cores,” “VGC sun,”
“Champions Mega Swampert.” Each set copies as Showdown paste and
offers “Use on a team.”

**Platform:** web and iOS.

### Automate the monthly usage sync

Sync is a manual CLI run a few days after Smogon publishes. A scheduled
Fly machine that pulls the latest published month for every configured
ladder removes the “forgot to refresh” failure mode.

**Platform:** ops, not a client change.

### Champions usage as a first-class page

Champions usage today is a live tool the agent calls. Give it the same
leaderboard + drill-in treatment as Gen 9 OU, clearly dated, with an
honest “live ladder, not a monthly snapshot” label.

**Platform:** web and iOS.

### Regulation / patch chip

Champions and VGC rotate. A small chip on chat, Teams, and usage pages
names the regulation the data is for (“Regulation I,” “Champions
M-B”). Answers can then say “as of Regulation I” instead of implying
eternity.

**Platform:** web and iOS.

### Type chart as its own page

The one thing every Pokémon app has that Oak buries in chat. An
always-available 18×18 chart, generation-aware (no Fairy pre-Gen 6, no
Dark/Steel pre-Gen 2), tappable types that open the Dex filter. Web
page plus iOS Dex segment.

**Platform:** web and iOS.

### Standalone speed-tier chart

“Who outspeeds +1 Dragapult?” Nature, item (Scarf, Tailwind, Trick
Room), and format toggles. Computed from the existing stat formula, no
model. Prefill from a team slot.

**Platform:** web and iOS.

### Core / synergy finder

“What pairs with Landorus-T in OU this month?” Usage teammates plus
defensive/offensive complementarity. A page, not a chat turn, with
“Ask Oak why” as the explainer.

**Platform:** web and iOS.

---

## 5. Interactive tools that should skip the model

The battle-math core (stat computation, damage estimate, natures, type
chart) is pure, deterministic, and test-guarded. Chat is the slow,
expensive way to use it. These should be web pages and iOS screens.
Chat remains the explainer.

### Damage calculator

Pick attacker and defender (species plus full set: ability, item,
nature, EVs/IVs, Tera), move, and field modifiers. Render damage rolls,
percentages, and KO chances against common defensive spreads. Formulas
run client-side where possible; species/move picker data comes from the
existing index via a thin read API. Format-aware via the eleven scopes.
Prefill a side from a saved team slot. A result can open as an artifact
or seed a chat turn for “explain why.”

Open questions to settle in the spec: full Smogon-calc modifier parity
(weather, screens, every ability/item) vs the subset the current
estimator models; whether a calc becomes a defined artifact type so
chat answers can open one pre-filled. Gens 5–9 only until old-gen
formula variants land.

**Platform:** web and iOS.

### Stat calculator

Level, nature, EVs/IVs, items, gen-aware once old-gen formulas exist.
The inverse too: “what EVs do I need to outspeed this?”

**Platform:** web and iOS.

### Catch-rate calculator

Ball, status, HP fraction, generation. Complements encounter lookup.
Honest about gen-specific ball modifiers.

**Platform:** web and iOS.

### Compare page

Two species, any two scopes. Stats, typing, abilities, speed, movepool
diff. The keep-open artifact above can be this page opened in a sheet.

**Platform:** web and iOS.

### Breeding planner

Egg groups, egg moves, Masuda method, IV inheritance, hatch steps,
destiny knot / power items. A first-class casual/competitive-adjacent
job Oak cannot do in the UI today.

**Platform:** web and iOS.

### Type coverage widget

Pick four moves, see uncovered types. Already inside team analysis;
deserves a standalone so it works without a saved team.

**Platform:** web and iOS.

---

## 6. Voice

Voice exists on web and iOS, signed-in only. The browser or phone talks
directly to xAI’s realtime API with a server-minted token. The voice
model is its own brain: it calls Oak’s tools and speaks, then a
finished turn is written as a thin transcript.

### Guest voice, or a sixty-second guest trial

The mic currently nudges sign-in. A short guest session (hard cap, no
history persist) lets someone hear the product before making an
account. Or keep the gate and make the nudge explain *why* (history
unification, cost).

**Platform:** web and iOS.

### Structured voice answers

After speech, hydrate a real structured answer so history matches text
chat: reasoning, citations, tables, proposed teams. Either compile from
the tools the voice model already called, or run a short text turn that
does. Origin stays marked as voice.

**Platform:** web, iOS, transcript path.

### Mic glyph on conversations that used voice

Neither the conversation row nor the turn record currently distinguishes
voice from text. A mic glyph in the user’s history (and a Voice filter)
is the user-facing half. The operator half is a `used_voice` flag on
the conversation for the admin browser.

**Platform:** web, iOS, admin.

### Push-to-talk versus voice-activity detection

VAD is wrong in noisy rooms and on commutes. Offer a hold-to-talk mode
that does not send until release, and keep VAD as the default for a
quiet desk.

**Platform:** web and iOS.

### Voice picker and speed

The server already has a single knob for the persona voice (`rex`,
with `eve` / `ara` / `sal` / `leo` available). Expose picker and
playback speed in Account. One preference, both clients.

**Platform:** web and iOS.

### Voice plus images in one turn

“What’s on my team sheet?” while holding the phone up. Attachments
already exist on text turns; voice should accept the same up-to-four
images for the current spoken turn.

**Platform:** web and iOS.

### iOS background, Lock Screen, Dynamic Island

A live voice session should survive a brief app switch, show Lock
Screen controls (end, mute), and use a Live Activity / Dynamic Island
for the open session. AirPods barge-in should flush playback the way
the in-app VAD already does.

**Platform:** iOS.

### Siri / App Intent

“Ask Oak whether Fake Out works on Farigiraf.” Returns a spoken
summary and opens the thread. Needs an App Intent and the existing
chat (or voice) API.

**Platform:** iOS.

### Captions that stay after End

Live captions vanish when the overlay closes. Persist them as the
visible user/assistant text in the thread (they already post as a
transcript) and offer copy/share on the overlay before it dismisses.

**Platform:** web and iOS.

### Voice in the team builder

“Give this Garchomp a Scarf set” from the editor, not only from chat.
The teams-assistant already exists as a text side panel; a mic on that
panel is the smallest version.

**Platform:** web and iOS.

---

## 7. iOS-native capabilities

These are why the native app exists. Most were explicitly out of v1
(push, widgets, Siri, iPad, Watch, offline caches, sharing beyond
Showdown export, Sign in with Apple) and are now worth a v1.1.

### Push when a background turn completes

Generation already detaches from the SSE connection. If the phone
sleeps, the turn keeps running and persists on completion. The missing
half is an APNs ping: “Oak finished answering.” Needs a push-registration
endpoint, a device-token table, and a fire-and-forget send on turn
complete. Deep link opens the conversation and replays the finished
turn.

**Platform:** iOS, plus a small backend. Web can use the Notifications
API later.

### Live Activity / Dynamic Island for a long turn

“Looking up learnsets… 3/6.” Background turns can run tens of seconds.
A Live Activity is the honest in-progress UI when the user has left
the chat. Updates from the same turn-store events the SSE subscriber
already sees.

**Platform:** iOS.

### Focus-aware pushes

Silence them in Sleep. Allow them in a custom “Laddering” focus. Use
the system Focus filter, don’t invent a second switch.

**Platform:** iOS.

### Share extension

Safari, Photos, Files, Showdown in the browser → “Ask Oak.” Screenshots
of team preview and Champions stats are the number-one mobile question
type. The extension attaches the image (or the selected text) and opens
a new chat with it staged.

**Platform:** iOS.

### Universal links

`https://oak.gowtam.ai/pokedex/garchomp`, `/a/<shared-id>`,
`/teams?import=…` open the app when installed, the web page otherwise.
Same account, same data.

**Platform:** iOS plus associated-domains on the web host.

### Home-screen widgets

Daily question, last saved team (six sprites), OU usage mover of the
month, type chart, “continue last chat.” Small / medium / large. Taps
open the matching screen. No trademarked Pokéball art; sprites from
the existing media routes are data and stay.

**Platform:** iOS.

### Spotlight over Dex

Index species, moves, abilities, and items on device (or via Core
Spotlight from the last Dex fetch). Typing “Armor Tail” in Spotlight
opens the Dex profile.

**Platform:** iOS.

### Control Center, Action button, Camera Control

A control that opens a new chat with the camera staged. iPhone 16
Camera Control can mean “identify this Pokémon” with one click.

**Platform:** iOS.

### iPad split view

The app is iPhone-only in v1 and runs letterboxed on iPad. Chat + Dex,
or chat + team editor, is the obvious tablet layout. Stage Manager
should not break it.

**Platform:** iPad.

### Mac

VGC players live on laptops. Catalyst or a thin native Mac app that
is the iPad layout plus keyboard shortcuts. Not a third product —
the same API client.

**Platform:** Mac.

### Offline Dex browse

Answering still needs the network. Looking up Garchomp’s typing does
not. Cache the public index (the same payload Dex already fetches) and
serve profiles from it when offline, with a clear “you’re offline —
chat is unavailable” state.

**Platform:** iOS. Web can do the same with a service worker later.

### Offline last-N conversations, read-only

v1 stores almost nothing on device (session token only). Cache the
last several opened threads so a commute tunnel doesn’t show a blank
history. Writes stay online-only.

**Platform:** iOS.

### Handoff between web and iOS

Same account, same conversation, continue on the other device. Universal
links plus `active_turn` already make the data half work; Handoff is
the system gesture.

**Platform:** iOS plus web.

### Passkeys and Sign in with Apple

Email OTP is the only login. OTP paste already got a TestFlight fix.
Passkeys are the modern complement (one tap, no code). Sign in with
Apple is not required while OTP is first-party, but it is the
App Store-native path if another social login is ever added, and it
removes the “I can’t get the email” failure.

**Platform:** iOS and web.

### What’s New sheet on first launch after a build

An update-available sheet already exists. A one-screen “what’s new in
this build” after a marketing-version bump stops testers from
discovering features by accident.

**Platform:** iOS. Web can show the same once.

---

## 8. Web-only quality of life

### Command palette and shortcuts

Covered above. Web is where they pay off first.

### Drag-and-drop images onto the composer

Paste exists. Drop from Finder or another tab should go through the
same downscale-and-attach path, same four-image cap.

**Platform:** web.

### Installable PWA / Add to Dock

Same icon as iOS, standalone window, composer-first. Not a replacement
for the native app; a better laptop bookmark.

**Platform:** web.

### Link chat entities to reference pages

When an answer cites Garchomp, the name is an in-app artifact link.
Also link it to `/pokedex/garchomp`. Every conversation becomes crawl
equity, and users get a browsable surface that survives the thread.

**Platform:** web.

### Put usage in the app rail

The rail links Teams, Pokédex, Moves, Abilities, Items. The usage
section is a peer of those and is currently only reachable from
outside the app chrome. Add it to the rail.

**Platform:** web.

### About page

Operator identity beyond the privacy policy. Who built this, that it
is a fan project, that it is games-only, how to reach the owner. Helps
trust and search.

**Platform:** web.

### Hand-written intros on flagship species

The top ~50 competitive Pokémon (Champions staples, OU fixtures) get
a short human intro above the generated Dex prose, so those pages are
not only deterministic templates.

**Platform:** web.

### Finish search-engine setup

Google Search Console property for `oak.gowtam.ai`, submit the five
sitemaps (static, Pokémon, moves, abilities, items), request indexing
on `/` and a couple of flagship Dex pages. Optional: Bing via the
verified Google property. Confirm the open-graph image unfurls.
Confirm FAQ structured data. Watch coverage for the ~3,200 submitted
URLs.

**Platform:** ops / web.

---

## 9. Accounts, trust, personalization

### Download my data

Account deletion exists (App Store requirement). A GDPR-style export
does not. One zip: profile, conversations (structured answers), teams,
uploaded images if those start being stored. Generate on request, email
a short-lived link.

**Platform:** web and iOS.

### Session list / revoke other devices

OTP sessions are long-lived and per-device. Show them (device, last
seen, this device) and allow revoke. Sign-out already kills the current
session; it should not be the only way to kill a lost phone.

**Platform:** web and iOS.

### Display name

Account is an email. A display name (and an initial avatar, which the
iOS polish plan already sketched) makes the Account tab feel like a
profile, not a receipt.

**Platform:** web and iOS.

### Preferences

Default scope, default expand reasoning, compact vs full answers,
“always ask before switching scope,” preferred metagame ladder, “I
play VGC / in-game / both.” Reduce Motion is already respected. These
are account-scoped so they follow the user across devices.

**Platform:** web and iOS.

### Visible, editable memory

Not silent model memory. A settings panel the user can see and edit:
“I play Regulation I,” “don’t suggest legendaries,” “I care about
in-game availability.” The agent reads it as server-bound context,
the way an active team used to be bound — never as an LLM-writable
surface, never as a hidden profile.

**Platform:** web and iOS.

### User-facing remaining asks

Show remaining chat turns in the current window on Account (and a
subtle composer hint when close to the cap). Guests and signed-in have
different caps; show the right one.

**Platform:** web and iOS.

### Guest local history

A refresh currently wipes a guest thread (in-memory, per-session,
server-side). Persist the on-screen thread in IndexedDB (web) or
on-device (iOS) so a reload doesn’t lose work before they sign in.
Sign-in still imports that thread into the account.

**Platform:** web and iOS.

### Production email sender identity

Dev/test can use a console transport. The default `onboarding@resend.dev`
only delivers to the account owner. Real multi-user delivery needs a
verified domain and `EMAIL_FROM`. This is a launch blocker for anyone
who is not the operator.

**Platform:** ops.

---

## 10. Whole-games / casual

The agent can already answer locations, glitches, walkthroughs, and
Mystery Dungeon from the wiki corpus and encounter data. There is no
product around that. The framing is still competitive-first.

### Playthrough companion / catch tracker

A per-account playthrough record: which game and version, story
checkpoint, caught/owned species checklist, current party (levels and
mid-game movesets, not competitive spreads). Manual entry in v1 — no
save-file import. The caught checklist cross-references per-game
encounter data; a Living Dex tracker falls out of this nearly for
free.

The agent reads the active playthrough the way it used to read an
active team: server-bound context or a no-arg read tool, never an
LLM-writable surface. It suggests; the user records. Then it can
answer the questions a mid-playthrough player actually has: “what
should I do next,” “what can I catch on this route that I don’t
already have,” “is my party ready for the next gym.”

Open questions: one active playthrough per game vs many named runs;
whether the active playthrough’s game should drive scope automatically;
how encounter-data gaps degrade (Gen 9 and Champions have no encounter
coverage today). Nuzlocke ruleset support (per-route first-encounter,
faint-is-gone) is a v2 nicety.

**Platform:** web and iOS. This is a whole new surface.

### Living Dex tracker

Same checklist, national-dex view, per-game view, missing-only filter,
shiny optional later. Links each missing species to encounters and to
chat.

**Platform:** web and iOS.

### Route / area pages

For the active game (Paldea, Kitakami, Blueberry, older regions):
encounters, items, and Ask Oak. Generation-aware. Empty-state honest
where encounter data doesn’t exist.

**Platform:** web and iOS.

### Gym / Elite Four prep

A structured view: recommended levels, types, “is my party ready?”
against the playthrough’s current party. Data-grounded from the wiki
corpus plus the party, flagged where the wiki is thin.

**Platform:** web and iOS.

### Evolution requirement visualizer

Friendship, time of day, held item, trade, mini-game, location. A
diagram, not a paragraph. Tappable into the Dex.

**Platform:** web and iOS.

### In-game item / TM / HM locations

A Dex-adjacent list, scoped to the active game. Complements catch
locations.

**Platform:** web and iOS.

### Mystery Dungeon as a first-class Dex section

Starters, recruiting, dungeons. Today this is wiki-only via chat.
A section in Dex (web and iOS) makes the spin-off visible.

**Platform:** web and iOS.

### Honest event / Mystery Gift degrade

Oak has no live web tool. Time-sensitive events should say so and
date the last known event in the wiki corpus, not guess.

**Platform:** prompt policy plus both clients’ empty states.

### Shiny odds / charm / sandwich / outbreak helper

For Scarlet and Violet: odds with and without the charm, sandwich
herbs, mass-outbreak mechanics. Data-grounded, flagged where the wiki
is thin. A calculator, not a chat turn.

**Platform:** web and iOS.

### Gen 8 / 9 glitch coverage

Testers pointed at Bulbapedia’s Gen 8 glitch list. Fandom (the
license-compatible corpus) has no Gen 8/9 glitch pages; Bulbapedia
and Glitch City wiki are CC-NonCommercial. Keep the honest “no
documented information” degrade. Do not scrape non-commercial
sources.

**Platform:** content policy, not a feature.

---

## 11. Bigger product bets

These are features, not quality of life. They are new products on top
of Oak.

### Showdown replay analysis

Paste a Pokémon Showdown replay URL or a raw battle log. Parse
server-side into a structured timeline (turns, moves, damage,
switches, KOs). The agent narrates turning points — damage-roll luck,
missed lines, set inferences from observed damage (“the Turn 6
Earthquake did 61%, which only a 252 Atk spread reaches”). Analysis
stays grounded, cited, and uncertainty-flagged.

Ship **paste-the-log first** so there is no user-supplied URL fetch
(SSRF, allowlists). A later allowlisted fetch of `replay.pokemonshowdown.com`
is a follow-up. Token budget: full timelines are large — window or
summarize before the model sees them, and degrade honestly on
partial or old-protocol parses. Current-gen singles and doubles are
the safe start. A per-turn drill-down on the artifact surface is the
natural deep-dive.

**Platform:** web and iOS.

### Live competitive battle co-pilot

A friendly, real-time companion that sits beside a live match. Not an
autonomous bot — the human plays, the UI assists. Four jobs: explain
the turn that just resolved, with the numbers; recommend the next
move with KO chance, speed checks, and risk; keep a live scouting
sheet of everything the opponent has revealed or that can be inferred
(speed bounds from turn order, EV spreads back-solved from damage
rolls, Choice-lock tells); keep up inside Showdown’s turn clock.

State source is a self-hosted Pokémon Showdown server, read over its
sim protocol. Two directions to prototype independently before
choosing:

- **Deterministic engine.** No model in the loop. Protocol parse →
  authoritative battle state → scouting engine (speed bounds,
  damage-roll inversion, item/ability tells, usage-prior set
  prediction) → a damage-calc sweep over every legal action → a
  heuristic (then shallow search) recommendation → templated
  narration. Wins on latency (sub-millisecond against a clock
  measured in seconds), exactness (numbers cannot disagree with
  Showdown), zero per-turn cost, and testability.
- **Per-turn language-model agent.** A deterministic assembler
  builds a compact snapshot (field, both teams, revealed-info sheet,
  legal actions, and a pre-computed damage-calc table so the model
  rarely needs a tool round-trip). A battle-specific tool subset
  feeds a loop that emits a battle-shaped answer: what happened,
  scouting updates, a recommendation with rationale, confidence,
  citations, inference flags. Wins on natural-language judgment
  (“why not switch here,” win-condition reasoning). The hard part is
  staying inside the clock: cached prefix, pre-computed calc table,
  token streaming, speculative start the instant the turn resolves,
  a fast model tier, and a fallback that shows the calc table if
  analysis is still pending.

This is a **new surface**, not a twenty-first chat tool. It does not
have to honor the chat agent’s tool contract. Do not start it until
the damage calculator and replay analysis exist — a live HUD without
a trusted calc and a replay parser is chrome on a weak engine.

**Platform:** web first (latency, keyboard, screen size). iOS is a
companion HUD, not the primary.

### Playthrough companion

Described in section 10. Called out again because it is how Oak stops
being “a competitive chat with a Dex tab.”

### Interactive calculator

Described in section 5. Called out again because it unlocks replay
analysis and the live HUD, and because it is the smallest of the big
bets.

### Shareable answers

Described in section 1. Called out again because it is the only
organic growth loop.

**Suggested order among the big bets.** Calculator and shareable
answers first. Replay analysis next. Playthrough companion when the
casual half should become a product. Live battle last.

---

## 12. Data completeness

Makes every surface smarter. Not user-visible features by themselves,
but every item above is worse without them.

### Real Gen 1–4 battle math

Gens 1–4 are selectable scopes. The modern stat and damage formulas
(EVs, IVs, natures, per-move physical/special split, Fairy type) are
wrong for those games. Gen 1–2 use DVs and stat experience, no
natures; Gen 1 has a combined Special stat; Gens 1–3 split
physical/special by type, not per move; Fairy does not exist before
Gen 6; Dark and Steel do not exist before Gen 2. Answering a “gen 2”
calc from the modern formula is silently wrong. Add gen-keyed formula
variants, keep the modern path intact for Gens 5–9, and extend the
per-gen prompt notes (no abilities before Gen 3, no held items before
Gen 2).

**Platform:** formulas, ingest, prompts. Clients just become correct.

### DV / stat-experience translation in the team builder

Old-gen teams should edit DVs and stat experience, not EVs/IVs, and
show the conversion when a team is copied across gens.

**Platform:** web and iOS editors, once the formulas exist.

### Egg moves, tutors, transfer, Home compatibility

The learnset tool answers “legal in this format,” not “how do I get
it.” Egg moves, tutors, transfer-only moves, and Home compatibility
should be first-class facets on the learnset table and in Dex.

**Platform:** ingest plus Dex and the learnset tool.

### Gen 9 encounter data

Encounter data is stored under Scarlet/Violet only and is empty for
Champions. Paldea / Kitakami / Blueberry catch questions are a core
casual job and currently degrade. Ingest Gen 9 encounters and keep
the annotate-don’t-drop behavior on gen-scoped turns.

**Platform:** ingest plus the encounters tool.

### PLA, BDSP, Let’s Go, and later mainline games

First-class scopes, or at least first-class encounter and wiki
coverage, so “Hisui” and “Brilliant Diamond” don’t silently answer
from National Dex.

**Platform:** formats, ingest, scope lexicon, both clients’ pickers.

### Breeding fields in the warehouse

Egg groups, hatch steps, gender ratio, catch rate, friendship
evolution, color, shape. Some of this is queryable today via
warehouse SQL; almost none is a UI. Adding the columns (where
missing) unlocks the breeding planner and the catch-rate calculator.

**Platform:** warehouse / ingest.

### Cries on Dex pages

Delight, optional to play, off by default under Reduce Motion and
silent-mode conventions. Official cry audio is a licensing question
to settle before building.

**Platform:** web and iOS.

### Form, gender, regional, and Paradox grouping in Dex

Web’s Pokédex explorer filters by type and generation. iOS Dex is
mostly search. Add form/regional/Paradox grouping and bring iOS
facets up to the web explorer (type, generation, category).

**Platform:** web and especially iOS.

### Tightly allowlisted live fetch, not a general web search

The general live-web tool was removed (cost vs marginal value). Two
allowlisted hosts — Showdown replays and Smogon usage — would unlock
replay analysis and fresher meta without reopening the open web.
Everything else still degrades honestly.

**Platform:** server, with a strict allowlist.

### Wiki corpus refresh cadence

The games-only Fandom corpus is built from a gitignored, manually
fetched cache. Ingest without that cache skips replacing a populated
corpus (on purpose). A documented cadence — fetch, then ingest — so
walkthroughs don’t rot.

**Platform:** ops.

---

## 13. Accessibility, localization, polish

### Finish the iOS visual polish

Depth, materials, haptics, skeletons, branded empty states, press
feedback, type-tinted subject cards, six-digit OTP boxes, profile
header on Account. The plan already exists and is chrome-only: no
behavior, view-model, or wire-contract changes. Accessibility bar
stays (Dynamic Type, semantic colors, Reduce Motion). No trademarked
Pokéball imagery.

**Platform:** iOS. Web has its own Signal theme contract.

### Dynamic Type stress-test

Answer cards and the team editor (six EV fields) explode at XXXL.
Walk every screen at the largest accessibility size and fix clipping,
not by locking font size.

**Platform:** iOS first; web with browser zoom.

### VoiceOver pass

Artifact sheets, candidate tables, and the scope picker. Combined
elements, labels that don’t say “button button,” and tables that
aren’t a bag of unlabelled cells.

**Platform:** iOS. Web: keyboard and screen-reader pass on the same
surfaces.

### Localization

At least Japanese and Spanish. Pokémon names already have official
localizations; the UI does not. Games-only copy must stay games-only
in every language (no anime pivot).

**Platform:** web and iOS.

### Reduce Motion on voice and the streaming ticker

Specified. Verify the voice overlay, the tool-activity ticker, and
the answer-card cascade honor it (crossfade or nothing, no shimmer).

**Platform:** web and iOS.

### Color-blind type encoding

Types are color-only on many chips. Always show the type name (or a
small icon) with the color. The name is the meaning carrier.

**Platform:** web and iOS.

### High contrast

Signal’s hairlines disappear for some users. A higher-contrast mode
that thickens separators and boosts text contrast, without painting
the UI red.

**Platform:** web and iOS.

### Haptics on the meaningful moments

Send, Stop, save team, copy, error, turn-complete. Planned on iOS.
Subtle and Reduce-Motion-safe.

**Platform:** iOS.

---

## 14. Onboarding and growth

### First-run tour

Three screens, not a feature dump: ask a question → open an artifact
→ save a team. Skip-able. Never again after the first completed
question.

**Platform:** web and iOS.

### Role picker on first launch

Competitive / In-game / Both. Seeds default scope, empty-state
prompts, and whether usage or playthrough is promoted. Editable later
in preferences.

**Platform:** web and iOS.

### Daily question / “Oak’s desk”

One grounded curiosity plus one meta note. A reason to open the app
that isn’t a blank composer. Tapping it sends the question.

**Platform:** web and iOS. Widget on iOS.

### Weekly meta digest

Optional email for signed-in competitive users. Month-over-month
movers, a sample set, one Ask Oak prompt. The monthly usage tables
already exist.

**Platform:** email. In-app copy on both clients.

### Public team gallery — later

Only after shareable answers prove people actually share. A gallery
is a moderation and identity surface; don’t build it first.

**Platform:** web, then iOS.

### Showdown overlay / browser extension

Oak as a sidebar on a replay or the Showdown teambuilder. Huge for
VGC. Web-only, and a different distribution problem.

**Platform:** web extension.

### Discord “Ask Oak”

Same chat API, in the communities that already talk about this. Rate
limits and a games-only system prompt still apply. A growth channel,
not a new brain.

**Platform:** Discord bot on the existing API.

---

## 15. Operator and reliability

Users feel these even though they are not features.

### Turns do not survive a process restart

Accepted today on a single always-on machine. Painful the first time
a bounce kills a forty-second team build. Persist enough running-turn
state to resume, or at least recover the last partial answer instead
of vanishing.

### User-visible queue

A 429 or 503 is a raw wall. Show “Oak is busy, your turn is queued”
with a position or a retry-in, using the existing per-conversation
and per-owner concurrency caps (one turn per conversation, three per
account, sixty-four global).

### Horizontal scale before a growth loop

One machine, a hard connection limit around twenty-five, and
in-process turn state. Shareable answers, Discord, and an App Store
feature will not work on that. Dual-backend Redis for sessions, rate
limit, and OTP already shipped. Running turns and the SSE fan-out are
still in-process. Do not point a growth loop at this until the next
scaling phase lands.

### Production email

Restated from section 9. Real users cannot sign in until the from-address
is a verified domain.

---

## Suggested sequencing

**v1.1 — close the loop**

Retry / edit; human copy plus shareable answers; persist images;
add-to-team from artifacts; scope MRU and persist chip pick; team
format change; usage section on iOS; push-on-turn-complete; damage
calculator.

**v1.2 — competitive depth**

More ladders; weather and terrain in analysis; speed-tier page;
compare page; replay paste; screenshot-import on Teams.

**v1.3 — native and casual**

Widgets; share extension; iPad split view; playthrough tracker;
Gen 9 encounters; iOS Dex filters; voice → real answer cards.

**Later / research**

Live battle co-pilot; real Gen 1–4 formulas; breeding planner;
localization; passkeys / Sign in with Apple; Showdown extension.

---

## How to use this file

Pick an item, write a real requirements pass, then an architecture
pass, then build. Do not treat a bullet here as a spec. When an item
ships, delete it or mark it shipped in place — don’t leave a ghost
catalog that disagrees with the product.

Anything that changes chat, the answer card, teams, Dex, or artifacts
needs the three-client pass (web, iOS, Android) in the same change.
Server-only work (formulas, ingest, tools) still needs a check that
the clients don’t reimplement the old behavior locally.
