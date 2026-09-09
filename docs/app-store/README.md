# Oak — App Store listing materials

Covers **iOS**. Android lives in `android/` but **Play Store listing is deferred**, so there is no `google-play.md`.

**Store name:** `Oak – Champions Coach` · **Subtitle:** `Team Builder & Calculator`. The bare name "Oak" was taken in the App Store, so a descriptor was appended — this changes only the App Store *display name*, not the bundle id (`ai.gowtam.oak`), the `oak.gowtam.ai` domain, or the in-app "Oak" assistant persona. Home screen stays `Oak`. Live 1.0.2 still shows `Oak – AI Battle Coach` until 1.2 is approved.

Champions-first (CF-INT-BR-10, CF-AS-6): listing copy describes Oak as a **Pokémon Champions coach**. No National Dex default, no Smogon OU, no generation toggle.

- [`ios.md`](./ios.md) — App Store Connect fields (Name, Subtitle, Promotional Text, Description, Keywords, What's New) with character counts.
- [`aso-keywords.md`](./aso-keywords.md) — keyword research: Tier 1/2/3 terms, the literal iOS Keywords string, and competitor analysis.
- [`screenshots.md`](./screenshots.md) — 6-frame screenshot production guide (Enamel & Paper, Champions-first).

## Trademark policy applied throughout

- **App Name, Subtitle, Keywords:** never "Pokémon" / "Pokédex". App Name uses `Champions` without the mark (`Oak – Champions Coach`).
- **Description:** names Pokémon Champions as the game Oak coaches (required by CF-INT-BR-10), plus one unofficial-fan-app disclaimer that names Nintendo, Game Freak, Creatures Inc., and The Pokémon Company.
- Subtitle stays `Team Builder & Calculator` rather than saying Pokémon Champions (CF-UI-BR-1 vs this policy — the App Name now carries Champions; policy still wins on "Pokémon").

## Blockers before App Store Connect submission

These are already live; re-confirm if a URL moves:

- **Privacy Policy URL** — `https://oak.gowtam.ai/privacy` (Account screen + listing).
- **Support URL** — `https://www.gowtam.ai/#contact`.
- **App Icon** — daylight `O.` lockup in `ios/OakApp/Resources/Assets.xcassets/AppIcon.appiconset` (same mark as `web/public/oak-app-icon.svg`).

## What to sanity-check first

- The `ios.md` Description's disclaimer paragraph — read it once against your actual legal comfort level. It's a plain non-affiliation/unofficial disclaimer (matching Apple's own third-party-trademark guidance) and **deliberately omits any "fair use" claim**. Naming "Pokémon Champions" to describe compatibility is nominative; it is established by conduct, not by a self-applied label.
- Oak **does display copyrighted images at runtime**: official artwork + sprites hot-linked from the PokeAPI/Showdown CDNs (`web/src/lib/sprites.ts`, iOS `SpriteImage`), not bundled in the binary. That image use, not the listing wording, is the real IP exposure; it's accepted as a tolerated risk in the iPhone-app `decisions.md` (ADR-11).
- The Keywords string in `ios.md`/`aso-keywords.md` must match (`ai` moved in from the old name; `reasoning` dropped; `champions`/`coach` omitted because they are in the App Name).
