/**
 * (reference) route-group layout — the shared chrome for every programmatic
 * reference page (/pokedex, /moves, /abilities, /items, /usage; /meta redirects). Imports the
 * group's four stylesheets once (chrome/scaffolding + explorer + detail + meta)
 * and wraps each page in the paper header + fan-project footer. Server
 * component (no hooks). It sets NO metadata: the route group
 * inherits the root layout's defaults, and each page overrides `canonical`
 * itself (the root `canonical: "/"` must never leak onto a reference URL).
 */

import type { ReactNode } from "react";

import ReferenceHeader from "@/components/reference/ReferenceHeader";
import ReferenceFooter from "@/components/reference/ReferenceFooter";
import "@/components/reference/reference.css";
import "@/components/reference/reference-explorer.css";
import "@/components/reference/reference-detail.css";
import "@/components/reference/reference-meta.css";

export default function ReferenceLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ReferenceHeader />
      {children}
      <ReferenceFooter />
    </>
  );
}
