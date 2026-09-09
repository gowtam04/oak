/* eslint-disable react/forbid-dom-props -- next/og's Satori renderer supports
   only inline styles (no CSS classes, no globals.css access), so the
   token-based-class rule can't apply to this file. */
import { ImageResponse } from "next/og";

import { SITE_DESCRIPTION } from "@/lib/site";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Oak — AI Pokémon assistant";

// Hex values mirror enamel-paper tokens (--bg cream, --poke-red coral,
// --text-strong). Satori cannot read CSS vars, so these are hand-copied.
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
          background: "#FBF7F4",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 96,
              height: 96,
              borderRadius: 24,
              background: "#EE5A5A",
            }}
          >
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: 999,
                border: "14px solid #ffffff",
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 96,
              fontWeight: 600,
              fontFamily: "Fredoka, sans-serif",
              color: "#2A2521",
              letterSpacing: "0.01em",
            }}
          >
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
            color: "#3D362F",
          }}
        >
          {SITE_DESCRIPTION}
        </div>
      </div>
    ),
    { ...size }
  );
}
