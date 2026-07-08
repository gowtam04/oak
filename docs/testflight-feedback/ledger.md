# TestFlight feedback ledger

Tracks every TestFlight beta feedback submission for the Oak iOS app (App Store
Connect app id `6786014161`) received via the `betaFeedbackScreenshotSubmissions`
and `betaFeedbackCrashSubmissions` endpoints. App Store Connect has no
workflow/status concept of its own and the feedback assets (screenshots, crash
logs) expire ~30 days after upload, so this ledger is the durable record of
what was reported, when, on which build, and what (if anything) was done
about it.

New feedback is pulled in with `node ios/scripts/asc-feedback.mjs` (see
`ios/scripts/asc-feedback.mjs` for the required `APP_STORE_CONNECT_API_KEY_*`
env vars). The script appends one `pending` block per new submission below —
existing blocks are never modified or re-downloaded by the script; only a
human (or an agent fixing the underlying issue) edits their status line.

## Status vocabulary

- `pending` — reported, not yet addressed.
- `fixed (<commit>, build N)` — shipped in the given commit, first available in build N.
- `partial` — part of the report was addressed; the block explains what remains.
- `deferred (<reason>)` — intentionally not fixed yet; reason states why/what's blocking.
- `wontfix` — will not be addressed; reason should be captured in the entry.

Each block below is a machine-parseable `### <submission-id>` heading — the
sync script greps these to dedupe against ASC's response.

## Entries

### AP7ORHhAn7JfSU7lo32bgtw

- **Date:** 2026-07-04T22:13:09.993Z
- **Type:** crash
- **Build:** 11 (confirmed — crash.log `Version: 1.0.0 (11)`)
- **Device/OS:** iPhone17_1, iOS 26.5, en-US
- **Submitter:** gowtam04@gmail.com
- **Status:** fixed (533856a — ships in the next TestFlight build, 12)

  The AVAudio tap block inherited MainActor isolation and trapped on the
  realtime render thread; the tap body is now a compiler-checked
  `nonisolated` function installed via an explicitly `@Sendable` block, with
  an off-main regression test.

> App crashed when I pressed the voice mode mic button

**Assets:** [crash.log](assets/AP7ORHhAn7JfSU7lo32bgtw/crash.log)

### AOFoJ7BFy92VZUkj76Bo07Y

- **Date:** 2026-07-04T20:44:33.59Z
- **Type:** screenshot
- **Build:** 11 (inferred — timing places it after the 08:35 build 8 upload and closest to the build-11 crash)
- **Device/OS:** iPhone17_1, iOS 26.5, en-US
- **Submitter:** gowtam04@gmail.com
- **Status:** fixed (fce9295 web / 1337325 ios / 0a0f717 android — ships in the next TestFlight build, 12)

  Truncated candidate lists now carry the withheld rows server-side
  (`candidates.hidden_rows`, ≤200 rows) and "Show all N" expands in place on
  all three clients; larger sets keep the follow-up-message fallback.

> Show me everything should expand the list not send a message

**Assets:** [screenshot-1.jpg](assets/AOFoJ7BFy92VZUkj76Bo07Y/screenshot-1.jpg)

### AFL5hr2sSL6bobYkh4WO_74

