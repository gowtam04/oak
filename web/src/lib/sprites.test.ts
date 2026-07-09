import { describe, expect, it } from "vitest";

import { SITE_ORIGIN } from "@/lib/site";

import {
  guessOakMediaSpriteUrl,
  guessShowdownAniSpriteUrl,
  oakMediaArtworkUrl,
  oakMediaDexSpriteUrl,
  oakMediaSpriteUrl,
  pokeApiArtwork,
  pokeApiSprite,
  rewriteLegacyMediaUrl,
  showdownAniSprite,
  showdownSpriteId,
  toID,
} from "./sprites";

describe("sprites — PokeAPI base URLs (national dex number)", () => {
  it("builds the front-sprite + official-artwork URLs", () => {
    expect(pokeApiSprite(445)).toBe(
      "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/445.png",
    );
    expect(pokeApiArtwork(445)).toBe(
      "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/445.png",
    );
  });
});

describe("sprites — toID (Showdown's strip-everything id)", () => {
  it("strips internal hyphens and punctuation", () => {
    expect(toID("Mega-X")).toBe("megax");
    expect(toID("Rapid-Strike")).toBe("rapidstrike");
    expect(toID("Farfetch'd")).toBe("farfetchd");
  });

  it("folds diacritics to the ASCII id the CDN uses", () => {
    expect(toID("Flabébé")).toBe("flabebe");
  });
});

describe("sprites — showdownSpriteId", () => {
  it("single-token formes keep exactly one hyphen", () => {
    expect(showdownSpriteId("Venusaur", "Mega")).toBe("venusaur-mega");
    expect(showdownSpriteId("Dragonite", "Mega")).toBe("dragonite-mega");
    expect(showdownSpriteId("Rotom", "Wash")).toBe("rotom-wash");
    expect(showdownSpriteId("Ninetales", "Alola")).toBe("ninetales-alola");
  });

  it("multi-token formes collapse internal hyphens (the slugify divergence)", () => {
    expect(showdownSpriteId("Charizard", "Mega-X")).toBe("charizard-megax");
    expect(showdownSpriteId("Charizard", "Mega-Y")).toBe("charizard-megay");
    expect(showdownSpriteId("Tauros", "Paldea-Aqua")).toBe("tauros-paldeaaqua");
    expect(showdownSpriteId("Urshifu", "Rapid-Strike")).toBe(
      "urshifu-rapidstrike",
    );
    expect(showdownSpriteId("Ogerpon", "Wellspring-Tera")).toBe(
      "ogerpon-wellspringtera",
    );
  });

  it("base form (no forme) has no trailing hyphen", () => {
    expect(showdownSpriteId("Dragonite", null)).toBe("dragonite");
  });
});

describe("sprites — showdownAniSprite", () => {
  it("builds the animated Showdown URL", () => {
    expect(showdownAniSprite("dragonite-mega")).toBe(
      "https://play.pokemonshowdown.com/sprites/ani/dragonite-mega.gif",
    );
  });
});

describe("sprites — Oak first-party media URLs", () => {
  it("builds absolute Oak media paths under SITE_ORIGIN by default", () => {
    expect(oakMediaSpriteUrl("garchomp")).toBe(
      `${SITE_ORIGIN}/api/media/sprite/garchomp`,
    );
    expect(oakMediaArtworkUrl(445)).toBe(
      `${SITE_ORIGIN}/api/media/artwork/445`,
    );
    expect(oakMediaDexSpriteUrl(445)).toBe(
      `${SITE_ORIGIN}/api/media/dex-sprite/445`,
    );
  });

  it("honors an explicit origin override (trailing slash stripped)", () => {
    expect(oakMediaSpriteUrl("charizard-megax", "http://localhost:3000/")).toBe(
      "http://localhost:3000/api/media/sprite/charizard-megax",
    );
  });
});

describe("sprites — rewriteLegacyMediaUrl", () => {
  it("rewrites Showdown ani GIFs onto the Oak sprite proxy", () => {
    expect(
      rewriteLegacyMediaUrl(
        "https://play.pokemonshowdown.com/sprites/ani/gyarados.gif",
      ),
    ).toBe(`${SITE_ORIGIN}/api/media/sprite/gyarados`);
    expect(
      rewriteLegacyMediaUrl(
        "https://play.pokemonshowdown.com/sprites/ani/charizard-megax.gif",
      ),
    ).toBe(`${SITE_ORIGIN}/api/media/sprite/charizard-megax`);
  });

  it("rewrites PokeAPI GitHub front sprites and official artwork", () => {
    expect(
      rewriteLegacyMediaUrl(
        "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/229.png",
      ),
    ).toBe(`${SITE_ORIGIN}/api/media/dex-sprite/229`);
    expect(
      rewriteLegacyMediaUrl(
        "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/130.png",
      ),
    ).toBe(`${SITE_ORIGIN}/api/media/artwork/130`);
  });

  it("leaves already-Oak and unknown URLs unchanged", () => {
    const oak = `${SITE_ORIGIN}/api/media/sprite/houndoom`;
    expect(rewriteLegacyMediaUrl(oak)).toBe(oak);
    expect(rewriteLegacyMediaUrl("https://img.example/sprite.png")).toBe(
      "https://img.example/sprite.png",
    );
    expect(rewriteLegacyMediaUrl("not-a-url")).toBe("not-a-url");
  });
});

