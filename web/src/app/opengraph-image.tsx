/* eslint-disable react/forbid-dom-props -- next/og's Satori renderer supports
   only inline styles (no CSS classes, no globals.css access), so the
   token-based-class rule can't apply to this file. */
import { ImageResponse } from "next/og";

import { SITE_DESCRIPTION } from "@/lib/site";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Oak — AI Pokémon assistant";

// Hex values mirror globals.css :root tokens (--poke-red, --bg, --text-strong)
// — satori cannot read CSS vars, so these are hand-copied; keep in sync
// manually if the palette changes.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          padding: 80,
          background: "#fbf7f4",
          borderBottom: "16px solid #ee5a5a",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div
            style={{
              display: "flex",
              width: 72,
              height: 72,
              borderRadius: 18,
              background: "#ee5a5a",
            }}
          />
          <div style={{ display: "flex", fontSize: 96, fontWeight: 700, color: "#2a2521" }}>
            Oak
          </div>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 32,
            maxWidth: 900,
            fontSize: 40,
            lineHeight: 1.35,
            color: "#3d362f",
          }}
        >
          {SITE_DESCRIPTION}
        </div>
      </div>
    ),
    { ...size }
  );
}