- **Date:** 2026-07-04T08:34:59.22Z
- **Type:** screenshot
- **Build:** 7 (inferred — build 8 wasn't uploaded until ~08:35)
- **Device/OS:** iPhone18_3, iOS 26.5.1, en-US
- **Submitter:** anonymous
- **Status:** fixed (0592870, build 9)

> Think about updating UI to see how showing default option is. What about removing the 2 line text about the default option to have cleaner UI

**Assets:** [screenshot-1.jpg](assets/AFL5hr2sSL6bobYkh4WO_74/screenshot-1.jpg)

### ADj-D1-hYBR7SnROGkHosfc

- **Date:** 2026-07-04T08:32:11.67Z
- **Type:** screenshot
- **Build:** 7 (inferred — build 8 wasn't uploaded until ~08:35)
- **Device/OS:** iPhone18_3, iOS 26.5.1, en-US
- **Submitter:** anonymous
- **Status:** deferred (BR-T3 stands; needs cross-format legality re-validation design before a team's format can be edited in place)

> Thinking of including an edit format option so users can quickly switch teams between formats. Need to think through retrying the valid team format logic according to that specific generation.

**Assets:** [screenshot-1.jpg](assets/ADj-D1-hYBR7SnROGkHosfc/screenshot-1.jpg)

### ANI1sfZPZhiAHZAFM-Qlft8

- **Date:** 2026-07-04T06:11:14.719Z
- **Type:** screenshot
- **Build:** 7 (inferred — build 8 wasn't uploaded until ~08:35)
- **Device/OS:** iPhone18_3, iOS 26.5.1, en-US
- **Submitter:** anonymous
- **Status:** partial (release-date-desc ordering shipped in 0592870, build 9; most-recently-used ordering for signed-in users deferred)

> Improving ordering, maybe do most recently selected games at the top for logged in users. Then for not logged in users just use release date desc

**Assets:** [screenshot-1.jpg](assets/ANI1sfZPZhiAHZAFM-Qlft8/screenshot-1.jpg)

### AKzvZ0LylqR6OpWlJ4hkANU

- **Date:** 2026-07-04T06:09:48.218Z
- **Type:** screenshot
- **Build:** 7 (inferred — build 8 wasn't uploaded until ~08:35)
- **Device/OS:** iPhone18_3, iOS 26.5.1, en-US
- **Submitter:** anonymous
- **Status:** fixed (0592870, build 9)

> Privacy Policy goes to not private page

**Assets:** [screenshot-1.jpg](assets/AKzvZ0LylqR6OpWlJ4hkANU/screenshot-1.jpg)

### AOtu0c87_sfBGLPAvLK34Qk

- **Date:** 2026-07-04T06:09:01.694Z
- **Type:** screenshot
- **Build:** 7 (inferred — build 8 wasn't uploaded until ~08:35)
- **Device/OS:** iPhone18_3, iOS 26.5.1, en-US
- **Submitter:** anonymous
- **Status:** fixed (0592870, build 9)

> Issue 1: At the bottom I don’t see any identifying logo for teams the way chat and account does.
>
> Issue 2: I added my pokemon but I can’t see the sprites in the UI for my new team.

**Assets:** [screenshot-1.jpg](assets/AOtu0c87_sfBGLPAvLK34Qk/screenshot-1.jpg)

### AHZJACvRWRlR8GF37Xoz-to

- **Date:** 2026-07-04T06:04:54.65Z
- **Type:** screenshot
- **Build:** 7 (inferred — build 8 wasn't uploaded until ~08:35)
- **Device/OS:** iPhone18_3, iOS 26.5.1, en-US
- **Submitter:** anonymous
- **Status:** fixed (0592870, build 9)

> Could not paste login code

**Assets:** [screenshot-1.jpg](assets/AHZJACvRWRlR8GF37Xoz-to/screenshot-1.jpg)

### AH1b0N09K-sbKo-EGciWhBg

- **Date:** 2026-07-05T14:22:45.815Z
- **Type:** screenshot
- **Build:** unknown (not available from the feedback API — attribute manually)
- **Device/OS:** iPhone18_3, iOS 26.5.1, en-US
- **Submitter:** anonymous
- **Status:** fixed (249c9e7 agent / 40373d5 web / d397ccf ios / d76cdce android — ships in the next TestFlight build, 16)

  Root cause was the prompt itself: the few-shot examples modeled naming
  internal tables/tools in user-facing answer fields and no rule forbade it.
  The system prompt now carries an explicit anti-leak rule + rewritten
  examples (plain-English provenance like "Oak's complete Pokédex records"),
  the server scrubs leaky run_sql progress labels, and all three clients stop
  rendering raw tool names / citation refs (friendly instrument words +
  display names instead).

> Don’t reply with technical information. Replace technical details with simple understandable language. For example, pmd_results table means nothing to users, so use better way to represent it.

**Assets:** [screenshot-1.jpg](assets/AH1b0N09K-sbKo-EGciWhBg/screenshot-1.jpg)

### AAkh1mmXiqwAlxc4hB9zlsk

- **Date:** 2026-07-05T14:12:49.126Z
- **Type:** screenshot
- **Build:** unknown (not available from the feedback API — attribute manually)
- **Device/OS:** iPhone18_3, iOS 26.5.1, en-US
- **Submitter:** anonymous
- **Status:** fixed (d397ccf ios / d76cdce android — ships in the next TestFlight build, 16)

  Signed-in launch now opens on a fresh chat with the history list one Back
  away (the list-as-root design was intentional but reversed per this
  feedback; guests already opened on a new chat).

> When I open iOS app, it automatically takes me to chat history instead of a new message

**Assets:** 

### AAhvrDM1epykAXEVB0Q6fLY

- **Date:** 2026-07-05T01:27:05.745Z
- **Type:** screenshot
- **Build:** unknown (not available from the feedback API — attribute manually)
- **Device/OS:** iPhone18_3, iOS 26.5.1, en-US
- **Submitter:** anonymous
- **Status:** fixed (40373d5 web / d397ccf ios / d76cdce android — ships in the next TestFlight build, 16)

  Went with clearer wording rather than provenance labels: the section is now
  "Oak's deductions" with Solid / Likely / Unsure badges on web, iOS, and
  Android (display-only; the wire high/medium/low enum is unchanged). The
  "ask questions and think through" part was expressly waived by the owner.

> Update the reasoning to also include the labels how it is in the web UI (high, medium, low)
>
> But also think through updating it so it’s not just high, medium, low but something more meaningful.
>
> Maybe like instead of high say database source. Medium is called model reasoning. Like have more meaningful labels (a few custom labels not too many). Ask questions and think through this with the user.

**Assets:** [screenshot-1.jpg](assets/AAhvrDM1epykAXEVB0Q6fLY/screenshot-1.jpg)

### AGGcchFC6_5VtW53PR7-DXo

- **Date:** 2026-07-05T01:20:28.396Z
- **Type:** screenshot
- **Build:** unknown (not available from the feedback API — attribute manually)
- **Device/OS:** iPhone18_3, iOS 26.5.1, en-US
- **Submitter:** anonymous
- **Status:** fixed (20a9abb, build 13)

  Already implemented before this feedback synced: entity citation sources
  are tappable into the artifact viewer on web/iOS/Android since 20a9abb
  (first shipped in build 13; this report came from build 12).

> Include an update to have the sources clickable into an artifact viewer so I can see more info

**Assets:** [screenshot-1.jpg](assets/AGGcchFC6_5VtW53PR7-DXo/screenshot-1.jpg)

### ANPJ-6ivGVVNKS8xFH0xFWI

- **Date:** 2026-07-06T02:50:45.802Z
- **Type:** screenshot
- **Build:** unknown (not available from the feedback API — attribute manually)
- **Device/OS:** iPhone18_3, iOS 26.5.1, en-US
- **Submitter:** anonymous
- **Status:** fixed (83aa77a agent — server-side, live after the next web deploy; duplicate of AG_1gTxMcJu5knN-sYtgIwM. Prompt-guidance fix, not a new tool: the Champions Stats screen's nature chevrons are now taught in the image-reading prompt, and the deterministic (boosted, lowered)→nature table was already in the prompt)

> Nature can be inferred based on the screenshot. We can see specific stat increases/decreases for each pokemon so it can be inferred. Create a function/tool to do this for Pokemon champion screenshots that would look similar to what I provided.

**Assets:** [screenshot-1.jpg](assets/ANPJ-6ivGVVNKS8xFH0xFWI/screenshot-1.jpg), [screenshot-2.jpg](assets/ANPJ-6ivGVVNKS8xFH0xFWI/screenshot-2.jpg)

### AL_Lc4N81kZu_ALUNkz5LfI

- **Date:** 2026-07-06T02:44:17.172Z
- **Type:** screenshot
- **Build:** unknown (not available from the feedback API — attribute manually)
- **Device/OS:** iPhone18_3, iOS 26.5.1, en-US
- **Submitter:** anonymous
- **Status:** fixed (b4c2a6a ios, build 19. Root cause: Oak's opaque nav bar hard-clipped rows scrolled under the picker header; on iOS 26 the header background is now hidden + soft top scroll edge so rows fade gracefully; applies to all six entity pickers)

> There’s a cutoff on species

**Assets:** [screenshot-1.jpg](assets/AL_Lc4N81kZu_ALUNkz5LfI/screenshot-1.jpg)

### AG_1gTxMcJu5knN-sYtgIwM

- **Date:** 2026-07-06T02:35:35.045Z
- **Type:** screenshot
- **Build:** unknown (not available from the feedback API — attribute manually)
- **Device/OS:** iPhone18_3, iOS 26.5.1, en-US
- **Submitter:** anonymous
- **Status:** fixed (83aa77a agent — server-side, live after the next web deploy. Prompt-guidance fix rather than a new tool: the image-reading prompt now teaches the Champions Stats screen's red-up/blue-down chevrons on stat labels; the deterministic (boosted, lowered)→nature mapping was already in the cached prompt, so no context-window cost)

> In pokemon champion screenshot of your team, nature can be deduced based on which stats are showing red up arrow (indicating increase) and blue down arrow (indicating decrease). But in the app it says nature is not provided.
>
> Update this in the code to recognize this for champions for similar screenshots. It should probably have its own function/tool call to make it more deterministic and provide correct answer without overloading context window.

**Assets:** [screenshot-1.jpg](assets/AG_1gTxMcJu5knN-sYtgIwM/screenshot-1.jpg), [screenshot-2.jpg](assets/AG_1gTxMcJu5knN-sYtgIwM/screenshot-2.jpg)

### APFrit48yRdOdP2IKOX6tBM

- **Date:** 2026-07-06T02:32:02.402Z
- **Type:** screenshot
- **Build:** unknown (not available from the feedback API — attribute manually)
- **Device/OS:** iPhone18_3, iOS 26.5.1, en-US
- **Submitter:** anonymous
- **Status:** fixed (93837c4 ios, build 19 / 310321d android. Attach menu and keyboard are now mutually exclusive on both clients: opening one dismisses the other, and typing dismisses an open menu)

> If I start typing it should minimize the take photo / photo library option and just show me what I’m typing. Check what other scenarios should be applied for similar items. 

**Assets:** [screenshot-1.jpg](assets/APFrit48yRdOdP2IKOX6tBM/screenshot-1.jpg)

### AK-FdIbKm2ezTwpF_aTo4A4

- **Date:** 2026-07-06T02:12:36.745Z
- **Type:** screenshot
- **Build:** unknown (not available from the feedback API — attribute manually)
- **Device/OS:** iPhone18_3, iOS 26.5.1, en-US
- **Submitter:** anonymous
- **Status:** closed (placement move tried and reverted: the chip moved to a strip above the composer in 9c3f4da ios / 2353308 android, shipped in build 19, then reverted to the top bar by owner decision in 5c7ddbc ios / 7368815 android — the bottom strip looked out of place. The "national dex" default-scope suggestion from this item DID ship: e72fc41 web + the natdex client work, build 19)

> Instead of having the user choose which generation you are selecting from on the top, move it to the bottom.
>
> I included screenshots of ProDex where the symbol on the top right mentions what category of games you are searching against. Something like this but closer to the bottom of the screen so user can switch easily. Maybe something like nice logos like ProDex or direct text like Claude. Think through the amount of objects in the UI so it’s easy to maneuver through and doesn’t overwhelm the user. 
>
> Should you have a “national dex” for general questions as the default so it can optimize for searching quickly for general questions instead of doing generation specific search.

**Assets:** [screenshot-1.jpg](assets/AK-FdIbKm2ezTwpF_aTo4A4/screenshot-1.jpg), [screenshot-2.jpg](assets/AK-FdIbKm2ezTwpF_aTo4A4/screenshot-2.jpg), [screenshot-3.jpg](assets/AK-FdIbKm2ezTwpF_aTo4A4/screenshot-3.jpg), [screenshot-4.jpg](assets/AK-FdIbKm2ezTwpF_aTo4A4/screenshot-4.jpg)

### ALF0VVZ41Rnc3HaaL_hIRRw

- **Date:** 2026-07-06T02:02:00.708Z
- **Type:** screenshot
- **Build:** unknown (not available from the feedback API — attribute manually)
- **Device/OS:** iPhone18_3, iOS 26.5.1, en-US
- **Submitter:** anonymous
- **Status:** partial (7b1b6ec web — Fandom glitch crawl expanded: "Glitches"/"Pokémon Glitches" hub pages + Glitch Pokémon category seeded, and chunk sections now carry the per-generation heading breadcrumb, so Gens 1–7 glitch questions retrieve real results after the next prod crawl+ingest. Gen 8/9 glitch content does not exist on any license-compatible wiki (Fandom has none; Bulbapedia and Glitch City wiki are CC-NonCommercial), so those gens keep the honest "no documented information" degrade — decided 2026-07-05, strict tool-grounding policy retained)

> https://bulbapedia.bulbagarden.net/wiki/List_of_glitches_in_Generation_VIII
>
> There are glitches and hacks in this gen like the ones in this article. Fix this across all gens

**Assets:** [screenshot-1.jpg](assets/ALF0VVZ41Rnc3HaaL_hIRRw/screenshot-1.jpg)

### AAtzBjJ-9ljLRQkzsLoRpdw

- **Date:** 2026-07-07T21:49:13.852Z
- **Type:** screenshot
- **Build:** unknown (not available from the feedback API — attribute manually)
- **Device/OS:** iPhone18_3, iOS 26.5.1, en-US
- **Submitter:** anonymous
- **Status:** pending

> I gave random words to see how it responds. It’s been processing for over 5 minutes. Consider timeout exceptions if the model is stuck in one step for too long and if overall process is taking too long. Maybe depending on the step / tool call there should be relevant timeout exceptions. 

**Assets:** [screenshot-1.jpg](assets/AAtzBjJ-9ljLRQkzsLoRpdw/screenshot-1.jpg)

### AK4PB-sn075S8yTdP3wFe4Q

- **Date:** 2026-07-07T01:09:55.3Z
- **Type:** screenshot
- **Build:** unknown (not available from the feedback API — attribute manually)
- **Device/OS:** iPhone18_3, iOS 26.5.1, en-US
- **Submitter:** anonymous
- **Status:** pending

> 1. I would assume a user shouldn’t be able to switch between generations once they entered a chat
>
> 2. When I click viewer for eternatus it shows tornadus

**Assets:** [screenshot-1.jpg](assets/AK4PB-sn075S8yTdP3wFe4Q/screenshot-1.jpg), [screenshot-2.jpg](assets/AK4PB-sn075S8yTdP3wFe4Q/screenshot-2.jpg)

### ANnTYLcBOjHkEVtPxerjbKo

- **Date:** 2026-07-06T08:10:38.787Z
- **Type:** screenshot
- **Build:** unknown (not available from the feedback API — attribute manually)
- **Device/OS:** iPhone18_3, iOS 26.5.1, en-US
- **Submitter:** anonymous
- **Status:** pending

> This AI button doesn’t work 

**Assets:** [screenshot-1.jpg](assets/ANnTYLcBOjHkEVtPxerjbKo/screenshot-1.jpg)

### AAxEvdfHT8i1tuF6bqoce1U

- **Date:** 2026-07-06T08:07:50.832Z
- **Type:** screenshot
- **Build:** unknown (not available from the feedback API — attribute manually)
- **Device/OS:** iPhone18_3, iOS 26.5.1, en-US
- **Submitter:** anonymous
- **Status:** pending

> What about including additional things for team builder. Like defensive coverage, offensive coverage, team stats, other type of information you can figure out

**Assets:** [screenshot-1.jpg](assets/AAxEvdfHT8i1tuF6bqoce1U/screenshot-1.jpg), [screenshot-2.jpg](assets/AAxEvdfHT8i1tuF6bqoce1U/screenshot-2.jpg)

### ADfdcLoy-7UkU1taVj_Uhes

- **Date:** 2026-07-06T08:05:50.578Z
- **Type:** screenshot
- **Build:** unknown (not available from the feedback API — attribute manually)
- **Device/OS:** iPhone18_3, iOS 26.5.1, en-US
- **Submitter:** anonymous
- **Status:** pending

> If user gave you the format generation of the team, the items shown should be for that generation too. Currently its showing Absolite Z and Adamant Orb which are not available in Gen 3

**Assets:** [screenshot-1.jpg](assets/ADfdcLoy-7UkU1taVj_Uhes/screenshot-1.jpg), [screenshot-2.jpg](assets/ADfdcLoy-7UkU1taVj_Uhes/screenshot-2.jpg)

### ACxOs06jUZqbsWhQSYt-cW8

- **Date:** 2026-07-06T08:02:08.766Z
- **Type:** screenshot
- **Build:** unknown (not available from the feedback API — attribute manually)
- **Device/OS:** iPhone18_3, iOS 26.5.1, en-US
- **Submitter:** anonymous
- **Status:** fixed (095b543 — prompt-level; unqualified aggregations now default to the active scope)

> It doesn’t seem to filter based on generation selected

**Assets:** [screenshot-1.jpg](assets/ACxOs06jUZqbsWhQSYt-cW8/screenshot-1.jpg)

### AG4sZ6EYJACjKYOtUfWdbGc

- **Date:** 2026-07-06T08:01:08.405Z
- **Type:** screenshot
- **Build:** unknown (not available from the feedback API — attribute manually)
- **Device/OS:** iPhone18_3, iOS 26.5.1, en-US
- **Submitter:** anonymous
- **Status:** pending

> When you start chatting, include an easy way to start a new chat. Currently I have to go to chat history to start a new chat

**Assets:** 

### ANFj2FDaVI14LmcQWMRpGA4

- **Date:** 2026-07-06T06:35:08.981Z
- **Type:** screenshot
- **Build:** unknown (not available from the feedback API — attribute manually)
- **Device/OS:** iPhone17_1, iOS 26.5, en-US
- **Submitter:** gowtam04@gmail.com
- **Status:** pending

> Instead of showing moves as a list, show them as chips in a grid like in the web

**Assets:** [screenshot-1.jpg](assets/ANFj2FDaVI14LmcQWMRpGA4/screenshot-1.jpg)

### ACGQITvfo_6iG2ZBf33kBh8

- **Date:** 2026-07-06T05:19:04.303Z
- **Type:** screenshot
- **Build:** unknown (not available from the feedback API — attribute manually; predates build 19)
- **Device/OS:** iPhone18_3, iOS 26.5.1, en-US
- **Submitter:** anonymous
- **Status:** fixed (2e0eb8e, build 19 — Format widened to all 11 scopes; gens 1–4 selectable in the scope picker on web/iOS/Android as of build 19)

> Can’t select for generations below gen 5 but search says data is available

**Assets:** [screenshot-1.jpg](assets/ACGQITvfo_6iG2ZBf33kBh8/screenshot-1.jpg)