describe("sprites — guessOakMediaSpriteUrl", () => {
  it("maps a species slug to the Oak media sprite path (not the raw Showdown CDN)", () => {
    expect(guessOakMediaSpriteUrl("garchomp")).toBe(
      `${SITE_ORIGIN}/api/media/sprite/garchomp`,
    );
    expect(guessOakMediaSpriteUrl("charizard-mega-x")).toBe(
      `${SITE_ORIGIN}/api/media/sprite/charizard-megax`,
    );
    expect(guessOakMediaSpriteUrl("tapu-koko")).toBe(
      `${SITE_ORIGIN}/api/media/sprite/tapukoko`,
    );
  });
});

// ---------------------------------------------------------------------------
// guessShowdownAniSpriteUrl (F2) — client-side species-slug → animated URL
// ---------------------------------------------------------------------------
//
// The FORME_SUFFIXES table this function matches against was generated by
// enumerating every real (non-CAP) species' `s.forme` across @pkmn's Gen 5–9
// dexes plus the Champions mod, then slugifying each raw forme string (the
// same transform ingest applies). Re-run this to refresh the list if a future
// @pkmn/ingest bump adds a species with an uncovered forme:
//
//   node -e "
//   (async () => {
//     const { Dex } = require('@pkmn/dex');
//     const champData = await import('@pkmn/mods/champions');
//     const dexes = [5,6,7,8,9].map((g) => Dex.forGen(g))
//       .concat([Dex.mod('champions', champData)]);
//     const formes = new Set();
//     for (const dex of dexes) {
//       for (const s of dex.species.all()) {
//         if (s.forme && s.num > 0) formes.add(s.forme);
//       }
//     }
//     function slugify(name) {
//       return name.normalize('NFD').replace(/[̀-ͯ]/g, '')
//         .toLowerCase().replace(/['.]/g, '').replace(/[^a-z0-9]+/g, '-')
//         .replace(/^-+|-+$/g, '');
//     }
//     console.log([...new Set([...formes].map(slugify))].sort().join(', '));
//   })();
//   "
describe("sprites — guessShowdownAniSpriteUrl", () => {
  it("splits a single-token forme slug via the longest-match suffix table", () => {
    expect(guessShowdownAniSpriteUrl("absol-mega")).toBe(
      "https://play.pokemonshowdown.com/sprites/ani/absol-mega.gif",
    );
    expect(guessShowdownAniSpriteUrl("rotom-wash")).toBe(
      "https://play.pokemonshowdown.com/sprites/ani/rotom-wash.gif",
    );
  });

  it("collapses a multi-token forme suffix into Showdown's spriteid (not slugify's)", () => {
    expect(guessShowdownAniSpriteUrl("charizard-mega-x")).toBe(
      "https://play.pokemonshowdown.com/sprites/ani/charizard-megax.gif",
    );
    expect(guessShowdownAniSpriteUrl("charizard-mega-y")).toBe(
      "https://play.pokemonshowdown.com/sprites/ani/charizard-megay.gif",
    );
    expect(guessShowdownAniSpriteUrl("tauros-paldea-combat")).toBe(
      "https://play.pokemonshowdown.com/sprites/ani/tauros-paldeacombat.gif",
    );
    expect(guessShowdownAniSpriteUrl("ogerpon-wellspring-tera")).toBe(
      "https://play.pokemonshowdown.com/sprites/ani/ogerpon-wellspringtera.gif",
    );
  });

  it("a base species slug with an internal hyphen and no known forme suffix passes through as one token (toID strips it)", () => {
    expect(guessShowdownAniSpriteUrl("tapu-koko")).toBe(
      "https://play.pokemonshowdown.com/sprites/ani/tapukoko.gif",
    );
  });

  it("a plain base species slug is untouched", () => {
    expect(guessShowdownAniSpriteUrl("garchomp")).toBe(
      "https://play.pokemonshowdown.com/sprites/ani/garchomp.gif",
    );
  });

  it("prefers the longer suffix when a shorter one is also a match ('galar-zen' over 'zen')", () => {
    expect(guessShowdownAniSpriteUrl("darmanitan-galar-zen")).toBe(
      "https://play.pokemonshowdown.com/sprites/ani/darmanitan-galarzen.gif",
    );
  });

  it("Zygarde's percent-sign forme slugifies to a bare '10' suffix", () => {
    expect(guessShowdownAniSpriteUrl("zygarde-10")).toBe(
      "https://play.pokemonshowdown.com/sprites/ani/zygarde-10.gif",
    );
  });
});
