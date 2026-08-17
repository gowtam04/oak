/* eslint-disable react/forbid-dom-props -- next/og's Satori renderer supports
   only inline styles (no CSS classes, no globals.css access), so the
   token-based-class rule can't apply to this file. */
import { ImageResponse } from "next/og";

import { SITE_DESCRIPTION } from "@/lib/site";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Oak — AI Pokémon assistant";

// Hex values mirror Signal tokens (--bg, --ink, --red) — satori cannot read
// CSS vars, so these are hand-copied; keep in sync if the palette changes.
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
          background: "#F6F7F9",
        }}
      >
        <div style={{ display: "flex", fontSize: 96, fontWeight: 600, color: "#1B2430" }}>
          Oak
          <span style={{ color: "#E3350D" }}>.</span>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 32,
            maxWidth: 900,
            fontSize: 40,
            lineHeight: 1.35,
            color: "#2A3340",
          }}
        >
          {SITE_DESCRIPTION}
        </div>
      </div>
    ),
    { ...size }
  );
}
