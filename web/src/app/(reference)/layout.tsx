/**
 * (reference) route-group layout — the shared chrome for every programmatic
 * reference page (/pokedex, /moves, /abilities, /items). Imports the group's
 * stylesheet once and wraps each page in the red header band + fan-project
 * footer. Server component (no hooks). It sets NO metadata: the route group
 * inherits the root layout's defaults, and each page overrides `canonical`
 * itself (the root `canonical: "/"` must never leak onto a reference URL).
 */

import type { ReactNode } from "react";

import ReferenceHeader from "@/components/reference/ReferenceHeader";
import ReferenceFooter from "@/components/reference/ReferenceFooter";
import "@/components/reference/reference.css";

export default function ReferenceLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ReferenceHeader />
      {children}
      <ReferenceFooter />
    </>
  );
}
