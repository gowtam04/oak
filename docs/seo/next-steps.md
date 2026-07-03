# SEO — Next Steps

The full SEO build shipped 2026-07-03 (merge `3c371ef`, deployed to Fly the same day). Canonical host: **https://oak.gowtam.ai** (the internal `oak-gowtam.fly.dev` now 301s to it, `/api/*` exempt). This doc is the checklist of what remains — manual one-time setup, things to keep an eye on, and accepted follow-ups.

## 1. One-time manual setup (do these first)

- [ ] **Google Search Console** — the single highest-impact remaining step; nothing gets crawled at scale until this is done.
  1. https://search.google.com/search-console → Add property → Domain (`oak.gowtam.ai`) or URL-prefix (`https://oak.gowtam.ai/`). Domain property needs a DNS TXT record; URL-prefix can verify via the existing HTML/meta methods.
  2. Sitemaps → submit all five (Next's `generateSitemaps` emits no index file, so each shard is submitted individually — they're also all listed in robots.txt):
     - `https://oak.gowtam.ai/sitemap/0.xml` (static pages)
     - `https://oak.gowtam.ai/sitemap/1.xml` (1,308 Pokémon)
     - `https://oak.gowtam.ai/sitemap/2.xml` (951 moves)
     - `https://oak.gowtam.ai/sitemap/3.xml` (316 abilities)
     - `https://oak.gowtam.ai/sitemap/4.xml` (581 items)
  3. URL Inspection → inspect `https://oak.gowtam.ai/` → Request indexing. Optionally also a couple of flagship pages (`/pokedex`, `/pokedex/garchomp`).
- [ ] **Bing Webmaster Tools** (optional, ~5 min) — https://www.bing.com/webmasters can import the verified GSC property directly; submit the same five sitemaps.
- [ ] **Visual pass on a real phone** — scroll below the hero on `/` (landing section: features, FAQ `<details>`, footer with the non-affiliation disclaimer and Privacy link), and flip **dark mode** via the in-app toggle. Headless screenshot capture couldn't exercise either. Things to eyeball: hero still owns the first viewport, landing spacing at 390px, footer clearance above the docked composer.
- [ ] **Social card check** — paste `https://oak.gowtam.ai` into Slack/Discord/X or https://www.opengraph.xyz and confirm the OG image (cream card, red band, Oak wordmark) renders.
- [ ] **Rich results test** — https://search.google.com/test/rich-results on `/` should detect the WebApplication and FAQPage structured data. (Note: since 2023 Google mostly restricts FAQ *rich snippets* to authoritative sites — the markup is still correct and future-proof; don't expect snippets immediately.)

## 2. Ship-when-ready

- [ ] **Push `develop` to origin** — the SEO work (and a large backlog of prior commits) is local-only. `git push` when ready.
- [ ] **Next TestFlight build** picks up the iOS repoint (`BaseURL` → `oak.gowtam.ai`, commit in the SEO merge). No urgency: middleware exempts `/api/*`, so shipped builds on the fly.dev host keep working indefinitely. Standard release steps in `CLAUDE.md` § iOS app.

## 3. Monitoring (first few weeks)

- GSC → **Coverage/Pages**: watch the ~3,200 submitted URLs move from Discovered → Crawled → Indexed. Expect this to take weeks, not days, for a new property.
- GSC → **Performance**: first target queries to watch — branded (`oak pokemon ai`), head terms (`pokemon ai assistant`, `pokemon champions team builder`, `pokemon champions usage stats`), and long-tail entity queries (`<pokemon> champions moveset` etc. — these arrive first via the reference pages).
- Fly logs / machine load during Googlebot's first full crawl: detail pages render per-request (see § 4), each is a handful of indexed Postgres queries on the single shared-cpu-1x machine. If crawl bursts cause pressure, GSC lets you reduce crawl rate — or fix the ISR follow-up below.
- After any **re-ingest**: sitemap `lastModified` updates automatically from `ingest_meta`; no manual action.

## 4. Accepted follow-ups (known, deliberate — revisit when they matter)

1. **Detail pages are fully dynamic, not ISR-cached.** They export `revalidate = 86400` but render per-request in practice (verified live: no `x-nextjs-cache` header). Correct output, always-fresh Champions usage, cheap queries — acceptable at current traffic. Revisit if crawl load or TTFB matters; the fix is investigating what opts the route into dynamic rendering (likely the usage client's `fetch`) and/or fronting with `unstable_cache`.
2. **`/pokedex` index HTML is ~1.5 MB** (RSC flight payload duplicates the 1,308-row dataset). Fine for crawlers; heavy for slow connections. Options: split the index into per-generation pages (also adds crawlable URLs), or slim per-entry data.
3. **`/moves` index has no accuracy column** — the batched `MoveSummary` source lacks the field. Detail pages show accuracy. Add it to the summary payload at next ingest-schema touch if wanted.
4. **A chip-pick with no follow-up message isn't persisted** (pre-existing accepted gap, unrelated to SEO — listed here only because scope affects which format reference CTAs open chat in).

## 5. Longer-term SEO roadmap (from the 2026-07-03 audit, not yet started)

- **Internal linking from answers**: when Oak's chat answer cites an entity, link it to its reference page (`/pokedex/[slug]` etc.) — turns every conversation into crawl equity and gives users a browsable surface.
- **Content depth on high-value pages**: hand-written intros for the top ~50 competitive Pokémon (Champions staples) to differentiate from the deterministic generated prose.
- **About page** — operator identity/E-E-A-T beyond the privacy policy.
- **Backlinks**: the realistic first links are Pokémon community shares (Reddit r/VGC, Discord servers, Smogon forums). The reference pages + OG cards are built to be shareable; one good "I built this" post is the cold-start.
- **Track keyword ceiling honestly**: Serebii/Bulbapedia/Pikalytics own the head terms; the winnable surface is Champions-specific queries (fresh format, thinner competition) and AI-assistant queries. Double down where GSC shows traction.

## 6. Sitemap gotcha (for future editors)

Next.js passes the `generateSitemaps()` id to `sitemap({ id })` **as a string** at the route layer. `web/src/app/sitemap.ts` coerces with `Number(id)` and throws on unknown ids; its test calls the export with string ids to pin this. Don't "simplify" the coercion away — the original strict `id === n` version served the items shard for every URL and unit tests with numeric ids couldn't catch it.
