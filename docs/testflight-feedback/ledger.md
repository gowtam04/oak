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
